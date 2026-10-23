"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCurto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "out/26" */
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

const EIXO = { fontSize: 12, fill: "var(--muted)" };
const DICA = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--borda-suave)", borderRadius: 10, color: "var(--text)", fontSize: 13 },
  labelStyle: { color: "var(--muted)", marginBottom: 4 },
  cursor: { fill: "var(--accent-suave)" },
};
const fmt = (v: unknown) => brl.format(Number(v ?? 0));

/** Barras de vendas por mês (pedidos confirmados/entregues). */
export function GraficoVendas({ dados }: { dados: { mes: string; valor: number }[] }) {
  return (
    <div className="dash-grafico" role="img" aria-label={`Vendas por mês: ${dados.map((d) => `${rotuloMes(d.mes)} ${brl.format(d.valor)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--borda-suave)" />
          <XAxis dataKey="mes" tickFormatter={rotuloMes} tick={EIXO} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => brlCurto.format(v)} tick={EIXO} axisLine={false} tickLine={false} width={72} />
          <Tooltip {...DICA} labelFormatter={(m) => rotuloMes(String(m))} formatter={(v) => [fmt(v), "Vendas"]} />
          <Bar dataKey="valor" name="Vendas" fill="var(--accent)" radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras empilhadas de comissões por mês (a receber / recebida / atrasada) + linha de custos (mesmo eixo). */
export function GraficoComissoes({ dados }: { dados: { mes: string; a_receber: number; recebida: number; atrasada: number; custos: number }[] }) {
  return (
    <div className="dash-grafico" role="img" aria-label={`Comissões e custos por mês: ${dados.map((d) => `${rotuloMes(d.mes)} recebida ${brl.format(d.recebida)}, custos ${brl.format(d.custos)}`).join("; ")}`}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--borda-suave)" />
          <XAxis dataKey="mes" tickFormatter={rotuloMes} tick={EIXO} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => brlCurto.format(v)} tick={EIXO} axisLine={false} tickLine={false} width={72} />
          <Tooltip {...DICA} labelFormatter={(m) => rotuloMes(String(m))} formatter={(v, nome) => [fmt(v), String(nome)]} />
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
