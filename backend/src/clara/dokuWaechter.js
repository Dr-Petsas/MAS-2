import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { getDayAppointments, getPatientAppointments, todayBerlin } from "./daySchedule.js";
import { masCollection } from "../tenant.js";
import { getOperator } from "./sessions.js";
import { listOperators } from "./operators.js";
import { callOperator, setPendingCallContext } from "./devices.js";
import { appendEvent } from "../brain/eventStore.js";
import { log } from "../log.js";

// ============================================================================
// Doku-Wächter (04.07.2026): "Clara MUSS aufpassen, dass die Doku lückenlos ist."
// ============================================================================
// Drei Verteidigungslinien gegen fehlende Behandlungsdokumentation:
//
//   1. BEIM DIKTAT (findePatientenLuecken): Wer gerade fuer einen Patienten
//      dokumentiert, hoert sofort, wenn bei DEMSELBEN Patienten ein juengerer
//      Termin noch ohne Doku ist ("Uebrigens: vom Dienstag fehlt noch ...").
//   2. AUF NACHFRAGE (findePraxisLuecken): "Welche Dokus fehlen noch?" —
//      praxisweiter Blick ueber die letzten Tage.
//   3. AM TAGESENDE (dokuAbendlauf): aktiver Anruf auf das Handy des Chefs
//      ("3 Dokumentationen fehlen noch — fangen wir mit Herrn X an, im Termin
//      steht PZR ...") ueber denselben Push-Weg wie die Recall-Initiative;
//      der Gespraechskontext primt Clara, die Luecken EINZELN abzuarbeiten
//      und jede Antwort per save_treatment_dictation aufs richtige Datum zu
//      speichern. Anti-Nerv: hoechstens ein Anruf pro Tag (lastPushDay).
//
// "Doku vorhanden" heisst: mindestens ein aktives (nicht gestrichenes)
// Diktat-Segment, das KEIN reiner Sophie-/Plan-Vermerk ist — oder eine
// gefuellte Karteikarte (treatment/main). Als dokupflichtig gilt ein
// vergangener echter Patiententermin, der nicht als "nicht erschienen"
// markiert ist (patientStatus 2 = behandelt zaehlt immer; ungepflegtes
// patientStatus zaehlt auch, weil viele Praxen das Feld nicht setzen).
// ============================================================================

const _BERLIN = "Europe/Berlin";
const TREATED = 2; // PatientStatus.treated (Plattform-Enum)

