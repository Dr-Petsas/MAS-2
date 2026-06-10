// Extract plain text from an uploaded letter so Nadine can "answer" it. Supports
// plain text and PDF (text-layer). Image-only/scanned PDFs need OCR which is not
// wired yet — we return a clear hint instead of failing, so the user can still
// paste the text manually.

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
    try {
      // Import the lib directly: the package entry runs debug code on ESM import.
      const mod = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = mod.default || mod;
      const data = await pdfParse(buf);
      const t = String(data?.text || "").trim();
      if (t) return { ok: true, text: t, kind: "pdf" };
      return { ok: false, text: "", kind: "pdf", note: "PDF enthält keinen Text-Layer (vermutlich gescannt). Bitte Text einfügen oder OCR nutzen." };
    } catch (e) {
      return { ok: false, text: "", kind: "pdf", note: "PDF-Textextraktion nicht verfügbar (" + String(e?.message || e).slice(0, 80) + "). Bitte Text einfügen." };
    }
  }

  if (kind === "image") {
    return { ok: false, text: "", kind: "image", note: "Bild erkannt — OCR ist noch nicht aktiviert. Bitte den Brieftext einfügen." };
  }

  // Last resort: try to read as UTF-8 text.
  const t = buf.toString("utf8").trim();
  if (t && /[\x20-\x7e\u00c0-\u017f]/.test(t)) return { ok: true, text: t, kind: "text" };
  return { ok: false, text: "", kind: "unknown", note: "Format nicht unterstützt. Bitte Text einfügen." };
}
