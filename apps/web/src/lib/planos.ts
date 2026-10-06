// Espelho do seed de `planos` em schema.sql. null = ilimitado.
export type Limites = {
  representadas: number | null;
  clientes: number | null;
  conversas_mes: number | null;
};

export const PLANOS = {
  solo: { representadas: 1, clientes: 100, conversas_mes: 200 },
  profissional: { representadas: 3, clientes: 1000, conversas_mes: 500 },
  pro: { representadas: null, clientes: null, conversas_mes: 1500 },
} as const satisfies Record<string, Limites>;

export type PlanoCodigo = keyof typeof PLANOS;
