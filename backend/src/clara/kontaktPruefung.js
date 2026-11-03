import { queryLatest } from "../brain/eventStore.js";
import { applyHumanReview } from "../brain/events.js";
import { todayBerlin, relativeDayLabel } from "./daySchedule.js";
import { ensureBerlinTz } from "./booking.js";
import { masCollection } from "../tenant.js";

// ============================================================================
// "Hat Herr X angerufen?" / "Hat Frau Y gemailt?" / "Hat sich Firma Z gemeldet?"
// (Chef 03.11.2026: "kriege ich keine zufriedenstellende Antwort"). call_log und
// comms_digest lesen den GANZEN Tag vor — die Frage nach EINER Person blieb
// unbeantwortet. Hier: gezielte Pruefung im Praxisgedaechtnis, klares Ja/Nein,
// Uhrzeit + kurzer Inhalt. Verhoerte Namen (STT: "Heuser" statt "Reuber")
// werden als Rueckfrage angeboten, nie still ersetzt.
// ============================================================================

const TZ = "Europe/Berlin";
const DEFAULT_TAGE = 14;

const KANAL = new Map([
  ["bianca_call", { kind: "anruf", wort: "Anruf" }],
  ["nadine_email", { kind: "mail", wort: "E-Mail" }],
  ["nadine_letter", { kind: "brief", wort: "Brief" }],
  ["frontdesk", { kind: "empfang", wort: "Besuch am Empfang" }],
]);

const TITEL_RE = /\b(?:herrn?|frau|firma|fa\.?|dr\.?|doktor|prof\.?|die|der|das|den|von|vom)\b/gi;
const FUELL_RE = /\b(?:laut anruf\s*\(bianca\)\s*:?|gespr(?:ä|ae)ch ohne kalender(?:ä|ae)nderung\.?)/gi;

function s(v) {
  return v == null ? "" : String(v).trim();
}

