// Lisas Anrufe im Praxisgedaechtnis: ein Eintrag je Anruf, eine Ablage.
//
// Lisa V8 meldet nach jedem Anruf (auch ohne Abnehmen) ueber
// POST /brain/lisa-anrufe. Daraus wird EIN Eintrag in mas_events mit fester
// Kennung. Bianca liest ihn beim Abheben (GET /brain/caller-context), die
// Clara-Seite zeigt ihn in der Tagesliste. Aufnahme und Wortlaut bleiben im
// CallR der Plattform, der Auftrag in mas_lisa_tasks; der Eintrag verweist nur.
//
// - Den Satz fuer den Angerufenen (`summary`) baut MAS selbst, nur aus Patient,
//   Zeit, Anlass, Behandler und Ausgang. Was Lisa gesagt hat und was beim
//   Rueckruf zu tun ist, steht im Block `anruf` und nie im Satz.
// - Je Nummer und Patient bleibt nur der juengste Eintrag offen (`versuche`
//   zaehlt mit). Familien teilen sich eine Nummer: ein Eintrag fuer Patient A
//   schliesst nie den fuer Patient B.
// - "Nicht mehr anrufen" bleibt fuer das Team offen, Bianca bekommt es nur als
//   Tatsache (`nicht_vortragen`), nicht im Text fuer den Anrufer.
// - Es entsteht kein Vorgang.
//
// Vertrag: internal/lisa-anrufnotiz-schnittstelle.md (Projektspeicher).

import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { buildEvent, nameKeyOf, CHANNELS, DIRECTIONS, EVENT_TYPES, ITEM_STATUS } from "./events.js";
import { queryLatest, resolveItem } from "./eventStore.js";

const FieldValue = admin.firestore.FieldValue;
export const LISA_ANRUF_EXTRACTOR = "lisa-v8";
export const ERSETZT_NOTIZ = "durch späteren Anruf ersetzt";
const KENNUNG_PREFIX = "lisa-anruf-";
const FENSTER_MS = 14 * 24 * 3_600_000;
const TZ = "Europe/Berlin";

const ERREICHT = ["person", "andere_person", "mailbox", "niemand", "besetzt", "abgelehnt", "gescheitert"];
const AUSGAENGE = ["termin", "rueckruf_gewuenscht", "meldet_sich_selbst", "kein_interesse", "nicht_mehr_anrufen",
  "falsche_person", "nachricht_ausgerichtet", "anderes_anliegen", "abgebrochen"];
const NICHT_OFFEN = new Set(["termin", "nachricht_ausgerichtet", "kein_interesse", "gescheitert"]);

const AUSGANG_TEXT = {
  niemand: "niemanden erreicht",
  besetzt: "es war besetzt",
  abgelehnt: "der Anruf wurde nicht angenommen",
  mailbox: "nur den Anrufbeantworter erreicht",
  andere_person: "jemand anderen am Telefon erreicht",
  gescheitert: "der Anruf kam technisch nicht zustande",
  termin: "Termin vereinbart",
  rueckruf_gewuenscht: "bittet um Rückruf",
  meldet_sich_selbst: "meldet sich selbst",
  kein_interesse: "möchte das Angebot nicht",
  nicht_mehr_anrufen: "möchte nicht mehr angerufen werden",
  falsche_person: "unter der Nummer nicht zu erreichen",
  nachricht_ausgerichtet: "Nachricht ausgerichtet",
  anderes_anliegen: "hatte ein anderes Anliegen",
  abgebrochen: "Gespräch brach ab, bevor etwas feststand",
};

function text(v, max = 0) {
  const t = v == null ? "" : String(v).trim();
  return max && t.length > max ? t.slice(0, max).trim() : t;
}

function ziffern(v) {
  let out = "";
  for (const z of text(v)) if (z >= "0" && z <= "9") out += z;
  return out;
}

/** Nummer mit Laendervorwahl ("+49…"); "00…" und nationale "0…" werden umgeschrieben. */
export function nummerMitVorwahl(roh) {
  const t = text(roh);
  const z = ziffern(t);
  if (z.length < 7) return "";
  if (t.startsWith("+")) return `+${z}`;
  if (z.startsWith("00")) return `+${z.slice(2)}`;
  if (z.startsWith("0")) return `+49${z.slice(1)}`;
  return `+${z}`;
}

