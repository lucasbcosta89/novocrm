-- FASE 7c: catálogo geral (todas as representadas em um PDF)
alter table documentos drop constraint documentos_tipo_check;
alter table documentos add constraint documentos_tipo_check check (tipo in ('relatorio_periodo','relatorio_comissao','catalogo','catalogo_geral'));
