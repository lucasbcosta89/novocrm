-- FASE 4: oportunidades/desafios + plano de ação
alter table oportunidades_desafios
  add constraint oportunidades_prioridade_check check (prioridade in ('baixa','media','alta')),
  add constraint oportunidades_status_check check (status in ('aberta','em_andamento','concluida','nao_aplicavel'));
alter table plano_acao
  add constraint plano_acao_status_check check (status in ('pendente','em_andamento','concluida'));
create index plano_acao_oportunidade_idx on plano_acao (oportunidade_id);

-- representada opcional também precisa ser do usuário
drop policy oportunidades_dono on oportunidades_desafios;
create policy oportunidades_dono on oportunidades_desafios for all to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())))
  with check (
    exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
    and (representada_id is null or exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  );
