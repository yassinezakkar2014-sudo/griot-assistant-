// Extraction de texte (PDF, Word, Excel, CSV, texte) et génération de documents Word.
import { createRequire } from "node:module";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

const require = createRequire(import.meta.url);
// pdf-parse/index.js exécute un test au chargement ; on importe directement la lib.
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

export const MAX_CHARS = 60000;

export async function extractText(buffer, filename = "", mimetype = "") {
  const name = filename.toLowerCase();
  let kind = "texte";
  let text = "";
  if (name.endsWith(".pdf") || mimetype === "application/pdf") {
    kind = "PDF";
    const out = await pdfParse(buffer);
    text = out.text;
  } else if (name.endsWith(".docx")) {
    kind = "Word";
    const out = await mammoth.extractRawText({ buffer });
    text = out.value;
  } else if (/\.(xlsx|xls|ods)$/.test(name)) {
    kind = "Excel";
    const wb = XLSX.read(buffer, { type: "buffer" });
    text = wb.SheetNames.map((sheet) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheet]);
      return `### Feuille « ${sheet} »\n${csv}`;
    }).join("\n\n");
  } else if (name.endsWith(".csv")) {
    kind = "CSV";
    text = buffer.toString("utf8");
  } else {
    text = buffer.toString("utf8");
  }
  text = text.replace(/\u0000/g, "").trim();
  const truncated = text.length > MAX_CHARS;
  return { kind, text: truncated ? text.slice(0, MAX_CHARS) : text, truncated, chars: text.length };
}

// Convertit un Markdown simple (titres, listes, gras) en .docx.
export async function markdownToDocx(title, markdown) {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      children.push(new Paragraph(""));
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][h[1].length - 1];
      children.push(new Paragraph({ text: h[2], heading: level }));
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const content = bullet ? bullet[1] : line;
    const runs = content.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
      part.startsWith("**") ? new TextRun({ text: part.slice(2, -2), bold: true }) : new TextRun(part)
    );
    children.push(new Paragraph({ children: runs, bullet: bullet ? { level: 0 } : undefined }));
  }
  const doc = new Document({ creator: "GRIOT", title, sections: [{ children }] });
  return Packer.toBuffer(doc);
}
