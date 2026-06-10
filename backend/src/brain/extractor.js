import { SIGNAL_FLAGS } from "./events.js";

// ============================================================================
// Signal extractor: call transcript -> brain event (signals + attributed
// summary + confidence). This is what turns a raw Bianca/Clara conversation
// into something the briefing can reason about ("Patient sagt, er sei zum 5.
// Mal hier").
//
// v1 is DETERMINISTIC and high-precision: German keyword/intent rules over the
// patient's (user) turns. Deterministic means: no GPU dependency, fully
// testable, and it never invents content — every signal is backed by a quote.
// A local-LLM refinement pass can be layered in later via `opts.refine` without
// changing this contract.
//
// We REPORT what was said (content), we do not diagnose mood. `sentiment` is the
// only soft hint and stays conservative.
// ============================================================================

// Accepts the v5.2 transcript manifest ({turns:[{role,text}]}), a bare array of
// turns, or a plain string. Returns the patient (user) text and the full text.
function normalizeTranscript(input) {
  let turns = [];
  if (typeof input === "string") {
    turns = [{ role: "user", text: input }];
  } else if (Array.isArray(input)) {
    turns = input;
  } else if (input && Array.isArray(input.turns)) {
    turns = input.turns;
  }
  const userTurns = turns.filter((t) => (t?.role || "user") === "user").map((t) => String(t.text || ""));
  const allTurns = turns.map((t) => `${t?.role || ""}: ${String(t?.text || "")}`);
  return {
    turnCount: turns.length,
    userText: userTurns.join("\n"),
    fullText: allTurns.join("\n"),
    endReason: input && typeof input === "object" ? String(input.end_reason || input.endReason || "") : "",
  };
}

