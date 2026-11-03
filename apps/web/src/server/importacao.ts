import "server-only";
import { z } from "zod";
import type { RelatorioImportacao, ResultadoValidacaoLinha } from "@/lib/cadastros/tipos";
import { COLUNAS_REPRESENTADA } from "@/lib/cadastros/importacao-representadas";
import { chaveImportacao, MAX_LINHAS, resumirValidacao, separarParaGravacao, validarPlanilha } from "@/lib/importacao/motor";
import { ehEntidadeImportacao, IMPORTACOES, type EntidadeImportacao } from "@/lib/importacao/registro";
import { slugify } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { obterUso } from "./quota";

/**
 * Serviço GENÉRICO de importação (servidor). A pré-validação no navegador é só conveniência: aqui o arquivo
 * é validado de novo com os dados atuais da base e só as linhas válidas/com alerta são gravadas, num único
 * lote transacional (RPC da entidade). Tudo roda com a sessão do usuário (RLS), nunca com service role.
 */

type Adaptador = {
  /** chaves já existentes na base ("campo:valor" → info), lidas com RLS do usuário */
  existentes(ctx: Contexto): Promise<Map<string, unknown>>;
  /** grava o lote numa transação; devolve inseridas/atualizadas */
  gravar(ctx: Contexto, linhas: ResultadoValidacaoLinha[], existentes: Map<string, unknown>): Promise<{ inseridas: number; atualizadas: number }>;
};

const ADAPTADORES: Record<EntidadeImportacao, Adaptador> = {
  representadas: {
    async existentes({ supabase }) {
      const { data, error } = await supabase
        .from("representadas")
        .select(`excluido_em, ${COLUNAS_REPRESENTADA.join(", ")}`)
        .returns<({ excluido_em: string | null; cnpj: string | null; codigo_representada: string; inscricao_estadual: string | null } & Record<string, unknown>)[]>();
      if (error) throw erroBanco(error);
      const m = new Map<string, unknown>();
      for (const r of data) {
        // código nunca é reutilizado (inclui excluídas); CNPJ/IE só valem entre as não excluídas
        m.set(chaveImportacao("codigo_representada", r.codigo_representada), { cnpj: r.excluido_em ? null : r.cnpj });
        if (r.excluido_em) continue;
        // valores atuais: linha igual ao cadastro é ignorada no reenvio (nada a gravar, sem duplicar)
        if (r.cnpj) m.set(chaveImportacao("cnpj", r.cnpj), { codigo: r.codigo_representada, valores: r });
        if (r.inscricao_estadual && r.inscricao_estadual !== "ISENTO") m.set(chaveImportacao("inscricao_estadual", r.inscricao_estadual), { cnpj: r.cnpj });
      }
      return m;
    },
    async gravar(ctx, linhas, existentes) {
      const novas = linhas.filter((l) => !existentes.has(chaveImportacao("cnpj", l.dados.cnpj))).length;
      await garantirQuota(ctx, "representadas", novas);
      const lote = linhas.map((l) => ({ ...l.dados, slug: slugify(String(l.dados.nome_fantasia ?? l.dados.razao_social ?? "representada")) }));
      const { data, error } = await ctx.supabase.rpc("importar_representadas", { p_linhas: lote });
      if (error) {
        if (error.hint === "LIMITE_ATINGIDO") throw erroBanco(error);
        throw new AppError(409, `Nada foi gravado: o lote foi desfeito por inteiro (${error.message}). Corrija e envie de novo.`, "lote_desfeito");
      }
      return data as { inseridas: number; atualizadas: number };
    },
  },
};

/** Quota (middleware verificarLimite) para N inclusões de uma vez: recusa ANTES de gravar, com mensagem clara. */
async function garantirQuota(ctx: Contexto, recurso: "representadas", novas: number) {
  if (novas === 0) return;
  const uso = await obterUso(ctx);
  const r = uso.recursos[recurso];
  if (r.limite != null && r.usado + novas > r.limite) {
    const livres = Math.max(r.limite - r.usado, 0);
    throw new AppError(
      403,
      `Seu plano ${uso.plano.nome} permite mais ${livres} ${recurso}; a planilha traz ${novas} nova(s). Nada foi gravado. Faça upgrade ou importe menos linhas novas.`,
      "LIMITE_ATINGIDO",
    );
  }
}

