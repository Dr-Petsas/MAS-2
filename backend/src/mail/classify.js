import { chat } from "./llm.js";

// Practice-relevance + category classification for INBOUND mail.
// Two layers, mirroring the original MAS behaviour:
//   1) classifyByKeywords — deterministic, fast, runs at sync time so badges are
//      always present without any LLM latency.
//   2) classifyWithLLM — on-demand refinement via the local Qwen model (cached on
//      the message via aiClassifiedAt) for nuanced cases.
// Category labels map 1:1 to the .mail-row-category.* / .mail-detail-category.*
// CSS classes (see getCategoryClass on the frontend).

export const CATEGORY_LABELS = [
  "Gerichtliche Klage",
  "Beschwerde",
  "Rechnung",
  "Forderungsmanagement",
  "Praxissoftware",
  "Terminanfrage",
  "Labor",
  "Versicherung",
  "Werbung",
  "Spam",
  "Sonstiges",
];

const SPAM_KW = ["viagra", "casino", "lottery", "you won", "sie haben gewonnen", "bitcoin gewinn", "millionen gewonnen", "erbschaft"];
const WERBUNG_KW = ["newsletter", "abmelden", "unsubscribe", "sonderangebot", "rabatt", "gewinnspiel", "jetzt kaufen", "black friday", "webinar", "kostenlos testen", "exklusives angebot", "% sparen"];

// Category keyword rules — most specific first; first match wins.
// Keep keywords SPECIFIC: avoid words that appear in commercial Impressum
// footers (Amtsgericht, Registergericht, Rechtsanwalt, Geschäftsführer) or PC/IT
// ads (Server, Prozessor, Update) — those caused false "Klage"/"Software" hits.
const RULES = [
  { cat: "Gerichtliche Klage", kw: ["klage", "klageschrift", "klageerhebung", "mahnbescheid", "vollstreckungsbescheid", "gerichtsverfahren", "einstweilige verfügung", "klageandrohung", "gerichtlich geltend"] },
  { cat: "Forderungsmanagement", kw: ["inkasso", "zahlungserinnerung", "offene posten", "letzte mahnung", "zahlungsverzug", "mahnverfahren", "1. mahnung", "2. mahnung"] },
  { cat: "Rechnung", kw: ["rechnung", "rechnungsnr", "kostenvoranschlag", "heil- und kostenplan", "hkp", "honorarrechnung", "zahlungsbeleg", "rechnungsbetrag"] },
  { cat: "Beschwerde", kw: ["beschwerde", "unzufrieden", "reklamation", "schlecht behandelt", "fehler bei der behandlung", "kunstfehler", "falschbehandlung"] },
  { cat: "Terminanfrage", kw: ["termin", "terminwunsch", "termin verschieben", "termin absagen", "termin vereinbaren", "früheren termin", "terminbestätigung"] },
  { cat: "Labor", kw: ["zahnersatz", "laborauftrag", "laborkosten", "zahnkrone", "zahnbrücke", "prothese", "zirkon", "modellguss", "dentallabor"] },
  { cat: "Versicherung", kw: ["krankenkasse", "beihilfe", "kostenübernahme", "kostenerstattung", "private krankenversicherung", "zahnzusatzversicherung", "leistungsantrag"] },
  { cat: "Praxissoftware", kw: ["praxisverwaltung", "praxissoftware", "datev", "charly", "dampsoft", "evident dental", "z1.pro", "kzv-abrechnung"] },
];

// Strong "the practice should react" signals (used when no strong category hit).
const RELEVANT_KW = ["patient", "patientin", "überweis", "befund", "röntgen", "schmerz", "termin", "rechnung", "beschwerde", "rückruf", "anfrage", "frage", "bitte um", "labor", "krankenkasse", "rezept", "attest", "behandlung"];

const STRONG_CATEGORIES = ["Gerichtliche Klage", "Beschwerde", "Rechnung", "Forderungsmanagement", "Praxissoftware", "Terminanfrage", "Labor", "Versicherung"];

// Categories that must always be handled — they win even over ad signals.
const SERIOUS_CATEGORIES = ["Gerichtliche Klage", "Forderungsmanagement", "Rechnung", "Beschwerde", "Versicherung"];
const AD_SENDER_RE = /no-?reply|newsletter|mailing|marketing|notification|\bshop\b|\bsales?\b|info@|news@/;

const low = (s) => String(s || "").toLowerCase();