/** Nationale Ziffernform zum Vergleichen (wie bianca/callerContext.canonDigits). */
function national(roh) {
  let d = ziffern(roh);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("49") && d.length >= 10) d = `0${d.slice(2)}`;
  return d;
}

function kennungAus(anrufId) {
  let out = "";
  for (const z of text(anrufId)) {
    const ok = (z >= "0" && z <= "9") || (z >= "a" && z <= "z") || (z >= "A" && z <= "Z") || z === "-" || z === "_";
    out += ok ? z : "-";
  }
  return out.slice(0, 120);
}

function zeitMs(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  const t = text(v);
  if (!t) return 0;
  const alsZahl = Number(t);
  if (Number.isFinite(alsZahl) && alsZahl > 0) return alsZahl;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function uhrzeit(ms) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
}

function tagLang(ms) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(ms));
}

function terminText(t) {
  if (!t) return "";
  const datum = text(t.datum);
  const ms = datum ? new Date(`${datum}T12:00:00Z`).getTime() : NaN;
  const tag = Number.isFinite(ms) ? tagLang(ms) : datum;
  return [tag, text(t.uhrzeit) ? `${text(t.uhrzeit)} Uhr` : ""].filter(Boolean).join(", ")
    + (text(t.behandler) ? ` bei ${text(t.behandler)}` : "");
}

function terminAus(roh) {
  if (!roh || typeof roh !== "object") return null;
  const t = { datum: text(roh.datum, 10), uhrzeit: text(roh.uhrzeit, 5), behandler: text(roh.behandler, 80), termin_id: text(roh.termin_id, 120) };
  return t.datum || t.uhrzeit ? t : null;
}

/**
 * Lisas Meldung pruefen und in die gespeicherte Form bringen (rein).
 * @returns {{ok:true, anruf:object}|{ok:false, grund:string, klartext:string}}
 */
export function pruefeAnruf(roh = {}) {
  const nein = (grund, klartext) => ({ ok: false, grund, klartext });
  const kennung = kennungAus(roh.anruf_id);
  if (!kennung) return nein("anruf_id_fehlt", "Die Kennung des Anrufs (anruf_id) fehlt.");
  const nummer = nummerMitVorwahl(roh.nummer);
  if (!nummer) return nein("nummer_fehlt", "Die gewählte Nummer fehlt oder ist zu kurz.");
  const beginnMs = zeitMs(roh.beginn);
  if (!beginnMs) return nein("beginn_unlesbar", "Der Beginn des Anrufs fehlt oder ist nicht lesbar.");
  const erreicht = text(roh.erreicht);
  if (!ERREICHT.includes(erreicht)) return nein("erreicht_unbekannt", `erreicht muss eines sein von: ${ERREICHT.join(", ")}.`);
  let ausgang = text(roh.ausgang);
  if (erreicht === "person") {
    if (!AUSGAENGE.includes(ausgang)) return nein("ausgang_unbekannt", `Bei erreicht=person muss ausgang eines sein von: ${AUSGAENGE.join(", ")}.`);
  } else {
    ausgang = "";
  }
  const anlass = text(roh.anlass, 160);
  if (!anlass) return nein("anlass_fehlt", "Der Anlass des Anrufs fehlt.");
  const vorname = text(roh.patient?.vorname, 60);
  const nachname = text(roh.patient?.nachname, 60);
  const patientId = text(roh.patient?.id, 120);
  const termin = terminAus(roh.termin);
  if (ausgang === "termin" && !termin) return nein("termin_fehlt", "Bei ausgang=termin fehlen Datum und Uhrzeit des Termins.");
  const angebot = (Array.isArray(roh.angebot) ? roh.angebot : []).map(terminAus).filter(Boolean).slice(0, 5);
  const dauer = Number(roh.dauer_s);
  const anruf = {
    anruf_id: text(roh.anruf_id, 120),
    kennung: `${KENNUNG_PREFIX}${kennung}`,
    nummer,
    beginnMs,
    erreicht,
    ausgang,
    patient: { id: patientId || null, vorname, nachname, name: [vorname, nachname].filter(Boolean).join(" ") },
    anlass,
    behandler: text(roh.behandler, 80),
    mailbox_nachricht: erreicht === "mailbox" && roh.mailbox_nachricht === true,
    gesagt: text(roh.gesagt, 400),
    angebot,
    termin: ausgang === "termin" ? termin : null,
    rueckruf_wann: text(roh.rueckruf_wann, 120),
    beim_rueckruf: text(roh.beim_rueckruf, 300),
    dauer_s: Number.isFinite(dauer) && dauer >= 0 ? Math.round(dauer) : null,
    phone_call_id: text(roh.phone_call_id, 160),
    auftrag_id: text(roh.auftrag_id, 160),
    standort: text(roh.standort, 120),
  };
  return { ok: true, anruf };
}

