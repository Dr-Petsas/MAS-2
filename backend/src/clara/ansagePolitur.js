import crypto from "node:crypto";

import { log } from "../log.js";
import { freiFormulieren } from "./freiSprech.js";

// ============================================================================
// Ansage-Politur ohne Wartezeit (17.08.2026, Chef-Vorgabe "keine Stille > 2 s")
// ============================================================================
// Messung 17.08.2026 an echten Anrufen: Clara sprach nach ihrer Quittung
// ("Einen Moment, ich schaue nach") 11 s (Tages-Lagebild) bis 24 s (E-Mails)
// NICHTS. Die Wartezeit entstand fast vollstaendig hier: jede fertige Ansage
// lief zur Politur durch freiFormulieren (starkes Modell, 8-12 s, zwei
// Versuche). Dabei gilt:
//
//   * Der Fakten-Guard laesst kaum echte Umformulierung zu (jede Ziffer, jeder
//     Name muss stehen bleiben) — der Gewinn sind wenige Woerter.
//   * Bei 11 von 44 Tages-Briefings verwarf der Guard das Ergebnis am Ende
//     trotzdem ("Ziffer 45 fehlt") — die Wartezeit war komplett umsonst.
//   * Das kleine lokale Modell ist schneller (2-5 s), nimmt aber nur 3 von 5
//     Ansagen durch den Guard und baute im Test einen Sprechfehler ein.
//
// Konsequenz: Die Politur bleibt erhalten, verlaesst aber das Wartefenster.
//
//   1. Cache-Treffer  -> polierter Text SOFORT (0 ms).
//   2. Cache-Fehler   -> deterministischer Text SOFORT; die Politur laeuft im
//                        HINTERGRUND und liegt beim naechsten Mal bereit.
//
// Damit wartet niemand mehr auf Kosmetik, und weil der Chef dieselben Ansagen
// mehrfach am Tag abruft (Tages-Lagebild, Eingaenge), ist der Cache haeufig
// warm. Die Fakten kommen unveraendert aus dem deterministischen Text; am
// Guard aendert sich nichts.
//
// Notaus:
//   MAS_ANSAGE_POLITUR=0    -> gar keine Politur mehr (immer deterministisch)
//   MAS_POLITUR_SOFORT=0    -> Alt-Verhalten: auf die Politur WARTEN
//   MAS_POLITUR_WARTEN_MS   -> kurzes Zeitfenster, in dem doch gewartet wird
//                              (Standard 0 = nie warten)
//   MAS_POLITUR_TTL_MIN     -> Haltbarkeit im Cache (Standard 240 Minuten)

const MAX_EINTRAEGE = 300;

/** @type {Map<string, {text: string, bis: number}>} */
const cache = new Map();
/** @type {Set<string>} */
const laufend = new Set();

let treffer = 0;
let fehler = 0;
let hintergrundOk = 0;
let hintergrundVerworfen = 0;

const an = () => process.env.MAS_ANSAGE_POLITUR !== "0";
const sofort = () => process.env.MAS_POLITUR_SOFORT !== "0";
const wartenMs = () => Math.max(0, Number(process.env.MAS_POLITUR_WARTEN_MS || 0));
const ttlMs = () => Math.max(1, Number(process.env.MAS_POLITUR_TTL_MIN || 240)) * 60_000;

function schluessel(text, kontext, pflicht) {
    const roh = `${kontext}\u0000${(pflicht || []).join("\u0001")}\u0000${text}`;
    return crypto.createHash("sha1").update(roh).digest("hex");
}

/**
 * Polierte Fassung holen — und dabei VERBRAUCHEN. Eine Politur wird also
 * hoechstens EINMAL gesprochen (17.08.2026): Das Modell formuliert gelegentlich
 * schief ("Achtung, das Team, es brennt."), und was im Cache liegen bleibt,
 * wuerde der Chef sonst stundenlang wiederholt hoeren. So wechselt sich der
 * geprueft-deterministische Text mit jeweils frischen Varianten ab.
 */
function ausCache(key) {
    const e = cache.get(key);
    if (!e) return "";
    cache.delete(key);
    if (e.bis < Date.now()) return "";
    return e.text;
}

