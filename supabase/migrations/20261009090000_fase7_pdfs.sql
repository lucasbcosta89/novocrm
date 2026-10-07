-- FASE 7: PDFs (relatórios e catálogos)
alter table documentos
  add column titulo text,
  add column parametros jsonb not null default '{}',
  add column tamanho int,
  add column erro text,
  add column gerado_em timestamptz,
  add constraint documentos_tipo_check check (tipo in ('relatorio_periodo','relatorio_comissao','catalogo')),
  add constraint documentos_status_check check (status in ('gerando','pronto','falha'));
create index documentos_user_criado_idx on documentos (user_id, criado_em desc);

-- agrupamento do catálogo
alter table produtos add column categoria text;

-- Arquivos privados (PDFs e imagens): acesso só pelo servidor (service role); download via rota autenticada.
-- Quando o R2 for habilitado, o app passa a usar o binding ARQUIVOS (ver server/armazenamento.ts).
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 10485760)
on conflict (id) do nothing;
