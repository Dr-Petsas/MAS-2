import { chat } from "../mail/llm.js";

// Frei-Diktat zu Kanal (16.06.2026): aus einem frei gesprochenen Diktat einen
// kanalgerechten Text machen - kurze SMS bzw. roter Faden fuer ein Telefonat.
// Briefe/E-Mails laufen ueber Nadine (letterAI/prepareCaseDraft); SMS/Anruf
// werden hier ausformuliert und ERST nach ausdruecklicher Freigabe gesendet.
// Bei LLM-Ausfall faellt der Text auf das Diktat zurueck (es geht nichts
// verloren), und die Freigabe-Pflicht schuetzt vor Murks.

function strip(t) {
  let s = String(t || "").trim().replace(/^```[a-z]*\n?|\n?```$/gi, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("„") && s.endsWith("“"))) s = s.slice(1, -1).trim();
  return s;
}

/**
 * Formuliert ein Diktat kanalgerecht aus.
 * @param {"sms"|"call"} channel
 * @param {string} dictation
 * @param {{recipientName?:string}} opts
 * @returns {Promise<{ok:boolean, text:string}>}
 */
export async function polishForChannel(channel, dictation, { recipientName = "" } = {}) {
  const raw = String(dictation || "").trim();
  if (!raw) return { ok: false, text: "" };
  const isCall = String(channel || "").toLowerCase() === "call";

  const system = isCall
    ? [
        "Du bist die Schreibhilfe einer deutschen Zahnarztpraxis.",
        "Formuliere aus dem Diktat einen KNAPPEN roten Faden fuer ein Telefonat, den die Telefonistin Lisa ausrichten soll.",
        "Deutsch, Sie-Form, klare Kernbotschaft, hoeflich. Erfinde KEINE Fakten, Termine, Betraege oder Namen, die nicht im Diktat stehen.",
        "Antworte NUR mit dem Skript-Text, ohne Anfuehrungszeichen, ohne Vor-/Nachbemerkung.",
      ].join(" ")
    : [
        "Du bist die Schreibhilfe einer deutschen Zahnarztpraxis.",
        "Formuliere aus dem Diktat eine KURZE, hoefliche SMS auf Deutsch (Sie-Form), hoechstens etwa 300 Zeichen.",
        "Kein Briefkopf, keine Absenderangaben, keine erfundenen Fakten/Termine/Namen.",
        "Antworte NUR mit dem SMS-Text, ohne Anfuehrungszeichen, ohne Vor-/Nachbemerkung.",
      ].join(" ");

  const user = `${recipientName ? `Empfaenger: ${recipientName}\n` : ""}Diktat:\n${raw}`;

  try {
    const res = await chat(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { temperature: 0.3, maxTokens: 320, timeoutMs: 30000 }
    );
    const text = strip(res?.text);
    if (res?.ok && text) return { ok: true, text };
  } catch { /* faellt unten auf das Diktat zurueck */ }
  return { ok: false, text: raw };
}
