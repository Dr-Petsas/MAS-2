// Testlabor-Speicher PRO MANDANT (W-LABOR, 27.07.2026).
//
// Alles liegt unter clients/{clientId}/mas_clara_lab/{caseId} - ein Dokument
// je Frage, mit zwei unabhaengigen Teilen:
//
//   baseline  Der eingefrorene IST-Zustand von heute: Claras Antwort, das
//             gewaehlte Tool, die Argumente und die Fassung von Prompt/
//             Tool-Beschreibung in diesem Moment. Dient als Vergleich
//             ("heute" vs. "jetzt") UND als Ziel zum Zuruecksetzen.
//   finding   Der Befund des Testers: Problem-Art, Schwere, Kommentar,
//             optional die Wunschantwort (wird spaeter zum Test-Assert).
//
// Beide getrennt, damit ein neuer Befund die Basislinie nicht ueberschreibt
// und ein Zuruecksetzen den Kommentar nicht wegwirft.

import admin from "firebase-admin";
import { masCollection } from "../tenant.js";

const COLLECTION = "mas_clara_lab";
const FieldValue = admin.firestore.FieldValue;

const s = (v, max = 4000) => String(v ?? "").trim().slice(0, max);

// Problem-Arten: bewusst eine feste Liste. Jede Art zeigt auf eine andere
// Stelle im Code - genau das macht den Export fuer die Fehlersuche brauchbar.
export const PROBLEM_KINDS = [
  "falsches_tool",      // Routing: tool_subsetting / Tool-Beschreibung
  "falsche_daten",      // Tool liefert Unsinn -> MAS-Endpunkt
  "formulierung",       // Inhalt richtig, Ton/Wortwahl falsch -> Prompt
  "zu_lang",            // Laengenregel -> Prompt / response_guard
  "nicht_sprechbar",    // Zahlen/Datum/Abkuerzung -> response_guard
  "halluziniert",       // erfundene Fakten -> Fakten-Waechter
  "keine_antwort",      // leer / Fallback
  "zu_langsam",         // Latenz
  "sonstiges",
];
export const SEVERITIES = ["blocker", "stoerend", "kosmetik"];

function col(clientId) {
  return masCollection(clientId, COLLECTION);
}

/** Alles zu einem Mandanten (Basislinien + Befunde), nach caseId geschluesselt. */
export async function listLab(clientId) {
  const snap = await col(clientId).limit(2000).get();
  const out = {};
  for (const d of snap.docs) out[d.id] = { caseId: d.id, ...(d.data() || {}) };
  return out;
}

/** Befund setzen oder loeschen (leerer Kommentar + kein Problem = loeschen). */
export async function saveFinding(clientId, caseId, input = {}, by = "Superuser") {
  const id = s(caseId, 120);
  if (!id) throw new Error("caseId fehlt");

  const problem = PROBLEM_KINDS.includes(input.problem) ? input.problem : "";
  const comment = s(input.comment, 4000);
  const expectedAnswer = s(input.expectedAnswer, 4000);

  if (!problem && !comment && !expectedAnswer) {
    await col(clientId).doc(id).set({ finding: FieldValue.delete() }, { merge: true });
    return { ok: true, cleared: true };
  }

  const finding = {
    problem: problem || "sonstiges",
    severity: SEVERITIES.includes(input.severity) ? input.severity : "stoerend",
    comment,
    expectedAnswer,
    // Momentaufnahme des Laufs, auf den sich der Befund bezieht - ohne die
    // ist der Kommentar spaeter wertlos ("was war denn das Problem?").
    question: s(input.question, 1000),
    answer: s(input.answer, 6000),
    toolExpected: Array.isArray(input.toolExpected) ? input.toolExpected.slice(0, 10).map((x) => s(x, 80)) : [],
    toolActual: s(input.toolActual, 80),
    toolArgs: typeof input.toolArgs === "object" && input.toolArgs ? input.toolArgs : {},
    autoFails: Array.isArray(input.autoFails) ? input.autoFails.slice(0, 20).map((x) => s(x, 300)) : [],
    latencyMs: {
      ttft: Number(input.ttftMs) || 0,
      total: Number(input.totalMs) || 0,
    },
    group: s(input.group, 40),
    category: s(input.category, 60),
    by: s(by, 80),
    updatedAt: Date.now(),
  };
  await col(clientId).doc(id).set({ finding, caseId: id }, { merge: true });
  return { ok: true, finding };
}

/**
 * IST-Zustand einfrieren. Ueberschreibt eine vorhandene Basislinie NUR auf
 * ausdruecklichen Wunsch (force) - sonst waere der "heutige Stand" nach der
 * ersten Aenderung verloren, und genau der ist der Bezugspunkt.
 */
