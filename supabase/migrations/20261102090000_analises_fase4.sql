-- ANÁLISES — Fase 4: agrupamento em "Outros" (no backend) + visões salvas.
-- Engine: quando a cardinalidade de uma dimensão passa do limite da spec (default 15), as (limite - 1) maiores
-- (por valor líquido do período) ficam e o excedente vira UMA linha "Outros" (chave '__outros__', não clicável).
-- As métricas da linha "Outros" são recalculadas sobre o grupo (nunca somadas das linhas); totais inalterados.
-- Tempo/dia não agrupam. Continua UMA consulta, whitelist fechada, valores só por parâmetro, security invoker.

-- Visões salvas: { nome, spec, usuário }; pertencem à aba onde foram criadas, ou "compartilhada" (todas as abas).
create table analise_visoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references usuarios(id) on delete cascade,
  aba text not null check (aba in ('representada', 'cliente', 'produto', 'pedido', 'mix')),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and pg_column_size(spec) < 16384),
  escopo text not null default 'subpagina' check (escopo in ('subpagina', 'compartilhada')),
  criado_em timestamptz not null default now()
);
create index analise_visoes_user_idx on analise_visoes (user_id, criado_em desc);
alter table analise_visoes enable row level security;
create policy analise_visoes_dono on analise_visoes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

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
  v_mtz_l text := p_spec->'matriz'->>'linha';
  v_mtz_c text := p_spec->'matriz'->>'coluna';
  v_hist boolean;
  v_dev boolean;
  v_lider boolean;
  v_mtz boolean := false;
  v_top text := '';
  v_sel text := '';
  v_jtop text := '';
  v_sel_dev text := '';
  v_jtop_dev text := '';
  v_outros_a text := '';
  v_filtro text;
  v_base_cols text := '';
  v_dev_cols text := '';
  v_grupo text := '';
  v_join_dev text := '';
  v_join_lid text := '';
  v_met_cols text := '';
  v_obj_linha text := '';
  v_obj_total text := '';
  v_ordem text;
  v_par text[];
  v_par2 text[];
  d text;
  m text;
  v_expr text;
  i int := 0;
  v_sql text;
  v_res jsonb;
