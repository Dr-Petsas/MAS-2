// Auffaelligkeiten fuer Tages-Briefings (Chef 14.08.2026).
//
// Ein Mensch liest nicht 12 Patienten der Reihe nach vor. Er sagt die Lage
// ("12 Termine von 8 bis 17") und dann, was AUFFAELLT: unsignierte Unterlagen,
// eine Mail zur Prothese, vier Anrufe, ein versaeumter letzter Termin.
// Diese Datei sammelt nur echte Signale und spricht sie als verbundene
// Saetze. "weil" kommt NUR vor, wenn der Grund im Beleg steht — sonst
// Nebensatz mit "und"/"dabei"/"ausserdem". Kein LLM, keine Erfindung.

import { vary } from "./speech.js";

const VERSAEUMT = /no.?show|didnotattend|not_showed|missed|nicht.?erschienen|versaeumt|versäumt/i;
const KALENDER_ECHO = /^(Neuer Termin|Termin verschoben|Termin abgesagt|Dokumenten-Ampel)/i;

function clip(s, n = 90) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function whoOf(a) {
  const n = String(a?.patientName || a?.patientLastName || a?.who || "").trim();
  return n || "ein Patient";
}

export function istVersaeumtStatus(status, comments = "") {
  return VERSAEUMT.test(String(status || "")) || VERSAEUMT.test(String(comments || ""));
}

function letzterKontakt(c) {
  const ups = Array.isArray(c?.updates) ? c.updates : [];
  const last = [...ups].reverse().find((u) => u.kind === "contact") || ups[ups.length - 1];
  return last || null;
}

function istProzedural(c) {
  if (!c) return true;
  if (c.topic === "appointment") return true;
  return KALENDER_ECHO.test(String(letzterKontakt(c)?.text || ""));
}

function kanalVon(c, last) {
  const ch = String(last?.channel || c?.channel || "").toLowerCase();
  if (/mail|email|letter|brief/.test(ch) || c?.topic === "billing") return "mail";
  if (/call|anruf|phone|sms/.test(ch) || c?.topic === "callback") return "anruf";
  return "vorgang";
}

function kontaktZahl(c) {
  const n = Number(c?.stats?.contacts || 0);
  if (n >= 2) return n;
  const ups = Array.isArray(c?.updates) ? c.updates.filter((u) => u.kind === "contact") : [];
  return Math.max(1, ups.length);
}

/**
 * Sammelt die auffaelligen Signale des Tages. Rein, testbar.
 * @returns {{art:string, n?:number, who?:string, time?:string, text?:string}[]}
 */
export function sammleAuffaelligkeiten({
  appointments = [],
  briefing = {},
  casesByPatient = new Map(),
  events = [],
  lastByPatient = new Map(),
} = {}) {
  const items = [];
  const byPid = new Map();
  for (const a of appointments || []) {
    if (!a || a.isAbsence || !a.patientId) continue;
    byPid.set(String(a.patientId), a);
  }

  const red = Number(briefing.docsRed || 0);
  const yellow = Number(briefing.docsYellow || 0);
  if (red) items.push({ art: "docs_red", n: red });
  else if (yellow) items.push({ art: "docs_yellow", n: yellow });

  for (const a of briefing.attention || []) {
    const text = clip(a.comments, 90);
    if (text.length < 8) continue;
    items.push({
      art: "notiz",
      who: whoOf(a),
      time: a.time || "",
      text,
    });
  }

  for (const [pid, cases] of casesByPatient || []) {
    const a = byPid.get(String(pid));
    if (!a) continue;
    const echt = (cases || []).filter((c) => !istProzedural(c));
    if (!echt.length) continue;
    const c = echt[0];
    const last = letzterKontakt(c);
    let snippet = clip(String(last?.text || ""), 100)
      .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, whoOf(a));
    if (KALENDER_ECHO.test(snippet)) snippet = "";
    items.push({
      art: kanalVon(c, last),
      who: whoOf(a),
      time: a.time || "",
      text: snippet,
      n: kontaktZahl(c),
    });
  }

  const anrufe = new Map();
  for (const e of events || []) {
    const pid = String(e?.subject?.patientId || "");
    if (!pid || !byPid.has(pid)) continue;
    if (!/call/.test(String(e.channel || "")) || (e.direction || "in") !== "in") continue;
    anrufe.set(pid, (anrufe.get(pid) || 0) + 1);
  }
  for (const [pid, n] of anrufe) {
    if (n < 2) continue;
    const a = byPid.get(pid);
    if (items.some((it) => it.art === "anruf" && it.who === whoOf(a))) {
      const hit = items.find((it) => it.art === "anruf" && it.who === whoOf(a));
      if (hit && n > (hit.n || 1)) hit.n = n;
      continue;
    }
    items.push({ art: "anruf", who: whoOf(a), time: a.time || "", n, text: "" });
  }

  for (const [pid, last] of lastByPatient || []) {
    if (!istVersaeumtStatus(last?.status, last?.comments)) continue;
    const a = byPid.get(String(pid)) || last;
    items.push({ art: "versaeumt", who: whoOf(a) });
  }

  const prio = {
    docs_red: 10, anamnese: 9, versaeumt: 8, anruf: 7, mail: 6, vorgang: 5, notiz: 4, docs_yellow: 3,
  };
  items.sort((a, b) => (prio[b.art] || 0) - (prio[a.art] || 0));
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.art}|${it.who || ""}|${it.n || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= 4) break;
  }
  return out;
}

