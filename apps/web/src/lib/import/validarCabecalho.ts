/** Cabeçalho da planilha de importação de produtos (funções puras, sem I/O). */

export type Campo =
  | "sku"
  | "nome"
  | "unidade"
  | "ncm"
  | "categoria"
  | "preco_padrao"
  | "desconto_maximo"
  | "comissao"
  | "descricao";

/** Colunas na ordem exata do modelo de importação. */
export const CAMPOS_MODELO: readonly Campo[] = [
  "sku",
  "nome",
  "unidade",
  "ncm",
  "categoria",
  "preco_padrao",
  "desconto_maximo",
  "comissao",
  "descricao",
];

/** Rótulo exibido na tela (e esperado no cabeçalho da planilha). */
export const ROTULOS: Record<Campo, string> = {
  sku: "SKU",
  nome: "Nome",
  unidade: "Unidade",
  ncm: "NCM",
  categoria: "Categoria",
  preco_padrao: "Preço Padrão",
  desconto_maximo: "Desconto Máximo",
  comissao: "Comissão",
  descricao: "Descrição",
};

export const CAMPOS_OBRIGATORIOS: readonly Campo[] = ["sku", "nome", "unidade", "ncm"];

/** Texto → sem acentos, minúsculo, só letras/números separados por um espaço, sem espaços nas pontas. */
export function normalizarCabecalho(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ResultadoCabecalho = {
  /** campo → posição (0-based) da coluna no arquivo */
  indices: Partial<Record<Campo, number>>;
  /** campos obrigatórios que não estão no arquivo */
  faltando: Campo[];
  /** cabeçalhos do arquivo que não correspondem a nenhum campo (ou repetem um já encontrado) */
  extras: string[];
};

const ROTULO_NORMALIZADO = new Map(CAMPOS_MODELO.map((c) => [normalizarCabecalho(ROTULOS[c]), c] as const));

/**
 * Compara cada cabeçalho com os rótulos esperados por igualdade exata após normalizar
 * (sem similaridade aproximada). Colunas vazias são ignoradas; a primeira ocorrência de um campo vale.
 */
export function validarCabecalho(cabecalhos: readonly unknown[]): ResultadoCabecalho {
  const indices: Partial<Record<Campo, number>> = {};
  const extras: string[] = [];
  cabecalhos.forEach((cabecalho, i) => {
    const normalizado = normalizarCabecalho(cabecalho);
    if (!normalizado) return;
    const campo = ROTULO_NORMALIZADO.get(normalizado);
    if (campo && indices[campo] === undefined) indices[campo] = i;
    else extras.push(String(cabecalho).trim());
  });
  return { indices, faltando: CAMPOS_OBRIGATORIOS.filter((c) => indices[c] === undefined), extras };
}
