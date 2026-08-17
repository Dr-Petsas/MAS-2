import { chat, strongLlm } from "../mail/llm.js";
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
// Qwen-3.6-Kopplung (25.07.2026 geaendert): Standard ist jetzt das STARKE
// Modell (RTX-5090-Server, vLLM qwen3.6:35b-a3b, strongLlm()). Zuvor lief die
// Umformulierung auf dem schwachen lokalen qwen3:4b — das scheiterte zu oft am
// strengen Fakten-Guard (jede Zahl/jeder Name muss EXAKT erhalten bleiben) und
// fiel dann STILL auf den deterministischen Text zurueck: Briefings klangen
// "immer gleich steif". qwen3.6 haelt die Fakten zuverlaessig und formuliert
// variantenreich. Ist der 5090 nicht erreichbar, greift wie bisher der
// deterministische Fallback (kein Fakten-/Funktionsverlust, nur wieder steifer).
// Override/Notaus unveraendert:
//   MAS_FREISPRECH_BASE_URL / MAS_FREISPRECH_MODEL (anderer Server/Modell)
//   MAS_FREISPRECH=0 (alles bleibt deterministisch).
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
    "Baue EINEN natuerlichen Uebergang ein (z. B. 'dazu sollten Sie wissen'), sonst schlicht bleiben.",
    "Formuliere so, wie eine erfahrene Praxismanagerin es muendlich zusammenfassen wuerde.",
    "Wechsle die Satzlaenge: mal kurz und knackig, mal ein laengerer erklaerender Satz.",
    // "Stelle Zusammenhaenge her ('weil','deshalb')" stand hier — GESTRICHEN
    // 04.07.2026: Der Test zeigte eine ERFUNDENE Kausalitaet ("kommt zur PZR,
    // weil sie Marcumar nimmt"). Verbindungen herstellen darf nur die Quelle.
    "Nutze weiche Uebergaenge ('dabei', 'ausserdem', 'und', 'und zwar'), OHNE neue Zusammenhaenge zu behaupten.",
    // "Verbinde die Saetze mit Konjunktionen und Nebensaetzen" stand hier —
    // ENTSCHAERFT 17.08.2026: diese Losung erzeugte die 362-Zeichen-Monstersaetze
    // (siehe Regel 7b). Verbinden ja, aber paarweise.
    "Verbinde ZWEI Saetze mit einer Konjunktion, dann setz einen Punkt — muendliche Uebergabe, keine Liste, keine Endlosschleife.",
    "Sprich es wie eine kurze persoenliche Uebergabe am Empfang, nicht wie einen Bericht.",
    "Fang mit einer anderen Satzstellung an als das Original — Inhalt gleich, Bau anders.",
    "Wechsle das erste Verb: statt 'haben Sie' mal 'stehen', 'liegen', 'kommen zusammen'.",
    "Mach aus einem langen Satz zwei knappe.",
    "Setze die Uhrzeit einmal an eine andere Stelle im Satz, ohne sie zu aendern.",
    "Klinge wie nach dem dritten Kaffee: wach, knapp, ohne Floskeln.",
    "Klinge wie am Abend: ruhig, klar, ohne Eile.",
    "Lass den ersten Satz mit dem Tag beginnen, den zweiten mit dem, was auffaellt.",
    "Sag es so, als wuerdest du es einem Kollegen zurufen, der gerade die Tuer aufmacht.",
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

// 27.07.2026 (Live 17:15, Heads-up fuer heute): Aus dem deterministischen
// "Heute hatten Sie drei Termine ... Damit ist der Kalender fuer heute
// ABGEARBEITET." machte die Umformulierung "... damit ist der Kalender fuer
// heute LEER." — dieselbe Zahl, gegenteilige Aussage. Zahlen, Namen und Laenge
// stimmten, der Guard war blind. Eine Verneinung, die in der Quelle NICHT
// steht, darf die Umformulierung nicht einfuehren.
const VERNEINUNG_RE = /\b(leer|keine[nmrs]?|kein|nichts|niemand|nie)\b/i;

// Anrede-Bruch: "Du hast heute drei Termine" neben "Heute hatten Sie ..." in
// derselben Antwort. Nur pruefen, was den CHEF anspricht — ein "du" aus einem
// Zitat der Quelle darf bleiben.
const DUZEN_RE = /\b(du|dir|dich|dein|deine[mnrs]?)\b/i;

