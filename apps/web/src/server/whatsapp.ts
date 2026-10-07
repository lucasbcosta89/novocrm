import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarMoeda } from "@/lib/formato";
import { hmacSha256Hex, iguais } from "@/lib/hmac";
import { idSchema } from "@/lib/validacao";
import { CUSTO_CONVERSA, dentroDaJanela, JANELA_MS, linkWhatsApp, normalizarTelefone, renderizarTemplate } from "@/lib/whatsapp";
import { mesAtual } from "@/lib/planos";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { verificarLimite } from "./quota";

/* ---------- Meta Cloud API ---------- */

function config() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return token && phoneId ? { token, phoneId, versao: process.env.WHATSAPP_API_VERSION || "v23.0" } : null;
}

/** Sem credenciais da Meta, os envios viram link wa.me (o representante envia pelo próprio WhatsApp). */
export const whatsappConfigurado = () => config() != null;

async function graph(corpo: Record<string, unknown>): Promise<string> {
  const c = config();
  if (!c) throw new AppError(503, "WhatsApp Cloud API não configurada", "whatsapp");
  const res = await fetch(`https://graph.facebook.com/${c.versao}/${c.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok || !json.messages?.[0]?.id) {
    console.error("WhatsApp API", res.status, JSON.stringify(json).slice(0, 500));
    throw new AppError(502, `WhatsApp recusou o envio: ${json.error?.message ?? res.status}`, "whatsapp");
  }
  return json.messages[0].id;
}

/** Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret). */
export async function assinaturaMetaValida(corpoBruto: string, cabecalho: string | null): Promise<boolean> {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  return iguais(await hmacSha256Hex(segredo, corpoBruto), cabecalho.slice(7).toLowerCase());
}

/* ---------- Envio ---------- */

export type Envio = { modo: "api"; mensagemId: string } | { modo: "link"; url: string };
type Template = { codigo: string; meta_nome: string; idioma: string; categoria: string; corpo: string };

async function template(db: SupabaseClient, codigo: string): Promise<Template> {
  const { data, error } = await db
    .from("templates_whatsapp")
    .select("codigo, meta_nome, idioma, categoria, corpo")
    .eq("codigo", codigo)
    .is("user_id", null)
    .single<Template>();
  if (error) throw erroBanco(error);
  return data;
}

/**
 * Conversa aberta (janela de 24h da Meta) com o contato; se não houver, abre uma nova
 * — o INSERT consome a quota conversas_mes (trigger no banco).
 */
async function conversaAberta(userId: string, contato: string, clienteId: string | null, categoria: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data: aberta } = await admin
    .from("conversas_whatsapp")
    .select("id")
    .eq("user_id", userId)
    .eq("contato", contato)
    .gt("janela_expira_em", new Date().toISOString())
    .order("janela_expira_em", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (aberta) return aberta.id;

  const { data, error } = await admin
    .from("conversas_whatsapp")
    .insert({
      user_id: userId,
      contato,
      cliente_id: clienteId,
      categoria,
      status: "open",
      custo: CUSTO_CONVERSA[categoria] ?? 0,
      mes: mesAtual(),
      iniciada_por: "empresa",
      janela_expira_em: new Date(Date.now() + JANELA_MS).toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw erroBanco(error);
  return data.id;
}

/** Envia template aprovado (Cloud API) ou devolve link wa.me com o mesmo texto. */
export async function enviarTemplate(
  userId: string,
  destino: { telefone: string | null; clienteId: string | null },
  codigo: string,
  params: string[],
): Promise<Envio> {
  const contato = normalizarTelefone(destino.telefone);
  if (!contato) throw new AppError(400, "Cliente sem WhatsApp válido (DDD + número)", "validacao");
  const admin = supabaseAdmin();
  const tpl = await template(admin, codigo);

  if (!whatsappConfigurado()) return { modo: "link", url: linkWhatsApp(contato, renderizarTemplate(tpl.corpo, params)) };

  const conversaId = await conversaAberta(userId, contato, destino.clienteId, tpl.categoria);
  const mensagemId = await graph({
    to: contato,
    type: "template",
    template: {
      name: tpl.meta_nome,
      language: { code: tpl.idioma },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
    },
  });
  await admin.from("mensagens_whatsapp").insert({
    user_id: userId,
    conversa_id: conversaId,
    cliente_id: destino.clienteId,
    direcao: "saida",
    contato,
    template: codigo,
    conteudo: { params, texto: renderizarTemplate(tpl.corpo, params) },
    meta_message_id: mensagemId,
  });
  return { modo: "api", mensagemId };
}

/** Mensagem livre: só dentro da janela de 24h após a última mensagem do cliente. */
export async function enviarTexto(ctx: Contexto, clienteId: string, texto: string): Promise<Envio> {
  const cliente = await dadosCliente(ctx, clienteId);
  const contato = normalizarTelefone(cliente.whatsapp ?? cliente.celular);
  if (!contato) throw new AppError(400, "Cliente sem WhatsApp válido", "validacao");
  if (!whatsappConfigurado()) return { modo: "link", url: linkWhatsApp(contato, texto) };

  const { data: ultima } = await ctx.supabase
    .from("mensagens_whatsapp")
    .select("criado_em")
    .eq("contato", contato)
    .eq("direcao", "entrada")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle<{ criado_em: string }>();
  if (!dentroDaJanela(ultima?.criado_em ?? null)) {
    throw new AppError(409, "Fora da janela de 24h: o cliente não respondeu nas últimas 24h. Use um template.", "fora_janela");
  }
  const conversaId = await conversaAberta(ctx.userId, contato, clienteId, "service");
  const mensagemId = await graph({ to: contato, type: "text", text: { body: texto } });
  await supabaseAdmin().from("mensagens_whatsapp").insert({
    user_id: ctx.userId, conversa_id: conversaId, cliente_id: clienteId, direcao: "saida", contato,
    conteudo: { texto }, meta_message_id: mensagemId,
  });
  return { modo: "api", mensagemId };
}

/* ---------- Fluxos WhatsApp-first ---------- */

type ClienteContato = { id: string; nome: string; whatsapp: string | null; celular: string | null };

async function dadosCliente({ supabase }: Contexto, id: string): Promise<ClienteContato> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, whatsapp, celular")
    .eq("id", idSchema.parse(id))
    .single<ClienteContato>();
  if (error) throw erroBanco(error);
  return data;
}

async function nomeUsuario(db: SupabaseClient, userId: string): Promise<string> {
  const { data } = await db.from("usuarios").select("nome").eq("id", userId).maybeSingle<{ nome: string }>();
  return data?.nome ?? "seu representante";
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

async function exigirQuota(ctx: Contexto) {
  if (whatsappConfigurado()) await verificarLimite(ctx, "conversas_mes");
}

/** Envia o link do catálogo público de uma marca para o cliente. */
export async function enviarCatalogo(ctx: Contexto, clienteId: string, representadaId: string, origem: string): Promise<Envio> {
  const [cliente, rep, rep_nome] = await Promise.all([
    dadosCliente(ctx, clienteId),
    ctx.supabase
      .from("representadas")
      .select("nome, slug, catalogo_publico")
      .eq("id", idSchema.parse(representadaId))
      .single<{ nome: string; slug: string; catalogo_publico: boolean }>(),
    nomeUsuario(ctx.supabase, ctx.userId),
  ]);
  if (rep.error) throw erroBanco(rep.error);
  if (!rep.data.catalogo_publico) throw new AppError(400, "Ative o catálogo digital desta representada antes de enviar", "catalogo_inativo");
  await exigirQuota(ctx);
  return enviarTemplate(ctx.userId, { telefone: cliente.whatsapp ?? cliente.celular, clienteId: cliente.id }, "envio_catalogo", [
    primeiroNome(cliente.nome), rep_nome, rep.data.nome, `${origem}/c/${rep.data.slug}`,
  ]);
}

/** Follow-up pós-visita a partir da tarefa gerada pelo job diário; conclui a tarefa. */
export async function enviarFollowUp(ctx: Contexto, tarefaId: string): Promise<Envio> {
  const { data: tarefa, error } = await ctx.supabase
    .from("tarefas")
    .select("id, cliente_id")
    .eq("id", idSchema.parse(tarefaId))
    .single<{ id: string; cliente_id: string | null }>();
  if (error) throw erroBanco(error);
  if (!tarefa.cliente_id) throw new AppError(400, "Tarefa sem cliente", "validacao");
  const [cliente, rep_nome] = await Promise.all([dadosCliente(ctx, tarefa.cliente_id), nomeUsuario(ctx.supabase, ctx.userId)]);
  await exigirQuota(ctx);
  const envio = await enviarTemplate(ctx.userId, { telefone: cliente.whatsapp ?? cliente.celular, clienteId: cliente.id }, "follow_up_visita", [
    primeiroNome(cliente.nome), rep_nome,
  ]);
  await ctx.supabase.from("tarefas").update({ concluida: true }).eq("id", tarefa.id);
  return envio;
}

/** Confirmação de pedido (usada pelo CRM e pelo catálogo público — por isso recebe o client do banco). */
export async function enviarConfirmacaoPedido(db: SupabaseClient, userId: string, pedidoId: string): Promise<Envio> {
  const { data: p, error } = await db
    .from("pedidos")
    .select("numero, valor_total, user_id, cliente:clientes(id, nome, whatsapp, celular), representada:representadas(nome)")
    .eq("id", idSchema.parse(pedidoId))
    .eq("user_id", userId)
    .single<{ numero: string; valor_total: number; cliente: ClienteContato | null; representada: { nome: string } | null }>();
  if (error) throw erroBanco(error);
  if (!p.cliente) throw new AppError(400, "Pedido sem cliente", "validacao");
  return enviarTemplate(userId, { telefone: p.cliente.whatsapp ?? p.cliente.celular, clienteId: p.cliente.id }, "confirmacao_pedido", [
    primeiroNome(p.cliente.nome), p.numero, p.representada?.nome ?? "", formatarMoeda(Number(p.valor_total)),
  ]);
}

/* ---------- Webhook (recebimento) ---------- */

type Status = {
  id: string;
  status: string;
  conversation?: { id: string; expiration_timestamp?: string; origin?: { type?: string } };
  pricing?: { category?: string };
  errors?: { title?: string; message?: string }[];
};
type Mensagem = { id: string; from: string; timestamp?: string; type: string; text?: { body?: string } };
export type PayloadMeta = { entry?: { changes?: { value?: { statuses?: Status[]; messages?: Mensagem[] } }[] }[] };

/** Processa statuses (entrega/leitura, conversa e categoria cobrada) e mensagens recebidas. Idempotente. */
export async function processarWebhookMeta(payload: PayloadMeta): Promise<void> {
  const admin = supabaseAdmin();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};

      for (const s of v.statuses ?? []) {
        const { data: msg } = await admin
          .from("mensagens_whatsapp")
          .update({ status: s.status, erro: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null, atualizado_em: new Date().toISOString() })
          .eq("meta_message_id", s.id)
          .select("conversa_id")
          .maybeSingle<{ conversa_id: string | null }>();
        if (msg?.conversa_id && s.conversation?.id) {
          const categoria = s.pricing?.category ?? s.conversation.origin?.type;
          await admin
            .from("conversas_whatsapp")
            .update({
              meta_conversa_id: s.conversation.id,
              ...(categoria ? { categoria, custo: CUSTO_CONVERSA[categoria] ?? 0 } : {}),
              ...(s.conversation.expiration_timestamp
                ? { janela_expira_em: new Date(Number(s.conversation.expiration_timestamp) * 1000).toISOString() }
                : {}),
            })
            .eq("id", msg.conversa_id)
            .is("meta_conversa_id", null);
        }
      }

      for (const m of v.messages ?? []) {
        const contato = normalizarTelefone(m.from) ?? m.from;
        // Número compartilhado: a mensagem vai para o representante que falou por último com o contato.
        const { data: ultima } = await admin
          .from("mensagens_whatsapp")
          .select("user_id, cliente_id")
          .eq("contato", contato)
          .eq("direcao", "saida")
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle<{ user_id: string; cliente_id: string | null }>();
        if (!ultima) continue;

        const { data: aberta } = await admin
          .from("conversas_whatsapp")
          .select("id")
          .eq("user_id", ultima.user_id)
          .eq("contato", contato)
          .gt("janela_expira_em", new Date().toISOString())
          .limit(1)
          .maybeSingle<{ id: string }>();
        let conversaId = aberta?.id ?? null;
        if (!conversaId) {
          const { data } = await admin
            .from("conversas_whatsapp")
            .insert({
              user_id: ultima.user_id, contato, cliente_id: ultima.cliente_id, categoria: "service", status: "open",
              custo: 0, mes: mesAtual(), iniciada_por: "cliente", janela_expira_em: new Date(Date.now() + JANELA_MS).toISOString(),
            })
            .select("id")
            .single<{ id: string }>();
          conversaId = data?.id ?? null;
        }
        await admin.from("mensagens_whatsapp").upsert(
          {
            user_id: ultima.user_id, conversa_id: conversaId, cliente_id: ultima.cliente_id, direcao: "entrada", contato,
            conteudo: { tipo: m.type, texto: m.text?.body ?? null },
            meta_message_id: m.id, status: "recebida",
            criado_em: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
          },
          { onConflict: "meta_message_id", ignoreDuplicates: true },
        );
      }
    }
  }
}
