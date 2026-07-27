import { masCollection } from "../tenant.js";
import { buildAsapQueue } from "./asapQueue.js";
import { getDayAppointments, todayBerlin } from "./daySchedule.js";
import { getOperator } from "./sessions.js";
import { listOperators } from "./operators.js";
import { callOperator, notifyOperator, setPendingCallContext } from "./devices.js";
import { appendEvent } from "../brain/eventStore.js";
import { log } from "../log.js";

// ============================================================================
// Unterbrechungs-Politik (Masterplan Phase 5, 04.07.2026).
//
// Die ASAP-Queue (asapQueue.js) WEISS, was brennt — dieses Modul entscheidet,
// WANN und WIE Clara von sich aus stoert. Der Kalender ist der Taktgeber:
//
//   P0  sofort           aktiver Anruf aufs Chef-Handy (Muster Doku-Waechter/
//                        Recall-Initiative), auch waehrend Behandlung.
//   P1  naechste Luecke  Push, sobald KEINE Behandlung laeuft (Kalender-Luecke
//                        oder Feierabend) — nie mitten im Patienten.
//   P2  naechstes Briefing (Morgen/Abend/asap_briefing) — nie spontan.
//   P3  nur UI/Cockpit.
//
// Anti-Nerv-Regeln (alle pro Mandant konfigurierbar, mas_config/proaktiv):
//   * BASELINE beim allerersten Lauf: der vorhandene Bestand (alte rote
//     Liste, liegengebliebene Anliegen) wird als "bekannt" markiert und NICHT
//     gemeldet — sonst wuerde die Aktivierung mit Wochen alten Altlasten
//     telefonieren. Proaktiv gemeldet wird nur, was NACH der Aktivierung
//     neu dazukommt.
//   * Tagesbudget fuer Spontan-Meldungen (Start: 3). P0 zaehlt NICHT gegen
//     das Budget (Risiko geht immer durch), verbraucht aber Dedupe.
//   * Hoechstens EIN P0-Anruf pro Tag (Muster Doku-Waechter); weitere P0
//     desselben Tages werden zum Push statt Anruf.
//   * Hoechstens EIN P1-Push pro Sweep (Tropf statt Schwall).
//   * Ruhezeiten 20-7 Uhr (wie QM-Push): nichts Spontanes, P0 ausgenommen.
//   * Waehrend laufender Behandlung stumm — AUSSER das Anliegen betrifft den
//     Patienten, der GERADE im Stuhl sitzt (dann ist es Vorbereitung, kein
//     Stoerfall).
//   * Jedes Ereignis wird hoechstens EINMAL spontan gemeldet (announced-Set).
//   * Snooze lernt: 1x snoozen = Pause nach Wunsch; 2x am selben Tag =>
//     fuer den Rest des Tages ist Ruhe (nur noch P0).
//
// Not-Aus: mas_config/proaktiv { enabled: false } ODER Umgebungsvariable
// MAS_PROAKTIV=0 (Scheduler in server.js startet dann gar nicht).
//
// Rollen-Feinsteuerung (wer bekommt welche Prio) kommt mit Phase 6 (RBAC);
// bis dahin gilt die Politik fuer den aktiven Operator (Chef-Geraet).
// ============================================================================

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  dailyBudget: 3, // Spontan-Meldungen (P1) pro Tag
  quietStartHour: 20, // wie qm/notify.js
  quietEndHour: 7,
  p0Call: true, // P0 = aktiver Anruf; false => nur Push
});

function cfgRef(clientId) {
  return masCollection(clientId, "mas_config").doc("proaktiv");
}

function stateRef(clientId) {
  return masCollection(clientId, "mas_proaktiv").doc("state");
}