/** Permissão de ESCRITA nas entidades importáveis: conta ativa (status do usuário). Sem ela, rota e botão somem. */
export async function podeImportar({ supabase, userId }: Contexto): Promise<boolean> {
  const { data, error } = await supabase.from("usuarios").select("status").eq("id", userId).maybeSingle<{ status: string }>();
  if (error) throw erroBanco(error);
  return data?.status === "ativo";
}

function entidadeValida(entidade: string): EntidadeImportacao {
  if (!ehEntidadeImportacao(entidade)) throw new AppError(404, "Importação não disponível para este cadastro", "nao_encontrado");
  return entidade;
}

async function exigirPermissao(ctx: Contexto) {
  if (!(await podeImportar(ctx))) throw new AppError(403, "Sem permissão de escrita para importar", "sem_permissao");
}

/** Chaves existentes para a pré-validação no navegador (somente leitura). */
export async function chavesExistentes(ctx: Contexto, entidade: string): Promise<[string, unknown][]> {
  const e = entidadeValida(entidade);
  await exigirPermissao(ctx);
  return [...(await ADAPTADORES[e].existentes(ctx))];
}

const envioSchema = z.object({
  arquivo_nome: z.string().trim().min(1).max(255),
  iniciado_em: z.iso.datetime().optional(),
  cabecalho: z.array(z.string().max(200)).max(200),
  linhas: z
    .array(z.object({ numero_linha: z.number().int().min(2), valores: z.array(z.string().max(2000)).max(200) }))
    .min(1, "A planilha não tem linhas")
    .max(MAX_LINHAS, `Limite de ${MAX_LINHAS.toLocaleString("pt-BR")} linhas por importação`),
});

/**
 * Confirmação (etapa 4): revalida o arquivo inteiro, grava SÓ as linhas válidas/com alerta num lote
 * transacional e registra o resumo em importacoes. Devolve o relatório completo (todas as linhas).
 */
export async function importarPlanilha(ctx: Contexto, entidade: string, entrada: unknown): Promise<RelatorioImportacao> {
  const e = entidadeValida(entidade);
  await exigirPermissao(ctx);
  const env = envioSchema.parse(entrada);
  const config = IMPORTACOES[e];
  const adaptador = ADAPTADORES[e];
  const iniciado_em = env.iniciado_em ?? new Date().toISOString();

  const existentes = await adaptador.existentes(ctx);
  const linhas = await validarPlanilha(config, env.cabecalho, env.linhas, existentes);
  const { gravar, ignorar } = separarParaGravacao(config, linhas, existentes);
  const gravado = gravar.length ? await adaptador.gravar(ctx, gravar, existentes) : { inseridas: 0, atualizadas: 0 };
  const resumo = resumirValidacao(linhas);

  // importadas = inseridas + atualizadas; ignoradas = já iguais no cadastro; com erro = inválidas
  const relatorio: RelatorioImportacao = {
    entidade: e, ...resumo, ...gravado, ignoradas: ignorar.length,
    linhas, arquivo_nome: env.arquivo_nome, iniciado_em, concluido_em: new Date().toISOString(),
  };

  // histórico (best effort: a gravação já foi confirmada)
  const erros = linhas.flatMap((l) => l.erros.map((p) => ({ linha: l.numero_linha, campo: p.campo, mensagem: p.mensagem }))).slice(0, 200);
  const { error } = await ctx.supabase.from("importacoes").insert({
    user_id: ctx.userId, tipo: e, arquivo: env.arquivo_nome, total: resumo.total_linhas, validas: gravar.length + ignorar.length,
    inseridos: gravado.inseridas, atualizados: gravado.atualizadas, com_erro: resumo.invalidas, erros,
  });
  if (error) console.error("Histórico de importação", error.message);
  return relatorio;
}
