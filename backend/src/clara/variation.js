// ============================================================================
// Formulierungs-Variation (Nacht 11./12.06.2026).
//
// Anlass (O-Ton Chef): "alle diese Funktionen sind weltklasse wenn sie nicht
// mechanisch starr ablaufen ... und nicht jeden Tag dieselben Formulierungen
// und Abläufe kommen. dann wird das nervig."
//
// pick() wählt aus einem Formulierungs-Pool. In Produktion echte Zufälligkeit;
// die Testsuite setzt MAS_SPEECH_SEED und bekommt damit eine reproduzierbare
// Sequenz (deterministisches mulberry32) — Regressionstests bleiben stabil,
// ohne dass Clara im Alltag wie eine Bandansage klingt.
// ============================================================================

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedRaw = (process.env.MAS_SPEECH_SEED || "").trim();
const rng = seedRaw !== "" && Number.isFinite(Number(seedRaw))
  ? mulberry32(Number(seedRaw))
  : Math.random;

/** Ein Element aus dem Pool — niemals leer aufrufen. */
export function pick(pool) {
  if (!Array.isArray(pool) || !pool.length) return "";
  return pool[Math.floor(rng() * pool.length)];
}

/** true mit Wahrscheinlichkeit p (0..1) — für optionale Nebensätze. */
export function chance(p) {
  return rng() < Math.max(0, Math.min(1, Number(p) || 0));
}
