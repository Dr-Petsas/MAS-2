// Cross-Channel-Merge fuer Lena-Behandlungsaufnahmen (17.07.2026).
// -----------------------------------------------------------------
// Die Aufnahme laeuft ueber ZWEI Kanaele (Ansteck `arzt` + Raum `raum`). Die
// Arzt-Stimme blutet in BEIDE Mikrofone -> jeder Satz kommt DOPPELT, oft leicht
// unterschiedlich transkribiert ("Zahn 37,8"/"Zahn 378", "…Approximalraum…"/
// "Den Zahn zwischen Raum…"). Der STT-Server-Dedup (dedup_guard.py) faengt
// textnahe Zwillinge, aber nicht die stark divergenten. HIER, an der
// Speicherstelle, gibt es Quelle + echte Zeit: ein Zwilling ist ein Segment der
// ANDEREN Quelle, das ZEITLICH ueberlappt und text-aehnlich ist. Behalten wird
// der vollstaendigere (laengere) Text.
//
// Voraussetzung: beide Segmente tragen echte Zeitstempel (startMs>0). Ohne Zeit
// (Alt-Segmente/kein Timing) wird NICHTS zusammengefasst — dann greift nur der
// bereits erfolgte Text-Dedup. Bewusst self-contained (kein Firebase-Import),
// damit es ohne Credentials testbar ist.

export function normSeg(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bigramm-Dice-Aehnlichkeit 0..1 (wie die iPad-Client-Dedup). */
export function bigramSim(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  let total = 0;
  ga.forEach((n, g) => { overlap += Math.min(n, gb.get(g) || 0); total += n; });
  gb.forEach((n) => { total += n; });
  return total ? (2 * overlap) / total : 0;
}

/**
 * Entfernt Zwei-Mikro-Doppelungen anhand Quelle + Zeit. Behaelt Reihenfolge und
 * bei einem erkannten Zwilling den laengeren (vollstaendigeren) Text.
 *
 * @param {Array} segs  Segmente in createdAt-Reihenfolge, je {id,text,source,startMs}
 * @param {object} opts windowMs (Zeitfenster), sim (Bigramm-Schwelle)
 * @returns {Array} gefilterte Segmente (gleiche Objekte, Reihenfolge erhalten)
 */
export function mergeCrossChannel(segs, { windowMs = 2500, sim = 0.5 } = {}) {
  const kept = [];
  for (const s of segs || []) {
    const sm = Number(s.startMs) || 0;
    if (sm > 0) {
      const ns = normSeg(s.text);
      let dupIdx = -1;
      for (let i = kept.length - 1; i >= 0; i--) {
        const k = kept[i];
        const km = Number(k.startMs) || 0;
        if (km <= 0) continue;
        if (Math.abs(km - sm) > windowMs) continue;
        if (String(k.source || "") === String(s.source || "")) continue; // nur KANALuebergreifend
        const nk = normSeg(k.text);
        if (ns.length < 6 || nk.length < 6) continue; // zu kurz -> nicht riskieren
        const contained = ns.includes(nk) || nk.includes(ns);
        if (contained || bigramSim(ns, nk) >= sim) { dupIdx = i; break; }
      }
      if (dupIdx >= 0) {
        if (normSeg(s.text).length > normSeg(kept[dupIdx].text).length) kept[dupIdx] = s;
        continue;
      }
    }
    kept.push(s);
  }
  return kept;
}
