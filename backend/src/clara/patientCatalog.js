// ============================================================================
// NAMENSKATALOG DER PRAXIS — "klein hoeren, gross suchen" (Dr. Petsas 04.08.2026)
//
// Warum es das gibt
// -----------------
// Live-Anruf 04.08.2026: Dr. Petsas nannte "Ouafa El Hajjami" voellig korrekt.
// Die Suche fand NICHTS — weder ueber den ganzen Namen noch ueber "El Hajjami"
// noch ueber "Hajjami". Nur der Vorname allein fuehrte zum Ziel. Clara bot
// daraufhin minutenlang dieselben falschen "El"-Treffer an.
//
// Ursache (an der echten Kartei geprueft): Die Plattform legt zu jedem Patienten
// Suchbegriffe ab — aber nur Anfangsstuecke des GANZEN Vor- und Nachnamens:
//     "el hajjami", "el hajjam", ... , "el"
// Das Wort "hajjami" steht dort NIE. Bei Doppelnamen (El, Van, De, Ben, Bindestrich)
// ist der unterscheidende Teil damit unauffindbar. In einer Zahnarztpraxis sind
// solche Namen der Normalfall, nicht die Ausnahme.
//
// Die Loesung
// -----------
// Zwei getrennte Aufgaben, die bisher vermischt wurden:
//   HOEREN  bleibt klein und scharf — die Namensliste fuer die Spracherkennung
//           umfasst weiter nur das Terminfenster (ein grosser Dump machte die
//           Erkennung nachweislich schlechter, Versuch 22.07.2026).
//   SUCHEN  wird gross — dieser Katalog haelt ALLE Namen der Praxis lokal, je
//           Name samt Klang-Schluessel PRO WORT. Damit findet "Hajjami" die
//           Patientin, obwohl der Plattform-Index das Wort nicht kennt.
//
// Kosten (der Grund fuer die strengen Bremsen)
// --------------------------------------------
// Die Kartei hat hier 13.298 Akten. Ein voller Durchlauf kostet rund 0,008 EUR.
// Einmal taeglich sind das ~0,25 EUR im Monat je Praxis — vertretbar. Damit das
// so bleibt:
//   * der Katalog liegt auf Platte und ueberlebt jeden Neustart,
//   * er wird hoechstens einmal pro TTL (Standard 24 h) neu geladen,
//   * ein laufender Aufbau wird geteilt (nie zwei Durchlaeufe gleichzeitig),
//   * bei Fehlern bleibt der alte Katalog gueltig statt sofort neu zu lesen,
//   * eine Obergrenze deckelt sehr grosse Karteien.
// Erinnerung an den Vorfall 03.08.2026: NICHT der Katalog war teuer, sondern ein
// Abruf, der die Kartei alle paar Sekunden neu durchsuchte. Genau das verhindern
// die Bremsen hier.
//
// Mandantenfaehig
// ---------------
// Alles ist nach Mandant UND Standort geschluesselt — Speicher, Datei, Sperre.
// Es gibt keinen gemeinsamen Zustand, keine geteilte Liste. Tausend Praxen
// koennen nebeneinander laufen, ohne sich zu sehen.
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import admin from "firebase-admin";

import { koelnerPhonetikToken } from "./phonetics.js";
import { loadBooking } from "./booking.js";

// --- Stellschrauben (per Umgebung ueberschreibbar) --------------------------
const TTL_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.CLARA_PATIENT_CATALOG_TTL_MS || 24 * 60 * 60 * 1000),
);
const MAX_PATIENTS = Math.max(
  500,
  Number(process.env.CLARA_PATIENT_CATALOG_CAP || 60000),
);
const PAGE_SIZE = 2000;
const CACHE_DIR = process.env.CLARA_PATIENT_CATALOG_DIR
  || path.join(process.cwd(), ".cache", "patient-catalog");

// Namensteilchen tragen nichts zur Unterscheidung bei. Sie duerfen einen Treffer
// NIE allein begruenden — sonst liefert "El Hajjami" das halbe Alphabet (genau
// der Fehler aus dem Live-Anruf).
export const PARTICLES = new Set([
  "el", "al", "ale", "ben", "bin", "ibn", "abu", "abd", "van", "von", "der",
  "den", "de", "di", "da", "do", "du", "le", "la", "los", "las", "dos", "das",
  "mac", "mc", "ter", "zu", "zum", "zur", "auf", "am", "im", "st", "y", "e",
]);

/** @type {Map<string, {at:number, locationId:string, entries:Array, index:Map<string,number[]>, count:number, truncated:boolean}>} */
const memory = new Map();
/** @type {Map<string, Promise<any>>} laufende Aufbauten (verhindert Doppellesen) */
const inflight = new Map();

