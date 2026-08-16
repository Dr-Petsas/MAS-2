// STT-Patientennamen aus dem KALENDER (Chef 22.07.2026).
// Beim Clara-Start: Vor-/Nachnamen aller Termine im Fenster
//   letzte 2 Kalenderwochen + diese Woche + naechste Woche
// (Mo–So, Berlin). Heute+Morgen stehen VORNE in der Liste.
//
// Kein Modell-Retrain — Parakeet nutzt die Liste als Fuzzy-Postcorrect.
// Quelle: dieselbe appointments-Collection wie daySchedule (getRangeAppointments).

import { getRangeAppointments, todayBerlin } from "./daySchedule.js";
import { queryLatest } from "../brain/eventStore.js";
import { listRecentContactNames } from "../brain/addressBook.js";

export const STT_NAMES_CACHE_MS = 30 * 60 * 1000; // 30 min — Kalender aendert sich
const MIN_LEN = 3;

// Korrespondenz-/Kontaktnamen aus dem Praxisgedaechtnis (Chef 25.07.2026):
// Clara muss auch Anrufer/Absender aus Briefen/E-Mails/Kartei verstehen, die
// KEINEN Termin im Kalenderfenster haben. Bewusst beschraenkt (Recency + Cap),
// damit die Liste scharf bleibt (der 22.07.-Patientenstamm-Dump war zu gross).
const MEMORY_WINDOW_DAYS = Number(process.env.CLARA_STT_MEMORY_DAYS || 45);
const MEMORY_EVENT_CAP = 800;   // hoechstens so viele Ereignisse scannen
const CONTACT_SCAN_CAP = 600;   // hoechstens so viele Adressbuch-Kontakte lesen
const MEMORY_NAME_CAP = 500;    // hoechstens so viele Namen ergaenzen (Gedaechtnis+Kontakte)

// Anreden/Titel vorne wegschneiden, damit "Herr Dr. Meier" -> "Meier".
const HONORIFICS = new Set([
  "herr", "herrn", "frau", "dr", "dr.", "prof", "prof.", "med", "med.",
  "dipl", "dipl.", "herr.", "fr", "fr.",
]);
// Offensichtliche Organisationen NICHT als Personennamen aufnehmen.
const ORG_RE = /\b(gmbh|ag|kg|ohg|e\.?\s?v|mbh|labor|klinik|klinikum|versicherung|krankenkasse|apotheke|praxis|verlag|inkasso|kanzlei)\b/i;

/** @type {Map<string, object>} */
const cache = new Map();

function addDays(dateStr, n) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function weekdayMon0(dateStr) {
  const wd = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0=So..6=Sa
  return (wd + 6) % 7;
}

function mondayOf(dateStr) {
  return addDays(dateStr, -weekdayMon0(dateStr));
}

/** Fenster: Mo vor 2 Wochen … So der naechsten Woche. */
export function sttCalendarWindow(today = todayBerlin()) {
  const thisMon = mondayOf(today);
  return {
    from: addDays(thisMon, -14),
    to: addDays(thisMon, 13),
    today,
    tomorrow: addDays(today, 1),
  };
}

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isUsableName(n) {
  if (n.length < MIN_LEN) return false;
  if (n.includes("{{") || n.includes("}}") || n.includes("${")) return false;
  if (/^[A-Za-zÄÖÜäöüß]\.?$/.test(n)) return false;
  if (/^[A-Za-zÄÖÜäöüß]\.\s/.test(n)) return false;
  if (!/[A-Za-zÄÖÜäöüß]{3,}/.test(n)) return false;
  return true;
}

function addName(set, raw) {
  const n = cleanName(raw);
  if (!isUsableName(n)) return;
  set.add(n);
  // 14.08.2026 (Live 19:22, "hayla unbekannt"): Mehrwort-Eintraege wie
  // "Haila El" oder "El Otmani" sind fuer den Worker-Postcorrect UNSICHTBAR
  // (der Token-Abgleich verwirft Keywords mit Leerzeichen). Deshalb jeden
  // Teil zusaetzlich einzeln aufnehmen — auch Bindestrich-Teile
  // ("El-Otmani" -> "Otmani"), damit jede gesprochene Form anschlaegt.
  const tokens = n.split(/[\s-]+/);
  if (tokens.length > 1) {
    for (const t of tokens) {
      if (isUsableName(t)) set.add(t);
    }
  }
}