function _tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (ts?._seconds) return ts._seconds * 1000;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function tagIso(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: _BERLIN, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function tagDeutsch(ms) {
  const heute = todayBerlin();
  const iso = tagIso(ms);
  if (iso === heute) return "heute";
  const gestern = tagIso(Date.now() - 86400000);
  if (iso === gestern) return "gestern";
  const wd = new Intl.DateTimeFormat("de-DE", { timeZone: _BERLIN, weekday: "long" }).format(new Date(ms));
  const dat = new Intl.DateTimeFormat("de-DE", { timeZone: _BERLIN, day: "2-digit", month: "2-digit" }).format(new Date(ms));
  return `${wd}, den ${dat}`;
}

/** Zaehlt ein vergangener Termin als dokupflichtig? */
function istDokupflichtig(a, nowMs) {
  if (!a || !a.patientId || a.isAbsence || a.isMultiDay) return false;
  if (a.startMs >= nowMs) return false; // noch nicht behandelt
  // Explizit gepflegtes "nicht behandelt/nicht erschienen" respektieren.
  if (a.patientStatus !== null && a.patientStatus !== undefined && a.patientStatus !== TREATED) return false;
  return true;
}

/** Hat der Termin schon (aktive, klinische) Doku? */
async function hatDoku(clientId, locationId, appointmentId) {
  const apptRef = admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(appointmentId);
  try {
    const dsnap = await apptRef.collection("dictations").limit(10).get();
    for (const d of dsnap.docs) {
      const s = d.data() || {};
      if (s.struck) continue;
      if (String(s.source || "") === "sophie") continue;
      const t = String(s.text || "").trim();
      if (!t || /^plan erstellt/i.test(t)) continue;
      return true;
    }
  } catch { /* weiter mit Karteikarte */ }
  try {
    const main = await apptRef.collection("treatment").doc("main").get();
    const m = main.exists ? (main.data() || {}) : {};
    if (String(m.structuredText || m.text || "").trim()) return true;
  } catch { /* keine Karteikarte lesbar */ }
  return false;
}

/**
 * Luecken EINES Patienten: juengste vergangene Termine ohne Doku (fuer den
 * Hinweis direkt beim Diktat). excludeApptId = der Termin, auf den gerade
 * dokumentiert wurde.
 */
export async function findePatientenLuecken(clientId, { patientId, lastName, excludeApptId = "", tageZurueck = 14, max = 2 } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return [];
  const hist = await getPatientAppointments(clientId, { patientId, lastName }).catch(() => null);
  if (!hist?.ok) return [];
  const nowMs = Date.now();
  const abMs = nowMs - tageZurueck * 86400000;
  const kandidaten = (hist.past || [])
    .filter((a) => a.id !== excludeApptId && a.startMs >= abMs && istDokupflichtig(a, nowMs))
    .slice(-6) // juengste zuerst pruefen, Reads begrenzen
    .reverse();
  const luecken = [];
  for (const a of kandidaten) {
    if (luecken.length >= max) break;
    if (!(await hatDoku(clientId, locationId, a.id))) {
      luecken.push({
        appointmentId: a.id,
        date: tagIso(a.startMs),
        dateSpoken: tagDeutsch(a.startMs),
        startMs: a.startMs,
        patientId: a.patientId,
        patientName: a.patientName,
        motive: a.visitMotive || "",
      });
    }
  }
  return luecken;
}

/** Gesprochener Nachsatz fuer den Diktat-Fluss ("Uebrigens: ..."). */
export function sprichPatientenLuecken(luecken, patientName = "") {
  if (!luecken?.length) return "";
  const wer = patientName ? `bei ${patientName}` : "bei diesem Patienten";
  const teile = luecken.map((l) => `vom Termin ${l.dateSpoken}${l.motive ? ` (${l.motive})` : ""}`);
  return `Übrigens: ${wer} fehlt noch die Doku ${teile.join(" und ")} — sag einfach "dokumentiere für den ${luecken[0].dateSpoken.replace(/^heute$|^gestern$/, (m) => m === "heute" ? "heutigen Termin" : "Termin von gestern")}: ...", dann trage ich es nach.`;
}

/**
 * Praxisweite Doku-Luecken der letzten Tage (heute eingeschlossen).
 * Tag fuer Tag ueber den Kalender (getDayAppointments filtert virtuelle
 * Termine wie der Plattform-Kalender).
 */
export async function findePraxisLuecken(clientId, { tageZurueck = 7, maxLuecken = 12 } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, luecken: [] };
  const nowMs = Date.now();
  const luecken = [];
  for (let i = 0; i <= tageZurueck && luecken.length < maxLuecken; i++) {
    const dateIso = tagIso(nowMs - i * 86400000);
    const day = await getDayAppointments(clientId, { date: dateIso }).catch(() => null);
    if (!day?.ok) continue;
    const pflicht = (day.appointments || []).filter((a) => istDokupflichtig(a, nowMs));
    for (const a of pflicht) {
      if (luecken.length >= maxLuecken) break;
      if (!(await hatDoku(clientId, locationId, a.id))) {
        luecken.push({
          appointmentId: a.id,
          date: dateIso,
          dateSpoken: tagDeutsch(a.startMs),
          startMs: a.startMs,
          patientId: a.patientId,
          patientName: a.patientName,
          patientLastName: a.patientLastName || "",
          motive: a.visitMotive || "",
        });
      }
    }
  }
  // Juengste zuerst (die frischeste Behandlung ist am leichtesten zu erinnern).
  luecken.sort((a, b) => b.startMs - a.startMs);
  return { ok: true, luecken };
}

/** Gesprochene Antwort fuer "Welche Dokus fehlen noch?". */
export function sprichPraxisLuecken(luecken) {
  if (!luecken?.length) return "Die Dokumentation ist auf Stand — ich sehe keine Termine ohne Behandlungsdoku.";
  const n = luecken.length;
  const kopf = n === 1
    ? "Eine Behandlungsdokumentation fehlt noch:"
    : `${n} Behandlungsdokumentationen fehlen noch:`;
  const zeilen = luecken.slice(0, 6).map((l) => `${l.patientName} — ${l.dateSpoken}${l.motive ? `, ${l.motive}` : ""}`);
  const rest = n > 6 ? ` Und ${n - 6} weitere.` : "";
  return `${kopf} ${zeilen.join("; ")}.${rest} Sag "dokumentiere für <Name>", dann tragen wir sie zusammen nach.`;
}

// --- Abendlauf: aktiver Anruf beim Chef -------------------------------------

function configRef(clientId) {
  return masCollection(clientId, "mas_doku_waechter").doc("config");
}

/**
 * Tagesende-Wächter: fehlen Dokus, ruft Clara den Chef aktiv auf dem Handy an
 * (Push auf das Geraet, wie die Recall-Initiative) und arbeitet die Luecken im
 * Gespraech einzeln ab. Hoechstens EIN Anruf pro Tag.
 */
