/**
 * PICKADOC AI IMPROVE — Verbesserungs-Modul fuer die Praxis
 * (Auftrag Dr. Petsas, 09.08.2026).
 *
 * Idee: Kein internes Entwicklerwerkzeug, sondern ein festes Modul, das jede
 * Praxis mitgeliefert bekommt. Der Inhaber meldet im Klartext, was nicht
 * funktioniert ("Clara versteht Frau El Hajjami immer falsch") — und sieht an
 * genau diesem Fall, wie das Problem angegangen und geloest wird.
 *
 * ZWEI ENTSCHEIDUNGEN, die der Chef ausdruecklich so wollte:
 *
 * 1. KEINE Kennzahlen-Uebersicht. Ein sichtbarer, konkreter Lauf an einem
 *    echten Fall ist ihm mehr wert als jede Statistik.
 *
 * 2. Das LETZTE GESPRAECH wird automatisch als Beleg angehaengt, statt nach
 *    den Meldeworten zu suchen. Grund: Der Inhaber meldet direkt nach dem
 *    misslungenen Anruf. Eine Wortsuche scheitert hier systematisch — der
 *    falsch gehoerte Name steht ja gerade NICHT im Protokoll (aus
 *    "Ouafa El Hajjami" wurde "Hayla Elot Money"). Das letzte Gespraech ist
 *    dagegen ein sicherer Treffer.
 *
 * EHRLICHKEITSREGEL: Ein Schritt wird nie als erledigt gezeigt, wenn er nur
 * geplant ist, und es wird nichts geraten. Wo etwas fehlt, steht der Grund
 * dabei. Eine schoen aussehende Anzeige, die nichts belegt, waere schlimmer
 * als eine ehrliche Luecke — der Chef trifft danach Entscheidungen.
 *
 * Datenquellen (auf demselben Rechner wie der Sprach-Dienst):
 *   .run/protokoll/turns-JJJJMMTT.jsonl  — Werkzeugwahl je Gespraechszug
 *   .run/call_transcripts/<anruf>.json   — Wortlaut und Tonaufnahme je Anruf
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { masCollection } from "./tenant.js";
import { getAssistantName, withAssistantName } from "./shared/rufname.js";
import { zentralEintragen } from "./improveZentrale.js";
import { entryCodes, buildIndex, catalogMatch } from "./clara/patientCatalog.js";
import { log } from "./log.js";
import { chat, strongLlm } from "./mail/llm.js";

const COL_FAELLE = "mas_improve_faelle";

/** Wo der Sprach-Dienst seine Protokolle ablegt. */
function runDir() {
  const gesetzt = String(process.env.CLARA_RUN_DIR || "").trim();
  if (gesetzt) return gesetzt;
  // Standard: Nachbarordner des Backends (F:\MAS-2\backend -> F:\Clara-Voice\.run)
  const hier = path.dirname(fileURLToPath(import.meta.url));
  return path.join(hier, "..", "..", "..", "Clara-Voice", ".run");
}

/**
 * Entscheidungsprotokoll der letzten Tage lesen. Dort steht, welches Werkzeug
 * Clara je Zug gewaehlt hat — die Tonaufnahme allein weiss das nicht.
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
 * KATEGORIEN, die der Kunde auswaehlt.
 *
 * Warum feste Auswahl statt Freitext (Chef 09.08.2026): "Das Erkennen des
 * Problems ist der erste Schritt." Ein Praxisinhaber, der einen Roman
 * schreibt, liefert keine verwertbare Meldung; sechs klare Bilder dagegen
 * fuehren ihn in zwei Sekunden zur richtigen Schublade.
 *
 * Jede Kategorie zeigt auf eine FEHLERKLASSE — dieselbe Sprache, in der das
 * Testlabor Befunde fuehrt (siehe testlab/store.js). Genau diese Klasse ist
 * spaeter die Klammer, an der alle Praxen gemeinsam profitieren: Nicht die
 * einzelne Loesung wird geteilt, sondern der abstrakte Fehlerfall.
 *
 * `ebene` sagt, WO die Loesung liegt:
 *   "einstellung" — die Praxis kann das selbst pflegen
 *   "technisch"   — geht als Fall an die Entwicklung, nie ungeprueft zurueck
 */
export const KATEGORIEN = [
  {
    id: "verhoert",
    titel: "Falsch verstanden",
    hinweis: "Ein Name oder Wort kam falsch an.",
    beispiel: "„Aus Ouafa El Hajjami wurde El Hayani.“",
    symbol: "ohr",
    fehlerklasse: "verhoert_name",
    bereich: "hoeren",
    ebene: "einstellung",
    fragtNamen: true,
  },
  {
    id: "falsche_daten",
    titel: "Falsche Auskunft",
    hinweis: "Termin, Uhrzeit oder Zahl stimmte nicht.",
    beispiel: "„Sie nannte den Dienstag statt den Mittwoch.“",
    symbol: "kalender",
    fehlerklasse: "falsche_daten",
    bereich: "denken",
    ebene: "technisch",
  },
  {
    id: "erfunden",
    titel: "Etwas erfunden",
    hinweis: "Sie behauptete etwas, das es nicht gibt.",
    beispiel: "„Sie sagte, die SMS sei raus — war sie nicht.“",
    symbol: "warnung",
    fehlerklasse: "halluziniert",
    bereich: "handeln",
    ebene: "technisch",
  },
  {
    id: "nichts_passiert",
    titel: "Nichts passiert",
    hinweis: "Der Auftrag wurde nicht ausgeführt.",
    beispiel: "„Sie hat geantwortet, aber nichts verschickt.“",
    symbol: "leer",
    fehlerklasse: "keine_aktion",
    bereich: "handeln",
    ebene: "technisch",
  },
  {
    id: "falsche_aktion",
    titel: "Falsche Aktion",
    hinweis: "Falscher Patient, falscher Termin, doppelt.",
    beispiel: "„Der Termin der falschen Frau Meier wurde abgesagt.“",
    symbol: "kreuz",
    fehlerklasse: "falsches_tool",
    bereich: "handeln",
    ebene: "technisch",
  },
  {
    id: "umstaendlich",
    titel: "Umständlich oder langsam",
    hinweis: "Zu viele Rückfragen, zu lang, zu langsam.",
    beispiel: "„Sie fragt dreimal nach, bevor etwas passiert.“",
    symbol: "uhr",
    fehlerklasse: "gespraechsfluss",
    bereich: "gespraech",
    ebene: "einstellung",
  },
];

