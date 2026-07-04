import { chat } from "../mail/llm.js";
import { log } from "../log.js";

// ============================================================================
// FreiSprech (04.07.2026): "LLM formuliert frei, Guard sichert Fakten."
// ============================================================================
// Anforderung Chef: Briefings klingen STEIF — jedes Gespraech nach Schema X.
// Gewuenscht sind menschliche, variantenreiche Ansagen mit Betonungen und
// Rueckschluessen, OHNE Halluzinationsrisiko.
//
// Loesung: Der deterministische Briefing-Text (Fakten sind dort schon korrekt
// zusammengebaut) wird von einem LLM frei UMformuliert — mit VARIANZ IM
// PROMPT (zufaellige Stil-Losung pro Aufruf + hohe Temperatur), danach prueft
// ein deterministischer FAKTEN-GUARD das Ergebnis:
//
//   - ZIFFERN-TREUE: jede Ziffern-Gruppe der Quelle (Uhrzeiten, Anzahlen,
//     Daten) muss in der Umformulierung vorkommen — und es duerfen KEINE
//     neuen Ziffern dazukommen (keine erfundenen Zeiten/Mengen).
//   - NAMENS-TREUE: jeder Personenname der Quelle (nach Herr/Frau/Doktor)
//     muss erhalten bleiben.
//   - KEINE GELDBETRAEGE dazuerfinden (Euro-Woerter), Hausregel 12.06.2026.
//   - LAENGEN-KORRIDOR: Umformulierung zwischen 50% und 170% der Quelle.
//
// Faellt IRGENDEIN Check durch (oder ist das LLM offline/zu langsam), wird
// der deterministische Text unveraendert gesprochen — erreichte Funktionen
// gehen nie verloren, schlimmstenfalls klingt es wie bisher.
//
// Qwen-3.6-Kopplung: Standard ist das lokale MAS-LLM (Ollama qwen3:4b). Fuer
// den grossen Sprung auf den RTX-5090-Server (vLLM, qwen3.6:35b-a3b) reicht:
//   MAS_FREISPRECH_BASE_URL=http://100.77.30.98:8000/v1
//   MAS_FREISPRECH_MODEL=qwen3.6:35b-a3b
// Kill-Switch: MAS_FREISPRECH=0 (alles bleibt deterministisch).
// ============================================================================

// Stil-Losungen: pro Aufruf wird EINE zufaellig gezogen — das ist die
// Varianz-Quelle im Prompt (nicht nur Temperatur-Rauschen).
const STIL_LOSUNGEN = [
    "Beginne mit dem Wichtigsten, dann der Rest in lockerer Reihenfolge.",
    "Sprich wie zu einer Kollegin zwischen zwei Behandlungen: knapp, warm, direkt.",
    "Nutze einen kurzen Einstieg wie 'Kurz zum Ueberblick' oder 'Also' — danach fliessend erzaehlen.",
    "Formuliere zupackend und praktisch, als wuerdest du nebenbei den Bildschirm zeigen.",
    "Erzaehle es als kleinen roten Faden: erst das Bild des Tages, dann die Besonderheiten.",
    "Sprich ruhig und souveraen, mit kurzen Saetzen. Betone Warnungen deutlich.",
    "Klinge einen Tick beschwingt, aber professionell — kein Schema, keine Aufzaehlung.",
    "Baue EINEN natuerlichen Uebergang ein (z. B. 'dazu solltest du wissen'), sonst schlicht bleiben.",
    "Formuliere so, wie eine erfahrene Praxismanagerin es muendlich zusammenfassen wuerde.",
    "Wechsle die Satzlaenge: mal kurz und knackig, mal ein laengerer erklaerender Satz.",
    // "Stelle Zusammenhaenge her ('weil','deshalb')" stand hier — GESTRICHEN
    // 04.07.2026: Der Test zeigte eine ERFUNDENE Kausalitaet ("kommt zur PZR,
    // weil sie Marcumar nimmt"). Verbindungen herstellen darf nur die Quelle.
    "Nutze weiche Uebergaenge ('dabei', 'ausserdem', 'denk auch an'), OHNE neue Zusammenhaenge zu behaupten.",
    "Sprich es wie eine kurze persoenliche Uebergabe am Empfang, nicht wie einen Bericht.",
];

