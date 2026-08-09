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
import { zentralEintragen } from "./improveZentrale.js";
import { log } from "./log.js";

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
      .map((d) => d.name).sort().reverse();
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

  // EHRLICH: Der Wiederholungslauf ist noch nicht gebaut. Ohne ihn gibt es
  // keinen Vorher/Nachher-Beleg — das darf hier nicht als erledigt erscheinen.
  lauf.push(mitTon ? {
    titel: "Nachweis der Lösung",
    zustand: "offen",
    text: "Die Tonaufnahme ist vorhanden. Sobald der Wiederholungslauf steht,"
      + " schicke ich genau diesen Anruf erneut durch die verbesserte Fassung"
      + " und zeige Ihnen vorher und nachher.",
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
export async function meldeFall(clientId, { text, meldung_von = "", kategorie = "", schwere = "", name = "" } = {}) {
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
    });
  } catch (e) {
    log.warn?.("improve.zentral_eintrag_fehlgeschlagen", { fehler: String(e?.message || e) });
  }

  return {
    ok: true, id: ref.id, ...einordnung,
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

/** Gemeldete Faelle, neueste zuerst. */
export async function listeFaelle(clientId, { limit = 50 } = {}) {
  const snap = await masCollection(clientId, COL_FAELLE)
    .orderBy("createdAt", "desc").limit(Math.min(200, Math.max(1, limit))).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
