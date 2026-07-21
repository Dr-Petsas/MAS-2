// Lena Doku-Template Zahnmedizin — Server-Katalog + LLM-Feld-Fill (W-LENA-8b).
// Keys/Bloecke MUESSEN mit public/m/lena-doku-template-zahn.js synchron bleiben.
// Heuristik bleibt Client-Schnellpfad; hier: qwen JSON-Extraktion + additives Merge.

import { chat } from "../mail/llm.js";

export const TEMPLATE_ID = "zahnmedizin";

export const BASE_FIELDS = [
  "anlass", "anamnese", "zaehne", "befund", "diagnose", "therapie",
  "aufklaerung", "komplikationen", "procedere",
];

export const BLOCKS = [
  { id: "planwechsel", fields: ["plan_geplant", "plan_durchgefuehrt", "plan_zustimmung"] },
  { id: "la", fields: ["la_mittel", "la_region"] },
  { id: "fuellung", fields: ["fuellung_material", "fuellung_flaechen"] },
  { id: "endo", fields: ["endo_kanaele"] },
  { id: "extraktion", fields: ["ex_zahn"] },
  { id: "bildgebung", fields: ["roe_region", "roe_indikation", "roe_befund"] },
];

export const BLOCK_IDS = BLOCKS.map((b) => b.id);
export const ALL_KEYS = [
  ...BASE_FIELDS,
  ...BLOCKS.flatMap((b) => b.fields),
];

const KEY_SET = new Set(ALL_KEYS);
const BLOCK_SET = new Set(BLOCK_IDS);

/** Pflichtluecken — wie Client applySegments. */
export function computeGaps(values, openBlocks) {
  const status = {};
  for (const k of ALL_KEYS) {
    const v = String(values[k] || "").trim();
    status[k] = v ? "live" : "empty";
  }
  const need = ["befund", "diagnose", "therapie", "komplikationen", "procedere"];
  for (const k of need) {
    if (!String(values[k] || "").trim()) status[k] = "gap";
  }
  const open = openBlocks instanceof Set ? openBlocks : new Set(openBlocks || []);
  if (open.has("bildgebung")) {
    if (!String(values.roe_indikation || "").trim()) status.roe_indikation = "gap";
    if (!String(values.roe_region || "").trim()) status.roe_region = "gap";
  }
  if (open.has("planwechsel") && !String(values.plan_zustimmung || "").trim()) {
    status.plan_zustimmung = "gap";
  }
  // Prefills schuetzen
  if (String(values.anlass || "").trim() && status.anlass === "empty") status.anlass = "pre";
  if (String(values.plan_geplant || "").trim() && (status.plan_geplant === "empty" || status.plan_geplant === "gap")) {
    status.plan_geplant = "pre";
  }
  const gapCount = Object.keys(status).filter((k) => status[k] === "gap").length;
  return { status, gapCount };
}

/**
 * Additives Merge: laengere/neue Klinik gewinnt; plan_geplant und pre nie schrumpfen.
 * openBlocks = Union. teeth = Union.
 */