/** Wert fuer `ausgang` nach aussen: bei nicht erreichter Person der Wert von `erreicht`. */
export function ausgangVon(anruf) {
  return anruf?.erreicht === "person" ? text(anruf.ausgang) : text(anruf?.erreicht);
}

export function istOffen(anruf) {
  return !NICHT_OFFEN.has(ausgangVon(anruf));
}

export function nichtMehrAnrufen(anruf) {
  return ausgangVon(anruf) === "nicht_mehr_anrufen";
}

/** Anlass mit Behandler, ohne Anweisung: darf der Person selbst gesagt werden. */
export function grundVon(anruf) {
  const anlass = text(anruf?.anlass);
  const beh = text(anruf?.behandler);
  if (!beh || anlass.toLowerCase().includes(beh.toLowerCase())) return anlass;
  return `${anlass} bei ${beh}`;
}

/** Der Satz fuer `summary`: immer gleich gebaut, nichts Internes. */
export function satzFuer(anruf) {
  const name = text(anruf?.patient?.name) || "die gewählte Nummer";
  const wer = text(anruf?.patient?.name) || "Die angerufene Person";
  const um = `um ${uhrzeit(anruf.beginnMs)} Uhr`;
  const worum = ` Es ging um: ${grundVon(anruf)}.`;
  const versucht = `Lisa aus der Praxis hat ${um} versucht, ${name} zu erreichen`;
  const gesprochen = `Lisa aus der Praxis hat ${um} mit ${name} gesprochen`;
  switch (ausgangVon(anruf)) {
    case "niemand": return `${versucht}, und niemanden erreicht.${worum}`;
    case "besetzt": return `${versucht}, es war besetzt.${worum}`;
    case "abgelehnt": return `${versucht}, der Anruf wurde nicht angenommen.${worum}`;
    case "mailbox":
      return anruf.mailbox_nachricht
        ? `${versucht}, und eine Nachricht auf dem Anrufbeantworter hinterlassen.${worum}`
        : `${versucht}, und nur den Anrufbeantworter erreicht. Eine Nachricht hat sie nicht hinterlassen.${worum}`;
    case "andere_person": return `${versucht}, und jemand anderen am Telefon gehabt.${worum}`;
    case "gescheitert": return `Lisa aus der Praxis wollte ${um} ${name} anrufen. Der Anruf kam technisch nicht zustande.${worum}`;
    case "termin": return `${gesprochen} und einen Termin vereinbart: ${terminText(anruf.termin)}.${worum}`;
    case "rueckruf_gewuenscht":
      return `${gesprochen}. ${wer} bittet um Rückruf${anruf.rueckruf_wann ? ` (${anruf.rueckruf_wann})` : ""}.${worum}`;
    case "meldet_sich_selbst": return `${gesprochen}. ${wer} wollte sich selbst wieder melden.${worum}`;
    case "kein_interesse": return `${gesprochen}. ${wer} möchte das Angebot nicht.${worum}`;
    case "nicht_mehr_anrufen": return `${gesprochen}. ${wer} möchte nicht mehr angerufen werden.${worum}`;
    case "falsche_person": return `${versucht}. Unter dieser Nummer ist die Person nicht zu erreichen.${worum}`;
    case "nachricht_ausgerichtet": return `${gesprochen} und die Nachricht ausgerichtet.${worum}`;
    case "abgebrochen": return `${gesprochen}. Das Gespräch brach ab, bevor etwas feststand.${worum}`;
    default: return `${gesprochen}. ${wer} hatte ein anderes Anliegen.${worum}`;
  }
}

