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

// ============================================================================
// Lockerheit 1-3 (W-HUMAN Stufe 2, Chef 09./10.07.2026): kleine warme Rahmen
// um den unantastbaren Fakten-Kern. Alles hier ist Code, kein LLM — die
// Fakten (Zahlen/Namen/Zeiten) stehen NIE in den Pools, nur drumherum.
// ============================================================================

/**
 * Zieht mit Wahrscheinlichkeit p eine vary()-Zeile, sonst "". Fuer kollegiale
 * Vor-/Nachsaetze, die NICHT jedes Mal kommen sollen (sonst neues Schema F).
 * @param {string} key
 * @param {string[]} variants
 * @param {number} [p=0.35]
 * @returns {string}
 */
export function maybe(key, variants, p = 0.35) {
  if (Math.random() >= p) return "";
  return vary(key, variants);
}

// Zahl-getriebene Reaktion auf die TAGES-Terminzahl (Lockerheit 2). Kommt
// NACH dem Fakten-Satz ("... 23 Termine ...") — die Zahl selbst bleibt
// woertlich, die Einordnung ist deterministisch aus derselben Zahl abgeleitet
// und kann darum nichts erfinden. Mittlere Tage (4-19) bleiben unkommentiert.
const DAY_LOAD_HIGH = [
  "Ein voller Tag.",
  "Da ist ordentlich was los.",
  "Ein straffes Programm.",
  "Das wird sportlich.",
  "Gut gebucht, würde ich sagen.",
  "Da kommt einiges zusammen.",
  "Der Tag ist dicht gepackt.",
  "Wenig Leerlauf heute.",
  "Da müssen Sie zügig bleiben.",
  "Ein richtiges Arbeitspensum.",
  "Durchatmen — der Kalender ist voll.",
  "Kein gemütlicher Tag, der hier.",
];
const DAY_LOAD_VERY_HIGH = [
  "Ein richtig voller Tag — tief durchatmen.",
  "Das ist sportlich, selbst für Sie.",
  "Volles Haus. Ich halte Ihnen den Rücken frei.",
  "Ein Marathon-Tag. Kaffee steht hoffentlich bereit.",
  "Das ist die Obergrenze — ich bleibe am Ball.",
  "Heute wird es eng. Sagen Sie, wo ich entlasten soll.",
  "Kaum eine Lücke. Ich passe auf, dass nichts untergeht.",
  "Ein Tag zum Durchhalten — ich habe den Überblick.",
];
const DAY_LOAD_LOW = [
  "Ein ruhiger Tag.",
  "Überschaubar.",
  "Da bleibt Luft zwischendurch.",
  "Ein entspannter Tag.",
  "Da bleibt Zeit für den Papierkram.",
  "Heute atmet der Kalender.",
  "Kein Gedränge, das ist angenehm.",
  "Da können Sie in Ruhe arbeiten.",
  "Ein Tag mit Luft nach links und rechts.",
  "Übersichtlich — da geht auch mal etwas dazwischen.",
];

/**
 * Deterministische Einordnung der Terminzahl eines Tages. Leerstring fuer
 * mittlere Tage. Fakten NIE hier hinein — nur Tonlage.
 * @param {number} total echte Terminzahl aus dem Kalender
 * @returns {string}
 */
export function dayLoadReaction(total) {
  const n = Number(total) || 0;
  if (n >= 30) return vary("last.sehr_hoch", DAY_LOAD_VERY_HIGH);
  if (n >= 20) return vary("last.hoch", DAY_LOAD_HIGH);
  if (n >= 1 && n <= 3) return vary("last.niedrig", DAY_LOAD_LOW);
  return "";
}

// Kollegiale Abschluss-Zeilen (Lockerheit 3). Bewusst per maybe() nur
// GELEGENTLICH — ein Angebot, keine Floskel-Pflicht.
const WARM_CLOSE = [
  "Wenn Sie zu einem Termin mehr wissen wollen, sagen Sie es einfach.",
  "Details zu einzelnen Patienten habe ich parat — einfach fragen.",
  "Ich habe alles im Blick, fragen Sie ruhig nach.",
  "Sagen Sie Bescheid, wenn ich irgendwo tiefer reinschauen soll.",
  "Bei Fragen zu einem Namen: einfach ansprechen.",
  "Soll ich jemanden einzeln aufziehen, sagen Sie den Namen.",
  "Mehr zu einem Slot? Einfach draufzeigen — ich meine: einfach sagen.",
  "Ich bleibe in der Nähe, falls Sie nachhaken wollen.",
  "Wenn etwas davon merkwürdig klingt, hake ich nach.",
  "Wollen Sie den Tag anders aufgeschnitten, sagen Sie wie.",
  "Einen Patienten genauer? Einfach den Namen.",
  "Ich kann das auch nach Stuhl oder nach Lücke sortieren — einfach sagen.",
];

/**
 * Gelegentlicher kollegialer Nachsatz (ca. jedes dritte Mal, sonst "").
 * @param {string} [key="warm.close"]
 * @returns {string}
 */
export function warmClose(key = "warm.close") {
  return maybe(key, WARM_CLOSE, 0.3);
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
