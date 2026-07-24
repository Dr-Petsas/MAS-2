// Lena — qwen-Fachbegriff-Korrektor: reine Guard-Logik (17.07.2026)
// ------------------------------------------------------------------
// Chef 17.07./21.07.: parakeet_de_med und Canary aus der lena_stt-Pipeline.
// USB/iPad = Whisper; Headset = Claras Parakeet-Tee. qwen3.6 glaettet NUR
// offensichtliche Spracherkennungs-Verhoerer (z. B. "Barottis"->"Parotis").
//
// Diese Datei ist bewusst FIREBASE-FREI, damit die Guard ohne Emulator/Prod
// getestet werden kann (scripts/test-lena-correct.mjs). Der eigentliche
// LLM-Aufruf (correctGarbles) lebt in lenaDoc.js.
//
// § 630f: Der Roh-Wortlaut (STT) bleibt IMMER als `text` erhalten; die
// Korrektur wird nur als `textCorrected` daneben gelegt. Die Guard verhindert,
// dass qwen dabei Inhalte erfindet, aufblaeht, verstuemmelt oder Zahlen/
// Zahnnummern veraendert.

import { inventsNumbers } from "../clara/summarize.js";

/**
 * Darf die qwen-Korrektur eines Segments uebernommen werden?
 * Konservativ: im Zweifel NEIN (dann bleibt der STT-Rohtext stehen).
 *
 * @param {string} original  STT-Rohtext des Segments (Quelle der Wahrheit).
 * @param {string} fixed     Vorschlag von qwen.
 * @returns {boolean}
 */
export function acceptCorrection(original, fixed) {
  const o = String(original || "").trim();
  const f = String(fixed || "").trim();
  if (!f || f.length < 2) return false;      // leer/Schrott
  if (f === o) return false;                  // nichts geaendert -> nicht speichern
  // Keine erfundenen Zahlen/Zahnnummern/Mengen (Ziffernfolge, die im Roh fehlt).
  if (inventsNumbers(f, o)) return false;
  // Keine Aufblaehung (Halluzination/Zusatzinhalt): max ~1.8x + 20 Zeichen.
  if (f.length > o.length * 1.8 + 20) return false;
  // Keine drastische Kuerzung (Inhalt verloren): min ~0.5x - 20 Zeichen.
  if (o.length >= 12 && f.length < o.length * 0.5) return false;
  return true;
}

/**
 * Relaxierter Guard fuer die BENCH-Korrektur (Chef 24.07.2026, "overwrite"):
 * qwen darf hier gesprochene Zahlen in Ziffern wandeln ("drei sechs"->"36",
 * "sechs Millimeter"->"6 mm") und Selbstkorrekturen aufloesen. Deshalb wird
 * ``inventsNumbers`` bewusst NICHT angewandt (das wuerde jede FDI-Umwandlung
 * verwerfen). Es bleibt eine Sanity-Grenze gegen Aufblaehung/Leere — komplett
 * neue Inhalte/Halluzinationen fangen wir ueber die Laenge ab.
 *
 * @param {string} original  STT-Rohtext des Segments.
 * @param {string} fixed     Vorschlag von qwen (Bench-Prompt).
 * @returns {boolean}
 */
export function acceptLiveCorrection(original, fixed) {
  const o = String(original || "").trim();
  const f = String(fixed || "").trim();
  if (!f || f.length < 2) return false;                 // leer/Schrott
  if (f === o) return false;                            // nichts geaendert
  if (f.length > o.length * 2.2 + 40) return false;     // Aufblaehung/Halluzination
  if (o.length >= 12 && f.length < o.length * 0.35) return false; // zu viel verloren
  return true;
}
