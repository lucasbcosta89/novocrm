import "server-only";
import { formatarMoeda } from "@/lib/formato";
import { hmacSha256Hex, iguais } from "@/lib/hmac";
import { mesAtual } from "@/lib/planos";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dentroDaJanela, JANELA_MS, linkWhatsApp, normalizarTelefone } from "@/lib/whatsapp";
import type { Contexto } from "./contexto";
import { pdfDoPedido } from "./documentos";
import { AppError, erroBanco } from "./erros";
import { dadosPedidoPdf } from "./pdf-pedido";
import { verificarLimite } from "./quota";
import { whatsappConfigurado } from "./whatsapp";

/** Envio do pedido em PDF pelo WhatsApp (Fase 12). */

export type EnvioPedido = { modo: "api"; mensagemId: string; cache: boolean; viaTemplate: boolean } | { modo: "link"; url: string; cache: boolean };

/** Template aprovado na Meta com cabeçalho de DOCUMENTO e corpo {{1}} = primeiro nome, {{2}} = nº do pedido. */
export const CODIGO_TEMPLATE_PDF = "pedido_pdf";
const VALIDADE_LINK_MS = 7 * 24 * 60 * 60 * 1000;

function cloud() {
  return { token: process.env.WHATSAPP_TOKEN!, phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID!, versao: process.env.WHATSAPP_API_VERSION || "v23.0" };
}

/** Erros comuns da Cloud API em mensagens claras. */
export function mensagemErroMeta(codigo: number | undefined, padrao: string): string {
  switch (codigo) {
    case 131026: return "Número sem WhatsApp ou inválido — confira o telefone do cliente";
    case 131047: return "Fora da janela de 24h — é necessário um template aprovado com documento";
    case 131051: case 131052: case 131053: return "O WhatsApp rejeitou o PDF (mídia inválida ou grande demais)";
    case 132000: case 132001: return "Template inexistente ou não aprovado na Meta";
    case 132012: return "Parâmetros do template não conferem com o aprovado na Meta";
    case 100: return `Parâmetro inválido no envio: ${padrao}`;
    default: return `WhatsApp recusou o envio: ${padrao}`;
  }
}

async function chamarMeta(caminho: string, init: RequestInit): Promise<Record<string, unknown>> {
  const c = cloud();
  const res = await fetch(`https://graph.facebook.com/${c.versao}/${c.phoneId}/${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.token}`, ...(init.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: number; message?: string } };
  if (!res.ok || json.error) {
    console.error("WhatsApp API", caminho, res.status, JSON.stringify(json).slice(0, 500));
    throw new AppError(502, mensagemErroMeta(json.error?.code, json.error?.message ?? String(res.status)), "whatsapp");
  }
  return json;
}

/** Upload do PDF para a Cloud API → media_id. */
async function subirMidia(bytes: Uint8Array, nome: string): Promise<string> {
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", "application/pdf");
  fd.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), nome);
  const json = await chamarMeta("media", { method: "POST", body: fd });
  if (typeof json.id !== "string") throw new AppError(502, "O WhatsApp rejeitou o PDF (upload sem id)", "whatsapp");
  return json.id;
}

async function enviarMensagem(corpo: Record<string, unknown>): Promise<string> {
  const json = (await chamarMeta("messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
  })) as { messages?: { id: string }[] };
  const id = json.messages?.[0]?.id;
  if (!id) throw new AppError(502, "WhatsApp não confirmou o envio", "whatsapp");
  return id;
}

/* ---------- Link assinado (sem Cloud API: o cliente baixa o PDF pelo link no wa.me) ---------- */

const segredoLink = () => {
  const base = process.env.DADOS_PESSOAIS_CHAVE;
  if (!base) throw new AppError(503, "Chave de assinatura não configurada", "config");
  return `link-documento:${base}`;
};

export async function linkPublicoDocumento(origem: string, documentoId: string, agora = Date.now()): Promise<string> {
  const exp = agora + VALIDADE_LINK_MS;
  const sig = await hmacSha256Hex(segredoLink(), `${documentoId}.${exp}`);
  return `${origem}/api/documentos/publico/${documentoId}?exp=${exp}&sig=${sig}`;
}

export async function linkPublicoValido(documentoId: string, exp: string | null, sig: string | null, agora = Date.now()): Promise<boolean> {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < agora) return false;
  return iguais(await hmacSha256Hex(segredoLink(), `${documentoId}.${exp}`), sig.toLowerCase());
}

