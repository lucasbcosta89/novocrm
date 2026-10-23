// Gera public/templates/modelo-cadastro-produtos.xlsx (modelo da importação de produtos).
// O cabeçalho precisa bater com ROTULOS de src/lib/import/validarCabecalho.ts — rode de novo se mudar.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aqui, "../public/templates/modelo-cadastro-produtos.xlsx");

const cabecalho = ["SKU", "Nome", "Unidade", "NCM", "Categoria", "Preço Padrão", "Desconto Máximo", "Comissão", "Descrição"];
const produtos = XLSX.utils.aoa_to_sheet([cabecalho]);
produtos["!cols"] = [14, 36, 10, 12, 18, 14, 16, 12, 48].map((wch) => ({ wch }));
// NCM e SKU como texto (preserva zeros à esquerda)
for (let r = 1; r <= 1000; r++) {
  for (const c of [0, 3]) {
    const ref = XLSX.utils.encode_cell({ r, c });
    produtos[ref] = { t: "s", v: "", z: "@" };
  }
}
produtos["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: cabecalho.length - 1 } });

const instrucoes = XLSX.utils.aoa_to_sheet([
  ["Como preencher"],
  [""],
  ["Preencha a aba Produtos, a partir da linha 2. Não altere nem renomeie a linha 1 (cabeçalho)."],
  ["Obrigatórios: SKU, Nome, Unidade e NCM."],
  ["SKU: código único do produto na representada (até 60 caracteres). Repetir um SKU já cadastrado atualiza o produto."],
  ["Unidade: até 10 caracteres (ex.: UN, CX, PC, KG). Vazio = UN."],
  ["NCM: 8 dígitos; pontos são aceitos (ex.: 6109.10.00)."],
  ["Opcionais: Categoria, Preço Padrão, Desconto Máximo (%), Comissão (%) e Descrição — podem ser preenchidos depois no produto."],
  ["Valores: 1.234,56 ou 1234,56. Percentuais: 10, 10% ou 0,10."],
  ["Máximo de 5000 produtos por arquivo e 5 MB."],
]);
instrucoes["!cols"] = [{ wch: 110 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, produtos, "Produtos");
XLSX.utils.book_append_sheet(wb, instrucoes, "Instruções");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log("modelo gerado:", destino);
