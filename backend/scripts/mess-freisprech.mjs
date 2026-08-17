/**
 * Wie teuer ist die FreiSprech-Politur? Messung mit echtem Briefing-Text.
 *
 * Vergleicht (nur lesend, ohne Firestore-Schreibzugriff):
 *   A) Ist-Zustand    - starkes Modell, Budget 11 s, bis zu zwei Versuche
 *   B) knappes Budget - starkes Modell, Budget 4,5 s
 *   C) kleines Modell - lokales Ollama (qwen3:4b-instruct)
 *   D) mittleres      - lokales Ollama (qwen3:8b)
 *
 * Aufruf: node backend/scripts/mess-freisprech.mjs
 */
import "dotenv/config";
import { freiFormulieren } from "../src/clara/freiSprech.js";
import { llmInfo } from "../src/mail/llm.js";

const TEXT = [
    "Sie haben heute elf Termine zwischen 9 Uhr und 19 Uhr, wobei die Zeitspanne von",
    "12 Uhr 5 bis 13 Uhr 15 sowie von 15 Uhr 45 bis 16 Uhr 30 frei ist.",
    "Auffaellig sind zwei Neupatienten: Frau Melzer um 9 Uhr 30 zur Kontrolle und",
    "Herr Ottmani um 14 Uhr 20 mit Schmerzen im Oberkiefer rechts.",
    "Bei Frau Melzer steht ein Anamnese-Hinweis: Penicillin-Allergie.",
    "Ausserdem ist um 17 Uhr eine Sperrzeit eingetragen, und Helmut Mustermann",
    "kommt um 18 Uhr 40 zur Nachkontrolle nach der Fuellung an Zahn 45.",
    "Zwei Terminanfragen aus dem Portal warten noch auf Bestaetigung.",
].join(" ");

const VARIANTEN = [
    { name: "A) stark, 11 s (Ist)", env: {}, timeoutMs: 11000 },
    { name: "B) stark, 4,5 s", env: {}, timeoutMs: 4500 },
    { name: "C) lokal qwen3:4b-instruct", env: { MAS_FREISPRECH_BASE_URL: "http://127.0.0.1:11434", MAS_FREISPRECH_MODEL: "qwen3:4b-instruct" }, timeoutMs: 11000 },
    { name: "D) lokal qwen3:8b", env: { MAS_FREISPRECH_BASE_URL: "http://127.0.0.1:11434", MAS_FREISPRECH_MODEL: "qwen3:8b" }, timeoutMs: 11000 },
];

const LAEUFE = Number(process.env.LAEUFE || 3);

function setzeEnv(env) {
    delete process.env.MAS_FREISPRECH_BASE_URL;
    delete process.env.MAS_FREISPRECH_MODEL;
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

console.log(`Quelle: ${TEXT.length} Zeichen`);
console.log(`Starkes Modell: ${JSON.stringify(llmInfo())}\n`);

for (const v of VARIANTEN) {
    setzeEnv(v.env);
    const zeiten = [];
    let ok = 0;
    let beispiel = "";
    for (let i = 0; i < LAEUFE; i += 1) {
        const t0 = Date.now();
        let r;
        try {
            r = await freiFormulieren(TEXT, { kontext: "Tages-Lagebild fuer den Chef", timeoutMs: v.timeoutMs });
        } catch (e) {
            r = { ok: false, text: "", warum: String(e?.message || e) };
        }
        zeiten.push(Date.now() - t0);
        if (r.ok) { ok += 1; if (!beispiel) beispiel = r.text; }
        else if (!beispiel) beispiel = `(verworfen: ${r.warum})`;
    }
    console.log(`${v.name.padEnd(30)} median ${String(median(zeiten)).padStart(6)} ms  `
        + `alle [${zeiten.join(", ")}]  poliert ${ok}/${LAEUFE}`);
    console.log(`    ${String(beispiel).slice(0, 220)}\n`);
}