/** Kategorie nachschlagen. Unbekanntes ergibt null — nie geraten. */
export function findeKategorie(id) {
  return KATEGORIEN.find((k) => k.id === String(id || "")) || null;
}

/**
 * Einordnung einer FREITEXT-Meldung (Rueckfallweg, wenn keine Kategorie
 * gewaehlt wurde). Entscheidet nur, WO die Meldung landet — nie, was
 * tatsaechlich geaendert wird. Unklares geht absichtlich an die Entwicklung
 * und nicht an die Praxis.
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

/**
 * Den Zeitstempel aus einem Aufnahmenamen ziehen (PUR).
 *
 * Die Namen sehen so aus: clara_<praxis>_<zufall>_20260810T131949.json — das
 * Zufallskuerzel steht VOR der Zeit. Wer solche Namen einfach alphabetisch
 * sortiert, sortiert nach dem Zufall, nicht nach dem Datum. Genau das ist am
 * 10.08.2026 passiert: Einer Meldung wurde ein zwei Wochen altes Gespraech
 * angehaengt, weil dessen Kuerzel zufaellig groesser war. Leerer Rueckgabewert
 * heisst "keine Zeit erkennbar" — solche Dateien landen hinten.
 */
export function zeitAusAufnahmename(name) {
  const m = /(\d{8}T\d{6})/.exec(String(name || ""));
  return m ? m[1] : "";
}

/**
 * Das ZULETZT gefuehrte Gespraech holen.
 *
 * Ueberspringt Anrufe ohne einen einzigen Nutzerbeitrag: Ein Anruf, in dem nur
 * Clara "Was brauchen Sie?" gesagt hat, belegt nichts.
 */