function ziehStil() {
    return STIL_LOSUNGEN[Math.floor(Math.random() * STIL_LOSUNGEN.length)];
}

function strip(t) {
    let s = String(t || "").trim().replace(/^```[a-z]*\n?|\n?```$/gi, "").trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("„") && s.endsWith("“"))) s = s.slice(1, -1).trim();
    return s;
}

// --- Fakten-Guard ------------------------------------------------------------

function ziffernGruppen(text) {
    return (String(text || "").match(/\d+/g) || []);
}

// Deutsches Zahlwort fuer 0-99 ("2" -> "zwei"): schreibt das LLM eine Anzahl
// als Wort aus, ist das KEIN Faktenfehler (die Sprech-Schicht macht aus
// Ziffern ohnehin Woerter). Nur fuer die Fehl-Pruefung, nie umgekehrt.
const EINER = ["null", "ein", "zwei", "drei", "vier", "fuenf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwoelf", "dreizehn", "vierzehn", "fuenfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const ZEHNER = ["", "", "zwanzig", "dreissig", "vierzig", "fuenfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
function zahlwort(n) {
    if (n < 0 || n > 99) return "";
    if (n < 20) return EINER[n];
    const e = n % 10;
    const z = ZEHNER[Math.floor(n / 10)];
    return e ? `${EINER[e]}und${z}` : z;
}
function alsWortEnthalten(zifferGruppe, ausgabeLc) {
    const n = parseInt(zifferGruppe, 10);
    if (!Number.isFinite(n)) return false;
    const w = zahlwort(n).replace(/ue/g, "ü").replace(/oe/g, "ö").replace(/ss/g, "ß");
    const varianten = new Set([zahlwort(n), w]);
    if (n === 1) ["eins", "eine", "einen", "einem", "einer"].forEach((v) => varianten.add(v));
    for (const v of varianten) {
        if (v && ausgabeLc.includes(v)) return true;
    }
    return false;
}

// Multiset-Vergleich der Ziffern-Gruppen: Quelle ⊆ Ausgabe (Zahlwort zaehlt
// als Treffer) und KEINE neuen Ziffern in der Ausgabe. Kurze Gruppen werden
// numerisch kanonisiert ("09" == "9"); lange (Telefonnummern) bleiben exakt.
function ziffernOk(quelle, ausgabe) {
    const canon = (z) => (z.length <= 3 ? String(parseInt(z, 10)) : z);
    const zaehle = (arr) => {
        const m = new Map();
        for (const z of arr) m.set(canon(z), (m.get(canon(z)) || 0) + 1);
        return m;
    };
    const q = zaehle(ziffernGruppen(quelle));
    const a = zaehle(ziffernGruppen(ausgabe));
    const ausgabeLc = String(ausgabe || "").toLowerCase();
    for (const [z, n] of q) {
        if ((a.get(z) || 0) >= n) continue;
        if (alsWortEnthalten(z, ausgabeLc)) continue;
        return { ok: false, warum: `Ziffer "${z}" fehlt` };
    }
    for (const [z] of a) if (!q.has(z)) return { ok: false, warum: `Ziffer "${z}" dazuerfunden` };
    return { ok: true };
}

// Zahl-WOERTER sichern: Tages-/Patienten-Briefings schreiben Mengen und
// Uhrzeiten oft schon als Woerter ("sechs Termine", "neun Uhr dreissig").
// Der Ziffern-Guard sieht die nicht — deshalb muss jedes Zahlwort der Quelle
// auch in der Ausgabe stehen (mindestens gleich oft). "ein/eine/..." ist als
// Artikel zu mehrdeutig und bleibt ungeprueft; Umwandlung Wort->Ziffer faengt
// der Ziffern-Guard ("dazuerfunden").
const ZAHLWORT_RE = new RegExp(
    "\\b(?:(?:zwei|drei|vier|fuenf|fünf|sechs|sieben|acht|neun|zehn|elf|zwoelf|zwölf|" +
    "dreizehn|vierzehn|fuenfzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|" +
    "(?:(?:ein|zwei|drei|vier|fuenf|fünf|sechs|sieben|acht|neun)und)?" +
    "(?:zwanzig|dreissig|dreißig|vierzig|fuenfzig|fünfzig|sechzig|siebzig|achtzig|neunzig)))\\b",
    "gi"
);

function zahlwoerter(text) {
    const norm = (w) => w.toLowerCase().replace(/ü/g, "ue").replace(/ö/g, "oe").replace(/ß/g, "ss");
    return (String(text || "").match(ZAHLWORT_RE) || []).map(norm);
}

function zahlwoerterOk(quelle, ausgabe) {
    const zaehle = (arr) => {
        const m = new Map();
        for (const w of arr) m.set(w, (m.get(w) || 0) + 1);
        return m;
    };
    const q = zaehle(zahlwoerter(quelle));
    const a = zaehle(zahlwoerter(ausgabe));
    for (const [w, n] of q) {
        if ((a.get(w) || 0) < n) return { ok: false, warum: `Zahlwort "${w}" fehlt` };
    }
    return { ok: true };
}

// Personennamen: Woerter nach Anrede (Herr/Frau/Doktor/Dr.) muessen bleiben.
function namen(text) {
    const out = new Set();
    const re = /\b(?:Herrn?|Frau|Doktor|Dr\.?|Prof\.?)\s+([A-ZÄÖÜ][\wäöüß-]+)/g;
    let m;
    while ((m = re.exec(String(text || "")))) out.add(m[1]);
    return out;
}

function namenOk(quelle, ausgabe) {
    const soll = namen(quelle);
    const ist = String(ausgabe || "");
    for (const n of soll) {
        if (!ist.includes(n)) return { ok: false, warum: `Name "${n}" fehlt` };
    }
    return { ok: true };
}

/** Deterministischer Fakten-Check der Umformulierung. Exportiert fuer Tests. */
export function guardOk(quelle, ausgabe) {
    const q = String(quelle || "").trim();
    const a = String(ausgabe || "").trim();
    if (!a) return { ok: false, warum: "leer" };
    if (a.length < q.length * 0.5) return { ok: false, warum: "zu kurz" };
    if (a.length > q.length * 1.7 + 80) return { ok: false, warum: "zu lang" };
    if (/[€]|\beuro\b/i.test(a) && !/[€]|\beuro\b/i.test(q)) return { ok: false, warum: "Geldbetrag dazuerfunden" };
    if (/\p{Extended_Pictographic}/u.test(a)) return { ok: false, warum: "Emoji" };
    const z = ziffernOk(q, a);
    if (!z.ok) return z;
    const zw = zahlwoerterOk(q, a);
    if (!zw.ok) return zw;
    const n = namenOk(q, a);
    if (!n.ok) return n;
    return { ok: true };
}

// --- Umformulierung ----------------------------------------------------------

function freiSprechCfg() {
    return {
        enabled: process.env.MAS_FREISPRECH !== "0",
        baseUrl: (process.env.MAS_FREISPRECH_BASE_URL || "").trim() || undefined,
        model: (process.env.MAS_FREISPRECH_MODEL || "").trim() || undefined,
    };
}

/**
 * Formuliert einen deterministischen Ansage-Text menschlich und
 * variantenreich um. Fakten sichert guardOk(); bei JEDEM Zweifel kommt der
 * Originaltext zurueck ({ok:false} heisst nur "nicht umformuliert").
 *
 * @param {string} text deterministisch gebauter Ansage-Text (Fakten korrekt)
 * @param {{kontext?:string, timeoutMs?:number}} opts
 * @returns {Promise<{ok:boolean, text:string, warum?:string}>}
 */
export async function freiFormulieren(text, { kontext = "interne Team-Ansage", timeoutMs = 6500 } = {}) {
    const quelle = String(text || "").trim();
    const conf = freiSprechCfg();
    if (!conf.enabled || quelle.length < 60) return { ok: false, text: quelle, warum: "aus" };

    const bauePrompt = (stil, streng) => [
        "Du bist Clara, die Sprach-Assistentin einer deutschen Arztpraxis, und formulierst eine interne Ansage fuers Team NEU — natuerlich, menschlich, gesprochen.",
        "HARTE REGELN:",
        "1. Du DUZT den Chef immer ('du hast', 'denk dran') — NIE 'Sie'.",
        "2. ALLE Fakten unveraendert uebernehmen: jeden Namen, jede Zahl, jede Uhrzeit, jedes Datum, jede Warnung. Nichts weglassen, nichts dazuerfinden, nichts umdeuten.",
        "3. Zahlen, Uhrzeiten und Daten EXAKT als Ziffern lassen, wie sie dastehen (aus 13:40 wird NICHT 'zwanzig vor zwei'). Zahlwoerter bleiben Zahlwoerter.",
        "4. Termin-Notizen und Zitate (alles nach 'Geplant:', 'Notiz', 'Vorgang') WOERTLICH uebernehmen — dort nichts umformulieren.",
        "5. Medizinische Hinweise und Warnungen (Allergien, Medikamente, Vorerkrankungen) muessen deutlich hoerbar bleiben.",
        "6. KEINE Geldbetraege, keine Emojis, keine Aufzaehlungszeichen, kein Markdown, keine Anfuehrungszeichen um die Antwort.",
        "7. Gesprochene Sprache, fluessige Saetze, aehnliche Laenge wie das Original.",
        "8. KEINE Kausalitaeten erfinden: 'weil'/'deshalb'/'daher' NUR, wenn der Zusammenhang woertlich in der Quelle steht. Ein Termin passiert nicht 'wegen' eines Anamnese-Hinweises.",
        "9. KEINE Zeit-Einordnung dazuerfinden ('heute', 'morgen', 'gleich') — nur uebernehmen, was die Quelle sagt.",
        streng
            ? "STIL: Bleib nah am Original — aendere nur Satzanfaenge, Uebergaenge und Satzbau, KEINE Inhalte."
            : `STIL HEUTE: ${stil}`,
        "Antworte NUR mit der umformulierten Ansage.",
    ].join("\n");

    const user = `Kontext: ${kontext}\n\nOriginal-Ansage:\n${quelle}`;
    const deadline = Date.now() + timeoutMs;

    // Zwei Versuche: erst frei (Stil-Losung), bei Guard-Verstoss ein zweiter,
    // engerer Lauf. Beide teilen sich das Zeitbudget; sonst deterministisch.
    let letzterGrund = "";
    for (const streng of [false, true]) {
        const budget = deadline - Date.now();
        if (budget < 1500) break;
        try {
            const res = await chat(
                [{ role: "system", content: bauePrompt(ziehStil(), streng) }, { role: "user", content: user }],
                { temperature: streng ? 0.6 : 0.9, maxTokens: 700, timeoutMs: budget, baseUrl: conf.baseUrl, model: conf.model }
            );
            const neu = strip(res?.text);
            if (!res?.ok || !neu) { letzterGrund = res?.reason || "leer"; continue; }
            const g = guardOk(quelle, neu);
            if (!g.ok) {
                letzterGrund = g.warum;
                log.info("freisprech.guard_fallback", { warum: g.warum, streng });
                continue;
            }
            return { ok: true, text: neu };
        } catch (e) {
            letzterGrund = String(e?.message || e);
        }
    }
    return { ok: false, text: quelle, warum: letzterGrund };
}
