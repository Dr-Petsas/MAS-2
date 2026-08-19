import crypto from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { log } from "../log.js";
import { crawlHintergrund } from "./webcrawl.js";
import { wegwerfKontoAnlegen, PETSAS_ID } from "./wegwerfKonto.js";

// ============================================================================
// Das Tor zur Erlebnis-Demo (Chef 18.08.2026).
//
// Vorgabe: "beim interaktiven weg name vorname website handynummer — auf die
// handy nummer kommt ein freischaltcode am besten, nicht frei zugaenglich
// machen. email adresse vom interessenten brauchen wir auch und fuer pickadoc
// mitarbeiter eine email an die info mit den daten."
//
// WARUM SO STRENG: Hinter diesem Tor loesen fremde Menschen ECHTE SMS und
// ECHTE Telefonanrufe aus. Das ist Geld und, schlimmer, ein Werkzeug zum
// Belaestigen Dritter. Drei Riegel, die zusammen wirken:
//
//   1. Die bestaetigte Nummer ist die EINZIGE Zieladresse. Sie steht im Tor-
//      Ticket, nicht im Aufruf. Wer die Demo bedient, kann also nur sich selbst
//      anrufen und anschreiben lassen — niemals einen Dritten.
//   2. Kontingent pro Nummer (2 SMS, 2 Anrufe) UND eine Tagesobergrenze fuer
//      alle Demos zusammen. Die Kosten sind damit nach oben gedeckelt.
//   3. Drosselung pro Nummer und pro IP schon beim Code, plus begrenzte
//      Code-Versuche. Ein Bot kann keine SMS-Lawine ausloesen.
//
// Die Lead-Daten liegen im eigenen Mandanten von Pickadoc (mas_demo_leads).
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const COL = "mas_demo_leads";

/** Pickadocs eigener Mandant — die Demo-Leads gehoeren uns, keiner Praxis. */
export const DEMO_MANDANT = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

const CODE_GUELTIG_MS = 10 * 60000;
const TICKET_GUELTIG_MS = 24 * 3600000;
const PETSAS_TICKET_MS = 90 * 24 * 3600000;
const CODE_VERSUCHE_MAX = 5;

/** Kontingente. Bewusst klein: die Demo soll ueberzeugen, nicht telefonieren. */
export const KONTINGENT = {
  smsProNummer: Number(process.env.DEMO_SMS_PRO_NUMMER ?? 2),
  anrufeProNummer: Number(process.env.DEMO_ANRUFE_PRO_NUMMER ?? 2),
  codesProNummerAmTag: Number(process.env.DEMO_CODES_PRO_NUMMER ?? 3),
  smsAmTagGesamt: Number(process.env.DEMO_SMS_AM_TAG ?? 60),
  anrufeAmTagGesamt: Number(process.env.DEMO_ANRUFE_AM_TAG ?? 30),
};

function leads() {
  return masCollection(DEMO_MANDANT, COL);
}

function text(v) {
  return (v == null ? "" : String(v)).trim();
}

/**
 * Handynummer pruefen und auf E.164 bringen — NUR Mobilfunk aus DE/AT/CH.
 *
 * Festnetz wird abgelehnt: eine SMS an ein Festnetz kommt nie an, und der
 * Besucher haelt danach die Demo fuer kaputt. Auslandsnummern bleiben aussen
 * vor, weil dort andere Absender-Regeln und andere Preise gelten.
 *
 * @param {string} rein
 * @returns {string} "+4915112345678" oder ""
 */
