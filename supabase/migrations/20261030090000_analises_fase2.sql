-- ANÁLISES — Fase 2: engine estendida para as abas Por Cliente, Por Produto e Por Pedido.
-- Continua UMA consulta, whitelist fechada e security invoker (RLS do usuário).
-- Novidades:
--  - dimensão "dia" (data do pedido, para a aba Por Pedido);
--  - métricas de histórico de cliente: ultima_compra, dias_sem_comprar, clientes_novos, clientes_em_risco
--    (quando pedidas, a base inclui todo o histórico até a data final; o período continua só no FILTER);
--  - classe_abc (A até 80% acumulado, B até 95%, C restante) e concentracao (share do top 10) — calculadas
--    sobre todos os grupos (window), não sobre as linhas exibidas;
--  - pedidos_cancelados (conta cancelados mesmo com o filtro padrão de status);
--  - granularidade "pedidos": dimensões de item (produto, categoria) recusadas e o filtro de produto passa a
--    selecionar PEDIDOS que contêm o produto (valor do pedido inteiro).

create or replace function public.analise_pivot(p_spec jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_dims text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'dimensoes', '[]')));
  v_mets text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'metricas', '[]')));
  v_de date := (p_spec->'periodo'->>'de')::date;
  v_ate date := (p_spec->'periodo'->>'ate')::date;
  v_ant_de date;
  v_ant_ate date;
  v_gran text := case when p_spec->>'granularidade' = 'pedidos' then 'pedidos' else 'itens' end;
  v_limite int := least(greatest(coalesce((p_spec->>'limite')::int, 15), 1), 500);
  v_status text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'status', '[]')));
  v_reps uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'representada_id', '[]')) x);
  v_clis uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'cliente_id', '[]')) x);
  v_prods uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'produto_id', '[]')) x);
  v_ufs text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'uf', '[]')));
  v_canais text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'canal', '[]')));
  v_ord_campo text := coalesce(p_spec->'tabela'->'ordenacao'->>'campo', 'valor_liquido');
  v_ord_dir text := case when p_spec->'tabela'->'ordenacao'->>'direcao' = 'asc' then 'asc' else 'desc' end;
  v_hist boolean;
  v_filtro text;
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
  if coalesce(array_length(v_dims, 1), 0) not between 1 and 6 then raise exception 'Escolha de 1 a 6 dimensões'; end if;
  if coalesce(array_length(v_mets, 1), 0) not between 1 and 20 then raise exception 'Escolha de 1 a 20 métricas'; end if;
  v_ant_ate := v_de - 1;
  v_ant_de := v_de - (v_ate - v_de + 1);
  -- sem filtro de status = vendas (confirmados e entregues)
  if coalesce(array_length(v_status, 1), 0) = 0 then v_status := array['confirmado', 'entregue']; end if;
  v_hist := v_mets && array['ultima_compra', 'dias_sem_comprar', 'clientes_novos', 'clientes_em_risco'];

  -- DIMENSÕES (whitelist): chave → (id, rótulo)
  foreach d in array v_dims loop
    case d
      when 'representada' then v_id := 'representada_id::text'; v_rot := 'representada_nome';
      when 'cliente'      then v_id := 'cliente_id::text';      v_rot := 'cliente_nome';
      when 'produto'      then v_id := 'produto_id::text';      v_rot := 'produto_nome';
      when 'pedido'       then v_id := 'pedido_id::text';       v_rot := 'numero';
      when 'tempo'        then v_id := 'to_char(data_dia, ''YYYY-MM'')'; v_rot := 'to_char(data_dia, ''YYYY-MM'')';
      when 'dia'          then v_id := 'to_char(data_dia, ''YYYY-MM-DD'')'; v_rot := 'to_char(data_dia, ''YYYY-MM-DD'')';
      when 'status'       then v_id := 'status';                v_rot := 'status';
      when 'uf'           then v_id := 'coalesce(uf, ''—'')';    v_rot := 'coalesce(uf, ''—'')';
      when 'cidade'       then v_id := 'coalesce(cidade, ''—'')'; v_rot := 'coalesce(cidade, ''—'')';
      when 'canal'        then v_id := 'canal';                 v_rot := 'canal';
      when 'categoria'    then v_id := 'coalesce(categoria, ''Sem categoria'')'; v_rot := 'coalesce(categoria, ''Sem categoria'')';
      else raise exception 'Dimensão fora do catálogo';
    end case;
    if d = any(v_dims[1:i]) then raise exception 'Dimensão repetida'; end if;
    if v_gran = 'pedidos' and d in ('produto', 'categoria') then
      raise exception 'Dimensão de item não disponível na granularidade Pedidos';
    end if;
    v_base_cols := v_base_cols || format('%s as k%s, %s as r%s, ', v_id, i, v_rot, i);
    v_grupo := v_grupo || format('k%s, r%s, ', i, i);
    v_obj_linha := v_obj_linha || format('%L, r%s, %L, k%s, ', d, i, d || '__id', i);
    i := i + 1;
  end loop;
  v_grupo := rtrim(v_grupo, ', ');

  -- MÉTRICAS (whitelist). %1$s = condição do período (per = 1 atual / per = 0 anterior); "incl" = status filtrado.
  foreach m in array v_mets loop
    if (select count(*) from unnest(v_mets) x where x = m) > 1 then raise exception 'Métrica repetida'; end if;
    v_expr := case m
      when 'valor_liquido'        then 'round(coalesce(sum(valor_liquido) filter (where %1$s and incl), 0), 2)'
      when 'valor_bruto'          then 'round(coalesce(sum(valor_bruto) filter (where %1$s and incl), 0), 2)'
      when 'valor_desconto'       then 'round(coalesce(sum(valor_desconto) filter (where %1$s and incl), 0), 2)'
      when 'quantidade'           then 'coalesce(sum(quantidade) filter (where %1$s and incl), 0)'
      when 'numero_pedidos'       then 'count(distinct pedido_id) filter (where %1$s and incl)'
      when 'ticket_medio'         then 'round(sum(valor_liquido) filter (where %1$s and incl) / nullif(count(distinct pedido_id) filter (where %1$s and incl), 0), 2)'
      when 'preco_medio'          then 'round(sum(valor_liquido) filter (where %1$s and incl) / nullif(sum(quantidade) filter (where %1$s and incl), 0), 2)'
      when 'itens_por_pedido'     then 'round(count(*) filter (where %1$s and incl)::numeric / nullif(count(distinct pedido_id) filter (where %1$s and incl), 0), 2)'
      when 'clientes_ativos'      then 'count(distinct cliente_id) filter (where %1$s and incl)'
      when 'representadas_ativas' then 'count(distinct representada_id) filter (where %1$s and incl)'
      when 'skus_ativos'          then 'count(distinct produto_id) filter (where %1$s and incl)'
      when 'pedidos_cancelados'   then 'count(distinct pedido_id) filter (where %1$s and status = ''cancelado'')'
      else null
    end;
    if m in ('clientes_novos', 'clientes_em_risco') then
      -- atual: situação na data final; anterior: situação na data final do período anterior
      v_met_cols := v_met_cols || case m
        when 'clientes_novos' then 'count(distinct cliente_id) filter (where incl and prim between $1 and $2) as clientes_novos, '
          || 'count(distinct cliente_id) filter (where incl and data_dia <= $10 and prim between $3 and $10) as clientes_novos__ant, '
        else 'count(distinct cliente_id) filter (where incl and ult < $2 - 90) as clientes_em_risco, '
          || 'count(distinct cliente_id) filter (where incl and data_dia <= $10 and ult_ant < $10 - 90) as clientes_em_risco__ant, ' end;
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('ultima_compra', 'dias_sem_comprar') then
      v_met_cols := v_met_cols || case m
        when 'ultima_compra'    then 'max(data_dia) filter (where incl) as ultima_compra, '
        else '($2 - max(data_dia) filter (where incl)) as dias_sem_comprar, ' end;
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, null, ', m);
    elsif v_expr is not null then
      v_met_cols := v_met_cols || format(v_expr, 'per = 1') || format(' as %I, ', m) || format(v_expr, 'per = 0') || format(' as %I, ', m || '__ant');
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('share', 'variacao_percentual', 'classe_abc') then
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, ', m, m);
    elsif m = 'concentracao' then
      v_obj_linha := v_obj_linha || '''concentracao'', null, ';
      v_obj_total := v_obj_total || '''concentracao'', concentracao, ''concentracao__ant'', concentracao__ant, ';
    else
      raise exception 'Métrica fora do catálogo';
    end if;
  end loop;

  -- filtros (valores só por parâmetro). Granularidade pedidos: produto seleciona o PEDIDO inteiro.
  v_filtro := '(cardinality($5) = 0 or representada_id = any($5))
         and (cardinality($6) = 0 or cliente_id = any($6))
         and (cardinality($8) = 0 or uf = any($8))
         and (cardinality($9) = 0 or canal = any($9))
         and (cardinality($7) = 0 or '
    || case when v_gran = 'pedidos' then 'pedido_id in (select x.pedido_id from analise_itens x where x.produto_id = any($7)))'
            else 'produto_id = any($7))' end;

  -- ordenação: só por chave de dimensão/métrica pedida (coluna conhecida); senão, valor líquido
  v_ordem := case
    when v_ord_campo = any(v_dims) then format('r%s', array_position(v_dims, v_ord_campo) - 1)
    when v_ord_campo = any(v_mets) and v_ord_campo <> 'concentracao' then format('%I', v_ord_campo)
    else '__vl'
  end || ' ' || v_ord_dir || ' nulls last';

  v_sql := format($q$
    with cli as (
      select cliente_id, min(data_dia) as prim, max(data_dia) as ult, max(data_dia) filter (where data_dia <= $10) as ult_ant
        from analise_itens
       where %8$s and data_dia <= $2 and status = any($4) and %9$s
       group by cliente_id
    ),
    base as (
      select %1$s
             case when data_dia >= $1 then 1 when data_dia >= $3 then 0 end as per,
             status = any($4) as incl, data_dia, status, pedido_id, cliente_id, representada_id, produto_id,
             quantidade, valor_bruto, valor_desconto, valor_liquido, c.prim, c.ult, c.ult_ant
        from (select * from analise_itens where data_dia <= $2 and (%8$s or data_dia >= $3) and %9$s) b
        left join cli c using (cliente_id)
    ),
    agg as (
      select %2$s, grouping(k0) as eh_total, %3$s
             round(coalesce(sum(valor_liquido) filter (where per = 1 and incl), 0), 2) as __vl,
             round(coalesce(sum(valor_liquido) filter (where per = 0 and incl), 0), 2) as __vl_ant,
             bool_or(incl) as __tem
        from base
       group by grouping sets ((%2$s), ())
    ),
    tot as (select * from agg where eh_total = 1),
    lin0 as (
      select a.*,
             round(a.__vl / nullif((select __vl from tot), 0) * 100, 1) as share,
             round((a.__vl - a.__vl_ant) / nullif(a.__vl_ant, 0) * 100, 1) as variacao_percentual,
             case when a.__vl <= 0 then 'C'
                  when coalesce(sum(a.__vl) over w, 0) < 0.80 * (select __vl from tot) then 'A'
                  when coalesce(sum(a.__vl) over w, 0) < 0.95 * (select __vl from tot) then 'B'
                  else 'C' end as classe_abc
        from agg a
       where eh_total = 0 and (a.__vl <> 0 or a.__vl_ant <> 0 or (%8$s and a.__tem))
      window w as (order by a.__vl desc, k0 rows between unbounded preceding and 1 preceding)
    ),
    lin as (select l.*, row_number() over (order by %4$s, k0) as __rn, count(*) over () as __n from lin0 l)
    select jsonb_build_object(
      'linhas', coalesce((select jsonb_agg(jsonb_build_object(%5$s) order by __rn) from lin where __rn <= %6$s), '[]'::jsonb),
      'totais', (select jsonb_build_object(%7$s '__vl', __vl, '__vl_ant', __vl_ant)
                   from (select t.*, case when t.__vl <> 0 then 100.0 end as share, null::text as classe_abc,
                                round((t.__vl - t.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) as variacao_percentual,
                                (select round(sum(x.__vl) / nullif(t.__vl, 0) * 100, 1) from (select __vl from lin0 order by __vl desc limit 10) x) as concentracao,
                                (select round(sum(x.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) from (select __vl_ant from lin0 order by __vl_ant desc limit 10) x) as concentracao__ant
                           from tot t) x),
      'totalLinhas', coalesce((select max(__n) from lin), 0),
      'agrupouOutros', false,
      'geradoEm', now()
    )
  $q$, v_base_cols, v_grupo, v_met_cols, v_ordem, rtrim(v_obj_linha, ', '), v_limite, v_obj_total,
       case when v_hist then 'true' else 'false' end, v_filtro);

  execute v_sql into v_res using v_de, v_ate, v_ant_de, v_status, v_reps, v_clis, v_prods, v_ufs, v_canais, v_ant_ate;
  return v_res;
end $$;
revoke execute on function public.analise_pivot(jsonb) from public, anon;
grant execute on function public.analise_pivot(jsonb) to authenticated;
