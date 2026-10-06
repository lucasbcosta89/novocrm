import { Campo } from "@/components/form";
import { ROTULO_PRIORIDADE, ROTULO_STATUS_OPORTUNIDADE, ROTULO_TIPO_OPORTUNIDADE } from "@/lib/rotulos";
import { PRIORIDADES, STATUS_OPORTUNIDADE, TIPOS_OPORTUNIDADE } from "@/lib/validacao";

type Opcoes = Record<string, string>;

export function Selecao({ label, name, opcoes, valor }: { label: string; name: string; opcoes: Opcoes; valor?: string }) {
  return (
    <label className="campo">
      <span>{label}</span>
      <select name={name} defaultValue={valor}>
        {Object.entries(opcoes).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
  );
}

const opcoes = (chaves: readonly string[], rotulos: Opcoes): Opcoes =>
  Object.fromEntries(chaves.map((k) => [k, rotulos[k] ?? k]));

export const OPCOES_STATUS = opcoes(STATUS_OPORTUNIDADE, ROTULO_STATUS_OPORTUNIDADE);

/** Campos do item (oportunidade/desafio), compartilhados entre criar e editar. */
export function CamposOportunidade({
  o,
  representadas,
}: {
  o?: {
    tipo: string; titulo: string; descricao: string | null; valor_estimado: number | null;
    prioridade: string; status: string; representada_id: string | null;
  };
  representadas: { id: string; nome: string }[];
}) {
  return (
    <>
      <Selecao label="Tipo *" name="tipo" opcoes={opcoes(TIPOS_OPORTUNIDADE, ROTULO_TIPO_OPORTUNIDADE)} valor={o?.tipo ?? "oportunidade"} />
      <Campo label="Título *" name="titulo" required minLength={2} defaultValue={o?.titulo} />
      <Selecao label="Prioridade" name="prioridade" opcoes={opcoes(PRIORIDADES, ROTULO_PRIORIDADE)} valor={o?.prioridade ?? "media"} />
      {o && <Selecao label="Status" name="status" opcoes={OPCOES_STATUS} valor={o.status} />}
      <Campo label="Valor estimado (R$)" name="valor_estimado" type="number" step="0.01" min="0" defaultValue={o?.valor_estimado ?? ""} />
      <label className="campo">
        <span>Representada</span>
        <select name="representada_id" defaultValue={o?.representada_id ?? ""}>
          <option value="">—</option>
          {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </label>
      <label className="campo campo-largo">
        <span>Descrição</span>
        <textarea name="descricao" rows={2} defaultValue={o?.descricao ?? ""} />
      </label>
    </>
  );
}
