-- ANÁLISES — Fase 1: fonte desnormalizada, índices e engine de pivot (whitelist fechada, RLS do usuário)

-- Fonte desnormalizada: 1 linha por item de pedido. security_invoker = as políticas RLS das tabelas
-- de origem valem para quem consulta (um representante nunca vê dados de outro).
create view analise_itens with (security_invoker = true) as
select
  i.id                                                   as item_id,
  p.id                                                   as pedido_id,
  p.numero,
  p.data,
  (p.data at time zone 'America/Sao_Paulo')::date       as data_dia,
  p.status,
  p.origem                                               as canal,
  p.representada_id,
  r.nome                                                 as representada_nome,
  p.cliente_id,
  c.nome                                                 as cliente_nome,
  c.uf,
  c.cidade,
  i.produto_id,
  coalesce(pr.nome, i.descricao)                         as produto_nome,
  pr.sku,
  pr.categoria,
  i.quantidade,
  round(i.quantidade * i.preco_unitario, 2)              as valor_bruto,
  round(i.quantidade * i.preco_unitario, 2) - i.subtotal as valor_desconto,
  i.subtotal                                             as valor_liquido
from pedido_itens i
join pedidos p on p.id = i.pedido_id
join representadas r on r.id = p.representada_id
left join clientes c on c.id = p.cliente_id
left join produtos pr on pr.id = i.produto_id;

-- Índices compostos (data fica no cabeçalho do pedido; o item liga produto ao pedido)
create index if not exists pedidos_representada_data_idx on pedidos (representada_id, data);
create index if not exists pedidos_cliente_data_idx on pedidos (cliente_id, data);
create index if not exists pedido_itens_produto_pedido_idx on pedido_itens (produto_id, pedido_id);

/*
  Engine de pivot. Recebe a AnaliseSpec (jsonb) e devolve o ResultadoAgregado (jsonb) numa ÚNICA consulta:
  - dimensões e métricas só pelas chaves da whitelist abaixo (expressões fixas; chave fora dela = erro);
  - valores do cliente (datas, ids, status, UF, canal) só como parâmetros ($1..$n), nunca concatenados;
  - GROUPING SETS ((dimensões), ()) devolve a linha de TOTAIS na mesma consulta: métricas não aditivas
    (ticket médio, preço médio, share…) são recalculadas no total, nunca somadas das linhas;
  - o período anterior equivalente vem na mesma varredura (FILTER), para variações sem dobrar o custo.
  security invoker: roda com as permissões (RLS) de quem chama.
*/
create function public.analise_pivot(p_spec jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_dims text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'dimensoes', '[]')));
  v_mets text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'metricas', '[]')));
  v_de date := (p_spec->'periodo'->>'de')::date;
  v_ate date := (p_spec->'periodo'->>'ate')::date;
  v_ant_de date;
  v_ant_ate date;
  v_limite int := least(greatest(coalesce((p_spec->>'limite')::int, 15), 1), 500);
  v_status text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'status', '[]')));
  v_reps uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'representada_id', '[]')) x);
  v_clis uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'cliente_id', '[]')) x);
  v_prods uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'produto_id', '[]')) x);
  v_ufs text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'uf', '[]')));
  v_canais text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'canal', '[]')));
  v_ord_campo text := coalesce(p_spec->'tabela'->'ordenacao'->>'campo', 'valor_liquido');
  v_ord_dir text := case when p_spec->'tabela'->'ordenacao'->>'direcao' = 'asc' then 'asc' else 'desc' end;
  v_base_cols text := '';
  v_grupo text := '';
  v_met_cols text := '';
  v_obj_linha text := '';
  v_obj_total text := '';
  v_ordem text;
  v_id text;
  v_rot text;
  v_expr text;
  d text;
  m text;
  i int := 0;
  v_sql text;
  v_res jsonb;
