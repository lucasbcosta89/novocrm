import { Campo } from "@/components/form";
import { UFS } from "@/lib/ufs";

type Empresa = {
  nome?: string; cnpj?: string | null; rua?: string | null; numero?: string | null; complemento?: string | null;
  cep?: string | null; municipio?: string | null; estado?: string | null; email?: string | null; telefone?: string | null;
};

/** Campos de empresa: usados no cadastro da representada (matriz) e nos pontos de faturamento. */
export function CamposEmpresa({ e, tituloEndereco = "Endereço da Matriz" }: { e?: Empresa; tituloEndereco?: string }) {
  return (
    <>
      <div className="grade">
        <Campo label="Nome *" name="nome" required minLength={2} defaultValue={e?.nome ?? ""} />
        <Campo label="CNPJ" name="cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" defaultValue={e?.cnpj ?? ""} />
      </div>
      <fieldset className="secao-form">
        <legend>{tituloEndereco}</legend>
        <div className="grade">
          <Campo label="Rua" name="rua" defaultValue={e?.rua ?? ""} autoComplete="address-line1" />
          <Campo label="Nº" name="numero" defaultValue={e?.numero ?? ""} placeholder="123 ou S/N" />
          <Campo label="Complemento" name="complemento" defaultValue={e?.complemento ?? ""} />
          <Campo label="CEP" name="cep" inputMode="numeric" placeholder="00000-000" defaultValue={e?.cep ?? ""} />
          <Campo label="Município" name="municipio" defaultValue={e?.municipio ?? ""} />
          <label className="campo">
            <span>Estado</span>
            <select name="estado" defaultValue={e?.estado ?? ""}>
              <option value="">Selecione…</option>
              {UFS.map(([sigla, nome]) => <option key={sigla} value={sigla}>{sigla} – {nome}</option>)}
            </select>
          </label>
          <Campo label="E-mail" name="email" type="email" defaultValue={e?.email ?? ""} />
          <Campo label="Telefone" name="telefone" type="tel" defaultValue={e?.telefone ?? ""} />
        </div>
      </fieldset>
    </>
  );
}

/** Endereço em uma linha para exibição. */
export function enderecoTexto(e: Empresa): string {
  const cep = e.cep ? `CEP ${e.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "";
  const linha1 = [e.rua, e.numero].filter(Boolean).join(", ");
  return [linha1, e.complemento, [e.municipio, e.estado].filter(Boolean).join("/"), cep].filter(Boolean).join(" · ") || "—";
}