export async function loadProaktivConfig(clientId) {
  const snap = await cfgRef(clientId).get().catch(() => null);
  const raw = snap?.exists ? snap.data() : {};
  return {
    enabled: raw.enabled !== false,
    dailyBudget: Number.isFinite(Number(raw.dailyBudget)) ? Math.max(0, Number(raw.dailyBudget)) : DEFAULT_CONFIG.dailyBudget,
    quietStartHour: Number.isFinite(Number(raw.quietStartHour)) ? Number(raw.quietStartHour) : DEFAULT_CONFIG.quietStartHour,
    quietEndHour: Number.isFinite(Number(raw.quietEndHour)) ? Number(raw.quietEndHour) : DEFAULT_CONFIG.quietEndHour,
    p0Call: raw.p0Call !== false,
  };
}

async function loadState(clientId, day) {
  const snap = await stateRef(clientId).get().catch(() => null);
  const raw = snap?.exists ? snap.data() : {};
  // announced-Eintraege aelter als 72 h ausduennen (Queue-Fenster ist 48 h,
  // die Keys koennen also nicht mehr auftauchen).
  const announced = {};
  const cutoff = Date.now() - 72 * 3600 * 1000;
  for (const [k, v] of Object.entries(raw.announced || {})) {
    if (Number(v?.at || 0) >= cutoff || v?.via === "baseline") announced[k] = v;
  }
  if (raw.day !== day) {
    // Neuer Tag: Budgets/Snooze zuruecksetzen; announced + baselinedAt
    // ueberleben den Tageswechsel (sonst wuerde Altes erneut gemeldet).
    return { day, spontaneousCount: 0, snoozeUntilMs: 0, snoozeCount: 0, lastP0CallDay: raw.lastP0CallDay || "", baselinedAt: Number(raw.baselinedAt || 0), announced };
  }
  return {
    day,
    spontaneousCount: Number(raw.spontaneousCount || 0),
    snoozeUntilMs: Number(raw.snoozeUntilMs || 0),
    snoozeCount: Number(raw.snoozeCount || 0),
    lastP0CallDay: raw.lastP0CallDay || "",
    baselinedAt: Number(raw.baselinedAt || 0),
    announced,
  };
}

async function saveState(clientId, state) {
  await stateRef(clientId).set(state, { merge: false }).catch(() => {});
}

function berlinHour(nowMs) {
  const txt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(new Date(nowMs));
  const h = parseInt(txt, 10);
  return h === 24 ? 0 : h;
}

function isQuiet(nowMs, cfg) {
  const h = berlinHour(nowMs);
  return h >= cfg.quietStartHour || h < cfg.quietEndHour;
}

/**
 * Laufende Behandlung JETZT? Liefert die laufenden echten Termine (praxisweit).
 * Vereinfachung Stand Phase 5: ohne Raum-/Anwesenheitsdaten gilt "im Stuhl" =
 * ein realer Termin laeuft gerade in irgendeinem Kalender.
 */
export async function runningAppointments(clientId, nowMs = Date.now()) {
  const day = await getDayAppointments(clientId, { date: todayBerlin() }).catch(() => null);
  if (!day?.ok) return [];
  return (day.appointments || []).filter((a) => !a.isAbsence
    && a.startMs <= nowMs && nowMs < (a.endMs || a.startMs + 30 * 60000));
}

/**
 * Reine Entscheidungsfunktion (testbar ohne I/O): Was passiert mit einem
 * ASAP-Item JETZT?
 *
 * @returns {"call"|"push"|"defer"|"briefing_only"|"skip"} plus Grund
 */
