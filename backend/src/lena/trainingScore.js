// Reine, testbare Logik fuer das Lena Trainingscenter (kein Firestore/LLM).
// Getrennt gehalten, damit die Regressionstests sie ohne Firebase-Init laden.

export const XP_OK = 10;   // Begriff sitzt
export const XP_TEACH = 5; // Verhoert -> trotzdem gelernt (Korrektur/Audio gewonnen)

export function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,;:!?«»"“”„'`()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s) {
  return normText(s).split(" ").filter(Boolean);
}

// Levenshtein (kurz) fuer tolerante Einzelwort-Treffer.
export function editDistance(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** Wurde der Zielbegriff im Erkannten getroffen? Toleranz fuer 1 Vertipper je
    ~5 Zeichen. Mehrwort-Begriffe: als zusammenhaengende Tokenfolge suchen. */
export function isMatch(target, recognized) {
  const tgt = tokens(target);
  const rec = tokens(recognized);
  if (!tgt.length || !rec.length) return false;
  // Bewusst STRENG: ~1 Tippfehler je 8 Zeichen. Ein falscher "Treffer" wuerde
  // einen Begriff faelschlich als "sitzt" markieren; ein verpasster Treffer
  // liefert nur MEHR Trainingsdaten. Naechste Minimalpaare ("Aufhellung" vs
  // "Auffällung", 2 Subst.) duerfen daher NICHT als Treffer durchgehen.
  const tol = (w) => Math.floor(Math.max(0, w.length - 1) / 8);
  if (tgt.length === 1) {
    return rec.some((w) => editDistance(w, tgt[0]) <= tol(tgt[0]));
  }
  for (let i = 0; i + tgt.length <= rec.length; i++) {
    let ok = true;
    for (let k = 0; k < tgt.length; k++) {
      if (editDistance(rec[i + k], tgt[k]) > tol(tgt[k])) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

export function levelForXp(xp) {
  return 1 + Math.floor(Math.max(0, xp) / 100);
}

export function levelTitle(level) {
  const titles = ["Anwärterin", "Assistentin", "Fachkraft", "Expertin", "Meisterin", "Professorin"];
  return titles[Math.min(titles.length - 1, Math.max(0, level - 1))];
}

export function berlinDay(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms || Date.now()));
}

export function dayDiff(a, b) {
  if (!a || !b) return 999;
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

/** Streak fortschreiben: gleicher Tag -> unveraendert, Folgetag -> +1, Luecke -> 1. */
export function nextStreak(prevStreak, lastDay, today) {
  const gap = dayDiff(lastDay, today);
  if (gap === 0) return Math.max(1, prevStreak || 0);
  if (gap === 1) return (prevStreak || 0) + 1;
  return 1;
}

/** Badges aus den aggregierten Zahlen ableiten (idempotent, additiv). */
export function computeBadges(agg) {
  const b = new Set(Array.isArray(agg.badges) ? agg.badges : []);
  if ((agg.samples || 0) >= 1) b.add("erstfluesterer");
  if ((agg.samples || 0) >= 50) b.add("fleissig-50");
  if ((agg.samples || 0) >= 100) b.add("hundert-club");
  if ((agg.confirmed || 0) >= 25) b.add("wortschatz-25");
  if ((agg.streakDays || 0) >= 3) b.add("dranbleiber");
  if ((agg.streakDays || 0) >= 7) b.add("wochenstreak");
  if ((agg.coveragePct || 0) >= 80) b.add("verstanden-80");
  return [...b];
}

/** PCM(int16/mono) -> WAV-Buffer (44-Byte-Header). */
export function pcmToWav(pcm, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  const dataLen = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}
