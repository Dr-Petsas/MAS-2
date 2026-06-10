import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// Reusable letter text blocks (Textbausteine) per practice, stored under
// clients/{clientId}/mas_letter_blocks. Categorised so the editor can offer
// "Anrede / Textbaustein / Grußformel" and the team builds letters fast without
// retyping. Clean, minimal model — no legacy cruft.

const { FieldValue } = admin.firestore;
const COL = "mas_letter_blocks";

export const BLOCK_CATEGORIES = Object.freeze(["anrede", "text", "gruss"]);

function col(clientId) {
  return masCollection(clientId, COL);
}

const s = (v) => (v == null ? "" : String(v).trim());

function normCategory(c) {
  const v = s(c).toLowerCase();
  return BLOCK_CATEGORIES.includes(v) ? v : "text";
}

export function toPublic(id, d) {
  return { id, category: d.category || "text", title: d.title || "", content: d.content || "", createdAt: d.createdAt || null };
}

export async function listBlocks(clientId) {
  const snap = await col(clientId).limit(300).get();
  const rows = snap.docs.map((d) => toPublic(d.id, d.data()));
  rows.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  return rows;
}

export async function createBlock(clientId, input = {}) {
  const title = s(input.title);
  const content = s(input.content);
  if (!title || !content) return { ok: false, reason: "title_and_content_required" };
  const doc = { category: normCategory(input.category), title, content, createdAt: FieldValue.serverTimestamp() };
  const r = await col(clientId).add(doc);
  return { ok: true, block: toPublic(r.id, { ...doc, createdAt: Date.now() }) };
}

export async function updateBlock(clientId, id, input = {}) {
  const r = col(clientId).doc(s(id));
  const snap = await r.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const patch = {};
  if (input.category != null) patch.category = normCategory(input.category);
  if (input.title != null) patch.title = s(input.title);
  if (input.content != null) patch.content = s(input.content);
  await r.update(patch);
  const after = await r.get();
  return { ok: true, block: toPublic(after.id, after.data()) };
}

export async function deleteBlock(clientId, id) {
  await col(clientId).doc(s(id)).delete();
  return { ok: true };
}

// Idempotent defaults so a fresh practice already has useful building blocks.
const DEFAULTS = [
  { category: "anrede", title: "Förmlich (Damen und Herren)", content: "Sehr geehrte Damen und Herren," },
  { category: "anrede", title: "Persönlich (Frau)", content: "Sehr geehrte Frau [Name]," },
  { category: "anrede", title: "Persönlich (Herr)", content: "Sehr geehrter Herr [Name]," },
  { category: "text", title: "Terminbestätigung", content: "hiermit bestätigen wir Ihren Termin am [Datum] um [Uhrzeit] Uhr in unserer Praxis." },
  { category: "text", title: "Rechnung anbei", content: "anbei erhalten Sie die gewünschte Aufstellung Ihrer Rechnung. Bei Fragen stehen wir Ihnen gerne zur Verfügung." },
  { category: "text", title: "Unterlagen anbei", content: "wie besprochen senden wir Ihnen die angeforderten Unterlagen zu." },
  { category: "gruss", title: "Mit freundlichen Grüßen", content: "Mit freundlichen Grüßen" },
  { category: "gruss", title: "Ihr Praxisteam", content: "Mit freundlichen Grüßen\nIhr Praxisteam" },
];

export async function seedDefaultBlocks(clientId) {
  const existing = await col(clientId).limit(1).get();
  if (!existing.empty) return { ok: true, seeded: 0 };
  const batch = admin.firestore().batch();
  for (const b of DEFAULTS) batch.set(col(clientId).doc(), { ...b, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { ok: true, seeded: DEFAULTS.length };
}
