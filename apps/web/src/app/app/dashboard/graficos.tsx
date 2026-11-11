"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCurto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** Ponto do gráfico: "2026-10" → "out/26"; "2026-10-05" → "05/10". */
const rotuloPonto = (p: string) => (p.length === 10 ? `${p.slice(8, 10)}/${p.slice(5, 7)}` : `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(2, 4)}`);
const porQue = (dados: { ponto: string }[]) => (dados[0]?.ponto.length === 10 ? "dia" : "mês");

const EIXO = { fontSize: 12, fill: "var(--muted)" };
const DICA = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--borda-suave)", borderRadius: 10, color: "var(--text)", fontSize: 13 },
  labelStyle: { color: "var(--muted)", marginBottom: 4 },
  cursor: { fill: "var(--accent-suave)" },
};
const fmt = (v: unknown) => brl.format(Number(v ?? 0));

/** Barras de vendas por dia ou por mês (pedidos confirmados/entregues). */
export function GraficoVendas({ dados }: { dados: { ponto: string; valor: number }[] }) {
  return (
    <div className="dash-grafico" role="img" aria-label={`Vendas por ${porQue(dados)}: ${dados.map((d) => `${rotuloPonto(d.ponto)} ${brl.format(d.valor)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--borda-suave)" />
          <XAxis dataKey="ponto" tickFormatter={rotuloPonto} tick={EIXO} axisLine={false} tickLine={false} minTickGap={8} />
          <YAxis tickFormatter={(v) => brlCurto.format(v)} tick={EIXO} axisLine={false} tickLine={false} width={72} />
          <Tooltip {...DICA} labelFormatter={(m) => rotuloPonto(String(m))} formatter={(v) => [fmt(v), "Vendas"]} />
          <Bar dataKey="valor" name="Vendas" fill="var(--accent)" radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras empilhadas de comissões por dia ou mês (a receber / recebida / atrasada) + linha de custos (mesmo eixo). */
export function GraficoComissoes({ dados }: { dados: { ponto: string; a_receber: number; recebida: number; atrasada: number; custos: number }[] }) {
  return (
    <div className="dash-grafico" role="img" aria-label={`Comissões e custos por ${porQue(dados)}: ${dados.map((d) => `${rotuloPonto(d.ponto)} recebida ${brl.format(d.recebida)}, custos ${brl.format(d.custos)}`).join("; ")}`}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--borda-suave)" />
          <XAxis dataKey="ponto" tickFormatter={rotuloPonto} tick={EIXO} axisLine={false} tickLine={false} minTickGap={8} />
          <YAxis tickFormatter={(v) => brlCurto.format(v)} tick={EIXO} axisLine={false} tickLine={false} width={72} />
          <Tooltip {...DICA} labelFormatter={(m) => rotuloPonto(String(m))} formatter={(v, nome) => [fmt(v), String(nome)]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
          <Bar dataKey="recebida" name="Recebida" stackId="c" fill="var(--ok)" maxBarSize={44} />
          <Bar dataKey="a_receber" name="A receber" stackId="c" fill="#7C3AED" maxBarSize={44} />
          <Bar dataKey="atrasada" name="Atrasada" stackId="c" fill="var(--danger)" radius={[6, 6, 0, 0]} maxBarSize={44} />
          <Line type="monotone" dataKey="custos" name="Custos" stroke="var(--atencao)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--atencao)" }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