function satzDocs(it) {
  const n = it.n || 0;
  if (it.art === "docs_red") {
    return n === 1
      ? "bei einem Termin die Unterlagen gar nicht unterschrieben wurden"
      : `bei ${n} Terminen die Unterlagen gar nicht unterschrieben wurden`;
  }
  return n === 1
    ? "bei einem Termin die Unterlagen noch nicht unterschrieben sind"
    : `bei ${n} Terminen die Unterlagen noch nicht unterschrieben sind`;
}

function satzPerson(it) {
  const wer = it.who || "ein Patient";
  const wann = it.time ? ` um ${it.time}` : "";
  if (it.art === "versaeumt") {
    return `${wer} hat beim letzten Mal den Termin versäumt`;
  }
  if (it.art === "anamnese") {
    return it.text ? `${wer}${wann} — ${it.text}` : `${wer}${wann}`;
  }
  if (it.art === "anruf") {
    const wie = (it.n || 1) >= 2 ? ` hat ${it.n} Mal angerufen` : " hat angerufen";
    return it.text ? `${wer}${wann}${wie} — ${it.text}` : `${wer}${wann}${wie}`;
  }
  if (it.art === "mail") {
    return it.text
      ? `${wer}${wann} hat geschrieben, ${it.text}`
      : `${wer}${wann} hat eine E-Mail geschickt`;
  }
  if (it.art === "notiz") {
    return `${wer}${wann}: ${it.text}`;
  }
  return it.text ? `${wer}${wann} — ${it.text}` : `${wer}${wann}`;
}

/**
 * Spricht die Auffaelligkeiten als EINEN fliessenden Block.
 * Erster Satz mit "dass"-Nebensatz, der Rest mit und/ausserdem/dabei.
 */
export function sprecheAuffaelligkeiten(items = []) {
  const liste = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!liste.length) return "";

  const teile = liste.map((it) => (
    it.art === "docs_red" || it.art === "docs_yellow" ? satzDocs(it) : satzPerson(it)
  ));

  const kopf = vary("notable.kopf", [
    "Dabei fällt auf, dass",
    "Auffällig ist, dass",
    "Was ins Auge springt:",
    "Kurz das Auffällige:",
  ]);

  if (teile.length === 1) {
    if (/^Dabei|^Auffällig/.test(kopf)) return `${kopf} ${teile[0]}.`;
    return `${kopf} ${teile[0]}.`;
  }

  const erst = teile[0];
  const mitte = teile.slice(1, -1);
  const letzt = teile[teile.length - 1];
  const und = mitte.length ? `, ${mitte.join(", ")}, und ${letzt}` : ` und ${letzt}`;
  if (/^Dabei|^Auffällig/.test(kopf)) return `${kopf} ${erst}${und}.`;
  return `${kopf} ${erst}${und}.`;
}
