-- Produtos: NCM opcional com 8 dígitos e preço opcional (preparação para importação de produtos).
-- Ajustado ao schema real: a coluna de preço chama "preco" (não existe "preco_padrao") e a chave
-- única é (representada_id, sku) — cada representada pertence a um único usuário.

-- ncm: text, aceita nulo (já criada na Fase 3d-2; idempotente)
alter table produtos add column if not exists ncm text;

-- preço deixa de ser obrigatório (o default 0 continua valendo quando omitido)
alter table produtos alter column preco drop not null;

-- ncm preenchido = exatamente 8 dígitos numéricos (recria a regra com nome explícito)
alter table produtos drop constraint if exists produtos_ncm_check;
alter table produtos add constraint produtos_ncm_check check (ncm is null or ncm ~ '^[0-9]{8}$');

-- chave única de SKU mantida: unique (representada_id, sku) — sem alteração
