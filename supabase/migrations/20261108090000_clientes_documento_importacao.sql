-- FASE 16 — Clientes: CNPJ/CPF obrigatório e importação por planilha (motor genérico das representadas).
-- Decisões (confirmadas com o usuário): campos do cadastro atual (sem código, sem tipo, sem representada na
-- planilha — o vínculo cliente_representada continua sendo feito na plataforma); CNPJ/CPF obrigatório, como em
-- representadas: exigido em toda inclusão; cliente antigo sem documento continua existindo, sinalizado para
-- correção, e um documento preenchido não pode ser esvaziado. Dedupe da importação pelo CNPJ/CPF (único por usuário).

update clientes set documento = nullif(regexp_replace(documento, '\D', '', 'g'), '') where documento is not null;

alter table clientes add constraint clientes_documento_check check (
  documento is null
  or (length(documento) = 11 and cpf_valido(documento))
  or (length(documento) = 14 and cnpj_valido(documento))
);

create function public.clientes_obrigatorios() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.documento is null then raise exception 'Informe o CNPJ ou CPF do cliente'; end if;
  elsif new.documento is null and old.documento is not null then
    raise exception 'Informe o CNPJ ou CPF do cliente';
  end if;
  return new;
end $$;
create trigger clientes_obrigatorios before insert or update of documento on clientes
  for each row execute function public.clientes_obrigatorios();

-- histórico de importações também para clientes
alter table importacoes drop constraint importacoes_tipo_check;
alter table importacoes add constraint importacoes_tipo_check check (tipo in ('produtos', 'representadas', 'clientes'));