/* ---------- Envio ---------- */

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/**
 * Gera (ou reusa do cache) o PDF do pedido e envia como DOCUMENTO ao cliente:
 * - Cloud API, janela de 24h aberta → documento livre (media_id);
 * - Cloud API, fora da janela → template aprovado "pedido_pdf" com cabeçalho de documento;
 * - sem Cloud API → link wa.me com o texto e um link assinado (7 dias) para baixar o PDF.
 * Todo envio fica registrado em mensagens_whatsapp.
 */
export async function enviarPedidoPdf(ctx: Contexto, pedidoId: string, origem: string): Promise<EnvioPedido> {
  const pedido = await dadosPedidoPdf(ctx, pedidoId);
  if (!pedido.cliente) throw new AppError(400, "Pedido sem cliente", "validacao");
  const contato = normalizarTelefone(pedido.cliente.whatsapp ?? pedido.cliente.celular);
  if (!contato) throw new AppError(400, "Cliente sem telefone cadastrado (WhatsApp ou celular com DDD)", "validacao");

  const pdf = await pdfDoPedido(ctx, pedido.id);
  const admin = supabaseAdmin();
  const registro = (extra: Record<string, unknown>) => ({
    user_id: ctx.userId, cliente_id: pedido.cliente!.id, direcao: "saida", contato,
    conteudo: { tipo: "documento", pedido_id: pedido.id, numero: pedido.numero, documento_id: pdf.documentoId, arquivo: pdf.nome, cache: pdf.cache },
    ...extra,
  });

  if (!whatsappConfigurado()) {
    const link = await linkPublicoDocumento(origem, pdf.documentoId);
    const texto = `Olá, ${primeiroNome(pedido.cliente.nome)}! Segue o pedido nº ${pedido.numero} (${formatarMoeda(Number(pedido.valor_total))}) em PDF: ${link}`;
    const { error } = await admin.from("mensagens_whatsapp").insert(registro({ status: "link", template: null }));
    if (error) console.error("Registro de envio do pedido", error.message);
    return { modo: "link", url: linkWhatsApp(contato, texto), cache: pdf.cache };
  }

  await verificarLimite(ctx, "conversas_mes");
  const { data: ultima } = await ctx.supabase
    .from("mensagens_whatsapp")
    .select("criado_em")
    .eq("contato", contato)
    .eq("direcao", "entrada")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle<{ criado_em: string }>();
  const naJanela = dentroDaJanela(ultima?.criado_em ?? null);

  let template: { meta_nome: string; idioma: string } | null = null;
  if (!naJanela) {
    const { data } = await admin
      .from("templates_whatsapp")
      .select("meta_nome, idioma")
      .eq("codigo", CODIGO_TEMPLATE_PDF)
      .is("user_id", null)
      .maybeSingle<{ meta_nome: string | null; idioma: string }>();
    if (!data?.meta_nome) throw new AppError(409, "Fora da janela de 24h — é necessário um template aprovado com documento", "fora_janela");
    template = { meta_nome: data.meta_nome, idioma: data.idioma };
  }

  const mediaId = await subirMidia(pdf.bytes, pdf.nome);
  const documento = { id: mediaId, filename: pdf.nome };
  const mensagemId = template
    ? await enviarMensagem({
        to: contato,
        type: "template",
        template: {
          name: template.meta_nome,
          language: { code: template.idioma },
          components: [
            { type: "header", parameters: [{ type: "document", document: documento }] },
            { type: "body", parameters: [{ type: "text", text: primeiroNome(pedido.cliente.nome) }, { type: "text", text: pedido.numero }] },
          ],
        },
      })
    : await enviarMensagem({ to: contato, type: "document", document: { ...documento, caption: `Pedido nº ${pedido.numero}` } });

  // conversa da janela (mesma regra do restante do WhatsApp: abrir conversa consome conversas_mes)
  const { data: aberta } = await admin
    .from("conversas_whatsapp")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("contato", contato)
    .gt("janela_expira_em", new Date().toISOString())
    .limit(1)
    .maybeSingle<{ id: string }>();
  let conversaId = aberta?.id ?? null;
  if (!conversaId) {
    const { data, error } = await admin
      .from("conversas_whatsapp")
      .insert({
        user_id: ctx.userId, contato, cliente_id: pedido.cliente.id, categoria: template ? "utility" : "service", status: "open",
        custo: 0, mes: mesAtual(), iniciada_por: "empresa", janela_expira_em: new Date(Date.now() + JANELA_MS).toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    if (error) throw erroBanco(error);
    conversaId = data.id;
  }
  const { error } = await admin.from("mensagens_whatsapp").insert(registro({ conversa_id: conversaId, meta_message_id: mensagemId, template: template ? CODIGO_TEMPLATE_PDF : null }));
  if (error) console.error("Registro de envio do pedido", error.message);
  return { modo: "api", mensagemId, cache: pdf.cache, viaTemplate: !!template };
}