/** Anweisung fuer den Rueckruf, wenn Lisa keine mitgegeben hat. Wird nie vorgelesen. */
export function beimRueckrufVon(anruf) {
  if (text(anruf?.beim_rueckruf)) return text(anruf.beim_rueckruf);
  const anlass = `Anlass: ${grundVon(anruf)}.`;
  switch (ausgangVon(anruf)) {
    case "nicht_mehr_anrufen": return "Möchte nicht mehr von der Praxis angerufen werden. Nur wissen, nicht ansprechen.";
    case "rueckruf_gewuenscht": return `Hat um Rückruf gebeten. ${anlass} Das Anliegen gleich klären.`;
    case "meldet_sich_selbst": return `Wollte sich selbst melden. ${anlass} Das Anliegen gleich klären.`;
    case "falsche_person": return "Unter dieser Nummer war die gemeinte Person nicht zu erreichen. Nach der richtigen Nummer fragen.";
    case "abgebrochen": return `Das Gespräch mit Lisa brach ab, bevor etwas feststand. ${anlass} Das Anliegen gleich klären.`;
    case "anderes_anliegen": return `Hatte beim Anruf ein anderes Anliegen. Nachfragen, worum es geht. ${anlass}`;
    case "termin": case "nachricht_ausgerichtet": case "kein_interesse": case "gescheitert": return "";
    default: return `Sagen, dass die Praxis angerufen hat. ${anlass} Das Anliegen gleich klären.`;
  }
}

export function istLisaAnruf(event) {
  return event?.extractor === LISA_ANRUF_EXTRACTOR && !!event?.anruf && String(event?.id || "").startsWith(KENNUNG_PREFIX);
}

function patientSchluessel(anruf) {
  return { id: text(anruf?.patient?.id), name: nameKeyOf(text(anruf?.patient?.name)) };
}

/** Gleiche Nummer und gleicher Patient? Ohne Patient auf beiden Seiten gilt die Nummer allein. */
export function gleicheSache(a, b) {
  if (national(a?.nummer) !== national(b?.nummer)) return false;
  const pa = patientSchluessel(a);
  const pb = patientSchluessel(b);
  if (pa.id && pb.id) return pa.id === pb.id;
  return pa.name === pb.name;
}

/** Der Eintrag fuers Praxisgedaechtnis (rein). */
export function eintragAus(clientId, anruf, { versuche = 1 } = {}) {
  const offen = istOffen(anruf);
  const event = buildEvent({
    clientId,
    id: anruf.kennung,
    ts: anruf.beginnMs,
    channel: CHANNELS.LISA_CALL,
    direction: DIRECTIONS.OUT,
    type: EVENT_TYPES.INTERACTION,
    counterparty: { kind: "patient", name: anruf.patient.name, ref: anruf.nummer },
    subject: { patientId: anruf.patient.id || "", name: anruf.patient.name },
    summary: satzFuer(anruf),
    signals: ausgangVon(anruf) === "rueckruf_gewuenscht" ? { callbackRequested: true } : {},
    status: offen ? ITEM_STATUS.OPEN : ITEM_STATUS.NONE,
    payloadRef: anruf.phone_call_id ? { kind: "phoneCall", id: anruf.phone_call_id } : null,
    extractor: LISA_ANRUF_EXTRACTOR,
    tags: ["lisa", "call", "anruf"],
  });
  return { ...event, anruf: { ...anruf, versuche } };
}

/** Zeile fuer Bianca (`items` in /brain/caller-context). */
export function itemAus(event) {
  if (!istLisaAnruf(event)) {
    return {
      id: event.id, ts: event.ts || 0, zeit: event.ts ? tagLang(event.ts) : "", art: "notiz",
      patient: text(event.counterparty?.name || event.subject?.name), grund: text(event.summary),
      ausgang: "", ausgang_text: "", versuche: 1, gesagt: "", angebot: [], beim_rueckruf: "", nicht_vortragen: false,
    };
  }
  const a = event.anruf;
  const ausgang = ausgangVon(a);
  return {
    id: event.id,
    ts: event.ts || 0,
    zeit: `${tagLang(event.ts)}, ${uhrzeit(event.ts)} Uhr`,
    art: "lisa_anruf",
    patient: text(a.patient?.name),
    grund: grundVon(a),
    ausgang,
    ausgang_text: AUSGANG_TEXT[ausgang] || "",
    versuche: Number(a.versuche) || 1,
    gesagt: text(a.gesagt),
    angebot: Array.isArray(a.angebot) ? a.angebot : [],
    beim_rueckruf: beimRueckrufVon(a),
    // Tatsache fuer Bianca, kein Anlass: nicht vortragen, nicht von Bianca erledigen.
    nicht_vortragen: nichtMehrAnrufen(a),
  };
}