-- importar_clientes: UMA chamada = UMA transação (erro em qualquer linha desfaz o lote inteiro).
-- Dedupe pelo CNPJ/CPF do próprio usuário (RLS); existente atualiza SÓ as chaves presentes (vazio não apaga);
-- novo insere (trigger de quota e de obrigatórios valem). security invoker: permissões do usuário.
create function public.importar_clientes(p_linhas jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_id uuid;
  v_ins int := 0;
  v_upd int := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then raise exception 'Lote inválido'; end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Lote acima de 5.000 linhas'; end if;

  for v_item in select * from jsonb_array_elements(p_linhas) loop
    if coalesce(v_item->>'documento', '') = '' then raise exception 'Linha sem CNPJ/CPF no lote'; end if;
    select id into v_id from clientes where user_id = v_uid and documento = v_item->>'documento' for update;
    if found then
      update clientes set
        nome      = case when v_item ? 'nome' then v_item->>'nome' else nome end,
        email     = case when v_item ? 'email' then v_item->>'email' else email end,
        celular   = case when v_item ? 'celular' then v_item->>'celular' else celular end,
        whatsapp  = case when v_item ? 'whatsapp' then v_item->>'whatsapp' else whatsapp end,
        cidade    = case when v_item ? 'cidade' then v_item->>'cidade' else cidade end,
        uf        = case when v_item ? 'uf' then v_item->>'uf' else uf end,
        cep       = case when v_item ? 'cep' then v_item->>'cep' else cep end,
        segmento  = case when v_item ? 'segmento' then v_item->>'segmento' else segmento end,
        anotacoes = case when v_item ? 'anotacoes' then v_item->>'anotacoes' else anotacoes end,
        status    = case when v_item ? 'status' then v_item->>'status' else status end
      where id = v_id;
      v_upd := v_upd + 1;
    else
      insert into clientes (user_id, nome, documento, email, celular, whatsapp, cidade, uf, cep, segmento, anotacoes, status)
      values (v_uid, v_item->>'nome', v_item->>'documento', v_item->>'email', v_item->>'celular', v_item->>'whatsapp',
              v_item->>'cidade', v_item->>'uf', v_item->>'cep', v_item->>'segmento', v_item->>'anotacoes',
              coalesce(v_item->>'status', 'ativo'));
      v_ins := v_ins + 1;
    end if;
  end loop;
  return jsonb_build_object('inseridas', v_ins, 'atualizadas', v_upd);
end $$;
revoke execute on function public.importar_clientes(jsonb) from public, anon;
grant execute on function public.importar_clientes(jsonb) to authenticated;

-- catálogo público: pedido de cliente novo também exige CNPJ/CPF válido
create or replace function public.criar_pedido_publico(p_slug text, p_cliente jsonb, p_itens jsonb, p_observacoes text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rep representadas%rowtype;
  v_cli uuid;
  v_id uuid;
  v_num text;
  v_wpp text := regexp_replace(coalesce(p_cliente->>'whatsapp', ''), '\D', '', 'g');
  v_doc text := nullif(regexp_replace(coalesce(p_cliente->>'documento', ''), '\D', '', 'g'), '');
  v_item jsonb;
  v_prod produtos%rowtype;
  v_preco numeric(12,2);
  v_qtd numeric(12,3);
begin
  select * into v_rep from representadas where slug = p_slug and catalogo_publico and criar_pedido_publico;
  if not found then raise exception 'Este catálogo não está recebendo pedidos'; end if;
  if length(v_wpp) < 10 then raise exception 'Informe um WhatsApp válido com DDD'; end if;
  -- Fase 16: cliente sem CNPJ/CPF não é aceito
  if v_doc is null then raise exception 'Informe o CNPJ ou CPF'; end if;
  if not ((length(v_doc) = 11 and cpf_valido(v_doc)) or (length(v_doc) = 14 and cnpj_valido(v_doc))) then
    raise exception 'CNPJ/CPF inválido: confira os números';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  -- proteção simples contra abuso do endpoint público
  if (select count(*) from pedidos where representada_id = v_rep.id and origem = 'catalogo_web'
        and criado_em > now() - interval '10 minutes') >= 20 then
    raise exception 'Muitos pedidos em sequência. Tente novamente em alguns minutos.';
  end if;

  select id into v_cli from clientes
   where user_id = v_rep.user_id
     and ((v_doc is not null and documento = v_doc)
          or regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') = v_wpp
          or regexp_replace(coalesce(celular, ''), '\D', '', 'g') = v_wpp)
   order by (documento = v_doc) desc nulls last
   limit 1;
  if v_cli is null then
    insert into clientes (user_id, nome, documento, whatsapp, email, cidade, uf, anotacoes)
    values (v_rep.user_id, left(trim(p_cliente->>'nome'), 160), v_doc, v_wpp,
            nullif(lower(trim(p_cliente->>'email')), ''), nullif(trim(p_cliente->>'cidade'), ''),
            nullif(upper(trim(p_cliente->>'uf')), ''), 'Cadastrado pelo catálogo digital')
    returning id into v_cli;
  else
    -- cliente antigo sem documento (achado pelo WhatsApp): completa com o CNPJ/CPF informado, se livre
    update clientes set documento = v_doc
     where id = v_cli and documento is null
       and not exists (select 1 from clientes where user_id = v_rep.user_id and documento = v_doc);
  end if;
  insert into cliente_representada (cliente_id, representada_id) values (v_cli, v_rep.id) on conflict do nothing;

  v_num := 'P' || lpad(((select count(*) from pedidos where user_id = v_rep.user_id) + 1)::text, 6, '0');
  insert into pedidos (user_id, representada_id, cliente_id, numero, status, origem, observacoes)
  values (v_rep.user_id, v_rep.id, v_cli, v_num, 'rascunho', 'catalogo_web', nullif(left(trim(p_observacoes), 1000), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos where id = (v_item->>'produto_id')::uuid and representada_id = v_rep.id and ativo;
    if not found then raise exception 'Produto indisponível'; end if;
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 or v_qtd > 100000 then raise exception 'Quantidade inválida para %', v_prod.nome; end if;
    v_preco := null;
    select tp.preco into v_preco from tabelas_preco tp
     where tp.produto_id = v_prod.id and (tp.cliente_id = v_cli or tp.cliente_id is null)
     order by tp.cliente_id nulls last limit 1;
    v_preco := coalesce(v_preco, v_prod.preco);
    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, subtotal, comissao_percentual)
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco, round(v_qtd * v_preco, 2), v_prod.comissao);
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;
  return jsonb_build_object('pedido_id', v_id, 'numero', v_num, 'user_id', v_rep.user_id, 'cliente_id', v_cli,
    'valor_total', (select valor_total from pedidos where id = v_id));
end $$;
revoke execute on function public.criar_pedido_publico(text, jsonb, jsonb, text) from public, anon, authenticated;
