import { clientRef, masCollection } from "../tenant.js";
import { log } from "../log.js";

// ============================================================================
// Lisas Identitaet: Unter WELCHER Praxis und WELCHEM Behandler ruft sie an,
// und welcher Name steht als Absender auf ihrer SMS?
//
// Vorfall/Anforderung (Chef 18.08.2026, im Blick auf die Erlebnis-Demo):
// "lisa muss sich von der richtigen praxis unter dem richtigen doktor melden,
// die sms brauchen den praxisnamen als absender."
//
// So war es vorher, und beides war falsch:
//   1. ANSAGE: Lisas Agenten-Prompt bei ElevenLabs trug die Praxis FEST im
//      Text ("Du bist Lisa, Telefonassistentin von Dr. Petsas", plus zwei
//      Beispielsaetze "hier ist Lisa aus der Praxis Dr. Petsas"). Ruft Lisa
//      fuer eine andere Praxis an — eine Demo-Praxis, ein zweiter Mandant —,
//      nennt sie also den falschen Namen. Der `doctor`-Wert kam ausserdem aus
//      dem gerade angemeldeten BEDIENER (getOperator), nicht aus dem Kalender:
//      wer Clara bedient, ist nicht zwingend der behandelnde Arzt.
//   2. ABSENDER: Jede Lisa-SMS ging unter EINER globalen Umgebungsvariablen
//      (LISA_SMS_SENDER) raus. Der Praxisname stand nur im Text. Auf dem Handy
//      des Patienten stand damit ein fremder Absender.
//
// Dieses Modul ist die EINE Quelle fuer beides. Es liest nur, es schreibt
// nichts — auch nicht in die Plattform-Sammlung clientLocations.
// ============================================================================

const CACHE_MS = 10 * 60000;
const cache = new Map();

/** Fuellwoerter, die einen Praxisnamen nicht unterscheidbar machen. */
const FUELLWORT = new Set([
  "dr", "drs", "prof", "med", "dent", "dipl", "mag", "zahnarzt", "zahnarztpraxis",
  "zahnaerzte", "zahnaerztin", "zahnaerztinnen", "praxis", "praxen", "gemeinschaftspraxis",
  "praxisgemeinschaft", "mvz", "klinik", "zentrum", "team", "kollegen", "kollege",
  "partner", "gbr", "gmbh", "und", "die", "der", "das", "fuer", "am", "an", "im", "in",
]);

/** Woerter, die alleine kein Absender sein duerfen (zu allgemein). */
const KEIN_ABSENDER = new Set([
  "praxis", "zahnarztpraxis", "zahnaerzte", "zahnaerztin", "praxen", "klinik",
  "zentrum", "gemeinschaftspraxis", "praxisgemeinschaft", "mvz",
]);

/**
 * Deutsche Umlaute in ASCII umschreiben. Ein SMS-Absender ist alphanumerisch;
 * "Müller" darf dort NICHT zu "Mller" verstuemmelt werden, sondern zu "Mueller".
 */
export function umschrift(text) {
  return String(text == null ? "" : text)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/é|è|ê/g, "e").replace(/á|à|â/g, "a").replace(/ó|ò|ô/g, "o")
    .replace(/ç/g, "c").replace(/ñ/g, "n");
}

/**
 * Einen VORGEGEBENEN Absendernamen nur saeubern, nicht umdeuten.
 *
 * Wichtig, weil `smsAbsenderAus` ein tragfaehiges Wort SUCHT: der live
 * eingestellte Absender "med dent" besteht ausschliesslich aus Fuellwoertern und
 * wuerde dort zu "dent" verstuemmelt. Was eine Praxis selbst eingetragen hat,
 * bleibt stehen — es wird nur auf das gebracht, was der SMS-Standard zulaesst
 * (Umschrift, alphanumerisch plus Leerzeichen, hoechstens 11 Zeichen).
 *
 * @param {string} name
 * @returns {string} "" wenn nichts Brauchbares uebrig bleibt
 */