function anredeOk(quelle, ausgabe) {
    if (!DUZEN_RE.test(String(ausgabe || ""))) return { ok: true };
    if (DUZEN_RE.test(String(quelle || ""))) return { ok: true };
    return { ok: false, warum: "geduzt statt gesiezt" };
}

function verneinungOk(quelle, ausgabe) {
    if (!VERNEINUNG_RE.test(String(ausgabe || ""))) return { ok: true };
    if (VERNEINUNG_RE.test(String(quelle || ""))) return { ok: true };
    return { ok: false, warum: "Verneinung dazuerfunden" };
}

// 28.07.2026 (Live-Probe Lisa-Bericht): Aus "Lisa hat Dr. Petsas erreicht"
// machte die Umformulierung "ICH habe gerade Dr. Petsas erreicht" — Clara
// schmueckt sich mit Lisas Anruf, der Chef glaubt, Clara haette telefoniert.
// Namen und Zahlen stimmten, der Guard war blind. Regel: eine Ich-Tat
// (erreicht/angerufen/telefoniert/hinterlassen) darf nur behauptet werden,
// wenn die Quelle sie selbst als Ich-Tat formuliert.
const ICH_TAT_RE = /\bich\s+(?:habe|hab)\b[^.!?]{0,60}\b(?:erreicht|angerufen|telefoniert|hinterlassen)\b|\bich\s+(?:rufe|telefoniere)\b/i;

// "Dr." mitten im Satz sprengt sonst das [^.!?]-Fenster der Ich-Tat-Suche —
// "ich habe gerade Dr. Petsas erreicht" rutschte genau so durch (Live-Probe 2).
function ohneAbkPunkte(t) {
    return String(t || "").replace(/\b(Dr|Prof|Hr|Fr|St)\./g, "$1");
}

function handelndeOk(quelle, ausgabe) {
    if (!ICH_TAT_RE.test(ohneAbkPunkte(ausgabe))) return { ok: true };
    if (ICH_TAT_RE.test(ohneAbkPunkte(quelle))) return { ok: true };
    return { ok: false, warum: "Handelnden vertauscht (ich statt Lisa)" };
}

// "10 Uhr 30 Uhr" — das Modell haengt beim Umbauen gern ein zweites "Uhr" an.
// Reine Kosmetik am Wortlaut, keine Fakten-Aenderung.
function entdoppleUhr(text) {
    return String(text || "").replace(/(\d{1,2}\s*Uhr\s*\d{1,2})\s*Uhr\b/gi, "$1");
}