export function handyE164(rein) {
  let s = text(rein).replace(/[\s/().-]/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  // Ohne Landesvorwahl nehmen wir Deutschland an (der Normalfall).
  if (s.startsWith("0")) s = `+49${s.slice(1)}`;
  if (!s.startsWith("+")) s = `+49${s}`;
  if (!/^\+\d{8,15}$/.test(s)) return "";
  // Mobilfunk-Bereiche: DE 15x/16x/17x, AT 6xx, CH 7[5-9].
  if (/^\+49(15|16|17)\d{7,10}$/.test(s)) return s;
  if (/^\+436\d{7,11}$/.test(s)) return s;
  if (/^\+417[5-9]\d{7}$/.test(s)) return s;
  return "";
}

/** Sehr einfache Plausibilitaet — echte Pruefung ist die Antwort des Empfaengers. */
export function istEmail(rein) {
  const s = text(rein);
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(s) && s.length <= 120;
}

/**
 * Behandlername, wie Patienten ihn am Telefon hoeren sollen.
 *
 * Der Besucher muss das nicht tippen: aus "Michael Petsas" wird "Dr. Petsas".
 * Steht schon ein Titel drin, bleibt der Name unangetastet — und wer im Tor
 * etwas anderes eintraegt, gewinnt immer.
 */
export function behandlerVorschlag({ vorname, name, behandler } = {}) {
  const eigen = text(behandler);
  if (eigen) return eigen;
  const nach = text(name);
  if (!nach) return "";
  if (/\b(dr|prof|dipl|med|dent)\b/i.test(nach)) return nach;
  return `Dr. ${nach.split(/\s+/).pop()}`;
}

function code6() {
  // 6 Ziffern, gleichverteilt (kein Modulo-Bias), nie mit 0 beginnend, damit
  // beim Vorlesen und Abtippen keine fuehrende Null verloren geht.
  return String(100000 + crypto.randomInt(900000));
}

function heuteBerlin() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Tageszaehler fuer alle Demos zusammen (Kostendeckel). */
async function tagesZaehler() {
  const ref = masCollection(DEMO_MANDANT, "mas_demo_zaehler").doc(heuteBerlin());
  const snap = await ref.get();
  return { ref, wert: snap.exists ? (snap.data() || {}) : {} };
}

async function tagesZaehlerHoch(feld) {
  const { ref } = await tagesZaehler();
  await ref.set({ [feld]: FieldValue.increment(1), tag: heuteBerlin() }, { merge: true });
}

async function tagesGrenzeErreicht(feld, grenze) {
  const { wert } = await tagesZaehler();
  return Number(wert[feld] || 0) >= grenze;
}

// --- Drosselung pro IP (nur Arbeitsspeicher, reicht: ein Prozess) -----------
const ipZaehler = new Map();
function ipDrossel(ip, maxProStunde = 5) {
  const jetzt = Date.now();
  const rec = ipZaehler.get(ip);
  if (!rec || jetzt > rec.bis) {
    ipZaehler.set(ip, { anzahl: 1, bis: jetzt + 3600000 });
    return true;
  }
  rec.anzahl += 1;
  return rec.anzahl <= maxProStunde;
}

/** SMS-Absender: wie auf dem Handy, hoechstens 11 Zeichen, Buchstaben noetig. */
export function absenderHaltbar(rein) {
  const kurz = text(rein)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^0-9A-Za-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 11)
    .trim();
  return kurz.length >= 2 && /[A-Za-z]/.test(kurz) ? kurz : "";
}

/** Praxiswebseite: mit oder ohne https, Domain mit Punkt. */
export function websiteHaltbar(rein) {
  let s = text(rein);
  if (!s || s.length > 200) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname)) return "";
    return u.href;
  } catch {
    return "";
  }
}

/**
 * Schritt 1: Konto aufnehmen, Freischalt-Token per E-Mail schicken.
 *
 * Chef 18.08.2026: Name, Vorname, Website, Handy, E-Mail. Kein Benutzername,
 * kein Passwort. Der Token kommt per Mail. Die Handynummer bleibt gespeichert,
 * weil Lisa spaeter genau dort anruft. Pflicht ist die Bestaetigung, dass der
 * Besucher einem medizinischen Beruf angehoert und nur fiktive Patientendaten
 * verwendet.
 *
 * @param {{vorname?:string, name?:string, praxis?:string, behandler?:string,
 *          website?:string, absender?:string, email?:string, handy?:string,
 *          beruf?:boolean, ip?:string}} rein
 * @param {(auftrag:{an:string, betreff:string, text:string}) => Promise<{ok:boolean}>} mailVersand
 */
