import type {
  ClassificacaoLinha, ConfiguracaoImportacao, ContextoValidacao, ProblemaImportacao, ResultadoValidacaoLinha,
} from "@/lib/cadastros/tipos";

/**
 * Motor GENÉRICO de importação por planilha (o mesmo no navegador e no servidor). Não conhece nenhuma
 * entidade: tudo vem da ConfiguracaoImportacao (colunas, obrigatórios, validação, chave de dedupe).
 * Nada aqui grava: só classifica cada linha em válida / com alerta / inválida.
 */

export const MAX_LINHAS = 5000;

/** Linha crua do arquivo: número real na planilha (contando o cabeçalho) e células por posição. */
export type LinhaBruta = { numero_linha: number; valores: string[] };

/**
 * O cabeçalho é contrato: nomes EXATOS, na ordem do modelo. Coluna ausente, renomeada, fora de ordem ou a
 * mais vira um problema (sem adivinhar por similaridade).
 */
export function problemasCabecalho(esperadas: readonly string[], recebido: readonly string[]): ProblemaImportacao[] {
  const problemas: ProblemaImportacao[] = [];
  const total = Math.max(esperadas.length, recebido.length);
  for (let i = 0; i < total; i++) {
    const esp = esperadas[i];
    const rec = (recebido[i] ?? "").trim();
    if (esp === rec) continue;
    if (esp === undefined) {
      problemas.push({ campo: rec || `coluna ${i + 1}`, mensagem: `Cabeçalho fora do padrão: coluna ${i + 1} ("${rec}") não existe no modelo`, valor_recebido: rec || null });
    } else if (!rec) {
      problemas.push({ campo: esp, mensagem: `Cabeçalho fora do padrão: coluna ${i + 1} deveria ser "${esp}" e está vazia ou ausente`, valor_recebido: null });
    } else {
      problemas.push({ campo: esp, mensagem: `Cabeçalho fora do padrão: coluna ${i + 1} deveria ser "${esp}", veio "${rec}"`, valor_recebido: rec });
    }
  }
  return problemas;
}

const chave = (campo: string, valor: unknown) => `${campo}:${String(valor)}`;

const classificar = (erros: ProblemaImportacao[], alertas: ProblemaImportacao[]): ClassificacaoLinha =>
  erros.length ? "invalida" : alertas.length ? "com_alerta" : "valida";

/**
 * Valida o arquivo inteiro. Cabeçalho divergente invalida TODAS as linhas (com os problemas do cabeçalho
 * no relatório). Duplicidade dentro do arquivo: a chave de dedupe (e as chavesUnicas) de cada linha vai para
 * contexto.linhasAnteriores; a validação da entidade decide o que é repetição.
 * aoProgresso: chamado a cada bloco (arquivos grandes), cedendo a vez para a tela atualizar.
 */
export async function validarPlanilha<T>(
  config: ConfiguracaoImportacao<T>,
  cabecalho: readonly string[],
  linhas: readonly LinhaBruta[],
  valoresExistentesNaBase: Map<string, unknown>,
  aoProgresso?: (feitas: number, total: number) => void,
): Promise<ResultadoValidacaoLinha[]> {
  const doCabecalho = problemasCabecalho(config.colunasEsperadas, cabecalho);
  const contexto: ContextoValidacao = { linhasAnteriores: [], valoresExistentesNaBase };
  const unicas = [String(config.chaveDedupe), ...(config.chavesUnicas ?? [])];
  const saida: ResultadoValidacaoLinha[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]!;
    if (doCabecalho.length) {
      const nomes = cabecalho.length ? cabecalho : config.colunasEsperadas;
      const dados = Object.fromEntries(nomes.map((n, j) => [n || `coluna ${j + 1}`, l.valores[j] ?? null]));
      saida.push({ numero_linha: l.numero_linha, classificacao: "invalida", dados, erros: doCabecalho, alertas: [] });
    } else {
      const bruto = Object.fromEntries(config.colunasEsperadas.map((c, j) => [c, (l.valores[j] ?? "").trim()]));
      const faltando: ProblemaImportacao[] = config.colunasObrigatorias
        .filter((c) => !bruto[c])
        .map((c) => ({ campo: c, mensagem: config.mensagens.obrigatorio?.replace("{campo}", c) ?? `Campo obrigatório "${c}" vazio`, valor_recebido: null }));
      const r = config.validarLinha(bruto, contexto);
      const erros = [...faltando, ...r.erros.filter((e) => !faltando.some((f) => f.campo === e.campo))];
      saida.push({ ...r, numero_linha: l.numero_linha, erros, classificacao: classificar(erros, r.alertas) });
      for (const c of unicas) if (r.dados[c] != null && r.dados[c] !== "") contexto.linhasAnteriores.push(chave(c, r.dados[c]));
    }
    if (aoProgresso && (i + 1) % 250 === 0) {
      aoProgresso(i + 1, linhas.length);
      await new Promise((ok) => setTimeout(ok, 0));
    }
  }
  aoProgresso?.(linhas.length, linhas.length);
  return saida;
}

/** Contagens do resumo (etapa de conferência). */
export function resumirValidacao(linhas: readonly ResultadoValidacaoLinha[]) {
  return {
    total_linhas: linhas.length,
    validas: linhas.filter((l) => l.classificacao === "valida").length,
    com_alerta: linhas.filter((l) => l.classificacao === "com_alerta").length,
    invalidas: linhas.filter((l) => l.classificacao === "invalida").length,
  };
}

/** Chave usada em linhasAnteriores / valoresExistentesNaBase ("campo:valor"). */
export const chaveImportacao = chave;

/**
 * O que a confirmação faz com cada linha: inválidas ficam de fora (com erro); linhas cujo registro já existe
 * igual (config.semAlteracao) são ignoradas; o resto é gravado. Mesma regra no navegador e no servidor.
 */
export function separarParaGravacao<T>(
  config: ConfiguracaoImportacao<T>,
  linhas: readonly ResultadoValidacaoLinha[],
  valoresExistentesNaBase: Map<string, unknown>,
) {
  const chaveDedupe = String(config.chaveDedupe);
  const gravar: ResultadoValidacaoLinha[] = [];
  const ignorar: ResultadoValidacaoLinha[] = [];
  const comErro: ResultadoValidacaoLinha[] = [];
  for (const l of linhas) {
    if (l.classificacao === "invalida") { comErro.push(l); continue; }
    const existente = valoresExistentesNaBase.get(chave(chaveDedupe, l.dados[chaveDedupe]));
    if (existente !== undefined && config.semAlteracao?.(l.dados, existente)) ignorar.push(l);
    else gravar.push(l);
  }
  return { gravar, ignorar, comErro };
}
