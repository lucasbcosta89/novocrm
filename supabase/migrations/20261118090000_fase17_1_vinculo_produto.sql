-- FASE 17.1 — Vínculo de produto, integridade de exclusão e comissão de item órfão.
-- Decisões do usuário (item A):
--  A.1 FK pedido_itens.produto_id estava NO ACTION (nunca CASCADE): passa a ON DELETE SET NULL (rede de segurança);
--      a exclusão de produto em uso (pedidos, oportunidades, devoluções) é BLOQUEADA no servidor com oferta de desativar.
--      Nenhum dado existente muda (nenhum item sem produto antes desta migration).
--  A.2 produtos.ativo JÁ EXISTE (reutilizado; nenhum produto alterado).
--  A.3 desconto máximo em cascata COMPLETA: produto (tabelas_preco.desconto_max > 0, tabela do cliente > padrão)
--      → representada (representadas.desconto_max > 0, novo) → padrão do usuário (usuarios.desconto_max_padrao, novo,
--      default 10) → 10. Pedido importado continua isento de desconto/preço (Fase 19 B.8).
--  A.4 Fase 21 ainda não aplicada: a exceção de recálculo (item E) nasce aqui como o ÚNICO ponto autorizado.
--  Snapshot: colunas novas sku_informado/descricao_informada (sku_planilha copiado e mantido só como legado).
-- Pendência: o MESMO campo pedido_itens.pendencia ('produto_nao_cadastrado') da Fase 17, agora para QUALQUER origem.

-- ---------- B.1: FK SET NULL ----------
alter table pedido_itens drop constraint pedido_itens_produto_id_fkey;
alter table pedido_itens add constraint pedido_itens_produto_id_fkey foreign key (produto_id) references produtos(id) on delete set null;

-- ---------- B.3: snapshot do item informado ----------
alter table pedido_itens
  add column sku_informado text constraint pedido_itens_sku_informado_check check (sku_informado is null or length(sku_informado) <= 60),
  add column descricao_informada text constraint pedido_itens_descricao_informada_check check (descricao_informada is null or length(descricao_informada) <= 200),
  add column linha_planilha int,
  -- de onde veio o PERCENTUAL do item (null = item legado, anterior à 17.1; nunca recalculado por isso)
  add column origem_calculo text constraint pedido_itens_origem_calculo_check check (origem_calculo in ('representada', 'catalogo', 'manual', 'zero'));
update pedido_itens set sku_informado = sku_planilha where sku_planilha is not null;
update pedido_itens set descricao_informada = left(descricao, 200) where produto_id is null and descricao is not null;

-- ---------- B.4: índices ----------
create index if not exists pedido_itens_produto_idx on pedido_itens (produto_id);
create index if not exists pedidos_user_origem_idx on pedidos (user_id, origem);
drop index if exists pedido_itens_pendentes_idx;
create index pedido_itens_pendentes_idx on pedido_itens (sku_informado) where pendencia = 'produto_nao_cadastrado';

-- ---------- F: desconto máximo em cascata ----------
alter table representadas add column desconto_max numeric(5,2)
  constraint representadas_desconto_max_check check (desconto_max between 0 and 100);
alter table usuarios add column desconto_max_padrao numeric(5,2) not null default 10
  constraint usuarios_desconto_max_padrao_check check (desconto_max_padrao between 0 and 100);
-- usuarios tem grants por coluna: o próprio usuário lê e altera só este campo (RLS usuarios_proprio_*)
grant select (desconto_max_padrao), update (desconto_max_padrao) on usuarios to authenticated;

-- ORDEM (espelho de resolverDescontoMaximo em lib/desconto.ts): produto (> 0; tabela do cliente > padrão) →
-- representada (> 0) → padrão do usuário → 10. Item sem produto pula o primeiro nível: a checagem NUNCA deixa de rodar.
create or replace function resolver_desconto_max(p_user uuid, p_produto uuid, p_cliente uuid, p_representada uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select nullif(tp.desconto_max, 0) from tabelas_preco tp
      where p_produto is not null and tp.produto_id = p_produto and (tp.cliente_id = p_cliente or tp.cliente_id is null)
      order by tp.cliente_id nulls last limit 1),
    (select nullif(r.desconto_max, 0) from representadas r where r.id = p_representada),
    (select u.desconto_max_padrao from usuarios u where u.id = p_user),
    10)::numeric
$$;

