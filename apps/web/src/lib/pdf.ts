import "server-only";
import type { Content, ContentTable, TDocumentDefinitions } from "pdfmake/interfaces";
// Build "browser" do pdfmake: JS puro + fontes Roboto embutidas (vfs) → roda em Node e no Workers, sem fs.
import pdfMakeBuild from "pdfmake/build/pdfmake";
import vfsFonts from "pdfmake/build/vfs_fonts";

type PdfMake = {
  addVirtualFileSystem?: (vfs: unknown) => void;
  vfs?: unknown;
  createPdf(doc: TDocumentDefinitions): { getBuffer(): Promise<Uint8Array> };
};

const pdfMake = pdfMakeBuild as unknown as PdfMake;
if (pdfMake.addVirtualFileSystem) pdfMake.addVirtualFileSystem(vfsFonts);
else pdfMake.vfs = vfsFonts;

export const COR = { primaria: "#1f5eff", texto: "#1a1d23", suave: "#5f6672", borda: "#e2e5ea", fundo: "#f6f7f9", alerta: "#c62828" };

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <rect width="36" height="36" rx="8" fill="${COR.primaria}"/>
  <text x="18" y="23" font-family="Helvetica" font-size="14" font-weight="bold" fill="#fff" text-anchor="middle">CM</text>
</svg>`;

/** Cabeçalho padrão com logo, título e subtítulo. */
export function cabecalho(titulo: string, subtitulo?: string): Content {
  return {
    columns: [
      { svg: LOGO_SVG, width: 36 },
      {
        stack: [
          { text: titulo, style: "titulo" },
          ...(subtitulo ? [{ text: subtitulo, style: "subtitulo" }] : []),
        ],
        margin: [10, 0, 0, 0],
      },
      { text: "CRM Multimarcas", alignment: "right", style: "marca", width: "auto" },
    ],
    margin: [0, 0, 0, 16],
  };
}

export type Coluna<T> = {
  titulo: string;
  valor: (linha: T) => string | number;
  largura?: number | "*" | "auto";
  alinhar?: "left" | "right" | "center";
};

/** Tabela zebrada com cabeçalho repetido em cada página (headerRows) e linha de totais opcional. */
export function tabela<T>(colunas: Coluna<T>[], linhas: T[], opts: { vazio?: string; totais?: (string | number)[] } = {}): Content {
  if (linhas.length === 0) return { text: opts.vazio ?? "Sem registros.", style: "vazio" };
  const body: ContentTable["table"]["body"] = [
    colunas.map((c) => ({ text: c.titulo, style: "th", alignment: c.alinhar ?? "left" })),
    ...linhas.map((l) => colunas.map((c) => ({ text: String(c.valor(l)), alignment: c.alinhar ?? "left" }))),
  ];
  if (opts.totais) body.push(opts.totais.map((t, i) => ({ text: String(t), bold: true, alignment: colunas[i]?.alinhar ?? "left" })));
  return {
    table: { headerRows: 1, dontBreakRows: true, widths: colunas.map((c) => c.largura ?? "*"), body },
    layout: {
      fillColor: (i: number) => (i === 0 ? COR.fundo : null),
      hLineColor: () => COR.borda,
      vLineWidth: () => 0,
      hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    style: "tabela",
  };
}

/** Quebra de página (antes do próximo bloco). */
export const quebraPagina = (): Content => ({ text: "", pageBreak: "after" });

export function secao(titulo: string): Content {
  return { text: titulo, style: "secao" };
}

/** Linha de indicadores (cards). */
export function indicadores(itens: { rotulo: string; valor: string }[]): Content {
  return {
    columns: itens.map((i) => ({
      stack: [{ text: i.rotulo, style: "rotulo" }, { text: i.valor, style: "indicador" }],
    })),
    columnGap: 12,
    margin: [0, 0, 0, 12],
  };
}

export async function gerarPdf(conteudo: Content[], opts: { titulo: string; paisagem?: boolean }): Promise<Uint8Array> {
  const geradoEm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const doc: TDocumentDefinitions = {
    info: { title: opts.titulo, creator: "CRM Multimarcas" },
    pageSize: "A4",
    pageOrientation: opts.paisagem ? "landscape" : "portrait",
    pageMargins: [36, 36, 36, 48],
    content: conteudo,
    footer: (pagina, total) => ({
      columns: [
        { text: `Gerado em ${geradoEm}`, style: "rodape" },
        { text: `${pagina} / ${total}`, alignment: "right", style: "rodape" },
      ],
      margin: [36, 16, 36, 0],
    }),
    defaultStyle: { font: "Roboto", fontSize: 9, color: COR.texto },
    styles: {
      titulo: { fontSize: 16, bold: true },
      subtitulo: { fontSize: 10, color: COR.suave, margin: [0, 2, 0, 0] },
      marca: { fontSize: 8, color: COR.suave },
      secao: { fontSize: 12, bold: true, margin: [0, 14, 0, 6], color: COR.primaria },
      th: { bold: true, fontSize: 8, color: COR.suave },
      tabela: { margin: [0, 0, 0, 8] },
      vazio: { italics: true, color: COR.suave, margin: [0, 0, 0, 8] },
      rotulo: { fontSize: 8, color: COR.suave },
      indicador: { fontSize: 14, bold: true },
      rodape: { fontSize: 7, color: COR.suave },
    },
  };
  return pdfMake.createPdf(doc).getBuffer();
}
