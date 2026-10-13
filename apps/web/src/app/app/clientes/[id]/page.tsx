import { Mensagens, type Busca } from "@/components/form";
import { PainelResumo } from "@/components/painel";
import { formatarDocumento } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { painelCliente } from "@/server/dashboards";
import { atualizarClienteAction, excluirClienteAction } from "../actions";
import { CamposCliente } from "../campos";

/** Página inicial do cliente: dashboard (vendas, visitas, alertas) + informações. */
export default async function ClienteInicio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [c, painel] = await carregar((ctx) => Promise.all([obterCliente(ctx, id), painelCliente(ctx, id)]));

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <PainelResumo painel={painel} rotuloVisitas="Visitas feitas" />

      <section className="card">
        <h2>Informações</h2>
        <dl className="resumo">
          <div><dt>CPF/CNPJ</dt><dd>{formatarDocumento(c.documento)}</dd></div>
          <div><dt>Cidade/UF</dt><dd>{[c.cidade, c.uf].filter(Boolean).join("/") || "—"}</dd></div>
          <div><dt>WhatsApp</dt><dd>{c.whatsapp ?? c.celular ?? "—"}</dd></div>
          <div><dt>E-mail</dt><dd>{c.email ?? "—"}</dd></div>
          <div><dt>Segmento</dt><dd>{c.segmento ?? "—"}</dd></div>
          <div><dt>Representadas</dt><dd>{c.representadas.map((r) => r.nome).join(", ") || "—"}</dd></div>
        </dl>
        <details>
          <summary>Editar dados</summary>
          <form action={atualizarClienteAction.bind(null, c.id)} className="grade">
            <CamposCliente c={c} />
            <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
          </form>
          <form action={excluirClienteAction.bind(null, c.id)}>
            <button className="btn-perigo" type="submit">Excluir cliente</button>
          </form>
        </details>
      </section>
    </>
  );
}
