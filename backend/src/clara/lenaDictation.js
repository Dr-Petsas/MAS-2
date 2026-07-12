// W-LENA-7: Clara als Sprach-Doku-Assistent — Vorlesen, Suchen+Push, Historie,
// Label-Auskunft. Baut auf den vorhandenen Doku-Bausteinen auf (treatmentDoc.js)
// und bindet den Patienten/Termin halluzinationsfrei aus dem echten Kalender.
//
// Speicherpfad bleibt die vorhandene Doppel-Spur:
//   primaer   clients/{c}/locations/{l}/appointments/{a}/dictations/{seg}
//   sekundaer clients/{c}/mas_events (Shared Memory, Kanal lena_doc, 45 Tage)
// Diese Datei LIEST/durchsucht nur (kein neues Schreiben) — Aufnehmen/Ergaenzen/
// Loeschen laufen ueber die bestehenden save-/strike-Diktat-Pfade.

import admin from "../firebase.js";
import { emitCommand } from "./sessions.js";
import {
  resolveAppointmentInfo,
  readAppointmentSegments,
  combineActiveSegments,
} from "./treatmentDoc.js";
import { getPatientAppointments } from "./daySchedule.js";
import { intakeToAbsichten } from "./billingIntake.js";
import { loadSophieKatalog, konzeptLabelIndex } from "./sophieKatalog.js";

const _BERLIN = "Europe/Berlin";

function _tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (ts?._seconds) return ts._seconds * 1000;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function _germanDate(ms) {
  if (!ms) return "";
  return new Intl.DateTimeFormat("de-DE", { timeZone: _BERLIN, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));
}