// Word-boundary aware match so "gericht" does NOT match inside "ausgerichtet".
// Phrases (with spaces) and tokens containing punctuation fall back to substring.
function hasWord(haystack, kw) {
  if (kw.includes(" ")) return haystack.includes(kw);
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zäöüß0-9])${esc}([^a-zäöüß0-9]|$)`, "i").test(haystack);
}

/** Deterministic, no-network classification. */
export function classifyByKeywords({ subject = "", fromAddress = "", text = "" } = {}) {
  const h = `${low(subject)}\n${low(text)}`;
  const fromL = low(fromAddress);

  if (SPAM_KW.some((k) => hasWord(h, k))) {
    return { category: "Spam", relevant: false, relevanceReason: "Spam – keine Antwort empfohlen" };
  }

  let category = "Sonstiges";
  for (const r of RULES) {
    if (r.kw.some((k) => hasWord(h, k))) { category = r.cat; break; }
  }

  // Werbung/Newsletter wins unless it's a serious must-handle category — so a
  // promo that happens to mention "Termin" is still treated as advertising.
  const looksAd = WERBUNG_KW.some((k) => hasWord(h, k)) || AD_SENDER_RE.test(fromL);
  if (looksAd && !SERIOUS_CATEGORIES.includes(category)) {
    return { category: "Werbung", relevant: false, relevanceReason: "Werbung/Newsletter – keine Antwort nötig" };
  }

  const strong = STRONG_CATEGORIES.includes(category);
  const relevant = strong || RELEVANT_KW.some((k) => hasWord(h, k));
  return {
    category,
    relevant,
    relevanceReason: relevant
      ? (strong ? `${category} – Antwort empfohlen` : "Praxisrelevant")
      : "Vermutlich keine Antwort nötig",
  };
}

// Keyword refinements for signals the category alone can miss (e.g. an
// appointment request inside an otherwise "Sonstiges" mail). Word-boundary
// aware via hasWord(); phrases match as substrings.
const SIGNAL_KW = Object.freeze({
  appointmentRequest: ["termin", "verschieben", "absagen", "vereinbaren", "verschiebung", "terminwunsch", "umbuchen"],
  callbackRequested: ["rückruf", "zurückrufen", "rufen sie", "callback", "telefonisch erreichen", "bitte anrufen"],
  documentRelated: ["unterlagen", "befund", "röntgenbild", "attest", "bescheinigung", "dokument", "rezept", "überweisung", "bericht"],
  billingQuestion: ["rechnung", "betrag", "zahlung", "kosten", "hkp", "kostenvoranschlag", "mahnung", "inkasso", "erstattung"],
  complaintStated: ["beschwerde", "unzufrieden", "reklamation", "schlecht behandelt", "ärgerlich", "enttäuscht", "kunstfehler"],
});

// Map the dominant category onto the strongest, must-handle signal.
const CATEGORY_SIGNALS = Object.freeze({
  "Beschwerde": { complaintStated: true },
  "Gerichtliche Klage": { complaintStated: true, needsHuman: true },
  "Forderungsmanagement": { billingQuestion: true, needsHuman: true },
  "Rechnung": { billingQuestion: true },
  "Terminanfrage": { appointmentRequest: true },
  "Labor": { documentRelated: true },
  "Versicherung": { documentRelated: true },
});

/**
 * Translate a mail classification (category + text) into shared-brain signals,
 * so the matter threads onto the right Vorgang topic and reaches the right role
 * in the briefing. Pure and additive — returns a plain flags object that
 * buildEvent/normalizeSignals understands.
 *
 * @param {{ category?: string, subject?: string, text?: string }} input
 * @returns {Record<string, boolean>}
 */
export function deriveMailSignals({ category = "", subject = "", text = "" } = {}) {
  const signals = { ...(CATEGORY_SIGNALS[category] || {}) };
  const h = `${low(subject)}\n${low(text)}`;
  for (const [sig, kws] of Object.entries(SIGNAL_KW)) {
    if (kws.some((k) => hasWord(h, k))) signals[sig] = true;
  }
  return signals;
}

const SYS = [
  "Du klassifizierst eingehende E-Mails einer deutschen Zahnarztpraxis.",
  "Antworte AUSSCHLIESSLICH mit JSON in genau diesem Format:",
  '{"category":"…","relevant":true,"reason":"kurzer Grund"}.',
  "category ist GENAU eine von: " + CATEGORY_LABELS.join(", ") + ".",
  "relevant=true, wenn die Praxis antworten oder handeln sollte; relevant=false bei Werbung, Newslettern oder Spam.",
  "reason ist ein kurzer deutscher Halbsatz.",
].join(" ");

/** On-demand LLM refinement. Returns null if the model is unreachable. */
export async function classifyWithLLM({ subject = "", fromAddress = "", text = "" } = {}) {
  const user = `Absender: ${fromAddress}\nBetreff: ${subject}\n\nInhalt:\n${String(text).slice(0, 2500)}`;
  const res = await chat(
    [{ role: "system", content: SYS }, { role: "user", content: user }],
    { temperature: 0, maxTokens: 200, model: process.env.MAS_CLASSIFY_MODEL || undefined, timeoutMs: 30000 }
  );
  if (!res.ok) return null;
  const m = res.text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const category = CATEGORY_LABELS.find((c) => c.toLowerCase() === low(o.category)) || "Sonstiges";
    const relevant = !!o.relevant;
    return {
      category,
      relevant,
      relevanceReason: String(o.reason || "").slice(0, 160) || (relevant ? "Praxisrelevant" : "Keine Antwort nötig"),
    };
  } catch {
    return null;
  }
}