function firstNameFromAppt(a) {
  const last = cleanName(a.patientLastName);
  const full = cleanName(a.patientName);
  if (!full) return "";
  if (last) {
    const re = new RegExp(`\\s*${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    const fn = full.replace(re, "").trim();
    if (fn) return fn;
  }
  const parts = full.split(/\s+/);
  return parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
}

function collectFromAppts(appts, lastSet, firstSet) {
  for (const a of appts || []) {
    if (!a || a.isAbsence || !a.patientId) continue;
    addName(lastSet, a.patientLastName);
    addName(firstSet, firstNameFromAppt(a));
  }
}

// Einen vollen Namen ("Herr Dr. Anna Meier") in { last, first } zerlegen.
// Reine Funktion (Firebase-frei, testbar): Anreden/Titel vorne weg, Orgs raus,
// unbrauchbares -> null.
export function personNameToParts(raw) {
  const n = cleanName(raw);
  if (!isUsableName(n) || ORG_RE.test(n)) return null;
  const parts = n.split(/\s+/).filter((p) => !HONORIFICS.has(p.toLowerCase()));
  if (!parts.length) return null;
  if (parts.length === 1) return { last: parts[0], first: "" };
  return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(" ") };
}

function pushPersonName(raw, lastSet, firstSet) {
  const p = personNameToParts(raw);
  if (!p) return;
  addName(lastSet, p.last);
  if (p.first) addName(firstSet, p.first);
}

// Namen aus dem Praxisgedaechtnis: (a) juengste Ereignisse (Anrufe/E-Mails/
// Briefe) — die betroffene Person (subject.name) und der Gespraechs-/Absender-
// partner (counterparty.name); (b) das geteilte Adressbuch (Labor, Anrufer,
// Lieferanten). Best-effort, beschraenkt; Orgs filtert pushPersonName.
async function collectFromMemory(cid, lastSet, firstSet) {
  const since = Date.now() - MEMORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const [events, contactNames] = await Promise.all([
    queryLatest(cid, since, MEMORY_EVENT_CAP).catch(() => []),
    listRecentContactNames(cid, { limit: CONTACT_SCAN_CAP }).catch(() => []),
  ]);
  for (const ev of events || []) {
    if (!ev) continue;
    pushPersonName(ev.subject?.name, lastSet, firstSet);
    if (ev.counterparty?.kind !== "organization") {
      pushPersonName(ev.counterparty?.name, lastSet, firstSet);
    }
  }
  for (const name of contactNames || []) {
    pushPersonName(name, lastSet, firstSet);
  }
}

function orderedNames(priorityLast, priorityFirst, restLast, restFirst) {
  const seen = new Set();
  const out = [];
  const pushAll = (arr) => {
    for (const n of arr) {
      const k = n.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
  };
  const sortDe = (a, b) => a.localeCompare(b, "de");
  pushAll([...priorityLast].sort(sortDe));
  pushAll([...priorityFirst].sort(sortDe));
  pushAll([...restLast].sort(sortDe));
  pushAll([...restFirst].sort(sortDe));
  return out;
}

/**
 * Patientennamen aus dem Kalenderfenster fuer STT-Bias.
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts]
 */
export async function listPatientNamesForStt(clientId, opts = {}) {
  const cid = String(clientId || "").trim();
  if (!cid) return leereListe();

  if (!opts.force) {
    const hit = cache.get(cid);
    if (hit && Date.now() - hit.at < STT_NAMES_CACHE_MS) {
      return { ...hit, cached: true };
    }
    // Cache ABGELAUFEN, aber vorhanden: bis 16.08.2026 wartete jeder Anrufer
    // hier auf den kompletten Neuaufbau (Termine ueber 28 Tage + Gedaechtnis,
    // gemessen 660-860 ms) -- und ``searchPatient`` wartet blockierend darauf.
    // Schlimmer: ``searchPatientSpoken`` feuert bis zu 12 Namensvarianten
    // GLEICHZEITIG; war der Cache gerade abgelaufen, liefen 12 Neuaufbauten
    // parallel los, jeder mit einer eigenen Firestore-Bereichsabfrage. Das war
    // nicht nur langsam, sondern auch teuer.
    // Jetzt: alten Stand SOFORT liefern, im Hintergrund erneuern.
    const laufend = imBau.get(cid);
    if (hit) {
      if (!laufend) starteBau(cid, opts).catch(() => {});
      return { ...hit, cached: true, veraltet: true };
    }
    // Kein Stand vorhanden -> warten, aber nur EINMAL fuer alle Anrufer.
    if (laufend) return laufend;
    return starteBau(cid, opts);
  }

  return baueNamensliste(cid, opts);
}

// Ein Neuaufbau je Mandant, egal wie viele gleichzeitig fragen. Bewusst pro
// clientId geschluesselt -- zwischen Mandanten wird NICHTS geteilt.
const imBau = new Map();

function starteBau(cid, opts) {
  const job = baueNamensliste(cid, opts).finally(() => imBau.delete(cid));
  imBau.set(cid, job);
  return job;
}

// Bewusst eine Fabrik, kein geteiltes Objekt: eine flache Kopie ({...X}) teilt
// das names-Array weiter, und ein Aufrufer, der darin etwas ablegt, veraendert
// damit die Antwort aller kuenftigen Aufrufe (beim Bauen selbst bemerkt).
const leereListe = () => ({
  names: [], count: 0, locationId: "", cached: false,
  lastCount: 0, firstCount: 0, memoryCount: 0, from: "", to: "", source: "calendar",
});

/** Der eigentliche Aufbau (Termine + Praxisgedaechtnis + Adressbuch). */
async function baueNamensliste(cid, opts = {}) {
  const empty = leereListe();
  const win = sttCalendarWindow();
  const data = await getRangeAppointments(cid, { from: win.from, to: win.to });
  if (!data?.ok) {
    return { ...empty, from: win.from, to: win.to };
  }

  const priLast = new Set();
  const priFirst = new Set();
  const restLast = new Set();
  const restFirst = new Set();

  const todayAppts = [];
  const tomorrowAppts = [];
  const restAppts = [];
  for (const a of data.appointments || []) {
    if (!a || a.isAbsence || !a.patientId) continue;
    const day = a.startMs
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Berlin",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(a.startMs))
      : "";
    if (day === win.today) todayAppts.push(a);
    else if (day === win.tomorrow) tomorrowAppts.push(a);
    else restAppts.push(a);
  }

  collectFromAppts(todayAppts, priLast, priFirst);
  collectFromAppts(tomorrowAppts, priLast, priFirst);
  collectFromAppts(restAppts, restLast, restFirst);

  // Kandidaten-Schicht (Dr. Petsas 03.08.2026): Patienten-IDs der Termine im
  // Fenster, Heute/Morgen zuerst. Die Klara-Suche gibt diese IDs an
  // masSearchPatients mit, damit bei Namensvettern der wahrscheinlich Gemeinte
  // (naher Termin) oben steht. Gedeckelt, damit der Request klein bleibt.
  const CONTEXT_ID_CAP = 300;
  const ctxIds = [];
  const ctxSeen = new Set();
  const pushCtxId = (a) => {
    const id = a && a.patientId ? String(a.patientId) : "";
    if (!id || ctxSeen.has(id) || ctxIds.length >= CONTEXT_ID_CAP) return;
    ctxSeen.add(id);
    ctxIds.push(id);
  };
  todayAppts.forEach(pushCtxId);
  tomorrowAppts.forEach(pushCtxId);
  restAppts.forEach(pushCtxId);

  const calendarNames = orderedNames(priLast, priFirst, restLast, restFirst);
  const lastCount = new Set([...priLast, ...restLast]).size;
  const firstCount = calendarNames.length - lastCount;

  // Korrespondenz-/Kontaktnamen anhaengen — best-effort, beschraenkt, dedupt
  // gegen die Kalendernamen. Faellt der Gedaechtnis-Scan aus, bleibt exakt das
  // bisherige Kalender-Verhalten (kein Regress).
  const memLast = new Set();
  const memFirst = new Set();
  try {
    await collectFromMemory(cid, memLast, memFirst);
  } catch (e) {
    // Gedaechtnis optional — Kalendernamen genuegen.
  }
  const seen = new Set(calendarNames.map((n) => n.toLowerCase()));
  const memoryNames = [];
  const sortDe = (a, b) => a.localeCompare(b, "de");
  for (const n of [...memLast].sort(sortDe).concat([...memFirst].sort(sortDe))) {
    if (memoryNames.length >= MEMORY_NAME_CAP) break;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    memoryNames.push(n);
  }

  const names = calendarNames.concat(memoryNames);
  const row = {
    at: Date.now(),
    names,
    count: names.length,
    locationId: data.locationId || "",
    lastCount,
    firstCount: Math.max(0, firstCount),
    memoryCount: memoryNames.length,
    from: data.from || win.from,
    to: data.to || win.to,
    source: memoryNames.length ? "calendar+memory" : "calendar",
    todayCount: todayAppts.length,
    tomorrowCount: tomorrowAppts.length,
    patientIds: ctxIds,
  };
  cache.set(cid, row);
  return { ...row, cached: false };
}

/**
 * Kandidaten-Schicht: Patienten-IDs aus dem Terminfenster (Heute/Morgen zuerst)
 * fuer das Kontext-Ranking der Patientensuche. Nutzt denselben (gecachten)
 * Termin-Abruf wie die STT-Namen. Best-effort: Fehler => leere Liste
 * (die Suche verhaelt sich dann exakt wie bisher, kein Regress).
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<string[]>}
 */
export async function listContextPatientIds(clientId, opts = {}) {
  try {
    const r = await listPatientNamesForStt(clientId, opts);
    return Array.isArray(r.patientIds) ? r.patientIds : [];
  } catch (e) {
    return [];
  }
}