/** Ausfuehrliches, sprechbares Datum mit Wochentag ("Dienstag, den 23. Juni 2026"). */
function _germanWeekdayDate(ms) {
  if (!ms) return "";
  const wd = new Intl.DateTimeFormat("de-DE", { timeZone: _BERLIN, weekday: "long" }).format(new Date(ms));
  const rest = new Intl.DateTimeFormat("de-DE", { timeZone: _BERLIN, day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
  return `${wd}, den ${rest}`;
}

const _ZAHLWORT = {
  ein: 1, eine: 1, einem: 1, einer: 1, eins: 1, zwei: 2, drei: 3, vier: 4,
  fuenf: 5, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwoelf: 12, "zwölf": 12, "paar": 3, einigen: 5, einige: 5,
};

function _anzahl(token) {
  const t = String(token || "").trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return _ZAHLWORT[t] || 0;
}

/**
 * Relative deutsche Zeitangabe -> ungefaehrer Ziel-Zeitpunkt (ms). Bewusst
 * ungefaehr: der Backdated-Finder waehlt anschliessend den ECHTEN Termin, der
 * dem Ziel am naechsten liegt, und laesst ihn bestaetigen. Gibt null zurueck,
 * wenn nichts erkannt wurde. "vor drei Wochen", "vor 2 Monaten", "gestern",
 * "letzte Woche", "vorletzten Monat" …
 */
export function resolveRelativeDate(when, fromMs = Date.now()) {
  const s = String(when || "").trim().toLowerCase();
  if (!s) return null;
  const d = new Date(fromMs);

  if (/\bvorgestern\b/.test(s)) { d.setDate(d.getDate() - 2); return d.getTime(); }
  if (/\bgestern\b/.test(s)) { d.setDate(d.getDate() - 1); return d.getTime(); }

  // "vor X Tagen/Wochen/Monaten/Jahren"
  let m = s.match(/vor\s+([\wäöü]+)\s+(tag|tage|tagen|woche|wochen|monat|monate|monaten|jahr|jahre|jahren)/);
  if (m) {
    const n = _anzahl(m[1]) || 1;
    const unit = m[2];
    if (/^tag/.test(unit)) d.setDate(d.getDate() - n);
    else if (/^woche/.test(unit)) d.setDate(d.getDate() - 7 * n);
    else if (/^monat/.test(unit)) d.setMonth(d.getMonth() - n);
    else if (/^jahr/.test(unit)) d.setFullYear(d.getFullYear() - n);
    return d.getTime();
  }

  // "letzte/vergangene Woche", "letzten/vorletzten Monat", "letztes Jahr"
  if (/(vorletzt)\w*\s+woche/.test(s)) { d.setDate(d.getDate() - 14); return d.getTime(); }
  if (/(letzt|vergangen)\w*\s+woche/.test(s)) { d.setDate(d.getDate() - 7); return d.getTime(); }
  if (/(vorletzt)\w*\s+monat/.test(s)) { d.setMonth(d.getMonth() - 2); return d.getTime(); }
  if (/(letzt|vergangen)\w*\s+monat/.test(s)) { d.setMonth(d.getMonth() - 1); return d.getTime(); }
  if (/(letzt|vergangen)\w*\s+jahr/.test(s)) { d.setFullYear(d.getFullYear() - 1); return d.getTime(); }

  return null;
}

function _absoluteDateMs(dateStr) {
  const s = String(dateStr || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // Mittag lokal, damit Zeitzonen-Verschiebungen den Tag nicht kippen.
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).getTime();
}

/**
 * BACKDATED: den vergangenen Termin eines Patienten finden, der einer
 * (relativen oder absoluten) Zeitangabe am naechsten liegt — fuer einen
 * Nachtrag zu einer zurueckliegenden Behandlung. Waehlt IMMER aus den ECHTEN
 * Kalenderterminen (nie geraten) und liefert den Vorschlag zur Bestaetigung.
 * @returns {Promise<{ok:boolean, message?:string, appointmentId?:string,
 *   locationId?:string, patientId?:string, patientName?:string,
 *   apptStartMs?:number, motiveName?:string, dateLabel?:string}>}
 */
export async function findBackdatedAppointment(clientId, { patientId, lastName, firstName, date, when } = {}) {
  const targetMs = _absoluteDateMs(date) || resolveRelativeDate(when);
  const hist = await getPatientAppointments(clientId, {
    patientId: String(patientId || "").trim(),
    lastName: String(lastName || "").trim(),
    firstName: String(firstName || "").trim(),
  });
  const who = `${firstName || ""} ${lastName || ""}`.trim() || "dem Patienten";
  if (!hist?.ok) return { ok: false, message: `Die Termine von ${who} kann ich gerade nicht abrufen.` };
  const past = (hist.past || []).filter((a) => a?.id && a.startMs);
  if (!past.length) return { ok: false, message: `Zu ${who} finde ich keinen vergangenen Termin.` };

  let pick;
  if (targetMs) {
    // Termin, dessen Start dem Ziel am naechsten liegt.
    pick = past.reduce((best, a) =>
      Math.abs(a.startMs - targetMs) < Math.abs(best.startMs - targetMs) ? a : best, past[0]);
  } else {
    // Keine verwertbare Zeitangabe -> juengster vergangener Termin (Rueckfrage
    // hilft der Chef ohnehin per Bestaetigung).
    pick = past[past.length - 1];
  }

  // Konsistente Termin-Form (locationId, Patient, Besuchsgrund, Start).
  const info = await resolveAppointmentInfo(clientId, { appointmentId: pick.id });
  if (!info?.ok) return { ok: false, message: info?.message || "Den gefundenen Termin konnte ich nicht lesen." };
  return {
    ok: true,
    appointmentId: info.appointmentId,
    locationId: info.locationId,
    patientId: info.patientId || String(patientId || ""),
    patientName: info.patientName || who,
    apptStartMs: info.apptStartMs || pick.startMs,
    motiveName: info.motiveName || String(pick.visitMotive || ""),
    dateLabel: _germanWeekdayDate(info.apptStartMs || pick.startMs),
  };
}

/** Text in Saetze zerlegen (fuer Vorlesen/Suche) — grob, aber robust. */
function _sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * VORLESEN (7b): die Doku eines Termins sprechbar zurueckgeben.
 *  mode "full"    -> kompletter aktiver Doku-Text (verbatim)
 *  mode "last"    -> nur das zuletzt Diktierte (juengstes aktives Segment)
 *  mode "summary" -> knappe Zusammenfassung (Anzahl + erster/letzter Satz)
 * Termin: explizite appointmentId > Patient+Datum > juengster begonnener Termin.
 */
export async function readTreatmentDictation(clientId, { mode = "full", appointmentId, patientId, lastName, date } = {}) {
  const info = await resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date });
  if (!info?.ok) return { ok: false, message: info?.message || "Ich konnte keinen passenden Termin finden." };

  let segs;
  try {
    segs = await readAppointmentSegments(clientId, info.locationId, info.appointmentId);
  } catch (e) {
    return { ok: false, message: `Die Dokumentation konnte ich nicht lesen: ${String(e?.message || e)}` };
  }
  const aktiv = (segs || []).filter((s) => !s.struck && String(s.source || "") !== "sophie" && String(s.text || "").trim());
  const who = info.patientName || "diesem Patienten";
  const wann = info.apptStartMs ? ` vom ${_germanDate(info.apptStartMs)}` : "";
  if (!aktiv.length) {
    return { ok: true, empty: true, appointmentId: info.appointmentId, message: `Zu ${who}${wann} ist noch nichts dokumentiert.` };
  }

  if (mode === "last") {
    const letzter = aktiv[aktiv.length - 1];
    return { ok: true, appointmentId: info.appointmentId, message: `Zuletzt diktiert: ${String(letzter.text || "").trim()}` };
  }

  const full = combineActiveSegments(aktiv);
  if (mode === "summary") {
    const saetze = _sentences(full);
    const kopf = `Zu ${who}${wann}: ${aktiv.length} ${aktiv.length === 1 ? "Eintrag" : "Einträge"}.`;
    if (!saetze.length) return { ok: true, appointmentId: info.appointmentId, message: kopf };
    const erster = saetze[0];
    const letzter = saetze[saetze.length - 1];
    const kern = saetze.length === 1 ? erster : `${erster} … ${letzter}`;
    return { ok: true, appointmentId: info.appointmentId, message: `${kopf} ${kern}` };
  }

  // full (Default): kompletter Text, sanft gedeckelt (nicht endlos vorlesen).
  const text = full.length > 1500 ? full.slice(0, 1497) + "…" : full;
  return { ok: true, appointmentId: info.appointmentId, message: `Doku zu ${who}${wann}: ${text}` };
}

