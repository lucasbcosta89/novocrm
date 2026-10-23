import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { AGRUPAMENTOS, agruparDespesas, resolverPeriodo, totalDistinto, type Agrupamento } from "@/lib/custos";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarClientes } from "@/server/clientes";
import { listarDespesas, resumoCustos } from "@/server/custos";
import { listarRepresentadas } from "@/server/representadas";
import { excluirDespesaAction } from "./actions";
import { BotaoDespesa, FiltrosCustos } from "./componentes";

type Busca = Promise<Record<string, string | string[] | undefined>>;
const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).filter(Boolean);
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Controle de Custos: despesas com filtros (período, representadas, clientes), agrupamento e resumo. */
export default async function CustosPage({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const periodo = resolverPeriodo(um(sp.p), um(sp.de), um(sp.ate), hoje);
  const agrupar: Agrupamento = (AGRUPAMENTOS as readonly string[]).includes(um(sp.agrupar) ?? "") ? (um(sp.agrupar) as Agrupamento) : "nenhum";

  const [representadas, clientes] = await carregar((ctx) => Promise.all([listarRepresentadas(ctx), listarClientes(ctx)]));
  const idsRep = new Set(representadas.map((r) => r.id));
  const idsCli = new Set(clientes.map((c) => c.id));
  const filtro = {
    de: periodo.de,
    ate: periodo.ate,
    representadas: lista(sp.rep).filter((id) => idsRep.has(id)),
    clientes: lista(sp.cli).filter((id) => idsCli.has(id)),
  };
  const despesas = await carregar((ctx) => listarDespesas(ctx, filtro));
  const resumo = await carregar((ctx) => resumoCustos(ctx, filtro, despesas));
  const grupos = agruparDespesas(despesas, agrupar);

  // URL atual (para voltar após excluir mantendo os filtros)
  const qs = new URLSearchParams();
  qs.set("p", periodo.atalho);
  if (periodo.atalho === "personalizado") { qs.set("de", periodo.de); qs.set("ate", periodo.ate); }
  filtro.representadas.forEach((r) => qs.append("rep", r));
  filtro.clientes.forEach((c) => qs.append("cli", c));
  qs.set("agrupar", agrupar);
  const voltar = `/app/custos?${qs.toString()}`;

  const opcoesRep = representadas.map((r) => ({ id: r.id, nome: r.nome }));
  const opcoesCli = clientes.map((c) => ({ id: c.id, nome: c.nome }));
  const linha = (d: (typeof despesas)[number]) => (
    <tr key={d.id}>
      <td>{formatarData(`${d.data}T12:00:00Z`)}</td>
      <td>{d.descricao}</td>
      <td>{d.representadas.map((r) => r.nome).join(", ") || <span className="dica">—</span>}</td>
      <td>{d.clientes.map((c) => c.nome).join(", ") || <span className="dica">—</span>}</td>
      <td className="num">{formatarMoeda(d.valor)}</td>
      <td className="dica obs-despesa">{d.observacoes ?? "—"}</td>
      <td>
        <span className="acoes-linha">
          <BotaoDespesa despesa={d} representadas={opcoesRep} clientes={opcoesCli} />
          <form action={excluirDespesaAction.bind(null, d.id, voltar)}>
            <BotaoConfirmar texto="Excluir" pergunta={`Excluir a despesa “${d.descricao}” (${formatarMoeda(d.valor)})?`} />
          </form>
        </span>
      </td>
    </tr>
  );

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1 className="titulo-icone"><Icone nome="carteira" tamanho={24} /> Controle de Custos</h1>
          <p className="subtitulo">{periodo.rotulo}</p>
        </div>
        <BotaoDespesa representadas={opcoesRep} clientes={opcoesCli} />
      </div>
      <Mensagens erro={um(sp.erro)} ok={um(sp.ok)} />

      <FiltrosCustos atalho={periodo.atalho} de={periodo.de} ate={periodo.ate} reps={filtro.representadas} clis={filtro.clientes}
        agrupar={agrupar} representadas={opcoesRep} clientes={opcoesCli} />

      <section className="kpis resumo-custos" aria-label="Resumo do período">
        <div className="kpi"><span className="kpi-icone tom-perigo"><Icone nome="carteira" tamanho={20} /></span><div><dt>Total de custos</dt><dd>{formatarMoeda(resumo.custos)}</dd></div></div>
        <div className="kpi"><span className="kpi-icone tom-ok"><Icone nome="cifrao" tamanho={20} /></span><div><dt>Resultado bruto</dt><dd>{formatarMoeda(resumo.bruto)}</dd><span className="item-sub">comissões recebidas</span></div></div>
        <div className="kpi"><span className={`kpi-icone ${resumo.liquido >= 0 ? "tom-azul" : "tom-perigo"}`}><Icone nome="tendencia" tamanho={20} /></span>
          <div><dt>Resultado líquido</dt><dd className={resumo.liquido < 0 ? "atrasada" : undefined}>{formatarMoeda(resumo.liquido)}</dd><span className="item-sub">bruto − custos</span></div></div>
      </section>

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="recibo" tamanho={20} /> Despesas <span className="dica">({despesas.length})</span></h2>
        {despesas.length === 0 ? (
          <div className="vazio">Nenhuma despesa neste filtro. Use “Adicionar Despesa” para registrar um custo.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela tabela-custos">
              <thead>
                <tr><th>Data</th><th>Descrição</th><th>Representada(s)</th><th>Cliente(s)</th><th className="num">Valor</th><th>Observações</th><th>Ações</th></tr>
              </thead>
              {agrupar === "nenhum" ? (
                <tbody>{despesas.map(linha)}</tbody>
              ) : (
                grupos.map((g) => (
                  <tbody key={g.chave}>
                    <tr className="grupo-custos">
                      <th colSpan={4}>{g.rotulo} <span className="dica">({g.despesas.length})</span></th>
                      <th className="num">{formatarMoeda(g.subtotal)}</th>
                      <th colSpan={2} className="dica">subtotal</th>
                    </tr>
                    {g.despesas.map(linha)}
                  </tbody>
                ))
              )}
              <tfoot>
                <tr>
                  <th colSpan={4}>Total geral {agrupar === "representada" || agrupar === "cliente" ? <span className="dica">(cada despesa contada uma vez)</span> : null}</th>
                  <th className="num">{formatarMoeda(totalDistinto(despesas))}</th>
                  <th colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
