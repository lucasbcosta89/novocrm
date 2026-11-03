-- CADASTRO DE REPRESENTADAS — Fase 2: listagem.
-- View com security_invoker: roda com as permissões do usuário autenticado, então o RLS de representadas,
-- cliente_representada e pedidos continua valendo (ninguém vê dados de outro usuário). Sem SECURITY DEFINER.
-- Derivados: clientes vinculados e valor vendido nos últimos 90 dias (pedidos confirmados/entregues).
-- busca: razão social + nome fantasia + CNPJ sem máscara (o termo é normalizado do mesmo jeito no app).
create view representadas_listagem with (security_invoker = true) as
select
  r.id, r.user_id, r.codigo_representada, r.razao_social, r.nome_fantasia, r.cnpj, r.cidade, r.uf,
  r.comissao_percentual, r.status, r.criado_em,
  concat_ws(' ', r.razao_social, r.nome_fantasia, r.cnpj) as busca,
  (select count(*) from cliente_representada cr where cr.representada_id = r.id)::int as clientes_vinculados,
  coalesce((select sum(p.valor_total) from pedidos p
             where p.representada_id = r.id and p.status in ('confirmado', 'entregue')
               and p.data >= now() - interval '90 days'), 0)::numeric(14,2) as valor_vendido_90d
from representadas r
where r.excluido_em is null;

revoke all on representadas_listagem from anon;
grant select on representadas_listagem to authenticated;

create index if not exists pedidos_representada_status_data_idx on pedidos (representada_id, status, data);