export async function codeSenden(rein, versandFn) {
  const handy = handyE164(rein?.handy);
  const rohName = text(rein?.name);
  const teile = rohName.split(/\s+/).filter(Boolean);
  const vorname = text(rein?.vorname) || (teile.length >= 2 ? teile[0] : rohName);
  const name = teile.length >= 2 ? teile.slice(1).join(" ") : rohName;
  const praxis = text(rein?.praxis) || (name ? `Praxis ${name}` : "");
  const email = text(rein?.email);
  const website = websiteHaltbar(rein?.website);
  const absender = absenderHaltbar(rein?.absender) || absenderHaltbar(praxis) || absenderHaltbar(name);
  const beruf = rein?.beruf === true || rein?.beruf === "true" || rein?.beruf === "on";

  if (!rohName) return { ok: false, fehler: "name_fehlt", klartext: "Bitte Ihren Namen eintragen." };
  if (!website) return { ok: false, fehler: "website_fehlt", klartext: "Bitte die Praxiswebseite eintragen." };
  if (!emailOk(email)) return { ok: false, fehler: "email_fehlt", klartext: "Bitte eine gültige E-Mail-Adresse eintragen — dorthin kommt der Link für den Praxis-PC." };
  if (!handy) return { ok: false, fehler: "handy_ungueltig", klartext: "Diese Handynummer sieht nicht nach einem Mobilanschluss in Deutschland, Österreich oder der Schweiz aus." };
  if (!beruf) return { ok: false, fehler: "beruf_fehlt", klartext: "Bitte bestätigen, dass Sie einem medizinischen Beruf angehören und nur fiktive Patientendaten verwenden." };

  if (rein?.ip && !ipDrossel(rein.ip)) {
    return { ok: false, fehler: "zu_viele_versuche", klartext: "Von diesem Anschluss kamen gerade viele Anfragen. Bitte in einer Stunde noch einmal." };
  }
  if (await tagesGrenzeErreicht("codes", 100)) {
    return { ok: false, fehler: "tagesgrenze", klartext: "Die Demo hat heute ihr Kontingent erreicht. Bitte melde dich direkt bei uns — wir zeigen es dir persönlich." };
  }

  // Dieselbe Nummer oder dieselbe Mail soll denselben Lead weiterfuehren.
  const vorhanden = await leads().where("handy", "==", handy).limit(1).get();
  const ref = vorhanden.empty ? leads().doc() : vorhanden.docs[0].ref;
  const alt = vorhanden.empty ? {} : (vorhanden.docs[0].data() || {});

  const heute = heuteBerlin();
  const codesHeute = alt.codeTag === heute ? Number(alt.codeAnzahl || 0) : 0;
  if (codesHeute >= KONTINGENT.codesProNummerAmTag) {
    return { ok: false, fehler: "zu_viele_codes", klartext: "An diese Nummer sind heute schon mehrere Codes gegangen. Bitte morgen wieder — oder schreib uns." };
  }

  const code = code6();
  const behandler = behandlerVorschlag({ vorname, name, behandler: rein?.behandler });

  const versand = await versandFn({
    an: handy,
    betreff: "Ihr Freischaltcode für die Pickadoc-Demo",
    text:
      `Ihr Pickadoc-Code: ${code}. Gilt zehn Minuten.`,
  });
  if (!versand?.ok) {
    log.warn("demo.code.sms_fehlgeschlagen", { handy, fehler: versand?.error || "" });
    return { ok: false, fehler: "sms_fehlgeschlagen", klartext: "Die SMS ließ sich nicht senden. Bitte die Nummer prüfen oder später noch einmal." };
  }

  await ref.set({
    id: ref.id,
    vorname,
    name,
    praxis,
    behandler,
    website,
    absender,
    email,
    handy,
    berufBestaetigt: true,
    nurFiktiv: true,
    status: "code_gesendet",
    code,
    codeBis: Date.now() + CODE_GUELTIG_MS,
    codeVersuche: 0,
    codeTag: heute,
    codeAnzahl: codesHeute + 1,
    smsGenutzt: Number(alt.smsGenutzt || 0),
    anrufeGenutzt: Number(alt.anrufeGenutzt || 0),
    erstelltAm: alt.erstelltAm || FieldValue.serverTimestamp(),
    ts: Date.now(),
  }, { merge: true });
  await tagesZaehlerHoch("codes");

  log.info("demo.code.gesendet", { leadId: ref.id, email, handy, praxis });
  return { ok: true, leadId: ref.id };
}

