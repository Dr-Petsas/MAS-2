import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { getDayAppointments } from "./daySchedule.js";
import { readAppointmentSegments, combineActiveSegments } from "./treatmentDoc.js";
import { appendEvent } from "../brain/eventStore.js";
import { masCollection } from "../tenant.js";
import { log } from "../log.js";

// ============================================================================
// Clara Overwatch (05.07.2026): Besuchsgrund-Wächter fuer den Recall.
// ============================================================================
// Problem (Vorgabe Chef 05.07.2026): Ein Patient bucht "Besprechung Kons",
// tatsaechlich wird ein Implantat gesetzt und dokumentiert/abgerechnet. Der
// Termin behaelt aber den alten Besuchsgrund — und die Recall-Buckets der
// Plattform (recallBucketsService rechnet ueber visitMotive.id der
// confirmed-Termine) stecken den Patienten in den FALSCHEN Bucket.
//
// Loesung: Nach jedem Diktat (und nach vollstaendiger Sophie-Abrechnung)
// vergleicht Overwatch die DOKUMENTIERTE Behandlung mit dem gebuchten
// Besuchsgrund. Bei klarem Mismatch wird der Besuchsgrund des Termins
// korrigiert — auch rueckwirkend ("behandelt" / Vergangenheit), denn genau
// dort entsteht der Recall-Schaden. Die Plattform berechnet die Buckets
// naechtlich um 03:00 neu (scheduledRecomputeRecallBuckets) — die Korrektur
// greift damit automatisch beim naechsten Lauf.
//
// Entscheide (Chef 05.07.2026):
//   - EIN Termin, EIN dominanter Besuchsgrund. KEIN Termin-Splitting, keine
//     Doppel-Buckets. Sekundaer erkannte Behandlungen wandern als Metadaten
//     an den Termin (motiveOverwatch.detected) — Recall liest weiter NUR
//     visitMotive.
//   - Dominanz ueber die klinische RECALL-PRIORITAETSLEITER, NICHT ueber
//     Umsatz (Euro-Zahlen bleiben ohnehin draussen — Vorgabe 12.06.2026):
//       4  Implantation / Augmentation / Osteotomie / WSR
//       3  Extraktion / Endo / PAR / Krone-Bruecke
//       2  Fuellung / Stiftaufbau / PZR / Schiene
//       1  Kontrolle / Nahtentfernung
//       0  Besprechung / Beratung / Planerstellung
//   - Auto-Korrektur nur bei KLAREM Mismatch nach oben:
//       * dominant >= Stufe 3 und > gebuchter Stufe  -> korrigieren
//       * dominant == Stufe 2 und gebucht Besprechung -> korrigieren
//       * dominant == Stufe 2 und gebucht Kontrolle   -> NUR Hinweis
//         (der Kontroll-Recall ist der wichtigste wiederkehrende Bucket —
//          den zerstoert Overwatch nie automatisch)
//       * Downgrades (nur Besprechung erkannt, OP gebucht) -> nie.
//
// Erkennungs-Sicherheit (kein LLM, deterministisch + testbar):
//   - Satzweise Analyse. ZUKUNFTS-Saetze ("ist geplant", "beim naechsten
//     Termin", "KVA/HKP") liefern NIE einen Behandlungs-Treffer.
//   - Stufe-3/4-Muster brauchen ein TAT-Signal ("inseriert", "extrahiert",
//     "durchgefuehrt") ODER ein Fach-Indiz MIT klinischem Kontext (regio,
//     Naht, Anaesthesie ...). "Implantat besprochen" zaehlt NICHT.
//   - Sophie-Strecken-Label ("Implantatinsertion", status complete) ist die
//     zweite, unabhaengige Quelle (basis "abrechnung").
//
// Notaus: env MAS_MOTIVE_OVERWATCH=0 ODER mas_config/motive_overwatch
// { enabled: false }. Modus "vorschlag" (statt "auto") schreibt nur
// Metadaten + Hinweis, aendert nie den Besuchsgrund.
// ============================================================================

const TREATED = 2; // PatientStatus.treated (Plattform-Enum)

// --- Text-Normalisierung -----------------------------------------------------

/** Kleinschreibung + Umlaute -> ae/oe/ue, fuer robuste Muster. */
export function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