// ---------------------------------------------------------------------------
// REINE FUNKTIONEN (kein I/O — direkt testbar)
// ---------------------------------------------------------------------------

/** Namen in vergleichbare Woerter zerlegen ("El-Hajjami" -> ["el","hajjami"]). */
export function nameTokens(name) {
  return String(name || "")
    .replace(/ß/g, "ss")
    .replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/** Ist das Wort unterscheidungskraeftig (kein Namensteilchen)? */
export function isMeaningful(token) {
  return token.length >= 3 && !PARTICLES.has(token);
}

/**
 * Klang-Schluessel eines Katalog-Eintrags: ein Code JE WORT von Vor- und
 * Nachname. Genau das ist der Unterschied zum Plattform-Index — dort existiert
 * nur der ganze Nachname am Stueck.
 */
export function entryCodes(firstName, lastName) {
  const out = [];
  const seen = new Set();
  for (const t of nameTokens(`${lastName || ""} ${firstName || ""}`)) {
    const c = koelnerPhonetikToken(t);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Nachschlagewerk Klang-Code -> Positionen im Katalog. */
export function buildIndex(entries) {
  const index = new Map();
  for (let i = 0; i < entries.length; i++) {
    for (const c of entries[i].c || []) {
      let bucket = index.get(c);
      if (!bucket) { bucket = []; index.set(c, bucket); }
      bucket.push(i);
    }
  }
  return index;
}

/**
 * Den gesprochenen Namen im Katalog suchen.
 *
 * Bewertung, absichtlich einfach und nachvollziehbar:
 *   +5  Wort stimmt buchstabengetreu ueberein
 *   +3  Wort klingt gleich (Koelner Phonetik) — faengt Verhoerer ab
 *   +2  zusaetzlich, wenn der Treffer im NACHNAMEN sitzt
 *   +0  Namensteilchen ("El", "van") — zaehlen nie fuer sich
 * Ein Eintrag kommt nur in die Auswahl, wenn mindestens EIN
 * unterscheidungskraeftiges Wort passt.
 *
 * @param {string} spoken            gehoerter Name
 * @param {Array} entries            Katalog-Eintraege {i,f,l,c}
 * @param {Map<string,number[]>} index
 * @param {{limit?:number}} [opts]
 */
export function catalogMatch(spoken, entries, index, opts = {}) {
  const limit = Math.max(1, opts.limit || 8);
  const spokenTokens = nameTokens(spoken);
  if (!spokenTokens.length) return [];
  const meaningful = spokenTokens.filter(isMeaningful);
  if (!meaningful.length) return []; // nur Teilchen gesprochen -> keine Suche

  // Kandidaten ueber die Klang-Codes der bedeutungstragenden Woerter einsammeln.
  const spokenCodes = new Map(); // code -> Wort
  for (const t of meaningful) {
    const c = koelnerPhonetikToken(t);
    if (c) spokenCodes.set(c, t);
  }
  // STT trennt zusammengesetzte Nachnamen ("Muhamedjanowa" -> "Muhammad
  // Janova"). Der zusammengeschriebene Klang muss denselben Eintrag finden,
  // sonst gewinnen Klang-Zufaelle auf dem abgespaltenen Stueck ("Janova"
  // ~ "Amofa" / "Hanifi") — Vorfall 14.08.2026.
  let joined = "";
  if (meaningful.length >= 2) {
    joined = meaningful.join("");
    if (joined.length >= 8) {
      const jc = koelnerPhonetikToken(joined);
      if (jc) spokenCodes.set(jc, joined);
    } else {
      joined = "";
    }
  }
  const candIdx = new Set();
  for (const c of spokenCodes.keys()) {
    for (const i of index.get(c) || []) candIdx.add(i);
  }
  if (!candIdx.size) return [];

  const scored = [];
  for (const i of candIdx) {
    const e = entries[i];
    if (!e) continue;
    const lastTokens = new Set(nameTokens(e.l));
    const allTokens = nameTokens(`${e.l || ""} ${e.f || ""}`);
    let score = 0;
    let strong = false;
    const usedSpoken = new Set();

    for (const nt of allTokens) {
      const inLast = lastTokens.has(nt);
      const ntCode = koelnerPhonetikToken(nt);
      let hit = 0;
      let matchedSpoken = "";
      for (const st of meaningful) {
        if (usedSpoken.has(st)) continue;
        if (st === nt) { hit = 5; matchedSpoken = st; break; }
        if (ntCode && ntCode === koelnerPhonetikToken(st) && hit < 3) {
          hit = 3; matchedSpoken = st;
        }
      }
      if (!hit) continue;
      usedSpoken.add(matchedSpoken);
      score += hit + (inLast ? 2 : 0);
      if (isMeaningful(nt)) strong = true;
    }

    if (joined) {
      const jCode = koelnerPhonetikToken(joined);
      for (const nt of lastTokens) {
        if (nt.length < 8) continue;
        let extra = 0;
        if (nt === joined) extra = 7;
        else if (jCode && jCode === koelnerPhonetikToken(nt)) extra = 7;
        if (!extra) continue;
        score += extra;
        for (const st of meaningful) usedSpoken.add(st);
        strong = true;
        break;
      }
    }

    if (!strong) continue; // nur ueber ein Teilchen getroffen -> verwerfen
    // Vollstaendigkeit belohnen: wurden ALLE gesprochenen Woerter untergebracht?
    if (usedSpoken.size >= meaningful.length) score += 4;
    scored.push({ ...e, score });
  }

  scored.sort((a, b) => (b.score - a.score)
    || String(a.l || "").localeCompare(String(b.l || ""), "de"));

  // RAUSCHFILTER: Gibt es einen klaren Treffer, fliegen die schwachen raus.
  // Sonst bietet Clara neben "Haila El Otmani" noch "Anissa Aalioui" an — genau
  // die falschen Vorschlaege, in denen sie sich im Live-Anruf verfangen hat.
  // Gleich starke Treffer (echte Namensvettern) bleiben ALLE stehen.
  const best = scored.length ? scored[0].score : 0;
  const floor = Math.max(5, best / 2);
  return scored.filter((x) => x.score >= floor).slice(0, limit);
}

/**
 * Ist der Hinweis ein NEUER Name statt eine Auswahl aus den Kandidaten
 * ("der erste", "Naomi")? Dann muss neu gesucht werden — sonst bleibt
 * Clara in der falschen Trefferliste haengen (Chef 14.08.2026:
 * Muhamedjanowa nach Amofa/Karadavut).
 */
export function spokenLooksLikeNewPerson(hint, candidates = []) {
  const raw = String(hint || "").trim();
  if (!raw) return false;
  const tokens = nameTokens(raw).filter(isMeaningful);
  if (!tokens.length) return false;
  const blob = tokens.join("");
  if (blob.length < 6) return false;
  const low = raw.toLowerCase();
  if (/^\s*(?:der|die|das)?\s*(?:erste[rn]?|zweite[rn]?|dritte[rn]?|letzte[rn]?)\s*$/i.test(low)) {
    return false;
  }
  for (const p of candidates || []) {
    const have = new Set(nameTokens(`${p.firstName || p.f || ""} ${p.lastName || p.l || ""}`));
    for (const t of tokens) {
      if (have.has(t)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// KATALOG LADEN / HALTEN (I/O)
// ---------------------------------------------------------------------------

function cacheFile(cid, lid) {
  const safe = `${cid}__${lid}`.replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

async function readFromDisk(cid, lid) {
  try {
    const raw = await fs.readFile(cacheFile(cid, lid), "utf8");
    const row = JSON.parse(raw);
    if (!row || !Array.isArray(row.entries)) return null;
    return row;
  } catch {
    return null;
  }
}

let lastDiskError = "";

async function writeToDisk(cid, lid, row) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const file = cacheFile(cid, lid);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(row), "utf8");
    await fs.rename(tmp, file); // atomar: nie ein halb geschriebener Katalog
    lastDiskError = "";
  } catch (e) {
    // Platte optional — der Katalog lebt dann nur im Speicher. Den Grund aber
    // merken, sonst sucht man den fehlenden Katalog spaeter im Dunkeln.
    lastDiskError = e?.message || String(e);
  }
}

/** Kartei seitenweise lesen. Liest bewusst nur Vor- und Nachname. */
async function fetchAllNames(cid, lid) {
  const col = admin.firestore()
    .collection("clients").doc(cid)
    .collection("locations").doc(lid)
    .collection("patients");

  const entries = [];
  let cursor = null;
  let truncated = false;
  for (;;) {
    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.select("firstName", "lastName").get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      const l = String(d.lastName || "").trim();
      const f = String(d.firstName || "").trim();
      if (!l && !f) continue;
      entries.push({ i: doc.id, f, l, c: entryCodes(f, l) });
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
    if (entries.length >= MAX_PATIENTS) { truncated = true; break; }
  }
  return { entries, truncated };
}

function activate(cid, lid, row) {
  const held = {
    at: row.at,
    locationId: lid,
    entries: row.entries,
    index: buildIndex(row.entries),
    count: row.entries.length,
    truncated: !!row.truncated,
  };
  memory.set(`${cid}/${lid}`, held);
  return held;
}

/**
 * Katalog bereitstellen: Speicher -> Platte -> Kartei. Nie zwei Aufbauten
 * gleichzeitig, nie oefter als die TTL erlaubt.
 * @param {string} clientId
 * @param {{force?:boolean}} [opts]
 */
export async function ensureCatalog(clientId, opts = {}) {
  const cid = String(clientId || "").trim();
  if (!cid) return null;
  const booking = await loadBooking(cid).catch(() => null);
  const lid = String(booking?.locationId || "").trim();
  if (!lid) return null;
  const key = `${cid}/${lid}`;

  const held = memory.get(key);
  const fresh = held && Date.now() - held.at < TTL_MS;
  if (!opts.force && fresh) return held;

  if (!opts.force && !held) {
    const disk = await readFromDisk(cid, lid);
    if (disk && Date.now() - disk.at < TTL_MS) return activate(cid, lid, disk);
  }

  const running = inflight.get(key);
  if (running) return held && !opts.force ? held : running;

  const job = (async () => {
    try {
      const { entries, truncated } = await fetchAllNames(cid, lid);
      const row = { at: Date.now(), entries, truncated, locationId: lid };
      await writeToDisk(cid, lid, row);
      return activate(cid, lid, row);
    } catch (e) {
      // Fehlschlag darf NICHT zu Dauerlesen fuehren: alten Stand weiter nutzen,
      // notfalls den (abgelaufenen) Katalog von der Platte.
      if (held) return held;
      const disk = await readFromDisk(cid, lid);
      return disk ? activate(cid, lid, disk) : null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  // Latenz-Regel (Dr. Petsas: Clara darf nie haengen): Ist ein — wenn auch
  // veralteter — Katalog da, wird SOFORT damit gearbeitet und im Hintergrund
  // erneuert. Nur beim allerersten Mal wird gewartet.
  if (held && !opts.force) {
    job.catch(() => {});
    return held;
  }
  return job;
}

/**
 * Gesprochenen Namen gegen ALLE Namen der Praxis halten.
 * Liefert Kandidaten mit Patienten-Kennung — die Stammdaten holt der Aufrufer.
 * Best-effort: faellt etwas aus, kommt eine leere Liste (kein Regress).
 * @param {string} clientId
 * @param {string} spoken
 * @param {{limit?:number}} [opts]
 */
export async function findInCatalog(clientId, spoken, opts = {}) {
  try {
    const cat = await ensureCatalog(clientId);
    if (!cat || !cat.entries.length) return [];
    return catalogMatch(spoken, cat.entries, cat.index, opts);
  } catch {
    return [];
  }
}

/**
 * Stammdaten zu Katalog-Treffern nachladen (gezielte Einzelabrufe, keine Suche).
 * Gleiche Felder wie die Plattform-Suche, damit nachgelagerte Logik
 * (Doppelgaenger-Klaerung, Buchung) unveraendert weiterarbeitet.
 * @param {string} clientId
 * @param {string[]} ids
 */
export async function fetchPatientsByIds(clientId, ids) {
  const cid = String(clientId || "").trim();
  const list = (Array.isArray(ids) ? ids : []).map((x) => String(x || "").trim()).filter(Boolean);
  if (!cid || !list.length) return [];
  const booking = await loadBooking(cid).catch(() => null);
  const lid = String(booking?.locationId || "").trim();
  if (!lid) return [];

  const col = admin.firestore()
    .collection("clients").doc(cid)
    .collection("locations").doc(lid)
    .collection("patients");
  const refs = list.slice(0, 20).map((id) => col.doc(id));
  const docs = await admin.firestore().getAll(...refs);

  const out = [];
  for (const doc of docs) {
    if (!doc.exists) continue;
    const d = doc.data() || {};
    const phone = String(d.mobilePhoneNumber || "").replace(/\s+/g, "");
    const birth = d.birthDate ? new Date(d.birthDate?.toDate?.() || d.birthDate) : null;
    const created = d.createdAt ? new Date(d.createdAt?.toDate?.() || d.createdAt) : null;
    out.push({
      id: doc.id,
      firstName: String(d.firstName || ""),
      lastName: String(d.lastName || ""),
      gender: String(d.gender || ""),
      birthDate: birth && !isNaN(birth.getTime()) ? birth.toISOString().slice(0, 10) : null,
      mobilePhoneNumber: phone,
      email: String(d.email || ""),
      hasPhone: phone.length > 0,
      createdAt: created && !isNaN(created.getTime()) ? created.toISOString() : null,
    });
  }
  return out;
}

/** Zustand fuer Diagnose/Statusseite. */
export function catalogStatus() {
  const rows = [];
  for (const [key, v] of memory.entries()) {
    rows.push({
      key,
      count: v.count,
      truncated: v.truncated,
      ageMinutes: Math.round((Date.now() - v.at) / 60000),
      codes: v.index.size,
    });
  }
  return { ttlMs: TTL_MS, cap: MAX_PATIENTS, dir: CACHE_DIR, diskError: lastDiskError, tenants: rows };
}
