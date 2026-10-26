-- FASE 13 — Cadastro de Devoluções (subpágina do cliente).
-- Mesma estrutura de itens do pedido; numeração própria 'DV' + 6 dígitos por usuário.
-- Gravação atômica pela função salvar_devolucao (subtotais e total calculados no banco).

create table devolucoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  numero text not null,
  cliente_id uuid not null references clientes(id) on delete cascade,
  representada_id uuid not null references representadas(id),
  pedido_id uuid references pedidos(id) on delete set null,
  data date not null,
  motivo text not null check (motivo in ('produto_avariado','produto_incorreto','desistencia','prazo_entrega','outro')),
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada','concluida')),
  forma_pagamento text check (forma_pagamento is null or forma_pagamento in ('dinheiro','credito','debito','bonificacao','pix','outros')),
  prazo_tipo text not null default 'a_vista' check (prazo_tipo in ('a_vista','a_prazo')),
  prazo_dias int check (prazo_dias is null or prazo_dias between 1 and 365),
  observacoes text,
  valor_total numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);
create unique index devolucoes_user_numero_key on devolucoes (user_id, numero);

create table devolucao_itens (
  id uuid primary key default gen_random_uuid(),
  devolucao_id uuid not null references devolucoes(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade numeric(12,3) not null check (quantidade > 0),
  preco_unitario numeric(12,2) not null default 0 check (preco_unitario >= 0),
  desconto_percentual numeric(5,2) not null default 0 check (desconto_percentual between 0 and 100),
  subtotal numeric(12,2) not null default 0
);

create index devolucoes_user_data_idx on devolucoes (user_id, data);
create index devolucoes_cliente_idx on devolucoes (cliente_id);
create index devolucoes_representada_idx on devolucoes (representada_id);
create index devolucao_itens_devolucao_idx on devolucao_itens (devolucao_id);
create index devolucao_itens_produto_idx on devolucao_itens (produto_id);

alter table devolucoes enable row level security;
alter table devolucao_itens enable row level security;
create policy devolucoes_dono on devolucoes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy devolucao_itens_dono on devolucao_itens for all to authenticated
  using (exists (select 1 from devolucoes d where d.id = devolucao_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from devolucoes d where d.id = devolucao_id and d.user_id = (select auth.uid())));

/*
  Cria (p_id null) ou edita a devolução e regrava os itens.
  - representada, cliente, pedido e produtos passam pelo RLS (security invoker);
  - pedido de origem: precisa ser do mesmo cliente e representada; cada produto devolvido precisa estar no
    pedido, e a quantidade devolvida (somando as outras devoluções não recusadas do mesmo pedido) não pode
    passar da quantidade vendida;
  - subtotal = quantidade × preço × (1 − desconto%); valor_total = soma dos subtotais.
*/
create function public.salvar_devolucao(
  p_id uuid, p_cliente_id uuid, p_representada_id uuid, p_pedido_id uuid, p_data date,
  p_motivo text, p_status text, p_forma_pagamento text, p_prazo_tipo text, p_prazo_dias int,
  p_observacoes text, p_itens jsonb
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_qtd numeric(12,3);
  v_preco numeric(12,2);
  v_desc numeric(5,2);
  v_vendida numeric;
  v_ja numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then raise exception 'Cliente não encontrado'; end if;
  if not exists (select 1 from representadas where id = p_representada_id) then raise exception 'Representada não encontrada'; end if;
  if p_data is null then raise exception 'Informe a data da devolução'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  if coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' and coalesce(p_prazo_dias, 0) < 1 then
    raise exception 'Informe o prazo em dias';
  end if;
  if p_pedido_id is not null and not exists (
    select 1 from pedidos where id = p_pedido_id and cliente_id = p_cliente_id and representada_id = p_representada_id
  ) then
    raise exception 'Pedido de origem não pertence a este cliente e representada';
  end if;

  if v_id is null then
    insert into devolucoes (user_id, numero, cliente_id, representada_id, pedido_id, data, motivo, status,
                            forma_pagamento, prazo_tipo, prazo_dias, observacoes)
    values (
      v_uid,
      'DV' || lpad((coalesce((select max(substring(numero from 3)::int) from devolucoes where user_id = v_uid and numero ~ '^DV[0-9]+$'), 0) + 1)::text, 6, '0'),
      p_cliente_id, p_representada_id, p_pedido_id, p_data, p_motivo, coalesce(p_status, 'pendente'),
      nullif(trim(p_forma_pagamento), ''), coalesce(p_prazo_tipo, 'a_vista'),
      case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end, nullif(trim(p_observacoes), '')
    ) returning id into v_id;
  else
    update devolucoes set
      cliente_id = p_cliente_id, representada_id = p_representada_id, pedido_id = p_pedido_id, data = p_data,
      motivo = p_motivo, status = coalesce(p_status, 'pendente'), forma_pagamento = nullif(trim(p_forma_pagamento), ''),
      prazo_tipo = coalesce(p_prazo_tipo, 'a_vista'),
      prazo_dias = case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end,
      observacoes = nullif(trim(p_observacoes), '')
    where id = v_id;
    if not found then raise exception 'Devolução não encontrada'; end if;
    delete from devolucao_itens where devolucao_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos
     where id = (v_item->>'produto_id')::uuid and representada_id = p_representada_id;
    if not found then raise exception 'Produto não pertence à representada'; end if;

    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para %', v_prod.nome; end if;
    if v_preco is null or v_preco < 0 then raise exception 'Preço inválido para %', v_prod.nome; end if;
    if v_desc < 0 or v_desc > 100 then raise exception 'Desconto inválido para %', v_prod.nome; end if;

    if p_pedido_id is not null then
      select sum(quantidade) into v_vendida from pedido_itens where pedido_id = p_pedido_id and produto_id = v_prod.id;
      if v_vendida is null then raise exception 'O produto % não está no pedido de origem', v_prod.nome; end if;
      select coalesce(sum(di.quantidade), 0) into v_ja
        from devolucao_itens di join devolucoes d on d.id = di.devolucao_id
       where d.pedido_id = p_pedido_id and d.id <> v_id and d.status <> 'recusada' and di.produto_id = v_prod.id;
      if v_ja + v_qtd + coalesce((select sum(quantidade) from devolucao_itens where devolucao_id = v_id and produto_id = v_prod.id), 0) > v_vendida then
        raise exception 'Quantidade devolvida de % (%) excede a do pedido de origem (% vendida, % já devolvida)',
          v_prod.nome, v_qtd, v_vendida, v_ja;
      end if;
    end if;

    insert into devolucao_itens (devolucao_id, produto_id, quantidade, preco_unitario, desconto_percentual, subtotal)
    values (v_id, v_prod.id, v_qtd, v_preco, v_desc, round(v_qtd * v_preco * (1 - v_desc / 100), 2));
  end loop;

  update devolucoes set valor_total = (select coalesce(sum(subtotal), 0) from devolucao_itens where devolucao_id = v_id) where id = v_id;
  return v_id;
end $$;
revoke execute on function public.salvar_devolucao(uuid, uuid, uuid, uuid, date, text, text, text, text, int, text, jsonb) from public, anon;
grant execute on function public.salvar_devolucao(uuid, uuid, uuid, uuid, date, text, text, text, text, int, text, jsonb) to authenticated;
