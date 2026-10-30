import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Mensagens } from "@/components/form";
import { PainelResumo } from "@/components/painel";
import { formatarData, formatarDocumento } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { painelRepresentada } from "@/server/dashboards";
import { listarDocumentosRepresentada } from "@/server/documentos-representada";
import { listarPontos } from "@/server/pontos-faturamento";
import { obterRepresentada } from "@/server/representadas";
import {
  atualizarPontoAction,
  atualizarRepresentadaAction,
  criarPontoAction,
  enviarDocumentosAction,
  excluirDocumentoAction,
  excluirPontoAction,
  excluirRepresentadaAction,
} from "../actions";
import { CamposEmpresa, empresaDaRepresentada, enderecoTexto } from "../campos-empresa";
import { Icone } from "@/components/icones";

/** Início da representada: quadro da empresa → vendas → alertas → pontos de faturamento. */
export default async function RepresentadaInicio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string; editar?: string }>;
}) {
  const [{ id }, { erro, ok, editar }] = await Promise.all([params, searchParams]);
  const [r, painel, pontos, documentos] = await carregar((ctx) =>
    Promise.all([obterRepresentada(ctx, id), painelRepresentada(ctx, id), listarPontos(ctx, id), listarDocumentosRepresentada(ctx, id)]),
  );

  return (
    <>
      <Mensagens erro={erro} ok={ok} />

      <section className="card" id="empresa">
        <div className="cabecalho">
          <h2 className="titulo-icone"><Icone nome="predio" tamanho={20} /> {r.nome}</h2>
        </div>
        <dl className="resumo">
          <div><dt className="com-icone"><Icone nome="identidade" tamanho={16} /> CNPJ</dt><dd>{formatarDocumento(r.cnpj)}</dd></div>
          <div><dt className="com-icone"><Icone nome="mapa" tamanho={16} /> Endereço</dt><dd>{enderecoTexto(empresaDaRepresentada(r))}</dd></div>
          <div><dt className="com-icone"><Icone nome="email" tamanho={16} /> E-mail</dt><dd>{r.email_comercial ?? "—"}</dd></div>
          <div><dt className="com-icone"><Icone nome="telefone" tamanho={16} /> Telefone</dt><dd>{r.telefone ?? "—"}</dd></div>
        </dl>
        <div>
          {r.catalogo_publico ? (
            <>
              <a className="btn-suave btn-peq" href={`/c/${r.slug}`} target="_blank" rel="noopener noreferrer"><Icone nome="link" tamanho={16} /> Abrir catálogo digital</a>
              <small className="dica"> /c/{r.slug} · {r.criar_pedido_publico ? "aceitando pedidos" : "somente vitrine"}</small>
            </>
          ) : (
            <small className="dica">Catálogo digital desativado — ative em “Editar dados”.</small>
          )}
        </div>
        <details id="documentos">
          <summary><Icone nome="clipe" tamanho={16} /> Documentos anexados ({documentos.length})</summary>
          {documentos.length === 0 ? (
            <p className="dica">Nenhum documento.</p>
          ) : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr><th>Documento</th><th>Enviado em</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {documentos.map((d) => (
                    <tr key={d.id}>
                      <td><a href={`/api/uploads/${d.id}`}>{d.nome}</a></td>
                      <td>{formatarData(d.criado_em)}</td>
                      <td>
                        <form action={excluirDocumentoAction.bind(null, r.id, d.id)}>
                          <BotaoConfirmar texto="Excluir" pergunta={`Excluir o documento “${d.nome}”? Esta ação não pode ser desfeita.`} />
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={enviarDocumentosAction.bind(null, r.id)} className="inline">
            <label className="campo">
              <span>Adicionar documentos</span>
              <input type="file" name="documentos" multiple required accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" />
            </label>
            <button className="btn-suave btn-peq" type="submit">Enviar</button>
          </form>
        </details>
        <details open={editar === "1" || undefined}>
          <summary><Icone nome="lapis" tamanho={16} /> Editar dados</summary>
          <form action={atualizarRepresentadaAction.bind(null, r.id)} className="grade-1">
            <CamposEmpresa e={empresaDaRepresentada(r)} />
            <label className="check"><input type="checkbox" name="catalogo_publico" defaultChecked={r.catalogo_publico} /> Catálogo digital público</label>
            <label className="check"><input type="checkbox" name="criar_pedido_publico" defaultChecked={r.criar_pedido_publico} /> Aceitar pedidos pelo catálogo</label>
            <div className="acoes-linha"><button className="btn" type="submit">Salvar</button></div>
          </form>
          <form action={excluirRepresentadaAction.bind(null, r.id)}>
            <BotaoConfirmar className="btn-perigo" texto="Excluir representada" pergunta={`Excluir “${r.nome}”? Esta ação não pode ser desfeita.`} />
          </form>
        </details>
      </section>

      <PainelResumo painel={painel} rotuloVisitas="Visitas (representada e clientes)" />

      <section className="card" id="pontos">
        <details className="novo-inline">
          <summary className="btn btn-peq"><Icone nome="mais" tamanho={16} /> Adicionar Ponto de Faturamento</summary>
          <form action={criarPontoAction.bind(null, r.id)} className="grade-1">
            <CamposEmpresa tituloEndereco="Endereço" />
            <div className="acoes-linha"><button className="btn" type="submit">Cadastrar ponto</button></div>
          </form>
        </details>
        <h2 className="titulo-icone"><Icone nome="mapa" tamanho={20} /> Pontos de Faturamento</h2>
        {pontos.length === 0 ? (
          <div className="vazio">Nenhum ponto de faturamento.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Nome</th><th>CNPJ</th><th>Endereço</th><th>Contato</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {pontos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{formatarDocumento(p.cnpj)}</td>
                    <td>{enderecoTexto(p)}</td>
                    <td>{[p.email, p.telefone].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{p.status === "ativo" ? "Ativo" : "Inativo"}</td>
                    <td>
                      <details>
                        <summary>Editar</summary>
                        <form action={atualizarPontoAction.bind(null, r.id, p.id)} className="grade-1">
                          <CamposEmpresa e={p} tituloEndereco="Endereço" />
                          <label className="campo">
                            <span>Status</span>
                            <select name="status" defaultValue={p.status}>
                              <option value="ativo">Ativo</option>
                              <option value="inativo">Inativo</option>
                            </select>
                          </label>
                          <div className="acoes-linha"><button className="btn" type="submit">Salvar</button></div>
                        </form>
                        <form action={excluirPontoAction.bind(null, r.id, p.id)}>
                          <BotaoConfirmar texto="Excluir ponto" pergunta={`Excluir o ponto “${p.nome}”?`} />
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
