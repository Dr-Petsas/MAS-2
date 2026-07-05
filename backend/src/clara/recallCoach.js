import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { loadBooking, ensureBerlinTz } from "./booking.js";
import { commitBooking } from "./agentBooking.js";
import { runGapFill, approveCallList } from "./gapFill.js";
import { lisaSendSms, lisaStartCall, smsConfigured, callConfigured } from "../lisa/outbound.js";
import { listCases, addUpdate, setStatus } from "../brain/caseStore.js";
import { CASE_STATUS } from "../brain/cases.js";
import { resolveOutreach, composeRecallCallInstruction, composeRecallSms } from "./outreachTemplates.js";
import { specialtyKeyForClient } from "./dokuPflicht.js";
import { callOperator, setPendingCallContext, clearPendingCallContext } from "./devices.js";
import { appendEvent } from "../brain/eventStore.js";
import { getOperator, emitCommand } from "./sessions.js";
import { listOperators } from "./operators.js";
import { todayBerlin } from "./daySchedule.js";
import { log } from "../log.js";

// ============================================================================
// Recall-Coach — Stufe 2: der geschlossene Kreislauf.
//
// Stufe 1 (gapFill.js) erkennt Lücken, findet CampaignR-/Recall-Kandidaten und
// legt Anruflisten als Gesprächsaufträge an (waiting_approval). Diese Stufe
// macht daraus eine Mitarbeiterin:
//
//   INITIATIVE  dailyInitiativeScan: Abend-/Morgen-Scan. Bei Unterauslastung
//               meldet sich Clara per Push auf dem gekoppelten Handy und das
//               Tagesbriefing erwähnt den Anlass. Max. 1 Initiative pro Tag.
//   FREIGABE    approveAndExecute: die MÜNDLICHE Freigabe ("Recall freigeben")
//               approved die Liste(n) und startet sofort die Ausführung.
//   AUSFÜHRUNG  executeCallList: consent-gesteuert — wer NUR SMS erlaubt hat,
//               bekommt eine SMS mit Slot-Angebot; alle anderen ruft Lisa an.
//   RÜCKKANAL   sweepRecallOutcomes: wertet Lisas Gesprächsergebnisse aus.
//               Zusage -> Termin wird DIREKT fest gebucht (Entscheidung Chef),
//               Absage/Nichterreichen wird protokolliert (SMS-Fallback bei
//               Consent). Alles landet als Update am Gesprächsauftrag-Case.
//   BERICHT     recallStatusSpoken: "Von 5 Kontakten: 2 gebucht, 1 abgesagt,
//               2 nicht erreicht."
// ============================================================================

const TZ = "Europe/Berlin";

function s(v) {
  return v == null ? "" : String(v).trim();
}

