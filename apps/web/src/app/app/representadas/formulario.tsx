"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type InputHTMLAttributes, type Ref } from "react";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { OBRIGATORIOS_REPRESENTADA, VALORES_VAZIOS_REPRESENTADA as VALORES_VAZIOS, validarRepresentada, type CampoRepresentada, type ValoresFormRepresentada as Valores } from "@/lib/cadastros/representada";
import { mascaraCnpj } from "@/lib/documentos-br";
import { UFS } from "@/lib/ufs";
import type { EstadoFormRepresentada } from "./actions";

type Acao = (prev: EstadoFormRepresentada, fd: FormData) => Promise<EstadoFormRepresentada>;

/**
 * Formulário da representada (criar/editar) em 5 seções. Valida cada campo ao sair dele (mensagem logo abaixo),
 * CNPJ com máscara na digitação e dígito verificador; Salvar fica desabilitado enquanto houver erro impeditivo.
 * Ao criar, "Salvar e adicionar outra" grava e devolve o formulário limpo na mesma tela.
 */
export function FormularioRepresentada({ acao, iniciais, edicao = false, catalogo, cancelar }: {
  acao: Acao;
  iniciais?: Partial<Valores>;
  edicao?: boolean;
  catalogo?: { publico: boolean; pedidos: boolean };
  cancelar: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const inicio = { ...VALORES_VAZIOS, ...iniciais, cnpj: mascaraCnpj(iniciais?.cnpj ?? "") };
  const [valores, setValores] = useState<Valores>(inicio);
  const [tocados, setTocados] = useState<Set<CampoRepresentada>>(new Set());
  const [errosServidor, setErrosServidor] = useState<EstadoFormRepresentada["erros"]>({});
  const primeiro = useRef<HTMLInputElement>(null);

  // resposta do servidor (ajuste de estado durante o render, sem efeito): erros de campo (ex.: CNPJ
  // duplicado) ficam abaixo do campo; após "Salvar e adicionar outra" o formulário volta limpo
  const [respostaVista, setRespostaVista] = useState(estado);
  if (estado !== respostaVista) {
    setRespostaVista(estado);
    setErrosServidor(estado.erros ?? {});
    if (estado.erros) setTocados((t) => new Set([...t, ...(Object.keys(estado.erros!) as CampoRepresentada[])]));
    if (estado.limpar) {
      setValores({ ...VALORES_VAZIOS });
      setTocados(new Set());
    }
  }
  useEffect(() => {
    if (estado.limpar) primeiro.current?.focus();
  }, [estado.limpar]);

  const errosAtuais = validarRepresentada(valores);
  const impeditivo = Object.keys(errosAtuais).length > 0;
  const erroDo = (c: CampoRepresentada) => errosServidor?.[c] ?? (tocados.has(c) ? errosAtuais[c] ?? null : null);

  function mudar(c: CampoRepresentada, v: string) {
    setValores((x) => ({ ...x, [c]: c === "cnpj" ? mascaraCnpj(v) : v }));
    if (errosServidor?.[c]) setErrosServidor((e) => { const n = { ...e }; delete n[c]; return n; });
  }
  const sair = (c: CampoRepresentada) => setTocados((t) => (t.has(c) ? t : new Set(t).add(c)));

  /** Campo de texto com rótulo, validação ao sair e mensagem abaixo. */
  function C({ c, rotulo, ref, ...props }: { c: CampoRepresentada; rotulo: string; ref?: Ref<HTMLInputElement> } & InputHTMLAttributes<HTMLInputElement>) {
    const erro = erroDo(c);
    const id = `rep-${c}`;
    return (
      <label className="campo" htmlFor={id}>
        <span>{rotulo}{OBRIGATORIOS_REPRESENTADA.includes(c) && " *"}</span>
        <input
          id={id} ref={ref} name={c} value={valores[c]} onChange={(e) => mudar(c, e.target.value)} onBlur={() => sair(c)}
          aria-invalid={!!erro} aria-describedby={erro ? `${id}-erro` : undefined} {...props}
        />
        {erro && <small id={`${id}-erro`} className="erro-campo">{erro}</small>}
      </label>
    );
  }

  const obsErro = erroDo("observacoes");

  return (
    <form action={enviar} className="grade-1 form-representada" noValidate>
      <Mensagens erro={estado.erro} ok={estado.ok} />

      <fieldset className="secao-form">
        <legend>Identificação</legend>
        <div className="grade">
          {C({ c: "razao_social", rotulo: "Razão social", maxLength: 150, ref: primeiro, autoFocus: !edicao })}
          {C({ c: "nome_fantasia", rotulo: "Nome fantasia", maxLength: 100 })}
          {C({ c: "cnpj", rotulo: "CNPJ", inputMode: "numeric", placeholder: "00.000.000/0000-00", maxLength: 18 })}
          {C({ c: "inscricao_estadual", rotulo: "Inscrição estadual", placeholder: "Números ou ISENTO", maxLength: 20 })}
          {C({ c: "codigo_representada", rotulo: "Código", maxLength: 20, placeholder: edicao ? undefined : "Vazio = gera REP-0001…" })}
          <label className="campo" htmlFor="rep-status">
            <span>Status</span>
            <select id="rep-status" name="status" value={valores.status} onChange={(e) => mudar("status", e.target.value)}>
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="secao-form">
        <legend>Contato</legend>
        <div className="grade">
          {C({ c: "email_comercial", rotulo: "E-mail comercial", type: "email", maxLength: 254, autoComplete: "email" })}
          {C({ c: "telefone", rotulo: "Telefone", type: "tel", placeholder: "(62) 3333-4444", maxLength: 20 })}
          {C({ c: "contato_nome", rotulo: "Nome do contato", maxLength: 100 })}
          {C({ c: "contato_telefone", rotulo: "Telefone do contato", type: "tel", placeholder: "(62) 99999-8888", maxLength: 20 })}
        </div>
      </fieldset>

      <fieldset className="secao-form">
        <legend>Endereço</legend>
        <div className="grade">
          {C({ c: "cep", rotulo: "CEP", inputMode: "numeric", placeholder: "00000-000", maxLength: 9 })}
          {C({ c: "endereco", rotulo: "Endereço", maxLength: 150, autoComplete: "address-line1" })}
          {C({ c: "numero", rotulo: "Número", maxLength: 20, placeholder: "123 ou S/N" })}
          {C({ c: "complemento", rotulo: "Complemento", maxLength: 60 })}
          {C({ c: "bairro", rotulo: "Bairro", maxLength: 80 })}
          {C({ c: "cidade", rotulo: "Cidade", maxLength: 80 })}
          <label className="campo" htmlFor="rep-uf">
            <span>UF *</span>
            <select id="rep-uf" name="uf" value={valores.uf} onChange={(e) => mudar("uf", e.target.value)} onBlur={() => sair("uf")}
              aria-invalid={!!erroDo("uf")} aria-describedby={erroDo("uf") ? "rep-uf-erro" : undefined}>
              <option value="">Selecione…</option>
              {UFS.map(([sigla, nome]) => <option key={sigla} value={sigla}>{sigla} – {nome}</option>)}
            </select>
            {erroDo("uf") && <small id="rep-uf-erro" className="erro-campo">{erroDo("uf")}</small>}
          </label>
        </div>
      </fieldset>

      <fieldset className="secao-form">
        <legend>Condições Comerciais</legend>
        <div className="grade">
          {C({ c: "comissao_percentual", rotulo: "Comissão fixa (se houver) (%)", inputMode: "decimal", placeholder: "Vazio = varia por produto" })}
          {C({ c: "prazo_pagamento_dias", rotulo: "Prazo de pagamento (dias)", inputMode: "numeric", placeholder: "0 a 365" })}
          {C({ c: "tabela_preco", rotulo: "Tabela de preço", maxLength: 60 })}
        </div>
        {catalogo && (
          <div className="acoes-linha">
            <label className="check"><input type="checkbox" name="catalogo_publico" defaultChecked={catalogo.publico} /> Catálogo digital público</label>
            <label className="check"><input type="checkbox" name="criar_pedido_publico" defaultChecked={catalogo.pedidos} /> Aceitar pedidos pelo catálogo</label>
          </div>
        )}
      </fieldset>

      <fieldset className="secao-form">
        <legend>Observações</legend>
        <label className="campo" htmlFor="rep-observacoes">
          <span>Observações <span className="dica">({valores.observacoes.length}/500)</span></span>
          <textarea id="rep-observacoes" name="observacoes" rows={3} maxLength={500} value={valores.observacoes}
            onChange={(e) => mudar("observacoes", e.target.value)} onBlur={() => sair("observacoes")}
            aria-invalid={!!obsErro} aria-describedby={obsErro ? "rep-observacoes-erro" : undefined} />
          {obsErro && <small id="rep-observacoes-erro" className="erro-campo">{obsErro}</small>}
        </label>
      </fieldset>

      <div className="acoes-linha">
        <button className="btn" type="submit" disabled={impeditivo || pendente}>
          <Icone nome="check" tamanho={16} /> {pendente ? "Salvando…" : edicao ? "Salvar alterações" : "Salvar"}
        </button>
        {!edicao && (
          <button className="btn-secundario" type="submit" name="depois" value="outra" disabled={impeditivo || pendente}>
            <Icone nome="mais" tamanho={16} /> Salvar e adicionar outra
          </button>
        )}
        <Link className="btn-link" href={cancelar}>Cancelar</Link>
        {impeditivo && <span className="dica">Preencha os obrigatórios (*) e corrija os campos com erro para salvar.</span>}
      </div>
    </form>
  );
}