begin
  if v_de is null or v_ate is null or v_ate < v_de or v_ate - v_de > 1830 then
    raise exception 'Período inválido';
  end if;
  if coalesce(array_length(v_dims, 1), 0) not between 1 and 4 then raise exception 'Escolha de 1 a 4 dimensões'; end if;
  if coalesce(array_length(v_mets, 1), 0) not between 1 and 14 then raise exception 'Escolha de 1 a 14 métricas'; end if;
  v_ant_ate := v_de - 1;
  v_ant_de := v_de - (v_ate - v_de + 1);
  -- sem filtro de status = vendas (confirmados e entregues)
  if coalesce(array_length(v_status, 1), 0) = 0 then v_status := array['confirmado', 'entregue']; end if;

  -- DIMENSÕES (whitelist): chave → (id, rótulo)
  foreach d in array v_dims loop
    case d
      when 'representada' then v_id := 'representada_id::text'; v_rot := 'representada_nome';
      when 'cliente'      then v_id := 'cliente_id::text';      v_rot := 'cliente_nome';
      when 'produto'      then v_id := 'produto_id::text';      v_rot := 'produto_nome';
      when 'pedido'       then v_id := 'pedido_id::text';       v_rot := 'numero';
      when 'tempo'        then v_id := 'to_char(data_dia, ''YYYY-MM'')'; v_rot := 'to_char(data_dia, ''YYYY-MM'')';
      when 'status'       then v_id := 'status';                v_rot := 'status';
      when 'uf'           then v_id := 'coalesce(uf, ''—'')';    v_rot := 'coalesce(uf, ''—'')';
      when 'cidade'       then v_id := 'coalesce(cidade, ''—'')'; v_rot := 'coalesce(cidade, ''—'')';
      when 'canal'        then v_id := 'canal';                 v_rot := 'canal';
      when 'categoria'    then v_id := 'coalesce(categoria, ''Sem categoria'')'; v_rot := 'coalesce(categoria, ''Sem categoria'')';
      else raise exception 'Dimensão fora do catálogo';
    end case;
    if d = any(v_dims[1:i]) then raise exception 'Dimensão repetida'; end if;
    v_base_cols := v_base_cols || format('%s as k%s, %s as r%s, ', v_id, i, v_rot, i);
    v_grupo := v_grupo || format('k%s, r%s, ', i, i);
    v_obj_linha := v_obj_linha || format('%L, r%s, %L, k%s, ', d, i, d || '__id', i);
    i := i + 1;
  end loop;
  v_grupo := rtrim(v_grupo, ', ');

  -- MÉTRICAS (whitelist): expressão sobre a base, para o período atual (a) e o anterior (p)
  foreach m in array v_mets loop
    if (select count(*) from unnest(v_mets) x where x = m) > 1 then raise exception 'Métrica repetida'; end if;
    v_expr := case m
      when 'valor_liquido'        then 'round(coalesce(sum(valor_liquido) filter (where %1$s), 0), 2)'
      when 'valor_bruto'          then 'round(coalesce(sum(valor_bruto) filter (where %1$s), 0), 2)'
      when 'valor_desconto'       then 'round(coalesce(sum(valor_desconto) filter (where %1$s), 0), 2)'
      when 'quantidade'           then 'coalesce(sum(quantidade) filter (where %1$s), 0)'
      when 'numero_pedidos'       then 'count(distinct pedido_id) filter (where %1$s)'
      when 'ticket_medio'         then 'round(sum(valor_liquido) filter (where %1$s) / nullif(count(distinct pedido_id) filter (where %1$s), 0), 2)'
      when 'preco_medio'          then 'round(sum(valor_liquido) filter (where %1$s) / nullif(sum(quantidade) filter (where %1$s), 0), 2)'
      when 'itens_por_pedido'     then 'round(count(*) filter (where %1$s)::numeric / nullif(count(distinct pedido_id) filter (where %1$s), 0), 2)'
      when 'clientes_ativos'      then 'count(distinct cliente_id) filter (where %1$s)'
      when 'representadas_ativas' then 'count(distinct representada_id) filter (where %1$s)'
      when 'skus_ativos'          then 'count(distinct produto_id) filter (where %1$s)'
      when 'share'                then null  -- calculada sobre o total (abaixo)
      when 'variacao_percentual'  then null  -- atual × anterior (abaixo)
      else null
    end;
    if m not in ('valor_liquido','valor_bruto','valor_desconto','quantidade','numero_pedidos','ticket_medio','preco_medio',
                 'itens_por_pedido','clientes_ativos','representadas_ativas','skus_ativos','share','variacao_percentual') then
      raise exception 'Métrica fora do catálogo';
    end if;
    if v_expr is not null then
      v_met_cols := v_met_cols || format(v_expr, 'atual') || format(' as %I, ', m) || format(v_expr, 'not atual') || format(' as %I, ', m || '__ant');
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    else
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, ', m, m);
    end if;
  end loop;

  -- ordenação: só por chave de dimensão/métrica pedida (vira coluna conhecida); senão, valor líquido
  v_ordem := case
    when v_ord_campo = any(v_dims) then format('r%s', array_position(v_dims, v_ord_campo) - 1)
    when v_ord_campo = any(v_mets) then format('%I', v_ord_campo)
    else '__vl'
  end || ' ' || v_ord_dir || ' nulls last';

  v_sql := format($q$
    with base as (
      select %1$s data_dia >= $1 as atual, pedido_id, cliente_id, representada_id, produto_id, quantidade, valor_bruto, valor_desconto, valor_liquido
        from analise_itens
       where data_dia between $3 and $2
         and status = any($4)
         and (cardinality($5) = 0 or representada_id = any($5))
         and (cardinality($6) = 0 or cliente_id = any($6))
         and (cardinality($7) = 0 or produto_id = any($7))
         and (cardinality($8) = 0 or uf = any($8))
         and (cardinality($9) = 0 or canal = any($9))
    ),
    agg as (
      select %2$s, grouping(k0) as eh_total, %3$s
             round(coalesce(sum(valor_liquido) filter (where atual), 0), 2) as __vl,
             round(coalesce(sum(valor_liquido) filter (where not atual), 0), 2) as __vl_ant
        from base
       group by grouping sets ((%2$s), ())
    ),
    tot as (select * from agg where eh_total = 1),
    lin0 as (
      select a.*,
             round(a.__vl / nullif((select __vl from tot), 0) * 100, 1) as share,
             round((a.__vl - a.__vl_ant) / nullif(a.__vl_ant, 0) * 100, 1) as variacao_percentual
        from agg a where eh_total = 0 and (a.__vl <> 0 or a.__vl_ant <> 0)
    ),
    lin as (select l.*, row_number() over (order by %4$s) as __rn, count(*) over () as __n from lin0 l)
    select jsonb_build_object(
      'linhas', coalesce((select jsonb_agg(jsonb_build_object(%5$s) order by __rn) from lin where __rn <= %6$s), '[]'::jsonb),
      'totais', (select jsonb_build_object(%7$s '__vl', __vl, '__vl_ant', __vl_ant)
                   from (select t.*, case when t.__vl <> 0 then 100.0 end as share,
                                round((t.__vl - t.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) as variacao_percentual from tot t) x),
      'totalLinhas', coalesce((select max(__n) from lin), 0),
      'agrupouOutros', false,
      'geradoEm', now()
    )
  $q$, v_base_cols, v_grupo, v_met_cols, v_ordem, rtrim(v_obj_linha, ', '), v_limite, v_obj_total);

  execute v_sql into v_res using v_de, v_ate, v_ant_de, v_status, v_reps, v_clis, v_prods, v_ufs, v_canais;
  return v_res;
end $$;
revoke execute on function public.analise_pivot(jsonb) from public, anon;
grant execute on function public.analise_pivot(jsonb) to authenticated;
