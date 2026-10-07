import { randomUUID } from "expo-crypto";
import * as SQLite from "expo-sqlite";

/**
 * Banco local (SQLite) — padrão local-first: toda escrita vai primeiro para cá com sync_status = 'pendente'
 * e a fila de sync envia quando houver conexão. UUIDs são gerados no aparelho.
 */
export const db = SQLite.openDatabaseSync("crm.db");

export type SyncStatus = "pendente" | "sincronizado" | "erro";

export type Cliente = {
  id: string; nome: string; documento: string | null; email: string | null; celular: string | null; whatsapp: string | null;
  cidade: string | null; uf: string | null; cep: string | null; segmento: string | null; anotacoes: string | null;
  status: string | null; updated_at: string; sync_status: SyncStatus; sync_erro: string | null;
};
export type Visita = {
  id: string; cliente_id: string; representada_id: string | null; data: string; tipo: string;
  anotacoes: string | null; resultado: string | null; updated_at: string; sync_status: SyncStatus; sync_erro: string | null;
};
export type ItemPedido = { produto_id: string; quantidade: number };
export type Pedido = {
  id: string; cliente_id: string; representada_id: string; numero: string | null; data: string; status: string;
  valor_total: number; forma_pagamento: string | null; itens: string | null; updated_at: string; sync_status: SyncStatus; sync_erro: string | null;
};
export type Representada = { id: string; nome: string; slug: string | null; catalogo_publico: number };
export type Produto = { id: string; representada_id: string; sku: string; nome: string; unidade: string | null; categoria: string | null; preco: number };

export function migrar() {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, documento TEXT, email TEXT, celular TEXT, whatsapp TEXT, cidade TEXT, uf TEXT,
      cep TEXT, segmento TEXT, anotacoes TEXT, status TEXT, updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'sincronizado', sync_erro TEXT);
    CREATE TABLE IF NOT EXISTS visitas (
      id TEXT PRIMARY KEY, cliente_id TEXT NOT NULL, representada_id TEXT, data TEXT NOT NULL, tipo TEXT NOT NULL,
      anotacoes TEXT, resultado TEXT, updated_at TEXT NOT NULL, sync_status TEXT NOT NULL DEFAULT 'sincronizado', sync_erro TEXT);
    CREATE INDEX IF NOT EXISTS visitas_cliente ON visitas (cliente_id, data);
    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY, cliente_id TEXT NOT NULL, representada_id TEXT NOT NULL, numero TEXT, data TEXT NOT NULL,
      status TEXT NOT NULL, valor_total REAL NOT NULL DEFAULT 0, forma_pagamento TEXT, itens TEXT, updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'sincronizado', sync_erro TEXT);
    CREATE TABLE IF NOT EXISTS representadas (id TEXT PRIMARY KEY, nome TEXT NOT NULL, slug TEXT, catalogo_publico INTEGER);
    CREATE TABLE IF NOT EXISTS produtos (
      id TEXT PRIMARY KEY, representada_id TEXT NOT NULL, sku TEXT, nome TEXT NOT NULL, unidade TEXT, categoria TEXT, preco REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS vinculos (cliente_id TEXT NOT NULL, representada_id TEXT NOT NULL, PRIMARY KEY (cliente_id, representada_id));
    CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT);
  `);
}

export const agoraIso = () => new Date().toISOString();

export function lerMeta(chave: string): string | null {
  return db.getFirstSync<{ valor: string }>("SELECT valor FROM meta WHERE chave = ?", chave)?.valor ?? null;
}
export function gravarMeta(chave: string, valor: string) {
  db.runSync("INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", chave, valor);
}

/* ---------- leitura ---------- */

export const listarClientes = (busca = "") =>
  db.getAllSync<Cliente>("SELECT * FROM clientes WHERE nome LIKE ? ORDER BY nome COLLATE NOCASE", `%${busca}%`);
export const obterCliente = (id: string) => db.getFirstSync<Cliente>("SELECT * FROM clientes WHERE id = ?", id);
export const visitasDoCliente = (id: string) =>
  db.getAllSync<Visita>("SELECT * FROM visitas WHERE cliente_id = ? ORDER BY data DESC", id);
export const pedidosDoCliente = (id: string) =>
  db.getAllSync<Pedido>("SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data DESC", id);
export const representadasDoCliente = (id: string) =>
  db.getAllSync<Representada>(
    "SELECT r.* FROM representadas r JOIN vinculos v ON v.representada_id = r.id WHERE v.cliente_id = ? ORDER BY r.nome", id);
export const listarRepresentadas = () => db.getAllSync<Representada>("SELECT * FROM representadas ORDER BY nome");
export const produtosDaRepresentada = (id: string) =>
  db.getAllSync<Produto>("SELECT * FROM produtos WHERE representada_id = ? ORDER BY categoria, nome", id);

export function contarPendentes(): number {
  const r = db.getFirstSync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM clientes WHERE sync_status != 'sincronizado')
          + (SELECT COUNT(*) FROM visitas WHERE sync_status != 'sincronizado')
          + (SELECT COUNT(*) FROM pedidos WHERE sync_status != 'sincronizado') AS n`);
  return r?.n ?? 0;
}

/* ---------- escrita local (pendente) ---------- */

export function salvarCliente(dados: Partial<Cliente> & { nome: string }): string {
  const id = dados.id ?? randomUUID();
  db.runSync(
    `INSERT INTO clientes (id, nome, documento, email, celular, whatsapp, cidade, uf, segmento, anotacoes, status, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo', ?, 'pendente')
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, documento = excluded.documento, email = excluded.email,
       celular = excluded.celular, whatsapp = excluded.whatsapp, cidade = excluded.cidade, uf = excluded.uf,
       segmento = excluded.segmento, anotacoes = excluded.anotacoes, updated_at = excluded.updated_at, sync_status = 'pendente'`,
    id, dados.nome, dados.documento ?? null, dados.email ?? null, dados.celular ?? null, dados.whatsapp ?? null,
    dados.cidade ?? null, dados.uf ?? null, dados.segmento ?? null, dados.anotacoes ?? null, agoraIso(),
  );
  return id;
}

export function registrarVisita(v: Omit<Visita, "id" | "updated_at" | "sync_status" | "sync_erro">): string {
  const id = randomUUID();
  db.runSync(
    `INSERT INTO visitas (id, cliente_id, representada_id, data, tipo, anotacoes, resultado, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
    id, v.cliente_id, v.representada_id, v.data, v.tipo, v.anotacoes, v.resultado, agoraIso(),
  );
  return id;
}

export function registrarPedido(p: { cliente_id: string; representada_id: string; itens: ItemPedido[]; forma_pagamento: string | null }): string {
  const id = randomUUID();
  const precos = new Map(produtosDaRepresentada(p.representada_id).map((x) => [x.id, x.preco]));
  const estimado = p.itens.reduce((s, i) => s + (precos.get(i.produto_id) ?? 0) * i.quantidade, 0);
  db.runSync(
    `INSERT INTO pedidos (id, cliente_id, representada_id, numero, data, status, valor_total, forma_pagamento, itens, updated_at, sync_status)
     VALUES (?, ?, ?, NULL, ?, 'rascunho', ?, ?, ?, ?, 'pendente')`,
    id, p.cliente_id, p.representada_id, agoraIso(), Math.round(estimado * 100) / 100, p.forma_pagamento, JSON.stringify(p.itens), agoraIso(),
  );
  return id;
}
