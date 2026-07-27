// Lisas Agenten-Prompt bei ElevenLabs nachziehen (27.07.2026).
//
// Vorfall (Live 19:57): Auftrag war "Es ist gleich 20 Uhr." — Lisa sagte am
// Telefon wortgleich das TERMIN-BEISPIEL aus ihrem Prompt ("Ich rufe an, weil
// wir Ihren Termin gerne vorverlegen würden ..."). Der Prompt verlangt 3-7
// ausformulierte Sätze und ein konkretes Termin-Verb; ein kurzer, termin-freier
// Auftrag gibt dafür keinen Stoff, also griff das Modell zum Vorbild im Prompt.
//
// Dieses Skript setzt drei Klarstellungen NACH den bestehenden Abschnitten ein
// (kein Umschreiben, keine Löschung) und ist idempotent: schon vorhandene
// Marker werden nicht doppelt eingefügt.
//
//   node scripts/lisa-agent-prompt-fix.mjs           (Vorschau)
//   node scripts/lisa-agent-prompt-fix.mjs --apply   (schreiben)
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const KEY = process.env.ELEVENLABS_API_KEY;
const ID = process.env.LISA_AGENT_ID;

const MARKER = "KEIN TERMIN IM AUFTRAG";
const MARKER2 = "INHALT IMMER WIRKLICH NENNEN";

// Zweiter Durchgang (27.07.2026, Simulation): Nach dem ersten Fix erfand Lisa
// keinen Termin mehr — sagte aber auch die Nachricht nicht ("Ich rufe an, um Sie
// ueber eine wichtige Information zu informieren"). Ursache: die Regel "NICHT
// wortwoertlich vorlesen, in 3-7 Saetzen umformulieren" laesst bei einer kurzen
// Sachinformation nur Umschreibung uebrig. Der Inhalt selbst ist Pflicht.
const NACH_GENERISCH = `
${MARKER2}: Die Information selbst MUSS fallen — die Uhrzeit, die Zahl, der Ort,
der Name, die Nachricht. Verboten sind Leerformeln wie "eine wichtige
Information", "eine Mitteilung", "etwas Wichtiges", "eine Info aus der Praxis".
Der Gespraechspartner muss die Sache nach deinem zweiten Satz kennen, ohne
nachzufragen. Bei einer kurzen Sachinformation darfst du sie direkt sagen
("Ich wollte Ihnen sagen, dass es gleich 20 Uhr ist") — die Regel "nicht
wortwoertlich" heisst nur: eigene Satzform, NICHT Inhalt weglassen.
`;

const NACH_BEISPIEL = `
Dieses Beispiel ist NUR ein Stilmuster fuer den Satzbau, KEINE Inhaltsvorlage.
Du darfst es nur verwenden, wenn im {{task_prompt}} wirklich ein Termin
vorverlegt werden soll. Steht dort etwas anderes, sagst du den Inhalt des
Auftrags — nie diesen Beispielsatz.
`;

const NACH_VERBEN = `
Die Termin-Verben ("vorverlegen", "verschieben", "absagen", "umbuchen") gelten
NUR, wenn der Auftrag von einem Termin spricht. Sonst nimm das Verb, das im
Auftrag steht ("informieren", "ausrichten", "erinnern", "weitergeben").
`;

const NACH_TERMINLOGIK = `
${MARKER}: Hat {{task_prompt}} nichts mit Terminen zu tun (eine Nachricht, eine
Information, ein privates Anliegen), dann sprichst du KEINE Termine an, fragst
NICHT nach vormittags oder nachmittags und schlaegst keinen Termin vor. Du
sagst genau die Information aus dem Auftrag. Ein kurzer Auftrag darf auch in
ein bis zwei Saetzen erledigt sein — die 3-bis-7-Saetze-Regel gilt dann nicht.
`;

const MARKER3 = "KEINE HILFS-RUECKFRAGE";

// Dritter Durchgang: Der Prompt verbietet "Kann ich Ihnen sonst noch helfen?" —
// Lisa umgeht das mit Varianten ("Gibt es etwas, bei dem ich Ihnen behilflich
// sein kann?"). Chef-Vorgabe: einfach freundlich verabschieden.
const NACH_ABSCHLUSS = `
${MARKER3}: Verboten ist JEDE Variante der Hilfsfrage, auch "Gibt es etwas, bei
dem ich Ihnen behilflich sein kann?", "Koennen wir noch etwas fuer Sie tun?",
"Haben Sie noch Fragen?". Nach dem Anlass kommt der naechste Schritt oder der
Abschied — keine Hilfsfrage.
`;

function einfuegenNach(text, anker, zusatz) {
  const i = text.indexOf(anker);
  if (i < 0) return { text, ok: false };
  // Ende des Absatzes: bis zur naechsten Leerzeile bzw. zum naechsten
  // Abschnittstitel in GROSSBUCHSTABEN.
  const rest = text.slice(i + anker.length);
  const m = rest.match(/\n(?=[A-ZÄÖÜ⭐][A-ZÄÖÜ \-()]{4,}\n)/);
  const schnitt = i + anker.length + (m ? m.index : rest.length);
  return {
    text: text.slice(0, schnitt) + "\n" + zusatz.trim() + "\n" + text.slice(schnitt),
    ok: true,
  };
}

const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${ID}`, {
  headers: { "xi-api-key": KEY },
});
if (!r.ok) {
  console.error("Agent nicht abrufbar:", r.status, await r.text());
  process.exit(1);
}
const agent = await r.json();
const alt = agent?.conversation_config?.agent?.prompt?.prompt || "";
if (!alt) {
  console.error("Kein Prompt im Agenten gefunden — Abbruch.");
  process.exit(1);
}
let neu = alt;
const schritte = [
  [MARKER, "Beispiel bei Termin vorverlegen:", NACH_BEISPIEL],
  [MARKER, "Du musst immer konkret sein:", NACH_VERBEN],
  [MARKER, "TERMIN-LOGIK (sehr wichtig)", NACH_TERMINLOGIK],
  [MARKER2, "WICHTIG: NICHT GENERISCH WERDEN", NACH_GENERISCH],
  [MARKER3, "ABSCHLUSS", NACH_ABSCHLUSS],
];
for (const [marker, anker, zusatz] of schritte) {
  if (alt.includes(marker)) {
    console.log(`SCHON  ${JSON.stringify(anker)} (Marker vorhanden)`);
    continue;
  }
  const out = einfuegenNach(neu, anker, zusatz);
  console.log(`${out.ok ? "OK  " : "FEHLT"}  Anker: ${JSON.stringify(anker)}`);
  neu = out.text;
}
if (neu === alt) {
  console.error("Kein Anker gefunden — Prompt unverändert. Bitte von Hand prüfen.");
  process.exit(1);
}

console.log(`\nLaenge: ${alt.length} -> ${neu.length} (+${neu.length - alt.length})`);
if (!APPLY) {
  console.log("\n--- Vorschau der neuen Stellen ---");
  for (const teil of [NACH_BEISPIEL, NACH_VERBEN, NACH_TERMINLOGIK]) {
    console.log(teil.trim());
    console.log("---");
  }
  console.log("Trockenlauf. Mit --apply schreiben.");
} else {

  const p = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${ID}`, {
    method: "PATCH",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_config: { agent: { prompt: { prompt: neu } } },
    }),
  });
  if (!p.ok) {
    console.error("PATCH fehlgeschlagen:", p.status, await p.text());
    process.exitCode = 1;
  } else {
    console.log("Prompt aktualisiert.");
  }
}