export function mergeTemplateFields(existing, incoming, { anlass = "" } = {}) {
  const prev = existing && typeof existing === "object" ? existing : {};
  const next = incoming && typeof incoming === "object" ? incoming : {};
  const values = {};
  for (const k of ALL_KEYS) values[k] = "";

  const prevVals = prev.values && typeof prev.values === "object" ? prev.values : {};
  const nextVals = next.values && typeof next.values === "object" ? next.values : {};
  const prevStatus = prev.status && typeof prev.status === "object" ? prev.status : {};

  for (const k of ALL_KEYS) {
    const a = String(prevVals[k] || "").trim();
    const b = String(nextVals[k] || "").trim();
    if (k === "plan_geplant") {
      // Additiv: geplant bleibt — nie ueberschreiben wenn schon gesetzt.
      values[k] = a || b || String(anlass || prev.anlass || "").trim();
      continue;
    }
    if (k === "anlass") {
      values[k] = a || b || String(anlass || prev.anlass || "").trim();
      continue;
    }
    if (prevStatus[k] === "pre" && a) {
      // Prefill nur ergaenzen, nicht ersetzen
      if (b && !a.toLowerCase().includes(b.toLowerCase()) && b.length > a.length) values[k] = b;
      else values[k] = a;
      continue;
    }
    if (!a) values[k] = b;
    else if (!b) values[k] = a;
    else if (a.toLowerCase().includes(b.toLowerCase())) values[k] = a;
    else if (b.toLowerCase().includes(a.toLowerCase()) || b.length > a.length) values[k] = b;
    else values[k] = a + (a.endsWith(".") ? " " : ". ") + b;
  }

  const openBlocks = new Set([
    ...(Array.isArray(prev.openBlocks) ? prev.openBlocks : []),
    ...(Array.isArray(next.openBlocks) ? next.openBlocks : []),
  ].filter((id) => BLOCK_SET.has(id)));

  // Planwechsel nur behalten wenn Incoming ihn oeffnet ODER schon offen + Inhalt
  if (!openBlocks.has("planwechsel")) {
    // ok
  } else if (
    !(Array.isArray(next.openBlocks) && next.openBlocks.includes("planwechsel"))
    && !(Array.isArray(prev.openBlocks) && prev.openBlocks.includes("planwechsel"))
  ) {
    openBlocks.delete("planwechsel");
  }

  const teeth = new Set();
  for (const t of [...(prev.teeth || []), ...(next.teeth || [])]) {
    const n = Number(t);
    if (Number.isFinite(n) && n >= 11 && n <= 48) teeth.add(n);
  }
  // FDI aus zaehne-Text
  const zm = String(values.zaehne || "").match(/\b([1-4][1-8])\b/g);
  if (zm) for (const m of zm) teeth.add(Number(m));

  if (teeth.size && !values.zaehne) {
    values.zaehne = "Zahn " + [...teeth].sort((a, b) => a - b).join(", ");
  }

  const a = String(anlass || prev.anlass || values.anlass || "").trim();
  if (a && !values.anlass) values.anlass = a;
  if (a && !values.plan_geplant) values.plan_geplant = a;

  const { status, gapCount } = computeGaps(values, openBlocks);
  // Prefill-Status fuer anlass/plan_geplant
  if (values.anlass) status.anlass = prevStatus.anlass === "pre" || !nextVals.anlass ? "pre" : (status.anlass === "gap" ? "pre" : status.anlass);
  if (values.plan_geplant && (!nextVals.plan_geplant || prevStatus.plan_geplant === "pre")) {
    status.plan_geplant = "pre";
  }
  for (const k of ALL_KEYS) {
    if (String(values[k] || "").trim() && status[k] === "empty") status[k] = "live";
  }

  return {
    templateId: TEMPLATE_ID,
    anlass: a,
    values,
    status,
    openBlocks: [...openBlocks],
    teeth: [...teeth].sort((x, y) => x - y),
    gapCount,
  };
}

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* weiter */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* weiter */ }
  }
  return null;
}

function sanitizeLlmPayload(parsed) {
  const values = {};
  for (const k of ALL_KEYS) values[k] = "";
  const src = parsed?.values && typeof parsed.values === "object" ? parsed.values : parsed || {};
  for (const k of ALL_KEYS) {
    if (typeof src[k] === "string") values[k] = src[k].trim().slice(0, 800);
  }
  let openBlocks = Array.isArray(parsed?.openBlocks)
    ? parsed.openBlocks.filter((id) => BLOCK_SET.has(String(id)))
    : [];
  // Planwechsel nur wenn LLM ihn explizit oeffnet UND Entscheidungssprache/Inhalt
  const planOpen = openBlocks.includes("planwechsel");
  const hasDecision =
    !!values.plan_durchgefuehrt
    || /verschieben|umentschieden|doch erst|stattdessen|plan[aä]nder|abweichen/i.test(
      Object.values(values).join(" "),
    );
  if (planOpen && !hasDecision && !values.plan_zustimmung) {
    openBlocks = openBlocks.filter((id) => id !== "planwechsel");
  }
  const teeth = Array.isArray(parsed?.teeth)
    ? parsed.teeth.map(Number).filter((n) => Number.isFinite(n) && n >= 11 && n <= 48)
    : [];
  return { values, openBlocks, teeth };
}