export async function letztesGespraech({ maxPruefen = 40 } = {}) {
  const dir = path.join(runDir(), "call_transcripts");
  let dateien = [];
  try {
    const alle = await readdir(dir, { withFileTypes: true });
    dateien = alle.filter((d) => d.isFile() && d.name.endsWith(".json"))
      .map((d) => d.name)
      .sort((a, b) => {
        const za = zeitAusAufnahmename(a);
        const zb = zeitAusAufnahmename(b);
        // Neueste zuerst; Dateien ohne erkennbare Zeit ans Ende.
        if (za && zb) return zb.localeCompare(za);
        if (za) return -1;
        if (zb) return 1;
        return b.localeCompare(a);
      });
  } catch {
    return null;
  }
  for (const name of dateien.slice(0, maxPruefen)) {
    let daten = null;
    try {
      daten = JSON.parse(await readFile(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    const turns = Array.isArray(daten?.turns) ? daten.turns : [];
    if (!turns.some((t) => t?.role === "user" && String(t?.text || "").trim())) continue;
    return {
      id: String(daten?.id || name.replace(/\.json$/, "")),
      begonnen: String(daten?.started_at || ""),
      zuege: turns.map((t) => ({
        seq: Number(t?.seq) || 0,
        rolle: String(t?.role || ""),
        text: String(t?.text || ""),
        audio: String(t?.audio || ""),
      })),
    };
  }
  return null;
}

/**
 * Die Verarbeitungskette eines Gespraechs zusammensetzen: Was hat Clara
 * gehoert, welches Werkzeug hat sie gewaehlt, was hat sie geantwortet? (PUR)
 *
 * Die Tonaufnahme kennt nur den Wortlaut, das Protokoll nur die Werkzeugwahl.
 * Erst beides zusammen zeigt, an welcher Stelle es gekippt ist. Verknuepft
 * wird ueber die Anrufkennung, fuer aeltere Anrufe ersatzweise ueber den
 * Wortlaut — die gemeinsame Kennung laeuft erst seit dem 09.08.2026 mit.
 */
export function ketteBauen(gespraech, protokollZuege) {
  const zuege = Array.isArray(gespraech?.zuege) ? gespraech.zuege : [];
  const prot = Array.isArray(protokollZuege) ? protokollZuege : [];
  const nachAnruf = prot.filter((p) => p?.anruf && p.anruf === gespraech?.id);
  const schritte = [];
  for (let i = 0; i < zuege.length; i++) {
    const z = zuege[i];
    if (z.rolle !== "user") continue;
    const antwort = zuege.slice(i + 1).find((x) => x.rolle === "assistant");
    const treffer = (nachAnruf.length ? nachAnruf : prot)
      .find((p) => String(p?.nutzer || "").trim() === z.text.trim());
    schritte.push({
      seq: z.seq,
      gehoert: z.text,
      audio: z.audio,
      geantwortet: antwort ? antwort.text : "",
      werkzeuge: (Array.isArray(treffer?.tools) ? treffer.tools : [])
        .map((t) => String(t?.name || t?.tool || t || "")).filter(Boolean),
      waechter: (Array.isArray(treffer?.waechter) ? treffer.waechter : [])
        .map((w) => String(w?.name || w || "")).filter(Boolean),
      protokoll: !!treffer,
    });
  }
  return schritte;
}

/**
 * Auffaelligkeiten in der Kette benennen (PUR).
 *
 * Regelbasiert und belegpflichtig: Jeder Befund nennt die Stelle im Gespraech,
 * an der er sichtbar ist. Es wird nichts geraten — sonst waere die Anzeige
 * eine Meinung statt einer Analyse. Faellt nichts auf, wird das auch gesagt.
 */
export function auffaelligkeiten(schritte) {
  const s = Array.isArray(schritte) ? schritte : [];
  const funde = [];

  // Schleife: dieselbe Bitte mehrfach, oder dasselbe Werkzeug immer wieder.
  const gesehen = new Map();
  for (const x of s) {
    const k = String(x.gehoert || "").trim().toLowerCase();
    if (k) gesehen.set(k, (gesehen.get(k) || 0) + 1);
  }
  const doppelt = [...gesehen.entries()].filter(([, n]) => n > 1);
  if (doppelt.length) {
    funde.push({
      art: "schleife", bereich: "denken",
      text: "Dieselbe Bitte kam mehrfach — Clara ist nicht weitergekommen.",
      beleg: doppelt[0][0],
    });
  }
  const werkzeugZaehler = new Map();
  for (const x of s) {
    for (const w of x.werkzeuge || []) werkzeugZaehler.set(w, (werkzeugZaehler.get(w) || 0) + 1);
  }
  const vielfach = [...werkzeugZaehler.entries()].find(([, n]) => n >= 3);
  if (vielfach) {
    funde.push({
      art: "schleife", bereich: "denken",
      text: `Dieselbe Suche lief ${vielfach[1]}-mal — das deutet auf einen Patienten, der nicht gefunden wurde.`,
      beleg: vielfach[0],
    });
  }

  // Auftrag erteilt, aber nichts ausgefuehrt.
  const auftrag = /(schick|sende|sag\b|absag|verschieb|buch|ruf\b|rufe|trag|leg\b)/i;
  const ohne = s.find((x) => auftrag.test(x.gehoert || "") && !(x.werkzeuge || []).length && x.protokoll);
  if (ohne) {
    funde.push({
      art: "nicht_ausgefuehrt", bereich: "handeln",
      text: "Auf einen klaren Auftrag folgte keine Aktion — Clara hat nur geantwortet.",
      beleg: ohne.gehoert,
    });
  }

  // Absicherung musste eingreifen: ging gut aus, zeigt aber die Schwachstelle.
  const gerettet = s.find((x) => (x.waechter || []).length);
  if (gerettet) {
    funde.push({
      art: "abgefangen", bereich: "handeln",
      text: "Eine Absicherung hat eingegriffen und den Fehler noch verhindert.",
      beleg: gerettet.waechter.join(", "),
    });
  }

  // Ohne Protokoll fehlt uns die halbe Kette — das muss sichtbar sein.
  if (s.length && !s.some((x) => x.protokoll)) {
    funde.push({
      art: "kein_protokoll", bereich: "messung",
      text: "Zu diesem Anruf liegt nur der Wortlaut vor, nicht die Werkzeugwahl.",
      beleg: "",
    });
  }
  return funde;
}

/**
 * Der LAUF: was mit einer Meldung geschieht, Schritt fuer Schritt (PUR).
 *
 * Das ist der Kern des Moduls. Jeder Schritt traegt einen ehrlichen Zustand:
 *   "fertig" — ist wirklich passiert, mit Beleg
 *   "offen"  — steht an, wir koennen es aber
 *   "fehlt"  — geht heute noch nicht; dann steht der Grund dabei
 */
export function baueLauf({ text, gespraech, schritte, funde, einordnung, kategorie, schwere }) {
  const kette = Array.isArray(schritte) ? schritte : [];
  const mitTon = kette.filter((x) => x.audio).length;
  const mitProtokoll = kette.filter((x) => x.protokoll).length;

  // Der Inhaber darf das Textfeld leer lassen — dann traegt die gewaehlte
  // Kategorie die Meldung. Ein leerer erster Schritt waere schlicht kaputt.
  const SCHWERE_WORT = { blocker: "blockiert mich", stoerend: "stört im Alltag", kosmetik: "Kleinigkeit" };
  const kopf = [kategorie?.titel || "", SCHWERE_WORT[schwere] || ""].filter(Boolean).join(" · ");
  const meldung = [kopf, String(text || "").trim()].filter(Boolean).join(" — ");

  const lauf = [];
  lauf.push({ titel: "Ihre Meldung", zustand: "fertig", text: meldung || "(ohne Angabe)" });

  lauf.push(gespraech ? {
    titel: "Gespräch angehängt",
    zustand: "fertig",
    text: `Anruf vom ${(gespraech.begonnen || "").replace("T", " ").slice(0, 16)}`
      + ` · ${kette.length} Fragen von Ihnen`
      + (mitTon ? ` · ${mitTon} davon mit Tonaufnahme` : " · ohne Tonaufnahme"),
  } : {
    titel: "Gespräch angehängt",
    zustand: "fehlt",
    text: "Es liegt kein aufgezeichnetes Gespräch vor, das ich anhängen könnte.",
  });

  lauf.push(kette.length ? {
    titel: "Ablauf nachvollzogen",
    zustand: mitProtokoll ? "fertig" : "offen",
    text: mitProtokoll
      ? `Für ${mitProtokoll} von ${kette.length} Fragen ist belegt, was Clara gehört und welches Werkzeug sie gewählt hat.`
      : "Der Wortlaut liegt vor, die Werkzeugwahl dieses Anrufs jedoch nicht — diese Verknüpfung läuft erst seit heute mit.",
    kette,
  } : {
    titel: "Ablauf nachvollzogen",
    zustand: "fehlt",
    text: "Ohne angehängtes Gespräch gibt es keinen Ablauf zu prüfen.",
  });

  lauf.push((funde || []).length ? {
    titel: "Das ist schiefgelaufen",
    zustand: "fertig",
    text: "",
    funde,
  } : {
    titel: "Das ist schiefgelaufen",
    zustand: "offen",
    text: "In diesem Gespräch ist mir maschinell nichts aufgefallen — den Fall sehe ich mir persönlich an.",
  });

  // Die Fehlerklasse ist der Hebel fuer ALLE Praxen: Geteilt wird nie ein
  // Patient und nie eine Einzelloesung, sondern der abstrakte Fehlerfall.
  const klasse = einordnung?.fehlerklasse && einordnung.fehlerklasse !== "unklar"
    ? ` Fehlerklasse „${einordnung.fehlerklasse}“ — daraus wird ein Testfall, von dem alle Praxen profitieren.`
    : "";
  lauf.push({
    titel: "Einordnung",
    zustand: "fertig",
    text: (einordnung?.ebene === "einstellung"
      ? "Das lässt sich in Ihrer Praxis einstellen — ohne Eingriff in die Software."
      : "Das ist ein technischer Fall für die Pickadoc-Entwicklung.") + klasse,
  });

  // Seit 10.08.2026 ist das kein Versprechen mehr, sondern ein Knopf: Die
  // Aufnahmen dieses Anrufs gehen erneut durch die heutige Erkennung, und
  // damals steht neben heute. Bis der Kunde ihn drueckt, bleibt der Schritt
  // ehrlich "offen" — behauptet wird nichts.
  lauf.push(mitTon ? {
    titel: "Nachweis der Lösung",
    zustand: "offen",
    nachweis: true,
    text: `Die Tonaufnahme ist vorhanden (${mitTon} Stellen). Ich kann genau diesen`
      + " Anruf jetzt erneut durch die heutige Erkennung schicken und Ihnen"
      + " damals neben heute stellen.",
  } : {
    titel: "Nachweis der Lösung",
    zustand: "fehlt",
    text: "Ohne Tonaufnahme lässt sich der Fall nicht wiederholen — beweisen"
      + " können wir eine Verbesserung dann nur an neuen Anrufen.",
  });

  return lauf;
}

/**
 * Eine Klartext-Meldung der Praxis aufnehmen — mit dem letzten Gespraech als
 * Beleg und dem vollstaendigen Lauf als Antwort.
 */
export async function meldeFall(clientId, {
  text, meldung_von = "", kategorie = "", schwere = "", name = "",
  quelle = "", kategorie_geschaetzt = false, sprachnotiz = null,
} = {}) {
  const sauber = String(text || "").trim().slice(0, 2000);
  const kat = findeKategorie(kategorie);
  // Ohne Kategorie UND ohne Text gibt es nichts zu melden. Mit Kategorie darf
  // der Text leer bleiben — genau darum geht es: keine Romane erzwingen.
  if (!kat && !sauber) return { ok: false, reason: "text_required" };
  const einordnung = kat
    ? { bereich: kat.bereich, ebene: kat.ebene, fehlerklasse: kat.fehlerklasse, kategorie: kat.id }
    : { ...ordneEin(sauber), fehlerklasse: "unklar", kategorie: "" };
  const stufe = ["blocker", "stoerend", "kosmetik"].includes(String(schwere)) ? String(schwere) : "stoerend";

  const gespraech = await letztesGespraech();
  const prot = await leseZuege({ tage: 30 });
  const schritte = gespraech ? ketteBauen(gespraech, prot) : [];
  const funde = auffaelligkeiten(schritte);

  const ref = masCollection(clientId, COL_FAELLE).doc();
  await ref.set({
    text: sauber,
    ...einordnung,
    schwere: stufe,
    // Der gemeinte Name ist bei Hoerfehlern das Wertvollste am ganzen Fall:
    // Er sagt, was RICHTIG gewesen waere, und macht daraus einen pruefbaren
    // Testfall statt einer Beschwerde.
    gemeinter_name: String(name || "").trim().slice(0, 120),
    status: "neu",
    meldung_von: String(meldung_von || "").slice(0, 120),
    // Anrufkennung fest am Fall: Ohne sie liesse sich der Fall spaeter nicht
    // wiederholen — genau darum geht es aber.
    anruf: gespraech?.id || "",
    anruf_begonnen: gespraech?.begonnen || "",
    // Per Sprache gemeldet (Chef 10.08.2026): Woher die Meldung kam, die
    // Tondatei der Schilderung und die Warnung, dass die Art nur GESCHAETZT
    // ist. Ohne diese Kennzeichnung sähe eine geratene Einordnung im Eingang
    // aus wie eine bewusste Wahl des Kunden.
    quelle: String(quelle || "seite"),
    kategorie_geschaetzt: !!kategorie_geschaetzt,
    sprachnotiz: sprachnotiz || null,
    kette: schritte,
    funde,
    createdAt: Date.now(),
  });

  // Weiter an Pickadoc: Bisher blieb die Meldung still bei der Praxis liegen.
  // Seit dem 10.08.2026 legt jede Meldung zusaetzlich eine Zeile im zentralen
  // Eingang ab und loest eine E-Mail aus — sonst versanden genau die Faelle,
  // die nur per Code zu loesen sind. Scheitert das, ist die Meldung der Praxis
  // trotzdem gespeichert; der Fehler wird protokolliert, nicht verschluckt.
  try {
    await zentralEintragen({
      clientId, fallId: ref.id, einordnung, schwere: stufe, text: sauber,
      meldung_von, gemeinter_name: String(name || "").trim(), anruf: gespraech?.id || "",
      quelle: String(quelle || "seite"), sprachnotiz: sprachnotiz || null,
    }, { ton: await tonLesen(sprachnotiz) });
  } catch (e) {
    log.warn?.("improve.zentral_eintrag_fehlgeschlagen", { fehler: String(e?.message || e) });
  }

  return {
    ok: true, id: ref.id, ...einordnung,
    // Die Anrufkennung geht mit zurueck, damit die Seite den Nachweis
    // anbieten kann: Ohne sie wuesste sie nicht, welche Aufnahme zu
    // wiederholen ist.
    anruf: gespraech?.id || "",
    lauf: baueLauf({ text: sauber, gespraech, schritte, funde, einordnung, kategorie: kat, schwere: stufe }),
  };
}

// ---------------------------------------------------------------------------
// LIVE-NAMENSPROBE — der sichtbare Korrekturweg
// ---------------------------------------------------------------------------

/**
 * Urteil aus dem Suchergebnis (PUR).
 *
 * Drei Zustaende, bewusst hart getrennt: Nur EIN Treffer ist ein Erfolg. Zwei
 * aehnliche Namen sind KEIN Erfolg — genau daran ist Clara im Live-Anruf
 * gescheitert, als sie zwischen Kandidaten hin und her sprang.
 */
export function urteile(patienten) {
  const p = Array.isArray(patienten) ? patienten : [];
  if (!p.length) return { art: "nichts", text: "Kein Patient gefunden." };
  if (p.length === 1) {
    const n = `${p[0]?.firstName || ""} ${p[0]?.lastName || ""}`.trim();
    return { art: "eindeutig", text: `Eindeutig: ${n}` };
  }
  return { art: "mehrdeutig", text: `${p.length} mögliche Personen — Clara müsste nachfragen.` };
}

/**
 * Begrenzung der Live-Proben.
 *
 * Jede Probe fragt die Plattform-Suche bis zu dreimal ab, und die kostet Geld.
 * Nach dem Kostenvorfall am 09.08.2026 (eine Schleife im Mailabgleich trieb die
 * Google-Rechnung hoch) laeuft hier nichts mehr ohne Deckel.
 */
const probenFenster = [];
const PROBEN_MAX = 40;
const PROBEN_FENSTER_MS = 3600000;

export function probeErlaubt(jetzt = Date.now()) {
  while (probenFenster.length && jetzt - probenFenster[0] > PROBEN_FENSTER_MS) probenFenster.shift();
  if (probenFenster.length >= PROBEN_MAX) return false;
  probenFenster.push(jetzt);
  return true;
}

/**
 * HOERPROBE: gesprochenen Namen durch die echte Spracherkennung schicken.
 *
 * Einwand des Chefs (09.08.2026), und er hat recht: Einen Namen einzutippen
 * beweist gar nichts — dass die Suche einen richtig geschriebenen Namen
 * findet, wissen wir. Der schwere Teil ist das HOEREN. Deshalb wird hier
 * wirklich gesprochen: Das Aufgenommene geht an denselben Erkennungsdienst,
 * den Clara im Anruf benutzt, und erst das Ergebnis geht in die Suche.
 *
 * BEWUSST NICHT angefasst: die Namensliste des Dienstes. Sie gilt dort
 * global, und der Live-Dienst arbeitet gerade damit — eine Testprobe darf
 * Clara im laufenden Betrieb nicht verstellen.
 */
export async function hoerprobe(wav) {
  const dienst = String(process.env.NEMO_STT_URL || "http://127.0.0.1:8130").replace(/\/$/, "");
  if (!wav || !wav.length) return { ok: false, fehler: "keine Aufnahme" };
  try {
    const r = await fetch(`${dienst}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wav,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, fehler: String(d?.error || `Dienst antwortete ${r.status}`) };
    return { ok: true, gehoert: String(d?.text || "").trim(), ms: Number(d?.ms) || 0 };
  } catch (e) {
    // Ehrlich benennen: Ohne laufenden Erkennungsdienst gibt es keinen Hoertest.
    return { ok: false, fehler: "Erkennungsdienst nicht erreichbar" };
  }
}

/**
 * Einen Namen durch die ECHTE Suche schicken und jede Stufe melden.
 *
 * Das ist die Demo, die sich der Chef vorstellt: Man nennt den schwierigsten
 * Patientennamen, und statt eines peinlichen Fehlschlags sieht man, WO es
 * hakt und was greift. Es laeuft ausdruecklich die Produktionssuche — was hier
 * zu sehen ist, tut Clara im Anruf genauso.
 */
export async function probiereNamen(clientId, name, onStage) {
  const gesprochen = String(name || "").trim().slice(0, 120);
  const melde = (stufe, daten) => {
    try { onStage(stufe, daten); } catch { /* Anzeige darf die Probe nie stoeren */ }
  };
  if (gesprochen.length < 3) {
    melde("ergebnis", { urteil: { art: "nichts", text: "Bitte einen vollständigen Namen nennen." } });
    return;
  }
  if (!probeErlaubt()) {
    melde("ergebnis", {
      urteil: { art: "nichts", text: "Zu viele Proben in kurzer Zeit — bitte später erneut." },
    });
    return;
  }

  melde("gehoert", { name: gesprochen });
  const { searchPatient } = await import("./clara/agentBooking.js");
  const res = await searchPatient(clientId, gesprochen, {
    onStage: (stufe, daten) => melde(stufe, daten),
  });
  const patienten = Array.isArray(res?.patients) ? res.patients : [];
  melde("ergebnis", {
    urteil: urteile(patienten),
    treffer: patienten.slice(0, 6).map((p) => ({
      name: `${p?.firstName || ""} ${p?.lastName || ""}`.trim(),
      geboren: String(p?.birthDate || p?.birthday || "").slice(0, 10),
    })),
    fehler: res?.ok === false ? String(res?.error || "") : "",
  });
}

/**
 * Eine per SPRACHE gemeldete Schilderung in eine Kategorie einordnen (PUR).
 *
 * Auf der Improve-Seite waehlt der Kunde aus sechs Bildern -- gesprochen gibt
 * es keine Bilder. Statt ihn abzufragen ("sagen Sie eins bis sechs") wird aus
 * der Schilderung geschlossen und die Wahl als GESCHAETZT gekennzeichnet;
 * korrigieren laesst sie sich im Superuser-Eingang. Eine Rueckfragekaskade am
 * Headset waere genau der Grund, aus dem man nichts mehr meldet.
 *
 * Die Reihenfolge ist Absicht: Zuerst die eindeutigen Taten (falsch gehandelt,
 * nichts getan), erst danach die weicheren Klassen. "Sie hat den falschen
 * Termin abgesagt" ist eine falsche Aktion, keine falsche Auskunft.
 */
export function kategorieAusSprache(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return null;
  const hat = (...w) => w.some((x) => t.includes(x));

  // Eine falsche TAT zuerst: "den Termin der falschen Frau Meier abgesagt"
  // ist keine falsche Auskunft, sondern ein Eingriff in echte Daten — das ist
  // die schwerste Klasse und darf nicht in der weicheren landen.
  const tatVerb = /(abgesagt|storniert|verschoben|gebucht|gelöscht|geloescht|angelegt|eingetragen|umgebucht|verschickt an)/;
  if (hat("falschen patient", "falsche patient", "falschen termin", "doppelt",
    "verwechsel", "falsche person", "beim falschen")
    || (/falsch/.test(t) && tatVerb.test(t))) return findeKategorie("falsche_aktion");
  if (hat("nichts passiert", "nicht verschickt", "nicht abgeschickt", "nicht gemacht",
    "nichts gemacht", "nicht ausgeführt", "keine sms", "nicht losgeschickt",
    "ist nichts")) return findeKategorie("nichts_passiert");
  if (hat("verstanden", "verstanden.", "verhört", "verhoert", "falsch gehört",
    "falsch gehoert", "namen", "name falsch", "heißt", "heisst")) return findeKategorie("verhoert");
  if (hat("erfunden", "behauptet", "stimmt gar nicht", "gelogen", "gibt es nicht",
    "frei erfunden")) return findeKategorie("erfunden");
  if (hat("umständlich", "umstaendlich", "langsam", "zu lange", "dreimal",
    "immer wieder", "zu viele rückfragen", "zu viele rueckfragen")) return findeKategorie("umstaendlich");
  if (hat("falsche", "falsch", "stimmte nicht", "stimmt nicht", "uhrzeit",
    "datum", "dienstag", "mittwoch")) return findeKategorie("falsche_daten");
  return null;
}

/**
 * Wo liegt die Tonaufnahme einer Sprachmeldung?
 *
 * Bewusst hier und nicht in der Route: Der Ablageort der Aufnahmen ist eine
 * Eigenschaft dieses Moduls (siehe letztesGespraech, wiederholungslauf). Nur
 * saubere Namen sind erlaubt — ein Dateiname aus einer Adresszeile darf nie
 * aus dem Ordner herausfuehren.
 */
export function sprachnotizPfad(anruf, datei) {
  const sauber = (s) => String(s || "").replace(/[^A-Za-z0-9_.-]/g, "");
  const a = sauber(anruf);
  const d = sauber(datei);
  // Punktfolgen fliegen raus, obwohl das Saeubern die Schraegstriche schon
  // entfernt hat: Ein Name wie "..\.." darf gar nicht erst als Ordner
  // durchgehen — zwei Schranken statt einer, die stillschweigend haelt.
  if (!a || a.includes("..") || !/^seg_\d{3}_(user|assistant)\.wav$/.test(d)) return "";
  return path.join(runDir(), "call_transcripts", a, d);
}

/**
 * Die Tonaufnahme einer Sprachmeldung fuer den Mailversand einlesen.
 *
 * Sie wird MITGESCHICKT statt verlinkt (Chef 10.08.2026): Ein Link taugt nur,
 * solange die Praxismaschine erreichbar ist — im Postfach liegt das Original
 * dauerhaft. Fehlt die Datei, geht die Mail trotzdem raus; eine Meldung ohne
 * Ton ist immer noch besser als keine.
 */
async function tonLesen(sprachnotiz) {
  const pfad = sprachnotizPfad(sprachnotiz?.anruf, sprachnotiz?.datei);
  if (!pfad) return null;
  try {
    const bytes = await readFile(pfad);
    return { name: `meldung_${String(sprachnotiz.anruf).slice(-15)}.wav`, bytes };
  } catch {
    return null;
  }
}

/**
 * Eine gesprochene Fehlermeldung annehmen (Chef 10.08.2026).
 *
 * Der Weg ist bewusst derselbe wie von der Improve-Seite: Es entsteht ein
 * ganz normaler Fall, samt zentralem Eintrag, E-Mail und Nachweis. Nur die
 * Herkunft und die Tonaufnahme der Schilderung kommen hinzu.
 */
export async function sprachmeldung(clientId, { anruf = "", audio = "", text = "" } = {}) {
  const schilderung = String(text || "").trim().slice(0, 1500);
  const kat = kategorieAusSprache(schilderung);
  return meldeFall(clientId, {
    text: schilderung,
    kategorie: kat?.id || "",
    // Ohne erkennbare Art NICHT raten: "stoerend" ist die ehrliche Mitte,
    // und im Superuser-Eingang laesst sich beides korrigieren.
    schwere: "stoerend",
    meldung_von: "per Sprache über Clara",
    quelle: "sprache",
    kategorie_geschaetzt: !!kat,
    sprachnotiz: audio ? { anruf: String(anruf || ""), datei: String(audio) } : null,
  });
}

// ---------------------------------------------------------------------------
// WIEDERHOLUNGSLAUF — aus dem Versprechen wird ein Nachweis
// ---------------------------------------------------------------------------

/**
 * Zwei Hoerergebnisse vergleichen (PUR).
 *
 * Satzzeichen und Gross-/Kleinschreibung zaehlen NICHT: Der Erkennungsdienst
 * setzt mal einen Punkt, mal ein Ausrufezeichen ("Ja, gib die Liste frei." /
 * "…frei!"). Wuerde man das als Aenderung melden, waere der Nachweis voller
 * Fehlalarme und damit wertlos.
 */
export function gleichGehoert(damals, heute) {
  const norm = (s) => String(s || "")
    .toLowerCase()
    .replace(/[.,!?;:„“"'`´–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return norm(damals) === norm(heute);
}

/**
 * Steckt der gemeinte Name in dem, was heute gehoert wurde? (PUR)
 *
 * Bewusst OHNE die Plattform-Suche: Hier wird nur geprueft, ob der Klang
 * passt, und das kann der Namenskatalog lokal — kostenlos und ohne den
 * Kostendeckel der Live-Probe zu verbrauchen. Ab 10 Punkten gilt derselbe
 * Massstab wie in Claras Suche.
 */
export function nameGetroffen(gemeint, gehoert) {
  const ziel = String(gemeint || "").trim();
  const text = String(gehoert || "").trim();
  if (ziel.length < 3 || text.length < 3) return null;
  const teile = ziel.split(/\s+/);
  const vorname = teile.length > 1 ? teile.slice(0, -1).join(" ") : "";
  const nachname = teile[teile.length - 1];
  const eintrag = { i: "ziel", f: vorname, l: nachname, c: entryCodes(vorname, nachname) };
  const treffer = catalogMatch(text, [eintrag], buildIndex([eintrag]), { limit: 1 })[0];
  const punkte = treffer?.score || 0;
  return { punkte, getroffen: punkte >= 10 };
}

/**
 * Den aufgenommenen Anruf ERNEUT durch die heutige Erkennung schicken.
 *
 * Bis heute stand auf der Seite nur ein Versprechen ("sobald der
 * Wiederholungslauf steht"). Genau das war die einzige Stelle, an der das
 * Modul etwas ankuendigte, statt es zu zeigen — und ein Nachweis, der nie
 * kommt, ist schlimmer als keiner.
 *
 * Was hier passiert: Jede Tonaufnahme des Anrufs geht an denselben
 * Erkennungsdienst, den Clara benutzt, und das Ergebnis wird gegen das
 * gestellt, was damals ankam. Damit ist belegbar, ob der Fehler noch da ist
 * oder verschwunden — auch "unveraendert" ist ein Ergebnis und wird als
 * solches gesagt.
 *
 * Kosten: keine. Der Erkennungsdienst laeuft auf dieser Maschine, und die
 * Patientensuche wird bewusst NICHT angefasst (die kostet pro Abfrage).
 *
 * @param {string} anrufId       Kennung des Anrufs (leer = letztes Gespraech)
 * @param {string} gemeinterName optional: wie die Person wirklich heisst
 * @param {(stufe:string,daten:object)=>void} onStage
 */
export async function wiederholungslauf({ anruf = "", gemeinterName = "" } = {}, onStage = () => {}) {
  const melde = (stufe, daten) => {
    try { onStage(stufe, daten); } catch { /* Anzeige darf den Lauf nie stoeren */ }
  };

  const gespraech = anruf ? await gespraechLaden(anruf) : await letztesGespraech();
  if (!gespraech) {
    melde("ergebnis", { fehler: "Der Anruf ist nicht mehr auffindbar." });
    return;
  }

  const mitTon = gespraech.zuege.filter((z) => z.rolle === "user" && z.audio);
  if (!mitTon.length) {
    melde("ergebnis", { fehler: "Zu diesem Anruf gibt es keine Tonaufnahme — ohne sie lässt sich nichts nachspielen." });
    return;
  }

  melde("start", { anruf: gespraech.id, begonnen: gespraech.begonnen, zuege: mitTon.length });

  const ordner = path.join(runDir(), "call_transcripts", gespraech.id);
  const ergebnisse = [];
  let namensTreffer = null;
  let damalsSchonDa = false;

  for (const zug of mitTon) {
    let heute = "";
    let fehler = "";
    try {
      const wav = await readFile(path.join(ordner, zug.audio));
      const h = await hoerprobe(wav);
      if (h.ok) heute = h.gehoert; else fehler = h.fehler || "nicht erkannt";
    } catch {
      fehler = "Tonaufnahme nicht lesbar";
    }

    const gleich = !fehler && gleichGehoert(zug.text, heute);
    if (gemeinterName && heute) {
      const t = nameGetroffen(gemeinterName, heute);
      if (t?.getroffen && !namensTreffer) namensTreffer = { seq: zug.seq, punkte: t.punkte, heute };
    }
    // Kam der Name DAMALS schon richtig an? Ohne diese Gegenprobe wuerde ein
    // Anruf, in dem die Person ueberhaupt nicht vorkam, faelschlich als
    // "Fehler besteht weiter" gemeldet.
    if (gemeinterName && nameGetroffen(gemeinterName, zug.text)?.getroffen) damalsSchonDa = true;
    const eintrag = { seq: zug.seq, damals: zug.text, heute, gleich, fehler };
    ergebnisse.push(eintrag);
    melde("zug", eintrag);
  }

  const geprueft = ergebnisse.filter((e) => !e.fehler);
  const anders = geprueft.filter((e) => !e.gleich).length;
  melde("ergebnis", {
    geprueft: geprueft.length,
    gesamt: ergebnisse.length,
    anders,
    namensTreffer,
    // Eine einzelne Stelle als Beleg fuer den Verlauf: lieber die, die sich
    // geaendert hat — sonst die erste. Eine Zahl allein zeigt nichts.
    beispiel: geprueft.find((e) => !e.gleich) || geprueft[0] || null,
    urteil: urteilWiederholung({
      geprueft: geprueft.length, anders, gemeinterName, namensTreffer, damalsSchonDa,
      nieVorgekommen: !!gemeinterName && !namensTreffer && !damalsSchonDa,
    }),
  });
}

/**
 * Das Urteil des Wiederholungslaufs in einem Satz (PUR).
 *
 * EHRLICHKEITSREGEL: "Nichts hat sich geaendert" ist ein vollwertiges
 * Ergebnis und wird auch so benannt — nicht schoengeredet.
 */
export function urteilWiederholung({
  geprueft = 0, anders = 0, gemeinterName = "", namensTreffer = null,
  damalsSchonDa = false, nieVorgekommen = false,
} = {}) {
  if (!geprueft) {
    return { art: "nichts", text: "Keine der Aufnahmen ließ sich erneut anhören." };
  }
  if (gemeinterName && namensTreffer) {
    return damalsSchonDa
      ? { art: "unveraendert", text: `Der Name kam schon damals richtig an — an dieser Stelle lag der Fehler also nicht.` }
      : { art: "geloest", text: `Der Name wird heute richtig gehört: „${namensTreffer.heute}“.` };
  }
  // Kam der Name in KEINER Aufnahme vor, weder damals noch heute, dann gehoert
  // er zu einem anderen Anruf. Das als "Fehler besteht weiter" auszugeben
  // waere schlicht falsch.
  if (nieVorgekommen) {
    return {
      art: "nichts",
      text: `„${gemeinterName}“ kommt in diesem Anruf gar nicht vor — vermutlich gehört der Fall zu einem anderen Gespräch.`,
    };
  }
  if (gemeinterName && !namensTreffer) {
    return {
      art: "offen",
      text: `„${gemeinterName}“ kommt auch heute nicht richtig an — der Fehler ist noch da.`,
    };
  }
  if (!anders) {
    return {
      art: "unveraendert",
      text: `Clara hört diesen Anruf heute Wort für Wort genauso — der Fehler ist damit nachweislich noch da.`,
    };
  }
  return {
    art: "veraendert",
    text: `${anders} von ${geprueft} Stellen kommen heute anders an als damals.`,
  };
}

/** Ein bestimmtes Gespraech laden (fuer den Wiederholungslauf eines alten Falls). */
async function gespraechLaden(id) {
  const sauber = String(id || "").replace(/[^A-Za-z0-9_.-]/g, "");
  if (!sauber) return null;
  try {
    const daten = JSON.parse(await readFile(path.join(runDir(), "call_transcripts", `${sauber}.json`), "utf8"));
    const turns = Array.isArray(daten?.turns) ? daten.turns : [];
    return {
      id: String(daten?.id || sauber),
      begonnen: String(daten?.started_at || ""),
      zuege: turns.map((t) => ({
        seq: Number(t?.seq) || 0,
        rolle: String(t?.role || ""),
        text: String(t?.text || ""),
        audio: String(t?.audio || ""),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Das Ergebnis eines Wiederholungslaufs AM FALL festhalten.
 *
 * Ohne das waere der Nachweis fluechtig: Er stuende einmal auf dem Bildschirm
 * und waere beim naechsten Aufruf weg. Erst wenn er am Fall klebt, kann der
 * Verlauf spaeter zeigen, WIE sich etwas geaendert hat — und genau darum geht
 * es dem Inhaber (Wunsch 10.08.2026).
 */
export async function merkeNachweis(clientId, fallId, ergebnis) {
  const id = String(fallId || "").trim();
  if (!id) return { ok: false };
  const nachweis = {
    art: String(ergebnis?.urteil?.art || ""),
    text: String(ergebnis?.urteil?.text || "").slice(0, 400),
    geprueft: Number(ergebnis?.geprueft) || 0,
    anders: Number(ergebnis?.anders) || 0,
    // Die einzelne Stelle, an der man den Unterschied HOERT — das ist der
    // Kern des Bildes im Verlauf, nicht die Zahl darueber.
    beispiel: ergebnis?.beispiel || null,
    zeit: Date.now(),
  };
  try {
    await masCollection(clientId, COL_FAELLE).doc(id).update({ nachweis });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Gemeldete Faelle, neueste zuerst. */
export async function listeFaelle(clientId, { limit = 50 } = {}) {
  const snap = await masCollection(clientId, COL_FAELLE)
    .orderBy("createdAt", "desc").limit(Math.min(200, Math.max(1, limit))).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// GESPRAECH UEBER DEN FEHLER (Chef 14.08.2026)
// ---------------------------------------------------------------------------
// Die Meldeseite fuehrte bisher nur durch Kacheln und einen starren Lauf.
// Der Chef will UEBER den Fehler reden koennen — nachfragen, ergaenzen,
// einordnen. Das Modell bekommt den Fall als Beleg, darf aber nichts als
// behoben behaupten (Ehrlichkeitsregel).

const DIALOG_SYSTEM = [
  "Du bist Clara und sprichst mit dem Praxisinhaber ueber einen gemeldeten Fehler.",
  "Du SIEZT. Du bist klug, konkret und nachfragend — kein Formular, kein Skript.",
  "HARTE REGELN:",
  "1. Behaupte NIE, etwas sei behoben, gefixt oder live. Du sammelst Verstaendnis.",
  "2. Rate keine Patientendaten, keine Termine, keine Zahlen, die nicht im Beleg stehen.",
  "3. Stuetzt du dich auf den Beleg, sag das kurz ('Im angehaengten Gespraech hoere ich …').",
  "4. Stelle Rueckfragen, wenn etwas unklar ist: Was genau stoerte? Wann? Welcher Name?",
  "5. Biete hoechstens EINE konkrete naechste Pruefung an, die die Seite schon kann (Hoerprobe, Namenssuche) — keine neuen Versprechen.",
  "6. Kein Markdown, keine Aufzaehlungszeichen, keine Emojis. Hoestens acht Saetze.",
  "7. Wenn der Beleg duenn ist, sag das ehrlich und frag nach dem fehlenden Stueck.",
].join("\n");

/**
 * Baut den Beleg-Text fuer das Fehlergespraech (PUR, testbar).
 * Nichts erfinden — nur das, was der Fall wirklich traegt.
 */
export function baueGespraechBeleg(fall = {}) {
  const zeilen = [];
  if (fall.kategorie) zeilen.push(`Kategorie: ${fall.kategorie}`);
  if (fall.schwere) zeilen.push(`Schwere: ${fall.schwere}`);
  if (fall.text) zeilen.push(`Meldung: ${String(fall.text).slice(0, 800)}`);
  if (fall.gemeinter_name) zeilen.push(`Gemeinter Name: ${fall.gemeinter_name}`);
  if (fall.fehlerklasse) zeilen.push(`Fehlerklasse: ${fall.fehlerklasse}`);
  const kette = Array.isArray(fall.kette) ? fall.kette : [];
  for (const z of kette.slice(0, 8)) {
    const tools = (z.werkzeuge || []).join(", ");
    zeilen.push(
      `Zug: gehoert „${String(z.gehoert || "").slice(0, 180)}“`
      + (z.geantwortet ? ` → Clara „${String(z.geantwortet).slice(0, 180)}“` : "")
      + (tools ? ` [${tools}]` : ""),
    );
  }
  for (const f of (fall.funde || []).slice(0, 6)) {
    zeilen.push(`Auffaellig: ${f.text || ""}${f.beleg ? ` (Beleg: ${f.beleg})` : ""}`);
  }
  return zeilen.join("\n") || "Kein Beleg.";
}

/**
 * Nachrichtenliste fuer das Modell (PUR).
 * @param {string} beleg
 * @param {{rolle:string,text:string}[]} historie
 * @param {string} frage  leer = Gespraech eroeffnen
 * @param {string} assistantName  Ruf-Name (Phase W-NAME); leer = "Clara"
 */
export function baueGespraechNachrichten(beleg, historie = [], frage = "", assistantName = "") {
  const msgs = [
    { role: "system", content: withAssistantName(DIALOG_SYSTEM, assistantName) },
    { role: "user", content: `Beleg zu diesem Fall:\n${beleg}` },
  ];
  for (const z of (historie || []).slice(-12)) {
    const rolle = z.rolle === "assistant" ? "assistant" : "user";
    const text = String(z.text || "").trim();
    if (text) msgs.push({ role: rolle, content: text });
  }
  const naechste = String(frage || "").trim();
  if (naechste) msgs.push({ role: "user", content: naechste });
  else if (!(historie || []).length) {
    msgs.push({
      role: "user",
      content: "Eroeffne das Gespraech: fasse in zwei Saetzen, was der Beleg zeigt, und stelle EINE kluge Rueckfrage.",
    });
  }
  return msgs;
}

/**
 * Eine Runde im Fehlergespraech. Speichert beide Seiten am Fall.
 */
export async function improveDialog(clientId, { fallId, text = "" } = {}) {
  const id = String(fallId || "").trim();
  const frage = String(text || "").trim().slice(0, 1500);
  if (!id) return { ok: false, reason: "fall_required" };
  const ref = masCollection(clientId, COL_FAELLE).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "fall_not_found" };
  const fall = { id, ...snap.data() };
  const historie = Array.isArray(fall.dialog) ? fall.dialog : [];
  if (historie.length >= 24) {
    return { ok: false, reason: "dialog_voll", dialog: historie };
  }
  const msgs = baueGespraechNachrichten(baueGespraechBeleg(fall), historie, frage, await getAssistantName(clientId));
  const llm = strongLlm();
  const res = await chat(msgs, {
    temperature: 0.7,
    maxTokens: 420,
    timeoutMs: 20000,
    baseUrl: llm.base,
    model: llm.model,
  });
  const antwort = String(res?.text || "").trim();
  if (!res?.ok || !antwort) {
    return {
      ok: false,
      reason: res?.reason || "llm_leer",
      dialog: historie,
      text: "Dazu kann ich gerade nicht frei sprechen — der Beleg bleibt oben stehen. Schreiben Sie trotzdem weiter, ich lese mit.",
    };
  }
  const jetzt = Date.now();
  const neu = [...historie];
  if (frage) neu.push({ rolle: "user", text: frage, at: jetzt });
  neu.push({ rolle: "assistant", text: antwort.slice(0, 2000), at: jetzt + 1 });
  try {
    await ref.update({ dialog: neu.slice(-24) });
  } catch (e) {
    log.warn?.("improve.dialog_schreiben", { fehler: String(e?.message || e) });
  }
  return { ok: true, text: antwort, dialog: neu };
}
