-- FASE 18 — "Pagamento da Comissão" no cadastro de representadas (APENAS cadastro: nenhum cálculo, status,
-- relatório ou PDF de comissão usa estes campos; a data prevista continua a do confirmar_pedido).
-- Decisão do usuário: manter prazo_pagamento_dias (prazo de pagamento dos pedidos) e criar campos próprios da comissão.
-- Registros existentes: 'faturamento' (comportamento atual: comissão prevista pelo mês do pedido), sem referência/dias.

alter table representadas
  add column comissao_pagamento_tipo text not null default 'faturamento'
    constraint representadas_comissao_pagamento_tipo_check check (comissao_pagamento_tipo in ('faturamento', 'pagamento', 'outro')),
  add column comissao_pagamento_referencia text
    constraint representadas_comissao_pagamento_referencia_check check (comissao_pagamento_referencia in ('faturamento', 'pagamento')),
  add column comissao_pagamento_dias int
    constraint representadas_comissao_pagamento_dias_check check (comissao_pagamento_dias between 1 and 365),
  -- coerência: 'outro' exige referência e dias; os demais não guardam nenhum dos dois
  add constraint representadas_comissao_pagamento_coerencia_check check (
    (comissao_pagamento_tipo = 'outro' and comissao_pagamento_referencia is not null and comissao_pagamento_dias is not null)
    or (comissao_pagamento_tipo <> 'outro' and comissao_pagamento_referencia is null and comissao_pagamento_dias is null)
  );

-- listagem: os campos para a coluna "Pagamento da comissão" e a ordenação (no faturamento, no pagamento, outro + dias)
create or replace view representadas_listagem with (security_invoker = true) as
 SELECT id,
    user_id,
    codigo_representada,
    razao_social,
    nome_fantasia,
    cnpj,
    cidade,
    uf,
    comissao_percentual,
    status,
    criado_em,
    concat_ws(' '::text, razao_social, nome_fantasia, cnpj) AS busca,
    (( SELECT count(*) AS count
           FROM cliente_representada cr
          WHERE cr.representada_id = r.id))::integer AS clientes_vinculados,
    COALESCE(( SELECT sum(p.valor_total) AS sum
           FROM pedidos p
          WHERE p.representada_id = r.id AND (p.status = ANY (ARRAY['confirmado'::text, 'entregue'::text])) AND p.data >= (now() - '90 days'::interval)), 0::numeric)::numeric(14,2) AS valor_vendido_90d,
    comissao_pagamento_tipo,
    comissao_pagamento_referencia,
    comissao_pagamento_dias,
    CASE comissao_pagamento_tipo WHEN 'faturamento' THEN 1 WHEN 'pagamento' THEN 2 ELSE 3 END AS comissao_pagamento_ordem
   FROM representadas r
  WHERE excluido_em IS NULL;
