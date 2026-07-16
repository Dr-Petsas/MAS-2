import "dotenv/config";
import { listAccounts } from "../src/mail/accounts.js";
import { sendMail } from "../src/mail/mailbox.js";

// Einmalige Zustellung des Clara-Pipeline-Download-Links + Architektur-Erklaerung
// an den Kollegen (development@pickadoc.de).
const clientId = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const to = "development@pickadoc.de";
const dlPage = "https://clara-pipeline.web.app";
const dlZip = "https://clara-pipeline.web.app/clara-pipeline-2026-07-15.zip";

const accounts = await listAccounts(clientId);
const acc = accounts.find((a) => a.enabled !== false && a.smtp?.host) || accounts[0];
if (!acc?.id) {
  console.error("Kein Mailkonto fuer", clientId);
  process.exit(1);
}

const subject = "Clara-Voice Pipeline zum Vergleich — Download + Architektur";

const text = `Hallo,

anbei die komplette Sprach-Pipeline von Clara als Quellcode-Paket, damit dein
Cursor-Agent damit vergleichen kann, wo deine Telefon-KI noch Schichten/Gates
fehlen — BEVOR du sie umbaust. Es geht ausdruecklich um die Architektur, nicht
um ein schluesselfertiges Deploy.

DOWNLOAD
  Seite:  ${dlPage}
  Direkt: ${dlZip}
  (~0,6 MB, Quellcode, ohne Secrets/Modelle/venvs)

FUER DEINEN CURSOR-AGENTEN — in dieser Reihenfolge lesen lassen:
  1) ARCHITEKTUR.md  — die Pipeline Schicht fuer Schicht, mit konkreten
     Vergleichs-Fragen. Das ist das zentrale Dokument.
  2) AGENTS.md       — warum jedes Gate existiert (Historie echter Live-Ausfaelle).
  3) docs/UMBAU_v5.2_zu_v5.4_TELEFONAGENT.md — Schritt-fuer-Schritt-Umbau
     (Latenz/Speed), bereits FUER einen Coding-Agenten geschrieben.
  4) testsuite/      — die Gates als ausfuehrbare Tests = deine Checkliste.

DIE KERNIDEE (worum es geht)
  Ein kleines lokales LLM (Qwen3 4B via Ollama) ist schnell und datenschutz-
  konform, neigt aber zu Halluzination und Sprach-Spruengen. Clara ist deshalb
  KEIN nackter LLM-Call, sondern eine Kette DETERMINISTISCHER, einzeln testbarer
  Schichten (Gates) um das LLM herum. Merksatz: "Das LLM schlaegt vor — die Gates
  entscheiden, was gesprochen wird."

SIGNALFLUSS EINES TURNS (Kurzform)
  Telefon -> LiveKit -> Parakeet (STT) -> STT-Postcorrect -> Speaker-/Echo-Gate +
  Endpointing -> Mic-/Dispatch-Gate -> [LLM-Turn: Sprach-Erkennung+Mirror ->
  Tool-Subsetting (60 Tools -> ~10-20) -> System-Prompt-Bau -> LLM-Stream+Tool-Loop
  -> FAKTEN-WAECHTER] -> RESPONSE-GUARD (letzte Meile) -> Satz-Chunking + TTS
  (erster Satz live gestreamt) -> ElevenLabs -> Telefon.

DIE WICHTIGSTEN VERGLEICHSPUNKTE FUER EINE TELEFON-KI MIT VERSTAENDNIS-PROBLEMEN
  - Prompt-Groesse pro Turn: Passt der Prompt SICHER ins Kontextfenster? Zu grosser
    Prompt (viele Tools + Gedaechtnis) laesst Ollama den System-Prompt vorne
    abschneiden -> Modell bekommt Muell -> "versteht ploetzlich nichts mehr".
    Gegenmittel bei uns: Tool-Subsetting (services/tool_subsetting.py) +
    OLLAMA_CONTEXT_LENGTH=32768. Das ist die #1-Ursache.
  - STT-Postcorrect (services/stt_postcorrect.py): Fachbegriffe/Markerwoerter hart
    korrigieren, die die STT verhoert.
  - Speaker-/Echo-Gate (services/voice_filter.py, smart_endpoint.py): nicht auf die
    eigene TTS-Ausgabe reagieren; echtes Satzende erkennen.
  - Fakten-Waechter (providers/llm/openai_compat_llm.py): Faktenfrage ohne Tool-Call
    -> Text verwerfen und Tool-Call synthetisieren (keine erfundenen Zahlen/Namen).
  - Response-Guard (services/response_guard.py): letzte Schicht VOR dem Mund —
    entfernt Halluzinationen/TTS-Muell, schreibt Datum/Zahlen sprechbar aus.
  - First-Sentence-Streaming (services/worker_speech_out.py): erster Satz live ->
    Time-To-First-Audio < 1 s.
  - Booking als Zustandsmaschine (services/bianca_flow.py): Terminbuchung NICHT dem
    LLM ueberlassen, sondern deterministisch fuehren.

EMPFOHLENER ABLAUF FUER DEN AGENTEN
  1. AGENTS.md lesen (das WARUM).
  2. Prompt-Groesse der eigenen KI messen (Kontextfenster-Check).
  3. Schichten aus ARCHITEKTUR.md gegen die eigene KI abgleichen.
  4. Fehlende Gates einzeln nachruesten (jede Schicht ist klein/isoliert; passende
     testsuite/test_*.py als Abnahme nutzen).
  5. Nichts ungetestet an den Live-Worker.

Bei Fragen zur Pipeline gern melden.

Viele Gruesse
Pickadoc / Clara-Team`;

const out = await sendMail(clientId, acc.id, { to: [to], subject, text });
console.log(JSON.stringify({ ok: out.ok, account: acc.label || acc.email, to, ...out }, null, 2));
process.exit(out.ok ? 0 : 1);
