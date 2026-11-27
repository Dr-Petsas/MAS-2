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

// Anweisungen an Lisa, die MAS frueher hinten an den Auftrag haengte. Die alte
// Lisa schrieb den Auftrag samt Anweisung in ihren Bericht.
const REGIE_ANFAENGE = ["[regieanweisung", "[identitaet fuer dieses gespraech", "[identität für dieses gespräch"];

/** Text ohne angehaengte Regieanweisung: alles ab der ersten Anweisung entfaellt. */
export function ohneRegie(v) {
  const t = text(v);
  const klein = t.toLowerCase();
  let ab = -1;
  for (const anfang of REGIE_ANFAENGE) {
    const i = klein.indexOf(anfang);
    if (i >= 0 && (ab < 0 || i < ab)) ab = i;
  }
  return ab < 0 ? t : t.slice(0, ab).trim();
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
    auftrag: auftragAus(roh.auftrag),
    // Ein Anliegen neben dem Auftrag (Rezept, Rechnung), im Wortlaut der Person. Haelt den Eintrag offen.
    weiteres_anliegen: text(roh.weiteres_anliegen, 400),
  };
  return { ok: true, anruf };
}

/** Wert fuer `ausgang` nach aussen: bei nicht erreichter Person der Wert von `erreicht`. */
export function ausgangVon(anruf) {
  return anruf?.erreicht === "person" ? text(anruf.ausgang) : text(anruf?.erreicht);
}

/** Das Anliegen neben dem Auftrag, im Wortlaut der Person. Leer, wenn Lisa keines gemeldet hat. */
export function weiteresAnliegen(anruf) {
  return text(anruf?.weiteres_anliegen);
}

/** Offen fuer die Praxis: nach dem Ausgang, und immer, solange ein weiteres Anliegen wartet (auch bei `termin`). */
export function istOffen(anruf) {
  return !NICHT_OFFEN.has(ausgangVon(anruf)) || !!weiteresAnliegen(anruf);
}

