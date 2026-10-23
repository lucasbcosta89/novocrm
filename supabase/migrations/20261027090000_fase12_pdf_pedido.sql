-- FASE 12: PDF do pedido (documento operacional) — mesmo fluxo de documentos/hash_cache, sem consumir pdf_mes
alter table documentos drop constraint documentos_tipo_check;
alter table documentos add constraint documentos_tipo_check check (tipo in (
  'relatorio_periodo','relatorio_comissao','catalogo','catalogo_geral',
  'relatorio_vendas_geral','relatorio_vendas_cliente','relatorio_vendas_representada','relatorio_kpis',
  'pedido'
));

-- quota pdf_mes: só documentos que não são o PDF operacional do pedido
drop trigger quota_pdfs on documentos;
create trigger quota_pdfs before insert on documentos
  for each row when (new.tipo is distinct from 'pedido')
  execute function public.quota_trigger('pdf_mes', 'mensal');