export function absenderSaeubern(name) {
  const kurz = umschrift(name)
    .replace(/[^0-9A-Za-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 11)
    .trim();
  return /[A-Za-z]/.test(kurz) ? kurz : "";
}

/**
 * SMS-Absendername aus einem Praxisnamen: das tragfaehigste Wort, alphanumerisch,
 * hoechstens 11 Zeichen (SMS-Standard fuer alphanumerische Absender).
 *
 * "Zahnarztpraxis Seeblick"       -> "Seeblick"
 * "Praxis Dr. Müller & Kollegen"  -> "Mueller"
 * "Praxis Dr. Petsas"             -> "Petsas"
 *
 * Genommen wird das LETZTE unterscheidbare Wort — im Deutschen steht dort der
 * Eigenname ("Zahnarztpraxis Seeblick"), waehrend vorne Titel und Gattung
 * stehen. Bleibt nichts uebrig, gibt die Funktion "" zurueck; dann entscheidet
 * der Aufrufer (Rueckfall auf die Umgebungsvariable) — geraten wird nicht.
 *
 * @param {string} praxisName
 * @returns {string} 1 bis 11 Zeichen [A-Za-z0-9] oder ""
 */
export function smsAbsenderAus(praxisName) {
  const sauber = umschrift(praxisName)
    .replace(/[^0-9A-Za-z\s-]/g, " ")
    .trim();
  if (!sauber) return "";

  const woerter = sauber.split(/[\s-]+/).filter(Boolean);
  const tragend = woerter.filter((w) => !FUELLWORT.has(w.toLowerCase()) && w.length > 1);

  let wahl = "";
  for (let i = tragend.length - 1; i >= 0; i -= 1) {
    if (!KEIN_ABSENDER.has(tragend[i].toLowerCase())) { wahl = tragend[i]; break; }
  }
  // Nur Fuellwoerter (z. B. "Zahnarztpraxis"): dann eben das laengste Wort,
  // damit ueberhaupt ein Praxisbezug auf dem Handy steht.
  if (!wahl) {
    wahl = woerter.slice().sort((a, b) => b.length - a.length)[0] || "";
  }
  const kurz = wahl.replace(/[^0-9A-Za-z]/g, "").slice(0, 11);
  // Mindestens ein Buchstabe: eine reine Ziffernfolge wuerde als Rufnummer
  // gelesen und von Twilio abgelehnt.
  return /[A-Za-z]/.test(kurz) ? kurz : "";
}

/**
 * Regieanweisung fuer Lisas Anruf-Auftrag: Unter dieser Praxis meldet sie sich.
 *
 * Bewusst als Anweisung IM AUFTRAG (task_prompt) und nicht nur als
 * Agenten-Variable: der Auftrag ist die einzige Stelle, die pro Anruf sicher
 * ankommt, und er wirkt auch dann, wenn im Agenten-Prompt noch ein
 * Beispielsatz mit einer anderen Praxis steht.
 *
 * @param {{praxisName?:string, behandler?:string}} ident
 * @returns {string} leer, wenn kein Praxisname bekannt ist (nichts erfinden)
 */
export function identitaetsRahmen(ident) {
  const praxis = String(ident?.praxisName || "").trim();
  if (!praxis) return "";
  const arzt = String(ident?.behandler || "").trim();
  const arztTeil = arzt
    ? `Behandelnde Person ist ${arzt} — nenne diesen Namen, wenn es um den Termin geht.`
    : "Einen Behandlernamen hast du NICHT — sprich nur von der Praxis, erfinde keinen Arztnamen.";
  return `

[Identitaet fuer dieses Gespraech, Regieanweisung — NICHT vorlesen: Du rufst im `
    + `Auftrag der Praxis "${praxis}" an. Stelle dich mit GENAU dieser Praxis vor `
    + `("hier ist Lisa aus der ${praxis}"). ${arztTeil} Nenne NIE eine andere `
    + `Praxis und keinen anderen Arzt, auch wenn im Prompt ein Beispiel mit einem `
    + `anderen Namen steht — dieser Auftrag gilt.]`;
}

function text(v) {
  return (v == null ? "" : String(v)).trim();
}

// Der Mandant, dem die globale Umgebungsvariable gehoert. LISA_SMS_SENDER ist
// aus der Zeit, in der MAS nur EINE Praxis bediente — der Wert dort ist also
// die bewusste Wahl DIESER Praxis, kein allgemeiner Standard.
const HAUPT_MANDANT = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

/**
 * Welcher Name steht als Absender auf der SMS?
 *
 * Reihenfolge, und zwar in dieser Haerte (Befund an echten Daten 18.08.2026):
 *  1. Was die Praxis EINGESTELLT hat. Die Live-Praxis heisst "med dent
 *     Zahnklinik", ihr Absender ist aber "med dent" — eine Ableitung haette
 *     daraus ungefragt "Zahnklinik" gemacht und den Absender aller laufenden
 *     Patienten-SMS geaendert. Eine Einstellung schlaegt immer eine Ableitung.
 *  2. Die globale Umgebungsvariable — aber NUR fuer den Haupt-Mandanten, dem
 *     sie gehoert. Eine zweite Praxis (oder eine Demo-Praxis) darf den Absender
 *     der ersten NICHT erben; genau das war der Fehler, den der Chef gemeldet
 *     hat ("die sms brauchen den praxisnamen als absender").
 *  3. Aus dem Praxisnamen abgeleitet — der Normalfall fuer jede weitere Praxis.
 *  4. Zur Not die Umgebungsvariable, damit eine SMS nie ohne Absender losgeht.
 */
function absenderWaehlen({ clientId, eingestellt, praxisName }) {
  const global = text(process.env.LISA_SMS_SENDER);
  const gesetzt = absenderSaeubern(eingestellt);
  if (gesetzt) return gesetzt;
  if (clientId === HAUPT_MANDANT && global) return global;
  return smsAbsenderAus(praxisName) || global;
}

/**
 * Den in der Praxis eingestellten SMS-Absendernamen lesen.
 *
 * Quelle ist die Plattform-Einstellung, die die Praxis selbst setzt (Onboarder
 * Deep-Dive bzw. Einstellungen -> Benachrichtigungen):
 * clients/{clientId}/clientLocations/{id}.notificationsSettings.customSenderName
 *
 * NUR LESEN. MAS schreibt nie in Plattform-Sammlungen (siehe tenant.js) — der
 * Sinn dieser Abfrage ist gerade, dass es keine zweite Einstellung gibt, die
 * jemand pflegen muesste.
 */
async function ladeEingestelltenAbsender(clientId) {
  try {
    const snap = await clientRef(clientId).collection("clientLocations").limit(5).get();
    for (const doc of snap.docs) {
      const n = doc.data()?.notificationsSettings || {};
      if (n.useCustomSenderName && text(n.customSenderName)) return text(n.customSenderName);
    }
  } catch (e) {
    log.warn("lisa.identitaet.location_read_failed", { clientId, error: String(e?.message || e) });
  }
  return "";
}

/**
 * Lisas Identitaet fuer einen Mandanten.
 *
 * @param {string} clientId
 * @param {{calendarName?:string}} [ctx] Kalendername aus dem Anlass (Recall):
 *        der ist der zuverlaessigste Behandlerbezug, weil der Termin daran haengt.
 * @returns {Promise<{praxisName:string, behandler:string, absender:string, telefon:string}>}
 */
export async function ladeLisaIdentitaet(clientId, ctx = {}) {
  const wunschKalender = text(ctx.calendarName);
  const hit = cache.get(clientId);
  const basis = hit && Date.now() - hit.at < CACHE_MS
    ? hit.wert
    : await ladeBasis(clientId);

  // Der Behandler aus dem Anlass gewinnt immer: bei einem Recall haengt der
  // Termin an genau diesem Kalender.
  return { ...basis, behandler: wunschKalender || basis.behandler };
}

async function ladeBasis(clientId) {
  let praxisName = "";
  let telefon = "";
  let behandler = "";
  let eingestellt = "";

  try {
    const snap = await clientRef(clientId).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    praxisName = text(d.name);
    telefon = text(d.phoneNumber);
  } catch (e) {
    log.warn("lisa.identitaet.client_read_failed", { clientId, error: String(e?.message || e) });
  }

  try {
    const b = (await masCollection(clientId, "mas_config").doc("booking").get()).data() || {};
    // Ausdrueckliche Angaben in der MAS-Konfiguration gewinnen: so kann eine
    // Praxis den gesprochenen Namen abweichend vom Stammdatensatz setzen.
    praxisName = text(b.practiceName) || praxisName;
    telefon = text(b.practicePhone) || telefon;
    eingestellt = text(b.smsSenderName);
    behandler = text(b.practiceDoctor) || text(b.doctorName);
    if (!behandler) {
      const kal = Array.isArray(b.calendars) ? b.calendars.filter((c) => text(c?.name)) : [];
      // Nur bei EINEM Kalender ist der Behandler eindeutig. Bei mehreren wuerde
      // jede Wahl geraten sein — dann sagt Lisa lieber nur die Praxis.
      if (kal.length === 1) behandler = text(kal[0].name);
    }
  } catch (e) {
    // Keine Buchungs-Konfiguration ist kein Fehler (junger Mandant).
    if (!/no mas_config\/booking/.test(String(e?.message || e))) {
      log.warn("lisa.identitaet.booking_read_failed", { clientId, error: String(e?.message || e) });
    }
  }

  if (!eingestellt) eingestellt = await ladeEingestelltenAbsender(clientId);

  const wert = {
    praxisName,
    behandler,
    absender: absenderWaehlen({ clientId, eingestellt, praxisName }),
    telefon,
  };
  cache.set(clientId, { at: Date.now(), wert });
  return wert;
}

/** Nur fuer Tests/Neuladen nach einer Aenderung. */
export function identitaetCacheLeeren(clientId) {
  if (clientId) cache.delete(clientId);
  else cache.clear();
}
