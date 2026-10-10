// Gera src/conteudo/logo-feito-com.gerado.ts a partir de assets/logo-feito-com.png (lido do disco, nunca URL externa).
// Recorta a margem transparente, gera com 256 px de altura e embute em base64 para o pdfmake (images).
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const aqui = dirname(fileURLToPath(import.meta.url));
const origem = resolve(aqui, "../../../assets/logo-feito-com.png");
const png = await sharp(origem).trim().resize({ height: 256, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true }).toBuffer();
writeFileSync(
  resolve(aqui, "../src/conteudo/logo-feito-com.gerado.ts"),
  `// GERADO por scripts/gerar-logo.mjs a partir de assets/logo-feito-com.png — não editar à mão.\nexport const LOGO_FEITO_COM = "data:image/png;base64,${png.toString("base64")}";\n`,
);
console.log(`logo-feito-com: ${png.length} bytes`);