function inCache(key, text) {
    cache.set(key, { text, bis: Date.now() + ttlMs() });
    while (cache.size > MAX_EINTRAEGE) {
        const aeltester = cache.keys().next().value;
        if (aeltester === undefined) break;
        cache.delete(aeltester);
    }
}

/**
 * Politur im Hintergrund anstossen. Laeuft absichtlich ohne await: der
 * Aufrufer hat seine Antwort schon gesprochen, das Ergebnis ist fuer den
 * naechsten Abruf derselben Ansage.
 */
function imHintergrund(key, quelle, opts) {
    if (laufend.has(key)) return null;
    laufend.add(key);
    const p = freiFormulieren(quelle, opts)
        .then((r) => {
            if (r?.ok && r.text) {
                inCache(key, r.text);
                hintergrundOk += 1;
                return r.text;
            }
            hintergrundVerworfen += 1;
            return "";
        })
        .catch((e) => {
            hintergrundVerworfen += 1;
            log.info("politur.hintergrund_fehler", { warum: String(e?.message || e) });
            return "";
        })
        .finally(() => {
            laufend.delete(key);
        });
    return p;
}

/**
 * Ansage polieren, OHNE das Gespraech aufzuhalten.
 *
 * Rueckgabe ist bewusst formgleich zu freiFormulieren, damit alle
 * Aufrufstellen unveraendert weiterarbeiten koennen:
 * ``{ ok, text }`` — ``ok:false`` heisst nur "nicht poliert", ``text`` ist
 * dann der unveraenderte, faktensichere Quelltext.
 *
 * @param {string} text deterministisch gebaute Ansage (Fakten korrekt)
 * @param {{kontext?: string, pflicht?: string[], timeoutMs?: number}} opts
 * @returns {Promise<{ok: boolean, text: string, quelle?: string}>}
 */
export async function politurSchnell(text, opts = {}) {
    const quelle = String(text || "").trim();
    if (!quelle || !an()) return { ok: false, text: quelle };

    // Alt-Verhalten auf Wunsch: warten wie vor dem 17.08.2026.
    if (!sofort()) {
        try {
            return await freiFormulieren(quelle, opts);
        } catch (e) {
            return { ok: false, text: quelle, warum: String(e?.message || e) };
        }
    }

    const kontext = opts.kontext || "interne Team-Ansage";
    const pflicht = opts.pflicht || [];
    const key = schluessel(quelle, kontext, pflicht);

    const fertig = ausCache(key);
    if (fertig) {
        treffer += 1;
        log.info("politur.treffer", { kontext, zeichen: fertig.length });
        return { ok: true, text: fertig };
    }

    fehler += 1;
    const lauf = imHintergrund(key, quelle, { ...opts, kontext, pflicht });

    // Optionales Mini-Zeitfenster: wer will, wartet ein paar hundert
    // Millisekunden mit — Standard ist 0, also nie.
    const warten = wartenMs();
    if (warten > 0 && lauf) {
        const poliert = await Promise.race([
            lauf,
            new Promise((r) => setTimeout(() => r(""), warten)),
        ]);
        if (poliert) return { ok: true, text: poliert };
    }
    return { ok: false, text: quelle };
}

/**
 * Ansage im Voraus polieren (Vorwaermer). Wartet auf das Ergebnis, damit ein
 * Planer den Cache gezielt fuellen kann — NIE aus einem Anfrage-Pfad rufen.
 */
export async function politurVorwaermen(text, opts = {}) {
    const quelle = String(text || "").trim();
    if (!quelle || !an() || !sofort()) return false;
    const kontext = opts.kontext || "interne Team-Ansage";
    const pflicht = opts.pflicht || [];
    const key = schluessel(quelle, kontext, pflicht);
    if (ausCache(key)) return true;
    const lauf = imHintergrund(key, quelle, { ...opts, kontext, pflicht });
    if (!lauf) return false;
    const poliert = await lauf;
    return !!poliert;
}

export function politurStatus() {
    return {
        an: an(),
        sofort: sofort(),
        wartenMs: wartenMs(),
        eintraege: cache.size,
        laufend: laufend.size,
        treffer,
        fehler,
        hintergrundOk,
        hintergrundVerworfen,
    };
}
