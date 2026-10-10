// Gera src/conteudo/politica-privacidade.gerado.ts a partir de docs/politica-privacidade.md (fonte única).
// O conteúdo vai embutido no bundle: o Cloudflare Workers não tem sistema de arquivos em runtime.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(resolve(aqui, "../../../docs/politica-privacidade.md"), "utf8").replace(/\r\n/g, "\n");
const versao = md.match(/<!--\s*versao:\s*([^\s]+)\s*-->/)?.[1];
if (!versao) throw new Error("docs/politica-privacidade.md precisa da linha <!-- versao: X -->");
const corpo = md.replace(/<!--[\s\S]*?-->\n?/, "");
writeFileSync(
  resolve(aqui, "../src/conteudo/politica-privacidade.gerado.ts"),
  `// GERADO por scripts/gerar-politica.mjs a partir de docs/politica-privacidade.md — não editar à mão.\nexport const VERSAO_POLITICA = ${JSON.stringify(versao)};\nexport const POLITICA_MD = ${JSON.stringify(corpo)};\n`,
);
console.log(`politica-privacidade versão ${versao}`);
