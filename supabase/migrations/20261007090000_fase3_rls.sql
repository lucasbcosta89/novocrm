-- FASE 3: RLS básico — cada usuário só vê os próprios registros
create index visitas_cliente_idx on visitas (cliente_id, data desc);
create index pedidos_cliente_idx on pedidos (cliente_id);
create index pedidos_representada_idx on pedidos (representada_id);
create index oportunidades_cliente_idx on oportunidades_desafios (cliente_id);

-- dono direto (user_id), leitura e escrita
create policy pedidos_dono on pedidos for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
    and exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
  );
create policy comissoes_dono on comissoes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
  );
create policy visitas_dono on visitas for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
    and (representada_id is null or exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  );
create policy tarefas_dono on tarefas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy documentos_dono on documentos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy uploads_dono on uploads for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- templates: globais (user_id null) visíveis a todos; escrita só nos próprios
create policy templates_leitura on templates_whatsapp for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy templates_escrita on templates_whatsapp for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- billing/quota: usuário só lê; escrita via service role
create policy usage_leitura on usage for select to authenticated using ((select auth.uid()) = user_id);
create policy assinaturas_leitura on assinaturas for select to authenticated using ((select auth.uid()) = user_id);
create policy conversas_leitura on conversas_whatsapp for select to authenticated using ((select auth.uid()) = user_id);

-- tabelas filhas: dono via pai
create policy pedido_itens_dono on pedido_itens for all to authenticated
  using (exists (select 1 from pedidos p where p.id = pedido_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from pedidos p where p.id = pedido_id and p.user_id = (select auth.uid())));
create policy oportunidades_dono on oportunidades_desafios for all to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())));
create policy plano_acao_dono on plano_acao for all to authenticated
  using (exists (select 1 from oportunidades_desafios o join clientes c on c.id = o.cliente_id
                 where o.id = oportunidade_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from oportunidades_desafios o join clientes c on c.id = o.cliente_id
                      where o.id = oportunidade_id and c.user_id = (select auth.uid())));
-- webhook_events: sem política (só service role)
