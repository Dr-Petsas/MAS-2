import { queryRecent } from "../brain/eventStore.js";
import { buildBriefing } from "../brain/briefing.js";
import { buildRedList, spokenRedList } from "../brain/redList.js";
import { buildMailBriefing } from "../mail/briefing.js";
import { pick, chance } from "./variation.js";

// ============================================================================
// Abend-Moment ("Feierabend, Clara") — Nacht 12.06.2026.
//
// O-Ton Chef: Statistik ist NICHT wichtig. Wichtig ist, dringende Aufgaben
// zu betonen, die unbedingt erledigt werden müssen — als first thing to do
// für den nächsten Tag: Anwaltsschreiben, Anrufe von der Kammer, stressende
// Patienten, Rechnungen in Mahnstufe, Pfändungen. Das Wichtigste aus
// Telefonaten und Mails, was offen geblieben, aber wirklich dramatisch ist.
//
// Deshalb: KEINE Anruf-Zählung, KEINE Termin-Statistik, KEINE Umsatzzahlen
// (das wird ein separates Element mit Lena und Sophie). Nur:
//   1. Rote Liste (kritische Vorgänge + Fristen morgen/überfällig) — zuerst.
//   2. Stressende/ungelöste Patienten des Tages (Beschwerde, KI kam nicht
//      weiter, will Menschen sprechen).
//   3. Was auf Freigabe wartet (Nadine-Entwürfe, Anruflisten) — eine Zeile.
// Ist nichts dramatisch: genau das sagen, kurz, und Feierabend wünschen.
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

function salutationOf(name) {
  const tokens = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  if (/^(dr|prof)\.?$/i.test(tokens[0])) {
    const last = tokens[tokens.length - 1];
    return last && last !== tokens[0] ? `${tokens[0].replace(/\.?$/, ".")} ${last}` : "";
  }
  return tokens[0];
}

function greetingLine(operatorName) {
  const name = salutationOf(operatorName);
  return pick([
    `Feierabend${name ? `, ${name}` : ""}!`,
    `Alles klar${name ? `, ${name}` : ""} — machen wir den Tagesabschluss.`,
    `Bevor du gehst${name ? `, ${name}` : ""}, einmal kurz das Wichtige.`,
  ]);
}

// Stressende/ungelöste Patienten von HEUTE: Beschwerden, von der KI nicht
// gelöste Anliegen, "will einen Menschen sprechen". Kritisches läuft schon
// über die rote Liste und wird hier nicht doppelt erzählt.
function stressLines(briefing, redListIds) {
  const g = briefing.groups;
  const seen = new Set(redListIds);
  const pool = [...(g.complaints || []), ...(g.unresolvedByAI || [])].filter(
    (i) => !seen.has(i.eventId)
  );
  if (!pool.length) return [];
  const top = pool[0];
  const lines = [pick([
    `Aus den Gesprächen heute solltest du das mitnehmen: ${top.who} — ${top.summary}`,
    `Ein Fall von heute ist noch nicht rund: ${top.who} — ${top.summary}`,
  ])];
  if (pool.length > 1) {
    lines.push(`${pool.length - 1 === 1 ? "Ein weiterer ähnlicher Fall steht" : `${pool.length - 1} weitere ähnliche Fälle stehen`} im Monitor.`);
  }
  return lines;
}

function approvalLine(mailCounts, gapPending) {
  const bits = [];
  if (mailCounts?.awaitingApproval > 0) {
    bits.push(`${mailCounts.awaitingApproval === 1 ? "ein Nadine-Entwurf" : `${mailCounts.awaitingApproval} Nadine-Entwürfe`}`);
  }
  if (gapPending > 0) {
    bits.push(`${gapPending === 1 ? "eine Anrufliste von Lisa" : `${gapPending} Anruflisten von Lisa`}`);
  }
  if (!bits.length) return "";
  return pick([
    `Auf Ihre Freigabe ${bits.length === 1 && !bits[0].startsWith("ein ") ? "warten" : "wartet noch"} ${bits.join(" und ")} — geht auch morgen früh.`,
    `Im Cockpit ${bits.length > 1 ? "liegen" : "liegt"} noch ${bits.join(" und ")} zur Freigabe.`,
  ]);
}

function closingLine(hadUrgent) {
  if (hadUrgent) {
    return pick([
      "Der Rest hat bis morgen Zeit. Schönen Feierabend!",
      "Alles andere kann warten — guten Feierabend!",
    ]);
  }
  return pick([
    "Nichts Dramatisches offen — du kannst beruhigt gehen. Schönen Feierabend!",
    "Heute bleibt nichts Brisantes liegen. Guten Feierabend!",
    "Alles im grünen Bereich, nichts brennt. Bis morgen!",
  ]);
}

/**
 * Der gesprochene Abend-Moment. Jede Quelle ist best-effort; fällt eine aus,
 * bleibt der Rest stehen. Bewusst kurz: 4–6 Sätze, Dringendes zuerst.
 *
 * @param {string} clientId
 * @param {{operatorName?: string, mailAccountIds?: string[]}} opts
 */
export async function spokenEveningBriefing(clientId, opts = {}) {
  const [redList, events, mail, gapPending] = await Promise.all([
    buildRedList(clientId).catch(() => ({ critical: [], deadlines: [] })),
    queryRecent(clientId, Date.now() - DAY_MS, 600).catch(() => []),
    buildMailBriefing(clientId, { sinceMinutes: 720, accountIds: opts.mailAccountIds }).catch(() => null),
    countPendingGapLists(clientId).catch(() => 0),
  ]);

  const parts = [greetingLine(opts.operatorName)];

  // 1. Rote Liste zuerst — das ist der "first thing to do"-Block für morgen.
  const red = spokenRedList(redList, { max: 3, bare: true });
  if (red) {
    parts.push(pick([
      `Das darf morgen nicht liegen bleiben: ${red}.`,
      `Morgen als Erstes: ${red}.`,
    ]));
  }

  // 2. Stressende Patienten / ungelöste Anliegen von heute.
  try {
    const briefing = buildBriefing(events);
    parts.push(...stressLines(briefing, redList.critical.map((c) => c.eventId)));
  } catch { /* Abschnitt entfällt */ }

  // 3. Offene Freigaben in einer Zeile.
  const approvals = approvalLine(mail?.counts, gapPending);
  if (approvals) parts.push(approvals);

  const hadUrgent = !!red || parts.length > 1;
  parts.push(closingLine(hadUrgent));

  return parts.filter(Boolean).join(" ");
}

async function countPendingGapLists(clientId) {
  const { gapFillOverview } = await import("./gapFill.js");
  const lists = await gapFillOverview(clientId);
  return (lists?.pending || []).length;
}
