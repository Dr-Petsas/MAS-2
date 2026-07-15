import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { appendEvent } from "../brain/eventStore.js";
import { linkEventToCase } from "../brain/caseStore.js";
import { resolvePatientSubject } from "../brain/identity.js";

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
  const digest = String(input.digest || "").trim() || null;
  const uploadedBy = String(input.uploadedBy || "").trim() || "Team";
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

  const { event } = await appendEvent(clientId, {
    channel: "nadine_letter",
    direction: "in",
    type: "interaction",
    counterparty: { kind: cpKind, name: nameHint || "Unbekannt", ref: null },
    subject,
    summary: `Unterlage übernommen: ${filename}\n\n${clip(text, 800)}`,
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
