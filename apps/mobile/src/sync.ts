import { API_URL, supabase } from "./config";
import { db, gravarMeta, lerMeta, type Cliente, type Pedido, type Visita } from "./db";

/**
 * Fila de sync (protocolo estilo WatermelonDB):
 * 1) push: envia registros 'pendente'/'erro' → servidor aplica LWW e responde aplicados/conflitos/rejeitados;
 * 2) pull incremental por updated_at desde o último sync (+ exclusões); registro local pendente mais novo não é sobrescrito.
 */

export type ResultadoSync = { enviados: number; recebidos: number; rejeitados: { id: string; motivo: string }[] };

type RespostaPush = { aplicados: string[]; conflitos: { id: string }[]; rejeitados: { id: string; motivo: string }[] };
type RespostaPull = {
  servidor_em: string;
  clientes: Omit<Cliente, "sync_status" | "sync_erro">[];
  visitas: Omit<Visita, "sync_status" | "sync_erro">[];
  pedidos: (Omit<Pedido, "sync_status" | "sync_erro" | "itens" | "forma_pagamento"> & { origem: string })[];
  exclusoes: { tabela: string; registro_id: string }[];
  representadas: { id: string; nome: string; slug: string | null; catalogo_publico: boolean }[];
  produtos: { id: string; representada_id: string; sku: string; nome: string; unidade: string | null; categoria: string | null; preco: number }[];
  vinculos: { cliente_id: string; representada_id: string }[];
};

