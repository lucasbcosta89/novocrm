-- FASE 2: unicidade + RLS por dono (multimarcas)
create unique index representadas_slug_key on representadas (slug);
create index representadas_user_idx on representadas (user_id);
create unique index clientes_user_documento_key on clientes (user_id, documento) where documento is not null;
create index clientes_user_idx on clientes (user_id);
create index cliente_representada_representada_idx on cliente_representada (representada_id);
alter table tabelas_preco add constraint tabelas_preco_produto_cliente_key unique nulls not distinct (produto_id, cliente_id);
create index tabelas_preco_representada_idx on tabelas_preco (representada_id);

create policy representadas_dono on representadas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy clientes_dono on clientes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy cliente_representada_dono on cliente_representada for all to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())))
  with check (
    exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
    and exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
  );

create policy produtos_dono on produtos for all to authenticated
  using (exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())));

create policy tabelas_preco_dono on tabelas_preco for all to authenticated
  using (exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  with check (
    exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
    and exists (select 1 from produtos p where p.id = produto_id and p.representada_id = tabelas_preco.representada_id)
  );