/** Text in Saetze/Zeilen zerlegen (Diktate sind oft telegraphisch). */
function saetze(text) {
  return normText(text)
    .split(/[.!?;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Zukunfts-/Plan-Marker: der Satz beschreibt etwas GEPLANTES, keine erfolgte
// Behandlung. Blockt JEDEN Behandlungs-Treffer im Satz (auch Tat-Verben:
// "Implantation wird beim naechsten Termin durchgefuehrt").
const ZUKUNFT = /\bgeplant\b|\bplanung\b|vorgesehen|empfohlen|angeraten|\bsoll(en)?\b|\bwird\s+(dann|noch|spaeter)\b|naechste[nrm]?\s+(termin|sitzung|woche)|folgetermin|kostenvoranschlag|\bkva\b|\bhkp\b|termin vereinbart|angeboten|in aussicht/;

// Besprechungs-/Planungs-Marker: blockt nur INDIZ-Treffer ("Implantat regio 36
// besprochen", "Besprechung Implantatplanung"), NICHT Tat-Treffer ("nach
// Aufklaerung Implantat inseriert" — Aufklaerung ist Pflicht-Bestandteil
// jeder OP-Doku, das Tat-Verb "inseriert" traegt die Aussage).
const BESPROCHEN = /besprochen|besprechung|beraten|beratung|planung|geplant|aufgeklaert|aufklaerung|erlaeutert|erklaert|informiert|vorgestellt|diskutiert/;

// Klinischer Kontext, der ein Fach-Indiz zur erfolgten Behandlung macht.
const KLINIK_KONTEXT = /\bregio\b|\bzahn\s?\d{2}\b|\b[1-4][1-8]\b|anaesthesie|betaeubung|infiltration|leitungsanaesthesie|\bnaht\b|genaeht|blutung|primaerstabil|drehmoment|osseo|schmerzfrei|lokalanaesthesie|kofferdam/;

// Abrechnungsziffern zaehlen nur, wenn der Satz erkennbar von Abrechnung
// spricht — sonst kollidieren vierstellige Ziffern mit Uhrzeiten & Co.
const CODE_KONTEXT = /goz|bema|ziffer|position|abrechn|berechn|analog|faktor/;

// --- Behandlungs-Katalog ------------------------------------------------------
// key/label bewusst deckungsgleich mit dokuPflicht.js-Regeln und den
// Sophie-Strecken (chains.json), damit alle drei Systeme dieselbe Sprache
// sprechen. tat = hinreichendes Tat-Signal; indiz = Fachbegriff, der nur MIT
// KLINIK_KONTEXT (und ohne BESPROCHEN) zaehlt; negativ = Satz-Ausschluss.
export const BEHANDLUNGS_MUSTER = [
  {
    key: "implantation", label: "Implantation", prio: 4,
    tat: /implantat[a-z]*\s*(inseriert|gesetzt|eingebracht)|implantiert|implantatinsertion|implantation (regio|durchgefuehrt|erfolgt)|insertion (des|eines) implantat/,
    indiz: /implantat/,
    codes: /\b90(10|20)\b/,
  },
  {
    key: "augmentation", label: "Augmentation / Knochenaufbau", prio: 4,
    tat: /augmentiert|augmentation (durchgefuehrt|erfolgt|regio)|knochenaufbau (durchgefuehrt|erfolgt|regio)|sinuslift|sinusbodenelevation/,
    indiz: /augmentation|knochenaufbau|knochenersatzmaterial|membran/,
    codes: /\b9(090|100|110|120)\b/,
  },
  {
    key: "osteotomie", label: "Operative Zahnentfernung (Osteotomie)", prio: 4,
    tat: /osteotomiert|osteotomie|operativ entfernt|operative (zahn)?entfernung|weisheitszahn[a-z]* (entfernt|osteotomiert)/,
    indiz: /verlagert|retiniert/,
    codes: /\b30(30|40|45)\b|\b4(7a|8)\b/,
  },
  {
    key: "wsr", label: "Wurzelspitzenresektion", prio: 4,
    tat: /wurzelspitzenresektion|\bwsr\b|wurzelspitze[a-z]* (reseziert|entfernt|gekappt)/,
  },
  {
    key: "extraktion", label: "Extraktion", prio: 3,
    tat: /extraktion|extrahiert|\bzahn (gezogen|entfernt)\b|zaehne (gezogen|entfernt)|(zahn|zaehne) [\d,\s(und)]+ ?(gezogen|entfernt)/,
    codes: /\b30(00|10|20)\b|\b4[345]\b/,
  },
  {
    key: "endo", label: "Wurzelkanalbehandlung", prio: 3,
    tat: /wurzelkanalbehandlung|wurzelkanaele? (aufbereitet|gefuellt|gespuelt)|wurzelfuellung|\bwkb\b|trepanation|trepaniert|vitalexstirpation|exstirpiert|medikamentoese einlage/,
    indiz: /wurzelkanal|\bendo\b/,
    codes: /\b2(360|390|400|410|430|440)\b|\b3[1245]\b/,
  },
  {
    key: "par", label: "Parodontitistherapie", prio: 3,
    tat: /kuerettage|root ?planing|deep ?scaling|parodontaltherapie|parodontitis(be)?handlung|par-?(therapie|behandlung|sitzung) (durchgefuehrt|erfolgt)|\bupt\b|geschlossenes vorgehen/,
    indiz: /parodont/,
  },
  {
    key: "krone", label: "Krone / Bruecke (Prothetik)", prio: 3,
    tat: /(krone|bruecke|teilkrone|veneer|inlay|onlay)[a-z]*\s*(praepariert|beschliffen|eingesetzt|eingegliedert|zementiert|adhaesiv befestigt)|praeparation (fuer|einer|der) (krone|bruecke)|stumpf praepariert|(krone|bruecke) (ab)?gestimmt und (eingesetzt|zementiert)/,
    indiz: /ueberkronung|kronenversorgung/,
  },
  {
    key: "stiftaufbau", label: "Stiftaufbau", prio: 2,
    tat: /stiftaufbau|glasfaserstift|wurzelstift (gesetzt|eingebracht|zementiert)/,
  },
  {
    key: "fuellung", label: "Fuellung", prio: 2,
    tat: /fuellung(en)? (gelegt|erneuert|ersetzt)|kompositfuellung|komposit gelegt|gefuellt|fuellungstherapie|aufbaufuellung/,
    indiz: /fuellung|komposit/,
    // "Wurzelkanaele gefuellt" ist Endo, "insuffiziente Fuellung" ein Befund.
    // wurzelkan deckt wurzelkanal UND wurzelkanaele (ae-Normalisierung) ab.
    negativ: /insuffizient|defekt|undicht|frakturiert|alte fuellung|wurzelkan|wurzelfuellung/,
    codes: /\b2(060|080|100|120)\b|\b13[a-d]\b/,
  },
  {
    key: "pzr", label: "Professionelle Zahnreinigung", prio: 2,
    tat: /\bpzr\b|professionelle zahnreinigung|zahnreinigung (durchgefuehrt|erfolgt)|zahnstein entfernt|belaege entfernt|biofilm[a-z]* entfernt/,
    indiz: /zahnreinigung|prophylaxesitzung/,
    codes: /\b1040\b|\b107\b/,
  },
  {
    key: "schiene", label: "Schienen-Eingliederung", prio: 2,
    tat: /schiene (eingegliedert|eingesetzt|angepasst|abgegeben)|aufbissschiene|knirscherschiene|\bukps\b/,
  },
  {
    key: "nahtentfernung", label: "Nahtentfernung / Wundkontrolle", prio: 1,
    tat: /nahtentfernung|faeden (gezogen|entfernt)|naehte entfernt|wundkontrolle/,
  },
  {
    key: "kontrolle", label: "Kontrolle", prio: 1,
    tat: /kontrolle|nachkontrolle|kontrolluntersuchung|befundkontrolle|recalltermin/,
  },
  {
    key: "besprechung", label: "Besprechung / Beratung / Planung", prio: 0,
    tat: /besprechung|besprochen|beratung|beraten|aufklaerungsgespraech|planerstellung|plan erstellt|therapieplanung|behandlungsplan|kostenplan|\bkva\b|\bhkp\b/,
  },
];

const MUSTER_BY_KEY = new Map(BEHANDLUNGS_MUSTER.map((m) => [m.key, m]));

// --- Erkennung ----------------------------------------------------------------

/**
 * Erkennt DURCHGEFUEHRTE Behandlungen im Doku-/Abrechnungstext.
 * Satzweise, mit Zukunfts- und Besprechungs-Wachen (siehe Kopfkommentar).
 * @returns {Array<{key:string,label:string,prio:number}>} nach prio absteigend
 */
export function erkenneBehandlungen(text) {
  const treffer = new Map();
  for (const satz of saetze(text)) {
    const istZukunft = ZUKUNFT.test(satz);
    const istBesprochen = BESPROCHEN.test(satz);
    for (const m of BEHANDLUNGS_MUSTER) {
      if (treffer.has(m.key)) continue;
      if (m.negativ && m.negativ.test(satz)) continue;
      // Besprechung selbst darf auch aus Plan-/Besprechungs-Saetzen kommen —
      // alle ECHTEN Behandlungen nicht.
      if (m.key !== "besprechung" && istZukunft) continue;
      const tat = m.tat && m.tat.test(satz);
      const code = m.codes && m.codes.test(satz) && CODE_KONTEXT.test(satz);
      const indiz = m.indiz && m.indiz.test(satz) && KLINIK_KONTEXT.test(satz) && !istBesprochen;
      if (tat || code || indiz) treffer.set(m.key, { key: m.key, label: m.label, prio: m.prio });
    }
  }
  return Array.from(treffer.values()).sort((a, b) => b.prio - a.prio);
}

/**
 * Sophie-Strecken-Label (chains.json, z.B. "Implantatinsertion",
 * "Fuellungstherapie") auf einen Behandlungs-Key mappen — zweite,
 * unabhaengige Erkennungsquelle nach vollstaendiger Abrechnung.
 */
export function erkenneAusStreckenLabel(label) {
  const t = normText(label);
  if (!t) return null;
  const map = [
    ["implantation", /implantat/],
    ["augmentation", /augmentation|knochenaufbau|sinuslift/],
    ["osteotomie", /osteotomie|operative/],
    ["wsr", /wurzelspitzen|wsr/],
    ["extraktion", /extraktion/],
    ["endo", /wurzelkanal|endodontie|endo\b/],
    ["par", /parodont/],
    ["krone", /krone|bruecke|veneer|inlay|prothetik/],
    ["fuellung", /fuellung/],
    ["pzr", /pzr|zahnreinigung|prophylaxe/],
  ];
  for (const [key, rx] of map) {
    if (rx.test(t)) {
      const m = MUSTER_BY_KEY.get(key);
      return { key: m.key, label: m.label, prio: m.prio };
    }
  }
  return null;
}

/**
 * Besuchsgrund-NAMEN klassifizieren ("IMP Implantat-OP klein" -> implantation).
 * Besprechungs-/Beratungs-Muster gewinnen bewusst ZUERST: "Implantat-Beratung"
 * ist eine Besprechung, kein OP-Motiv — sonst wuerde Overwatch sie als
 * Korrektur-ZIEL anbieten.
 * @returns {{key:string,prio:number}|null}
 */
export function klassifiziereMotivName(name) {
  const t = normText(name);
  if (!t) return null;
  const reihenfolge = [
    ["besprechung", /besprech|beratung|planung|planerstellung|aufklaerung|\bkva\b|\bhkp\b|vorgespraech/],
    ["kontrolle", /kontroll|untersuchung|check|recall|befundaufnahme|\b01\b/],
    ["nahtentfernung", /nahtentfernung|wundkontrolle|faeden/],
    ["implantation", /implantat(?!.*(pflege|reinigung))|implantation/],
    ["augmentation", /augmentation|knochenaufbau|sinuslift/],
    ["osteotomie", /osteotomie|weisheitszahn|operative entfernung/],
    ["wsr", /wurzelspitzen|\bwsr\b/],
    ["extraktion", /extraktion|\bex\b/],
    ["endo", /endo|wurzelkanal|wurzelbehandlung|trepanation/],
    ["par", /\bpar\b|parodont|\bupt\b|kuerettage/],
    ["stiftaufbau", /stiftaufbau/],
    ["fuellung", /fuellung|\bf[1-4]\b|komposit/],
    ["pzr", /\bpzr\b|zahnreinigung|prophylaxe/],
    ["schiene", /schiene|\bukps\b|\bkb\b|\bslm\b/],
    ["krone", /krone|bruecke|prothetik|veneer|inlay|onlay|praep|abformung|zahnersatz/],
  ];
  for (const [key, rx] of reihenfolge) {
    if (rx.test(t)) {
      const m = MUSTER_BY_KEY.get(key);
      return { key: m.key, prio: m.prio };
    }
  }
  return null;
}

// --- Entscheidung ---------------------------------------------------------------

/**
 * Korrektur-Politik (siehe Kopfkommentar). Pure Funktion, damit testbar.
 * @param {Array<{key:string,prio:number}>} erkannt   erkannte Behandlungen (prio absteigend)
 * @param {{key:string,prio:number}|null}   gebucht   Klassifikation des gebuchten Motivs
 * @returns {{aktion:"korrigieren"|"hinweisen"|"keine", dominant:object|null, grund:string}}
 */
export function entscheideKorrektur(erkannt, gebucht) {
  const dominant = erkannt?.[0] || null;
  if (!dominant) return { aktion: "keine", dominant: null, grund: "nichts_erkannt" };
  if (gebucht && dominant.key === gebucht.key) {
    return { aktion: "keine", dominant, grund: "passt" };
  }
  const gebuchtPrio = gebucht ? gebucht.prio : null;
  // Downgrade-Sperre: nie auf Besprechung/Kontrolle "runterkorrigieren".
  if (gebuchtPrio !== null && dominant.prio <= gebuchtPrio) {
    return { aktion: "keine", dominant, grund: "kein_upgrade" };
  }
  // Grosse Behandlung (>= Extraktion/Endo) schlaegt jeden kleineren Besuchsgrund.
  if (dominant.prio >= 3) return { aktion: "korrigieren", dominant, grund: "klarer_mismatch" };
  // Fuellung/PZR & Co: nur die gebuchte BESPRECHUNG wird korrigiert.
  if (dominant.prio === 2 && gebucht && gebucht.key === "besprechung") {
    return { aktion: "korrigieren", dominant, grund: "besprechung_war_behandlung" };
  }
  // Kontroll-Recall schuetzen: Kontrolle + kleine Behandlung -> nur Hinweis.
  if (dominant.prio === 2 && gebucht && gebucht.key === "kontrolle") {
    return { aktion: "hinweisen", dominant, grund: "kontroll_recall_geschuetzt" };
  }
  // Unklassifizierbares Motiv + kleine Behandlung: zu unsicher -> Hinweis.
  if (dominant.prio === 2 && !gebucht) {
    return { aktion: "hinweisen", dominant, grund: "motiv_unbekannt" };
  }
  return { aktion: "keine", dominant, grund: "unter_schwelle" };
}

/**
 * Ziel-Besuchsgrund der Praxis fuer eine erkannte Behandlung finden.
 * Kandidaten = Motive, deren NAME zur selben Klasse gehoert (Beratungs-Motive
 * fallen durch die Namens-Klassifikation automatisch raus). Bei mehreren
 * ("Implantat-OP klein"/"gross" — laut Chef egal) gewinnt deterministisch die
 * kleinste Dauer-Differenz zur echten Termindauer, dann der kuerzere Name.
 * @returns {{id:string,name:string,duration?:number}|null}
 */
export function findeZielMotiv(visitMotives, behandlungKey, { apptDauerMin = 0, mappingId = "" } = {}) {
  const vms = Array.isArray(visitMotives) ? visitMotives : [];
  if (mappingId) {
    const fest = vms.find((v) => v.id === mappingId);
    if (fest) return fest;
  }
  const kandidaten = vms.filter((v) => klassifiziereMotivName(v.name)?.key === behandlungKey);
  if (!kandidaten.length) return null;
  const rang = (v) => {
    const d = Number(v.duration) > 0 && apptDauerMin > 0 ? Math.abs(Number(v.duration) - apptDauerMin) : 9999;
    return d;
  };
  kandidaten.sort((a, b) =>
    (rang(a) - rang(b)) ||
    (String(a.name).length - String(b.name).length) ||
    String(a.name).localeCompare(String(b.name), "de"));
  return kandidaten[0];
}

// --- Konfiguration ---------------------------------------------------------------

/** Konfig pro Mandant: mas_config/motive_overwatch { enabled, mode, mapping }. */
export async function loadOverwatchConfig(clientId) {
  const def = { enabled: true, mode: "auto", mapping: {} };
  if (String(process.env.MAS_MOTIVE_OVERWATCH || "") === "0") {
    return { ...def, enabled: false };
  }
  try {
    const snap = await masCollection(clientId, "mas_config").doc("motive_overwatch").get();
    if (!snap.exists) return def;
    const d = snap.data() || {};
    return {
      enabled: d.enabled !== false,
      mode: d.mode === "vorschlag" ? "vorschlag" : "auto",
      mapping: (d.mapping && typeof d.mapping === "object") ? d.mapping : {},
    };
  } catch {
    return def;
  }
}

// --- Orchestrierung ---------------------------------------------------------------

function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (ts?._seconds) return ts._seconds * 1000;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function apptRef(clientId, locationId, appointmentId) {
  return admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(appointmentId);
}

/**
 * Prueft EINEN Termin gegen Doku-/Abrechnungstext und korrigiert bei klarem
 * Mismatch den Besuchsgrund (inkl. Audit-Metadaten + Brain-Event).
 *
 * @param {string} clientId
 * @param {{appointmentId:string, locationId?:string, text?:string,
 *          streckenLabel?:string, basis?:"doku"|"abrechnung",
 *          dryRun?:boolean}} args
 * @returns {Promise<{status:string, spoken?:string, from?:object, to?:object,
 *                    dominant?:object, detected?:Array}>}
 *   status: "corrected" | "suggested" | "kein_ziel" | "skip" | "disabled"
 */
export async function pruefeUndKorrigiereBesuchsgrund(clientId, {
  appointmentId, locationId = "", text = "", streckenLabel = "", basis = "doku", dryRun = false,
} = {}) {
  const apptId = String(appointmentId || "").trim();
  if (!apptId) return { status: "skip" };

  const cfg = await loadOverwatchConfig(clientId);
  if (!cfg.enabled) return { status: "disabled" };

  const booking = await loadBooking(clientId).catch(() => null);
  const locId = String(locationId || booking?.locationId || "").trim();
  if (!locId) return { status: "skip" };

  // Termin lesen + Guards: echter, bestaetigter Patiententermin, der schon
  // BEGONNEN hat. Zukunftstermine korrigiert Overwatch nie (Doku dort = Plan).
  let ap;
  try {
    const snap = await apptRef(clientId, locId, apptId).get();
    if (!snap.exists) return { status: "skip" };
    ap = snap.data() || {};
  } catch {
    return { status: "skip" };
  }
  if (!ap?.patient?.id) return { status: "skip" };
  if (ap.calendarItemType === "absence" || ap.isMultiDay === true) return { status: "skip" };
  if (String(ap.status || "confirmed") !== "confirmed") return { status: "skip" };
  const startMs = tsToMs(ap.start);
  if (!startMs || startMs > Date.now()) return { status: "skip" };
  // Explizit gepflegtes "nicht erschienen" respektieren (wie Doku-Waechter).
  if (ap.patientStatus !== null && ap.patientStatus !== undefined && ap.patientStatus !== TREATED) {
    return { status: "skip" };
  }

  // Erkennen: Diktat-/Abrechnungstext + (optional) Sophie-Strecken-Label.
  const erkannt = erkenneBehandlungen(text);
  const ausLabel = erkenneAusStreckenLabel(streckenLabel);
  if (ausLabel && !erkannt.some((e) => e.key === ausLabel.key)) {
    erkannt.push(ausLabel);
    erkannt.sort((a, b) => b.prio - a.prio);
  }
  if (!erkannt.length) return { status: "skip" };

  const aktuellesMotiv = { id: String(ap.visitMotive?.id || ""), name: String(ap.visitMotive?.name || "") };
  const gebucht = klassifiziereMotivName(aktuellesMotiv.name);
  const entscheidung = entscheideKorrektur(erkannt, gebucht);
  if (entscheidung.aktion === "keine") return { status: "skip", dominant: entscheidung.dominant };

  const dominant = entscheidung.dominant;

  // Anti-Nerv: derselbe Vorschlag/Hinweis wurde fuer diesen Termin schon
  // ausgesprochen -> still bleiben (jedes weitere Diktat wuerde ihn sonst
  // wiederholen). dryRun (Sweep-Bericht) sieht bewusst alles.
  const vorher = ap.motiveOverwatch || null;
  if (!dryRun && vorher && vorher.dominant === dominant.key &&
      (vorher.status === "suggested" || vorher.status === "kein_ziel")) {
    return { status: "skip", dominant };
  }
  const detected = erkannt.map((e) => ({ key: e.key, label: e.label, prio: e.prio }));
  const apptDauerMin = Math.max(0, Math.round((tsToMs(ap.end) - startMs) / 60000));
  const ziel = findeZielMotiv(booking?.visitMotives, dominant.key, {
    apptDauerMin,
    mappingId: String(cfg.mapping?.[dominant.key] || ""),
  });
  if (!ziel) {
    if (!dryRun) {
      try {
        await apptRef(clientId, locId, apptId).set({
          motiveOverwatch: {
            version: 1, status: "kein_ziel", basis,
            detected, dominant: dominant.key,
            grund: entscheidung.grund,
            checkedAtMs: Date.now(),
          },
        }, { merge: true });
      } catch { /* Metadaten sind Komfort */ }
    }
    return {
      status: "kein_ziel",
      dominant, detected,
      from: aktuellesMotiv,
      spoken: `Übrigens: Laut Doku war das eine ${dominant.label}, im Kalender steht aber "${aktuellesMotiv.name}" — ich finde nur keinen passenden Besuchsgrund zum Umstellen. Der Recall koennte den Patienten sonst falsch einsortieren.`,
    };
  }
  if (ziel.id === aktuellesMotiv.id) return { status: "skip", dominant };

  const nurHinweis = entscheidung.aktion === "hinweisen" || cfg.mode === "vorschlag";

  if (dryRun) {
    return {
      status: nurHinweis ? "suggested" : "corrected",
      dryRun: true,
      from: aktuellesMotiv,
      to: { id: ziel.id, name: ziel.name },
      dominant, detected,
    };
  }

  if (nurHinweis) {
    // Nur Metadaten + Hinweis — Besuchsgrund bleibt (Kontroll-Recall!).
    try {
      await apptRef(clientId, locId, apptId).set({
        motiveOverwatch: {
          version: 1, status: "suggested", basis,
          detected, dominant: dominant.key,
          suggestedMotive: { id: ziel.id, name: ziel.name },
          grund: entscheidung.grund,
          checkedAtMs: Date.now(),
        },
      }, { merge: true });
    } catch (e) {
      log.warn("overwatch.suggest_write_failed", { clientId, apptId, err: String(e?.message || e) });
    }
    return {
      status: "suggested",
      from: aktuellesMotiv,
      to: { id: ziel.id, name: ziel.name },
      dominant, detected,
      spoken: `Übrigens: Laut Doku war das eher eine ${dominant.label} als "${aktuellesMotiv.name}" — den Besuchsgrund habe ich zur Sicherheit nicht geaendert, damit der bestehende Recall erhalten bleibt.`,
    };
  }

  // Korrigieren: visitMotive in exakt der Form ersetzen, die die Plattform
  // speichert ({id, name, color, specialityId} — appointment.toJSON). Farbe/
  // Speciality aus der visitMotives-Collection des Standorts; Fallback: Werte
  // des alten Motivs (besser falsche Farbe als falscher Bucket).
  let zielVoll = { id: ziel.id, name: String(ziel.name || "") };
  try {
    const vmSnap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locId)
      .collection("visitMotives").doc(ziel.id).get();
    const vm = vmSnap.exists ? (vmSnap.data() || {}) : {};
    zielVoll = {
      id: ziel.id,
      name: String(vm.name || ziel.name || ""),
      color: String(vm.color || ap.visitMotive?.color || ""),
      specialityId: String(vm.specialityId || ap.visitMotive?.specialityId || ""),
    };
  } catch {
    zielVoll = {
      id: ziel.id,
      name: String(ziel.name || ""),
      color: String(ap.visitMotive?.color || ""),
      specialityId: String(ap.visitMotive?.specialityId || ""),
    };
  }

  try {
    await apptRef(clientId, locId, apptId).set({
      visitMotive: zielVoll,
      motiveOverwatch: {
        version: 1, status: "corrected", basis,
        detected, dominant: dominant.key,
        from: aktuellesMotiv,
        to: { id: zielVoll.id, name: zielVoll.name },
        grund: entscheidung.grund,
        correctedAtMs: Date.now(),
        correctedBy: "clara-overwatch",
      },
    }, { merge: true });
  } catch (e) {
    log.warn("overwatch.correct_write_failed", { clientId, apptId, err: String(e?.message || e) });
    return { status: "skip", dominant };
  }

  // Unveraenderliche Beobachtung ins geteilte Gedaechtnis (deterministische
  // id -> idempotent, wie calendarWatch). Patienten-Timeline sieht die
  // Korrektur, niemand raetselt spaeter, warum der Termin umbenannt wurde.
  const patientName = `${ap.patient?.firstName || ""} ${ap.patient?.lastName || ""}`.trim();
  try {
    await appendEvent(clientId, {
      id: `motive-overwatch:${apptId}:${zielVoll.id}`,
      channel: "system",
      type: "observation",
      direction: "internal",
      counterparty: { kind: "system", name: "Clara Overwatch", ref: null },
      subject: { patientId: ap.patient.id, name: patientName, matchStatus: "matched", matchMethod: "name" },
      status: "none",
      summary: `Besuchsgrund korrigiert: "${aktuellesMotiv.name}" -> "${zielVoll.name}" (laut ${basis === "abrechnung" ? "Abrechnung" : "Doku"}: ${dominant.label}). Recall-Bucket folgt beim naechsten Nachtlauf.`,
      extractor: "clara@motive-overwatch",
      tags: ["overwatch", "besuchsgrund", "recall"],
    });
  } catch (e) {
    log.warn("overwatch.event_failed", { clientId, apptId, err: String(e?.message || e) });
  }

  log.info("overwatch.motive_corrected", {
    clientId, apptId, from: aktuellesMotiv.name, to: zielVoll.name, dominant: dominant.key, basis,
  });

  return {
    status: "corrected",
    from: aktuellesMotiv,
    to: { id: zielVoll.id, name: zielVoll.name },
    dominant, detected,
    spoken: `Der Termin stand auf "${aktuellesMotiv.name}" — laut ${basis === "abrechnung" ? "Abrechnung" : "Doku"} war es eine ${dominant.label}. Ich habe den Besuchsgrund auf "${zielVoll.name}" umgestellt, damit der Patient im richtigen Recall landet.`,
  };
}

/**
 * Rueckwirkender Sweep: prueft die dokumentierten Termine der letzten Tage
 * auf Motiv-Mismatches (fuer Bestandskorrektur und den manuellen Check
 * "pruef mal die Besuchsgruende"). Korrigiert wie der Live-Hook — mit
 * dryRun=true nur Bericht, keine Schreibzugriffe.
 */
export async function overwatchSweep(clientId, { tageZurueck = 7, max = 12, dryRun = false } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, ergebnisse: [] };
  const nowMs = Date.now();
  const ergebnisse = [];
  for (let i = 0; i <= tageZurueck && ergebnisse.length < max; i++) {
    const dateIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(nowMs - i * 86400000));
    const day = await getDayAppointments(clientId, { date: dateIso }).catch(() => null);
    if (!day?.ok) continue;
    for (const a of (day.appointments || [])) {
      if (ergebnisse.length >= max) break;
      if (!a.patientId || a.isAbsence || a.isMultiDay || a.startMs >= nowMs) continue;
      let combined = "";
      try {
        const segs = await readAppointmentSegments(clientId, locationId, a.id);
        combined = combineActiveSegments(segs);
      } catch { /* Termin ohne lesbare Doku -> nichts zu pruefen */ }
      if (!combined) continue;
      const r = await pruefeUndKorrigiereBesuchsgrund(clientId, {
        appointmentId: a.id, locationId, text: combined, basis: "doku", dryRun,
      });
      if (r.status === "corrected" || r.status === "suggested" || r.status === "kein_ziel") {
        ergebnisse.push({
          appointmentId: a.id, date: dateIso, patientName: a.patientName,
          status: r.status, from: r.from?.name || "", to: r.to?.name || "",
          dominant: r.dominant?.label || "",
        });
      }
    }
  }
  return { ok: true, ergebnisse };
}

/** Gesprochene Zusammenfassung eines Sweeps. */
export function sprichSweep(ergebnisse) {
  if (!ergebnisse?.length) return "Alle Besuchsgruende passen zur dokumentierten Behandlung — da ist nichts umzustellen.";
  const korrigiert = ergebnisse.filter((e) => e.status === "corrected");
  const teile = [];
  if (korrigiert.length) {
    const liste = korrigiert.slice(0, 4).map((e) => `${e.patientName}: "${e.from}" auf "${e.to}"`).join("; ");
    teile.push(`Ich habe ${korrigiert.length === 1 ? "einen Besuchsgrund" : `${korrigiert.length} Besuchsgruende`} umgestellt — ${liste}${korrigiert.length > 4 ? " und weitere" : ""}.`);
  }
  const offen = ergebnisse.filter((e) => e.status !== "corrected");
  if (offen.length) {
    teile.push(`${offen.length === 1 ? "Ein Termin braucht" : `${offen.length} Termine brauchen`} noch einen Blick — dort passt die Doku nicht zum Besuchsgrund, ich habe aber nicht automatisch umgestellt.`);
  }
  return teile.join(" ");
}
