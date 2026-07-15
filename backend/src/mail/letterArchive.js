import { randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// ============================================================================
// Briefarchiv. Storage: clients/{clientId}/mas_letters/{letterId} — mas_*,
// tenant-isoliert.
//
// Anders als der reine Gehirn-Event (der nur eine Zusammenfassung + payloadRef
// trägt) speichert das Archiv den KOMPLETTEN Datensatz eines fertigen Briefs:
// Ergebnis (Body/Betreff) UND den gesamten Input, der ihn erzeugt hat
// (Vorgabe/Prompt, Ton, Quelltext, genutzter Kontext, Modell). So ist jeder
// Brief mit allen Kontexten wieder aufrufbar und als Vorlage/Kontext für ein
// FOLGE-Schreiben nutzbar.
//
// Private Briefe (der "Privat"-Schalter) werden ebenfalls archiviert, aber mit
// private:true markiert — sie gehen NICHT ins gemeinsame Gehirn (kein Event,
// keine Vorgang-Verknüpfung), bleiben hier aber auffindbar.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const COLLECTION = "mas_letters";

function col(clientId) {
  return masCollection(clientId, COLLECTION);
}

function clip(s, n) {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) + " …" : t;
}

// Schlanke Listen-Form (ohne Volltext/Kontext), damit die Liste klein bleibt.
function listShape(id, d) {
  return {
    id,
    ts: d.ts || 0,
    createdBy: d.createdBy || null,
    recipient: d.recipient || null,
    patientName: d.patientName || null,
    caseId: d.caseId || null,
    recipientType: d.recipientType || null,
    subject: d.subject || null,
    private: !!d.private,
    preview: d.preview || "",
  };
}

/**
 * Lege einen fertigen Brief samt vollständigem Input im Archiv ab.
 * @param {string} clientId
 * @param {object} input siehe Felder unten
 * @returns {Promise<{ok:boolean, id:string}>}
 */
export async function archiveLetter(clientId, input = {}) {
  const id = String(input.id || "").trim() || `letter_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const body = String(input.body || "").trim();
  const doc = {
    id,
    clientId,
    ts: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: String(input.createdBy || "").trim() || "Nadine",
    recipient: String(input.recipient || "").trim() || null,
    patientName: String(input.patientName || "").trim() || null,
    caseId: String(input.caseId || "").trim() || null,
    recipientType: String(input.recipientType || "").trim() || null,
    subject: String(input.subject || "").trim() || null,
    body,
    preview: clip(body, 160),
    private: input.private === true,
    // Der komplette Input, der den Brief erzeugt hat — für Folge-Schreiben.
    input: {
      direction: clip(input.direction, 4000),
      tone: String(input.tone || "").trim() || null,
      sourceText: clip(input.sourceText, 8000),
      sourceLetterIds: Array.isArray(input.sourceLetterIds) ? input.sourceLetterIds.map((x) => String(x)).slice(0, 20) : [],
    },
    contextText: clip(input.contextText, 12000),
    model: String(input.model || "").trim() || null,
    contextCounts: input.contextCounts && typeof input.contextCounts === "object" ? input.contextCounts : null,
    eventId: String(input.eventId || "").trim() || null,
  };
  await col(clientId).doc(id).set(doc);
  return { ok: true, id };
}

/**
 * Archiv-Liste, neueste zuerst. Paginiert über einen ts-Cursor (Single-Field-
 * Order → kein Composite-Index). Optionale In-Memory-Filter (Suchtext, Patient,
 * Vorgang) halten uns frei von Indizes.
 *
 * @param {string} clientId
 * @param {{ q?:string, patientName?:string, caseId?:string, limit?:number, cursor?:string|number }} [opts]
 * @returns {Promise<{items:object[], nextCursor:string|null}>}
 */
export async function listLetters(clientId, { q = "", patientName = "", caseId = "", limit = 25, cursor = null } = {}) {
  const needle = String(q || "").toLowerCase().trim();
  const pid = String(patientName || "").toLowerCase().trim();
  const cid = String(caseId || "").trim();
  const pageSize = Math.max(1, Math.min(100, Number(limit) || 25));
  const WINDOW = 100;
  const SCAN_CAP = 2000;

  const base = col(clientId).orderBy("ts", "desc");
  const items = [];
  let scanAfter = cursor != null && cursor !== "" ? Number(cursor) : null;
  let returnedCursor = null;
  let scanned = 0;
  let moreDocs = true;

  const keep = (d) => {
    if (cid && d.caseId !== cid) return false;
    if (pid && !String(d.patientName || "").toLowerCase().includes(pid)) return false;
    if (needle) {
      const hay = `${d.recipient || ""} ${d.patientName || ""} ${d.subject || ""} ${d.preview || ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  };

  while (items.length < pageSize && scanned < SCAN_CAP && moreDocs) {
    let qref = base.limit(WINDOW);
    if (scanAfter != null && Number.isFinite(scanAfter)) qref = qref.startAfter(scanAfter);
    const snap = await qref.get();
    if (snap.empty) break;
    for (const docSnap of snap.docs) {
      const d = docSnap.data();
      scanAfter = d.ts ?? scanAfter;
      scanned += 1;
      if (keep(d)) {
        items.push(listShape(docSnap.id, d));
        returnedCursor = d.ts ?? returnedCursor;
        if (items.length >= pageSize) break;
      }
    }
    if (snap.size < WINDOW) moreDocs = false;
  }

  const nextCursor = items.length >= pageSize && returnedCursor != null ? String(returnedCursor) : null;
  return { items, nextCursor };
}

/** Ein Archiv-Brief mit vollem Datensatz, oder null. */
export async function getLetter(clientId, id) {
  const snap = await col(clientId).doc(String(id || "").trim()).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
