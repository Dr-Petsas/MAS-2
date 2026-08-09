/**
 * PICKADOC AI IMPROVE — Pflege- und Verbesserungs-Modul fuer die Praxis
 * (Auftrag Dr. Petsas, 09.08.2026).
 *
 * Idee: Kein internes Entwicklerwerkzeug, sondern ein festes Modul, das jede
 * Praxis mitgeliefert bekommt. Der Inhaber meldet im Klartext, was nicht
 * funktioniert ("Clara versteht Frau El Hajjami immer falsch"); das System
 * sucht die passenden Gespraeche, zeigt die Verarbeitungskette und spaeter den
 * Vorher/Nachher-Beleg einer Verbesserung.
 *
 * EHRLICHKEITSREGEL (wichtig): Diese Datei erfindet keine Kennzahlen. Alles,
 * was wir heute noch nicht messen, kommt als null zurueck und wird auf der
 * Seite als "noch nicht gemessen" angezeigt. Eine schoene Zahl, die niemand
 * belegen kann, ist schlimmer als ein ehrliches Fragezeichen — der Chef
 * wuerde sonst Entscheidungen auf Erfundenem treffen.
 *
 * Datenquellen (liegen auf demselben Rechner wie der Sprach-Dienst):
 *   .run/protokoll/turns-JJJJMMTT.jsonl  — ein Eintrag je Gespraechszug
 *   .run/call_transcripts/<anruf>.json   — Tonaufnahme + Abschnitte je Anruf
 *
 * Zwei Ebenen, strikt getrennt (Vorgabe des Chefs):
 *   - Was die Praxis selbst pflegen darf (Namen, Rueckfrage-Empfindlichkeit,
 *     Gespraechsstil), wird hier als Fall vom Typ "einstellung" gefuehrt.
 *   - Was Code oder Erkennungsstrecke betrifft, wird zum technischen Fall fuer
 *     die zentrale Entwicklung und geht NIE ungeprueft in eine Instanz.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { masCollection } from "./tenant.js";

const COL_FAELLE = "mas_improve_faelle";

/** Wo der Sprach-Dienst seine Protokolle ablegt. */
function runDir() {
  const gesetzt = String(process.env.CLARA_RUN_DIR || "").trim();
  if (gesetzt) return gesetzt;
  // Standard: Nachbarordner des Backends (F:\MAS-2\backend -> F:\Clara-Voice\.run)
  const hier = path.dirname(fileURLToPath(import.meta.url));
  return path.join(hier, "..", "..", "..", "Clara-Voice", ".run");
}

function zahl(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Perzentil einer Zahlenreihe (0..1). Leere Reihe -> null. */
export function perzentil(werte, anteil) {
  const xs = (werte || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.ceil(anteil * xs.length) - 1));
  return xs[idx];
}

/**
 * Zuege aus den Tagesprotokollen lesen (PUR bis auf das Dateilesen).
 *
 * @param {number} tage  wie viele Tage zurueck
 * @returns {Promise<Array<object>>} Zuege, neueste zuletzt
 */
