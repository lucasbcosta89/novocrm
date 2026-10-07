"use client";

import { useEffect, useMemo, useState } from "react";
import { formatarMoeda } from "@/lib/formato";
import type { ProdutoPublico } from "@/server/catalogo-publico";

type Grupo = { categoria: string; produtos: ProdutoPublico[] };
type Itens = Record<string, number>;

const chave = (slug: string) => `carrinho:${slug}`;

function lerCarrinho(slug: string): Itens {
  try {
    return JSON.parse(localStorage.getItem(chave(slug)) ?? "{}") as Itens;
  } catch {
    return {};
  }
}

export function Carrinho({
  slug,
  aceitaPedidos,
  grupos,
  contatoWhatsApp,
}: {
  slug: string;
  aceitaPedidos: boolean;
  grupos: Grupo[];
  contatoWhatsApp: string | null;
}) {
  const [itens, setItens] = useState<Itens>({});
  const [carregado, setCarregado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{ numero: string; valor_total: number; whatsapp: boolean } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidrata o carrinho salvo no navegador
    setItens(lerCarrinho(slug));
    setCarregado(true);
  }, [slug]);
  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(chave(slug), JSON.stringify(itens));
    } catch {
      /* armazenamento indisponível: carrinho só em memória */
    }
  }, [itens, slug, carregado]);

  const produtos = useMemo(() => new Map(grupos.flatMap((g) => g.produtos.map((p) => [p.id, p] as const))), [grupos]);
  const linhas = Object.entries(itens).filter(([id, q]) => q > 0 && produtos.has(id));
  const total = linhas.reduce((s, [id, q]) => s + produtos.get(id)!.preco * q, 0);

  const alterar = (id: string, q: number) => setItens((atual) => ({ ...atual, [id]: Math.max(0, Math.min(100000, q)) }));

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/publico/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        cliente: {
          nome: fd.get("nome"), whatsapp: fd.get("whatsapp"), documento: fd.get("documento") || undefined,
          email: fd.get("email") || undefined, cidade: fd.get("cidade") || undefined, uf: fd.get("uf") || undefined,
        },
        itens: linhas.map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
        observacoes: fd.get("observacoes") || undefined,
        site: fd.get("site") || undefined,
      }),
    }).catch(() => null);
    setEnviando(false);
    const json = (await res?.json().catch(() => null)) as { erro?: string; numero?: string; valor_total?: number; whatsapp?: boolean } | null;
    if (!res?.ok || !json?.numero) {
      setErro(json?.erro ?? "Falha de conexão. Tente novamente.");
      return;
    }
    setConfirmado({ numero: json.numero, valor_total: Number(json.valor_total), whatsapp: Boolean(json.whatsapp) });
    setItens({});
  }

  if (confirmado) {
    return (
      <section className="card confirmacao">
        <h2>Pedido {confirmado.numero} enviado!</h2>
        <p>Total: <strong>{formatarMoeda(confirmado.valor_total)}</strong></p>
        <p>
          {confirmado.whatsapp
            ? "Você vai receber a confirmação no seu WhatsApp."
            : "O representante vai confirmar o pedido com você pelo WhatsApp."}
        </p>
        {contatoWhatsApp && <a className="btn" href={contatoWhatsApp} target="_blank" rel="noopener noreferrer">Falar com o representante</a>}
        <button className="btn-link" type="button" onClick={() => setConfirmado(null)}>Fazer outro pedido</button>
      </section>
    );
  }

  return (
    <div className="publico-corpo">
      <div>
        {grupos.map((g) => (
          <section key={g.categoria}>
            <h2 className="categoria">{g.categoria}</h2>
            <div className="vitrine">
              {g.produtos.map((p) => (
                <article key={p.id} className="produto">
                  {p.temImagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/c/${slug}/img/${p.id}`} alt={p.nome} loading="lazy" />
                  ) : (
                    <div className="sem-imagem">sem imagem</div>
                  )}
                  <h3>{p.nome}</h3>
                  <p className="dica">SKU {p.sku}{p.unidade && ` · ${p.unidade}`}</p>
                  {p.descricao && <p className="dica">{p.descricao}</p>}
                  <p className="preco-produto">{formatarMoeda(p.preco)}</p>
                  {aceitaPedidos && (
                    <div className="qtd">
                      <button type="button" aria-label={`Menos ${p.nome}`} onClick={() => alterar(p.id, (itens[p.id] ?? 0) - 1)}>−</button>
                      <input
                        type="number" min={0} inputMode="numeric" aria-label={`Quantidade de ${p.nome}`}
                        value={itens[p.id] ?? 0} onChange={(e) => alterar(p.id, Number(e.target.value) || 0)}
                      />
                      <button type="button" aria-label={`Mais ${p.nome}`} onClick={() => alterar(p.id, (itens[p.id] ?? 0) + 1)}>+</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {aceitaPedidos ? (
        <aside className="card resumo-carrinho">
          <h2>Seu pedido</h2>
          {linhas.length === 0 ? (
            <p className="dica">Escolha as quantidades nos produtos.</p>
          ) : (
            <ul className="lista-carrinho">
              {linhas.map(([id, q]) => {
                const p = produtos.get(id)!;
                return <li key={id}><span>{q}× {p.nome}</span><span>{formatarMoeda(p.preco * q)}</span></li>;
              })}
              <li className="total"><span>Total</span><span>{formatarMoeda(total)}</span></li>
            </ul>
          )}
          <form onSubmit={enviar} className="grade-1">
            <label className="campo"><span>Nome / razão social *</span><input name="nome" required minLength={2} autoComplete="name" /></label>
            <label className="campo"><span>WhatsApp com DDD *</span><input name="whatsapp" type="tel" required autoComplete="tel" placeholder="(11) 99999-8888" /></label>
            <label className="campo"><span>CPF/CNPJ</span><input name="documento" inputMode="numeric" /></label>
            <label className="campo"><span>E-mail</span><input name="email" type="email" autoComplete="email" /></label>
            <div className="linha-2">
              <label className="campo"><span>Cidade</span><input name="cidade" autoComplete="address-level2" /></label>
              <label className="campo"><span>UF</span><input name="uf" maxLength={2} /></label>
            </div>
            <label className="campo"><span>Observações</span><textarea name="observacoes" rows={2} /></label>
            <input className="oculto" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {erro && <p className="aviso aviso-erro">{erro}</p>}
            <button className="btn" type="submit" disabled={enviando || linhas.length === 0}>
              {enviando ? "Enviando…" : "Enviar pedido"}
            </button>
          </form>
        </aside>
      ) : (
        contatoWhatsApp && (
          <aside className="card resumo-carrinho">
            <p>Para fazer um pedido, fale com o representante.</p>
            <a className="btn" href={contatoWhatsApp} target="_blank" rel="noopener noreferrer">Pedir pelo WhatsApp</a>
          </aside>
        )
      )}
    </div>
  );
}