/**
 * qwen: Segmente -> Template-Felder (kein Umschreiben der Akte, nur Extraktion).
 * @param {Array<{text:string,source?:string}>} segs
 * @param {{ anlass?: string, existing?: object, timeoutMs?: number }} opts
 */
export async function llmExtractTemplateFields(segs, {
  anlass = "",
  existing = null,
  timeoutMs = 60000,
} = {}) {
  const lines = (segs || [])
    .map((s, i) => {
      const t = String(s.text || s.textCorrected || "").trim();
      if (!t) return "";
      const src = String(s.source || "").toLowerCase();
      const who = src === "arzt" ? "Arzt" : src === "raum" || src === "patient" ? "Patient" : "Praxis";
      return `[${i + 1}] (${who}) ${t.slice(0, 500)}`;
    })
    .filter(Boolean);
  if (!lines.length) return { ok: false, reason: "no_segments" };

  const keyList = ALL_KEYS.join(", ");
  const blockList = BLOCK_IDS.join(", ");
  const prevHint = existing?.values
    ? `\nBereits bekannte Felder (NICHT loeschen, nur ergaenzen):\n${JSON.stringify(existing.values).slice(0, 1500)}`
    : "";

  const messages = [
    {
      role: "system",
      content: [
        "Du fuellst ein zahnmedizinisches Behandlungs-Doku-Template aus einem Gespraechstranskript.",
        "Extrahiere NUR Fakten, die klar gesagt wurden. Erfinde nichts. Unbekannt = leerer String.",
        `Erlaubte Feld-Keys: ${keyList}.`,
        `Erlaubte openBlocks: ${blockList}.`,
        "Regeln:",
        "- Kurz und klinisch (Stichworte/kurze Saetze), kein Smalltalk.",
        "- zaehne: FDI-Nummern (11-48), z.B. \"Zahn 36, 37\".",
        "- therapie = was gemacht/entschieden wurde; befund/diagnose getrennt.",
        "- Sprachkommandos (\"Befund\", \"Befund Ende\", \"Therapie\" als Einzelwort)",
        "  sind Steuerwoerter des Arztes — NIE als Inhalt uebernehmen.",
        "- Nach dem Steuerwort \"Befund\" gehoeren diktierte Zahn-/Befundsaetze in",
        "  das Feld befund (auch Bestand wie alte Fuellungen/Kronen), bis eine",
        "  Behandlungs-HANDLUNG diktiert wird (exkaviert, anaesthesiert, gefuellt,",
        "  praepariert ...) — ab dort therapie.",
        "- Planwechsel (Block planwechsel) NUR bei klarer Entscheidungssprache",
        "  (umentschieden, doch erst, stattdessen, Plan aendern, Implantat verschieben …).",
        "  Optionen/Alternativen allein oeffnen KEENEN Planwechsel.",
        "- plan_geplant = urspruenglicher Termin-Anlass; NIEMALS durch neue Therapie ersetzen.",
        "- plan_durchgefuehrt = was heute stattdessen entschieden/gemacht wurde.",
        "- plan_zustimmung nur wenn Zustimmung aus dem Kontext klar ist (einverstanden, ja machen …).",
        "- Bloecke la/fuellung/endo/extraktion/bildgebung nur oeffnen wenn Inhalt dazu da ist.",
        'Antworte NUR mit JSON: {"values":{...alle keys...},"openBlocks":["la"],"teeth":[36]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Anlass/Termin: ${anlass || "(unbekannt)"}`,
        prevHint,
        "",
        `Segmente (${lines.length}):`,
        lines.join("\n"),
      ].filter(Boolean).join("\n"),
    },
  ];

  const res = await chat(messages, {
    temperature: 0,
    maxTokens: 1800,
    timeoutMs,
  });
  if (!res.ok) return { ok: false, reason: res.reason || "llm" };

  const parsed = extractJson(res.text);
  if (!parsed) return { ok: false, reason: "llm_bad_json" };

  const clean = sanitizeLlmPayload(parsed);
  // Guard: leere values ohne Bloecke = nutzlos
  const any = ALL_KEYS.some((k) => clean.values[k]);
  if (!any && !clean.openBlocks.length) return { ok: false, reason: "llm_empty" };

  const merged = mergeTemplateFields(existing, clean, { anlass });
  return { ok: true, fields: merged, model: res.model || "qwen" };
}

