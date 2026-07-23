// W-LENA-8d: gewichtetes Clara-Briefing aus Lena Doku-Template-Feldern.
// Nur das Wichtigste — keine Romane, kein structuredText-Dump, keine Ziffern.
// SignR-Anamnese bleibt separat (nextPatientsBriefing/kompakteAnamnese).

import admin from "../firebase.js";
import { loadBooking } from "./booking.js";

/** Hoehere Zahl = eher sprechen. Felder ohne Eintrag hier: nie im Briefing. */
export const FIELD_WEIGHTS = {
  komplikationen: 100, // nur wenn NICHT "keine"
  plan_durchgefuehrt: 95,
  therapie: 90,
  ex_zahn: 88,
  diagnose: 78,
  anamnese: 76, // Besuch-Risiken aus Template (kurz)
  procedere: 72, // was offen/als Naechstes
  plan_geplant: 68,
  zaehne: 62,
  endo_kanaele: 58,
  fuellung_flaechen: 52,
  fuellung_material: 48,
  la_mittel: 40,
  befund: 32, // nur wenn sonst nichts Klinisches
  anlass: 20, // meist schon visitMotive — nur Fallback
  // bewusst AUS: aufklaerung, plan_zustimmung, roe_*, la_region (zu dünn/zu lang)
};

const MAX_FIELD_CHARS = 55;
const MAX_SNIPPET_CHARS = 140;
const MAX_FACTS = 2;

function clip(s, max = MAX_FIELD_CHARS) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 20 ? cut.slice(0, sp) : cut).trim() + "…";
}

function skipValue(key, raw) {
  const v = String(raw || "").trim();
  if (!v) return true;
  if (key === "komplikationen" && /^keine\b/i.test(v)) return true;
  // reine Anlass-Wiederholung / Fuellsel
  if (/^(siehe oben|s\.\s*o\.|—|-)$/i.test(v)) return true;
  return false;
}

/**
 * Waehlt die hoechstgewichteten Fakten aus templateFields.values.
 * @returns {Array<{key:string, weight:number, text:string}>}
 */
export function pickWeightedFacts(fields, {
  maxFacts = MAX_FACTS,
  maxChars = MAX_SNIPPET_CHARS,
  excludeKeys = [],
} = {}) {
  const values = fields?.values && typeof fields.values === "object" ? fields.values : (fields || {});
  const exclude = new Set(excludeKeys);
  const open = new Set(Array.isArray(fields?.openBlocks) ? fields.openBlocks : []);

  const candidates = [];
  for (const [key, weight] of Object.entries(FIELD_WEIGHTS)) {
    if (exclude.has(key)) continue;
    if (skipValue(key, values[key])) continue;
    // befund nur wenn weder diagnose noch therapie
    if (key === "befund" && (values.diagnose || values.therapie || values.plan_durchgefuehrt)) continue;
    // anlass nur als Notnagel
    if (key === "anlass" && (values.therapie || values.diagnose || values.plan_durchgefuehrt)) continue;
    // plan_geplant weglassen wenn gleich anlass und plan_durchgefuehrt da
    if (key === "plan_geplant" && values.plan_durchgefuehrt) {
      const a = String(values.plan_geplant || "").toLowerCase();
      const b = String(values.plan_durchgefuehrt || "").toLowerCase();
      if (a && b && (b.includes(a.slice(0, 12)) || a.includes(b.slice(0, 12)))) continue;
    }
    // Leichte Block-Felder (LA/Fuellung-Detail) nur wenn Block offen — starke
    // Keys (ex_zahn) bleiben auch ohne openBlocks.
    const isLightBlock = key.startsWith("fuellung_") || key.startsWith("endo_") || key.startsWith("la_");
    if (isLightBlock && weight < 80) {
      const blockOk = open.has("fuellung") || open.has("endo") || open.has("la") || open.has("extraktion");
      if (!blockOk) continue;
    }
    candidates.push({ key, weight, text: clip(values[key]) });
  }

  candidates.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

  const picked = [];
  let used = 0;
  for (const c of candidates) {
    if (picked.length >= maxFacts) break;
    // Budget: Trennzeichen "~; "
    const add = c.text.length + (picked.length ? 2 : 0);
    if (used + add > maxChars && picked.length) break;
    if (used + c.text.length > maxChars && !picked.length) {
      picked.push({ ...c, text: clip(c.text, maxChars) });
      break;
    }
    picked.push(c);
    used += add;
  }
  return picked;
}