/** Zeile fuer die Clara-Seite. */
function seitenZeile(event) {
  const a = event.anruf;
  const ausgang = ausgangVon(a);
  return {
    id: event.id,
    zeitMs: event.ts || 0,
    patient: text(a.patient?.name),
    patientId: a.patient?.id || null,
    telefon: text(a.nummer),
    anlass: grundVon(a),
    ausgang,
    ausgangText: AUSGANG_TEXT[ausgang] || "",
    mailboxNachricht: !!a.mailbox_nachricht,
    versuche: Number(a.versuche) || 1,
    gesagt: text(a.gesagt),
    angebot: (Array.isArray(a.angebot) ? a.angebot : []).map(terminText).filter(Boolean),
    termin: terminText(a.termin),
    rueckrufWann: text(a.rueckruf_wann),
    beimRueckruf: beimRueckrufVon(a),
    nichtMehrAnrufen: nichtMehrAnrufen(a),
    offen: event.status === ITEM_STATUS.OPEN,
    erledigtVon: event.status === ITEM_STATUS.RESOLVED ? text(event.resolvedBy?.actor) : "",
    erledigtMs: event.status === ITEM_STATUS.RESOLVED ? Number(event.resolvedBy?.ts) || 0 : 0,
    phoneCallId: text(a.phone_call_id) || null,
    auftragId: text(a.auftrag_id) || null,
    standort: text(a.standort) || null,
  };
}

/**
 * Lisas Anrufe fuer die Clara-Seite (rein): `offen` = alles noch Offene aus dem
 * Fenster, aeltestes zuerst; `heute` = alle Anrufe von heute, juengster zuerst.
 * Eintraege, die ein spaeterer Anruf ersetzt hat, stehen in keiner der Listen.
 */
export function lisaAnrufeFuerSeite(events = [], { startOfDayMs = 0 } = {}) {
  const alle = (events || []).filter(istLisaAnruf)
    .filter((e) => !(e.status === ITEM_STATUS.RESOLVED && text(e.resolvedBy?.note) === ERSETZT_NOTIZ));
  const offen = alle.filter((e) => e.status === ITEM_STATUS.OPEN).sort((a, b) => (a.ts || 0) - (b.ts || 0)).map(seitenZeile);
  const heute = alle.filter((e) => (e.ts || 0) >= startOfDayMs).sort((a, b) => (b.ts || 0) - (a.ts || 0)).map(seitenZeile);
  return { offen, heute };
}

/**
 * Lisas Meldung annehmen. Doppeltes Schicken derselben `anruf_id` erzeugt
 * nichts Neues und aendert nichts.
 */
export async function speichereLisaAnruf(clientId, roh = {}) {
  const p = pruefeAnruf(roh);
  if (!p.ok) return p;
  const { anruf } = p;
  const col = masCollection(clientId, "mas_events");
  const ref = col.doc(anruf.kennung);

  const schon = await ref.get();
  if (schon.exists) {
    const e = schon.data();
    return { ok: true, id: anruf.kennung, neu: false, offen: e.status === ITEM_STATUS.OPEN, satz: text(e.summary), versuche: Number(e.anruf?.versuche) || 1, ersetzt: [] };
  }

  // Aeltere offene Lisa-Eintraege zur selben Nummer und zum selben Patienten.
  const fruehere = (await queryLatest(clientId, anruf.beginnMs - FENSTER_MS, 800))
    .filter((e) => istLisaAnruf(e) && e.status === ITEM_STATUS.OPEN && (e.ts || 0) <= anruf.beginnMs && gleicheSache(e.anruf, anruf));
  const versuche = 1 + fruehere.reduce((m, e) => Math.max(m, Number(e.anruf?.versuche) || 1), 0);
  const eintrag = eintragAus(clientId, anruf, { versuche });
  // Ein technisch gescheiterter Anruf ersetzt nichts: der fruehere Eintrag bleibt offen.
  const ersetzt = ausgangVon(anruf) === "gescheitert" ? [] : fruehere.map((e) => e.id);
  const antwort = { ok: true, id: anruf.kennung, neu: true, offen: eintrag.status === ITEM_STATUS.OPEN, satz: eintrag.summary, versuche, ersetzt };
  if (roh.trocken === true) return { ...antwort, trocken: true };

  try {
    await ref.create({ ...eintrag, createdAt: FieldValue.serverTimestamp() });
  } catch (err) {
    if (err?.code !== 6 /* ALREADY_EXISTS */) throw err;
    return { ...antwort, neu: false, ersetzt: [] };
  }
  for (const id of ersetzt) await resolveItem(clientId, id, { actor: "Lisa", note: ERSETZT_NOTIZ });
  return antwort;
}