/**
 * SUCHE + PUSH (7e): eine Aussage in der Termin-Doku finden und die Fundstelle
 * (Patientenname, Datum, Textpassage) per Live-Follow an den Monitor pushen.
 * Sucht standardmaessig im aktuell aufgeloesten Termin; mit `date` in dem des
 * Tages. Deterministisch (Wortueberlappung), kein LLM.
 */
export async function findInTreatment(clientId, { query, appointmentId, patientId, lastName, date, push = true } = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, message: "Wonach soll ich in der Doku suchen?" };

  const info = await resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date });
  if (!info?.ok) return { ok: false, message: info?.message || "Ich konnte keinen passenden Termin finden." };

  let segs;
  try {
    segs = await readAppointmentSegments(clientId, info.locationId, info.appointmentId);
  } catch (e) {
    return { ok: false, message: `Die Dokumentation konnte ich nicht lesen: ${String(e?.message || e)}` };
  }
  const aktiv = (segs || []).filter((s) => !s.struck && String(s.source || "") !== "sophie" && String(s.text || "").trim());
  const who = info.patientName || "diesem Patienten";
  const wann = info.apptStartMs ? _germanDate(info.apptStartMs) : "";

  const qWords = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  let best = null;
  let bestScore = 0;
  for (const s of aktiv) {
    for (const satz of _sentences(s.text)) {
      const low = satz.toLowerCase();
      let score = 0;
      if (low.includes(q.toLowerCase())) score += 100; // Volltreffer der Phrase
      for (const w of qWords) if (low.includes(w)) score += 1;
      if (score > bestScore) { bestScore = score; best = satz; }
    }
  }
  if (!best || bestScore === 0) {
    return { ok: true, found: false, appointmentId: info.appointmentId, message: `Zu „${q}" finde ich bei ${who}${wann ? ` (${wann})` : ""} nichts in der Dokumentation.` };
  }

  const treffer = { patientName: who, dateMs: info.apptStartMs || 0, dateLabel: wann, passage: best, appointmentId: info.appointmentId, query: q };
  if (push) {
    // Fundstelle an den Monitor pushen (Chef sieht Patient/Datum/Passage).
    try {
      await emitCommand(clientId, {
        type: "lena_find_result",
        appointmentId: info.appointmentId,
        patientId: info.patientId || "",
        locationId: info.locationId,
        patientName: who,
        dateMs: info.apptStartMs || 0,
        query: q,
        passage: best,
      });
    } catch { /* kein aktiver Monitor -> die gesprochene Antwort reicht */ }
  }
  return {
    ok: true,
    found: true,
    ...treffer,
    message: `Gefunden bei ${who}${wann ? ` am ${wann}` : ""}: „${best}". Die Stelle habe ich dir auf den Bildschirm gelegt.`,
  };
}

