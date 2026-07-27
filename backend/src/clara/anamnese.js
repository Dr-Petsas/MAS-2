import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { vary } from "./speech.js";

// Anamnese-Auffaelligkeiten (16.06.2026): Clara liest den Anamnesebogen eines
// Patienten und meldet auffaellige Eintraege (Allergien, Medikamente,
// Vorerkrankungen, Schwangerschaft ...). Quelle sind die SignR-Patientendokumente
//   clients/{clientId}/locations/{locationId}/patients/{pid}/pdocuments
// Die strukturierten Antworten liegen im Baum ``formRows`` -> ``columns`` ->
// FormItem. Die Plattform loescht ``formRows`` beim Unterschreiben und behaelt
// nur das PDF (pdfService.saveDocumentAndCreatePDF).
//
// UPDATE 04.07.2026: Unterschriebene Boegen sind DOCH lesbar — pdfmake schreibt
// eine echte Textebene ins PDF. anamnesePdf.js extrahiert Frage/Antwort daraus
// (Kaestchen = Fontello-Glyphen) und cached das Ergebnis pro Dokument.
// Vorrang hat weiter der unsignierte Bogen (aktueller Stand); nur wenn es
// KEINEN gibt, faellt die Auswertung auf den NEUESTEN signierten PDF-Bogen
// zurueck (ausPdf=true, bogenMs = Datum des Bogens). signedOnly bleibt nur
// noch fuer PDFs stehen, die wirklich nicht lesbar sind (Scan/Fremdformat).
// Reine Heuristik ueber die deutschen Fragetexte; nie Diagnosen erfinden.

// FormItemEnum (Plattform): 3=checkbox, 5=inputText, 8=radio, 15=dropdown.
const TYPE_TEXT = 5;
const TYPE_RADIO = 8;
const TYPE_CHECKBOX = 3;
const TYPE_DROPDOWN = 15;

// Kategorien fuer "auffaellig". Trifft der Fragetext (oder ein freier Antworttext)
// eine dieser Regeln UND ist die Frage bejaht/ausgefuellt, wird sie gemeldet.
const NOTABLE = [
  { cat: "Allergie", re: /allerg|penicillin|unvertr|unverträg|latex|jod|kontrastmittel/i },
  { cat: "Medikamente", re: /medikament|arznei|blutverd|marcumar|tablette|einnahme|gerinnungshemm|ass|aspirin/i },
  { cat: "Vorerkrankung", re: /erkrank|diabetes|herz|kreislauf|blutdruck|hochdruck|hypertonie|asthma|epilep|hepatitis|hiv|aids|infekt|bluter|schilddr|krebs|tumor|rheuma|niere|leber|osteoporose/i },
  { cat: "Schwangerschaft", re: /schwanger|stillen/i },
  { cat: "Blutung/Gerinnung", re: /blutung|gerinnung/i },
  { cat: "Raucher", re: /raucher|rauchen|nikotin/i },
];

function deLabel(item) {
  const labels = Array.isArray(item?.labels) ? item.labels : [];
  const de = labels.find((l) => l && l.key === "de") || labels[0];
  return String(de?.value || "").trim();
}

export function isAffirmative(s) {
  return /^\s*(ja|yes|positiv|vorhanden)\b/i.test(String(s || ""));
}

export function catFor(text) {
  for (const n of NOTABLE) if (n.re.test(text)) return n.cat;
  return null;
}

export function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// Bejahte Ja/Nein-Frage OHNE Folge-Freitext: statt eines nichtssagenden "ja"
// das THEMA aus der Frage ziehen ("Leiden Sie unter Bluthochdruck?" ->
// "Bluthochdruck"). Bewusst simple Heuristik fuer deutsche Anamnesefragen.
export function topicFromQuestion(q) {
  let s = String(q || "").replace(/\s+/g, " ").trim().replace(/[?!.]+$/, "");
  s = s.replace(/^(leiden sie (allgemein )?(unter|an)|haben sie( einen| eine| ein)?|besteht (eine|ein)|sind sie auf( eine| einen| ein)?|sind sie|nehmen sie (regelmäßig|regelmaessig)?|waren sie( schon einmal)?|reagieren sie( allergisch)?( auf( bestimmte)?)?)\s+/i, "");
  s = s.replace(/\s+(angewiesen|ein|eingenommen)$/i, "");
  return clip(s, 48);
}

