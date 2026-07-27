import { queryLatest, resolveItem } from "./eventStore.js";
import { applyHumanReview } from "./events.js";
import { deadlineStage } from "./redList.js";
import { formatEuro } from "./critical.js";

// ============================================================================
// W-STABIL-8 Wiedervorlage (Verkaufskern 24/25, 28.07.2026).
//
// EIN Waechter, EINE Liste, drei Quellen: Alles, was eine FRIST traegt oder
// ein RECHNUNGS-/ZAHLUNGSVORGANG ist — egal ob es per E-Mail kam, als
// gescannter Brief (Mail-Anlage -> OCR -> mas_documents) oder am Telefon
// gesagt wurde — liegt als offenes Event in mas_events. Diese Datei ist das
// Lese-Modell darueber: sortiert nach Faelligkeit, mit Warnstufe, bis jemand
// "erledigt" sagt (resolve).
//
// CHEF-REGEL (27.07.2026): Euro-Betraege werden NIE gesprochen. Der Betrag
// steht nur auf der Karte (amountCents -> formatEuro); der gesprochene Satz
// nennt Absender, Sache und Frist.
// ============================================================================

const LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000; // Fristen leben laenger als die rote 3-Wochen-Liste

// Verstrichene Fristen bleiben 14 Tage lang als UEBERFAELLIG stehen — danach
// fliegen sie raus. Erster Live-Lauf (28.07.2026, 01:20): ohne diesen Schnitt
// standen 6 Wochen alte, laengst tote "Fristen" aus Patienten- und Werbemails
// (FLYERALARM) auf der Liste und begruben die echten Punkte.
const UEBERFAELLIG_MAX_MS = 14 * 24 * 60 * 60 * 1000;

const QUELLE = Object.freeze({
  nadine_email: "E-Mail",
  nadine_letter: "Brief",
  bianca_call: "Anruf",
  lisa_call: "Anruf",
  clara_voice: "Anruf",
  frontdesk: "Empfang",
});

function kurzWer(e) {
  return e.counterparty?.name && e.counterparty.name !== "Unbekannt"
    ? e.counterparty.name
    : (e.subject?.name || "Unbekannt");
}

// "E-Mail von X — Betreff „Y": ..." -> "Y" (der Betreff ist die beste Kurzform);
// sonst erste Zeile des Summaries ohne Radar-Praefix.
function kurzWas(e) {
  const s = String(e.summary || "");
  const betreff = s.match(/Betreff „([^“”"]{2,80})[“”"]/);
  if (betreff) return betreff[1];
  return s.replace(/^\[[^\]]+\]\s*/, "").split(/\n/)[0].slice(0, 90);
}

/**
 * Die EINE Wiedervorlage-Liste: offene Events mit Frist ODER Rechnungssignal.
 * Fristen zuerst (frueheste Faelligkeit oben), danach Rechnungen ohne Datum
 * (neueste zuerst).
 */