-- ---------- D: origem do percentual (representada > catálogo > zero; item sem produto: catálogo nulo) ----------
create or replace function origem_comissao(p_catalogo numeric, p_representada numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when coalesce(p_representada, 0) > 0 then 'representada'
              when coalesce(p_catalogo, 0) > 0 then 'catalogo'
              else 'zero' end
$$;

-- item gravado sem % (importação, catálogo público, item sem produto): aplica a precedência. Item sem produto usa a
-- comissão da REPRESENTADA do pedido (D.1 b) e só fica 0 quando ela também está vazia (D.1 c). Nunca zera por falta de produto.
create or replace function pedido_itens_comissao_efetiva()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cat numeric;
  v_rep numeric;
begin
  if new.comissao_percentual is null then
    select r.comissao_percentual into v_rep from pedidos pe join representadas r on r.id = pe.representada_id where pe.id = new.pedido_id;
    if new.produto_id is not null then select comissao into v_cat from produtos where id = new.produto_id; end if;
    new.comissao_percentual := resolver_comissao_pct(v_cat, v_rep);
    new.origem_calculo := coalesce(new.origem_calculo, origem_comissao(v_cat, v_rep));
  end if;
  if new.comissao_valor is null then
    new.comissao_valor := round(new.subtotal * new.comissao_percentual / 100, 2);
  end if;
  return new;
end $$;

-- ---------- C: pendência independente de origem (REGRA ÚNICA) ----------
-- item com produto_id NULL é pendência SEMPRE (importado ou lançado na plataforma); vinculou → a pendência some.
create or replace function pedido_itens_pendencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.pendencia := case when new.produto_id is null then 'produto_nao_cadastrado' end;
  return new;
end $$;
create trigger pedido_itens_pendencia before insert or update of produto_id, pendencia on pedido_itens
  for each row execute function pedido_itens_pendencia();

-- selo vermelho da listagem (pedidos.tem_pendencias) acompanha os itens
create or replace function pedido_itens_tem_pendencias()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_ped uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update pedidos p
     set tem_pendencias = exists (select 1 from pedido_itens x where x.pedido_id = p.id and x.pendencia = 'produto_nao_cadastrado')
   where p.id = v_ped
     and p.tem_pendencias is distinct from exists (select 1 from pedido_itens x where x.pedido_id = p.id and x.pendencia = 'produto_nao_cadastrado');
  return null;
end $$;
create trigger pedido_itens_tem_pendencias after insert or delete or update of produto_id, pendencia on pedido_itens
  for each row execute function pedido_itens_tem_pendencias();

-- C.2: registro reutilizável pelos dois fluxos (formulário manual e importação): snapshot + pendência no pedido.
-- p_dados: { sku, descricao, linha }.
create or replace function registrar_pendencia_produto_nao_vinculado(p_pedido_id uuid, p_item_id uuid, p_dados jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update pedido_itens
     set sku_informado = coalesce(nullif(left(btrim(p_dados->>'sku'), 60), ''), sku_informado),
         descricao_informada = coalesce(nullif(left(btrim(p_dados->>'descricao'), 200), ''), descricao_informada),
         linha_planilha = coalesce((p_dados->>'linha')::int, linha_planilha),
         pendencia = 'produto_nao_cadastrado'
   where id = p_item_id and pedido_id = p_pedido_id and produto_id is null;
  if not found then raise exception 'Item sem produto não encontrado no pedido'; end if;
end $$;

-- ---------- Completude da comissão do pedido (Fase 20 + D.3) ----------
-- incompleta: item da planilha com comissão vazia/zerada (Fase 20) OU item SEM produto cuja comissão caiu em zero
-- (representada vazia — D.3). Motivo 'comissao_nao_definida' quando algum desses ficou com valor 0.
create or replace function avaliar_completude_comissao(p_pedido_id uuid, out completude text, out motivo text)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_ausente boolean;
  v_sem_valor boolean;
  v_zero_sem_produto boolean;
begin
  select coalesce(bool_or(comissao_planilha_ausente), false),
         coalesce(bool_or(comissao_planilha_ausente and comissao_valor <= 0), false),
         coalesce(bool_or(produto_id is null and origem_calculo = 'zero' and comissao_origem <> 'planilha'), false)
    into v_ausente, v_sem_valor, v_zero_sem_produto
    from pedido_itens where pedido_id = p_pedido_id;
  if not (v_ausente or v_zero_sem_produto) then
    completude := 'completa'; motivo := null;
  else
    completude := 'incompleta';
    motivo := case when v_zero_sem_produto or v_sem_valor then 'comissao_nao_definida' else 'comissao_zero_na_planilha' end;
  end if;
end $$;

-- ---------- emissão ----------
create or replace function confirmar_pedido(p_pedido_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped pedidos%rowtype;
  v_rep numeric;
  v_total numeric(12,2);
  v_com numeric(12,2);
  v_c record;
begin
  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_ped.status <> 'rascunho' then raise exception 'Só pedidos em rascunho podem ser confirmados'; end if;
  select comissao_percentual into v_rep from representadas where id = v_ped.representada_id;

  -- precedência (Fase 19) para todos os itens; item sem produto usa a representada (D); planilha > 0 prevalece (Fase 20)
  update pedido_itens i
     set comissao_percentual = x.pct,
         origem_calculo = x.origem,
         comissao_valor = case when i.comissao_origem = 'planilha' then i.comissao_valor else round(i.subtotal * x.pct / 100, 2) end
    from (select i2.id, resolver_comissao_pct(p.comissao, v_rep) as pct, origem_comissao(p.comissao, v_rep) as origem
            from pedido_itens i2 left join produtos p on p.id = i2.produto_id
           where i2.pedido_id = p_pedido_id and coalesce(i2.origem_calculo, '') <> 'manual') x
   where x.id = i.id;

  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com
    from pedido_itens where pedido_id = p_pedido_id;
  if v_total <= 0 then raise exception 'Pedido sem itens'; end if;
  select * into v_c from avaliar_completude_comissao(p_pedido_id);

  update pedidos set status = 'confirmado', valor_total = v_total, comissao_total = v_com where id = p_pedido_id;

  insert into cliente_representada (cliente_id, representada_id)
  values (v_ped.cliente_id, v_ped.representada_id) on conflict do nothing;

  insert into comissoes (user_id, representada_id, pedido_id, percentual, valor, status, data_prevista, completude, motivo_analise)
  values (
    v_ped.user_id, v_ped.representada_id, p_pedido_id,
    round(v_com / v_total * 100, 2), v_com,
    case when v_c.completude = 'incompleta' then 'pendente_analise' else 'a_receber' end,
    (date_trunc('month', v_ped.data at time zone 'America/Sao_Paulo') + interval '1 month' - interval '1 second')
      at time zone 'America/Sao_Paulo',
    v_c.completude, v_c.motivo
  );

  if auth.uid() is not null then perform recalcular_alertas_pedido(p_pedido_id); end if;
end $$;

-- ---------- criação (formulário manual): item com OU sem produto ----------
-- Item sem produto: { produto_id: null, descricao_informada (obrigatória, até 200), sku_informado (opcional),
-- quantidade, preco_unitario, desconto_percentual, acrescimo_percentual }. NÃO bloqueia a emissão (C.3).
create or replace function criar_pedido(
  p_representada_id uuid, p_cliente_id uuid, p_itens jsonb, p_forma_pagamento text default null, p_confirmar boolean default false,
  p_id uuid default null, p_prazo_tipo text default 'a_vista', p_prazo_dias integer default null, p_codigo text default null,
  p_data_faturamento date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_rep_com numeric;
  v_preco numeric(12,2);
  v_qtd numeric(12,3);
  v_desc numeric(5,2);
  v_acr numeric(5,2);
  v_descr text;
  v_sku text;
  v_rotulo text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_id is not null and exists (select 1 from pedidos where id = p_id) then return p_id; end if;
  select comissao_percentual into v_rep_com from representadas where id = p_representada_id;
  if not found then raise exception 'Representada não encontrada'; end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then raise exception 'Cliente não encontrado'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  if coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' and coalesce(p_prazo_dias, 0) < 1 then
    raise exception 'Informe o prazo em dias';
  end if;

  insert into pedidos (id, user_id, representada_id, cliente_id, numero, codigo_pedido, codigo_gerado, status, forma_pagamento, prazo_tipo, prazo_dias, origem, data_faturamento)
  values (
    coalesce(p_id, gen_random_uuid()), v_uid, p_representada_id, p_cliente_id,
    proximo_numero_pedido(v_uid),
    nullif(btrim(p_codigo), ''), nullif(btrim(p_codigo), '') is null,
    'rascunho', nullif(trim(p_forma_pagamento), ''), coalesce(p_prazo_tipo, 'a_vista'),
    case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end, 'app', p_data_faturamento
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
    v_acr := coalesce((v_item->>'acrescimo_percentual')::numeric, 0);
    v_qtd := (v_item->>'quantidade')::numeric;

    if nullif(v_item->>'produto_id', '') is null then
      -- C.3: item sem produto
      v_descr := nullif(btrim(v_item->>'descricao_informada'), '');
      v_sku := nullif(btrim(v_item->>'sku_informado'), '');
      if v_descr is null then raise exception 'Informe a descrição do item sem produto'; end if;
      if length(v_descr) > 200 then raise exception 'Descrição do item: máximo de 200 caracteres'; end if;
      if length(coalesce(v_sku, '')) > 60 then raise exception 'SKU do item: máximo de 60 caracteres'; end if;
      v_rotulo := v_descr;
      v_preco := (v_item->>'preco_unitario')::numeric;
      if v_preco is null or v_preco < 0 then raise exception 'Preço inválido para %', v_rotulo; end if;
      v_prod := null;
    else
      select * into v_prod from produtos
       where id = (v_item->>'produto_id')::uuid and representada_id = p_representada_id;
      if not found then raise exception 'Produto não pertence à representada'; end if;
      if not v_prod.ativo then raise exception 'Produto inativo: %', v_prod.nome; end if;
      v_rotulo := v_prod.nome; v_descr := null; v_sku := null;
      v_preco := null;
      select tp.preco into v_preco from tabelas_preco tp
       where tp.produto_id = v_prod.id and (tp.cliente_id = p_cliente_id or tp.cliente_id is null)
       order by tp.cliente_id nulls last limit 1;
      v_preco := coalesce(v_preco, v_prod.preco);
    end if;

    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para %', v_rotulo; end if;
    if v_desc < 0 or v_desc > 100 then raise exception 'Desconto inválido para %', v_rotulo; end if;
    if v_acr < 0 or v_acr > 100 then raise exception 'Acréscimo inválido para %', v_rotulo; end if;

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                              desconto_acima_max, subtotal, comissao_percentual, origem_calculo, sku_informado, descricao_informada)
    values (v_id, v_prod.id, coalesce(v_prod.nome, v_descr), v_qtd, v_preco, v_desc, v_acr,
            v_desc > resolver_desconto_max(v_uid, v_prod.id, p_cliente_id, p_representada_id),
            round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2),
            resolver_comissao_pct(v_prod.comissao, v_rep_com), origem_comissao(v_prod.comissao, v_rep_com), v_sku, v_descr)
    returning id into v_item_id;
    if v_prod.id is null then
      perform registrar_pendencia_produto_nao_vinculado(v_id, v_item_id, jsonb_build_object('sku', v_sku, 'descricao', v_descr));
    end if;
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;

  if p_confirmar then perform confirmar_pedido(v_id); else perform recalcular_alertas_pedido(v_id); end if;
  return v_id;
end $$;

-- ---------- edição: itens com produto (por produto_id) e sem produto (por item_id; novos sem id) ----------
create or replace function editar_pedido(
  p_pedido_id uuid, p_itens jsonb, p_forma_pagamento text default null, p_prazo_tipo text default 'a_vista',
  p_prazo_dias integer default null, p_codigo text default null, p_data_faturamento date default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped pedidos%rowtype;
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_prod produtos%rowtype;
  v_rep_com numeric;
  v_antigos jsonb;
  v_avulsos jsonb;
  v_ant jsonb;
  v_item_id uuid;
  v_preco numeric(12,2);
  v_qtd numeric(12,3);
  v_desc numeric(5,2);
  v_acr numeric(5,2);
  v_pct numeric(5,2);
  v_ocalc text;
  v_sub numeric(12,2);
  v_val numeric(12,2);
  v_origem text;
  v_descr text;
  v_sku text;
  v_rotulo text;
  v_total numeric(12,2);
  v_com numeric(12,2);
  v_confirmado boolean;
  v_c record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_ped.status = 'cancelado' then raise exception 'Pedido cancelado não pode ser editado'; end if;
  if exists (select 1 from comissoes where pedido_id = p_pedido_id and status = 'recebida') then
    raise exception 'Comissão já recebida: pedido não pode ser editado';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  if coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' and coalesce(p_prazo_dias, 0) < 1 then
    raise exception 'Informe o prazo em dias';
  end if;
  v_confirmado := v_ped.status <> 'rascunho';
  select comissao_percentual into v_rep_com from representadas where id = v_ped.representada_id;

  -- % já gravado de cada item é mantido (nunca recalcular comissão de item gravado); valor da planilha também
  -- enquanto o subtotal não mudar
  select coalesce(jsonb_object_agg(produto_id::text, jsonb_build_object(
           'pct', comissao_percentual, 'valor', comissao_valor, 'sub', subtotal, 'origem', comissao_origem,
           'ausente', comissao_planilha_ausente, 'ocalc', origem_calculo)) filter (where produto_id is not null), '{}'::jsonb),
         coalesce(jsonb_object_agg(id::text, jsonb_build_object(
           'pct', comissao_percentual, 'valor', comissao_valor, 'sub', subtotal, 'origem', comissao_origem,
           'ausente', comissao_planilha_ausente, 'ocalc', origem_calculo, 'linha', linha_planilha)) filter (where produto_id is null), '{}'::jsonb)
    into v_antigos, v_avulsos
    from pedido_itens where pedido_id = p_pedido_id;
  delete from pedido_itens where pedido_id = p_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
    v_acr := coalesce((v_item->>'acrescimo_percentual')::numeric, 0);

    if nullif(v_item->>'produto_id', '') is null then
      v_descr := nullif(btrim(v_item->>'descricao_informada'), '');
      v_sku := nullif(btrim(v_item->>'sku_informado'), '');
      if v_descr is null then raise exception 'Informe a descrição do item sem produto'; end if;
      if length(v_descr) > 200 then raise exception 'Descrição do item: máximo de 200 caracteres'; end if;
      if length(coalesce(v_sku, '')) > 60 then raise exception 'SKU do item: máximo de 60 caracteres'; end if;
      v_rotulo := v_descr;
      v_prod := null;
      v_ant := v_avulsos->(v_item->>'item_id');
    else
      select * into v_prod from produtos
       where id = (v_item->>'produto_id')::uuid and representada_id = v_ped.representada_id;
      if not found then raise exception 'Produto não pertence à representada'; end if;
      if not v_prod.ativo and not (v_antigos ? v_prod.id::text) then raise exception 'Produto inativo: %', v_prod.nome; end if;
      v_rotulo := v_prod.nome; v_descr := null; v_sku := null;
      v_ant := v_antigos->v_prod.id::text;
    end if;

    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para %', v_rotulo; end if;
    if v_preco is null or v_preco < 0 then raise exception 'Preço inválido para %', v_rotulo; end if;
    if v_desc < 0 or v_desc > 100 then raise exception 'Desconto inválido para %', v_rotulo; end if;
    if v_acr < 0 or v_acr > 100 then raise exception 'Acréscimo inválido para %', v_rotulo; end if;

    v_pct := coalesce((v_ant->>'pct')::numeric, resolver_comissao_pct(v_prod.comissao, v_rep_com));
    v_ocalc := case when v_ant is not null then v_ant->>'ocalc' else origem_comissao(v_prod.comissao, v_rep_com) end;
    v_sub := round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2);
    if v_ant->>'origem' = 'planilha' and (v_ant->>'sub')::numeric = v_sub then
      v_origem := 'planilha';
      v_val := (v_ant->>'valor')::numeric;
    else
      v_origem := 'calculada';
      v_val := case when v_confirmado then round(v_sub * v_pct / 100, 2) else 0 end;
    end if;

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                              desconto_acima_max, subtotal, comissao_percentual, comissao_valor, comissao_origem, comissao_planilha_ausente,
                              origem_calculo, sku_informado, descricao_informada, linha_planilha)
    values (p_pedido_id, v_prod.id, coalesce(v_prod.nome, v_descr), v_qtd, v_preco, v_desc, v_acr,
            v_desc > resolver_desconto_max(v_ped.user_id, v_prod.id, v_ped.cliente_id, v_ped.representada_id), v_sub, v_pct,
            v_val, v_origem, coalesce((v_ant->>'ausente')::boolean, false), v_ocalc, v_sku, v_descr, (v_ant->>'linha')::int)
    returning id into v_item_id;
    if v_prod.id is null then
      perform registrar_pendencia_produto_nao_vinculado(p_pedido_id, v_item_id, jsonb_build_object('sku', v_sku, 'descricao', v_descr));
    end if;
  end loop;

  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com
    from pedido_itens where pedido_id = p_pedido_id;
  if v_confirmado and v_total <= 0 then raise exception 'Pedido sem itens'; end if;

  update pedidos
     set valor_total = v_total,
         comissao_total = case when v_confirmado then v_com else comissao_total end,
         forma_pagamento = nullif(trim(p_forma_pagamento), ''),
         prazo_tipo = coalesce(p_prazo_tipo, 'a_vista'),
         prazo_dias = case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end,
         codigo_pedido = case when not v_ped.codigo_gerado and nullif(btrim(p_codigo), '') is not null
                              then btrim(p_codigo) else codigo_pedido end,
         data_faturamento = p_data_faturamento
   where id = p_pedido_id;

  if v_confirmado then
    select * into v_c from avaliar_completude_comissao(p_pedido_id);
    update comissoes
       set valor = v_com, percentual = case when v_total > 0 then round(v_com / v_total * 100, 2) else 0 end,
           completude = v_c.completude, motivo_analise = v_c.motivo,
           status = case when v_c.completude = 'incompleta' then 'pendente_analise'
                         when status = 'pendente_analise' then 'a_receber' else status end
     where pedido_id = p_pedido_id and status <> 'cancelada';
  end if;

  perform recalcular_alertas_pedido(p_pedido_id);
end $$;

-- ---------- importação: snapshot em colunas próprias (C.6); regra de pendência inalterada ----------
create or replace function importar_pedidos(p_pedidos jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ped jsonb;
  v_item jsonb;
  v_id uuid;
  v_item_id uuid;
  v_n bigint;
  v_cod text;
  v_pend boolean;
  v_qtd numeric(12,3);
  v_preco numeric(12,2);
  v_desc numeric(5,2);
  v_acr numeric(5,2);
  v_com numeric(12,2);
  v_prazo int;
  v_ins int := 0;
  v_itens int := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' then raise exception 'Lote inválido'; end if;
  if jsonb_array_length(p_pedidos) > 5000 then raise exception 'Lote acima de 5.000 pedidos'; end if;

  v_n := substring(proximo_numero_pedido(v_uid) from 2)::bigint - 1;
  for v_ped in select * from jsonb_array_elements(p_pedidos) loop
    v_n := v_n + 1;
    v_cod := nullif(btrim(v_ped->>'codigo'), '');
    v_prazo := (v_ped->>'prazo_dias')::int;
    v_pend := exists (select 1 from jsonb_array_elements(v_ped->'itens') i where nullif(i->>'produto_id', '') is null);
    insert into pedidos (user_id, representada_id, cliente_id, numero, codigo_pedido, codigo_gerado, data, status,
                         forma_pagamento, prazo_tipo, prazo_dias, origem, observacoes, tem_pendencias)
    values (v_uid, (v_ped->>'representada_id')::uuid, (v_ped->>'cliente_id')::uuid, 'P' || lpad(v_n::text, 6, '0'),
            v_cod, v_cod is null, (v_ped->>'data')::date::timestamptz + interval '12 hours', 'rascunho',
            nullif(v_ped->>'forma_pagamento', ''), case when v_prazo is null then 'a_vista' else 'a_prazo' end, v_prazo,
            'importacao', nullif(left(btrim(v_ped->>'observacoes'), 500), ''), v_pend)
    returning id into v_id;

    for v_item in select * from jsonb_array_elements(v_ped->'itens') loop
      v_qtd := (v_item->>'quantidade')::numeric;
      v_preco := (v_item->>'preco_unitario')::numeric;
      v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
      v_acr := coalesce((v_item->>'acrescimo_percentual')::numeric, 0);
      v_com := nullif((v_item->>'comissao_valor')::numeric, 0);  -- zero = ausência (nunca aceito)
      if v_com is not null and v_com < 0 then raise exception 'Comissão negativa no lote'; end if;
      insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                                subtotal, comissao_percentual, comissao_valor, comissao_origem, comissao_planilha_ausente,
                                sku_informado, descricao_informada, linha_planilha)
      values (v_id, nullif(v_item->>'produto_id', '')::uuid, nullif(left(btrim(v_item->>'descricao'), 200), ''), v_qtd, v_preco, v_desc, v_acr,
              round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2), null, v_com,
              case when v_com is not null then 'planilha' else 'calculada' end,
              v_com is null and coalesce((v_item->>'comissao_ausente')::boolean, false),
              nullif(left(btrim(v_item->>'sku'), 60), ''), nullif(left(btrim(v_item->>'descricao'), 200), ''), (v_item->>'linha')::int)
      returning id, produto_id is null into v_item_id, v_pend;
      if v_pend then
        perform registrar_pendencia_produto_nao_vinculado(v_id, v_item_id,
          jsonb_build_object('sku', v_item->>'sku', 'descricao', v_item->>'descricao', 'linha', v_item->>'linha'));
      end if;
      v_itens := v_itens + 1;
    end loop;

    update pedidos set valor_total = (select coalesce(sum(subtotal), 0) from pedido_itens where pedido_id = v_id) where id = v_id;
    -- Fase 17 (inalterado): pedido com produto pendente fica em rascunho
    if not (select tem_pendencias from pedidos where id = v_id) and (select valor_total from pedidos where id = v_id) > 0 then
      perform confirmar_pedido(v_id);
    else
      perform recalcular_alertas_pedido(v_id);
    end if;
    v_ins := v_ins + 1;
  end loop;
  return jsonb_build_object('inseridas', v_ins, 'atualizadas', 0, 'itens', v_itens);
end $$;

-- ---------- alertas: desconto em cascata para QUALQUER item de pedido manual (com ou sem produto) ----------
-- preço só com produto (não há catálogo a comparar); alertas de comissão só com produto (D.4: item sem produto
-- nunca gera 'comissao_catalogo_sem_representada' nem 'comissao_nao_definida' — a completude da comissão cobre).
create or replace function recalcular_alertas_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped pedidos%rowtype;
  v_rep_com numeric;
  v_manual boolean;
  r record;
  v_desc_max numeric;
  v_preco_cat numeric;
  v_prod_txt text;
  v_chaves text[] := '{}';
  v_resolvidos int := 0;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into v_ped from pedidos where id = p_pedido_id;
  if not found then raise exception 'Pedido não encontrado'; end if;
  v_manual := v_ped.origem <> 'importacao';
  select comissao_percentual into v_rep_com from representadas where id = v_ped.representada_id;

  if v_ped.status <> 'cancelado' then
    for r in
      select i.id, i.produto_id, i.preco_unitario, i.desconto_percentual, i.comissao_percentual, i.comissao_origem,
             p.comissao as com_cat, p.preco as preco_prod
        from pedido_itens i left join produtos p on p.id = i.produto_id
       where i.pedido_id = p_pedido_id
       order by i.desconto_percentual
    loop
      v_prod_txt := coalesce(r.produto_id::text, '');
      if v_manual then
        v_desc_max := resolver_desconto_max(v_ped.user_id, r.produto_id, v_ped.cliente_id, v_ped.representada_id);
        if r.desconto_percentual > v_desc_max then
          perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'desconto_acima_limite',
            jsonb_build_object('produto_id', r.produto_id, 'desconto_aplicado', r.desconto_percentual, 'desconto_maximo', v_desc_max));
          v_chaves := v_chaves || (v_prod_txt || '|desconto_acima_limite');
        end if;
        if r.produto_id is not null then
          v_preco_cat := null;
          select tp.preco into v_preco_cat from tabelas_preco tp
           where tp.produto_id = r.produto_id and (tp.cliente_id = v_ped.cliente_id or tp.cliente_id is null)
           order by tp.cliente_id nulls last limit 1;
          v_preco_cat := coalesce(v_preco_cat, r.preco_prod);
          if coalesce(v_preco_cat, 0) > 0 and abs(r.preco_unitario - v_preco_cat) >= 0.005 then
            perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'preco_divergente',
              jsonb_build_object('produto_id', r.produto_id, 'preco_praticado', r.preco_unitario, 'preco_catalogo', v_preco_cat));
            v_chaves := v_chaves || (v_prod_txt || '|preco_divergente');
          end if;
        end if;
      end if;

      if r.produto_id is null then continue; end if;
      if coalesce(v_rep_com, 0) <= 0 and coalesce(r.com_cat, 0) > 0 then
        perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'comissao_catalogo_sem_representada',
          jsonb_build_object('produto_id', r.produto_id, 'representada_id', v_ped.representada_id, 'comissao_representada', v_rep_com,
                             'comissao_catalogo', r.com_cat, 'origem_escolhida', 'catalogo'));
        v_chaves := v_chaves || (v_prod_txt || '|comissao_catalogo_sem_representada');
      elsif coalesce(v_rep_com, 0) <= 0 and coalesce(r.com_cat, 0) <= 0 and coalesce(r.comissao_percentual, 0) <= 0
            and r.comissao_origem <> 'planilha' then
        perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'comissao_nao_definida',
          jsonb_build_object('produto_id', r.produto_id, 'representada_id', v_ped.representada_id, 'comissao_representada', v_rep_com,
                             'comissao_catalogo', r.com_cat, 'origem_escolhida', 'zero'));
        v_chaves := v_chaves || (v_prod_txt || '|comissao_nao_definida');
      end if;
    end loop;
  end if;

  update alertas_pedido set status = 'resolvido_auto', resolvido_em = now()
   where pedido_id = p_pedido_id and status = 'pendente'
     and (coalesce(produto_id::text, '') || '|' || tipo) <> all (v_chaves);
  get diagnostics v_resolvidos = row_count;
  return jsonb_build_object('ativos', cardinality(v_chaves), 'resolvidos', v_resolvidos);
