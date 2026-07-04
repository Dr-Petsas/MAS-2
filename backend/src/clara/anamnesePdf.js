import admin from "../firebase.js";
import { isAffirmative, isNegative, catFor, clip, topicFromQuestion } from "./anamnese.js";

// ============================================================================
// Anamnese aus unterschriebenen PDFs (04.07.2026)
// ============================================================================
// Die Plattform loescht ``formRows`` beim Signieren — uebrig bleibt NUR das
// PDF in Storage: clients/{c}/locations/{l}/patients/{p}/documents/{docId}.pdf
// Bisher hiess das "nicht maschinell lesbar". Stimmt aber nicht: pdfmake
// (Cloud Function saveDocumentAndCreatePDF) schreibt eine ECHTE Textebene,
// kein Scan. Kaestchen sind Fontello-Glyphen im Text:
//   \ue800 = angekreuzt, \uf096 = leer.
// Damit laesst sich der Bogen zeilenweise als Frage/Antwort-Struktur
// rekonstruieren — deterministisch, ohne OCR, ohne LLM:
//
//   Leiden Sie unter Allergien?     <- Frage (endet mit ?)
//   [X] Ja                          <- angekreuzte Antwort
//   Welche?                         <- Folgefrage
//   Nickel                          <- Freitext des Patienten
//   [ ] Nein
//
// Die Findings-Heuristik (NOTABLE-Kategorien) ist DIESELBE wie fuer
// unsignierte Boegen (anamnese.js) — beide Wege muessen dieselben Flags
// melden. Ergebnis wird pro Dokument in Firestore gecacht
// (mas_anamnese_pdf/{docId}), denn ein signiertes PDF aendert sich nie mehr.
// NUR LESEN: weder PDF noch pdocument werden veraendert.
//
// Bewusste Grenze: Freitext-Antworten auf reine Text-Labels ("Sonstige
// Stoffwechsel-Erkrankungen:") sind im flachen Textdump nicht sicher von
// Sektions-Ueberschriften ("Allergien") zu unterscheiden. Wir nehmen solchen
// Freitext nur, wenn der Formularfluss ihn stuetzt — lieber einen seltenen
// Sonstige-Eintrag verpassen als aus Ueberschriften Befunde erfinden.
// Ja/Nein-Fragen samt "Welche?"-Freitext (der Normalfall) sind sicher.
// ============================================================================

const CACHE_COL = "mas_anamnese_pdf";
const CACHE_VERSION = 2; // hochzaehlen, wenn Parser/Heuristik sich aendern

const CHECKED = "\ue800";
const UNCHECKED = "\uf096";

// Kopf-/Fusszeilen des PDF-Generators — kein Patienteninhalt.
const BOILERPLATE = [
  /^Seite \d+ von \d+$/i,
  /^Unterschrift /i,
  /^Geburtsdatum:/i,
  /\|\s*Telefon\s/i, // Praxis-Fusszeile "Strasse | PLZ Ort | Telefon ..."
];

function istBoilerplate(zeile) {
  return BOILERPLATE.some((re) => re.test(zeile));
}

// Der Seiten-Fuss ist ein BLOCK: "Erstellt von Pickadoc am ..." + Praxisname
// + Adresszeile + "Seite x von y", danach der Umbruch-Marker "-- x of y --".
// Der Praxisname ist frei gewaehlt (CeraWhite, med dent ...) und darf NIE als
// Patientenangabe durchgehen — deshalb alles vom Erstellt-von bis zum Marker
// ueberspringen.
const FOOTER_START = /^Erstellt von /i;
const PAGE_BREAK = /^-- \d+ of \d+ --$/;

/**
 * PDF-Textebene -> Liste {frage, antworten:[{checked,label}], freitexte:[]}.
 * Zeilenweise Zustandsmaschine mit Ein-Zeilen-Lookahead:
 *   - Kaestchen-Zeilen (Glyph am Anfang) sind Antworten der laufenden Frage.
 *   - Frage-Zeilen enden mit "?"/":" ODER beginnen mit einem Frage-Verb
 *     ("Leiden Sie ...") — manche Boegen vergessen das Fragezeichen.
 *   - Folgefragen ("Welche?") im bejahten Zweig bleiben Teil der Frage;
 *     die naechste nackte Textzeile ist dann die Patientenangabe.
 *   - Alles andere gilt nur als Freitext, wenn der Kontext es stuetzt —
 *     sonst ist es Ueberschrift/Adresse und setzt den Kontext zurueck.
 */
