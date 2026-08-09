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
 * Einordnung einer Klartext-Meldung: Darf die Praxis das selbst richten oder
 * ist es ein technischer Fall fuer die zentrale Entwicklung? (PUR)
 *
 * Bewusst grob: Die Einordnung entscheidet nur, WO die Meldung landet — nie,
 * was tatsaechlich geaendert wird. Unklares geht absichtlich an die
 * Entwicklung und nicht an die Praxis.
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
export function baueLauf({ text, gespraech, schritte, funde, einordnung }) {
  const kette = Array.isArray(schritte) ? schritte : [];
  const mitTon = kette.filter((x) => x.audio).length;
  const mitProtokoll = kette.filter((x) => x.protokoll).length;

  const lauf = [];
  lauf.push({ titel: "Ihre Meldung", zustand: "fertig", text: String(text || "") });

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

  lauf.push({
    titel: "Einordnung",
    zustand: "fertig",
    text: einordnung?.ebene === "einstellung"
      ? "Das lässt sich in Ihrer Praxis einstellen — ohne Eingriff in die Software."
      : "Das ist ein technischer Fall für die Pickadoc-Entwicklung.",
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
export async function meldeFall(clientId, { text, meldung_von = "" } = {}) {
  const sauber = String(text || "").trim().slice(0, 2000);
  if (!sauber) return { ok: false, reason: "text_required" };
  const einordnung = ordneEin(sauber);

  const gespraech = await letztesGespraech();
  const prot = await leseZuege({ tage: 30 });
  const schritte = gespraech ? ketteBauen(gespraech, prot) : [];
  const funde = auffaelligkeiten(schritte);

  const ref = masCollection(clientId, COL_FAELLE).doc();
  await ref.set({
    text: sauber,
    ...einordnung,
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

  return {
    ok: true, id: ref.id, ...einordnung,
    lauf: baueLauf({ text: sauber, gespraech, schritte, funde, einordnung }),
  };
}

/** Gemeldete Faelle, neueste zuerst. */
export async function listeFaelle(clientId, { limit = 50 } = {}) {
  const snap = await masCollection(clientId, COL_FAELLE)
    .orderBy("createdAt", "desc").limit(Math.min(200, Math.max(1, limit))).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
