/** Contadores do log de oportunidades: aproveitamento = ganhas ÷ (ganhas + perdidas) × 100. */
export function resumoOportunidades(itens: { resultado: string | null }[]) {
  const ganhas = itens.filter((o) => o.resultado === "ganhou").length;
  const perdidas = itens.filter((o) => o.resultado === "perdeu").length;
  const decididas = ganhas + perdidas;
  return { total: itens.length, ganhas, perdidas, aproveitamento: decididas ? Math.round((ganhas / decididas) * 1000) / 10 : 0 };
}
