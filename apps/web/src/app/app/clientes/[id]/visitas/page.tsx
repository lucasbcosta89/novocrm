import { Campo, Mensagens, type Busca } from "@/components/form";
import { formatarDataHora, paraInputDataHora } from "@/lib/formato";
import { TIPOS_VISITA } from "@/lib/validacao";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { listarVisitas, type Visita } from "@/server/visitas";
import { atualizarVisitaAction, criarVisitaAction, excluirVisitaAction } from "../../actions";

const ROTULO_TIPO: Record<string, string> = { presencial: "Presencial", telefone: "Telefone", whatsapp: "WhatsApp", video: "Vídeo" };

function CamposVisita({ v, representadas }: { v?: Visita; representadas: { id: string; nome: string }[] }) {
  return (
    <>
      <Campo label="Data/hora *" name="data" type="datetime-local" required defaultValue={paraInputDataHora(v?.data)} />
      <label className="campo">
        <span>Tipo</span>
        <select name="tipo" defaultValue={v?.tipo ?? "presencial"}>
          {TIPOS_VISITA.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
        </select>
      </label>
      <label className="campo">
        <span>Representada</span>
        <select name="representada_id" defaultValue={v?.representada_id ?? ""}>
          <option value="">—</option>
          {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </label>
      <Campo label="Resultado" name="resultado" defaultValue={v?.resultado ?? ""} />
      <label className="campo campo-largo">
        <span>Anotações</span>
        <textarea name="anotacoes" rows={2} defaultValue={v?.anotacoes ?? ""} />
      </label>
    </>
  );
}

export default async function ClienteVisitas({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [c, visitas] = await carregar((ctx) => Promise.all([obterCliente(ctx, id), listarVisitas(ctx, id)]));
  const agora = paraInputDataHora();

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <section className="card">
        <h2>Registrar visita</h2>
        <p className="dica">Visita com data futura aparece como agendada nos alertas da página inicial.</p>
        <form action={criarVisitaAction.bind(null, c.id)} className="grade">
          <CamposVisita representadas={c.representadas} />
          <div className="acoes"><button className="btn" type="submit">Registrar visita</button></div>
        </form>
      </section>

      <section className="card">
        <h2>Histórico</h2>
        {visitas.length === 0 ? (
          <div className="vazio">Nenhuma visita registrada.</div>
        ) : (
          <ul className="historico">
            {visitas.map((v) => (
              <li key={v.id} id={`visita-${v.id}`}>
                <div>
                  <strong>{formatarDataHora(v.data)}</strong> · {ROTULO_TIPO[v.tipo] ?? v.tipo}
                  {v.representada && <> · {v.representada.nome}</>}
                  {paraInputDataHora(v.data) > agora && <> · <span className="etiqueta etiqueta-a_receber">Agendada</span></>}
                </div>
                {v.resultado && <div><em>Resultado:</em> {v.resultado}</div>}
                {v.anotacoes && <div className="anotacao">{v.anotacoes}</div>}
                <details>
                  <summary>Editar</summary>
                  <form action={atualizarVisitaAction.bind(null, c.id, v.id)} className="grade">
                    <CamposVisita v={v} representadas={c.representadas} />
                    <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
                  </form>
                  <form action={excluirVisitaAction.bind(null, c.id, v.id)}>
                    <button className="btn-perigo btn-peq" type="submit">Excluir visita</button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
