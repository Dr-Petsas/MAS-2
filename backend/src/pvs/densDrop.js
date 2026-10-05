// Lokale Ablage der DENS-Karteinotiz. Schreibt nie nach DensOffice\Bank.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNote, sanitizePatNr, safeFilePart, toExtDokXml } from "./densNote.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DROP_DIR = path.join(__dirname, "..", "data", "dens-drop");
export const DENS_EXCHANGE_DIR = "C:\\Dens\\DensOffice\\Module\\Datenaustausch";

const BLOCKED = [
  path.resolve("C:\\Dens\\DensOffice\\Bank"),
  path.resolve("C:\\Dens\\DensOffice\\DensZtrl"),
];

function s(v) {
  return String(v == null ? "" : v).trim();
}

export function isBlockedDir(dir) {
  const resolved = path.resolve(dir);
  return BLOCKED.some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

export function resolveDropDir(configured = "") {
  const fallback = fs.existsSync(path.dirname(DENS_EXCHANGE_DIR))
    ? DENS_EXCHANGE_DIR
    : DEFAULT_DROP_DIR;
  const raw = s(configured) || fallback;
  const resolved = path.resolve(raw);
  if (isBlockedDir(resolved)) {
    const err = new Error("dens_drop_blocked");
    err.code = "dens_drop_blocked";
    throw err;
  }
  return resolved;
}

export function writeNoteDrop(input = {}, configuredDir = "") {
  const note = input.stem && input.xml && input.text != null ? input : buildNote(input);
  const dir = resolveDropDir(configuredDir);
  fs.mkdirSync(dir, { recursive: true });
  const txtPath = path.join(dir, `${note.stem}.txt`);
  const xmlPath = path.join(dir, `${note.stem}.xml`);
  fs.writeFileSync(txtPath, note.text.endsWith("\n") ? note.text : `${note.text}\n`, "utf8");
  fs.writeFileSync(xmlPath, note.xml, "utf8");
  return {
    dir,
    txt: txtPath,
    xml: xmlPath,
    kurz: note.kurz,
    patNr: note.patNr,
    stem: note.stem,
  };
}

export function writePdfDrop(input = {}, configuredDir = "") {
  const dir = resolveDropDir(configuredDir);
  fs.mkdirSync(dir, { recursive: true });
  const patNr = sanitizePatNr(input.patNr);
  const who = patNr || safeFilePart([input.lastName, input.firstName].filter(Boolean).join("-"), 40);
  const written = [];
  for (const file of input.files || []) {
    const buf = file.buffer;
    if (!buf || !buf.length) continue;
    const name = safeFilePart(file.name || "Dokument");
    const stem = `${who}-${name}`;
    const pdfPath = path.join(dir, `${stem}.pdf`);
    const xmlPath = path.join(dir, `${stem}.extdok.xml`);
    fs.writeFileSync(pdfPath, buf);
    fs.writeFileSync(xmlPath, toExtDokXml({
      patNr,
      kurz: name,
      dateiname: pdfPath,
      anmerkung: "Pickadoc",
    }));
    written.push({ pdf: pdfPath, xml: xmlPath, name, bytes: buf.length });
  }
  return { dir, files: written };
}
