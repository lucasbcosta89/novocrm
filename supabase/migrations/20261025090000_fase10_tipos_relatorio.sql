-- FASE 10: novos tipos de relatório da Biblioteca (sem tabela nova; reusa documentos + hash_cache + quota pdf_mes)
alter table documentos drop constraint documentos_tipo_check;
alter table documentos add constraint documentos_tipo_check check (tipo in (
  'relatorio_periodo','relatorio_comissao','catalogo','catalogo_geral',
  'relatorio_vendas_geral','relatorio_vendas_cliente','relatorio_vendas_representada','relatorio_kpis'
));