/**
 * Sprechbare/anzeigbare Kurzform einer Absicht — Server-Spiegel von
 * `behandlungsLabel` im Frontend (Label + Zahn + Flaechen + Implantat-Zusaetze).
 * Bewusst schlank: die Ziffern/Details rechnet Sophie, hier zaehlt Lesbarkeit.
 */
function _absichtLabel(absicht, labelIdx) {
  const konz = labelIdx.get(absicht.konzeptId);
  const teile = [konz?.label || absicht.konzeptId];
  const at = absicht.attrs || {};
  if (at.zahn) teile.push(`an ${at.zahn}`);
  if (at.flaechen) teile.push(String(at.flaechen).toUpperCase());
  const zusatz = [];
  if (at.augmentation === "ja") zusatz.push("Augmentation");
  if (at.sinuslift === "intern") zusatz.push("Sinuslift intern");
  if (at.sinuslift === "extern") zusatz.push("Sinuslift extern");
  if (at.knochenherkunft === "eigenknochen") zusatz.push("Eigenknochen");
  if (at.membran === "titanmesh") zusatz.push("Titangitter");
  if (at.membran === "kollagen") zusatz.push("Kollagenmembran");
  if (at.prf === "ja") zusatz.push("PRF");
  let s = teile.join(" ");
  if (zusatz.length) s += ` mit ${zusatz.join(", ")}`;
  return s.trim();
}

/**
 * LABEL ANLEGEN (7d+): eine GESPROCHENE Behandlung serverseitig als Sophie-Label
 * am Termin planen. Erkennt Konzept + Attribute ueber `intakeToAbsichten` (lokales
 * LLM + serverseitig gespiegelter Konzept-Katalog) — NIEMALS Ziffern (die leitet
 * Sophie deterministisch ab) — und schreibt sie ADDITIV in
 * appointment.sophiePlan.absichten; terminGrund wird aus allen Absichten neu
 * gebaut. So wird aus "Fuellung an 35" ohne geoeffnetes Frontend ein echtes
 * Sophie-Label, das die Planungsseite als Karte zeigt und read_treatment_labels vorliest.
 */
