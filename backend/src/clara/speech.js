// Sprech-Hilfen fuer Claras Briefings: (1) deterministische Formulierungs-
// Varianten, damit die Texte nicht nach Schema F klingen, und (2) klinische
// Rueckschluesse aus Anamnese-Befunden als ERINNERUNG an den behandelnden
// Arzt (interner Assistent) — nie patientengerichtet, nie ueber die Regel-
// Tabelle hinaus erfunden. Reine Logik, keine Netzaufrufe.

// FNV-1a-Hash: stabiler Seed aus einem String (z. B. patientId + Datum),
// damit die Wortwahl innerhalb EINES Anrufs stabil, aber ueber Patienten/Tage
// hinweg abwechslungsreich ist.
function seedHash(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Waehlt deterministisch EINE Formulierung aus mehreren gleichwertigen aus.
 * Leere Liste -> "", ein Element -> dieses. Ohne Seed rein zufaellig.
 * @param {string[]} variants
 * @param {string} [seed]
 * @returns {string}
 */
export function pick(variants, seed) {
  const arr = Array.isArray(variants) ? variants.filter((v) => v != null && v !== "") : [];
  if (!arr.length) return "";
  if (arr.length === 1) return arr[0];
  const idx = seed ? seedHash(seed) % arr.length : Math.floor(Math.random() * arr.length);
  return arr[idx];
}

// ============================================================================
// vary() — Formulierungs-Variation gegen den "Schema F"-Klang (05.07.2026).
//
// Chef-Anforderung: deterministische Ansagen klingen steif, JEDES Mal gleich.
// Die Sprech-Baukaesten (Anamnese, Patienten-Termine, freie Slots, Heads-up)
// halten deshalb pro Situation einen Pool aus >= 10 Formulierungen vor, die
// ZEHN verschiedene ANSAETZE mischen:
//
//   1. Kollegial-direkt   ("Kurz zur Anamnese von X: ...")
//   2. Warm-persoenlich   ("Ich habe fuer dich in den Bogen geschaut ...")
//   3. Leichter Humor     (NUR bei guten/neutralen Nachrichten — nie ueber
//                          Befunde, Diagnosen oder Patienten)
//   4. Bild/Metapher      ("Der Bogen hat ein paar Stellen markiert ...")
//   5. Entwarnung zuerst  ("Gute Nachricht: alles unauffaellig ...")
//   6. Prioritaet zuerst  ("Wichtig fuer die Behandlung: ...")
//   7. Frage-Anschluss    (endet mit natuerlicher Rueckfrage)
//   8. Kurz und knapp     (Telegrammstil, aber ganze Saetze)
//   9. Erzaehlerisch      ("Ich habe den Bogen durchgesehen — dabei ...")
//  10. Zupackend/Coach    ("Denk bei der Behandlung an ...")
//
// vary() zieht ZUFAELLIG aus dem Pool und merkt sich pro Schluessel die
// letzten Griffe — dieselbe Formulierung kommt also nicht zweimal
// hintereinander (Anti-Wiederholung, prozessweit). Fakten stehen NIE im
// Pool-Text, sondern werden vom Aufrufer eingesetzt — die Variation kann
// deshalb nichts erfinden. Humor-Leitplanke wie in humor.js: die Sprueche
// entstehen hier im Code, nicht im LLM — halluzinationsfrei und testbar.
// ============================================================================

const _lastVaryPicks = new Map();

/**
 * Zieht eine Formulierung aus dem Pool und vermeidet die zuletzt benutzten
 * (pro Schluessel). Leere Liste -> "", ein Element -> dieses.
 * @param {string} key   Situations-Schluessel (z. B. "anamnese.befunde")
 * @param {string[]} variants
 * @returns {string}
 */
export function vary(key, variants) {
  const arr = Array.isArray(variants) ? variants.filter((v) => v != null && v !== "") : [];
  if (!arr.length) return "";
  if (arr.length === 1) return arr[0];
  const memory = _lastVaryPicks.get(key) || [];
  const avoid = new Set(memory);
  let idx = Math.floor(Math.random() * arr.length);
  for (let i = 0; i < 8 && avoid.has(idx) && avoid.size < arr.length; i++) {
    idx = Math.floor(Math.random() * arr.length);
  }
  memory.push(idx);
  // Bis zu 3 letzte Griffe sperren (nie mehr als Poolgroesse - 1).
  while (memory.length > Math.min(3, arr.length - 1)) memory.shift();
  _lastVaryPicks.set(key, memory);
  return arr[idx];
}

// Klinische Entscheidungs-Hinweise fuer den Zahnarzt, deterministisch aus den
// Anamnese-Befunden abgeleitet. Bewusst als "erwaegen/pruefen" formuliert —
// Clara erinnert, ordnet nichts an und erfindet nichts.
const CLINICAL_RULES = [
  { re: /bluthochdruck|hyperton|hoher blutdruck/i, hint: "bei der Lokalanästhesie ein adrenalinfreies Mittel erwägen" },
  { re: /marcumar|falithrom|phenprocoumon|xarelto|rivaroxaban|eliquis|apixaban|pradaxa|dabigatran|edoxaban|lixiana|clopidogrel|plavix|blutverd|gerinnungshemm/i, hint: "Blutungsrisiko — vor einem chirurgischen Eingriff Rücksprache bzw. Gerinnungswert prüfen" },
  { re: /\bass\b|aspirin|acetylsalicyl/i, hint: "ASS/Blutverdünnung — erhöhtes Blutungsrisiko beachten" },
  { re: /penicillin|amoxicillin/i, hint: "kein Penicillin oder Amoxicillin — auf ein Alternativpräparat ausweichen" },
  { re: /latex/i, hint: "latexfreie Handschuhe und Materialien verwenden" },
  { re: /schwanger/i, hint: "Röntgen möglichst vermeiden, Anästhetika und Medikamente schwangerschaftsgerecht wählen" },
  { re: /bisphosphonat|zoledron|zolendron|denosumab|prolia|antiresorpt/i, hint: "Antiresorptiva/Bisphosphonate — Kiefernekrose-Risiko bei Extraktionen bedenken" },
  { re: /diabet/i, hint: "Diabetes — möglichst kurzer Vormittagstermin, erhöhtes Infektions- und Heilungsrisiko" },
  { re: /herzschrittmacher|schrittmacher|defibrillator|\bicd\b/i, hint: "Herzschrittmacher/ICD — bei bestimmten Geräten Vorsicht mit dem Elektrotom" },
  { re: /endokarditis|herzklappe|klappenersatz|klappenfehler/i, hint: "Endokarditisprophylaxe prüfen" },
  { re: /epileps/i, hint: "Epilepsie — Anfallsrisiko, Stress und Trigger gering halten" },
  { re: /hepatitis|hiv|mrsa|infekt/i, hint: "erhöhter Infektionsschutz angezeigt" },
];

/**
 * Leitet klinische Hinweise aus Anamnese-Befunden ab.
 * @param {{category?:string, text?:string}[]} findings
 * @returns {string[]} de-duplizierte Hinweis-Saetze
 */
export function clinicalHints(findings) {
  const lines = (Array.isArray(findings) ? findings : [])
    .map((f) => `${f?.category || ""} ${f?.text || ""}`.toLowerCase());
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    for (const rule of CLINICAL_RULES) {
      if (rule.re.test(line) && !seen.has(rule.hint)) {
        seen.add(rule.hint);
        out.push(rule.hint);
      }
    }
  }
  return out;
}