/** Serialisierbar fuer Firestore / Heartbeat (keine Set/undefined). */
export function serializeTemplateFields(fields, { model = "", updatedBy = "mas-lena" } = {}) {
  if (!fields) return null;
  return {
    templateId: TEMPLATE_ID,
    anlass: String(fields.anlass || ""),
    values: { ...fields.values },
    status: { ...fields.status },
    openBlocks: Array.isArray(fields.openBlocks) ? fields.openBlocks : [],
    teeth: Array.isArray(fields.teeth) ? fields.teeth : [],
    gapCount: Number(fields.gapCount) || 0,
    model: model || fields.model || "",
    updatedBy,
  };
}

const FIELD_LABELS = {
  anlass: "Anlass",
  anamnese: "Anamnese",
  zaehne: "Zähne",
  befund: "Befund",
  diagnose: "Diagnose",
  therapie: "Therapie",
  aufklaerung: "Aufklärung",
  komplikationen: "Komplikationen",
  procedere: "Procedere",
  plan_geplant: "Geplant",
  plan_durchgefuehrt: "Durchgeführt",
  plan_zustimmung: "Zustimmung",
  la_mittel: "LA Wirkstoff / Menge",
  la_region: "LA Region",
  fuellung_material: "Füllung Material",
  fuellung_flaechen: "Füllung Flächen",
  endo_kanaele: "Endo Kanäle / Medikation",
  ex_zahn: "Extraktion",
  roe_region: "Röntgen Region",
  roe_indikation: "Röntgen Indikation",
  roe_befund: "Röntgenbefund",
};

const BLOCK_TITLES = {
  planwechsel: "PLANÄNDERUNG",
  la: "LOKALANÄSTHESIE",
  fuellung: "FÜLLUNG / RESTAURATION",
  endo: "ENDODONTIE",
  extraktion: "EXTRAKTION",
  bildgebung: "BILDGEBUNG",
};

/**
 * W-LENA-8c: bestaetigtes Template -> Akte-Plaintext (structuredText).
 * Keine Ziffern — nur klinische Felder + optionales Nachdiktat.
 */