export function parseAnamneseText(text) {
  // \u0000: das Leerzeichen zwischen Kaestchen-Glyphe und Label steht im PDF
  // im Fontello-Font, dessen cmap kein Space kennt -> pdf-parse liefert NUL.
  const roh = String(text || "")
    .split(/\r?\n/)
    .map((z) => z.replace(/\u0000/g, " ").trim());

  // Fusszeilen-Bloecke entfernen (Erstellt-von ... bis Seitenumbruch-Marker).
  const zeilen = [];
  let imFooter = false;
  for (const z of roh) {
    if (!z) continue;
    if (FOOTER_START.test(z)) { imFooter = true; continue; }
    if (PAGE_BREAK.test(z)) { imFooter = false; continue; }
    if (imFooter || istBoilerplate(z)) continue;
    zeilen.push(z);
  }

  const fragen = [];
  let akt = null;       // laufende Frage
  let inJaZweig = false; // letzte ANGEKREUZTE Antwort war bejahend (nicht "Nein")

  const istKaestchen = (z) => z.startsWith(CHECKED) || z.startsWith(UNCHECKED);
  const istFrage = (z) => z.endsWith("?") || /:$/.test(z)
    || /^(leiden|haben|nehmen|besteht|bestehen|sind|waren|wurden|reagieren|tragen|rauchen|trinken|erwarten|gibt|gab|hatten|nutzen|verwenden|bekommen|erhalten|leidet)\s+(sie|es|bei ihnen|ihr kind)\b/i.test(z);
  const istFolgefrage = (z) => /^(welche|wenn ja|bitte|seit wann|wie oft|wie viele|was genau|wogegen|worauf)/i.test(z);

  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];

    if (istKaestchen(z)) {
      const checked = z.startsWith(CHECKED);
      const label = z.slice(1).trim();
      if (!akt) { akt = { frage: "", antworten: [], freitexte: [] }; fragen.push(akt); }
      akt.antworten.push({ checked, label });
      // Freitext gehoert nur DIREKT hinter die bejahte Antwort (+"Welche?").
      // Jede weitere Kaestchen-Zeile ("[ ] Nein") beendet den Ja-Zweig, sonst
      // wuerde die naechste Sektions-Ueberschrift als Freitext eingefangen.
      inJaZweig = checked ? !isNegative(label) : false;
      continue;
    }

    if (istFrage(z)) {
      if (akt && inJaZweig && istFolgefrage(z)) continue; // "Welche?" -> Freitext folgt
      akt = { frage: z, antworten: [], freitexte: [] };
      fragen.push(akt);
      inJaZweig = false;
      continue;
    }

    // Nackte Textzeile.
    if (akt && inJaZweig) { akt.freitexte.push(z); continue; }
    if (akt && akt.antworten.length === 0 && akt.frage) {
      // Offene Frage ("Sonstige ...:"): Freitext nur akzeptieren, wenn der
      // Formularfluss direkt weitergeht (naechste Zeile ist ein Kaestchen) —
      // sonst ist die Zeile eine Sektions-Ueberschrift ("Allergien").
      const next = zeilen[i + 1] || "";
      if (istKaestchen(next)) { akt.freitexte.push(z); continue; }
    }
    // Ueberschrift / Adresse / Rauschen: Kontext zuruecksetzen.
    akt = null;
    inJaZweig = false;
  }
  return fragen;
}

