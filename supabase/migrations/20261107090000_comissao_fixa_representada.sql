-- Comissão: a do PRODUTO (catálogo) prevalece; sem comissão no produto, vale a "Comissão fixa (se houver)" da
-- representada; sem nenhuma das duas, 0%. As duas passam a aceitar vazio (null = não informada).

alter table representadas alter column comissao_percentual drop not null, alter column comissao_percentual drop default;
update representadas set comissao_percentual = null where comissao_percentual = 0;  -- 0 era só o padrão antigo

alter table produtos alter column comissao drop not null, alter column comissao drop default;
-- (produtos_comissao_check "between 0 and 100" já aceita null)

-- % efetivo do item: todas as funções de pedido (criar, editar, confirmar, catálogo público) gravam
-- produtos.comissao no item; quando ele vem vazio, este trigger aplica a comissão fixa da representada e
-- calcula o valor da comissão sobre o subtotal. Item com % já definido (snapshot) não é alterado.
create function public.pedido_itens_comissao_efetiva() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.comissao_percentual is null then
    select coalesce(p.comissao, r.comissao_percentual) into new.comissao_percentual
      from produtos p join representadas r on r.id = p.representada_id
     where p.id = new.produto_id;
    new.comissao_percentual := coalesce(new.comissao_percentual, 0);
  end if;
  if new.comissao_valor is null then
    new.comissao_valor := round(new.subtotal * new.comissao_percentual / 100, 2);
  end if;
  return new;
end $$;
create trigger pedido_itens_comissao_efetiva before insert or update of comissao_percentual, comissao_valor on pedido_itens
  for each row execute function public.pedido_itens_comissao_efetiva();
