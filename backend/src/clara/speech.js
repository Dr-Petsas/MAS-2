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