/**
 * Schritt 2: Code pruefen und das Tor-Ticket ausgeben.
 *
 * @returns {Promise<{ok:boolean, ticket?:string, lead?:object, fehler?:string, klartext?:string}>}
 */
export async function freischalten({ leadId, code } = {}) {
  const id = text(leadId);
  const eingabe = text(code).replace(/\D/g, "");
  if (!id || !eingabe) return { ok: false, fehler: "unvollstaendig", klartext: "Bitte den Code aus der SMS eintragen." };

  const ref = leads().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, fehler: "unbekannt", klartext: "Diese Anfrage kennen wir nicht mehr. Bitte noch einmal starten." };
  const d = snap.data() || {};

  if (Number(d.codeVersuche || 0) >= CODE_VERSUCHE_MAX) {
    return { ok: false, fehler: "zu_viele_versuche", klartext: "Zu viele Fehlversuche. Bitte lass dir einen neuen Code schicken." };
  }
  if (!d.codeBis || Date.now() > Number(d.codeBis)) {
    return { ok: false, fehler: "abgelaufen", klartext: "Der Code ist abgelaufen. Bitte einen neuen anfordern." };
  }
  if (text(d.code) !== eingabe) {
    await ref.set({ codeVersuche: FieldValue.increment(1) }, { merge: true });
    return { ok: false, fehler: "falsch", klartext: "Dieser Code stimmt nicht." };
  }

  const ticket = crypto.randomBytes(24).toString("hex");
  await ref.set({
    status: "freigeschaltet",
    ticket,
    ticketBis: Date.now() + TICKET_GUELTIG_MS,
    freigeschaltetAm: FieldValue.serverTimestamp(),
    // Der Code ist verbraucht: er darf nicht zweimal ein Ticket erzeugen.
    code: null,
    codeBis: null,
  }, { merge: true });

  log.info("demo.freigeschaltet", { leadId: id, praxis: d.praxis, handy: d.handy });

  // Komplettes Wegwerf-Konto, damit Clara wie in einer Praxis laeuft
  // (Chef 19.08.2026). Fehler hier duerfen das Ticket nicht zurueckhalten.
  let clientId = text(d.clientId);
  try {
    const konto = await wegwerfKontoAnlegen({ ...d, id });
    if (konto.ok && konto.clientId) {
      clientId = konto.clientId;
      await ref.set({ clientId }, { merge: true });
    }
  } catch (e) {
    log.warn("demo.wegwerf.fehler", { leadId: id, error: String(e?.message || e) });
  }

  // Hintergrund-Crawl der Praxis-Webseite anstossen (fire-and-forget): fuellt
  // spaeter den Onboarder vor, falls der Besucher auf "14 Tage testen" klickt.
  // Bewusst OHNE await — darf die Freischaltung nie bremsen. Nur einmal je
  // Lead und nur, wenn eine Website hinterlegt ist.
  if (text(d.website) && text(d.crawlStatus) !== "ok") {
    crawlHintergrund(ref, d.website).catch(() => {});
  }

  return { ok: true, ticket, lead: { ...d, id, clientId } };
}

/**
 * Entwickler-Zugang fuer Dr. Petsas: festes Wegwerf-Konto, langes Ticket,
 * keine SMS und kein Formular (Chef 19.08.2026).
 */