export function decideDelivery(item, {
  nowMs = Date.now(),
  running = [], // laufende Termine (runningAppointments)
  budgetLeft = 0,
  snoozed = false,
  quiet = false,
  announced = {},
} = {}) {
  const key = item.eventId || `${item.source}:${item.spoken}`;
  if (announced[key]) return { action: "skip", reason: "already_announced", key };

  if (item.prio === "P0") {
    // Risiko geht immer durch — auch in Ruhezeit, auch am Stuhl.
    return { action: "call", reason: "p0_immediate", key };
  }

  if (item.prio === "P2") return { action: "briefing_only", reason: "p2_waits_for_briefing", key };
  if (item.prio === "P3") return { action: "skip", reason: "p3_ui_only", key };

  // P1: naechste Kalender-Luecke, mit Anti-Nerv-Regeln.
  if (snoozed) return { action: "defer", reason: "snoozed", key };
  if (quiet) return { action: "defer", reason: "quiet_hours", key };
  if (budgetLeft <= 0) return { action: "briefing_only", reason: "daily_budget_used", key };

  if (running.length) {
    // Ausnahme: betrifft das Anliegen den Patienten, der GERADE behandelt wird?
    const ids = new Set(running.map((r) => r.patientId).filter(Boolean));
    const names = new Set(running.map((r) => (r.patientName || "").toLowerCase()).filter(Boolean));
    const about = (item.aboutPatient || "").toLowerCase();
    const matches = (item.patientId && ids.has(item.patientId))
      || (about && [...names].some((n) => n && (about.includes(n) || n.includes(about))));
    if (!matches) return { action: "defer", reason: "treatment_running", key };
    return { action: "push", reason: "about_current_patient", key };
  }

  return { action: "push", reason: "calendar_gap", key };
}

/** Chef-Operator aufloesen (aktiver Operator, sonst erster hinterlegter). */
async function resolveOperatorId(clientId) {
  const op = await getOperator(clientId).catch(() => null);
  if (op?.id) return op.id;
  const ops = await listOperators(clientId).catch(() => []);
  return ops?.[0]?.id || "";
}

/**
 * Ein Proaktiv-Durchlauf (Scheduler-Eintritt, idempotent, billig im Leerlauf):
 * ASAP-Queue bauen, pro Item entscheiden, P0 anrufen / P1 in der Luecke
 * pushen, Zustand fortschreiben.
 */
