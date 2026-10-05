// Ablage fuer Karteitexte, die Dampsoft per VDDS-Knopf holt.
// Datei, nicht Firestore: die lokale Probe-EXE kann denselben Stand
// lesen, auch wenn MAS gerade nicht laeuft.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORE_PATH = path.join(__dirname, "..", "data", "pvs-pending-chart.json");

function normName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normBirthday(s) {
  return String(s || "").replace(/\D/g, "");
}

function normId(s) {
  return String(s || "").trim();
}

export function identityOf(row) {
  return {
    patId: normId(row.patId),
    lastName: String(row.lastName || "").trim(),
    firstName: String(row.firstName || "").trim(),
    birthday: normBirthday(row.birthday),
  };
}

export function samePatient(a, b) {
  const left = identityOf(a);
  const right = identityOf(b);
  if (left.patId && left.patId !== "0" && right.patId && right.patId !== "0") {
    return left.patId === right.patId;
  }
  if (normName(left.lastName) !== normName(right.lastName)
    || normName(left.firstName) !== normName(right.firstName)) {
    return false;
  }
  if (left.birthday && right.birthday) return left.birthday === right.birthday;
  return !!(left.lastName && left.firstName);
}

function emptyStore() {
  return { entries: [] };
}

export function readStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const entries = Array.isArray(raw?.entries) ? raw.entries : [];
    return { entries };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function findPending(query) {
  const store = readStore();
  const hits = store.entries.filter((e) => samePatient(e, query) && e.status !== "consumed");
  return hits[hits.length - 1] || null;
}

export function upsertPending(input) {
  const text = String(input.text || "").trim();
  if (!text) {
    const err = new Error("text_required");
    err.code = "text_required";
    throw err;
  }
  const id = identityOf(input);
  if (!id.patId && !(id.lastName && id.firstName)) {
    const err = new Error("identity_required");
    err.code = "identity_required";
    throw err;
  }
  const store = readStore();
  const now = new Date().toISOString();
  const next = {
    patId: id.patId,
    lastName: id.lastName,
    firstName: id.firstName,
    birthday: id.birthday,
    text,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const idx = store.entries.findIndex((e) => samePatient(e, next) && e.status !== "consumed");
  if (idx >= 0) store.entries[idx] = { ...store.entries[idx], ...next, createdAt: store.entries[idx].createdAt };
  else store.entries.push(next);
  writeStore(store);
  return next;
}