export async function petsasDevOeffnen() {
  const konto = await wegwerfKontoAnlegen({
    id: "petsas",
    praxis: "Praxis Dr. Petsas",
    name: "Petsas",
    vorname: "Michael",
    website: "https://pickadoc.de",
  }, {
    dauerhaft: true,
    note: "Entwickler-Konto Petsas — nicht mit den Wegwerf-Konten der Interessenten loeschen.",
  });
  if (!konto.ok) return konto;

  const ref = leads().doc("dev-petsas");
  const snap = await ref.get();
  const alt = snap.exists ? (snap.data() || {}) : {};
  let ticket = text(alt.ticket);
  let ticketBis = Number(alt.ticketBis || 0);
  if (ticket.length !== 48 || !ticketBis || Date.now() > ticketBis) {
    ticket = crypto.randomBytes(24).toString("hex");
    ticketBis = Date.now() + PETSAS_TICKET_MS;
  }

  const lead = {
    vorname: "Michael",
    name: "Petsas",
    praxis: "Praxis Dr. Petsas",
    website: "https://pickadoc.de",
    email: "development@pickadoc.de",
    behandler: "Dr. Petsas",
    absender: "DrPetsas",
    status: "freigeschaltet",
    ticket,
    ticketBis,
    clientId: PETSAS_ID,
    devKonto: true,
  };
  await ref.set({
    ...lead,
    freigeschaltetAm: alt.freigeschaltetAm || FieldValue.serverTimestamp(),
    ts: Date.now(),
  }, { merge: true });

  log.info("demo.dev.petsas", { clientId: PETSAS_ID });
  return { ok: true, ticket, lead: { ...lead, id: "dev-petsas", clientId: PETSAS_ID } };
}

/**
 * Ticket einloesen: gibt den Lead zurueck, wenn das Ticket gilt.
 *
 * Hier steckt der wichtigste Riegel: die Zieladresse fuer SMS und Anruf kommt
 * AUS DEM LEAD, nie aus dem Aufruf. Damit kann niemand die Demo benutzen, um
 * fremde Menschen anzurufen.
 */
export async function ticketPruefen(ticket) {
  const t = text(ticket);
  if (t.length !== 48) return null;
  const snap = await leads().where("ticket", "==", t).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0].data() || {};
  if (!d.ticketBis || Date.now() > Number(d.ticketBis)) return null;
  return { ...d, id: snap.docs[0].id, ref: snap.docs[0].ref };
}

/**
 * Kontingent prüfen und verbrauchen.
 *
 * @param {object} lead aus ticketPruefen
 * @param {"sms"|"anruf"} art
 */
export async function kontingentNehmen(lead, art) {
  const feld = art === "anruf" ? "anrufeGenutzt" : "smsGenutzt";
  const grenze = art === "anruf" ? KONTINGENT.anrufeProNummer : KONTINGENT.smsProNummer;
  const genutzt = Number(lead[feld] || 0);
  if (genutzt >= grenze) {
    return {
      ok: false,
      fehler: "kontingent",
      klartext: art === "anruf"
        ? `In der Demo sind ${grenze} Anrufe enthalten — die sind aufgebraucht. Im Probeabo telefoniert Lisa ohne Limit.`
        : `In der Demo sind ${grenze} SMS enthalten — die sind aufgebraucht. Im Probeabo verschickt Clara so viele, wie deine Praxis braucht.`,
    };
  }
  const tagesFeld = art === "anruf" ? "anrufe" : "sms";
  const tagesGrenze = art === "anruf" ? KONTINGENT.anrufeAmTagGesamt : KONTINGENT.smsAmTagGesamt;
  if (await tagesGrenzeErreicht(tagesFeld, tagesGrenze)) {
    return { ok: false, fehler: "tagesgrenze", klartext: "Die Demo hat heute ihr Kontingent erreicht. Melde dich bei uns, dann zeigen wir es dir persönlich." };
  }

  await lead.ref.set({ [feld]: FieldValue.increment(1), ts: Date.now() }, { merge: true });
  await tagesZaehlerHoch(tagesFeld);
  return { ok: true, rest: grenze - genutzt - 1 };
}