export async function runProaktivSweep(clientId, { publicBaseUrl = "", nowMs = Date.now(), mailAccountIds } = {}) {
  const cfg = await loadProaktivConfig(clientId);
  if (!cfg.enabled) return { ok: true, skipped: "disabled" };

  const day = todayBerlin();
  const state = await loadState(clientId, day);
  const queue = await buildAsapQueue(clientId, { mailAccountIds });
  const actionable = queue.items.filter((i) => i.prio === "P0" || i.prio === "P1");

  // Erstaktivierung: Bestand als bekannt markieren, NICHTS melden. Nur was ab
  // jetzt NEU in die Queue kommt, loest Anrufe/Pushes aus.
  if (!state.baselinedAt) {
    for (const item of actionable) {
      const key = item.eventId || `${item.source}:${item.spoken}`;
      state.announced[key] = { at: nowMs, via: "baseline" };
    }
    state.baselinedAt = nowMs;
    await saveState(clientId, state);
    log.info("proaktiv.baseline", { clientId, baselined: actionable.length });
    return { ok: true, baselined: actionable.length, announced: 0 };
  }

  if (!actionable.length) return { ok: true, announced: 0 };

  const running = await runningAppointments(clientId, nowMs);
  const quiet = isQuiet(nowMs, cfg);
  const snoozed = state.snoozeUntilMs > nowMs || state.snoozeCount >= 2;
  let budgetLeft = Math.max(0, cfg.dailyBudget - state.spontaneousCount);
  const operatorId = await resolveOperatorId(clientId);
  if (!operatorId) return { ok: false, reason: "no_operator" };

  let announcedCount = 0;
  let callUsed = state.lastP0CallDay === day; // hoechstens EIN P0-Anruf pro Tag
  let pushUsedThisSweep = false; // hoechstens EIN P1-Push pro Sweep

  for (const item of actionable) {
    const d = decideDelivery(item, { nowMs, running, budgetLeft, snoozed, quiet, announced: state.announced });

    if (d.action === "call") {
      const asCall = cfg.p0Call && !callUsed;
      if (asCall) {
        const reason = `Dringend: ${item.spoken}. Verbinden Sie sich, dann gehen wir es durch.`;
        const r = await callOperator(clientId, operatorId, { reason, publicBaseUrl }).catch(() => ({ ok: false }));
        if (r?.ok) {
          await setPendingCallContext(clientId, {
            kind: "asap_p0",
            reason,
            date: day,
            spoken: `Ich habe Sie angerufen, weil etwas nicht liegen bleiben darf: ${item.spoken}. Sollen wir das jetzt angehen?`,
            instruction:
              "KONTEXT: Du (Clara) hast den Chef soeben aktiv angerufen, weil ein kritischer Vorgang " +
              `ansteht: ${item.spoken}. Erklaere kurz worum es geht und biete den naechsten Schritt an ` +
              "(z. B. Details vorlesen, Rueckruf delegieren, Team-Memo). Erfinde NICHTS dazu.",
          }).catch(() => {});
          state.announced[d.key] = { at: nowMs, via: "call" };
          state.lastP0CallDay = day;
          callUsed = true;
          announcedCount++;
          await appendEvent(clientId, {
            channel: "clara_voice", direction: "internal", type: "note",
            counterparty: { kind: "other", name: "Clara" },
            subject: { matchStatus: "n/a" },
            summary: `Proaktiv (P0): Chef aktiv angerufen — ${item.spoken}.`,
            status: "none", extractor: "proaktiv@sweep", tags: ["proaktiv", "p0"],
          }).catch(() => {});
        }
      } else {
        // Anruf-Budget verbraucht oder p0Call aus: P0 als Push melden.
        const r = await notifyOperator(clientId, operatorId, {
          title: "Dringend (P0)", body: item.spoken.slice(0, 240), url: "",
        }).catch(() => ({ ok: false }));
        if (r?.ok) { state.announced[d.key] = { at: nowMs, via: "push" }; announcedCount++; }
      }
    } else if (d.action === "push" && !pushUsedThisSweep) {
      const r = await notifyOperator(clientId, operatorId, {
        title: "Wenn Sie kurz Luft haben", body: item.spoken.slice(0, 240), url: "",
      }).catch(() => ({ ok: false }));
      if (r?.ok) {
        state.announced[d.key] = { at: nowMs, via: "push" };
        state.spontaneousCount += 1;
        budgetLeft -= 1;
        pushUsedThisSweep = true;
        announcedCount++;
      }
    }
    // defer/briefing_only/skip: nichts tun — naechster Sweep prueft neu.
  }

  await saveState(clientId, state);
  if (announcedCount) log.info("proaktiv.sweep", { clientId, announced: announcedCount, budgetLeft });
  return { ok: true, announced: announcedCount, budgetLeft };
}

/**
 * Snooze ("Clara, Ruhe jetzt"): pausiert Spontan-Meldungen. Lern-Regel:
 * zweimal am selben Tag gesnoozt => Rest des Tages Ruhe (nur noch P0).
 */
export async function snoozeProaktiv(clientId, { minutes = 60, by = "" } = {}) {
  const day = todayBerlin();
  const state = await loadState(clientId, day);
  const mins = Math.max(5, Math.min(8 * 60, Number(minutes) || 60));
  state.snoozeUntilMs = Date.now() + mins * 60000;
  state.snoozeCount += 1;
  await saveState(clientId, state);
  const restOfDay = state.snoozeCount >= 2;
  log.info("proaktiv.snooze", { clientId, minutes: mins, count: state.snoozeCount, by });
  return {
    ok: true,
    minutes: mins,
    restOfDay,
    message: restOfDay
      ? "Alles klar — fuer den Rest des Tages melde ich mich nur noch, wenn wirklich etwas brennt."
      : `Verstanden, ich halte mich ${mins >= 60 ? `${Math.round(mins / 60)} Stunde${mins >= 120 ? "n" : ""}` : `${mins} Minuten`} zurueck. Kritisches sage ich trotzdem sofort.`,
  };
}