export function toStructuredTextFromFields(fields, { nachdiktatLines = [] } = {}) {
  if (!fields || typeof fields !== "object") return "";
  const values = fields.values && typeof fields.values === "object" ? fields.values : {};
  const open = new Set(Array.isArray(fields.openBlocks) ? fields.openBlocks : []);
  const lines = ["DOKU-TEMPLATE ZAHNMEDIZIN", ""];
  const push = (key, indent = "") => {
    const v = String(values[key] || "").trim();
    if (!v) return;
    lines.push(indent + (FIELD_LABELS[key] || key) + ": " + v);
  };

  for (const k of ["anlass", "anamnese", "zaehne", "befund", "diagnose", "therapie"]) push(k);

  for (const b of BLOCKS) {
    if (!open.has(b.id)) continue;
    const any = b.fields.some((k) => String(values[k] || "").trim());
    if (!any && b.id !== "planwechsel") continue;
    lines.push(BLOCK_TITLES[b.id] || b.id.toUpperCase());
    for (const k of b.fields) push(k, "  ");
  }

  for (const k of ["aufklaerung", "komplikationen", "procedere"]) push(k);

  const nd = (nachdiktatLines || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (nd.length) {
    lines.push("");
    lines.push("NACHDIKTAT");
    for (const t of nd) lines.push("- " + t);
  }

  return lines.join("\n").trim().slice(0, 40000);
}

/**
 * Abrechnungshinweise aus Template-Feldern — KEINE Ziffern-Festlegung.
 * Sophie bleibt die Instanz fuer BEMA/GOZ-Codes; hier nur Richtungshinweise.
 */
export function billingHintsFromFields(fields) {
  if (!fields || typeof fields !== "object") return [];
  const values = fields.values && typeof fields.values === "object" ? fields.values : {};
  const open = new Set(Array.isArray(fields.openBlocks) ? fields.openBlocks : []);
  const status = fields.status && typeof fields.status === "object" ? fields.status : {};
  const hints = [];
  const has = (k) => !!String(values[k] || "").trim();

  if (open.has("la") || has("la_mittel") || has("la_region")) {
    hints.push("Lokalanästhesie dokumentiert — Sophie prüft BEMA 40/41a bzw. GOZ 0090/0100 (Leitung vs. Infiltration).");
  }
  if (open.has("fuellung") || has("fuellung_material") || has("fuellung_flaechen")) {
    const fl = String(values.fuellung_flaechen || "").trim();
    hints.push(
      "Füllung/Restauration dokumentiert"
      + (fl ? ` (Flächen ${fl})` : "")
      + " — Sophie prüft BEMA 13a–d / GOZ 2060ff je Fläche; Material nicht als Ziffer erfinden.",
    );
  }
  if (open.has("endo") || has("endo_kanaele")) {
    hints.push("Endodontie dokumentiert — Sophie prüft BEMA 32–35 / GOZ 2360ff; Kanalanzahl aus Doku übernehmen.");
  }
  if (open.has("extraktion") || has("ex_zahn")) {
    hints.push("Extraktion dokumentiert — Sophie prüft BEMA 43ff / GOZ 3000ff; Osteotomie nur wenn klar beschrieben.");
  }
  if (open.has("bildgebung") || has("roe_region") || has("roe_indikation")) {
    hints.push("Bildgebung dokumentiert — Indikation/Befund für StrlSchG; Sophie prüft BEMA Ä925a / GOZ 5000ff.");
  }
  if (open.has("planwechsel") || has("plan_durchgefuehrt")) {
    hints.push("Planänderung — geplante vs. durchgeführte Leistung für die Abrechnung getrennt halten; keine Doppelabrechnung.");
  }
  if (has("therapie") && !open.has("fuellung") && !open.has("endo") && !open.has("extraktion")) {
    hints.push("Therapie freitextlich dokumentiert — Sophie leitet Ziffern nur aus belegten Leistungen ab.");
  }

  // Luecken als Sophie-Rueckfragen (keine Codes)
  const gapLabels = {
    befund: "Befund fehlt noch für die Akte",
    diagnose: "Diagnose fehlt noch",
    therapie: "Therapie/Leistung fehlt noch",
    komplikationen: "Komplikationen (oder „keine“) fehlen",
    procedere: "Procedere/Wiedervorstellung fehlt",
    roe_indikation: "Rechtfertigende Indikation (Röntgen) fehlt",
    roe_region: "Röntgen-Region fehlt",
    plan_zustimmung: "Zustimmung zur Planänderung fehlt im Kontext",
  };
  for (const [k, msg] of Object.entries(gapLabels)) {
    if (status[k] === "gap" || (!has(k) && ["befund", "diagnose", "therapie", "komplikationen", "procedere"].includes(k))) {
      if (status[k] === "gap") hints.push("Offen: " + msg);
    }
  }

  // Dedup + cap
  const seen = new Set();
  const out = [];
  for (const h of hints) {
    const key = h.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * structuredText + Hinweise fuer Persistenz / wiz5.
 * @returns {{ structuredText: string, billingHints: string[], source: "template"|"empty" }}
 */
export function composeStructuredFromTemplate(fields, { nachdiktatLines = [], includeHints = true } = {}) {
  const body = toStructuredTextFromFields(fields, { nachdiktatLines });
  if (!body) return { structuredText: "", billingHints: [], source: "empty" };
  const billingHints = billingHintsFromFields(fields);
  let structuredText = body;
  if (includeHints && billingHints.length) {
    structuredText = [
      body,
      "",
      "ABRECHNUNGSHINWEISE (keine Ziffern — Sophie entscheidet)",
      ...billingHints.map((h) => "- " + h),
    ].join("\n").slice(0, 40000);
  }
  return { structuredText, billingHints, source: "template" };
}