end $$;

-- ---------- E: RECÁLCULO ÚNICO AO VINCULAR ----------
-- ÚNICO PONTO AUTORIZADO A RECALCULAR COMISSÃO DE ITEM JÁ GRAVADO (exceção explícita da Fase 17.1 E).
-- Chamado SÓ por vincular_item_produto (link "Cadastrar produto" do pedido e "Vincular produto" do Catálogo).
-- Preserva (só a pendência é limpa): comissão do pedido 'recebida' (ou cancelada) e item com origem_calculo='manual'.
-- Planilha > 0 continua prevalecendo (valor mantido; só o % e a origem são atualizados).
create or replace function recalcular_comissao_item_vinculado(p_item_id uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item pedido_itens%rowtype;
  v_ped pedidos%rowtype;
  v_cat numeric;
  v_rep numeric;
  v_pct numeric;
  v_origem text;
  v_total numeric(12,2);
  v_com numeric(12,2);
  v_c record;
begin
  select * into v_item from pedido_itens where id = p_item_id for update;
  if not found or v_item.produto_id is null then raise exception 'Item sem produto vinculado'; end if;
  select * into v_ped from pedidos where id = v_item.pedido_id;
  if v_ped.status = 'cancelado' or coalesce(v_item.origem_calculo, '') = 'manual'
     or exists (select 1 from comissoes where pedido_id = v_ped.id and status = 'recebida') then
    return 'preservado';
  end if;
  select comissao into v_cat from produtos where id = v_item.produto_id;
  select comissao_percentual into v_rep from representadas where id = v_ped.representada_id;
  v_pct := resolver_comissao_pct(v_cat, v_rep);
  v_origem := origem_comissao(v_cat, v_rep);

  if v_ped.status = 'rascunho' then
    -- valor em R$ só nasce na emissão (confirmar_pedido)
    update pedido_itens set comissao_percentual = v_pct, origem_calculo = v_origem where id = p_item_id;
    return 'recalculado';
  end if;

  update pedido_itens
     set comissao_percentual = v_pct, origem_calculo = v_origem,
         comissao_valor = case when comissao_origem = 'planilha' then comissao_valor else round(subtotal * v_pct / 100, 2) end
   where id = p_item_id;
  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com from pedido_itens where pedido_id = v_ped.id;
  update pedidos set comissao_total = v_com where id = v_ped.id;
  select * into v_c from avaliar_completude_comissao(v_ped.id);
  update comissoes
     set valor = v_com, percentual = case when v_total > 0 then round(v_com / v_total * 100, 2) else 0 end,
         completude = v_c.completude, motivo_analise = v_c.motivo,
         status = case when v_c.completude = 'incompleta' then 'pendente_analise'
                       when status = 'pendente_analise' then 'a_receber' else status end
   where pedido_id = v_ped.id and status not in ('recebida', 'cancelada');
  return 'recalculado';
end $$;

-- vínculo de UM item (idempotente: o mesmo produto de novo = nada muda)
create or replace function vincular_item_produto(p_item_id uuid, p_produto_id uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item pedido_itens%rowtype;
  v_prod produtos%rowtype;
  v_rep uuid;
  v_res text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into v_item from pedido_itens where id = p_item_id for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if v_item.produto_id = p_produto_id then return 'ja_vinculado'; end if;
  if v_item.produto_id is not null then raise exception 'Item já vinculado a outro produto'; end if;
  select * into v_prod from produtos where id = p_produto_id;
  if not found then raise exception 'Produto não encontrado'; end if;
  select representada_id into v_rep from pedidos where id = v_item.pedido_id;
  if v_rep <> v_prod.representada_id then raise exception 'Produto de outra representada'; end if;
  update pedido_itens set produto_id = v_prod.id, descricao = coalesce(descricao, v_prod.nome) where id = p_item_id; -- trigger limpa a pendência
  v_res := recalcular_comissao_item_vinculado(p_item_id);
  perform recalcular_alertas_pedido(v_item.pedido_id);
  return v_res;
end $$;

-- vínculo por SKU (cadastro do produto no Catálogo / "Vincular produto"): todos os itens pendentes da MESMA
-- representada com o mesmo SKU informado. Devolve as contagens (preservados = comissão recebida/manual).
drop function if exists vincular_produto_pendente(uuid);
create function vincular_produto_pendente(p_produto_id uuid, p_itens uuid[] default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_prod produtos%rowtype;
  v_item uuid;
  v_res text;
  v_vinc int := 0;
  v_rec int := 0;
  v_pres int := 0;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into v_prod from produtos where id = p_produto_id;
  if not found then raise exception 'Produto não encontrado'; end if;
  for v_item in
    select i.id from pedido_itens i join pedidos p on p.id = i.pedido_id
     where p.representada_id = v_prod.representada_id and i.produto_id is null
       and (coalesce(i.sku_informado, i.sku_planilha) = v_prod.sku or i.id = any (coalesce(p_itens, '{}')))
     order by i.id
  loop
    v_res := vincular_item_produto(v_item, p_produto_id);
    if v_res <> 'ja_vinculado' then v_vinc := v_vinc + 1; end if;
    if v_res = 'recalculado' then v_rec := v_rec + 1; elsif v_res = 'preservado' then v_pres := v_pres + 1; end if;
  end loop;
  return jsonb_build_object('vinculados', v_vinc, 'recalculados', v_rec, 'preservados', v_pres);
end $$;

-- ---------- G: uso dos produtos (confirmação de desativar / bloqueio de exclusão) ----------
create or replace function uso_produtos(p_representada_id uuid)
returns table (produto_id uuid, pedidos bigint, oportunidades bigint, devolucoes bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.id,
         (select count(distinct i.pedido_id) from pedido_itens i where i.produto_id = p.id),
         (select count(*) from oportunidade_produtos o where o.produto_id = p.id),
         (select count(*) from devolucao_itens d where d.produto_id = p.id)
    from produtos p where p.representada_id = p_representada_id
$$;

revoke execute on function resolver_desconto_max(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function resolver_desconto_max(uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function origem_comissao(numeric, numeric) from public, anon;
grant execute on function origem_comissao(numeric, numeric) to authenticated;
revoke execute on function registrar_pendencia_produto_nao_vinculado(uuid, uuid, jsonb) from public, anon;
grant execute on function registrar_pendencia_produto_nao_vinculado(uuid, uuid, jsonb) to authenticated;
revoke execute on function avaliar_completude_comissao(uuid) from public, anon;
grant execute on function avaliar_completude_comissao(uuid) to authenticated;
revoke execute on function recalcular_comissao_item_vinculado(uuid) from public, anon;
grant execute on function recalcular_comissao_item_vinculado(uuid) to authenticated;
revoke execute on function vincular_item_produto(uuid, uuid) from public, anon;
grant execute on function vincular_item_produto(uuid, uuid) to authenticated;
revoke execute on function vincular_produto_pendente(uuid, uuid[]) from public, anon;
grant execute on function vincular_produto_pendente(uuid, uuid[]) to authenticated;
revoke execute on function uso_produtos(uuid) from public, anon;
grant execute on function uso_produtos(uuid) to authenticated;