/** Was der Besucher noch offen hat (fuer die Anzeige in der Demo). */
export function kontingentStand(lead) {
  return {
    sms: Math.max(0, KONTINGENT.smsProNummer - Number(lead?.smsGenutzt || 0)),
    anrufe: Math.max(0, KONTINGENT.anrufeProNummer - Number(lead?.anrufeGenutzt || 0)),
  };
}

// ============================================================================
// Uebergabe Handy -> Praxis-PC (Chef 19.08.2026).
//
// Problem: Film und Live-Demo laufen am Handy, die Einrichtung (Onboarder)
// aber nur am Praxis-PC. Wechselt der Zahnarzt das Geraet, ist das Ticket im
// localStorage des Handys — der PC weiss nichts. Der Zwischenstand ginge
// verloren.
//
// Loesung: den Stand am Lead sichern und einen Wiederaufnahme-Token ausgeben.
// Die Route mailt einen Link mit diesem Token (und der Homepage) an die
// E-Mail des Besuchers. Am PC geoeffnet, laeuft die Einrichtung nahtlos
// weiter. Der Token ist NICHT das Ticket: er loest keine SMS/Anrufe aus,
// er transportiert nur den Wiederaufnahme-Stand.
// ============================================================================

const UEBERGABE_GUELTIG_MS = 7 * 24 * 3600000; // eine Woche: der Link darf in Ruhe am PC geoeffnet werden

function emailOk(v) {
  const s = text(v);
  return s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/** Nur ein kleines, reines Objekt sichern — kein Firestore-Ref, keine Riesen-Blobs. */
function standSicher(stand) {
  try {
    if (!stand || typeof stand !== "object") return null;
    const roh = JSON.stringify(stand);
    if (roh.length > 4000) return { gekuerzt: true, ts: Date.now() };
    return JSON.parse(roh);
  } catch {
    return null;
  }
}

/**
 * Zwischenstand am Lead sichern und einen Wiederaufnahme-Token ausgeben.
 * Der E-Mail-Versand passiert in der Route (dort liegen die Mailkonten).
 *
 * @returns {Promise<{ok:boolean, token?:string, lead?:object, fehler?:string, klartext?:string}>}
 */
export async function uebergabeSpeichern({ ticket, email, stand } = {}) {
  const lead = await ticketPruefen(ticket);
  if (!lead) return { ok: false, fehler: "ticket", klartext: "Bitte die Demo neu freischalten." };
  const mail = text(email);
  if (!emailOk(mail)) {
    return { ok: false, fehler: "email", klartext: "Bitte eine gültige E-Mail-Adresse eintragen — dorthin kommt der Link für den Praxis-PC." };
  }

  const token = crypto.randomBytes(18).toString("hex"); // 36 Zeichen
  await lead.ref.set({
    email: mail,
    uebergabeToken: token,
    uebergabeBis: Date.now() + UEBERGABE_GUELTIG_MS,
    uebergabeStand: standSicher(stand),
    uebergabeAm: FieldValue.serverTimestamp(),
  }, { merge: true });

  log.info("demo.uebergabe.gespeichert", { leadId: lead.id, email: mail });
  return { ok: true, token, lead: { ...lead, email: mail } };
}

/**
 * Wiederaufnahme-Stand zu einem Token holen (fuer den Praxis-PC).
 * Gibt bewusst NUR die harmlosen Wiederaufnahme-Felder zurueck — nie Handy,
 * Ticket oder Kontingent.
 */
export async function uebergabeHolen(token) {
  const t = text(token);
  if (t.length !== 36) return null;
  const snap = await leads().where("uebergabeToken", "==", t).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0].data() || {};
  if (!d.uebergabeBis || Date.now() > Number(d.uebergabeBis)) return null;
  return {
    website: d.website || "",
    praxis: d.praxis || "",
    name: [d.vorname, d.name].filter(Boolean).join(" "),
    stand: d.uebergabeStand || null,
  };
}
