// Extract plain text from an uploaded letter so Nadine can "answer" it. Supports
// plain text, PDF (Text-Layer) und — per Hybrid-OCR (Vision-Endpoint bzw. lokal
// Tesseract) — Bilder sowie gescannte PDFs ohne Text-Layer (Seiten werden
// gerendert und erkannt).
import { ocrImage } from "./ocr.js";

/**
 * Text aus einem PDF holen. pdf-parse 2.x exportiert eine Klasse `PDFParse` und
 * versperrt den frueheren Tiefen-Import "pdf-parse/lib/pdf-parse.js" ueber das
 * exports-Feld — genau daran scheiterte der Upload im KI-Bereich des Composers
 * ("Package subpath … is not defined by exports"). Der alte Weg bleibt als
 * Rueckfallebene, falls irgendwo noch pdf-parse 1.x installiert ist.
 */
async function pdfText(buf) {
  const mod = await import("pdf-parse");
  const PDFParse = mod.PDFParse || mod.default?.PDFParse;
  if (PDFParse) {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const res = await parser.getText();
      // pdf-parse 2.x setzt Seitenmarker "-- 3 of 12 --" in den Text. Im
      // LLM-Kontext ist das nur Rauschen.
      return String(res?.text || "")
        .replace(/^[ \t]*--[ \t]*\d+[ \t]+of[ \t]+\d+[ \t]*--[ \t]*$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } finally {
      await parser.destroy?.().catch?.(() => {});
    }
  }
  const legacy = mod.default || mod;
  if (typeof legacy !== "function") throw new Error("pdf-parse: keine bekannte Schnittstelle");
  const data = await legacy(buf);
  return String(data?.text || "").trim();
}

/**
 * Gescanntes PDF lesbar machen: Seiten zu Bildern rendern und durch dieselbe
 * OCR schicken, die Fotos schon nutzt (Vision-Endpoint, sonst Tesseract).
 * Rendern kostet nichts Zusaetzliches — pdf-parse bringt @napi-rs/canvas
 * bereits mit.
 *
 * Seitendeckel, weil OCR pro Seite mehrere Sekunden braucht und der Upload
 * sonst in den Timeout des Tunnels laeuft. Ueber MAS_PDF_OCR_MAX_PAGES
 * anpassbar; die Antwort sagt ehrlich, wenn nicht alles gelesen wurde.
 */
async function pdfOcrText(buf) {
  const mod = await import("pdf-parse");
  const PDFParse = mod.PDFParse || mod.default?.PDFParse;
  if (!PDFParse) return { text: "", rendered: 0, total: 0, engine: "" };

  const maxPages = Math.max(1, Number(process.env.MAS_PDF_OCR_MAX_PAGES || 5) || 5);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    // desiredWidth statt scale: eine A4-Seite landet so unabhaengig von ihrer
    // PDF-Groesse bei rund 200 dpi — darunter verschluckt Tesseract Ziffern.
    const shot = await parser.getScreenshot({
      first: maxPages,
      desiredWidth: 2000,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const pages = shot?.pages || [];
    const total = Number(shot?.total) || pages.length;
    const parts = [];
    let engine = "";
    for (const p of pages) {
      const png = Buffer.from(p?.data || []);
      if (!png.length) continue;
      const r = await ocrImage(png, { contentType: "image/png" });
      if (r.ok && String(r.text || "").trim()) {
        parts.push(String(r.text).trim());
        engine = r.engine;
      }
    }
    return { text: parts.join("\n\n"), rendered: pages.length, total, engine };
  } finally {
    await parser.destroy?.().catch?.(() => {});
  }
}

function guessKind(filename = "", contentType = "") {
  const ct = String(contentType).toLowerCase();
  const fn = String(filename).toLowerCase();
  if (ct.includes("pdf") || fn.endsWith(".pdf")) return "pdf";
  if (ct.startsWith("image/") || /\.(png|jpe?g|gif|tiff?|bmp|webp)$/.test(fn)) return "image";
  if (ct.startsWith("text/") || /\.(txt|md|eml|csv)$/.test(fn)) return "text";
  return "unknown";
}

/**
 * @param {{ base64?: string, text?: string, filename?: string, contentType?: string }} input
 * @returns {Promise<{ok:boolean, text:string, kind:string, note?:string}>}
 */
export async function extractText({ base64, text, filename, contentType } = {}) {
  if (text && text.trim()) return { ok: true, text: text.trim(), kind: "text" };
  if (!base64) return { ok: false, text: "", kind: "none", note: "Kein Inhalt übergeben." };

  const buf = Buffer.from(String(base64).replace(/^data:[^,]+,/, ""), "base64");
  const kind = guessKind(filename, contentType);

  if (kind === "text") {
    return { ok: true, text: buf.toString("utf8").trim(), kind: "text" };
  }

  if (kind === "pdf") {
    let panne = "";
    try {
      const t = await pdfText(buf);
      if (t) return { ok: true, text: t, kind: "pdf" };
    } catch (e) {
      panne = String(e?.message || e).slice(0, 120);
    }
    // Keine Textebene (gescannt) oder Textebene unlesbar: rendern und erkennen,
    // statt den Nutzer zum Umweg über JPG/PNG zu zwingen.
    try {
      const o = await pdfOcrText(buf);
      if (o.text) {
        const rest = o.total > o.rendered ? ` Gelesen wurden die ersten ${o.rendered} von ${o.total} Seiten.` : "";
        return {
          ok: true,
          text: o.text,
          kind: "pdf-ocr",
          ocrEngine: o.engine,
          note: `Gescanntes PDF per Texterkennung gelesen (${o.engine}).${rest}`,
        };
      }
    } catch (e) {
      panne = panne || String(e?.message || e).slice(0, 120);
    }
    return {
      ok: false,
      text: "",
      kind: "pdf",
      note: panne
        ? `PDF nicht lesbar (${panne}). Bitte Text einfügen.`
        : "PDF hat keine Textebene und die Texterkennung fand nichts Lesbares (zu niedrige Auflösung?). Bitte Text einfügen.",
    };
  }

  if (kind === "image") {
    // Hybrid-OCR: Vision-Endpoint (5090-VL, falls konfiguriert) sonst Tesseract.
    const ocr = await ocrImage(buf, { contentType });
    if (ocr.ok && ocr.text) return { ok: true, text: ocr.text, kind: "image", ocrEngine: ocr.engine };
    return { ok: false, text: "", kind: "image", note: "Bild erkannt, aber OCR lieferte keinen Text (" + (ocr.note || ocr.engine) + "). Bitte den Brieftext einfügen." };
  }

  // Last resort: try to read as UTF-8 text.
  const t = buf.toString("utf8").trim();
  if (t && /[\x20-\x7e\u00c0-\u017f]/.test(t)) return { ok: true, text: t, kind: "text" };
  return { ok: false, text: "", kind: "unknown", note: "Format nicht unterstützt. Bitte Text einfügen." };
}