// Geht den formRows-Baum rekursiv durch und sammelt auffaellige Befunde.
// Ein Befund ist {category, text}. ``text`` ist moeglichst der konkrete
// Patientenangabe-Text (z. B. "Penicillin"), sonst der Fragetext.
export function walkFindings(formRows, out = []) {
  if (!Array.isArray(formRows)) return out;
  for (const row of formRows) {
    const columns = Array.isArray(row?.columns) ? row.columns : [];
    for (const item of columns) {
      collectItem(item, out);
    }
  }
  return out;
}

function collectItem(item, out) {
  if (!item || typeof item !== "object") return;
  const question = deLabel(item);
  const qCat = catFor(question);
  const type = typeof item.type === "number" ? item.type : null;

  // 1) Freitext / Dropdown: Antwort steht in value.
  if (type === TYPE_TEXT || type === TYPE_DROPDOWN) {
    const val = String(item.value || "").trim();
    if (val) {
      const valCat = catFor(val);
      if (qCat) out.push({ category: qCat, text: clip(val, 80) });
      else if (valCat) out.push({ category: valCat, text: clip(val, 80) });
    }
  }

  // 2) Radio (Ja/Nein): bejaht? -> auffaellig, mit Folge-Freitext ("wenn ja, welche").
  if (type === TYPE_RADIO) {
    const answers = Array.isArray(item.answers) ? item.answers : [];
    const checked = answers.filter((a) => a && a.checked === true);
    const selectedVal = String(item.value || "").trim();
    const said = checked.map((a) => deLabel(a)).filter(Boolean);
    const affirmed = isAffirmative(selectedVal) || said.some((s) => isAffirmative(s));
    if (qCat && affirmed) {
      // Folge-Freitexte aus den bejahten Antworten einsammeln.
      const details = [];
      for (const a of checked) {
        for (const r of (Array.isArray(a.formRows) ? a.formRows : [])) {
          for (const c of (Array.isArray(r?.columns) ? r.columns : [])) {
            const dv = String(c?.value || "").trim();
            if (dv) details.push(clip(dv, 80));
          }
        }
      }
      out.push({ category: qCat, text: details.length ? details.join(", ") : (topicFromQuestion(question) || "ja") });
    }
  }

  // 3) Checkbox: angekreuzte Antworten, die selbst auffaellig sind.
  if (type === TYPE_CHECKBOX) {
    const answers = Array.isArray(item.answers) ? item.answers : [];
    for (const a of answers) {
      if (a && a.checked === true) {
        const lab = deLabel(a);
        const cat = qCat || catFor(lab);
        if (cat && lab && !isNegative(lab)) out.push({ category: cat, text: clip(lab, 80) });
      }
    }
  }

  // 4) Verschachtelte Folge-Zeilen generisch weiterverfolgen.
  if (Array.isArray(item.formRows)) walkFindings(item.formRows, out);
  if (Array.isArray(item.answers)) {
    for (const a of item.answers) {
      if (a && a.checked === true && Array.isArray(a.formRows)) walkFindings(a.formRows, out);
    }
  }
}

export function isNegative(s) {
  return /^\s*(nein|keine?|nicht|no)\b/i.test(String(s || ""));
}

/**
 * Liest die Anamnese eines Patienten und liefert auffaellige Befunde.
 * @param {string} clientId
 * @param {{patientId?:string}} who
 * @returns {Promise<{ok:boolean, reason?:string, hasAnamnese:boolean,
 *   signedOnly:boolean, findings:{category:string,text:string}[]}>}
 */
