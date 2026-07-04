import "dotenv/config";
import { chat } from "../src/mail/llm.js";

// Debug: rohe LLM-Antwort fuer den Doku-Check-Prompt ansehen.
const messages = [
  {
    role: "system",
    content: [
      "Du pruefst die Behandlungsdokumentation einer Arztpraxis auf Vollstaendigkeit.",
      "Antworte AUSSCHLIESSLICH mit JSON, ohne Erklaerung, ohne Markdown.",
      "Schema: {\"vorhanden\":[\"key\"],\"fehlt\":[\"key\"],\"zusatz\":[\"begriff\"]}",
      "Regeln:",
      "- vorhanden = das Feld ist im Diktat INHALTLICH beantwortet, auch implizit oder verneint ('keine Besonderheiten' beantwortet komplikationen; 'ohne Anaesthesie' beantwortet anaesthesie).",
      "- fehlt = das Feld ist im Diktat NICHT beantwortet. Nur Keys aus der Feldliste verwenden.",
      "- zusatz = 0 bis 3 Begriffe (je 1-3 Woerter, klein, z. B. 'zahnfarbe', 'raucherstatus') fuer fachliche Infos im Diktat, die zu KEINEM Feld passen. Nichts erfinden; im Zweifel leer lassen.",
    ].join("\n"),
  },
  {
    role: "user",
    content: [
      "PFLICHTFELDER:",
      "- umfang: Wie viele Zaehne beziehungsweise welcher Umfang?",
      "- aufnahme_region: Welche Aufnahme (Zahnfilm, OPG, DVT) und welcher Zahn beziehungsweise welche Region?",
      "- rechtfertigende_indikation: Wie lautet die rechtfertigende Indikation fuer die Aufnahme?",
      "- roentgenbefund: Was zeigt die Aufnahme — wie lautet der Roentgenbefund?",
      "",
      "OPTIONALE FELDER:",
      "- fluoridierung: Fluoridiert — womit?",
      "- mundhygiene: Wie ist die Mundhygiene?",
      "",
      'DIKTAT: "PZR gemacht, achtundzwanzig Zaehne, Roe sechsunddreissig angefertigt."',
    ].join("\n"),
  },
];

const res = await chat(messages, { temperature: 0, maxTokens: 240, timeoutMs: 30000 });
console.log("model:", res.model, "ok:", res.ok, res.reason || "");
console.log("RAW:", res.text);
process.exit(0);