export async function leseZuege({ tage = 7, max = 2000 } = {}) {
  const dir = path.join(runDir(), "protokoll");
  let dateien = [];
  try {
    dateien = (await readdir(dir)).filter((f) => /^turns-\d{8}\.jsonl$/.test(f)).sort();
  } catch {
    return [];  // kein Protokoll vorhanden -> ehrlich leer
  }
  const grenze = new Date(Date.now() - tage * 86400000);
  const stempel = `${grenze.getFullYear()}${String(grenze.getMonth() + 1).padStart(2, "0")}${String(grenze.getDate()).padStart(2, "0")}`;
  const passend = dateien.filter((f) => f.slice(6, 14) >= stempel);
  const zuege = [];
  for (const f of passend) {
    let text = "";
    try {
      text = await readFile(path.join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const zeile of text.split("\n")) {
      const s = zeile.trim();
      if (!s) continue;
      try {
        zuege.push(JSON.parse(s));
      } catch {
        // eine kaputte Zeile darf den Rest nicht kosten
      }
    }
  }
  return zuege.slice(-max);
}

/**
 * Kennzahlen aus den Zuegen berechnen (PUR — deshalb einzeln testbar).
 *
 * Alles, was wir noch nicht messen, ist ausdruecklich null.
 */
export function kennzahlen(zuege) {
  const liste = Array.isArray(zuege) ? zuege : [];
  const dauern = liste.map((z) => zahl(z?.dauer_ms)).filter((x) => x !== null);
  const mitWerkzeug = liste.filter((z) => Array.isArray(z?.tools) && z.tools.length).length;
  const abgebrochen = liste.filter((z) => z?.abgebrochen).length;
  const mitTon = liste.filter((z) => z?.audio).length;

  const werkzeugZaehler = new Map();
  let werkzeugFehler = 0;
  for (const z of liste) {
    for (const t of Array.isArray(z?.tools) ? z.tools : []) {
      const name = String(t?.name || t?.tool || t || "").trim();
      if (name) werkzeugZaehler.set(name, (werkzeugZaehler.get(name) || 0) + 1);
      const st = String(t?.status || "").toLowerCase();
      if (st && st !== "ok" && st !== "200") werkzeugFehler++;
    }
  }
  const waechterZaehler = new Map();
  for (const z of liste) {
    for (const w of Array.isArray(z?.waechter) ? z.waechter : []) {
      const name = String(w?.name || w || "").trim();
      if (name) waechterZaehler.set(name, (waechterZaehler.get(name) || 0) + 1);
    }
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, anzahl]) => ({ name, anzahl }));

  return {
    zuege: liste.length,
    antwortzeit_median_ms: perzentil(dauern, 0.5),
    antwortzeit_p95_ms: perzentil(dauern, 0.95),
    anteil_mit_werkzeug: liste.length ? Math.round((mitWerkzeug / liste.length) * 100) : null,
    abgebrochen,
    werkzeug_fehler: werkzeugFehler,
    top_werkzeuge: top(werkzeugZaehler),
    top_waechter: top(waechterZaehler),
    // Verknuepfung Ton <-> Entscheidung (seit 09.08.2026). Aeltere Zuege haben
    // sie nicht — deshalb wird der Anteil offen ausgewiesen statt beschoenigt.
    anteil_mit_tonbezug: liste.length ? Math.round((mitTon / liste.length) * 100) : null,
    // NOCH NICHT GEMESSEN — bewusst null, siehe Ehrlichkeitsregel oben.
    namensgenauigkeit: null,
    patient_erkannt: null,
    falsche_aktionen: null,
    rueckfragequote: null,
  };
}

/** Die letzten Zuege in kurzer, lesbarer Form fuer die Seite. */
export function zuegeFuerAnzeige(zuege, limit = 60) {
  return (Array.isArray(zuege) ? zuege : []).slice(-limit).reverse().map((z) => ({
    ts: String(z?.ts || ""),
    gehoert: String(z?.nutzer || ""),
    gesprochen: String(z?.gesprochen || ""),
    werkzeuge: (Array.isArray(z?.tools) ? z.tools : [])
      .map((t) => String(t?.name || t?.tool || t || "")).filter(Boolean),
    waechter: (Array.isArray(z?.waechter) ? z.waechter : [])
      .map((w) => String(w?.name || w || "")).filter(Boolean),
    dauer_ms: zahl(z?.dauer_ms),
    abgebrochen: !!z?.abgebrochen,
    anruf: String(z?.anruf || ""),
    audio: String(z?.audio || ""),
  }));
}

/**
 * Einordnung einer Klartext-Meldung: Darf die Praxis das selbst richten oder
 * ist es ein technischer Fall fuer die zentrale Entwicklung? (PUR)
 *
 * Bewusst grob und ehrlich: Diese Einordnung ist ein VORSCHLAG fuer die
 * spaetere Analyse, keine Diagnose. Sie entscheidet nur, an welcher Stelle die
 * Meldung landet — nie, was tatsaechlich geaendert wird.
 */
export function ordneEin(text) {
  const t = String(text || "").toLowerCase();
  const hoeren = /(versteht|verstanden|h(ö|oe)rt|namen?|ausspr|akzent|nuschel|falsch geschrieben)/.test(t);
  const nachfrage = /(fragt|nachfrage|r(ü|ue)ckfrage|zu oft|st(ä|ae)ndig wieder)/.test(t);
  const stil = /(ton|stil|f(ö|oe)rmlich|freundlich|zu lang|zu kurz|redet zu viel)/.test(t);
  const aktion = /(falsche[rn]? (termin|patient)|abgesagt|verschoben|gebucht|geschickt|doppelt)/.test(t);
  if (aktion) return { bereich: "handeln", ebene: "technisch" };
  if (hoeren) return { bereich: "hoeren", ebene: "einstellung" };
  if (nachfrage) return { bereich: "denken", ebene: "einstellung" };
  if (stil) return { bereich: "gespraech", ebene: "einstellung" };
  return { bereich: "unklar", ebene: "technisch" };
}