export async function saveBaseline(clientId, caseId, snapshot = {}, { force = false, by = "Superuser" } = {}) {
  const id = s(caseId, 120);
  if (!id) throw new Error("caseId fehlt");
  const ref = col(clientId).doc(id);

  if (!force) {
    const cur = await ref.get();
    if (cur.exists && cur.data()?.baseline) {
      return { ok: true, kept: true, baseline: cur.data().baseline };
    }
  }

  const baseline = {
    question: s(snapshot.question, 1000),
    answer: s(snapshot.answer, 8000),
    tool: s(snapshot.tool, 80),
    toolArgs: typeof snapshot.toolArgs === "object" && snapshot.toolArgs ? snapshot.toolArgs : {},
    pass: !!snapshot.pass,
    fails: Array.isArray(snapshot.fails) ? snapshot.fails.slice(0, 20).map((x) => s(x, 300)) : [],
    totalMs: Number(snapshot.totalMs) || 0,
    model: s(snapshot.model, 80),
    // Die Fassung, gegen die verglichen wird. toolDescription ist die
    // Beschreibung des TATSAECHLICH gewaehlten Tools - beim Zuruecksetzen
    // genau das Feld, das punktgenau wiederhergestellt werden kann.
    promptHash: s(snapshot.promptHash, 64),
    promptChars: Number(snapshot.promptChars) || 0,
    toolDescription: s(snapshot.toolDescription, 8000),
    frozenAt: Date.now(),
    by: s(by, 80),
  };
  await ref.set({ baseline, caseId: id }, { merge: true });
  return { ok: true, baseline };
}

export async function clearBaseline(clientId, caseId) {
  const id = s(caseId, 120);
  await col(clientId).doc(id).set({ baseline: FieldValue.delete() }, { merge: true });
  return { ok: true };
}

/**
 * Export fuer die Fehlersuche. Bewusst so gebaut, dass jeder Befund OHNE
 * Rueckfrage nachstellbar ist: caseId + repro-Kommando + erwartetes vs.
 * tatsaechliches Tool (trennt Routing- von Formulierungsfehlern).
 */
export async function exportFindings(clientId, meta = {}) {
  const all = await listLab(clientId);
  const findings = Object.values(all)
    .filter((d) => d.finding)
    .sort((a, b) => {
      const rank = (x) => SEVERITIES.indexOf(x?.finding?.severity ?? "stoerend");
      return rank(a) - rank(b) || String(a.caseId).localeCompare(String(b.caseId));
    })
    .map((d) => {
      const f = d.finding;
      const b = d.baseline;
      return {
        caseId: d.caseId,
        group: f.group || "",
        category: f.category || "",
        question: f.question,
        answer: f.answer,
        toolExpected: f.toolExpected,
        toolActual: f.toolActual,
        toolArgs: f.toolArgs,
        autoFails: f.autoFails,
        problem: f.problem,
        severity: f.severity,
        comment: f.comment,
        expectedAnswer: f.expectedAnswer,
        latencyMs: f.latencyMs,
        baselineAnswer: b?.answer || "",
        baselineTool: b?.tool || "",
        changedSinceBaseline: !!b && (b.answer !== f.answer || b.tool !== f.toolActual),
        repro: `python testsuite/run_tests.py --no-audio --no-dialogs --ids ${d.caseId}`,
      };
    });

  return {
    exportedAt: new Date().toISOString(),
    clientId,
    profileId: s(meta.profileId, 80),
    model: s(meta.model, 80),
    counts: {
      findings: findings.length,
      blocker: findings.filter((f) => f.severity === "blocker").length,
      byProblem: findings.reduce((acc, f) => {
        acc[f.problem] = (acc[f.problem] || 0) + 1;
        return acc;
      }, {}),
    },
    findings,
  };
}

/** Menschenlesbare Fassung desselben Exports. */
export function findingsToMarkdown(data) {
  const L = [];
  L.push(`# Clara-Testlabor: Befunde`);
  L.push("");
  L.push(`Mandant: ${data.clientId} · Profil: ${data.profileId || "?"} · Modell: ${data.model || "?"}`);
  L.push(`Export: ${data.exportedAt}`);
  L.push("");
  L.push(`**${data.counts.findings} Befunde**, davon ${data.counts.blocker} Blocker.`);
  L.push("");
  for (const f of data.findings) {
    L.push(`## ${f.caseId} — ${f.severity} — ${f.problem}`);
    L.push("");
    L.push(`**Frage:** ${f.question}`);
    L.push("");
    L.push(`**Clara antwortet:** ${f.answer || "(leer)"}`);
    L.push("");
    if (f.toolExpected?.length || f.toolActual) {
      L.push(`**Tool:** erwartet ${f.toolExpected?.join("/") || "—"}, gewaehlt \`${f.toolActual || "none"}\``);
      L.push("");
    }
    if (f.comment) {
      L.push(`**Kommentar:** ${f.comment}`);
      L.push("");
    }
    if (f.expectedAnswer) {
      L.push(`**So waere es richtig:** ${f.expectedAnswer}`);
      L.push("");
    }
    if (f.autoFails?.length) {
      L.push(`Automatische Pruefung: ${f.autoFails.join("; ")}`);
      L.push("");
    }
    L.push(`Nachstellen: \`${f.repro}\``);
    L.push("");
  }
  return L.join("\n");
}
