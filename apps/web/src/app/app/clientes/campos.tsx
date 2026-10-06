import { Campo } from "@/components/form";
import type { Cliente } from "@/server/clientes";

/** Campos do cliente (schema.sql), compartilhados entre criar e editar. */
export function CamposCliente({ c }: { c?: Cliente }) {
  return (
    <>
      <Campo label="Nome *" name="nome" required minLength={2} defaultValue={c?.nome} />
      <Campo label="CPF/CNPJ" name="documento" inputMode="numeric" defaultValue={c?.documento ?? ""} />
      <Campo label="E-mail" name="email" type="email" defaultValue={c?.email ?? ""} />
      <Campo label="Celular" name="celular" type="tel" defaultValue={c?.celular ?? ""} />
      <Campo label="WhatsApp" name="whatsapp" type="tel" defaultValue={c?.whatsapp ?? ""} />
      <Campo label="Cidade" name="cidade" defaultValue={c?.cidade ?? ""} />
      <Campo label="UF" name="uf" maxLength={2} defaultValue={c?.uf ?? ""} />
      <Campo label="CEP" name="cep" inputMode="numeric" defaultValue={c?.cep ?? ""} />
      <Campo label="Segmento" name="segmento" defaultValue={c?.segmento ?? ""} />
      <label className="campo campo-largo">
        <span>Anotações</span>
        <textarea name="anotacoes" rows={3} defaultValue={c?.anotacoes ?? ""} />
      </label>
    </>
  );
}