/** Eine Klartext-Meldung der Praxis aufnehmen. */
export async function meldeFall(clientId, { text, meldung_von = "" } = {}) {
  const sauber = String(text || "").trim().slice(0, 2000);
  if (!sauber) return { ok: false, reason: "text_required" };
  const einordnung = ordneEin(sauber);
  const ref = masCollection(clientId, COL_FAELLE).doc();
  await ref.set({
    text: sauber,
    ...einordnung,
    status: "neu",
    meldung_von: String(meldung_von || "").slice(0, 120),
    createdAt: Date.now(),
  });
  return { ok: true, id: ref.id, ...einordnung };
}

/** Gemeldete Faelle, neueste zuerst. */
export async function listeFaelle(clientId, { limit = 50 } = {}) {
  const snap = await masCollection(clientId, COL_FAELLE)
    .orderBy("createdAt", "desc").limit(Math.min(200, Math.max(1, limit))).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Woerter, die eine Meldung beschreiben, aber keinen einzelnen Fall
 * kennzeichnen — Anreden, Namen der Assistentinnen, Alltagsvokabular der
 * Praxis. In einem kleinen Bestand wirken sie faelschlich "selten" und wuerden
 * dann beliebige Gespraeche als Beleg anziehen. Sie sind deshalb fest
 * ausgeschlossen, unabhaengig von der Haeufigkeit.
 */
const ALLERWELT = new Set([
  "clara", "lena", "lisa", "nadine", "sophie", "bianca",
  "frau", "herr", "patient", "patientin", "praxis", "termin", "termine",
  "bitte", "immer", "nicht", "wieder", "schon", "noch", "oder", "aber", "auch",
  "wird", "wurde", "haben", "hatte", "kann", "kannst", "koennen", "können",
  "sind", "wenn", "dass", "eine", "einen", "einem", "einer", "eines", "sich",
  "mein", "meine", "meinen", "unsere", "unser", "dann", "beim", "zusammen",
  "versteht", "verstehen", "verstanden", "macht", "machen", "geht", "sagt",
]);

/**
 * Zu einer Meldung passende Gespraechszuege suchen (PUR).
 *
 * Entscheidend ist die Gewichtung nach SELTENHEIT. Eine reine Wortsuche liefert
 * unbrauchbaren Sand: Bei "Clara versteht Frau El Hajjami immer falsch" zaehlen
 * sonst "clara" und "frau" als Treffer, und die Praxis bekommt zehn voellig
 * fremde Gespraeche als angeblichen Beleg. Woerter, die ohnehin in fast jedem
 * Gespraech vorkommen, tragen deshalb nichts bei; ein seltener Name traegt
 * fast alles. Lieber wenige echte Treffer als eine lange, wertlose Liste.
 */
export function passendeZuege(zuege, text, limit = 10) {
  const liste = Array.isArray(zuege) ? zuege : [];
  const worte = [...new Set(String(text || "").toLowerCase()
    .split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 4 && !ALLERWELT.has(w)))];
  if (!worte.length || !liste.length) return [];

  const heuhaufen = liste.map((z) => `${z?.nutzer || ""} ${z?.gesprochen || ""}`.toLowerCase());
  // Nur KENNZEICHNENDE Woerter zaehlen: solche, die in hoechstens wenigen
  // Prozent der Gespraeche vorkommen. Alles Haeufige ("clara", "frau",
  // "termin") ist als Beleg wertlos und wuerde die Liste mit Unbeteiligtem
  // fluten. Kommt am Ende nichts heraus, ist das die richtige Antwort — dann
  // steht der gesuchte Name naemlich in KEINEM Protokoll, weil die
  // Spracherkennung ihn damals ganz anders verstanden hat. Genau das muss die
  // Praxis sehen, statt zehn erfundener Belege.
  const schwelle = Math.max(1, Math.ceil(liste.length * 0.03));
  const gewicht = new Map();
  for (const w of worte) {
    const df = heuhaufen.reduce((n, h) => n + (h.includes(w) ? 1 : 0), 0);
    gewicht.set(w, df === 0 || df > schwelle ? 0 : 1 / df);
  }
  if (Math.max(...gewicht.values()) <= 0) return [];  // nichts Kennzeichnendes

  const bewertet = [];
  for (let i = 0; i < liste.length; i++) {
    let punkte = 0;
    for (const w of worte) if (gewicht.get(w) > 0 && heuhaufen[i].includes(w)) punkte += gewicht.get(w);
    if (punkte > 0) bewertet.push({ punkte, zug: liste[i] });
  }
  return bewertet.sort((a, b) => b.punkte - a.punkte).slice(0, limit).map((x) => x.zug);
}
