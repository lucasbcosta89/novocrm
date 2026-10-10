"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { TEXTO_CONSENTIMENTO_LGPD } from "@/conteudo/consentimento-lgpd";
import { POLITICA_MD } from "@/conteudo/politica-privacidade.gerado";
import { cnpjValido, cpfValido, mascaraCnpj, mascaraCpf } from "@/lib/documentos-br";
import { UFS } from "@/lib/ufs";
import { Markdown } from "./markdown";

export type EstadoAcao = { erro?: string; ok?: string };
type Acao = (estado: EstadoAcao, fd: FormData) => Promise<EstadoAcao>;

export type DadosIniciais = {
  nome: string;
  nome_empresa: string | null;
  rua: string | null;
  numero: string | null;
  municipio: string | null;
  estado: string | null;
  cpf_oculto: string | null;
  cnpj_oculto: string | null;
};

/** Link "Política de Privacidade" que abre o texto num popup (fechar não afeta o formulário). */
export function LinkPolitica({ rotulo = "Política de Privacidade" }: { rotulo?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <a href="/politica-de-privacidade" onClick={(e) => { e.preventDefault(); ref.current?.showModal(); }}>{rotulo}</a>
      <dialog ref={ref} className="modal modal-largo modal-politica" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <div className="cabecalho">
          <h2>Política de Privacidade</h2>
          <button type="button" className="btn-link" aria-label="Fechar" onClick={() => ref.current?.close()}>✕</button>
        </div>
        <div className="politica-rolagem"><Markdown texto={POLITICA_MD} /></div>
        <div className="acoes-linha"><button type="button" className="btn" onClick={() => ref.current?.close()}>Fechar</button></div>
      </dialog>
    </>
  );
}

/**
 * Campos de cadastro (nesta ordem): Nome, CPF, Nome da Empresa, CNPJ, Rua, Número, Município, Estado.
 * modo "cadastro": exige os 2 aceites; modo "edicao": CPF/CNPJ mascarados até clicar em editar.
 */
export function FormDadosUsuario({
  acao,
  modo,
  iniciais,
  revelar,
}: {
  acao: Acao;
  modo: "cadastro" | "edicao";
  iniciais?: DadosIniciais;
  revelar?: () => Promise<{ cpf: string | null; cnpj: string | null }>;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const edicao = modo === "edicao";
  // Na edição os documentos começam ocultos; só entram no formulário depois de revelados.
  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [revelados, setRevelados] = useState(!edicao);
  const [revelando, setRevelando] = useState(false);
  const [lgpd, setLgpd] = useState(false);
  const [politica, setPolitica] = useState(false);
  const [valido, setValido] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const cpfOk = !revelados || cpfValido(cpf);
  const cnpjOk = !revelados || cnpj.replace(/\D/g, "") === "" || cnpjValido(cnpj);
  const podeEnviar = valido && cpfOk && cnpjOk && (edicao || (lgpd && politica)) && !pendente;
  const revalidar = () => setValido(Boolean(formRef.current?.checkValidity()));
  useEffect(() => revalidar(), []);

  async function mostrarDocumentos() {
    if (!revelar) return;
    setRevelando(true);
    const d = await revelar().catch(() => null);
    setRevelando(false);
    if (!d) return;
    setCpf(mascaraCpf(d.cpf ?? ""));
    setCnpj(mascaraCnpj(d.cnpj ?? ""));
    setRevelados(true);
    setTimeout(revalidar, 0);
  }

  const mostrarEmpresa = !edicao || revelados || Boolean(iniciais?.nome_empresa || iniciais?.cnpj_oculto);

  return (
    <form ref={formRef} action={enviar} className="grade-1 form-dados" onInput={revalidar} onChange={revalidar}>
      <div className="grade">
        <label className="campo"><span>Nome *</span><input name="nome" required minLength={2} defaultValue={iniciais?.nome ?? ""} autoComplete="name" /></label>

        {revelados ? (
          <label className="campo">
            <span>CPF *</span>
            <input name="cpf" required inputMode="numeric" placeholder="000.000.000-00" value={cpf}
              onChange={(e) => setCpf(mascaraCpf(e.target.value))} aria-invalid={cpf.length === 14 && !cpfValido(cpf)} />
            {cpf.length === 14 && !cpfValido(cpf) && <small className="erro-campo">CPF inválido</small>}
          </label>
        ) : (
          <div className="campo">
            <span>CPF</span>
            <div className="valor-oculto">
              <code>{iniciais?.cpf_oculto ?? "—"}</code>
              <button type="button" className="btn-link" onClick={mostrarDocumentos} disabled={revelando}>{revelando ? "…" : "Editar"}</button>
            </div>
          </div>
        )}

        {mostrarEmpresa && (
          <label className="campo"><span>Nome da Empresa</span><input name="nome_empresa" defaultValue={iniciais?.nome_empresa ?? ""} /></label>
        )}

        {revelados ? (
          <label className="campo">
            <span>CNPJ</span>
            <input name="cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" value={cnpj}
              onChange={(e) => setCnpj(mascaraCnpj(e.target.value))} aria-invalid={cnpj.length === 18 && !cnpjValido(cnpj)} />
            {cnpj.length === 18 && !cnpjValido(cnpj) && <small className="erro-campo">CNPJ inválido</small>}
          </label>
        ) : (
          iniciais?.cnpj_oculto && (
            <div className="campo">
              <span>CNPJ</span>
              <div className="valor-oculto">
                <code>{iniciais.cnpj_oculto}</code>
                <button type="button" className="btn-link" onClick={mostrarDocumentos} disabled={revelando}>Editar</button>
              </div>
            </div>
          )
        )}

        <label className="campo"><span>Rua *</span><input name="rua" required minLength={2} defaultValue={iniciais?.rua ?? ""} autoComplete="address-line1" /></label>
        <label className="campo"><span>Número *</span><input name="numero" required maxLength={20} placeholder="123-A ou S/N" defaultValue={iniciais?.numero ?? ""} /></label>
        <label className="campo"><span>Município *</span><input name="municipio" required minLength={2} defaultValue={iniciais?.municipio ?? ""} autoComplete="address-level2" /></label>
        <label className="campo">
          <span>Estado *</span>
          <select name="estado" required defaultValue={iniciais?.estado ?? ""}>
            <option value="" disabled>Selecione…</option>
            {UFS.map(([sigla, nome]) => <option key={sigla} value={sigla}>{sigla} – {nome}</option>)}
          </select>
        </label>
      </div>
      {/* documentos não revelados: o servidor mantém os valores já gravados */}
      <input type="hidden" name="documentos_revelados" value={revelados ? "1" : "0"} />

      {!edicao && (
        <div className="aceites">
          <label className="check aceite">
            <input type="checkbox" name="aceite_lgpd" required checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} />
            <span>{TEXTO_CONSENTIMENTO_LGPD}</span>
          </label>
          <label className="check aceite">
            <input type="checkbox" name="aceite_politica" required checked={politica} onChange={(e) => setPolitica(e.target.checked)} />
            <span>Li e aceito a <LinkPolitica /> da plataforma.</span>
          </label>
        </div>
      )}

      {estado.erro && <p className="aviso aviso-erro">{estado.erro}</p>}
      {estado.ok && <p className="aviso aviso-ok">✓ {estado.ok}</p>}
      <div className="acoes-linha">
        <button className="btn" type="submit" disabled={!podeEnviar}>
          {pendente ? "Salvando…" : edicao ? "Salvar" : "Concluir cadastro"}
        </button>
      </div>
    </form>
  );
}