// Umlaut/ß folding to ASCII. STT and typed input arrive both as proper umlauts
// ("Rückruf") and as transliterations ("Rueckruf") — folding BOTH text and
// patterns to a single ASCII form makes matching robust to either. This was a
// real miss before: "Rueckruf" didn't match /rückruf/.
export function fold(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

// Each rule: a signal flag + the German patterns that evidence it + a spoken
// fragment for the summary. Patterns are written in FOLDED ASCII form and
// matched against folded text. Intentionally narrow to keep PRECISION high (we
// would rather miss than mislabel).
const RULES = [
  {
    flag: "callbackRequested",
    fragment: "bittet um Rückruf",
    patterns: [/\brueckruf\b/, /\bzurueck\s*(?:zu\s*)?rufen\b/, /\brufen sie mich\b/, /\brufen sie zurueck\b/, /\bmelden sie sich\b/, /\bsoll(?:en sie)? .{0,20}\bzurueckrufen\b/],
  },
  {
    flag: "billingQuestion",
    fragment: "hat eine Frage zur Rechnung/Kosten",
    patterns: [
      /\brechnung\b/,
      /\bkostenvoranschlag\b/,
      /\bzuzahlung\b/,
      /\bwas kostet\b/,
      /\bkosten\b/,
      /\bheil-?\s*und\s*kostenplan\b/,
      /\bhkp\b/,
      /\bbezahl/,
      /\beuro\b/,
    ],
  },
  {
    flag: "appointmentRequest",
    fragment: "möchte einen Termin (buchen/verschieben/absagen)",
    // "termin" without a leading boundary so compounds match: Kontrolltermin,
    // Zahnarzttermin, Wunschtermin. Plus "etwas frei?" / "vorbeikommen".
    patterns: [/termin/, /\bverschieben\b/, /\babsagen\b/, /\bverlegen\b/, /\bumbuchen\b/, /\bvereinbaren\b/, /\b(?:etwas|noch|was)\s+frei\b/, /\bvorbeikommen\b/, /\bvorbei kommen\b/],
  },
  {
    flag: "painPersists",
    fragment: "berichtet anhaltende Schmerzen",
    patterns: [
      /\bschmerz/,
      /\btut.{0,12}\bweh\b/,
      /\bweh\b/,
      /\bimmer noch\b.{0,20}\bweh\b/,
      /\bpocht\b/,
      /\bentzuendet\b/,
      /\bzahn.{0,6}weh\b/,
    ],
  },
  {
    flag: "repeatVisitStated",
    fragment: "sagt, mehrfach da gewesen zu sein",
    patterns: [
      /\bzum\s+(?:zweiten|dritten|vierten|fuenften|sechsten|siebten|\d+\.?)\s*mal\b/,
      /\b(?:zweites|drittes|viertes|fuenftes)\s+mal\b/,
      /\bschon (?:mehrfach|wieder|mehrmals|oefter)\b/,
      /\bnochmal(?:s)? (?:hier|da)\b/,
      /\bschon wieder\b/,
      /\b(?:zwei|drei|vier|fuenf|sechs)mal\b/,
    ],
  },
  {
    flag: "complaintStated",
    fragment: "äußert eine Beschwerde/Unzufriedenheit",
    patterns: [/\bbeschwer/, /\bunzufrieden\b/, /\baerger\b/, /\bunverschaemt\b/, /\bfrechheit\b/, /\bwarte seit\b/, /\bskandal\b/, /\bkatastrophe\b/, /\beine zumutung\b/],
  },
  {
    flag: "documentRelated",
    fragment: "benötigt Unterlagen/Dokument",
    patterns: [/\battest\b/, /\bbescheinigung\b/, /\bformular\b/, /\bunterlagen\b/, /\bkrankschreibung\b/, /\brezept\b/, /\bueberweisung\b/, /\bbefund\b/],
  },
  {
    flag: "needsHuman",
    fragment: "möchte persönlich mit der Praxis sprechen",
    patterns: [/\becht(?:en|er)?\s+mensch/, /\bmit (?:jemandem|einem menschen|einem mitarbeiter|einer mitarbeiterin)\b/, /\bmitarbeiter sprechen\b/, /\bverbinden sie mich\b/, /\bpersoenlich sprechen\b/],
  },
];

// "zum 5. Mal" -> 5. Used to enrich the summary ("zum 5. Mal"). Keys are folded.
const ORDINAL_WORDS = { zweiten: 2, zweites: 2, dritten: 3, drittes: 3, vierten: 4, viertes: 4, fuenften: 5, fuenftes: 5, sechsten: 6, sechstes: 6, siebten: 7 };

function detectRepeatCount(text) {
  const f = fold(text);
  const word = f.match(/\bzum\s+(zweiten|dritten|vierten|fuenften|sechsten|siebten)\s*mal\b/);
  if (word && ORDINAL_WORDS[word[1]] != null) return ORDINAL_WORDS[word[1]];
  const digit = f.match(/\bzum\s+(\d{1,2})\.?\s*mal\b/);
  if (digit) return Number(digit[1]);
  return null;
}

// Match against folded turns, but return the ORIGINAL turn text as the quote.
function firstQuote(userTurns, pattern) {
  for (const turn of userTurns) {
    if (pattern.test(fold(turn))) {
      const t = turn.trim();
      return t.length > 120 ? t.slice(0, 117) + "…" : t;
    }
  }
  return "";
}

const NEGATIVE_WORDS = [/\bwuetend\b/, /\bunverschaemt\b/, /\bfrechheit\b/, /\bekelhaft\b/, /\bschrecklich\b/, /\bnie wieder\b/, /\bbeschwer/, /\bskandal\b/, /\bkatastrophe\b/];

// Conservative caller-name extraction. We only pull a name when the speaker
// states it explicitly (precision over recall) — a wrong name is worse than
// none, because it would attach a call to the wrong patient. Relies on the STT
// keeping proper casing for names (it does in the v5.2 manifests).
// Trigger phrases are matched case-insensitively (STT may capitalise "Name");
// the captured name keeps its original casing. The bare "ich bin …" pattern
// stays case-SENSITIVE and needs two capitalised tokens, so "ich bin krank"
// or "ich bin total unzufrieden" never match.
const NAME_PATTERNS = [
  // "der Vorname Peter und der Nachname Mayer"
  { re: /\bvorname\s+([a-zäöüß-]+).{0,40}?\bnachname\s+([a-zäöüß-]+)/i, join: (m) => `${m[1]} ${m[2]}` },
  { re: /\bmein name ist\s+([a-zäöüß-]+(?:\s+[a-zäöüß-]+){0,1})/i, join: (m) => m[1] },
  { re: /\bich hei(?:ß|ss)e\s+([a-zäöüß-]+(?:\s+[a-zäöüß-]+){0,1})/i, join: (m) => m[1] },
  { re: /\bhier (?:ist|spricht)\s+([a-zäöüß-]+(?:\s+[a-zäöüß-]+){0,1})/i, join: (m) => m[1] },
  { re: /\bich bin\s+(?:der\s+|die\s+|herr\s+|frau\s+)?([A-ZÄÖÜ][a-zäöüß-]+\s+[A-ZÄÖÜ][a-zäöüß-]+)/, join: (m) => m[1] },
];

/**
 * Best-effort caller name from a transcript. Returns "" when not clearly stated.
 * @param {object|Array|string} transcript
 * @returns {string}
 */
// Words that follow a self-intro phrase but are NOT a person's name (a colleague
// calling: "hier ist die Praxis Dr. König"). Reject these so we don't create a
// junk ticket named "die Praxis"; such calls stay anonymous until properly
// handled as colleague calls.
const NAME_STOPWORDS = new Set(["praxis", "labor", "klinik", "firma", "team", "apotheke", "krankenkasse", "versicherung", "zentrale", "abteilung"]);

function looksLikeName(value) {
  const toks = fold(value).split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  return !toks.some((t) => NAME_STOPWORDS.has(t));
}

export function extractPatientName(transcript) {
  const { userText } = normalizeTranscript(transcript);
  for (const { re, join } of NAME_PATTERNS) {
    const m = userText.match(re);
    if (m) {
      const candidate = join(m).replace(/\s+/g, " ").trim();
      if (looksLikeName(candidate)) return candidate;
    }
  }
  return "";
}

/**
 * Extract a brain event payload from a transcript.
 *
 * @param {object|Array|string} transcript v5.2 manifest, turns array, or text
 * @param {object} [opts]
 * @param {Function} [opts.refine] optional async (draft, ctx) => draft — a
 *        local-LLM pass to refine summary/signals. Must keep the contract.
 * @returns {Promise<{signals:object, summary:string, confidence:number, evidence:object[]}>}
 */
export async function extractFromTranscript(transcript, opts = {}) {
  const { userText, fullText, endReason } = normalizeTranscript(transcript);
  const userTurns = userText.split("\n").filter(Boolean);
  const haystack = fold(userText);

  const signals = {};
  const fragments = [];
  const evidence = [];

  for (const rule of RULES) {
    const hit = rule.patterns.find((p) => p.test(haystack));
    if (hit) {
      signals[rule.flag] = true;
      let fragment = rule.fragment;
      if (rule.flag === "repeatVisitStated") {
        const n = detectRepeatCount(userText);
        if (n) fragment = `sagt, zum ${n}. Mal da gewesen zu sein`;
      }
      fragments.push(fragment);
      evidence.push({ flag: rule.flag, quote: firstQuote(userTurns, hit) });
    }
  }

  // Abort: only from an explicit hangup/disconnect end reason. We deliberately
  // avoid guessing "abort" from call length — a short call is not evidence of
  // anger, and a false "verärgert abgebrochen" would erode trust in the brain.
  if (/hangup|abort|disconnect|user_left|timeout/i.test(endReason)) {
    signals.abortedEarly = true;
  }

  // Conservative negative sentiment hint (only as a soft flag).
  let sentiment;
  const foldedFull = fold(fullText);
  if (NEGATIVE_WORDS.some((p) => p.test(foldedFull))) sentiment = "negative";
  if (sentiment) signals.sentiment = sentiment;

  // Confidence: rule-based caps at 0.85 (deterministic, but still extraction).
  const flagCount = SIGNAL_FLAGS.filter((f) => signals[f]).length;
  let confidence = flagCount === 0 ? 0.3 : Math.min(0.85, 0.55 + 0.1 * flagCount);

  // Attributed, human-verifiable summary. Always prefixed so a human knows this
  // is reported speech, not the practice's own assessment.
  let summary;
  if (fragments.length === 0) {
    summary = "Anruf ohne klar erkennbares Anliegen.";
  } else {
    const lead = evidence.find((e) => e.quote)?.quote;
    summary = `Laut Anruf: Patient ${fragments.join("; ")}.` + (lead ? ` („${lead}")` : "");
  }

  let draft = { signals, summary, confidence, evidence };

  if (typeof opts.refine === "function") {
    try {
      const refined = await opts.refine(draft, { userText, fullText });
      if (refined && typeof refined === "object") draft = { ...draft, ...refined };
    } catch {
      // refinement is best-effort; deterministic result stands on failure
    }
  }

  return draft;
}