/** Fact -> kurze Sprechphrase (kein Roman). */
function factPhrase(fact) {
  const t = fact.text;
  switch (fact.key) {
    case "plan_durchgefuehrt": return `gemacht: ${t}`;
    case "plan_geplant": return `geplant war: ${t}`;
    case "procedere": return `offen: ${t}`;
    case "komplikationen": return `Komplikation: ${t}`;
    case "anamnese": return `Risiken: ${t}`;
    case "zaehne": return t.startsWith("Zahn") ? t : `Zahn ${t}`;
    case "fuellung_flaechen": return `Flächen ${t}`;
    case "fuellung_material": return t;
    case "endo_kanaele": return `Endo: ${t}`;
    case "ex_zahn": return t;
    case "la_mittel": return `LA ${t}`;
    default: return t;
  }
}

/**
 * Baut den kurzen „Beim letzten Mal …“-Zusatz + optional „Heute …“.
 * @returns {{ spoken: string, cardNote: string, facts: object[], source: string }}
 */
export function buildWeightedVisitBriefing({
  lastFields = null,
  thisFields = null,
  lastMotive = "",
  thisMotive = "",
} = {}) {
  const lastFacts = lastFields ? pickWeightedFacts(lastFields, { maxFacts: MAX_FACTS }) : [];
  // Heute: nur Plan/Offenes das NICHT schon im visitMotive steckt — max 1 Fact
  let thisFacts = [];
  if (thisFields) {
    thisFacts = pickWeightedFacts(thisFields, {
      maxFacts: 1,
      maxChars: 70,
      excludeKeys: ["anlass", "befund", "therapie", "diagnose"], // heute steht Anlass schon im Heads-up
    }).filter((f) => f.key === "procedere" || f.key === "plan_geplant" || f.key === "anamnese");
  }

  const lastBits = lastFacts.map(factPhrase);
  let spoken = "";
  let cardNote = "";

  if (lastBits.length) {
    spoken = lastBits.join("; ");
    cardNote = spoken;
  } else if (lastMotive) {
    // Fallback Kalender — kein Template
    spoken = "";
    cardNote = "";
  }

  // Offenes aus LETZTEM Termin (procedere) hat Vorrang vor heutigem Template-Lärm
  if (thisFacts.length && spoken.length < MAX_SNIPPET_CHARS - 20) {
    const extra = thisFacts.map(factPhrase).join("; ");
    // Nur anhaengen wenn nicht schon enthalten
    if (extra && !spoken.toLowerCase().includes(extra.slice(0, 20).toLowerCase())) {
      spoken = spoken ? `${spoken}. Heute zusätzlich: ${extra}` : `Heute: ${extra}`;
      if (!cardNote) cardNote = extra;
    }
  }

  spoken = clip(spoken, MAX_SNIPPET_CHARS);
  cardNote = clip(cardNote, 90);

  return {
    spoken,
    cardNote,
    facts: [...lastFacts, ...thisFacts],
    source: lastFacts.length || thisFacts.length ? "template" : "none",
  };
}

/** Firestore: treatment/main.templateFields eines Termins (best-effort). */
export async function readAppointmentTemplateFields(clientId, locationId, appointmentId) {
  const cid = String(clientId || "").trim();
  const lid = String(locationId || "").trim();
  const aid = String(appointmentId || "").trim();
  if (!cid || !lid || !aid) return null;
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(cid)
      .collection("locations").doc(lid)
      .collection("appointments").doc(aid)
      .collection("treatment").doc("main")
      .get();
    if (!snap.exists) return null;
    const tf = snap.data()?.templateFields;
    if (!tf || typeof tf !== "object" || !tf.values) return null;
    return tf;
  } catch {
    return null;
  }
}

/**
 * Laedt Template des letzten (+ optional aktuellen) Termins und baut Snippet.
 * @param {object} histLast  Appointment aus getPatientAppointments (braucht .id)
 * @param {object|null} histThis optional aktueller Termin
 */
export async function loadWeightedVisitBriefing(clientId, { lastAppt = null, thisAppt = null } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId || "";
  if (!locationId) {
    return { spoken: "", cardNote: "", facts: [], source: "none" };
  }

  const [lastFields, thisFields] = await Promise.all([
    lastAppt?.id ? readAppointmentTemplateFields(clientId, locationId, lastAppt.id) : null,
    thisAppt?.id ? readAppointmentTemplateFields(clientId, locationId, thisAppt.id) : null,
  ]);

  return buildWeightedVisitBriefing({
    lastFields,
    thisFields,
    lastMotive: lastAppt?.visitMotive || "",
    thisMotive: thisAppt?.visitMotive || "",
  });
}
