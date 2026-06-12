import { timingSafeEqual } from "node:crypto";
import { masCollection } from "./tenant.js";

// Fernsteuerungs-Chat (provisorisch, Wochenende): eine kleine statische Seite
// auf Firebase Hosting schickt Nachrichten von Dr. Petsas' Handy hierher; ein
// lokaler Waechter (tools/remote_chat_watch.ps1) holt sie ab und startet eine
// Agent-Session, die antwortet und das "Board" (Kurz-Resuemee + Empfehlungen)
// aktualisiert. Alles token-gated (REMOTE_CHAT_TOKEN in backend\.env) — die
// Endpoints sind oeffentlich erreichbar (Tunnel), aber ohne Token nutzlos.

const COL = "mas_remote_chat";
const BOARD_DOC = "_board";
const TOKEN = (process.env.REMOTE_CHAT_TOKEN || "").trim();

export function remoteTokenOk(req) {
  const t = String(req.body?.token || req.query?.token || "").trim();
  if (!TOKEN || !t) return false;
  const a = Buffer.from(t);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export async function addRemoteMessage(clientId, { role, text }) {
  const cleanText = String(text || "").trim().slice(0, 8000);
  if (!cleanText) return { ok: false, reason: "text_required" };
  const cleanRole = role === "agent" ? "agent" : "user";
  const ref = masCollection(clientId, COL).doc();
  await ref.set({
    role: cleanRole,
    text: cleanText,
    status: cleanRole === "user" ? "neu" : "fertig",
    createdAt: Date.now(),
  });
  return { ok: true, id: ref.id };
}

export async function remoteState(clientId, { limit = 80 } = {}) {
  const col = masCollection(clientId, COL);
  const [boardSnap, msgSnap] = await Promise.all([
    col.doc(BOARD_DOC).get(),
    col.orderBy("createdAt", "desc").limit(limit + 1).get(),
  ]);
  const messages = msgSnap.docs
    .filter((d) => d.id !== BOARD_DOC)
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const board = boardSnap.exists ? boardSnap.data() : { text: "", updatedAt: 0 };
  return { board: { text: board.text || "", updatedAt: board.updatedAt || 0 }, messages };
}

export async function setRemoteBoard(clientId, text) {
  await masCollection(clientId, COL).doc(BOARD_DOC).set({
    text: String(text || "").trim().slice(0, 16000),
    updatedAt: Date.now(),
  });
  return { ok: true };
}

/** Neue (unbearbeitete) Nutzer-Nachrichten — fuer den lokalen Waechter. */
export async function pendingRemoteMessages(clientId) {
  const snap = await masCollection(clientId, COL)
    .where("role", "==", "user").where("status", "==", "neu").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function ackRemoteMessages(clientId, ids, status = "in_arbeit") {
  const col = masCollection(clientId, COL);
  const clean = (Array.isArray(ids) ? ids : []).map((x) => String(x || "").trim()).filter(Boolean);
  for (const id of clean) {
    if (id === BOARD_DOC) continue;
    await col.doc(id).update({ status: String(status || "in_arbeit") }).catch(() => {});
  }
  return { ok: true, count: clean.length };
}
