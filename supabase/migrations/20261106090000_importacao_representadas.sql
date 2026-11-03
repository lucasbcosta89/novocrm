-- CADASTRO DE REPRESENTADAS — Fase 4: importação por planilha (gravação transacional por lote).
-- importar_representadas: UMA chamada = UMA transação. Qualquer erro (CNPJ/IE/código duplicado, limite do
-- plano, regra do banco) desfaz o lote inteiro: nunca fica registro pela metade nem parte do lote gravada.
-- Deduplicação pelo CNPJ sem máscara entre as representadas não excluídas do próprio usuário (RLS).
-- Registro existente: atualiza SÓ as chaves presentes no item (campo vazio na planilha não vem no item e
-- portanto não apaga nada). Registro novo: insere; código vazio = gerado pelo trigger (REP-0001…).
-- security invoker: roda com as permissões do usuário; RLS e triggers (quota, obrigatórios) valem.

alter table importacoes drop constraint importacoes_tipo_check;
alter table importacoes add constraint importacoes_tipo_check check (tipo in ('produtos', 'representadas'));

create function public.importar_representadas(p_linhas jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_id uuid;
  v_slug text;
  v_ins int := 0;
  v_upd int := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then raise exception 'Lote inválido'; end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Lote acima de 5.000 linhas'; end if;

  for v_item in select * from jsonb_array_elements(p_linhas) loop
    if coalesce(v_item->>'cnpj', '') = '' then raise exception 'Linha sem CNPJ no lote'; end if;
    select id into v_id from representadas
     where user_id = v_uid and cnpj = v_item->>'cnpj' and excluido_em is null
     for update;

    if found then
      update representadas set
        codigo_representada  = case when v_item ? 'codigo_representada' then v_item->>'codigo_representada' else codigo_representada end,
        razao_social         = case when v_item ? 'razao_social' then v_item->>'razao_social' else razao_social end,
        nome_fantasia        = case when v_item ? 'nome_fantasia' then v_item->>'nome_fantasia' else nome_fantasia end,
        inscricao_estadual   = case when v_item ? 'inscricao_estadual' then v_item->>'inscricao_estadual' else inscricao_estadual end,
        email_comercial      = case when v_item ? 'email_comercial' then v_item->>'email_comercial' else email_comercial end,
        telefone             = case when v_item ? 'telefone' then v_item->>'telefone' else telefone end,
        contato_nome         = case when v_item ? 'contato_nome' then v_item->>'contato_nome' else contato_nome end,
        contato_telefone     = case when v_item ? 'contato_telefone' then v_item->>'contato_telefone' else contato_telefone end,
        cep                  = case when v_item ? 'cep' then v_item->>'cep' else cep end,
        endereco             = case when v_item ? 'endereco' then v_item->>'endereco' else endereco end,
        numero               = case when v_item ? 'numero' then v_item->>'numero' else numero end,
        complemento          = case when v_item ? 'complemento' then v_item->>'complemento' else complemento end,
        bairro               = case when v_item ? 'bairro' then v_item->>'bairro' else bairro end,
        cidade               = case when v_item ? 'cidade' then v_item->>'cidade' else cidade end,
        uf                   = case when v_item ? 'uf' then v_item->>'uf' else uf end,
        comissao_percentual  = case when v_item ? 'comissao_percentual' then (v_item->>'comissao_percentual')::numeric else comissao_percentual end,
        prazo_pagamento_dias = case when v_item ? 'prazo_pagamento_dias' then (v_item->>'prazo_pagamento_dias')::int else prazo_pagamento_dias end,
        tabela_preco         = case when v_item ? 'tabela_preco' then v_item->>'tabela_preco' else tabela_preco end,
        status               = case when v_item ? 'status' then v_item->>'status' else status end,
        observacoes          = case when v_item ? 'observacoes' then v_item->>'observacoes' else observacoes end
      where id = v_id;
      v_upd := v_upd + 1;
    else
      -- slug do catálogo é global: base vinda do app + sufixo aleatório em caso de colisão
      v_slug := coalesce(nullif(v_item->>'slug', ''), 'representada');
      while exists (select 1 from representadas where slug = v_slug) loop
        v_slug := coalesce(nullif(v_item->>'slug', ''), 'representada') || '-' || substr(md5(random()::text), 1, 4);
      end loop;
      insert into representadas (
        user_id, slug, codigo_representada, razao_social, nome_fantasia, cnpj, inscricao_estadual, email_comercial,
        telefone, contato_nome, contato_telefone, cep, endereco, numero, complemento, bairro, cidade, uf,
        comissao_percentual, prazo_pagamento_dias, tabela_preco, status, observacoes
      ) values (
        v_uid, v_slug, v_item->>'codigo_representada', v_item->>'razao_social', v_item->>'nome_fantasia', v_item->>'cnpj',
        v_item->>'inscricao_estadual', v_item->>'email_comercial', v_item->>'telefone', v_item->>'contato_nome',
        v_item->>'contato_telefone', v_item->>'cep', v_item->>'endereco', v_item->>'numero', v_item->>'complemento',
        v_item->>'bairro', v_item->>'cidade', v_item->>'uf', coalesce((v_item->>'comissao_percentual')::numeric, 0),
        (v_item->>'prazo_pagamento_dias')::int, v_item->>'tabela_preco', coalesce(v_item->>'status', 'ativa'), v_item->>'observacoes'
      );
      v_ins := v_ins + 1;
    end if;
  end loop;

  return jsonb_build_object('inseridas', v_ins, 'atualizadas', v_upd);
end $$;
revoke execute on function public.importar_representadas(jsonb) from public, anon;
grant execute on function public.importar_representadas(jsonb) to authenticated;
