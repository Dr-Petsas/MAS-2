import { queryRecent } from "../brain/eventStore.js";
import { buildBriefing } from "../brain/briefing.js";
import { buildRedList } from "../brain/redList.js";
import { SPOKEN_CATEGORY } from "../brain/critical.js";
import { buildMailBriefing } from "../mail/briefing.js";
import { findePraxisLuecken } from "./dokuWaechter.js";
import { gapFillOverview } from "./gapFill.js";
import { pick } from "./variation.js";

// ============================================================================
// ASAP-Queue (Masterplan Phase 5, 04.07.2026) — EINE Dringlichkeits-Schicht.
//
// "Was brennt?" muss serverseitig aus denselben Quellen beantwortet werden,
// die auch Cockpit/Briefings speisen — nie aus dem LLM-Gedaechtnis. Diese
// Schicht aggregiert Post, Anrufe/Vorgaenge, Fristen, Doku-Waechter und
// Recall-Freigaben in EINE priorisierte Liste:
//
//   P0  sofort          rote Liste (Anwalt/Kammer/Mahnung/eskalierend) +
//                       verstrichene/heutige Fristen
//   P1  heute noch      Fristen <= 3 Tage, Beschwerden, ungeloest/braucht Mensch
//   P2  bei Gelegenheit Rueckrufbitten, Freigaben (Mail-Entwuerfe, Anruflisten),
//                       Doku-Luecken
//   P3  nur zaehlen     alles uebrige Offene (ungelesene Mails, Rest-Anliegen)
//
// Regeln: jede Quelle best-effort (eine kaputte Quelle kostet nie die Antwort),
// KEINE Umsatz-/Euro-Zahlen im Sprechtext (AGENTS Regel 6), Dedupe ueber
// eventId (ein Ereignis erscheint nur in seiner hoechsten Prioritaet).
// Die Unterbrechungs-Politik (wann Clara das AKTIV sagt) ist ein eigenes
// Paket — diese Schicht ist das Lese-Modell dafuer.
// ============================================================================

const OPEN_LOOKBACK_MS = 48 * 60 * 60 * 1000; // wie Morgen-Moment: 48 h zaehlen

function catLabel(category) {
  return SPOKEN_CATEGORY[category] || "einen kritischen Vorgang";
}

// Volles Datum (16.06.2026): genau das Format, das die Sprech-Schicht in
// Clara-Voice (sanitize_reply) sicher in Woerter umwandelt.
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin",
  });
}

/**
 * Baut die priorisierte ASAP-Queue eines Mandanten.
 * @param {string} clientId
 * @param {{ mailAccountIds?: string[] }} opts
 * @returns {Promise<{ok: boolean, generatedAt: number, items: object[], counts: object}>}
 */
