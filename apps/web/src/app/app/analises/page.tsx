import { redirect } from "next/navigation";

/** Análises abre na aba Por Representada (mantendo os filtros da URL). */
export default async function AnalisesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : [])));
  redirect(`/app/analises/representada${q.size ? `?${q}` : ""}`);
}
