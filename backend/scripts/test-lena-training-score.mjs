// Regressionstests fuer die reine Trainingscenter-Logik (kein Firebase/LLM).
//   node backend/scripts/test-lena-training-score.mjs
import {
  normText, isMatch, levelForXp, levelTitle, berlinDay, dayDiff,
  nextStreak, computeBadges, pcmToWav, XP_OK, XP_TEACH,
} from "../src/lena/trainingScore.js";

let fail = 0;
function check(name, cond, extra = "") {
  const ok = !!cond;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? "  -> " + extra : ""}`);
}

// normText
check("normText: Umlaute/Satzzeichen", normText("Straumann, BLX!") === "straumann blx", normText("Straumann, BLX!"));

// isMatch: Einzelwort exakt + toleranter Vertipper
check("Match: exakt", isMatch("Straumann", "wir setzen Straumann ein"));
check("Match: 1 Vertipper toleriert", isMatch("Straumann", "Strauman"));
check("Match: grob falsch -> nein", isMatch("Straumann", "Rosenmontag") === false);
// Mehrwort zusammenhaengend
check("Match: Mehrwort", isMatch("Nobel Biocare", "ich nehme Nobel Biocare heute"));
check("Match: Mehrwort getrennt -> nein", isMatch("Nobel Biocare", "Nobel ist teuer, Biocare auch") === false);
check("Match: leer -> nein", isMatch("Test", "") === false);

// Verhoerungs-Beispiel (real): "Aufhellung" vs "Auffällung"
check("Match: Verhoerung nicht als Treffer", isMatch("Aufhellung", "Auffällung") === false);

// Level
check("Level: 0 XP -> 1", levelForXp(0) === 1);
check("Level: 250 XP -> 3", levelForXp(250) === 3);
check("LevelTitle: 1 = Anwärterin", levelTitle(1) === "Anwärterin");
check("LevelTitle: hoch gedeckelt", levelTitle(99) === "Professorin");

// Streak
check("Streak: selber Tag bleibt", nextStreak(4, "2026-07-24", "2026-07-24") === 4);
check("Streak: Folgetag +1", nextStreak(4, "2026-07-23", "2026-07-24") === 5);
check("Streak: Luecke -> 1", nextStreak(4, "2026-07-20", "2026-07-24") === 1);
check("Streak: erster Tag -> 1", nextStreak(0, "", "2026-07-24") === 1);
check("dayDiff: 1 Tag", dayDiff("2026-07-23", "2026-07-24") === 1);

// Badges
const b1 = computeBadges({ samples: 1, confirmed: 0, streakDays: 0, coveragePct: 0 });
check("Badge: Erstfluesterer bei 1 Sample", b1.includes("erstfluesterer"));
const b2 = computeBadges({ samples: 120, confirmed: 30, streakDays: 7, coveragePct: 82 });
check("Badge: Hundert-Club", b2.includes("hundert-club"));
check("Badge: Wortschatz-25", b2.includes("wortschatz-25"));
check("Badge: Wochenstreak", b2.includes("wochenstreak"));
check("Badge: Verstanden-80", b2.includes("verstanden-80"));
const b3 = computeBadges({ badges: ["custom"], samples: 1, confirmed: 0, streakDays: 0, coveragePct: 0 });
check("Badge: bestehende bleiben (additiv)", b3.includes("custom") && b3.includes("erstfluesterer"));

// XP-Konstanten
check("XP: ok > teach", XP_OK > XP_TEACH && XP_TEACH > 0);

// WAV-Header
const pcm = Buffer.alloc(320); // 10ms @16k int16
const wav = pcmToWav(pcm, 16000);
check("WAV: RIFF/WAVE-Header", wav.slice(0, 4).toString() === "RIFF" && wav.slice(8, 12).toString() === "WAVE");
check("WAV: Laenge = 44 + data", wav.length === 44 + pcm.length, String(wav.length));
check("WAV: Samplerate 16000", wav.readUInt32LE(24) === 16000);
check("WAV: mono/16bit", wav.readUInt16LE(22) === 1 && wav.readUInt16LE(34) === 16);

// berlinDay stabil formatiert
check("berlinDay: ISO-Form", /^\d{4}-\d{2}-\d{2}$/.test(berlinDay(Date.now())));

console.log(fail ? `FAZIT: ${fail} Fehler` : "FAZIT: Trainingscenter-Logik OK");
process.exitCode = fail ? 1 : 0;
