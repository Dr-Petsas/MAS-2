import { chat } from "../mail/llm.js";

// ============================================================================
// Sprech-Zusammenfassung von ECHTEN Inhalten (Chef 10.07.2026): "Clara soll
// Telefonat- und E-Mail-Inhalte fluessig zusammengefasst wiedergeben."
//
// Der Inhalt (Mailtext, Anruf-Notiz) ist GEERDET — er liegt im Aufruf vor. Ein
// abgeschottetes, eng gefuehrtes LLM verdichtet ihn in einem EIGENEN Schritt
// (niedrige Temperatur, harte Anti-Erfindungs-Regeln), das Ergebnis wird
// geprueft und dann von Clara WOERTLICH gesprochen. So bleibt das Hauptgespraech
// halluzinationsfrei (die Fakten-/Verbatim-Architektur ist unberuehrt), und
// trotzdem klingt die Wiedergabe natuerlich statt nach vorgelesener Textwand.
//
// Sicherheit:
//  * Nur was im Quelltext steht — der System-Prompt verbietet Erfindungen,
//    Diagnosen und Ratschlaege ausdruecklich.
//  * Zahlen-Waechter: fuehrt die Zusammenfassung eine Ziffernfolge ein, die im
//    Quelltext NICHT vorkommt (Betrag, Datum, Menge), wird sie verworfen —
//    der Aufrufer faellt dann auf den deterministischen Rohtext zurueck.
//  * LLM offline/langsam/leer -> { ok:false }: der Aufrufer nutzt seinen
//    bestehenden Text. Nie schlechter als vorher.
// ============================================================================

/** Alle Ziffernfolgen eines Textes (fuer den Anti-Erfindungs-Abgleich). */
function numberGroups(s) {
  return String(s || "").match(/\d+/g) || [];
}

/**
 * Fuehrt die Zusammenfassung eine Zahl ein, die im Quelltext fehlt? Betraege,
 * Daten, Fristen sind der gefaehrlichste Erfindungs-Fall — "Ratenzahlung 500"
 * obwohl die Mail 300 sagte. Reiner Teilmengen-Check: jede Ziffernfolge der
 * Zusammenfassung muss auch im Quelltext als Ziffernfolge stehen.
 * @param {string} summary
 * @param {string} source
 * @returns {boolean}
 */
export function inventsNumbers(summary, source) {
  const src = new Set(numberGroups(source));
  return numberGroups(summary).some((n) => !src.has(n));
}

const KIND_LABEL = { email: "E-Mail", call: "eines Telefonats" };

/**
 * Verdichtet echten Inhalt zu wenigen natuerlichen Saetzen. Rein I/O — bei
 * jedem Zweifel { ok:false }, damit der Aufrufer deterministisch weiterkommt.
 *
 * @param {"email"|"call"} kind
 * @param {string} content Der ECHTE Quelltext (Mailbody, Anruf-Notiz).
 * @param {{ subject?:string, sender?:string, maxSentences?:number, timeoutMs?:number }} [opts]
 * @returns {Promise<{ok:boolean, text:string, reason?:string}>}
 */
export async function summarizeForSpeech(kind, content, { subject = "", sender = "", maxSentences = 3, timeoutMs = 15000 } = {}) {
  const src = String(content || "").replace(/\s+/g, " ").trim();
  if (src.length < 40) return { ok: false, text: "", reason: "too_short" };

  const label = KIND_LABEL[kind] || "eines Textes";
  const system = [
    `Du bist die Assistenz eines Arztes und fasst den Inhalt ${label} fuer ihn zusammen.`,
    "Strikte Regeln:",
    "- Gib NUR wieder, was im Text steht. Erfinde NICHTS — keine Zahlen, Namen, Betraege, Fristen oder Termine, die nicht dastehen.",
    "- Keine Diagnosen, keine medizinischen Ratschlaege, keine Handlungsempfehlungen.",
    `- Hoechstens ${maxSentences} kurze, natuerliche deutsche Saetze. Sachlich, in der dritten Person.`,
    "- Keine Anrede, keine Einleitung wie 'Die E-Mail sagt' oder 'Zusammenfassung:'. Direkt zum Inhalt.",
    "- Ist kein klarer Inhalt erkennbar, sag knapp und ehrlich, dass der Text keinen klaren Inhalt hat.",
  ].join("\n");
  const head = [subject ? `Betreff: ${subject}` : "", sender ? `Absender: ${sender}` : ""].filter(Boolean).join("\n");
  const user = `${head ? `${head}\n\n` : ""}Text:\n${src.slice(0, 4000)}`;

  const out = await chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    { temperature: 0.2, maxTokens: 320, timeoutMs },
  );
  if (!out.ok) return { ok: false, text: "", reason: out.reason || "llm_error" };

  let text = String(out.text || "").replace(/\s+/g, " ").trim();
  // Gaengige Vorspann-Floskeln entfernen, falls das Modell sie doch voranstellt.
  text = text.replace(/^(zusammenfassung|kurz(gefasst|fassung)?|inhalt)\s*[:\-–]\s*/i, "").trim();
  if (text.length < 10) return { ok: false, text: "", reason: "empty" };
  if (text.length > 700) text = `${text.slice(0, 697)}...`;
  if (inventsNumbers(text, src)) return { ok: false, text: "", reason: "guard_numbers" };
  return { ok: true, text };
}