function minutesToHHMM(min) {
  const h = Math.floor((Number(min) || 0) / 60);
  const m = (Number(min) || 0) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dateDe(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

function casesCol(clientId) {
  return masCollection(clientId, "mas_cases");
}

function tasksCol(clientId) {
  return masCollection(clientId, "mas_lisa_tasks");
}

function configRef(clientId) {
  return masCollection(clientId, "mas_config").doc("recall_initiative");
}

// ----------------------------------------------------------------------------
// Ausführung einer freigegebenen Anrufliste (consent-gemischt)
// ----------------------------------------------------------------------------

// Kanalwahl pro Kandidat (Entscheidung Chef: "mixed"):
//   nur SMS-Consent           -> SMS
//   Reminder-Consent/unbekannt -> Anruf (reguläre Praxiskommunikation)
function channelFor(candidate) {
  const smsOk = candidate.consent?.sms === true;
  const reminderOk = candidate.consent?.reminder === true;
  if (smsOk && !reminderOk) return smsConfigured() ? "sms" : (callConfigured() ? "call" : null);
  return callConfigured() ? "call" : (smsOk && smsConfigured() ? "sms" : null);
}

// W-OUTREACH (05.07.2026): Anruf und SMS sagen jetzt WARUM kontaktiert wird.
// Die motivspezifischen Bausteine kommen aus outreachTemplates (zentraler
// Katalog, Kaskade Kampagnen-Override > Katalog > Klasse > generisch) — die
// Sicherheitsregeln stehen fest in composeRecallCallInstruction.

function resolveCandidateOutreach(cand, specialtyKey) {
  return resolveOutreach({ specialtyKey, visitMotiveName: s(cand.visitMotiveName) });
}

function buildSmsOffer({ cand, booking, date, timeLabel, specialtyKey }) {
  return composeRecallSms({
    practiceName: booking?.practiceName,
    practicePhone: booking?.practicePhone,
    patientName: cand?.name,
    date,
    timeLabel,
    visitMotiveName: cand?.visitMotiveName,
    outreach: resolveCandidateOutreach(cand || {}, specialtyKey),
  });
}

function buildCallInstruction({ cand, booking, date, timeLabel, calendarName, specialtyKey }) {
  return composeRecallCallInstruction({
    practiceName: booking?.practiceName,
    patientName: cand?.name,
    date,
    timeLabel,
    calendarName,
    visitMotiveName: cand?.visitMotiveName,
    overdueDays: cand?.overdueDays,
    source: cand?.source || (cand?.campaignId ? "campaign" : "recall"),
    outreach: resolveCandidateOutreach(cand || {}, specialtyKey),
    campaignPrompt: cand?.phonePrompt,
  });
}

/**
 * Kontaktiert alle noch nicht kontaktierten Kandidaten EINER freigegebenen
 * Liste. Schreibt pro Kandidat den Kontaktversuch (Kanal, Task-Id) zurück an
 * den Case, damit der Outcome-Sweep die Ergebnisse zuordnen kann.
 */
export async function executeCallList(clientId, caseId, { by } = {}) {
  const ref = casesCol(clientId).doc(s(caseId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const c = snap.data();
  const list = c.callList;
  if (!list || !list.approvedBy) return { ok: false, reason: "not_approved" };

  const booking = await loadBooking(clientId).catch(() => null);
  const specialtyKey = await specialtyKeyForClient(clientId).catch(() => "");
  const timeLabel = minutesToHHMM(list.slot?.startMin);
  const candidates = Array.isArray(list.candidates) ? [...list.candidates] : [];
  let calls = 0;
  let smses = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    if (cand.contact?.taskId) continue; // bereits kontaktiert (idempotent)
    const channel = channelFor(cand);
    if (!channel || !cand.phone) {
      skipped++;
      candidates[i] = { ...cand, contact: { via: "none", reason: !cand.phone ? "no_phone" : "no_channel", at: Date.now() } };
      continue;
    }

    if (channel === "sms") {
      const out = await lisaSendSms(clientId, {
        phone: cand.phone,
        message: buildSmsOffer({ cand, booking, date: list.date, timeLabel, specialtyKey }),
        recipientName: cand.name,
        by: by || "Recall-Coach",
      });
      candidates[i] = { ...cand, contact: { via: "sms", taskId: out.taskId || null, ok: out.ok !== false, at: Date.now() } };
      if (out.ok !== false) smses++;
    } else {
      const out = await lisaStartCall(clientId, {
        phone: cand.phone,
        instruction: buildCallInstruction({
          cand, booking, date: list.date, timeLabel,
          calendarName: list.calendarName, specialtyKey,
        }),
        contactName: cand.name,
        by: by || "Recall-Coach",
      });
      candidates[i] = { ...cand, contact: { via: "call", taskId: out.taskId || null, ok: out.ok !== false, at: Date.now() } };
      if (out.ok !== false) calls++;
    }
  }

  await ref.update({ "callList.candidates": candidates, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await addUpdate(clientId, c.id, {
    by: by || "Recall-Coach",
    kind: "note",
    text: `Ausführung gestartet: ${calls} Anruf(e) durch Lisa, ${smses} SMS, ${skipped} übersprungen (kein Kanal/keine Nummer). Slot ${list.slot?.label || ""} am ${list.date} bei ${list.calendarName || ""}.`,
  });

  return { ok: true, caseId: c.id, calls, smses, skipped };
}

// ----------------------------------------------------------------------------
// Mündliche Freigabe: alle wartenden Listen (optional eines Tages) freigeben
// und sofort ausführen.
// ----------------------------------------------------------------------------

async function pendingGapCases(clientId, { date } = {}) {
  const cases = await listCases(clientId, { activeOnly: true, assignee: "Lisa", limit: 100 });
  return cases.filter((c) =>
    c.id.startsWith("gapfill_") &&
    c.callList &&
    c.status === CASE_STATUS.WAITING_APPROVAL &&
    (!date || c.callList.date === date)
  );
}

export async function approveAndExecute(clientId, { date, caseId, by } = {}) {
  let targets;
  if (caseId) {
    targets = [{ id: s(caseId) }];
  } else {
    targets = await pendingGapCases(clientId, { date: s(date) || null });
  }
  if (!targets.length) {
    return { ok: true, approved: 0, message: "Es wartet gerade keine Anrufliste auf Freigabe. Sage zuerst: Recall starten — dann baue ich die Listen." };
  }

  let approved = 0;
  let calls = 0;
  let smses = 0;
  for (const t of targets) {
    const ap = await approveCallList(clientId, t.id, { by });
    if (!ap.ok) continue;
    approved++;
    const ex = await executeCallList(clientId, t.id, { by });
    if (ex.ok) {
      calls += ex.calls;
      smses += ex.smses;
    }
  }

  // Initiative ist damit beantwortet — nicht weiter im Briefing erwähnen und
  // den Push-Gesprächskontext verwerfen (sonst eröffnet Clara beim nächsten
  // Verbinden nochmal mit der bereits erledigten Initiative).
  await configRef(clientId).set({ status: "done", answeredAt: Date.now() }, { merge: true }).catch(() => {});
  await clearPendingCallContext(clientId).catch(() => {});

  if (!approved) return { ok: false, message: "Die Freigabe hat nicht geklappt — bitte im Monitor prüfen." };
  const parts = [`${approved} Anrufliste${approved === 1 ? "" : "n"} freigegeben.`];
  if (calls) parts.push(`Lisa startet ${calls} Anruf${calls === 1 ? "" : "e"}.`);
  if (smses) parts.push(`${smses} SMS mit Terminangebot ${smses === 1 ? "geht" : "gehen"} raus.`);
  if (!calls && !smses) parts.push("Es konnte allerdings niemand kontaktiert werden — bitte Kanäle prüfen.");
  parts.push("Ich melde mich mit den Ergebnissen.");
  return { ok: true, approved, calls, smses, message: parts.join(" ") };
}

// ----------------------------------------------------------------------------
// Outcome-Sweep: Lisas Ergebnisse auswerten, bei Zusage DIREKT fest buchen
// ----------------------------------------------------------------------------

const ACCEPT_RE = /\b(ja,? (sehr )?gerne|passt (mir )?(gut|sehr gut|super|prima)|das passt|einverstanden|in ordnung|nehme ich|machen wir( so)?|sehr gut,? danke|perfekt)\b/i;
const DECLINE_RE = /(passt (mir )?(leider )?nicht|kein interesse|keine zeit|m[öo]chte (das )?nicht|nicht n[öo]tig|lieber nicht|absagen|kein bedarf|brauche keinen)/i;
// Beschwerde-/Opt-out-Wächter (W-OUTREACH): Diese Formulierungen bedeuten
// "hier ist etwas schiefgelaufen" — Reputation geht vor Terminfüllung.
const COMPLAINT_RE = /(nicht mehr anrufen|keine anrufe mehr|nie wieder anrufen|in ruhe lassen|h[öo]ren sie auf|bel[äa]stig|unversch[äa]mt|frechheit|beschwerde|beschwer(e|t)|anwalt|abmahnung|datenschutz|werbeanruf|dsgvo)/i;

function patientSaid(transcriptText) {
  return String(transcriptText || "")
    .split("\n")
    .filter((l) => /^(user|caller|patient)\s*:/i.test(l))
    .join(" ");
}

async function bookAcceptedCandidate(clientId, c, list, cand) {
  const slotIso = ensureBerlinTz(`${list.date}T${minutesToHHMM(list.slot?.startMin)}:00`);
  const r = await commitBooking(clientId, {
    patientId: cand.patientId,
    calendarId: list.calendarId,
    visitMotiveId: cand.visitMotiveId,
    slotIso,
  });
  if (r.ok && r.booked) {
    await emitCommand(clientId, {
      type: "appointment_created",
      date: list.date,
      slotIso,
      calendarId: list.calendarId,
      calendarName: list.calendarName,
      patient: { firstName: "", lastName: cand.name },
      visitMotiveName: cand.visitMotiveName || null,
    }).catch(() => {});
    await addUpdate(clientId, c.id, {
      by: "Recall-Coach",
      kind: "note",
      text: `GEBUCHT: ${cand.name} hat zugesagt — Termin am ${list.date} ${minutesToHHMM(list.slot?.startMin)} Uhr bei ${list.calendarName || ""} ist fest eingetragen.`,
    });
    return "booked";
  }
  await addUpdate(clientId, c.id, {
    by: "Recall-Coach",
    kind: "note",
    text: `ACHTUNG: ${cand.name} hat zugesagt, aber die automatische Buchung schlug fehl (${r.error || "needs_phone"}). Bitte manuell eintragen: ${list.date} ${minutesToHHMM(list.slot?.startMin)} Uhr.`,
  });
  return "accepted_booking_failed";
}

/**
 * Periodischer Sweep über laufende Recall-Listen: ordnet beendete Lisa-Calls
 * den Kandidaten zu, bucht Zusagen direkt, protokolliert Absagen und schickt
 * bei Nichterreichen die SMS als Fallback (sofern Consent vorliegt).
 */
export async function sweepRecallOutcomes(clientId) {
  const cases = await listCases(clientId, { activeOnly: true, assignee: "Lisa", limit: 100 }).catch(() => []);
  const running = cases.filter((c) => c.id.startsWith("gapfill_") && c.callList?.approvedBy && c.status === CASE_STATUS.IN_PROGRESS);
  let processed = 0;

  for (const c of running) {
    const list = c.callList;
    const candidates = [...(list.candidates || [])];
    const booking = await loadBooking(clientId).catch(() => null);
    let changed = false;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const contact = cand.contact;
      if (!contact?.taskId || contact.via !== "call" || contact.outcome) continue;

      const taskSnap = await tasksCol(clientId).doc(contact.taskId).get().catch(() => null);
      const task = taskSnap?.exists ? taskSnap.data() : null;
      if (!task || task.status === "calling") continue; // läuft noch

      let outcome = task.outcome || (task.status === "failed" ? "failed" : "reached");
      if (outcome === "reached") {
        const said = patientSaid(task.transcriptText);
        if (COMPLAINT_RE.test(said)) {
          // Beschwerde/Opt-out schlägt ALLES: kein SMS-Fallback, kein weiterer
          // Kontakt aus dieser Aktion, Mensch übernimmt (ASAP-Queue P1).
          outcome = "complaint";
          await addUpdate(clientId, c.id, {
            by: "Recall-Coach",
            kind: "note",
            text: `ACHTUNG Beschwerde/Opt-out: ${cand.name} hat sich im Anruf beschwert oder keine Anrufe mehr gewünscht — bitte Transkript prüfen (Lisa-Task ${contact.taskId}) und den Kontaktwunsch in der Patientenakte hinterlegen. Es geht KEINE weitere Nachricht aus dieser Aktion raus.`,
          });
          await appendEvent(clientId, {
            channel: "lisa_call",
            direction: "outbound",
            type: "note",
            counterparty: { kind: "patient", name: cand.name, ref: cand.phone || null },
            subject: { name: cand.name },
            summary: `Recall-Anruf bei ${cand.name}: Beschwerde bzw. Opt-out-Wunsch im Gespräch erkannt. Keine weiteren Kontakte aus dieser Aktion; bitte Kontaktwunsch dauerhaft hinterlegen.`,
            signals: { complaintStated: true, needsHuman: true },
            payloadRef: { kind: "lisa_task", id: contact.taskId },
            extractor: "recall@complaint-guard",
            tags: ["recall", "complaint", "optout"],
          }).catch(() => {});
        }
        else if (DECLINE_RE.test(said)) outcome = "declined";
        else if (ACCEPT_RE.test(said)) outcome = await bookAcceptedCandidate(clientId, c, list, cand);
        else {
          outcome = "unclear";
          await addUpdate(clientId, c.id, {
            by: "Recall-Coach",
            kind: "note",
            text: `Unklares Gesprächsergebnis bei ${cand.name} — bitte Transkript im Monitor prüfen (Lisa-Task ${contact.taskId}).`,
          });
        }
      } else if ((outcome === "voicemail" || outcome === "no_answer") && cand.consent?.sms === true && smsConfigured() && !contact.fallbackSmsTaskId) {
        // Nicht erreicht, aber SMS erlaubt -> Terminangebot als SMS hinterher.
        const specialtyKey = await specialtyKeyForClient(clientId).catch(() => "");
        const out = await lisaSendSms(clientId, {
          phone: cand.phone,
          message: buildSmsOffer({ cand, booking, date: list.date, timeLabel: minutesToHHMM(list.slot?.startMin), specialtyKey }),
          recipientName: cand.name,
          by: "Recall-Coach",
        });
        candidates[i] = { ...cand, contact: { ...contact, outcome, fallbackSmsTaskId: out.taskId || null } };
        changed = true;
        processed++;
        continue;
      }

      if (outcome === "declined") {
        await addUpdate(clientId, c.id, { by: "Recall-Coach", kind: "note", text: `${cand.name} hat abgesagt — kein Interesse an dem Slot.` });
      }
      candidates[i] = { ...cand, contact: { ...contact, outcome } };
      changed = true;
      processed++;
    }

    if (changed) {
      await casesCol(clientId).doc(c.id).update({
        "callList.candidates": candidates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Liste abschließen, sobald ein Termin gebucht ist (Lücke gefüllt) oder
      // alle Kontaktversuche ein Ergebnis haben.
      const booked = candidates.some((x) => x.contact?.outcome === "booked");
      const allDone = candidates.every((x) => !x.contact?.taskId || x.contact?.outcome || x.contact?.via !== "call");
      if (booked) {
        await setStatus(clientId, c.id, CASE_STATUS.RESOLVED, { by: "Recall-Coach", note: "Lücke gefüllt — Termin gebucht." });
      } else if (allDone) {
        await addUpdate(clientId, c.id, { by: "Recall-Coach", kind: "note", text: "Alle Kontaktversuche abgeschlossen — kein Termin zustande gekommen. Liste bleibt zur Nachverfolgung offen." });
      }
    }
  }
  return { ok: true, processed };
}

// ----------------------------------------------------------------------------
// Initiative: Abend-/Morgen-Scan + Push aufs gekoppelte Handy
// ----------------------------------------------------------------------------

const INITIATIVE_MIN_GAP_MINUTES = 90; // ab so viel freier Zeit meldet sich Clara

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Scan für EINEN Zieltag. Legt (idempotent) die Anruflisten an, bewertet die
 * Lage und meldet sich bei Unterauslastung GENAU EINMAL pro Tag per Push beim
 * gekoppelten Behandler. Snooze: "heute nicht" setzt status=snoozed.
 */
export async function dailyInitiativeScan(clientId, { targetDate, publicBaseUrl } = {}) {
  const date = s(targetDate) || addDaysIso(todayBerlin(), 1);
  const run = await runGapFill(clientId, { date, horizonDays: 1 });
  if (!run.ok) return { ok: false, reason: run.reason || "scan_failed" };

  const gapsWithCands = run.gaps.filter((g) => g.candidateCount > 0);
  const totalGapMinutes = run.gaps.reduce((sum, g) => sum + (g.minutes || 0), 0);
  const candidateCount = gapsWithCands.reduce((sum, g) => sum + g.candidateCount, 0);
  const worthIt = totalGapMinutes >= INITIATIVE_MIN_GAP_MINUTES && gapsWithCands.length > 0;

  const cfgSnap = await configRef(clientId).get().catch(() => null);
  const cfg = cfgSnap?.exists ? cfgSnap.data() : {};
  const today = todayBerlin();

  if (!worthIt) {
    // Kein Anlass (mehr) — eine offene Initiative für diesen Tag zurückziehen.
    if (cfg.date === date && cfg.status === "open") {
      await configRef(clientId).set({ status: "done", answeredAt: Date.now() }, { merge: true });
    }
    return { ok: true, date, worthIt: false, totalGapMinutes, candidateCount };
  }

  const summary = `Am ${dateDe(date)} sind noch ${Math.round(totalGapMinutes / 60 * 10) / 10} Stunden frei — ${gapsWithCands.length} Lücke${gapsWithCands.length === 1 ? "" : "n"} mit insgesamt ${candidateCount} Recall-Kandidat${candidateCount === 1 ? "" : "en"}.`;

  // Initiative-Status für Briefing-Suffix + Anti-Nerv-Regeln persistieren.
  const alreadyPushedToday = cfg.lastPushDay === today;
  const snoozed = cfg.status === "snoozed" && cfg.date === date;
  await configRef(clientId).set({
    date,
    status: snoozed ? "snoozed" : "open",
    summary,
    gapMinutes: totalGapMinutes,
    gaps: gapsWithCands.length,
    candidates: candidateCount,
    updatedAt: Date.now(),
  }, { merge: true });

  let pushed = false;
  if (!alreadyPushedToday && !snoozed) {
    const op = await getOperator(clientId).catch(() => null);
    let operatorId = op?.id || "";
    if (!operatorId) {
      const ops = await listOperators(clientId).catch(() => []);
      operatorId = ops?.[0]?.id || "";
    }
    if (operatorId) {
      const reason = `${summary} Verbinden Sie sich und sagen Sie: Recall freigeben.`;
      const r = await callOperator(clientId, operatorId, { reason, publicBaseUrl: s(publicBaseUrl) }).catch(() => ({ ok: false }));
      pushed = !!r.ok;
      if (pushed) {
        await configRef(clientId).set({ lastPushDay: today, lastPushAt: Date.now() }, { merge: true });
        // Gesprächskontext hinterlegen: verbindet sich der Chef auf den Push,
        // eröffnet Clara das Gespräch THEMATISCH statt mit "was kann ich tun?".
        await setPendingCallContext(clientId, {
          kind: "recall_initiative",
          reason,
          date,
          spoken: `Ich habe dich angerufen: ${summary} Soll ich die Anruflisten freigeben?`,
          instruction:
            `KONTEXT: Du (Clara) hast den Chef soeben aktiv per Push angerufen. Anlass: ${summary} ` +
            `Die Anruflisten warten auf Freigabe. Stimmt der Chef zu ('ja', 'mach das', 'gib frei', 'leg los'), ` +
            `rufe SOFORT das Tool approve_recall mit date=${date} auf. ` +
            `Lehnt er ab ('heute nicht', 'kein Recall'), rufe recall_snooze auf. ` +
            `Fragt er nach Details, nutze gap_briefing mit date=${date}.`,
        }).catch(() => {});
        // Ticket-Spur im Praxisgedächtnis: Clara hat von sich aus angerufen.
        await appendEvent(clientId, {
          channel: "clara_voice",
          direction: "internal",
          type: "note",
          counterparty: { kind: "other", name: "Clara" },
          subject: { matchStatus: "n/a" },
          summary: `Clara-Initiative: Behandler per Push angerufen — ${summary} (Anruflisten warten auf Freigabe.)`,
          status: "none",
          extractor: "recall@initiative",
          tags: ["recall", "initiative", "push"],
        }).catch(() => {});
        log.info("recall.initiative_pushed", { clientId, date, operatorId });
      }
    }
  }

  return { ok: true, date, worthIt: true, pushed, totalGapMinutes, candidateCount, summary };
}

/** "Heute nicht" — Initiative für den aktuellen Zieltag stummschalten. */
export async function snoozeInitiative(clientId) {
  await configRef(clientId).set({ status: "snoozed", snoozedAt: Date.now() }, { merge: true });
  await clearPendingCallContext(clientId).catch(() => {});
  return { ok: true, message: "Alles klar, ich halte mich mit dem Recall zurück. Sag einfach Bescheid, wenn du ihn doch starten willst." };
}

/** Satz fürs Tagesbriefing, wenn eine unbeantwortete Initiative offen ist. */
const INITIATIVE_MENTION_COOLDOWN_MS = 30 * 60 * 1000;

export async function initiativeSuffix(clientId) {
  const ref = configRef(clientId);
  const snap = await ref.get().catch(() => null);
  if (!snap?.exists) return "";
  const cfg = snap.data();
  if (cfg.status !== "open" || !cfg.date || cfg.date < todayBerlin()) return "";
  // Anti-Wiederholung: der Pitch hing an JEDEM day_briefing — wer im selben
  // Gespräch zweimal nach Terminen fragte, bekam zweimal wortgleich die
  // komplette Recall-Werbung. Einmal erwähnt = 30 Minuten Ruhe; die
  // Initiative selbst bleibt offen und per "Recall freigeben" abrufbar.
  const now = Date.now();
  if (Number(cfg.lastMentionAt) && now - Number(cfg.lastMentionAt) < INITIATIVE_MENTION_COOLDOWN_MS) {
    return "";
  }
  await ref.set({ lastMentionAt: now }, { merge: true }).catch(() => {});
  return ` Übrigens: ${cfg.summary} Soll ich die Anruflisten freigeben? Sage einfach: Recall freigeben.`;
}

// ----------------------------------------------------------------------------
// Statusbericht
// ----------------------------------------------------------------------------

export async function recallStatusSpoken(clientId, { date } = {}) {
  const cases = await listCases(clientId, { assignee: "Lisa", limit: 100 }).catch(() => []);
  const day = s(date) || null;
  const lists = cases.filter((c) =>
    c.id.startsWith("gapfill_") && c.callList && c.callList.approvedBy &&
    (!day || c.callList.date === day)
  ).slice(0, 10);

  if (!lists.length) {
    return "Es laufen gerade keine Recall-Aktionen. Sage: Recall starten — dann schaue ich nach Lücken und Kandidaten.";
  }

  let booked = 0, declined = 0, noAnswer = 0, pending = 0, smsSent = 0, unclear = 0, complaints = 0;
  for (const c of lists) {
    for (const cand of c.callList.candidates || []) {
      const ct = cand.contact;
      if (!ct || ct.via === "none") continue;
      if (ct.via === "sms") { smsSent++; continue; }
      switch (ct.outcome) {
        case "booked": booked++; break;
        case "declined": declined++; break;
        case "voicemail":
        case "no_answer": noAnswer++; break;
        case "complaint": complaints++; break;
        case "unclear":
        case "accepted_booking_failed": unclear++; break;
        default: pending++; break;
      }
    }
  }

  const parts = [`Recall-Stand für ${lists.length} Liste${lists.length === 1 ? "" : "n"}:`];
  if (complaints) parts.push(`WICHTIG: ${complaints} Beschwerde${complaints === 1 ? "" : "n"} beziehungsweise Opt-out — bitte sofort im Monitor prüfen.`);
  if (booked) parts.push(`${booked} Termin${booked === 1 ? "" : "e"} fest gebucht.`);
  if (smsSent) parts.push(`${smsSent} SMS mit Terminangebot verschickt.`);
  if (declined) parts.push(`${declined} Absage${declined === 1 ? "" : "n"}.`);
  if (noAnswer) parts.push(`${noAnswer} nicht erreicht.`);
  if (unclear) parts.push(`${unclear} unklar — bitte im Monitor prüfen.`);
  if (pending) parts.push(`${pending} Anruf${pending === 1 ? "" : "e"} noch offen.`);
  if (parts.length === 1) parts.push("Noch keine Kontakte gestartet.");
  return parts.join(" ");
}