export async function buildAsapQueue(clientId, { mailAccountIds } = {}) {
  const now = Date.now();

  const [red, events, mail, doku, gaps] = await Promise.all([
    buildRedList(clientId).catch(() => ({ critical: [], deadlines: [] })),
    queryRecent(clientId, now - OPEN_LOOKBACK_MS, 800).catch(() => []),
    buildMailBriefing(clientId, { accountIds: mailAccountIds }).catch(() => null),
    findePraxisLuecken(clientId, { tageZurueck: 7 }).catch(() => ({ ok: false, luecken: [] })),
    gapFillOverview(clientId).catch(() => ({ pending: [], approved: [] })),
  ]);

  const items = [];
  const seenEvents = new Set();
  const push = (prio, source, entry) => {
    if (entry.eventId) {
      if (seenEvents.has(entry.eventId)) return;
      seenEvents.add(entry.eventId);
    }
    items.push({ prio, source, ...entry });
  };

  // --- P0: rote Liste + Fristen overdue/today --------------------------------
  for (const c of red.critical) {
    push("P0", "rote_liste", {
      eventId: c.eventId,
      who: c.who,
      aboutPatient: c.aboutPatient || "",
      summary: c.summary || catLabel(c.category),
      spoken: `${catLabel(c.category)}${c.who && c.who !== "Unbekannt" ? ` von ${c.who}` : ""}` +
        (c.deadlineMs ? `, Frist ${fmtDate(c.deadlineMs)}` : ""),
      ts: c.ts,
      deadlineMs: c.deadlineMs || null,
    });
  }
  for (const d of red.deadlines) {
    if (d.critical) continue; // steht schon in der roten Liste
    if (d.stage !== "overdue" && d.stage !== "today" && d.stage !== "soon") continue;
    const prio = d.stage === "soon" ? "P1" : "P0";
    const when = d.stage === "overdue" ? "Frist verstrichen"
      : d.stage === "today" ? "heute faellig" : `faellig am ${fmtDate(d.deadlineMs)}`;
    push(prio, "fristen", {
      eventId: d.eventId,
      who: d.who,
      summary: d.summary || "",
      spoken: `${d.who !== "Unbekannt" ? d.who : "ein Vorgang"} — ${when}`,
      ts: d.ts,
      deadlineMs: d.deadlineMs,
    });
  }

  // --- P1/P2: offene Anliegen der letzten 48 h -------------------------------
  const briefing = buildBriefing(events, { now, windowStart: now - OPEN_LOOKBACK_MS });
  const g = briefing.groups;
  // needsIdentity ist im Briefing eine eigene Gruppe (Identitaet zuerst klaeren);
  // fuer die Dringlichkeit zaehlt aber das SIGNAL: eine Beschwerde ohne
  // Patienten-Match brennt genauso wie eine mit. Signal-basiert einsortieren.
  const identUrgent = [];
  const identCallback = [];
  for (const it of g.needsIdentity || []) {
    const sig = it.signals || {};
    if (sig.complaintStated || sig.painPersists || sig.repeatVisitStated || sig.unresolvedByAI || sig.needsHuman) {
      identUrgent.push(it);
    } else if (sig.callbackRequested) {
      identCallback.push(it);
    }
  }
  for (const it of [...g.complaints, ...g.unresolvedByAI, ...identUrgent]) {
    push("P1", "anliegen", {
      eventId: it.eventId,
      who: it.who,
      aboutPatient: it.aboutPatient || "",
      summary: it.summary,
      spoken: `${it.who}${it.aboutPatient ? ` (Patient: ${it.aboutPatient})` : ""} — ${it.summary}`,
      ts: it.ts,
    });
  }
  for (const it of [...g.callbacks, ...g.colleagueCalls, ...identCallback]) {
    push("P2", "rueckrufe", {
      eventId: it.eventId,
      who: it.who,
      aboutPatient: it.aboutPatient || "",
      summary: it.summary,
      spoken: `Rueckruf: ${it.who}${it.aboutPatient ? ` wegen ${it.aboutPatient}` : ""}`,
      ts: it.ts,
    });
  }

  // --- P2: Freigaben & Pflichten (aggregiert, je EIN Punkt) -------------------
  const awaiting = Number(mail?.counts?.awaitingApproval || 0);
  if (awaiting > 0) {
    push("P2", "post", {
      count: awaiting,
      spoken: awaiting === 1
        ? "Ein Mail-Entwurf wartet auf Freigabe"
        : `${awaiting} Mail-Entwuerfe warten auf Freigabe`,
      ts: now,
    });
  }
  const pendingLists = (gaps.pending || []).length;
  if (pendingLists > 0) {
    push("P2", "recall", {
      count: pendingLists,
      spoken: pendingLists === 1
        ? "Eine Recall-Anrufliste wartet auf Freigabe"
        : `${pendingLists} Recall-Anruflisten warten auf Freigabe`,
      ts: now,
    });
  }
  const luecken = (doku.luecken || []).length;
  if (luecken > 0) {
    push("P2", "doku", {
      count: luecken,
      spoken: luecken === 1
        ? "Eine Behandlung ist noch ohne Doku"
        : `${luecken} Behandlungen sind noch ohne Doku`,
      ts: now,
    });
  }

  // --- P3: nur Zaehlstand -----------------------------------------------------
  const unread = Number(mail?.counts?.unread || 0);
  // Alles, was oben schon namentlich steht (rote Liste, Fristen, Anliegen,
  // Rueckrufe), nicht nochmal im Hintergrund-Zaehler mitzaehlen.
  const surfacedIds = new Set(items.map((i) => i.eventId).filter(Boolean));
  const openEvents = (briefing.counts.openTotal || 0);
  const restOpen = Math.max(0, openEvents - [...surfacedIds].filter((id) =>
    events.some((e) => e.id === id && e.status === "open")).length);
  if (unread > 0) {
    push("P3", "post", { count: unread, spoken: `${unread} ungelesene ${unread === 1 ? "E-Mail" : "E-Mails"}`, ts: now });
  }
  if (restOpen > 0) {
    push("P3", "anliegen", { count: restOpen, spoken: `${restOpen === 1 ? "ein weiteres offenes Anliegen" : `${restOpen} weitere offene Anliegen`}`, ts: now });
  }

  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  items.sort((a, b) => (order[a.prio] - order[b.prio])
    || ((a.deadlineMs || Infinity) - (b.deadlineMs || Infinity))
    || ((b.ts || 0) - (a.ts || 0)));

  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const it of items) counts[it.prio] += 1;
  return { ok: true, generatedAt: now, items, counts };
}

/**
 * Gesprochene Antwort auf "Was brennt?" — kompakt: P0 immer alle (max 3),
 * P1 max 2, P2/P3 als Zaehlstand. Keine Euro-Zahlen.
 */
export function spokenAsapQueue(queue) {
  const items = queue?.items || [];
  if (!items.length) {
    return pick([
      "Gerade brennt nichts: keine kritischen Vorgaenge, keine Fristen, nichts Dringendes aus Post oder Telefon.",
      "Nichts Dringendes — rote Liste leer, keine Fristen, keine wartenden Freigaben.",
      "Alles ruhig: kein kritischer Vorgang, keine faellige Frist, nichts wartet auf dich.",
    ]);
  }
  const p0 = items.filter((i) => i.prio === "P0");
  const p1 = items.filter((i) => i.prio === "P1");
  const p2 = items.filter((i) => i.prio === "P2");
  const p3 = items.filter((i) => i.prio === "P3");

  const parts = [];
  if (p0.length) {
    const shown = p0.slice(0, 3).map((i) => i.spoken);
    const rest = p0.length - shown.length;
    parts.push(`Sofort: ${shown.join("; ")}${rest > 0 ? `; und ${rest} weitere kritische Punkte` : ""}.`);
  }
  if (p1.length) {
    const shown = p1.slice(0, 2).map((i) => i.spoken);
    const rest = p1.length - shown.length;
    parts.push(`Heute noch: ${shown.join("; ")}${rest > 0 ? `; plus ${rest} weitere` : ""}.`);
  }
  if (p2.length) {
    const shown = p2.slice(0, 3).map((i) => i.spoken);
    const rest = p2.length - shown.length;
    parts.push(`Bei Gelegenheit: ${shown.join("; ")}${rest > 0 ? `; und ${rest} weitere Punkte` : ""}.`);
  }
  if (p3.length) {
    parts.push(`Im Hintergrund: ${p3.map((i) => i.spoken).join(", ")} — nichts davon eilt.`);
  }
  if (!p0.length && !p1.length) {
    parts.unshift(pick([
      "Nichts brennt akut.",
      "Akut ist nichts offen.",
    ]));
  }
  return parts.join(" ");
}