export function normName(text) {
  return s(text).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(TITEL_RE, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function tokens(text) {
  return normName(text).split(" ").filter((t) => t.length >= 3);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Wie gut passt der gefragte Name auf ein Ereignis? 2 = sicher (alle Namens-
 * teile kommen vor), 1 = aehnlich (verhoert), 0 = nein. Pure.
 */
export function namensTreffer(gefragt, event) {
  const want = tokens(gefragt);
  if (!want.length) return 0;
  // Nur der Absender zaehlt; der Text nur, wenn kein Absender gespeichert ist —
  // sonst trifft "Michael Petsas" jede Notiz, in der er als Behandler steht.
  const who = `${s(event?.counterparty?.name)} ${s(event?.subject?.name)}`.trim();
  const quelle = who || s(event?.summary).slice(0, 80);
  const have = tokens(quelle);
  if (!have.length) return 0;
  if (want.every((w) => have.includes(w) || have.some((h) => h.length >= 5 && h.startsWith(w) && w.length >= 4))) return 2;
  // Firmen schreiben sich mal getrennt, mal zusammen ("SMS-Flatrate" / smsflatrate.net).
  const wantZus = want.join("");
  if (wantZus.length >= 6 && have.join("").includes(wantZus)) return 2;
  // Nachname zaehlt am meisten: der LAENGSTE gefragte Teil reicht, wenn er exakt im Namen steht.
  const haupt = [...want].sort((a, b) => b.length - a.length)[0];
  const whoTok = tokens(quelle);
  if (haupt.length >= 4 && whoTok.includes(haupt)) return 2;
  const grenze = haupt.length >= 7 ? 2 : haupt.length >= 5 ? 2 : 1;
  if (haupt.length >= 4 && whoTok.some((h) => Math.abs(h.length - haupt.length) <= 2 && levenshtein(h, haupt) <= grenze)) return 1;
  return 0;
}

function tagVon(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function uhrzeit(ms) {
  const p = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const h = Number(p.find((x) => x.type === "hour")?.value || 0);
  const m = Number(p.find((x) => x.type === "minute")?.value || 0);
  return m === 0 ? `${h} Uhr` : `${h} Uhr ${m}`;
}

/** Sprechbarer Kurzinhalt: ohne Notiz-Praefixe, Telefonnummern, Behandler-Klammer. Pure. */
export function inhalt(e) {
  let t = s(e.summary).replace(FUELL_RE, " ").replace(/\s+/g, " ").trim();
  const who = s(e.counterparty?.name || e.subject?.name);
  if (who && t.toLowerCase().startsWith(who.toLowerCase())) t = t.slice(who.length).replace(/^[\s,:—–-]+/, "");
  t = t.replace(/^r(?:ü|ue)ckruf-notiz an die praxis:\s*/i, "");
  t = t.replace(/^(?:[^:]{1,60}?\s)?bittet um r(?:ü|ue)ckruf:\s*/i, "bittet um Rückruf: ");
  t = t.replace(/^(?:e-mail|brief)\s+von\s+[^—–:-]{1,60}[—–:-]\s*/i, "");
  t = t.replace(/\(\s*behandler:[^)]*\)?/gi, " ")
    .replace(/\btel(?:efon)?\.?:?\s*\+?[\d\s/()-]{6,}\.?/gi, " ")
    .replace(/\+?\d[\d\s/()-]{8,}\d/g, " ")
    .replace(/\s*[;.]\s*feld angabe blieb[^.]*\./gi, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+/g, " ").trim()
    .replace(/[\s.;,]+$/, "");
  if (t.length > 130) t = `${t.slice(0, 127).replace(/\s+\S*$/, "")} …`;
  return t;
}

/** "Herr Heuser" -> "Herrn Heuser" (nach "von"). Pure. */
export function dativ(name) {
  return s(name).replace(/^herr\s+/i, "Herrn ");
}

/** Mehrere Ereignisse desselben Anrufs (Extrakt + Rueckruf-Bitte) zu einem zusammenfassen. Pure. */
export function zusammenfassen(events) {
  const out = [];
  for (const e of [...events].sort((a, b) => Number(a.ts) - Number(b.ts))) {
    const k = KANAL.get(e.channel)?.kind;
    const letzter = out[out.length - 1];
    const who = normName(e.counterparty?.name || e.subject?.name);
    if (letzter && letzter.kind === k && k === "anruf" && letzter.who === who
        && Number(e.ts) - letzter.ts <= 3 * 60000) {
      const t = inhalt(e);
      if (t && !letzter.texte.includes(t)) letzter.texte.push(t);
      continue;
    }
    out.push({ kind: k, wort: KANAL.get(e.channel)?.wort || "Eingang", ts: Number(e.ts), who,
      name: s(e.counterparty?.name || e.subject?.name), texte: [inhalt(e)].filter(Boolean),
      offen: e.status === "open" });
  }
  return out;
}

function zahlwort(n, einzahl, mehrzahl) {
  const w = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"];
  if (n === 1) return `ein${einzahl === "E-Mail" ? "e" : ""} ${einzahl}`;
  return `${w[n] || n} ${mehrzahl}`;
}

const MEHRZAHL = { anruf: ["Anruf", "Anrufe"], mail: ["E-Mail", "E-Mails"], brief: ["Brief", "Briefe"], empfang: ["Besuch am Empfang", "Besuche am Empfang"] };

function zeitraumText({ day, tage }) {
  if (day) return relativeDayLabel(day);
  return tage === 1 ? "heute" : `in den letzten ${tage} Tagen`;
}

function kanalText(kanal) {
  if (kanal === "anruf") return "kein Anruf";
  if (kanal === "mail") return "keine E-Mail";
  return "weder ein Anruf noch eine E-Mail";
}

/**
 * Sprechtext aus den gefundenen Eingaengen. Pure.
 * @param {{name:string, kanal:string, day?:string, tage:number, sicher:object[], aehnlich:object[]}} r
 */
export function sprechKontakt({ name, kanal, day, tage, sicher, aehnlich }) {
  const zr = zeitraumText({ day, tage });
  const anzeige = dativ(name);
  if (!sicher.length && aehnlich.length) {
    const kandidat = aehnlich[aehnlich.length - 1].name;
    const nur = aehnlich.filter((x) => x.name === kandidat);
    return `Von ${anzeige} finde ich ${zr} nichts. Aber von ${kandidat} ${nur.length > 1 ? "kamen" : "kam"} ${zr} ${summeText(nur)} — meinten Sie ${kandidat}?`;
  }
  if (!sicher.length) {
    return `Nein, von ${anzeige} ist ${zr} ${kanalText(kanal)} eingegangen.`;
  }
  const wer = sicher[sicher.length - 1].name || anzeige;
  const teile = [`Ja, von ${wer} ${sicher.length > 1 ? "kamen" : "kam"} ${zr} ${summeText(sicher)}.`];
  const zeigen = sicher.slice(-3);
  for (const x of zeigen) {
    const t = x.texte.join(" — ").trim();
    teile.push(`${x.wort} ${tagUndZeit(x.ts)}${t ? `: ${t}` : ""}`.replace(/([^.!?…])$/, "$1."));
  }
  const aelter = sicher.length - zeigen.length;
  if (aelter === 1) teile.push("Ein älterer steht im Monitor.");
  else if (aelter > 1) teile.push(`Die ${aelter} älteren stehen im Monitor.`);
  if (sicher.some((x) => x.offen)) teile.push("Ein Anliegen davon ist noch offen.");
  return teile.join(" ");
}

function summeText(liste) {
  const nach = {};
  for (const x of liste) nach[x.kind] = (nach[x.kind] || 0) + 1;
  const bits = Object.entries(nach).map(([k, n]) => zahlwort(n, MEHRZAHL[k]?.[0] || "Eingang", MEHRZAHL[k]?.[1] || "Eingänge"));
  return bits.length <= 1 ? bits[0] || "" : `${bits.slice(0, -1).join(", ")} und ${bits[bits.length - 1]}`;
}

function tagUndZeit(ms) {
  const tag = tagVon(ms);
  const rel = tag === todayBerlin() ? "heute" : relativeDayLabel(tag);
  return `${rel} um ${uhrzeit(ms)}`;
}

async function lisaBerichtIds(clientId, sinceMs) {
  try {
    const snap = await masCollection(clientId, "mas_lisa_tasks").where("ts", ">=", sinceMs - 86400000).limit(500).get();
    return new Set(snap.docs.map((d) => s(d.data()?.reportEventId)).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * I/O: Eingaenge einer Person/Firma pruefen.
 * @param {string} clientId
 * @param {{name:string, kanal?:"anruf"|"mail"|"alle", date?:string, tage?:number}} args
 */
export async function pruefeKontakt(clientId, { name, kanal = "alle", date = "", tage } = {}, { query = queryLatest } = {}) {
  const day = s(date);
  const nTage = Math.max(1, Math.min(60, Number(tage) || DEFAULT_TAGE));
  const startMs = day
    ? new Date(ensureBerlinTz(`${day}T00:00:00`)).getTime()
    : Date.now() - nTage * 86400000;
  const endMs = day ? new Date(ensureBerlinTz(`${day}T23:59:59`)).getTime() : Date.now() + 60000;
  const [roh, lisaBerichte] = await Promise.all([
    query(clientId, startMs, 2000),
    lisaBerichtIds(clientId, startMs),
  ]);
  const passend = roh.map(applyHumanReview).filter((e) => {
    const k = KANAL.get(e.channel);
    if (!k || (e.direction || "in") !== "in") return false;
    // Lisas EIGENE Anrufe meldet die TelefonKI ebenfalls als bianca_call.
    if (lisaBerichte.has(e.id)) return false;
    if (Number(e.ts) < startMs || Number(e.ts) > endMs) return false;
    if (kanal === "anruf" && k.kind !== "anruf") return false;
    if (kanal === "mail" && !["mail", "brief"].includes(k.kind)) return false;
    return true;
  });
  const sicherE = passend.filter((e) => namensTreffer(name, e) === 2);
  const aehnlichE = sicherE.length ? [] : passend.filter((e) => namensTreffer(name, e) === 1);
  const sicher = zusammenfassen(sicherE);
  const aehnlich = zusammenfassen(aehnlichE);
  return {
    message: sprechKontakt({ name, kanal, day, tage: nTage, sicher, aehnlich }),
    gefunden: sicher.length,
    aehnlich: aehnlich.length,
  };
}
