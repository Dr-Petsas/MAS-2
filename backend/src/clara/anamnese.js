import admin from "../firebase.js";
import { loadBooking } from "./booking.js";

// Anamnese-Auffaelligkeiten (16.06.2026): Clara liest den Anamnesebogen eines
// Patienten und meldet auffaellige Eintraege (Allergien, Medikamente,
// Vorerkrankungen, Schwangerschaft ...). Quelle sind die SignR-Patientendokumente
//   clients/{clientId}/locations/{locationId}/patients/{pid}/pdocuments
// Die strukturierten Antworten liegen im Baum ``formRows`` -> ``columns`` ->
// FormItem. WICHTIG: Die Plattform loescht ``formRows`` beim Unterschreiben und
// behaelt nur das PDF (pdfService.saveDocumentAndCreatePDF). Eine unterschriebene
// Anamnese ist daher NICHT maschinell lesbar - das sagen wir ehrlich, statt zu
// raten. Reine Heuristik ueber die deutschen Fragetexte; nie Diagnosen erfinden.

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
  { cat: "Vorerkrankung", re: /erkrank|diabetes|herz|kreislauf|blutdruck|asthma|epilep|hepatitis|hiv|aids|infekt|bluter|schilddr|krebs|tumor|rheuma|niere|leber|osteoporose/i },
  { cat: "Schwangerschaft", re: /schwanger|stillen/i },
  { cat: "Blutung/Gerinnung", re: /blutung|gerinnung/i },
  { cat: "Raucher", re: /raucher|rauchen|nikotin/i },
];

function deLabel(item) {
  const labels = Array.isArray(item?.labels) ? item.labels : [];
  const de = labels.find((l) => l && l.key === "de") || labels[0];
  return String(de?.value || "").trim();
}

function isAffirmative(s) {
  return /^\s*(ja|yes|positiv|vorhanden)\b/i.test(String(s || ""));
}

function catFor(text) {
  for (const n of NOTABLE) if (n.re.test(text)) return n.cat;
  return null;
}

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
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
      out.push({ category: qCat, text: details.length ? details.join(", ") : "ja" });
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

function isNegative(s) {
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
  let signedSeen = false;
  let findings = [];
  for (const d of ana) {
    const rows = Array.isArray(d.formRows) ? d.formRows : [];
    if (rows.length) {
      hadFormRows = true;
      findings = findings.concat(walkFindings(rows));
    } else if (d.status === "signed" || d.pdfCreatedAt) {
      signedSeen = true;
    }
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
    signedOnly: !hadFormRows && signedSeen,
    findings: deduped,
  };
}

/**
 * Gesprochener Anamnese-Report. Meldet auffaellige Eintraege, sagt ehrlich
 * Bescheid, wenn die Anamnese nur als PDF vorliegt, und schlaegt vor, einen
 * Befund als Notiz festzuhalten.
 */
export function buildSpokenAnamnese(result, { who = "der Patient" } = {}) {
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  if (!result?.ok) return `Die Anamnese von ${who} kann ich gerade nicht abrufen.`;
  if (!result.hasAnamnese) return `Zu ${who} finde ich keine Anamnese im System.`;
  if (result.signedOnly && !result.findings.length) {
    return `Die Anamnese von ${who} ist unterschrieben und liegt nur als PDF vor — den Inhalt kann ich nicht automatisch vorlesen.`;
  }
  if (!result.findings.length) {
    return `Die Anamnese von ${who} habe ich geprüft — keine auffälligen Einträge bei Allergien, Medikamenten oder Vorerkrankungen.`;
  }
  // Befunde je Kategorie buendeln.
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
  const lead = `In der Anamnese von ${who} gibt es auffällige Einträge — ${parts.join("; ")}.`;
  return `${cap(lead)} Soll ich das als Notiz festhalten?`;
}