export async function buildWiedervorlage(clientId, { lookbackMs = LOOKBACK_MS, now = Date.now() } = {}) {
  // queryLatest (absteigend): bei > 2000 Events im 60-Tage-Fenster fielen bei
  // aufsteigender Sortierung genau die NEUESTEN raus — die frische Mahnung
  // waere unsichtbar, der Uralt-Kram bliebe. Neueste zuerst ist hier richtig.
  const raw = await queryLatest(clientId, now - lookbackMs, 2000);
  const events = raw.map(applyHumanReview);

  // Wie redList.deadlines: NICHT auf status==="open" filtern — ein Frist-Event
  // ohne weiteres Signal steht auf "none" (buildEvent kennt Fristen nicht als
  // actionable) und muss trotzdem auf der Wiedervorlage stehen, bis jemand
  // "erledigt" sagt (status "resolved").
  // Qualifikation: Rechnung/Zahlung ODER kritischer Vorgang ODER Frist mit
  // STARKEM Frist-Wort. Schwache "bis zum"-Fristen (Werbung, lockere Mails)
  // bleiben der roten Liste vorbehalten und fluten die Wiedervorlage nicht
  // (Live-Befund 28.07.2026: FLYERALARM-Werbung stand als "Frist" drauf).
  const offen = events.filter((e) =>
    e.status !== "resolved"
    && (e.signals?.invoiceOrPayment
      || (e.deadlineMs && (e.deadlineStrong === true || e.signals?.critical)))
    && !(e.deadlineMs && e.deadlineMs < now - UEBERFAELLIG_MAX_MS));

  const shape = (e) => ({
    eventId: e.id,
    ts: e.ts,
    quelle: QUELLE[e.channel] || "Eingang",
    wer: kurzWer(e),
    was: kurzWas(e),
    kritisch: !!e.signals?.critical,
    rechnung: !!e.signals?.invoiceOrPayment,
    deadlineMs: e.deadlineMs || null,
    stage: e.deadlineMs ? deadlineStage(e.deadlineMs, now) : null,
    amountCents: e.amountCents || null,
    schreiben: 1,
    eventIds: [e.id],
  });

  // Mahn-KASKADEN buendeln (Live-Befund 28.07.2026: FLYERALARM stand mit
  // "Mahnung" + "letzter Mahnung" + Folgemail DREIMAL auf der Liste — das ist
  // EIN Vorgang). Pro Absender bleibt das NEUESTE Schreiben (traegt die
  // aktuelle Frist), die aelteren werden als "N Schreiben" mitgezaehlt.
  // Unbekannte Absender werden NIE gebuendelt (koennten verschiedene sein).
  const falten = (s) => String(s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  const proAbsender = new Map();
  for (const e of offen) {
    const it = shape(e);
    const key = it.wer === "Unbekannt" ? `#${it.eventId}` : falten(it.wer);
    const vorhanden = proAbsender.get(key);
    if (!vorhanden) {
      proAbsender.set(key, it);
    } else if (it.ts > vorhanden.ts) {
      proAbsender.set(key, {
        ...it,
        schreiben: vorhanden.schreiben + 1,
        eventIds: [...vorhanden.eventIds, ...it.eventIds],
      });
    } else {
      vorhanden.schreiben += 1;
      vorhanden.eventIds.push(...it.eventIds);
    }
  }

  const alle = [...proAbsender.values()];
  const mitFrist = alle.filter((i) => i.deadlineMs).sort((a, b) => a.deadlineMs - b.deadlineMs);
  const ohneFrist = alle.filter((i) => !i.deadlineMs).sort((a, b) => b.ts - a.ts);

  return { items: [...mitFrist, ...ohneFrist], ts: now };
}

function fmtTag(ms) {
  return new Date(ms)
    .toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" })
    .replace(/\.$/, "");
}

function gesprochenerPunkt(it) {
  const art = it.rechnung ? "eine Rechnungssache" : "eine Frist";
  const von = it.wer && it.wer !== "Unbekannt" ? ` von ${it.wer}` : "";
  const mehrfach = it.schreiben > 1 ? `, ${it.schreiben} Schreiben` : "";
  let frist = "";
  if (it.deadlineMs) {
    frist = it.stage === "overdue" ? " — Frist verstrichen"
      : it.stage === "today" ? " — heute faellig"
        : ` — faellig am ${fmtTag(it.deadlineMs)}`;
  }
  return `${art}${von} (${it.quelle}${mehrfach})${frist}`;
}

/**
 * Gesprochene Wiedervorlage: maximal `max` Punkte ausformuliert, Rest gezaehlt.
 * KEINE Euro-Betraege im gesprochenen Text (Chef-Regel) — die stehen auf der
 * Karte. Leere Liste -> beruhigender Satz.
 */
export function spokenWiedervorlage({ items = [] } = {}, { max = 4 } = {}) {
  if (!items.length) {
    return "Auf der Wiedervorlage ist nichts offen — keine Fristen, keine offenen Rechnungen.";
  }
  const dringend = items.filter((i) => i.stage === "overdue" || i.stage === "today").length;
  const kopf = items.length === 1
    ? "Ein Punkt auf der Wiedervorlage"
    : `${items.length} Punkte auf der Wiedervorlage${dringend ? `, davon ${dringend === 1 ? "einer dringend" : `${dringend} dringend`}` : ""}`;
  const gesagt = items.slice(0, max).map(gesprochenerPunkt);
  const rest = items.length - gesagt.length;
  return `${kopf}: ${gesagt.join("; ")}${rest > 0 ? `; dazu ${rest === 1 ? "ein weiterer Punkt" : `${rest} weitere Punkte`}` : ""}. Zum Abhaken: "Die Sache mit ... ist erledigt."`;
}

/**
 * Sprach-Quittung "erledigt": findet den offenen Wiedervorlage-Punkt ueber ein
 * Stichwort (Absender/Inhalt) und setzt das Event auf resolved. Eindeutigkeit
 * ist Pflicht — bei mehreren Treffern wird ehrlich zurueckgefragt statt geraten
 * (dieselbe Linie wie Storno: nie auf Verdacht handeln).
 */
export async function resolveWiedervorlage(clientId, { wer = "", actor = "Chef" } = {}) {
  const stichwort = String(wer || "").trim().toLowerCase();
  if (!stichwort) {
    return { ok: false, reason: "no_keyword", message: "Wessen Vorgang soll ich abhaken? Nenne mir den Absender." };
  }
  const { items } = await buildWiedervorlage(clientId);
  if (!items.length) {
    return { ok: false, reason: "empty", message: "Die Wiedervorlage ist leer — da ist nichts abzuhaken." };
  }
  const falten = (s) => String(s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  const suche = falten(stichwort);
  const treffer = items.filter((i) =>
    falten(i.wer).includes(suche) || falten(i.was).includes(suche));

  if (!treffer.length) {
    return { ok: false, reason: "not_found", message: `Auf der Wiedervorlage steht nichts zu "${wer}".` };
  }
  if (treffer.length > 1) {
    const namen = [...new Set(treffer.map((t) => t.wer))].slice(0, 4).join(", ");
    return {
      ok: false,
      reason: "ambiguous",
      message: `Da passen ${treffer.length} Vorgaenge (${namen}). Welcher genau ist erledigt?`,
    };
  }

  const it = treffer[0];
  // Gebuendelte Mahn-Kaskade: ALLE Schreiben des Vorgangs abhaken — sonst
  // ruecken die aelteren Mahnungen desselben Absenders sofort wieder nach.
  let geloest = 0;
  for (const id of (it.eventIds?.length ? it.eventIds : [it.eventId])) {
    const r = await resolveItem(clientId, id, { actor, note: "Per Sprache als erledigt abgehakt (Wiedervorlage)" });
    if (r.ok) geloest++;
  }
  if (!geloest) {
    return { ok: false, reason: "resolve_failed", message: "Das Abhaken hat nicht geklappt — der Vorgang war nicht mehr offen." };
  }
  return {
    ok: true,
    eventId: it.eventId,
    message: `Erledigt. ${it.rechnung ? "Die Rechnungssache" : "Die Frist"}${it.wer !== "Unbekannt" ? ` von ${it.wer}` : ""}${it.schreiben > 1 ? ` (${it.schreiben} Schreiben)` : ""} ist von der Wiedervorlage runter.`,
  };
}

export { formatEuro };
