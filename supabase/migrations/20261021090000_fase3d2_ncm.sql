-- FASE 3d-2: NCM do produto (8 dígitos quando preenchido)
alter table produtos add column ncm text check (ncm is null or ncm ~ '^[0-9]{8}$');