/** Frage/Antwort-Struktur -> Findings mit den NOTABLE-Kategorien. */
export function findingsAusFragen(fragen) {
  const out = [];
  for (const f of fragen) {
    const qCat = catFor(f.frage);
    const checked = f.antworten.filter((a) => a.checked);
    const bejaht = checked.some((a) => isAffirmative(a.label));
    const verneint = checked.length > 0 && checked.every((a) => isNegative(a.label));
    const frei = f.freitexte.map((t) => clip(t, 80)).filter(Boolean);

    if (qCat && bejaht) {
      out.push({ category: qCat, text: frei.length ? frei.join(", ") : (topicFromQuestion(f.frage) || "ja") });
      continue;
    }
    if (qCat && !f.antworten.length && frei.length) {
      // Offene Frage ("Sonstige Stoffwechsel-Erkrankungen:") mit Freitext.
      out.push({ category: qCat, text: frei.join(", ") });
      continue;
    }
    if (!verneint) {
      // Angekreuzte Antwort, die SELBST auffaellig ist ("[X] Ich schnarche",
      // Mehrfachauswahl ohne Ja/Nein) — Kategorie aus dem Antwortlabel.
      for (const a of checked) {
        const cat = qCat || catFor(a.label);
        if (cat && a.label && !isNegative(a.label) && !isAffirmative(a.label)) {
          out.push({ category: cat, text: clip(a.label, 80) });
        }
      }
      // Freitext, der selbst auffaellig ist — NUR bei reinen Text-Fragen
      // (keine Kaestchen), sonst faengt man verirrte Ueberschriften ein.
      if (!qCat && !f.antworten.length) {
        for (const t of frei) {
          const cat = catFor(t);
          if (cat) out.push({ category: cat, text: clip(t, 80) });
        }
      }
    }
  }
  // Dedupe wie in anamnese.js.
  const seen = new Set();
  const dedup = [];
  for (const f of out) {
    const key = `${f.category}|${f.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(f);
  }
  return dedup;
}

async function ladePdfText(clientId, locationId, patientId, docId) {
  const pfad = `clients/${clientId}/locations/${locationId}/patients/${patientId}/documents/${docId}.pdf`;
  const file = admin.storage().bucket().file(pfad);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  // Lazy-Import: pdf-parse laedt pdf.js — nur zahlen, wenn wirklich ein
  // signiertes PDF gelesen werden muss.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const res = await parser.getText();
    return String(res?.text || "");
  } finally {
    await parser.destroy?.().catch?.(() => {});
  }
}

function _tsToMs(v) {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * Findings eines SIGNIERTEN Anamnese-Dokuments — aus dem Firestore-Cache oder
 * frisch aus dem PDF. Liefert {findings, bogenMs, ok} oder null (kein PDF).
 */
export async function findingsAusSigniertemPdf(clientId, locationId, patientId, pdoc) {
  // ACHTUNG Namensfalle: das FELD ``docId`` im pdocument ist die Vorlagen-ID.
  // Der PDF-Dateiname ist die Dokument-ID selbst (pdfService: formId = pDoc.id).
  const docId = String(pdoc?.id || "").trim();
  if (!docId) return null;
  const db = admin.firestore();
  const cacheRef = db.collection("clients").doc(clientId).collection(CACHE_COL).doc(docId);

  try {
    const snap = await cacheRef.get();
    const c = snap.exists ? snap.data() : null;
    if (c && c.version === CACHE_VERSION && Array.isArray(c.findings)) {
      return { ok: true, findings: c.findings, bogenMs: c.bogenMs || 0, quelle: "pdf" };
    }
  } catch { /* Cache ist Komfort */ }

  let text;
  try {
    text = await ladePdfText(clientId, locationId, patientId, docId);
  } catch {
    return null; // Download/Parse fehlgeschlagen -> ehrlich "nicht lesbar"
  }
  if (!text || !text.trim()) return null;

  const fragen = parseAnamneseText(text);
  // Ohne erkennbare Frage/Kaestchen-Struktur (fremdes/gescanntes PDF) lieber
  // gar nichts behaupten als Unsinn.
  const hatStruktur = fragen.some((f) => f.antworten.length > 0);
  if (!hatStruktur) return null;

  const findings = findingsAusFragen(fragen);
  const bogenMs = _tsToMs(pdoc?.pdfCreatedAt) || _tsToMs(pdoc?.createdAt);

  try {
    await cacheRef.set({
      version: CACHE_VERSION,
      patientId,
      findings,
      bogenMs,
      fragenGesamt: fragen.length,
      extrahiertAm: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch { /* Cache ist Komfort */ }

  return { ok: true, findings, bogenMs, quelle: "pdf" };
}