export async function addTreatmentLabel(clientId, { text, appointmentId, patientId, lastName, date } = {}) {
  const eingabe = String(text || "").trim();
  if (!eingabe) return { ok: false, message: "Welche Behandlung soll ich für Sophie notieren?" };

  const info = await resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date });
  if (!info?.ok) return { ok: false, message: info?.message || "Ich konnte keinen passenden Termin finden." };
  const who = info.patientName || "diesem Patienten";

  const katalog = await loadSophieKatalog();
  if (!katalog) {
    return { ok: false, message: "Der Behandlungs-Katalog ist auf dem Server noch nicht geladen. Bitte einmal Sophie im Browser öffnen, dann kann ich das notieren." };
  }

  let erg;
  try {
    erg = await intakeToAbsichten({ text: eingabe, katalog });
  } catch (e) {
    return { ok: false, message: `Die Behandlung konnte ich nicht erkennen: ${String(e?.message || e)}` };
  }
  const neu = (erg?.absichten || []).filter((a) => a && a.konzept);
  if (!neu.length) {
    return { ok: true, empty: true, appointmentId: info.appointmentId, message: `Aus „${eingabe}" konnte ich keine klare Behandlung erkennen. Bitte anders formulieren.` };
  }

  const labelIdx = konzeptLabelIndex(katalog);
  const now = Date.now();
  const neueAbsichten = neu.map((a, i) => ({
    id: `clara_${now.toString(36)}_${i}`,
    konzeptId: String(a.konzept),
    attrs: (a.attrs && typeof a.attrs === "object") ? a.attrs : {},
  }));

  const apptRef = admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(info.locationId)
    .collection("appointments").doc(info.appointmentId);

  let bestehende = [];
  try {
    const snap = await apptRef.get();
    const sp = snap.exists ? snap.data()?.sophiePlan : null;
    if (Array.isArray(sp?.absichten)) bestehende = sp.absichten;
  } catch { /* neuer Plan */ }

  const alle = [...bestehende, ...neueAbsichten];
  const terminGrund = alle.map((a) => _absichtLabel(a, labelIdx)).filter(Boolean).join(" · ");
  const plan = {
    absichten: alle,
    terminGrund,
    behandlungsdatum: new Date(info.apptStartMs || now).toISOString().slice(0, 10),
    quelle: "clara",
  };
  try {
    await apptRef.set({ sophiePlan: plan }, { merge: true });
  } catch (e) {
    return { ok: false, message: `Den Plan konnte ich nicht speichern: ${String(e?.message || e)}` };
  }

  const neuLabels = neueAbsichten.map((a) => _absichtLabel(a, labelIdx)).filter(Boolean).join(", ");
  const unbek = Array.isArray(erg?.unbekannt) && erg.unbekannt.length
    ? ` Nicht zuordnen konnte ich: ${erg.unbekannt.join(", ")}.`
    : "";
  return {
    ok: true,
    appointmentId: info.appointmentId,
    added: neueAbsichten.length,
    message: `Für ${who} notiert: ${neuLabels}. Die Ziffern leitet Sophie ab.${unbek}`,
  };
}

/**
 * LABEL-AUSKUNFT (7d, Lesen): die aktuell fuer den Termin geplanten
 * Behandlungen (Sophie-Plan `sophiePlan.terminGrund`) vorlesen. Ergaenzen/
 * Loeschen von Labels laeuft architektur-konform ueber Diktat-Ergaenzung
 * (save_treatment_dictation) bzw. Streichen (strike_treatment_dictation) —
 * Sophie leitet die Labels/Ziffern daraus ab (Lena bestimmt keine Ziffern).
 */
export async function readTreatmentLabels(clientId, { appointmentId, patientId, lastName, date } = {}) {
  const info = await resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date });
  if (!info?.ok) return { ok: false, message: info?.message || "Ich konnte keinen passenden Termin finden." };
  const who = info.patientName || "diesem Patienten";
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(info.locationId)
      .collection("appointments").doc(info.appointmentId).get();
    const sp = snap.exists ? snap.data()?.sophiePlan : null;
    const grund = String(sp?.terminGrund || "").trim();
    if (grund) {
      return { ok: true, appointmentId: info.appointmentId, message: `Für ${who} sind geplant: ${grund}.` };
    }
    const n = Array.isArray(sp?.absichten) ? sp.absichten.length : 0;
    if (n) return { ok: true, appointmentId: info.appointmentId, message: `Für ${who} sind ${n} Behandlungen geplant.` };
    return { ok: true, empty: true, appointmentId: info.appointmentId, message: `Für ${who} ist noch keine Behandlung an Sophie übergeben. Die Labels erkennt Lena aus der Aufnahme.` };
  } catch (e) {
    return { ok: false, message: `Den Plan konnte ich nicht lesen: ${String(e?.message || e)}` };
  }
}
