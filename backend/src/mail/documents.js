import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { appendEvent } from "../brain/eventStore.js";
import { linkEventToCase } from "../brain/caseStore.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { chat, strongLlm } from "./llm.js";
import { assessCritical } from "../brain/critical.js";

// ============================================================================
// Hochgeladene/eingefügte Unterlagen (Briefe, PDFs, gescannte Schreiben), die
// Nadine als Kontext für einen Brief nutzt. Storage:
//   clients/{clientId}/mas_documents/{docId}   — mas_*, tenant-isoliert.
//
// Warum ein eigener Store und nicht nur `sourceText` im Entwurf?
//  - Der Event-Envelope referenziert Rohdaten NUR per payloadRef {kind,id}
//    (events.buildEvent verwirft alles andere) — der Volltext muss also
//    irgendwo dauerhaft liegen, damit ein FOLGE-Schreiben ihn wieder findet.
//  - Damit fließt die Unterlage dauerhaft ins gemeinsame Gehirn: sie wird als
//    Event an den Vorgang/Patienten gehängt und ist über den Vorgang wieder
//    abrufbar (siehe listDocumentsForCase → Kontext-Assembler).
//
// Der Volltext wird NICHT in den Event kopiert (Datensparsamkeit), sondern hier
// gespeichert und per payloadRef {kind:"document", id} referenziert.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const COLLECTION = "mas_documents";
const MAX_TEXT = 60000; // harte Obergrenze pro Dokument (sehr großzügig)

function col(clientId) {
  return masCollection(clientId, COLLECTION);
}

function clip(s, n) {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) + " …" : t;
}

// Stabile, inhaltsbasierte ID: derselbe Text (für denselben Mandanten) wird nie
// doppelt abgelegt — ein erneuter Upload/Redraft ist ein idempotenter No-op.
function docId(clientId, text, filename) {
  const h = createHash("sha256").update(`${clientId}|${filename || ""}|${String(text || "")}`).digest("hex").slice(0, 24);
  return `doc_${h}`;
}

// Ab dieser Länge lohnt eine 5090-Verdichtung; kürzere Unterlagen fließen
// ohnehin im Volltext in den Kontext (kein Digest nötig).
const DIGEST_MIN_CHARS = 1200;

/**
 * Verdichte eine Unterlage mit dem STARKEN 5090-Modell (qwen3.6) zu einem
 * faktentreuen Steckbrief: Art/Absender, Kernanliegen, Forderungen/Fragen,
 * Aktenzeichen, Fristen (mit Datum), Beträge. Erfindet nichts — fehlende
 * Angaben werden weggelassen. Gibt "" zurück, wenn das Modell nicht erreichbar
 * ist (Aufrufer nutzt dann den Volltext-Fallback).
 *
 * @param {string} text
 * @param {{ baseUrl?:string, model?:string, timeoutMs?:number }} [opts]
 * @returns {Promise<string>}
 */
export async function summarizeDocument(text, opts = {}) {
  const body = clip(text, 16000);
  if (!body) return "";
  const s = strongLlm();
  const res = await chat(
    [
      {
        role: "system",
        content:
          "Du bist ein präziser Extraktor für eingehende Schreiben (Briefe, E-Mails, Bescheide, Rechnungen). " +
          "Erstelle einen knappen deutschen Steckbrief in Stichpunkten mit — sofern vorhanden — genau diesen Punkten: " +
          "Art/Absender des Schreibens; Kernanliegen; konkrete Forderungen oder Fragen; Aktenzeichen/Referenz; " +
          "Fristen und Termine (mit exaktem Datum); Beträge (mit Währung). " +
          "Übernimm Zahlen, Daten und Aktenzeichen WORTGETREU. Erfinde nichts — was nicht dasteht, lässt du weg. " +
          "Keine Anrede, keine Floskeln, nur die Fakten.",
      },
      { role: "user", content: body },
    ],
    { temperature: 0.1, maxTokens: 500, timeoutMs: 90000, baseUrl: s.base, model: s.model }
  );
  return res.ok ? res.text : "";
}

/**
 * Persistiere eine Unterlage dauerhaft im gemeinsamen Gehirn und hänge sie an
 * den passenden Vorgang (über die Patienten-/Empfänger-Identität).
 *
 * @param {string} clientId
 * @param {{ text:string, filename?:string, kind?:string, digest?:string,
 *   patientName?:string, recipient?:string, uploadedBy?:string, caseId?:string }} input
 * @returns {Promise<{ok:boolean, id?:string, caseId?:string|null, eventId?:string|null, created?:boolean, reason?:string}>}
 */