// W-UMBAU-2 Werkzeug 4 (28.07.2026): PFLICHTWOERTER. namenOk sieht nur Namen
// MIT Anrede (Herr/Frau/Doktor) — Absender wie "Finanzamt Bochum", Kalender-
// namen oder Zeitfenster ("vormittags") sind fuer den generischen Guard
// unsichtbar. Der Aufrufer kennt seine kritischen Woerter und gibt sie mit;
// fehlt eines in der Umformulierung (Gross-/Kleinschreibung egal), bleibt der
// deterministische Text. Exportiert fuer Tests.
export function pflichtOk(pflicht, ausgabe) {
    const a = String(ausgabe || "").toLowerCase();
    for (const w of pflicht || []) {
        const wort = String(w || "").trim();
        if (wort && !a.includes(wort.toLowerCase())) {
            return { ok: false, warum: `Pflichtwort "${wort}" fehlt` };
        }
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
    const v = verneinungOk(q, a);
    if (!v.ok) return v;
    const an = anredeOk(q, a);
    if (!an.ok) return an;
    const h = handelndeOk(q, a);
    if (!h.ok) return h;
    return { ok: true };
}

// --- Umformulierung ----------------------------------------------------------

function freiSprechCfg() {
    // Default = starkes Modell (siehe Kopf-Kommentar). Env-Override sticht.
    const strong = strongLlm();
    return {
        enabled: process.env.MAS_FREISPRECH !== "0",
        baseUrl: (process.env.MAS_FREISPRECH_BASE_URL || "").trim() || strong.base,
        model: (process.env.MAS_FREISPRECH_MODEL || "").trim() || strong.model,
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
export async function freiFormulieren(text, { kontext = "interne Team-Ansage", timeoutMs = 11000, pflicht = [] } = {}) {
    const quelle = String(text || "").trim();
    const conf = freiSprechCfg();
    if (!conf.enabled || quelle.length < 40) return { ok: false, text: quelle, warum: "aus" };

    const bauePrompt = (stil, streng) => [
        "Du bist Clara, die Sprach-Assistentin einer deutschen Arztpraxis, und formulierst eine interne Ansage fuers Team NEU — natuerlich, menschlich, gesprochen.",
        "HARTE REGELN:",
        // Chef 27.07.2026: EINE Anrede. Die deterministischen Ansagen siezen
        // ("Heute hatten Sie 3 Termine") — die Umformulierung duzte ("Du hast
        // heute ..."), in derselben Antwort. Jetzt siezt beides.
        "1. Du SIEZT den Chef immer ('Sie haben', 'denken Sie dran') — NIE 'du'.",
        "2. ALLE Fakten unveraendert uebernehmen: jeden Namen, jede Zahl, jede Uhrzeit, jedes Datum, jede Warnung. Nichts weglassen, nichts dazuerfinden, nichts umdeuten.",
        "3. Zahlen, Uhrzeiten und Daten EXAKT als Ziffern lassen, wie sie dastehen (aus 13:40 wird NICHT 'zwanzig vor zwei'). Zahlwoerter bleiben Zahlwoerter.",
        "4. Termin-Notizen und Zitate (alles nach 'Geplant:', 'Notiz', 'Vorgang') WOERTLICH uebernehmen — dort nichts umformulieren.",
        "5. Medizinische Hinweise und Warnungen (Allergien, Medikamente, Vorerkrankungen) muessen deutlich hoerbar bleiben.",
        "6. KEINE Geldbetraege, keine Emojis, keine Aufzaehlungszeichen, kein Markdown, keine Anfuehrungszeichen um die Antwort.",
        "7. Gesprochene Sprache, fluessige Saetze mit Konjunktionen und Nebensaetzen (und, dabei, ausserdem, und zwar). Aehnliche Laenge wie das Original. KEINE Aufzaehlung 'erstens, zweitens'.",
        // 17.08.2026 (Tempo-Messung): Die Umformulierung zog gern alles zu EINEM
        // Satz zusammen — 362 Zeichen ohne einen einzigen Punkt. Der Sprech-Pfad
        // schneidet erst an Satzenden, also ging das als ein Block in die
        // Sprachsynthese: rund vier Sekunden, bis der erste Ton kam. Kurze Saetze
        // klingen nicht nur besser, sie fangen auch frueher an zu klingen.
        "7b. HOECHSTENS 20 Woerter pro Satz. Lieber zwei Saetze als ein langer. Nach jedem Gedanken ein Punkt — niemals drei Aussagen in einem Satz stapeln.",
        "8. KEINE Kausalitaeten erfinden: 'weil'/'deshalb'/'daher' NUR, wenn der Zusammenhang woertlich in der Quelle steht. Ein Termin passiert nicht 'wegen' eines Anamnese-Hinweises.",
        "9. KEINE Zeit-Einordnung dazuerfinden ('heute', 'morgen', 'gleich') — nur uebernehmen, was die Quelle sagt.",
        "10. Handelnde NIE vertauschen: Wenn LISA angerufen/erreicht hat, bleibt es 'Lisa hat ...' — NIEMALS 'ich habe angerufen/erreicht'. Du berichtest nur.",
        // Live-Probe Wiedervorlage (28.07.2026): Die Umformulierung haengte
        // "Bitte passt das an." an — eine Arbeitsanweisung, die niemand
        // erteilt hat. Berichten heisst berichten.
        "11. KEINE Aufforderungen oder Bitten dazuerfinden ('bitte anpassen', 'kuemmert euch darum', 'denkt daran') — ausser die Quelle enthaelt sie woertlich.",
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
            const neu = entdoppleUhr(strip(res?.text));
            if (!res?.ok || !neu) { letzterGrund = res?.reason || "leer"; continue; }
            const g = guardOk(quelle, neu);
            if (!g.ok) {
                letzterGrund = g.warum;
                log.info("freisprech.guard_fallback", { warum: g.warum, streng });
                continue;
            }
            const p = pflichtOk(pflicht, neu);
            if (!p.ok) {
                letzterGrund = p.warum;
                log.info("freisprech.guard_fallback", { warum: p.warum, streng });
                continue;
            }
            return { ok: true, text: neu };
        } catch (e) {
            letzterGrund = String(e?.message || e);
        }
    }
    return { ok: false, text: quelle, warum: letzterGrund };
}
