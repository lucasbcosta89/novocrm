import type { MODELOS_FUNIL } from "./validacao";

export type ModeloFunil = (typeof MODELOS_FUNIL)[number];

/** Rótulos do dropdown "Modelo" do popup de criação. */
export const ROTULO_MODELO_FUNIL: Record<ModeloFunil, string> = {
  vendas: "Modelo Padrão - Vendas",
  prospeccao: "Modelo Padrão - Prospecção",
  personalizado: "Personalizado",
};

/**
 * Etapas criadas para cada modelo (espelho da função SQL etapas_do_modelo, que é a fonte usada
 * na criação). "Fechamento" nasce como etapa de fechamento.
 */
export const ETAPAS_MODELO: Record<ModeloFunil, string[]> = {
  vendas: ["Oportunidade Identificada", "Proposta Enviada", "Negociação", "Fechamento"],
  prospeccao: ["Prospecção", "Contato Feito", "Cadastro", "Proposta Enviada", "Negociação", "Fechamento"],
  personalizado: ["Definir Etapa", "Definir Etapa", "Definir Etapa", "Definir Etapa"],
};

/** Em aberto = não arquivada e ainda não concluída/cancelada. */
export const emAberto = (o: { arquivada: boolean; status: string }) => !o.arquivada && o.status !== "concluido" && o.status !== "cancelado";