export async function dokuAbendlauf(clientId, { publicBaseUrl = "", tageZurueck = 7 } = {}) {
  const heute = todayBerlin();
  const cfg = (await configRef(clientId).get().catch(() => null))?.data() || {};
  if (cfg.lastPushDay === heute) return { ok: true, skipped: "already_pushed" };

  const { ok, luecken } = await findePraxisLuecken(clientId, { tageZurueck });
  if (!ok) return { ok: false, reason: "no_location" };
  await configRef(clientId).set({ lastRunDay: heute, lastRunAt: Date.now(), offen: luecken.length }, { merge: true });
  if (!luecken.length) return { ok: true, luecken: 0 };

  // Chef-Geraet aufloesen (aktiver Operator, sonst erster hinterlegter).
  const op = await getOperator(clientId).catch(() => null);
  let operatorId = op?.id || "";
  if (!operatorId) {
    const ops = await listOperators(clientId).catch(() => []);
    operatorId = ops?.[0]?.id || "";
  }
  if (!operatorId) return { ok: false, reason: "no_operator", luecken: luecken.length };

  const n = luecken.length;
  const erster = luecken[0];
  const listeKurz = luecken.slice(0, 5).map((l) => `${l.patientName} (${l.dateSpoken}${l.motive ? `, ${l.motive}` : ""})`).join("; ");
  const reason = n === 1
    ? `Eine Behandlungs-Doku fehlt noch: ${listeKurz}. Verbinden Sie sich, dann tragen wir sie nach.`
    : `${n} Behandlungs-Dokus fehlen noch: ${listeKurz}. Verbinden Sie sich, dann gehen wir sie durch.`;

  const r = await callOperator(clientId, operatorId, { reason, publicBaseUrl }).catch(() => ({ ok: false }));
  if (!r?.ok) return { ok: false, reason: "push_failed", luecken: n };

  await configRef(clientId).set({ lastPushDay: heute, lastPushAt: Date.now() }, { merge: true });

  // Gespraechskontext: verbindet sich der Chef, eroeffnet Clara direkt mit der
  // ersten Luecke und arbeitet die Liste EINZELN ab — jede Antwort landet per
  // save_treatment_dictation auf dem RICHTIGEN Termindatum.
  const liste = luecken.slice(0, 8).map((l) => `${l.patientName} | Nachname: ${l.patientLastName || l.patientName.split(" ").pop()} | date=${l.date} | ${l.dateSpoken}${l.motive ? ` | ${l.motive}` : ""}`).join("\n");
  await setPendingCallContext(clientId, {
    kind: "doku_luecken",
    reason,
    date: heute,
    spoken: n === 1
      ? `Ich habe dich angerufen: eine Dokumentation fehlt noch — ${erster.patientName}, Termin ${erster.dateSpoken}${erster.motive ? `, im Kalender steht ${erster.motive}` : ""}. Was habt ihr gemacht?`
      : `Ich habe dich angerufen: ${n} Dokumentationen fehlen noch. Fangen wir mit ${erster.patientName} an — Termin ${erster.dateSpoken}${erster.motive ? `, im Kalender steht ${erster.motive}` : ""}. Was habt ihr gemacht?`,
    instruction:
      `KONTEXT: Du (Clara) hast den Chef soeben aktiv angerufen, weil Behandlungs-Dokumentationen fehlen. ` +
      `Arbeite die Liste EINZELN ab: nenne Patient, Termintag und Besuchsgrund und frage, was gemacht wurde. ` +
      `Jede Antwort speicherst du SOFORT mit save_treatment_dictation (name = Nachname des Patienten, date = das angegebene date JJJJ-MM-TT, text = die Antwort woertlich). ` +
      `Danach weiter zum naechsten Patienten. Sagt der Chef 'spaeter' oder 'morgen', beende das Thema freundlich. ` +
      `LISTE:\n${liste}`,
  }).catch(() => {});

  await appendEvent(clientId, {
    channel: "clara_voice",
    direction: "internal",
    type: "note",
    counterparty: { kind: "other", name: "Clara" },
    subject: { matchStatus: "n/a" },
    summary: `Doku-Wächter: Behandler angerufen — ${n} fehlende Behandlungsdoku${n === 1 ? "" : "s"} (${listeKurz}).`,
    status: "none",
    extractor: "doku@waechter",
    tags: ["doku", "waechter", "push"],
  }).catch(() => {});

  log.info("doku.abendlauf_pushed", { clientId, luecken: n });
  return { ok: true, pushed: true, luecken: n };
}