async function api<T>(caminho: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("Configure EXPO_PUBLIC_API_URL (URL do CRM web).");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada: entre novamente.");
  const res = await fetch(`${API_URL}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { erro?: string };
  if (!res.ok) throw new Error(json.erro ?? `Erro ${res.status} no servidor`);
  return json;
}

const sem = <T extends Record<string, unknown>>(o: T, ...chaves: (keyof T)[]) => {
  const c = { ...o };
  for (const k of chaves) delete c[k];
  return c;
};

async function enviarPendentes(): Promise<RespostaPush & { total: number }> {
  const filtro = "sync_status != 'sincronizado'";
  const clientes = db.getAllSync<Cliente>(`SELECT * FROM clientes WHERE ${filtro}`);
  const visitas = db.getAllSync<Visita>(`SELECT * FROM visitas WHERE ${filtro}`);
  const pedidos = db.getAllSync<Pedido>(`SELECT * FROM pedidos WHERE ${filtro}`);
  const total = clientes.length + visitas.length + pedidos.length;
  if (total === 0) return { aplicados: [], conflitos: [], rejeitados: [], total };

  const r = await api<RespostaPush>("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      clientes: clientes.map((c) => sem(c, "sync_status", "sync_erro", "status", "cep")),
      visitas: visitas.map((v) => sem(v, "sync_status", "sync_erro")),
      pedidos: pedidos.map((p) => ({
        id: p.id, cliente_id: p.cliente_id, representada_id: p.representada_id,
        forma_pagamento: p.forma_pagamento, itens: JSON.parse(p.itens ?? "[]"),
      })),
    }),
  });

  db.withTransactionSync(() => {
    const ok = [...r.aplicados, ...r.conflitos.map((c) => c.id)];
    for (const tabela of ["clientes", "visitas", "pedidos"]) {
      for (const id of ok) db.runSync(`UPDATE ${tabela} SET sync_status = 'sincronizado', sync_erro = NULL WHERE id = ?`, id);
      for (const x of r.rejeitados) db.runSync(`UPDATE ${tabela} SET sync_status = 'erro', sync_erro = ? WHERE id = ?`, x.motivo, x.id);
    }
  });
  return { ...r, total };
}

/** LWW local: não sobrescreve registro pendente mais novo que a versão do servidor. */
function podeSobrescrever(tabela: string, id: string, updatedServidor: string): boolean {
  const local = db.getFirstSync<{ sync_status: string; updated_at: string }>(`SELECT sync_status, updated_at FROM ${tabela} WHERE id = ?`, id);
  return !local || local.sync_status === "sincronizado" || Date.parse(local.updated_at) <= Date.parse(updatedServidor);
}

async function baixarAlteracoes(): Promise<number> {
  const desde = lerMeta("ultimo_pull");
  const d = await api<RespostaPull>(`/api/sync/pull${desde ? `?since=${encodeURIComponent(desde)}` : ""}`);

  db.withTransactionSync(() => {
    for (const c of d.clientes) {
      if (!podeSobrescrever("clientes", c.id, c.updated_at)) continue;
      db.runSync(
        `INSERT OR REPLACE INTO clientes (id, nome, documento, email, celular, whatsapp, cidade, uf, cep, segmento, anotacoes, status, updated_at, sync_status, sync_erro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sincronizado', NULL)`,
        c.id, c.nome, c.documento, c.email, c.celular, c.whatsapp, c.cidade, c.uf, c.cep, c.segmento, c.anotacoes, c.status, c.updated_at,
      );
    }
    for (const v of d.visitas) {
      if (!podeSobrescrever("visitas", v.id, v.updated_at)) continue;
      db.runSync(
        `INSERT OR REPLACE INTO visitas (id, cliente_id, representada_id, data, tipo, anotacoes, resultado, updated_at, sync_status, sync_erro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sincronizado', NULL)`,
        v.id, v.cliente_id, v.representada_id, v.data, v.tipo, v.anotacoes, v.resultado, v.updated_at,
      );
    }
    for (const p of d.pedidos) {
      db.runSync(
        `INSERT INTO pedidos (id, cliente_id, representada_id, numero, data, status, valor_total, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sincronizado')
         ON CONFLICT(id) DO UPDATE SET numero = excluded.numero, status = excluded.status, valor_total = excluded.valor_total,
           updated_at = excluded.updated_at, sync_status = 'sincronizado', sync_erro = NULL`,
        p.id, p.cliente_id, p.representada_id, p.numero, p.data, p.status, Number(p.valor_total), p.updated_at,
      );
    }
    for (const x of d.exclusoes) {
      if (["clientes", "visitas", "pedidos"].includes(x.tabela)) {
        db.runSync(`DELETE FROM ${x.tabela} WHERE id = ? AND sync_status = 'sincronizado'`, x.registro_id);
      }
    }
    // referência: snapshot completo
    db.runSync("DELETE FROM representadas");
    for (const r of d.representadas) {
      db.runSync("INSERT INTO representadas (id, nome, slug, catalogo_publico) VALUES (?, ?, ?, ?)", r.id, r.nome, r.slug, r.catalogo_publico ? 1 : 0);
    }
    db.runSync("DELETE FROM produtos");
    for (const p of d.produtos) {
      db.runSync(
        "INSERT INTO produtos (id, representada_id, sku, nome, unidade, categoria, preco) VALUES (?, ?, ?, ?, ?, ?, ?)",
        p.id, p.representada_id, p.sku, p.nome, p.unidade, p.categoria, Number(p.preco),
      );
    }
    db.runSync("DELETE FROM vinculos");
    for (const v of d.vinculos) db.runSync("INSERT OR IGNORE INTO vinculos (cliente_id, representada_id) VALUES (?, ?)", v.cliente_id, v.representada_id);
    gravarMeta("ultimo_pull", d.servidor_em);
  });
  return d.clientes.length + d.visitas.length + d.pedidos.length;
}

let emAndamento: Promise<ResultadoSync> | null = null;

/** Push + pull. Chamadas concorrentes reaproveitam a mesma execução. */
export function sincronizar(): Promise<ResultadoSync> {
  emAndamento ??= (async () => {
    try {
      const enviados = await enviarPendentes();
      const recebidos = await baixarAlteracoes();
      gravarMeta("ultimo_sync", new Date().toISOString());
      return { enviados: enviados.aplicados.length + enviados.conflitos.length, recebidos, rejeitados: enviados.rejeitados };
    } finally {
      emAndamento = null;
    }
  })();
  return emAndamento;
}
