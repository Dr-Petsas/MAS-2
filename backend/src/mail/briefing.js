import { listMessages } from "./store.js";
import { listCases } from "../brain/caseStore.js";

// Nadine's own briefing: what her world looks like right now — new mail today,
// unread, who wrote, and the delegation tasks Clara handed her (with how many
// already have a prepared draft). Deterministic German text so Clara can answer
// "Was gab es heute für E-Mails?" by reading Nadine's summary aloud. This is the
// functional core of "Nadine speaks"; a distinct TTS voice is a later cosmetic.

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function topSenderPhrase(messages) {
  const by = new Map();
  for (const m of messages) {
    const key = m.from?.name || m.from?.address || "Unbekannt";
    by.set(key, (by.get(key) || 0) + 1);
  }
  const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return "";
  const names = sorted.slice(0, 2).map(([name]) => name);
  return names.length === 1 ? `vor allem von ${names[0]}` : `unter anderem von ${names[0]} und ${names[1]}`;
}

/**
 * @param {string} clientId
 * @param {{ sinceMinutes?: number }} opts
 * @returns {Promise<{counts:object, spokenText:string}>}
 */
export async function buildMailBriefing(clientId, { sinceMinutes = 720, accountIds } = {}) {
  const cutoff = Date.now() - sinceMinutes * 60000;
  const inbox = await listMessages(clientId, { folder: "INBOX", limit: 150, accountIds }).catch(() => []);
  const recent = inbox.filter((m) => (m.date || 0) >= cutoff);
  const unread = recent.filter((m) => !m.seen).length;

  const tasks = await listCases(clientId, { assignee: "Nadine", activeOnly: true, limit: 200 }).catch(() => []);
  const draftsReady = tasks.filter((c) => c.draft && (c.draft.subject || c.draft.body)).length;
  const awaitingApproval = tasks.filter((c) => c.status === "waiting_approval").length;

  const counts = { newMail: recent.length, unread, openTasks: tasks.length, draftsReady, awaitingApproval };

  const parts = [];
  if (recent.length === 0) {
    parts.push("Heute sind noch keine neuen E-Mails eingegangen.");
  } else {
    const sender = topSenderPhrase(recent);
    let s = `Heute ${plural(recent.length, "ist", "sind")} ${recent.length} neue ${plural(recent.length, "E-Mail", "E-Mails")} eingegangen`;
    if (unread > 0) s += `, ${unread} davon noch ungelesen`;
    s += ".";
    if (sender) s += ` ${sender.charAt(0).toUpperCase() + sender.slice(1)}.`;
    parts.push(s);
  }

  // Formulierung OHNE "von Clara"/"mir": der Text wird mal von Nadine selbst
  // gesprochen (Team-Stimmen-Demo), mal von Clara vorgelesen — "Aufträge von
  // Clara liegen mir keine offen vor" klang aus Claras Mund nach dritter
  // Person (12.06.).
  if (tasks.length === 0) {
    parts.push("Offene Schreibaufträge gibt es gerade keine.");
  } else {
    let t = `Es ${plural(tasks.length, "liegt", "liegen")} ${tasks.length} ${plural(tasks.length, "offener Schreibauftrag", "offene Schreibaufträge")} vor`;
    if (draftsReady > 0) t += `, für ${draftsReady} ${plural(draftsReady, "ist", "sind")} schon ein Entwurf bereit`;
    t += ".";
    parts.push(t);
    if (awaitingApproval > 0) {
      parts.push(`${awaitingApproval} ${plural(awaitingApproval, "Entwurf wartet", "Entwürfe warten")} auf Ihre Freigabe.`);
    }
  }

  return { counts, spokenText: parts.join(" ") };
}