begin
  if v_de is null or v_ate is null or v_ate < v_de or v_ate - v_de > 1830 then
    raise exception 'Período inválido';
  end if;
  if coalesce(array_length(v_dims, 1), 0) not between 1 and 6 then raise exception 'Escolha de 1 a 6 dimensões'; end if;
  if coalesce(array_length(v_mets, 1), 0) not between 1 and 24 then raise exception 'Escolha de 1 a 24 métricas'; end if;
  v_ant_ate := v_de - 1;
  v_ant_de := v_de - (v_ate - v_de + 1);
  -- sem filtro de status = vendas (confirmados e entregues)
  if coalesce(array_length(v_status, 1), 0) = 0 then v_status := array['confirmado', 'entregue']; end if;
  v_hist := v_mets && array['ultima_compra', 'dias_sem_comprar', 'clientes_novos', 'clientes_em_risco'];
  v_dev := v_mets && array['valor_devolvido', 'percentual_devolucoes'];
  v_lider := 'lider_representada' = any(v_mets);

  -- DIMENSÕES (whitelist via analise_dim)
  foreach d in array v_dims loop
    v_par := analise_dim(d);
    if v_par is null then raise exception 'Dimensão fora do catálogo'; end if;
    if d = any(v_dims[1:i]) then raise exception 'Dimensão repetida'; end if;
    if v_gran = 'pedidos' and d in ('produto', 'categoria') then
      raise exception 'Dimensão de item não disponível na granularidade Pedidos';
    end if;
    v_base_cols := v_base_cols || format('(%s)::text as k%s, (%s)::text as r%s, ', v_par[1], i, v_par[2], i);
    -- OUTROS: acima do limite, o excedente da dimensão vira uma linha "Outros" (tempo/dia nunca agrupam)
    if d in ('tempo', 'dia') then
      v_sel := v_sel || format('b.k%1$s, b.r%1$s, ', i);
      v_sel_dev := v_sel_dev || format('x0.k%1$s, x0.r%1$s, ', i);
    else
      v_top := v_top || format('top%1$s as (select k%1$s as k, row_number() over (order by sum(valor_liquido) filter (where per = 1 and incl) desc nulls last, '
        || 'sum(valor_liquido) filter (where per = 0 and incl) desc nulls last, k%1$s) as pos from base0 group by k%1$s), ', i);
      v_sel := v_sel || format('case when t%1$s.pos < %2$s or (select max(pos) from top%1$s) <= %2$s then b.k%1$s else ''__outros__'' end as k%1$s, '
        || 'case when t%1$s.pos < %2$s or (select max(pos) from top%1$s) <= %2$s then b.r%1$s else ''Outros'' end as r%1$s, ', i, v_limite);
      v_jtop := v_jtop || format('left join top%1$s t%1$s on t%1$s.k is not distinct from b.k%1$s ', i);
      v_sel_dev := v_sel_dev || format('case when t%1$s.pos < %2$s or (select max(pos) from top%1$s) <= %2$s then x0.k%1$s else ''__outros__'' end as k%1$s, '
        || 'case when t%1$s.pos < %2$s or (select max(pos) from top%1$s) <= %2$s then x0.r%1$s else ''Outros'' end as r%1$s, ', i, v_limite);
      v_jtop_dev := v_jtop_dev || format('left join top%1$s t%1$s on t%1$s.k is not distinct from x0.k%1$s ', i);
      v_outros_a := v_outros_a || format('a.k%s is not distinct from ''__outros__'' or ', i);
    end if;
    v_grupo := v_grupo || format('k%s, r%s, ', i, i);
    v_join_dev := v_join_dev || format('a.k%1$s is not distinct from d.k%1$s and ', i);
    v_join_lid := v_join_lid || format('a.k%1$s is not distinct from l.k%1$s and ', i);
    v_obj_linha := v_obj_linha || format('%L, r%s, %L, k%s, ', d, i, d || '__id', i);
    i := i + 1;
  end loop;
  v_grupo := rtrim(v_grupo, ', ');
  v_outros_a := v_outros_a || 'false';
  v_dev_cols := v_base_cols;

  -- MATRIZ (cruzamento opcional, mesma whitelist)
  if v_mtz_l is not null or v_mtz_c is not null then
    v_par := analise_dim(v_mtz_l);
    v_par2 := analise_dim(v_mtz_c);
    if v_par is null or v_par2 is null or v_mtz_l = v_mtz_c then raise exception 'Matriz fora do catálogo'; end if;
    if v_gran = 'pedidos' and (v_mtz_l in ('produto', 'categoria') or v_mtz_c in ('produto', 'categoria')) then
      raise exception 'Dimensão de item não disponível na granularidade Pedidos';
    end if;
    v_base_cols := v_base_cols || format('%s as m_l, %s as m_lr, %s as m_c, %s as m_cr, ', v_par[1], v_par[2], v_par2[1], v_par2[2]);
    v_mtz := true;
  else
    v_base_cols := v_base_cols || 'null::text as m_l, null::text as m_lr, null::text as m_c, null::text as m_cr, ';
  end if;

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
      when 'marcas_por_cliente'   then 'round(count(distinct cliente_id::text || representada_id::text) filter (where %1$s and incl)::numeric / nullif(count(distinct cliente_id) filter (where %1$s and incl), 0), 2)'
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
        when 'ultima_compra' then 'max(data_dia) filter (where incl) as ultima_compra, '
        else '($2 - max(data_dia) filter (where incl)) as dias_sem_comprar, ' end;
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, null, ', m);
    elsif v_expr is not null then
      v_met_cols := v_met_cols || format(v_expr, 'per = 1') || format(' as %I, ', m) || format(v_expr, 'per = 0') || format(' as %I, ', m || '__ant');
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('valor_devolvido', 'percentual_devolucoes') then
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('share', 'variacao_percentual', 'classe_abc', 'share_anterior', 'variacao_share', 'lider_representada') then
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, ', m, m);
    elsif m in ('concentracao', 'concentracao_top5') then
      v_obj_linha := v_obj_linha || format('%L, null, ', m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m = 'variacao_mix' then
      v_obj_linha := v_obj_linha || '''variacao_mix'', null, ';
      v_obj_total := v_obj_total || '''variacao_mix'', variacao_mix, ';
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

  -- ordenação: só por chave de dimensão/métrica de linha pedida (coluna conhecida); senão, valor líquido
  v_ordem := case
    when v_ord_campo = any(v_dims) then format('r%s', array_position(v_dims, v_ord_campo) - 1)
    when v_ord_campo = any(v_mets) and v_ord_campo not in ('concentracao', 'concentracao_top5', 'variacao_mix') then format('%I', v_ord_campo)
    else '__vl'
  end || ' ' || v_ord_dir || ' nulls last';

  v_sql := format($q$
    with cli as (
      select cliente_id, min(data_dia) as prim, max(data_dia) as ult, max(data_dia) filter (where data_dia <= $10) as ult_ant
        from analise_itens
       where %8$s and data_dia <= $2 and status = any($4) and %9$s
       group by cliente_id
    ),
    base0 as (
      select %1$s
             case when data_dia >= $1 then 1 when data_dia >= $3 then 0 end as per,
             status = any($4) as incl, data_dia, status, pedido_id, cliente_id, representada_id, representada_nome, produto_id,
             quantidade, valor_bruto, valor_desconto, valor_liquido, c.prim, c.ult, c.ult_ant
        from (select * from analise_itens where data_dia <= $2 and (%8$s or data_dia >= $3) and %9$s) b
        left join cli c using (cliente_id)
    ),
    %16$s
    base as (
      select %17$s b.m_l, b.m_lr, b.m_c, b.m_cr, b.per, b.incl, b.data_dia, b.status, b.pedido_id, b.cliente_id, b.representada_id,
             b.representada_nome, b.produto_id, b.quantidade, b.valor_bruto, b.valor_desconto, b.valor_liquido, b.prim, b.ult, b.ult_ant
        from base0 b %18$s
    ),
    agg as (
      select %2$s, grouping(k0) as eh_total, %3$s
             round(coalesce(sum(valor_liquido) filter (where per = 1 and incl), 0), 2) as __vl,
             round(coalesce(sum(valor_liquido) filter (where per = 0 and incl), 0), 2) as __vl_ant,
             bool_or(incl) as __tem
        from base
       group by grouping sets ((%2$s), ())
    ),
    dev as (
      select %2$s, grouping(k0) as eh_total,
             round(coalesce(sum(valor_liquido) filter (where per = 1), 0), 2) as __dv,
             round(coalesce(sum(valor_liquido) filter (where per = 0), 0), 2) as __dv_ant
        from (select %19$s x0.per, x0.valor_liquido
                from (select %10$s case when data_dia >= $1 then 1 else 0 end as per, valor_liquido
                        from analise_devolucoes where %11$s and data_dia between $3 and $2 and %9$s) x0 %20$s) x
       group by grouping sets ((%2$s), ())
    ),
    agg2 as (
      select a.*,
             coalesce(d.__dv, 0) as valor_devolvido, coalesce(d.__dv_ant, 0) as valor_devolvido__ant,
             round(coalesce(d.__dv, 0) / nullif(a.__vl, 0) * 100, 1) as percentual_devolucoes,
             round(coalesce(d.__dv_ant, 0) / nullif(a.__vl_ant, 0) * 100, 1) as percentual_devolucoes__ant
        from agg a left join dev d on %12$s a.eh_total = d.eh_total
    ),
    tot as (select * from agg2 where eh_total = 1),
    lid as (
      select y.*, row_number() over (partition by %2$s order by y.__v desc, y.__rep) as __pos
        from (select %2$s, representada_nome as __rep, sum(valor_liquido) filter (where per = 1 and incl) as __v
                from base where %13$s group by %2$s, representada_nome) y
       where y.__v > 0
    ),
    lin0 as (
      select a.*, l.__rep as lider_representada, (%21$s) as __outros,
             round(a.__vl / nullif((select __vl from tot), 0) * 100, 1) as share,
             round(a.__vl_ant / nullif((select __vl_ant from tot), 0) * 100, 1) as share_anterior,
             round((a.__vl / nullif((select __vl from tot), 0) - a.__vl_ant / nullif((select __vl_ant from tot), 0)) * 100, 1) as variacao_share,
             round((a.__vl - a.__vl_ant) / nullif(a.__vl_ant, 0) * 100, 1) as variacao_percentual,
             case when (%21$s) then null when a.__vl <= 0 then 'C'
                  when coalesce(sum(a.__vl) over w, 0) < 0.80 * (select __vl from tot) then 'A'
                  when coalesce(sum(a.__vl) over w, 0) < 0.95 * (select __vl from tot) then 'B'
                  else 'C' end as classe_abc
        from agg2 a
        left join lid l on %14$s l.__pos = 1
       where a.eh_total = 0 and (a.__vl <> 0 or a.__vl_ant <> 0 or (%8$s and a.__tem))
      window w as (order by (%21$s), a.__vl desc, a.k0 rows between unbounded preceding and 1 preceding)
    ),
    lin as (select l.*, row_number() over (order by __outros, %4$s, k0) as __rn, count(*) over () as __n from lin0 l),
    mtz as (
      select m_l, m_lr, m_c, m_cr, round(sum(valor_liquido) filter (where per = 1 and incl), 2) as v
        from base where %15$s group by m_l, m_lr, m_c, m_cr
    )
    select jsonb_build_object(
      'linhas', coalesce((select jsonb_agg(jsonb_build_object(%5$s) order by __rn) from lin where __rn <= %6$s), '[]'::jsonb),
      'totais', (select jsonb_build_object(%7$s '__vl', __vl, '__vl_ant', __vl_ant)
                   from (select t.*, case when t.__vl <> 0 then 100.0 end as share, null::text as classe_abc,
                                case when t.__vl_ant <> 0 then 100.0 end as share_anterior, null::numeric as variacao_share,
                                null::text as lider_representada,
                                round((t.__vl - t.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) as variacao_percentual,
                                (select round(sum(x.__vl) / nullif(t.__vl, 0) * 100, 1) from (select __vl from lin0 where not __outros order by __vl desc limit 10) x) as concentracao,
                                (select round(sum(x.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) from (select __vl_ant from lin0 where not __outros order by __vl_ant desc limit 10) x) as concentracao__ant,
                                (select round(sum(x.__vl) / nullif(t.__vl, 0) * 100, 1) from (select __vl from lin0 where not __outros order by __vl desc limit 5) x) as concentracao_top5,
                                (select round(sum(x.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) from (select __vl_ant from lin0 where not __outros order by __vl_ant desc limit 5) x) as concentracao_top5__ant,
                                case when t.__vl <> 0 and t.__vl_ant <> 0 then
                                  (select round(sum(abs(x.__vl / t.__vl - x.__vl_ant / t.__vl_ant)) * 50, 1) from lin0 x) end as variacao_mix
                           from tot t) x),
      'totalLinhas', coalesce((select max(__n) from lin), 0),
      'agrupouOutros', exists (select 1 from lin0 where __outros),
      'matriz', case when %15$s then coalesce((select jsonb_agg(jsonb_build_object('linha', m_lr, 'linha__id', m_l, 'coluna', m_cr, 'coluna__id', m_c, 'valor', v)
                                                          order by m_lr, m_cr) from mtz where v > 0), '[]'::jsonb) end,
      'geradoEm', now()
    )
  $q$, v_base_cols, v_grupo, v_met_cols, v_ordem, rtrim(v_obj_linha, ', '), v_limite, v_obj_total,
       case when v_hist then 'true' else 'false' end, v_filtro,
       v_dev_cols, case when v_dev then 'true' else 'false' end, v_join_dev,
       case when v_lider then 'true' else 'false' end, v_join_lid,
       case when v_mtz then 'true' else 'false' end,
       v_top, v_sel, v_jtop, v_sel_dev, v_jtop_dev, v_outros_a);

  execute v_sql into v_res using v_de, v_ate, v_ant_de, v_status, v_reps, v_clis, v_prods, v_ufs, v_canais, v_ant_ate;
  return v_res;
end $$;
revoke execute on function public.analise_pivot(jsonb) from public, anon;
grant execute on function public.analise_pivot(jsonb) to authenticated;