/** Zusatz fuer den Text an Bianca (`context`): das weitere Anliegen als Tatsache. */
export function weiteresFuerKontext(anruf) {
  const w = weiteresAnliegen(anruf);
  return w ? `Dabei kam ein weiteres Anliegen zur Sprache, das die Praxis noch klären muss: „${w}“` : "";
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

// --- Auftrag der Praxis: was Bianca beim Rueckruf selbst aufgreift ----------
// Feldnamen wie Lisa V8 sie schickt (internal/lisa-anrufnotiz-schnittstelle.md).

const AUFTRAG_ARTEN = ["recall", "luecke", "nachricht"];
// Bei diesen Ausgaengen ist das Anliegen der Praxis noch offen und Bianca fuehrt es beim Rueckruf weiter.
const AUFGREIFEN = new Set(["abgebrochen", "niemand", "besetzt", "abgelehnt", "mailbox", "andere_person",
  "rueckruf_gewuenscht", "meldet_sich_selbst"]);

function datumText(datum) {
  const ms = text(datum) ? new Date(`${text(datum)}T12:00:00Z`).getTime() : NaN;
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
}

function kennungName(roh) {
  if (!roh || typeof roh !== "object") return text(roh) ? { id: "", name: text(roh, 120) } : null;
  const k = { id: text(roh.id, 120), name: text(roh.name, 120) };
  return k.id || k.name ? k : null;
}

/** Lisas `auftrag` in die gespeicherte Form bringen (rein). Ohne brauchbaren Inhalt: null. */
function auftragAus(roh) {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const lb = roh.letzter_besuch && typeof roh.letzter_besuch === "object" ? roh.letzter_besuch : {};
  const letzter = { datum: datumText(lb.datum) ? text(lb.datum, 10) : "", grund: text(lb.grund, 120) };
  const kg = roh.kontrollgrund && typeof roh.kontrollgrund === "object" ? roh.kontrollgrund.text : roh.kontrollgrund;
  const a = {
    art: AUFTRAG_ARTEN.includes(text(roh.art)) ? text(roh.art) : "",
    ziel: text(roh.ziel, 160),
    arzt: text(roh.arzt, 80),
    behandlungsart: kennungName(roh.behandlungsart),
    kalender: (Array.isArray(roh.kalender) ? roh.kalender : []).map(kennungName).filter(Boolean).slice(0, 5),
    letzter_besuch: letzter.datum || letzter.grund ? letzter : null,
    kontrollgrund: text(kg, 300),
    anlass_quelle: text(roh.anlass_quelle, 40),
    kampagne: text(roh.kampagne, 120),
    zusatz: text(roh.zusatz, 600),
    nachricht: text(roh.nachricht, 400),
    vorgegebene_zeiten: (Array.isArray(roh.vorgegebene_zeiten) ? roh.vorgegebene_zeiten : []).map(terminAus).filter(Boolean).slice(0, 5),
  };
  const leer = !a.art && !a.ziel && !a.arzt && !a.behandlungsart && !a.kalender.length && !a.letzter_besuch && !a.kontrollgrund
    && !a.kampagne && !a.zusatz && !a.nachricht && !a.vorgegebene_zeiten.length;
  return leer ? null : a;
}

function nurNachricht(au) {
  return au?.art === "nachricht";
}

/** Was die Praxis will, in einem Satzteil: Lisas `ziel`, dazu Behandlungsart und Arzt. */
function zielText(anruf) {
  const au = anruf?.auftrag;
  if (!au) return "";
  if (nurNachricht(au)) return au.ziel || "eine Nachricht der Praxis ausrichten";
  const ziel = au.ziel || "einen Termin vereinbaren";
  const was = au.behandlungsart?.name || "";
  const arzt = au.arzt || text(anruf.behandler);
  return `${ziel}${was ? ` (${was})` : ""}${arzt ? ` bei ${arzt}` : ""}`;
}

function hintergrundText(au) {
  const teile = [];
  if (au?.letzter_besuch) {
    const wann = datumText(au.letzter_besuch.datum);
    teile.push(`Letzter Besuch${wann ? ` am ${wann}` : ""}${au.letzter_besuch.grund ? ` (${au.letzter_besuch.grund})` : ""}.`);
  }
  if (au?.kontrollgrund) teile.push(`Grund für die Kontrolle: ${au.kontrollgrund}${au.kontrollgrund.endsWith(".") ? "" : "."}`);
  if (au?.zusatz) teile.push(`Zusatz der Praxis: ${au.zusatz}${au.zusatz.endsWith(".") ? "" : "."}`);
  return teile.join(" ");
}

function schonText(anruf) {
  const teile = [];
  const gesagt = text(anruf?.gesagt);
  if (gesagt) teile.push(`${gesagt.toLowerCase().startsWith("lisa") ? "" : "Lisa hat schon gesagt: "}${gesagt}${gesagt.endsWith(".") ? "" : "."}`);
  const angebot = (Array.isArray(anruf?.angebot) ? anruf.angebot : []).map(terminText).filter(Boolean);
  if (angebot.length) teile.push(`Lisa hat schon angeboten: ${angebot.join("; ")}.`);
  return teile.join(" ");
}

/** Greift Bianca das Anliegen der Praxis beim Rueckruf selbst auf? Nur mit `auftrag` und offenem Anliegen. */
export function wirdAufgegriffen(anruf) {
  return !!anruf?.auftrag && AUFGREIFEN.has(ausgangVon(anruf));
}

/** Der Auftrag an Bianca fuer den Rueckruf, wenn Lisa keinen eigenen Text geschickt hat. Wird nie vorgelesen. */
function auftragAnBianca(anruf) {
  const au = anruf.auftrag;
  const tun = nurNachricht(au)
    ? `Die Nachricht der Praxis jetzt selbst ausrichten${au.nachricht ? `: „${au.nachricht}“` : "."}`
    : `Den Termin jetzt selbst anbieten und buchen: ${zielText(anruf)}.`;
  return [tun, hintergrundText(au)].filter(Boolean).join(" ");
}

/** Zusatz fuer den Text an Bianca (`context`): was die Praxis will. Leer, wenn nichts aufzugreifen ist. */
export function anliegenFuerKontext(anruf) {
  if (!wirdAufgegriffen(anruf)) return "";
  const au = anruf.auftrag;
  const will = nurNachricht(au)
    ? `Die Praxis möchte eine Nachricht ausrichten${au.nachricht ? `: „${au.nachricht}“` : ""}. Richte sie jetzt selbst aus.`
    : `Die Praxis möchte: ${zielText(anruf)}. Greif das von dir aus auf und biete den Termin jetzt selbst an.`;
  return [will, hintergrundText(au), schonText(anruf)].filter(Boolean).join(" ");
}

/** `auftrag` fuer Bianca (`items`): Lisas Felder unveraendert, dazu `aufgreifen` und das Datum als Text. */
function auftragFuerItem(anruf) {
  const au = anruf?.auftrag;
  if (!au) return null;
  return { ...au, aufgreifen: wirdAufgegriffen(anruf),
    letzter_besuch: au.letzter_besuch ? { ...au.letzter_besuch, datum_text: datumText(au.letzter_besuch.datum) } : null };
}

/** Zeilen fuer die Clara-Seite: was die Praxis wollte. */
function auftragFuerSeite(anruf) {
  const au = anruf?.auftrag;
  if (!au) return null;
  return {
    ziel: zielText(anruf),
    hintergrund: hintergrundText(au),
    nachricht: nurNachricht(au) ? au.nachricht : "",
    kampagne: au.kampagne,
    aufgreifen: wirdAufgegriffen(anruf),
  };
}

/** Anweisung fuer den Rueckruf. Lisas eigener Text gilt; sonst baut MAS sie. Wird nie vorgelesen. */
export function beimRueckrufVon(anruf) {
  if (text(anruf?.beim_rueckruf)) return text(anruf.beim_rueckruf);
  // Mit Auftrag der Praxis und offenem Anliegen fuehrt Bianca das Anliegen weiter.
  if (wirdAufgegriffen(anruf)) return auftragAnBianca(anruf);
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
      patient: text(event.counterparty?.name || event.subject?.name), grund: ohneRegie(event.summary),
      ausgang: "", ausgang_text: "", versuche: 1, gesagt: "", angebot: [], beim_rueckruf: "", auftrag: null, weiteres_anliegen: "", nicht_vortragen: false,
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
    // Was die Praxis will; null, wenn Lisa keinen Auftrag mitgeschickt hat.
    auftrag: auftragFuerItem(a),
    // Anliegen neben dem Auftrag, im Wortlaut der Person; leer, wenn keines gemeldet ist.
    weiteres_anliegen: weiteresAnliegen(a),
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
    auftrag: auftragFuerSeite(a),
    weiteresAnliegen: weiteresAnliegen(a),
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
  // Ebenso bleibt ein frueherer Eintrag offen, in dem noch ein weiteres Anliegen wartet.
  const ersetzt = ausgangVon(anruf) === "gescheitert" ? [] : fruehere.filter((e) => !weiteresAnliegen(e.anruf)).map((e) => e.id);
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