export async function saveDocument(clientId, input = {}) {
  const text = clip(input.text, MAX_TEXT);
  if (!text) return { ok: false, reason: "empty_text" };

  const filename = String(input.filename || "").trim() || "Unterlage";
  const kind = String(input.kind || "").trim() || "text";
  const uploadedBy = String(input.uploadedBy || "").trim() || "Team";

  // Lange Unterlagen: vom 5090 verstehen lassen (faktentreuer Steckbrief) statt
  // sie später blind zu kappen. Scheitert das Modell, bleibt digest leer → der
  // Kontext-Assembler fällt auf den Volltext zurück.
  let digest = String(input.digest || "").trim() || null;
  if (!digest && text.length >= DIGEST_MIN_CHARS) {
    digest = (await summarizeDocument(text).catch(() => "")) || null;
  }
  const nameHint =
    String(input.patientName || "").trim() ||
    String(input.recipient || "").split(/\r?\n/)[0]?.trim() ||
    "";

  const id = docId(clientId, text, filename);
  const ref = col(clientId).doc(id);

  // Idempotenz: schon vorhanden → nur zurückgeben (keine Dublette, kein 2. Event).
  const existing = await ref.get().catch(() => null);
  if (existing && existing.exists) {
    const d = existing.data();
    return { ok: true, id, caseId: d.caseId || null, eventId: d.eventId || null, created: false };
  }

  // Wen betrifft die Unterlage? Patient auflösen, damit sie auf DESSEN Vorgang
  // threadet (sonst als unbekannter Absender an einen frischen/gefundenen Fall).
  let subject = { name: nameHint };
  let cpKind = "unknown";
  if (nameHint) {
    const subj = await resolvePatientSubject(clientId, nameHint).catch(() => null);
    if (subj?.patientId) {
      subject = { patientId: subj.patientId, name: subj.name || nameHint, matchStatus: "matched", matchMethod: subj.matchMethod || "name" };
      cpKind = "patient";
    }
  }

  // W-STABIL-8: Gescannte Post laeuft durch DENSELBEN Waechter wie Mail und
  // Telefonat — Frist + Rechnungssignal + Betrag landen am Event, damit der
  // Brief in der Wiedervorlage auftaucht statt still im Archiv zu liegen.
  // (Vorher bekam ein Scan mit "Widerspruch bis 15.08." KEIN deadlineMs.)
  const crit = assessCritical({ subject: filename, text });
  const signals = {};
  const tags = [];
  if (crit.critical) {
    signals.critical = true;
    tags.push("kritisch", crit.category);
  }
  if (crit.invoiceOrPayment) {
    signals.invoiceOrPayment = true;
    tags.push("rechnung");
  }

  const { event } = await appendEvent(clientId, {
    channel: "nadine_letter",
    direction: "in",
    type: "interaction",
    counterparty: { kind: cpKind, name: nameHint || "Unbekannt", ref: null },
    subject,
    signals,
    summary: `${crit.critical ? `[${crit.label}] ` : ""}Unterlage übernommen: ${filename}\n\n${clip(text, 800)}`,
    deadlineMs: crit.deadlineMs,
    deadlineStrong: crit.deadlineStrong,
    amountCents: crit.amountCents,
    tags,
    extractor: "nadine@upload",
    payloadRef: { kind: "document", id },
  });

  let caseLink = null;
  try { caseLink = await linkEventToCase(clientId, event, { by: uploadedBy }); } catch { caseLink = null; }
  const caseId = (input.caseId || caseLink?.caseId || "").trim() || null;

  await ref.set({
    id,
    clientId,
    filename,
    kind,
    text,
    digest,
    textLength: text.length,
    uploadedBy,
    patientName: nameHint || null,
    recipient: String(input.recipient || "").trim() || null,
    caseId,
    eventId: event.id,
    createdAt: FieldValue.serverTimestamp(),
    ts: Date.now(),
  });

  return { ok: true, id, caseId, eventId: event.id, created: true };
}

/** Eine gespeicherte Unterlage per ID, oder null. */
export async function getDocument(clientId, id) {
  const snap = await col(clientId).doc(String(id || "").trim()).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Alle Unterlagen eines Vorgangs (neueste zuerst). Equality-only Query
 * (Single-Field-Index) + In-Memory-Sortierung → kein Composite-Index nötig.
 */
export async function listDocumentsForCase(clientId, caseId, limit = 10) {
  const id = String(caseId || "").trim();
  if (!id) return [];
  const snap = await col(clientId).where("caseId", "==", id).limit(50).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return rows.slice(0, Math.max(1, limit));
}
