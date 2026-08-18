import { timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
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

// WER antwortet? (Chef 18.08.2026) Am Draht haengt nicht mehr ein einzelner
// Agent, sondern das Dreierteam: Opus fuehrt, Grok prueft nach, Fable macht den
// Feinschliff. Damit der Chef am Handy sieht, wer da schreibt, tragen
// Agent-Nachrichten optional einen Sprecher. Feste Liste, kein Freitext: die
// /remote/*-Routen sind oeffentlich erreichbar (nur token-gated), sonst koennte
// dort jeder beliebige Absender-Namen in den Chat schreiben.
const SPRECHER = new Set(["opus", "grok", "fable", "team"]);

export async function addRemoteMessage(clientId, { role, text, speaker } = {}) {
  const cleanText = String(text || "").trim().slice(0, 8000);
  if (!cleanText) return { ok: false, reason: "text_required" };
  const cleanRole = role === "agent" ? "agent" : "user";
  const ref = masCollection(clientId, COL).doc();
  const doc = {
    role: cleanRole,
    text: cleanText,
    status: cleanRole === "user" ? "neu" : "fertig",
    createdAt: Date.now(),
  };
  // Nur setzen, wenn bekannt: alte Nachrichten ohne Feld bleiben gueltig und
  // werden am Handy wie bisher dargestellt.
  const wer = String(speaker || "").trim().toLowerCase();
  if (cleanRole === "agent" && SPRECHER.has(wer)) doc.speaker = wer;
  await ref.set(doc);
  return { ok: true, id: ref.id };
}

// --- Dateien vom Handy (Chef 09.08.2026) ----------------------------------
// Der Chef wollte dem Agenten aus dem Urlaub Dateien schicken koennen
// (Bildschirmfoto eines Fehlers, Sprachaufnahme, Logdatei). Die Datei landet
// in einem Posteingang-Ordner auf DIESEM Rechner; in den Chat wandert nur eine
// normale Nachricht mit dem Ablageort. Der Waechter holt sie wie jede andere
// ab, der Agent liest die Datei direkt von der Platte.
//
// Bewusst NICHT in die Datenbank: Ein Foto als Text kostet Speicher und
// Lesevorgaenge (Google-Kosten), und der Agent kaeme ohnehin nur ueber die
// Platte an den Inhalt.
const INBOX = process.env.REMOTE_CHAT_INBOX
  || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "_posteingang");
const MAX_BYTES = 24 * 1024 * 1024;  // passt unter das 25-MB-Limit des Servers

/** Dateiname entschaerfen: nur Buchstaben, Ziffern, Punkt, Strich, Unterstrich. */
function safeName(name) {
  const roh = String(name || "").split(/[\\/]/).pop() || "datei";
  const sauber = roh.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return (sauber || "datei").slice(0, 80);
}

function stempel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function saveRemoteFile(clientId, { name, dataBase64, note } = {}) {
  const roh = String(dataBase64 || "");
  // Browser liefern "data:image/png;base64,AAAA..." — der Kopf muss weg.
  const b64 = roh.includes(",") ? roh.slice(roh.indexOf(",") + 1) : roh;
  if (!b64.trim()) return { ok: false, reason: "file_required" };
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, reason: "file_broken" };
  }
  if (!buf.length) return { ok: false, reason: "file_empty" };
  if (buf.length > MAX_BYTES) return { ok: false, reason: "file_too_big" };
  const datei = `${stempel()}_${safeName(name)}`;
  const ziel = path.join(INBOX, datei);
  await mkdir(INBOX, { recursive: true });
  await writeFile(ziel, buf);
  const kb = Math.max(1, Math.round(buf.length / 1024));
  const bemerkung = String(note || "").trim();
  const text = [
    `[DATEI] ${datei} (${kb} KB) liegt unter: ${ziel}`,
    bemerkung ? `Dazu vom Chef: ${bemerkung}` : "",
    "Lies die Datei von diesem Pfad und schau sie dir an.",
  ].filter(Boolean).join("\n");
  const msg = await addRemoteMessage(clientId, { role: "user", text });
  return { ok: true, path: ziel, bytes: buf.length, messageId: msg.id || "" };
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