export async function getPatientAnamnese(clientId, { patientId } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, reason: "no_location", hasAnamnese: false, signedOnly: false, findings: [] };
  const pid = String(patientId || "").trim();
  if (!pid) return { ok: false, reason: "no_patient", hasAnamnese: false, signedOnly: false, findings: [] };

  let docs = [];
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("patients").doc(pid)
      .collection("pdocuments").get();
    docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return { ok: false, reason: "read_failed", error: String(e?.message || e), hasAnamnese: false, signedOnly: false, findings: [] };
  }

  const ana = docs.filter((d) => /anamnese|anamnesis|history/i.test(String(d.name || "")));
  if (!ana.length) return { ok: true, hasAnamnese: false, signedOnly: false, findings: [] };

  let hadFormRows = false;
  const signierte = [];
  let findings = [];
  for (const d of ana) {
    const rows = Array.isArray(d.formRows) ? d.formRows : [];
    // Ein VERSCHICKTER, aber noch unausgefuellter Bogen (kein einziges Kreuz,
    // kein Freitext) zaehlt nicht als "aktueller Stand" — sonst maskiert er
    // den unterschriebenen Alt-Bogen und Clara meldet faelschlich "nichts
    // Auffaelliges", obwohl im PDF z. B. Medikamente stehen.
    if (rows.length && hatAntworten(rows)) {
      hadFormRows = true;
      findings = findings.concat(walkFindings(rows));
    } else if (d.status === "signed" || d.pdfCreatedAt) {
      signierte.push(d);
    }
  }

  // Kein unsignierter Bogen? Dann den NEUESTEN signierten PDF-Bogen auswerten
  // (Textebene, anamnesePdf.js). Best-effort: schlaegt das fehl, bleibt die
  // ehrliche signedOnly-Antwort.
  let ausPdf = false;
  let bogenMs = 0;
  if (!hadFormRows && signierte.length) {
    signierte.sort((a, b) => _pdocMs(b) - _pdocMs(a));
    try {
      const { findingsAusSigniertemPdf } = await import("./anamnesePdf.js");
      const r = await findingsAusSigniertemPdf(clientId, locationId, pid, signierte[0]);
      if (r?.ok) {
        findings = findings.concat(r.findings);
        ausPdf = true;
        bogenMs = r.bogenMs || _pdocMs(signierte[0]);
      }
    } catch { /* PDF-Weg ist Zusatz — nie das Briefing blockieren */ }
  }

  // Dedupe (Kategorie + Text), Reihenfolge erhalten.
  const seen = new Set();
  const deduped = [];
  for (const f of findings) {
    const key = `${f.category}|${f.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  return {
    ok: true,
    hasAnamnese: true,
    signedOnly: !hadFormRows && signierte.length > 0 && !ausPdf,
    ausPdf,
    bogenMs,
    findings: deduped,
  };
}

function _pdocMs(d) {
  const v = d?.pdfCreatedAt || d?.createdAt;
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
}

// Hat der Bogen ueberhaupt eine Patientenantwort (Kreuz oder Freitext)?
function hatAntworten(formRows) {
  let gefunden = false;
  const walk = (rows) => {
    if (!Array.isArray(rows) || gefunden) return;
    for (const row of rows) {
      for (const item of (Array.isArray(row?.columns) ? row.columns : [])) {
        if (!item || typeof item !== "object") continue;
        if (String(item.value || "").trim()) { gefunden = true; return; }
        const answers = Array.isArray(item.answers) ? item.answers : [];
        if (answers.some((a) => a && a.checked === true)) { gefunden = true; return; }
        if (Array.isArray(item.formRows)) walk(item.formRows);
        for (const a of answers) if (a && Array.isArray(a.formRows)) walk(a.formRows);
      }
      if (gefunden) return;
    }
  };
  walk(formRows);
  return gefunden;
}

/**
 * Gesprochener Anamnese-Report. Meldet auffaellige Eintraege, sagt ehrlich
 * Bescheid, wenn die Anamnese nur als PDF vorliegt, und schlaegt vor, einen
 * Befund als Notiz festzuhalten.
 *
 * Formulierungs-Variation (05.07.2026, Chef-Wunsch "nicht so steif"):
 * Pro Situation ein Pool aus >= 10 Formulierungen (Ansaetze siehe
 * speech.js/vary — kollegial, warm, leichter Humor, Bild, Entwarnung zuerst,
 * Prioritaet zuerst, Frage, knapp, erzaehlerisch, zupackend). Die FAKTEN
 * ({who}, Befundliste, Bogen-Datum) setzt der Code ein — die Variation kann
 * nichts erfinden. Humor NIE ueber Befunde, nur bei Entwarnung/Neutralem.
 */
export function buildSpokenAnamnese(result, { who = "der Patient" } = {}) {
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  if (!result?.ok) {
    return vary("anamnese.fehler", [
      `Die Anamnese von ${who} kann ich gerade nicht abrufen.`,
      `Ich komme im Moment nicht an die Anamnese von ${who} heran — bitte gleich noch einmal fragen.`,
      `Da klemmt es gerade beim Zugriff auf den Bogen von ${who}. Einen Moment, dann versuche ich es wieder.`,
      `Die Kartei gibt mir die Anamnese von ${who} gerade nicht her. Ich würde es gleich noch einmal probieren.`,
      `Technisches Sorry: Der Anamnesebogen von ${who} lädt gerade nicht.`,
    ]);
  }

  if (!result.hasAnamnese) {
    return vary("anamnese.keine", [
      `Zu ${who} finde ich keine Anamnese im System.`,
      `Für ${who} liegt noch gar kein Anamnesebogen vor — da müssten wir erst einen verschicken.`,
      `Da ist nichts: ${who} hat bei uns noch keinen Anamnesebogen ausgefüllt.`,
      `Ich habe in der Kartei nachgesehen — ein Anamnesebogen von ${who} ist nicht dabei.`,
      `Fehlanzeige bei der Anamnese: Von ${who} gibt es im System keinen Bogen.`,
      `Der Ordner ist leer — für ${who} wurde noch keine Anamnese erfasst.`,
    ]);
  }

  if (result.signedOnly && !result.findings.length) {
    return vary("anamnese.nurpdf", [
      `Die Anamnese von ${who} ist unterschrieben und liegt nur als PDF vor — den Inhalt kann ich nicht automatisch vorlesen.`,
      `Ehrliche Antwort: Der Bogen von ${who} ist unterschrieben und steckt als PDF im Archiv — da komme ich mit dem Lesen nicht rein.`,
      `Bei ${who} gibt es nur den unterschriebenen PDF-Bogen, und der lässt sich maschinell nicht auswerten. Am besten kurz selbst hineinschauen.`,
      `Die Anamnese von ${who} liegt als unterschriebenes PDF vor. Vorlesen kann ich daraus leider nichts — behaupten will ich erst recht nichts.`,
      `Da muss ich passen: ${who} hat nur einen unterschriebenen PDF-Bogen, den ich nicht automatisch lesen kann.`,
    ]);
  }

  // Aus dem signierten PDF gelesen: Stand des Bogens ehrlich dazusagen.
  const stand = result.ausPdf && result.bogenMs ? bogenStand(result.bogenMs) : "";
  const standSatz = stand ? ` Der unterschriebene Bogen ist vom ${stand}.` : "";

  if (!result.findings.length) {
    // Entwarnung — hier darf es auch mal schmunzeln (nie ueber den Patienten).
    return vary("anamnese.unauffaellig", [
      `Die Anamnese von ${who} habe ich geprüft — keine auffälligen Einträge bei Allergien, Medikamenten oder Vorerkrankungen.${standSatz}`,
      `Gute Nachricht: Im Bogen von ${who} ist alles unauffällig — keine Allergien, keine Dauermedikamente, keine Vorerkrankungen vermerkt.${standSatz}`,
      `Ich habe den Bogen von ${who} durchgesehen — nichts, was für die Behandlung wichtig wäre. Alles glatt.${standSatz}`,
      `Kurz und schmerzlos: Bei ${who} ist in der Anamnese nichts Auffälliges angekreuzt.${standSatz}`,
      `Die Anamnese von ${who} ist die langweiligste Sorte — und das ist hier ein Kompliment: keine Auffälligkeiten.${standSatz}`,
      `Alles ruhig bei ${who}: Der Bogen zeigt weder Allergien noch Medikamente noch Vorerkrankungen.${standSatz}`,
      `Von der Anamnese her grünes Licht für ${who} — keine besonderen Einträge.${standSatz}`,
      `Ich habe extra zweimal hingesehen: Im Bogen von ${who} ist nichts Auffälliges dabei.${standSatz}`,
      `Da kann ich Entwarnung geben — die Anamnese von ${who} ist ohne Befund.${standSatz}`,
      `Nichts zu melden bei ${who}: Allergien, Medikamente, Vorerkrankungen — überall Nein angekreuzt.${standSatz}`,
      `${cap(who)} macht es uns leicht: Die Anamnese ist komplett unauffällig.${standSatz}`,
    ]);
  }

  // Befunde je Kategorie buendeln (Fakten — bleiben in JEDER Variante gleich).
  const byCat = new Map();
  for (const f of result.findings) {
    if (!byCat.has(f.category)) byCat.set(f.category, []);
    const t = f.text && f.text !== "ja" ? f.text : "";
    if (t) byCat.get(f.category).push(t);
  }
  const parts = [];
  for (const [cat, texts] of byCat) {
    parts.push(texts.length ? `${cat}: ${[...new Set(texts)].join(", ")}` : cat);
  }
  const befunde = parts.join("; ");
  const standEinschub = stand ? ` — unterschriebener Bogen vom ${stand} —` : "";

  // Befunde vorhanden: sachlich in der Sache, variantenreich im Ton.
  // KEIN Humor ueber die Befunde selbst.
  const meldung = vary("anamnese.befunde", [
    `In der Anamnese von ${who}${standEinschub} gibt es auffällige Einträge: ${befunde}.`,
    `Kurz zur Anamnese von ${who}${standEinschub}: Da steht etwas, das du wissen solltest — ${befunde}.`,
    `Wichtig für die Behandlung von ${who}${standEinschub}: ${befunde}.`,
    `Ich habe den Bogen von ${who} durchgesehen${standEinschub} — dabei sind mir diese Punkte aufgefallen: ${befunde}.`,
    `Bei ${who} bitte auf dem Schirm haben${standEinschub}: ${befunde}.`,
    `Der Bogen von ${who} hat ein paar markierte Stellen${standEinschub}: ${befunde}.`,
    `Bevor ${who} im Stuhl sitzt${standEinschub}, kurz das Wichtigste aus der Anamnese: ${befunde}.`,
    `Aufgepasst bei ${who}${standEinschub} — die Anamnese meldet: ${befunde}.`,
    `${cap(who)} bringt aus der Anamnese etwas mit${standEinschub}: ${befunde}.`,
    `Denk bei ${who} bitte an Folgendes aus dem Bogen${standEinschub}: ${befunde}.`,
    `Die Anamnese von ${who} ist nicht ganz leer${standEinschub} — vermerkt sind: ${befunde}.`,
  ]);

  const frage = vary("anamnese.notizfrage", [
    "Soll ich das als Notiz festhalten?",
    "Soll ich Ihnen das an den Termin schreiben?",
    "Möchtest du, dass ich das als Notiz hinterlege?",
    "Sag Bescheid, wenn ich das als Notiz speichern soll.",
    "Wenn du willst, halte ich das direkt als Notiz fest.",
    "Soll ich das für den Termin notieren?",
    "Auf Wunsch schreibe ich das gleich in die Kartei-Notiz.",
    "Soll das als Vermerk an den Termin?",
    "Ich kann das als Notiz anheften — einfach Ja sagen.",
    "Festhalten als Notiz? Ein Wort genügt.",
  ]);

  return `${cap(meldung)} ${frage}`;
}

/** "16.05.2025" fuer die Sprach-/Anzeige-Angabe "Bogen vom ...". */
export function bogenStand(ms) {
  try {
    return new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  } catch { return ""; }
}
