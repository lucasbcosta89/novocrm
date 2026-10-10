/** CPF/CNPJ: validação de dígitos verificadores, máscaras de digitação e ocultação para exibição. */

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function cpfValido(valor: string): boolean {
  const d = digitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(valor: string): boolean {
  const d = digitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((t, p, i) => t + Number(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** Máscara progressiva enquanto digita: 000.000.000-00 */
export function mascaraCpf(valor: string): string {
  const d = digitos(valor).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** Máscara progressiva enquanto digita: 00.000.000/0000-00 */
export function mascaraCnpj(valor: string): string {
  const d = digitos(valor).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Exibição fora da edição: oculta os dígitos verificadores (000.000.000-**). */
export const ocultarCpf = (cpf: string | null) => (cpf ? `${mascaraCpf(cpf).slice(0, 12)}**` : null);
export const ocultarCnpj = (cnpj: string | null) => (cnpj ? `${mascaraCnpj(cnpj).slice(0, 16)}**` : null);
