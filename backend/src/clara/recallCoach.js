import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { loadBooking, ensureBerlinTz, resolveCalendar } from "./booking.js";
import { commitBooking } from "./agentBooking.js";
import { runGapFill, approveCallList } from "./gapFill.js";
import { lisaSendSms, lisaStartCall, smsConfigured, callConfigured } from "../lisa/outbound.js";
import { liveBookingConfigured } from "../lisa/agentTools.js";
import { listCases, addUpdate, setStatus } from "../brain/caseStore.js";
import { CASE_STATUS } from "../brain/cases.js";
import { resolveOutreach, composeRecallCallInstruction, composeRecallSms, recallKontrollFokus } from "./outreachTemplates.js";
import { createSlotClaim } from "./slotClaim.js";
import { MAX_CANDIDATES_PER_LIST } from "./gapFill.js";
import { recordContact, markConverted } from "./outreachStats.js";
import { currentTestRedirect, activeTenantRedirect } from "./testRedirect.js";
import { specialtyKeyForClient } from "./dokuPflicht.js";
import { callOperator, setPendingCallContext, clearPendingCallContext } from "./devices.js";
import { appendEvent } from "../brain/eventStore.js";
import { getOperator, emitCommand } from "./sessions.js";
import { listOperators } from "./operators.js";
import { todayBerlin } from "./daySchedule.js";
import { freiFormulieren } from "./freiSprech.js";
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

function buildSmsOffer({ cand, booking, date, timeLabel, specialtyKey, claimUrl }) {
  return composeRecallSms({
    practiceName: booking?.practiceName,
    practicePhone: booking?.practicePhone,
    patientName: cand?.name,
    date,
    timeLabel,
    visitMotiveName: cand?.visitMotiveName,
    outreach: resolveCandidateOutreach(cand || {}, specialtyKey),
    claimUrl: claimUrl || "",
  });
}

/** Aktive Test-Umleitung (Request-Kontext ODER Livetest-Fenster) -> Ziel. */
async function testTargetFor(clientId) {
  const ctx = currentTestRedirect();
  if (ctx?.target?.patientId || ctx?.target?.phone) return ctx.target;
  return await activeTenantRedirect(clientId);
}

/**
 * Zusage-Ticket fuer EINEN SMS-Kandidaten anlegen (Online-Zusage, Chef
 * 28.07.2026). Traegt alles, was Seite + Buchung + Bucket-Streichung brauchen.
 * Schlaegt die Ticket-Anlage fehl, geht die SMS ohne Link raus (kein Blocker).
 */
async function claimForCandidate(clientId, { c, cand, list, booking, timeLabel, testTarget }) {
  try {
    const o = resolveCandidateOutreach(cand || {}, "");
    return await createSlotClaim(clientId, {
      caseId: c.id,
      patientId: cand.patientId,
      patientName: cand.name,
      phone: cand.phone,
      visitMotiveId: cand.visitMotiveId,
      visitMotiveName: cand.visitMotiveName,
      topicLabel: o.topicLabel || cand.visitMotiveName || "",
      calendarId: list.calendarId,
      calendarName: list.calendarName,
      date: list.date,
      timeLabel,
      slotIso: ensureBerlinTz(`${list.date}T${timeLabel}:00`),
      practiceName: booking?.practiceName,
      practicePhone: booking?.practicePhone,
      source: cand.source,
      campaignId: cand.campaignId,
      recallAppointmentId: cand.recallAppointmentId,
      locationId: booking?.locationId,
      testTarget: testTarget?.patientId ? { patientId: testTarget.patientId, name: testTarget.name } : null,
    });
  } catch (e) {
    log.warn("recall.claim_create_failed", { clientId, caseId: c.id, error: String(e?.message || e) });
    return null;
  }
}

function buildCallInstruction({ cand, booking, date, timeLabel, calendarName, specialtyKey, liveBooking, chefHinweis }) {
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
    liveBooking: !!liveBooking,
    chefHinweis: chefHinweis || "",
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
  const slotIso = ensureBerlinTz(`${list.date}T${timeLabel}:00`);
  // W-OUTREACH-2: Sind Lisas Kalender-Werkzeuge verdrahtet, bucht sie LIVE im
  // Gespräch (kein Terminwunsch wird verneint). Ohne Werkzeuge gilt weiter der
  // vorsichtige Weg (nichts fest zusagen, Praxis meldet sich).
  const liveBooking = liveBookingConfigured();
  const candidates = Array.isArray(list.candidates) ? [...list.candidates] : [];
  // Livetest-Fenster/Testlauf einmal aufloesen: Zusage-Tickets buchen dann den
  // TESTPATIENTEN (nie den echten), die SMS/Anrufe selbst biegt lisaSendSms/
  // lisaStartCall ohnehin um.
  const testTarget = await testTargetFor(clientId).catch(() => null);
  let calls = 0;
  let smses = 0;
  let skipped = 0;
  // Kontakt-Deckel (Chef 28.07.2026): Die Liste traegt einen groesseren Puffer
  // (bis MAS_GAP_MAX_STORED), kontaktiert werden aber nur die obersten
  // MAX_CANDIDATES_PER_LIST aktiven Kandidaten — der Rest rueckt nur nach,
  // wenn der Chef vorher jemanden von der Liste wischt.
  let kontaktiert = candidates.filter((x) => x.contact?.taskId).length;

  // Testlauf-Staffelung (Befund 28.07.2026): Mit aktivem Testredirect gehen
  // ALLE Anrufe an DIESELBE Nummer (Chef-Handy) — 8 gleichzeitige Anrufe
  // dorthin schlagen bis auf den ersten fehl (ok:false). Im Testmodus wird
  // deshalb nur EIN Anruf gestartet; die restlichen Kandidaten bleiben
  // unkontaktiert und kaemen beim naechsten Lauf dran. SMS sind unkritisch
  // (mehrere ans selbe Handy funktionieren).
  let testCallStarted = false;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    if (cand.contact?.taskId) continue; // bereits kontaktiert (idempotent)
    if (cand.removed) continue;         // vom Chef von der Liste gewischt
    if (kontaktiert >= MAX_CANDIDATES_PER_LIST) break; // Puffer bleibt Reserve
    const channel = channelFor(cand);
    if (channel === "call" && testTarget?.phone && testCallStarted) {
      skipped++;
      continue; // Testlauf: nur ein Anruf aufs Chef-Handy
    }
    if (!channel || !cand.phone) {
      skipped++;
      candidates[i] = { ...cand, contact: { via: "none", reason: !cand.phone ? "no_phone" : "no_channel", at: Date.now() } };
      continue;
    }
    kontaktiert++;

    if (channel === "sms") {
      // Online-Zusage: Ticket anlegen, Link in die SMS — erste Zusage bucht.
      const claim = await claimForCandidate(clientId, { c, cand, list, booking, timeLabel, testTarget });
      const out = await lisaSendSms(clientId, {
        phone: cand.phone,
        message: buildSmsOffer({ cand, booking, date: list.date, timeLabel, specialtyKey, claimUrl: claim?.url }),
        recipientName: cand.name,
        by: by || "Recall-Coach",
      });
      candidates[i] = { ...cand, contact: { via: "sms", taskId: out.taskId || null, ok: out.ok !== false, at: Date.now(), claimToken: claim?.token || null } };
      if (out.ok !== false) {
        smses++;
        await recordContact(clientId, { patientId: cand.patientId, name: cand.name, phoneNorm: cand.phoneNorm, channel: "sms" }).catch(() => {});
      }
    } else {
      const out = await lisaStartCall(clientId, {
        phone: cand.phone,
        instruction: buildCallInstruction({
          cand, booking, date: list.date, timeLabel,
          calendarName: list.calendarName, specialtyKey, liveBooking,
          chefHinweis: list.chefHinweis,
        }),
        contactName: cand.name,
        by: by || "Recall-Coach",
        // Kalender-Kontext für Lisas Live-Buchung: NUR damit dürfen die
        // Webhook-Tools für genau diesen Anruf Termine anbieten und buchen.
        // source/campaignId/locationId: damit die Buchung den Patienten aus
        // dem Recall-Bucket streichen kann (markConverted).
        bookingContext: liveBooking ? {
          kind: "gapfill",
          caseId: c.id,
          patientId: cand.patientId,
          patientName: cand.name,
          visitMotiveId: cand.visitMotiveId,
          visitMotiveName: cand.visitMotiveName || null,
          calendarId: list.calendarId,
          calendarName: list.calendarName || null,
          slotIso,
          source: cand.source || null,
          campaignId: cand.campaignId || null,
          locationId: booking?.locationId || null,
        } : null,
      });
      candidates[i] = { ...cand, contact: { via: "call", taskId: out.taskId || null, ok: out.ok !== false, at: Date.now() } };
      if (out.ok !== false) {
        calls++;
        if (testTarget?.phone) testCallStarted = true;
        await recordContact(clientId, { patientId: cand.patientId, name: cand.name, phoneNorm: cand.phoneNorm, channel: "call" }).catch(() => {});
      }
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

// ---------------------------------------------------------------------------
// Ansage-Besprechung VOR der Freigabe (Chef 28.07.2026: "es waere gut wenn
// clara zur absicherung den prompt mit mir bespricht … und ich dann eine
// chance habe das umzustellen wenn ich fehler bemerke und clara die korrektur
// aufnimmt und bestaetigt"). Zwei Schritte:
//   recallInstructionPreview  — sagt gruppiert an, WAS Lisa den Patienten
//                               sagen wird (Kern-Botschaft je Fachbereich).
//   setRecallChefHinweis      — nimmt eine diktierte Korrektur auf; sie wird
//                               als Vorrang-Block in JEDE Anruf-Instruktion
//                               der Liste eingewebt (composeRecall…).
// ---------------------------------------------------------------------------

/** Kern-Botschaft eines Kandidaten (fuers Chef-Ohr, gruppierbar). */
function candKernbotschaft(cand, specialtyKey) {
  const source = cand?.source || (cand?.campaignId ? "campaign" : "recall");
  const fokus = recallKontrollFokus({
    visitMotiveName: cand?.visitMotiveName,
    overdueDays: cand?.overdueDays,
    source,
  });
  if (fokus) return { key: fokus.id, gruppe: fokus.gruppe || fokus.topic, text: fokus.purpose };
  const o = resolveCandidateOutreach(cand || {}, specialtyKey);
  const topic = o.topicLabel || s(cand?.visitMotiveName) || "ein fälliger Termin";
  const text = o.texts.purposeShort
    ? `„${topic}“ ist laut Erinnerungssystem wieder fällig. ${o.texts.purposeShort}`
    : `„${topic}“ ist laut Erinnerungssystem wieder fällig.`;
  return { key: `katalog:${topic}`, gruppe: topic, text };
}

/** Die neueste wartende Liste aufloesen (oder gezielt per caseId). */
async function resolvePendingList(clientId, caseId) {
  if (s(caseId)) {
    const snap = await masCollection(clientId, "mas_cases").doc(s(caseId)).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }
  const pending = await pendingGapCases(clientId, {});
  if (!pending.length) return null;
  // Juengste zuerst (updatedAt kommt aus listCases absteigend — Reihenfolge
  // beibehalten): die zuletzt besprochene Liste ist die gemeinte.
  return pending[0];
}

/**
 * "Wie instruierst du Lisa?" — gesprochene Vorschau der Anruf-Ansage fuer die
 * wartende Liste, gruppiert nach Kern-Botschaft (gemischte Listen haben je
 * Fachbereich eine eigene Ansprache). Ehrlich: gesprochen wird, was
 * composeRecallCallInstruction fuer genau diese Kandidaten baut.
 */
export async function recallInstructionPreview(clientId, { caseId } = {}) {
  const c = await resolvePendingList(clientId, caseId);
  if (!c || !c.callList) {
    return { ok: false, reason: "no_pending", message: "Gerade wartet keine Anrufliste auf Freigabe — die Ansage bespreche ich am besten, bevor Lisa loslegt. Sage zuerst: Recall starten." };
  }
  const list = c.callList;
  const specialtyKey = await specialtyKeyForClient(clientId).catch(() => "");
  const liveBooking = liveBookingConfigured();
  const timeLabel = minutesToHHMM(list.slot?.startMin);

  const aktive = (Array.isArray(list.candidates) ? list.candidates : [])
    .filter((x) => !x.removed && !x.contact?.taskId)
    .slice(0, MAX_CANDIDATES_PER_LIST);
  if (!aktive.length) {
    return { ok: false, reason: "no_candidates", message: "Auf der wartenden Liste ist kein aktiver Kandidat mehr — da gibt es nichts zu besprechen." };
  }

  // Gruppieren nach Kern-Botschaft (Zahnersatz, Fuellungen, Implantate ...).
  const gruppen = new Map();
  for (const cand of aktive) {
    const k = candKernbotschaft(cand, specialtyKey);
    const g = gruppen.get(k.key) || { gruppe: k.gruppe, text: k.text, anzahl: 0 };
    g.anzahl++;
    gruppen.set(k.key, g);
  }

  const teile = [];
  teile.push(`So instruiere ich Lisa für die Liste ${dateDe(list.date)} um ${timeLabel} Uhr: Sie ruft freundlich im Namen der Praxis an.`);
  const gl = [...gruppen.values()];
  const maxGruppen = 3;
  for (const g of gl.slice(0, maxGruppen)) {
    teile.push(gl.length === 1
      ? `Die Kern-Botschaft: ${g.text}`
      : `Bei ${g.gruppe} (${g.anzahl === 1 ? "ein Patient" : `${g.anzahl} Patienten`}): ${g.text}`);
  }
  if (gl.length > maxGruppen) {
    teile.push(`Und nach demselben Kontroll-Muster für ${gl.length - maxGruppen} weitere Gruppen.`);
  }
  teile.push(liveBooking
    ? `Dann bietet sie den freien Termin am ${dateDe(list.date)} um ${timeLabel} Uhr an und bucht bei Zusage direkt im Kalender.`
    : `Dann bietet sie den freien Termin am ${dateDe(list.date)} um ${timeLabel} Uhr an; die Praxis bestätigt anschließend.`);
  teile.push("Dabei gilt immer: keine Diagnosen, keine Preise, ein Nein akzeptiert sie freundlich.");
  if (s(list.chefHinweis)) {
    teile.push(`Deine Vorgabe ist bereits hinterlegt: „${s(list.chefHinweis)}“.`);
  }
  teile.push("Soll Lisa etwas anders sagen? Sag es mir einfach — oder gib den Recall frei.");

  return { ok: true, caseId: c.id, message: teile.join(" "), chefHinweis: s(list.chefHinweis) || null };
}

/**
 * Diktierte Chef-Korrektur fuer Lisas Ansprache aufnehmen. Haengt an einen
 * evtl. vorhandenen Hinweis an (mit "; "), kappt auf 300 Zeichen je Diktat
 * und bestaetigt woertlich, was Lisa zusaetzlich gesagt bekommt.
 */
export async function setRecallChefHinweis(clientId, { caseId, hinweis, by } = {}) {
  const neu = s(hinweis).slice(0, 300);
  if (!neu) {
    return { ok: false, reason: "no_hint", message: "Was genau soll Lisa anders sagen? Sag mir die Vorgabe in einem Satz." };
  }
  const c = await resolvePendingList(clientId, caseId);
  if (!c || !c.callList) {
    return { ok: false, reason: "no_pending", message: "Gerade wartet keine Anrufliste auf Freigabe — die Vorgabe kann ich erst an einer offenen Liste hinterlegen." };
  }
  const alt = s(c.callList.chefHinweis);
  const kombi = (alt ? `${alt}; ${neu}` : neu).slice(0, 600);
  await masCollection(clientId, "mas_cases").doc(c.id).update({
    "callList.chefHinweis": kombi,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await addUpdate(clientId, c.id, {
    by: s(by) || "Chef (Telefon)",
    kind: "note",
    text: `Chef-Vorgabe für Lisas Ansprache aufgenommen: „${neu}“`,
  }).catch(() => {});
  return {
    ok: true,
    caseId: c.id,
    chefHinweis: kombi,
    message: `Übernommen — Lisa bekommt für jedes Gespräch die Vorgabe: „${neu}“. Sie hat Vorrang vor dem Standard-Text. Noch etwas anpassen, oder soll ich den Recall freigeben?`,
  };
}

export async function approveAndExecute(clientId, { date, caseId, by } = {}) {
  let targets;
  if (caseId) {
    targets = [{ id: s(caseId) }];
  } else {
    targets = await pendingGapCases(clientId, { date: s(date) || null });
  }
  if (!targets.length) {
    // Vorfall 28.07.2026: Die Liste war schon um 13:07 freigegeben (in_progress);
    // um 15:24 lief die Freigabe ins Leere und Clara behauptete trotzdem Vollzug.
    // Ehrlich sagen, WO die Liste steht, statt in die Sackgasse zu schicken.
    try {
      const laufend = (await listCases(clientId, { activeOnly: true, assignee: "Lisa", limit: 100 }))
        .filter((c) => c.id.startsWith("gapfill_") && c.callList && c.status !== CASE_STATUS.WAITING_APPROVAL);
      if (laufend.length) {
        const l = laufend[0].callList;
        return { ok: true, approved: 0, alreadyRunning: laufend.length, message: `Die Anrufliste ${s(l.date)} ${s(l.slot?.label)} ist bereits freigegeben — Lisa arbeitet sie ab. Für eine neue Runde sagen Sie: Recall starten mit Thema, dann baue ich die Liste frisch.` };
      }
    } catch { /* Ehrlichkeit ist Zugabe — Standardantwort unten bleibt */ }
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
// W-OUTREACH-2: "möchte einen ANDEREN Termin" ist KEINE Absage — der Patient
// will ja kommen. Normalfall: Lisa bucht die Alternative live im Gespräch
// (book_slot). Landet der Fall trotzdem hier (Werkzeuge nicht verfügbar),
// bekommt er eine EIGENE, dringliche Nachverfolgung statt "kein Interesse".
const WANTS_OTHER_RE = /(ander(er|en|e)?r?\s+(termin|tag|uhrzeit|zeit)|lieber\s+(am|um|n[äa]chste)|verschieben|zu\s+der\s+zeit\s+(kann|schaffe)\s+ich\s+nicht|da\s+kann\s+ich\s+(leider\s+)?nicht|w[äa]re\s+.{0,20}(besser|lieber))/i;
// Beschwerde-/Opt-out-Wächter (W-OUTREACH): Diese Formulierungen bedeuten
// "hier ist etwas schiefgelaufen" — Reputation geht vor Terminfüllung.
const COMPLAINT_RE = /(nicht mehr anrufen|keine anrufe mehr|nie wieder anrufen|in ruhe lassen|h[öo]ren sie auf|bel[äa]stig|unversch[äa]mt|frechheit|beschwerde|beschwer(e|t)|anwalt|abmahnung|datenschutz|werbeanruf|dsgvo)/i;

function patientSaid(transcriptText) {
  return String(transcriptText || "")
    .split("\n")
    .filter((l) => /^(user|caller|patient)\s*:/i.test(l))
    .join(" ");
}

async function bookAcceptedCandidate(clientId, c, list, cand, { testTarget = null } = {}) {
  const slotIso = ensureBerlinTz(`${list.date}T${minutesToHHMM(list.slot?.startMin)}:00`);
  // Testlauf: Der Anruf ging an den Testpatienten — gebucht wird dann auch der
  // Testpatient, nie der echte Patient (der von dem Test nichts weiss).
  const bookPatientId = testTarget?.patientId || cand.patientId;
  const bookPatientName = testTarget?.patientId ? (testTarget.name || "Testpatient") : cand.name;
  const r = await commitBooking(clientId, {
    patientId: bookPatientId,
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
      patient: { firstName: "", lastName: bookPatientName },
      visitMotiveName: cand.visitMotiveName || null,
    }).catch(() => {});
    const testHinweis = testTarget?.patientId
      ? ` (TESTLAUF: gebucht wurde der Testpatient ${bookPatientName}, nicht ${cand.name})`
      : "";
    await addUpdate(clientId, c.id, {
      by: "Recall-Coach",
      kind: "note",
      text: `GEBUCHT: ${cand.name} hat zugesagt — Termin am ${list.date} ${minutesToHHMM(list.slot?.startMin)} Uhr bei ${list.calendarName || ""} ist fest eingetragen.${testHinweis}`,
    });
    // Zaehler + Bucket-Streichung NUR im Echtbetrieb: im Testlauf hat der
    // echte Patient weder zugesagt noch gebucht.
    if (!testTarget?.patientId) {
      const booking = await loadBooking(clientId).catch(() => null);
      await markConverted(clientId, {
        patientId: cand.patientId, name: cand.name, via: "lisa_anruf",
        source: cand.source, campaignId: cand.campaignId, locationId: booking?.locationId,
      }).catch(() => {});
    }
    return "booked";
  }
  await addUpdate(clientId, c.id, {
    by: "Recall-Coach",
    kind: "note",
    text: `ACHTUNG: ${cand.name} hat zugesagt, aber die automatische Buchung schlug fehl (${r.error || "needs_phone"}). Bitte SOFORT zurückrufen und den Termin ${list.date} ${minutesToHHMM(list.slot?.startMin)} Uhr eintragen ODER direkt buchbare Alternativen anbieten — der Patient wartet auf seine Bestätigung.`,
  });
  return "accepted_booking_failed";
}

/**
 * Periodischer Sweep über laufende Recall-Listen: ordnet beendete Lisa-Calls
 * den Kandidaten zu, übernimmt Live-Buchungen aus dem Gespräch (book_slot),
 * bucht Zusagen ohne Live-Buchung direkt, protokolliert Absagen und schickt
 * bei Nichterreichen die SMS als Fallback (sofern Consent vorliegt).
 *
 * WICHTIG (W-OUTREACH-2): Auch RESOLVED-Fälle werden nachgezogen, solange
 * noch Anrufe ohne Ergebnis dranhängen. Vorher galt: erste Buchung ->
 * RESOLVED -> die restlichen (noch laufenden) Gespräche wurden NIE mehr
 * ausgewertet — eine mündliche Zusage konnte sang- und klanglos verpuffen.
 */
export async function sweepRecallOutcomes(clientId) {
  const cases = await listCases(clientId, { assignee: "Lisa", limit: 100 }).catch(() => []);
  const hasOpenCalls = (c) => (c.callList?.candidates || []).some(
    (x) => x.contact?.taskId && x.contact.via === "call" && !x.contact.outcome
  );
  const running = cases.filter((c) =>
    c.id.startsWith("gapfill_") && c.callList?.approvedBy &&
    (c.status === CASE_STATUS.IN_PROGRESS || hasOpenCalls(c))
  );
  let processed = 0;

  for (const c of running) {
    const list = c.callList;
    const candidates = [...(list.candidates || [])];
    const booking = await loadBooking(clientId).catch(() => null);
    const gapSlotKey = ensureBerlinTz(`${list.date}T${minutesToHHMM(list.slot?.startMin)}:00`).slice(0, 16);
    let changed = false;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const contact = cand.contact;
      if (!contact?.taskId || contact.via !== "call" || contact.outcome) continue;

      const taskSnap = await tasksCol(clientId).doc(contact.taskId).get().catch(() => null);
      const task = taskSnap?.exists ? taskSnap.data() : null;
      if (!task || task.status === "calling") continue; // läuft noch

      // Live-Buchung aus dem Gespräch (book_slot) ist die verlässlichste
      // Quelle — sie schlägt jede Transkript-Deutung. Beschwerden werden
      // trotzdem gemeldet (Reputation), der Termin bleibt aber gebucht.
      if (task.bookedSlotIso) {
        const saidLive = patientSaid(task.transcriptText);
        if (COMPLAINT_RE.test(saidLive)) {
          await addUpdate(clientId, c.id, {
            by: "Recall-Coach",
            kind: "note",
            text: `ACHTUNG: ${cand.name} hat im Gespräch gebucht, aber es gab auch Beschwerde-/Opt-out-Signale — bitte Transkript prüfen (Lisa-Task ${contact.taskId}).`,
          });
        }
        candidates[i] = { ...cand, contact: { ...contact, outcome: "booked", bookedSlotIso: task.bookedSlotIso } };
        changed = true;
        processed++;
        continue;
      }

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
        else if (WANTS_OTHER_RE.test(said) && !ACCEPT_RE.test(said)) {
          // Terminwunsch, den Lisa im Gespräch nicht buchen konnte (Werkzeuge
          // nicht verfügbar/fehlgeschlagen). Vorgabe Chef: KEIN "kein
          // Interesse", sondern dringliche Nachverfolgung mit Vorschlägen.
          outcome = "wants_other_time";
          await addUpdate(clientId, c.id, {
            by: "Recall-Coach",
            kind: "note",
            text: `WICHTIG: ${cand.name} MÖCHTE einen Termin, nur zu einer anderen Zeit — im Gespräch konnte nicht direkt gebucht werden. Bitte HEUTE mit konkreten Terminvorschlägen zurückrufen (Transkript: Lisa-Task ${contact.taskId}).`,
          });
          await appendEvent(clientId, {
            channel: "lisa_call",
            direction: "outbound",
            type: "note",
            counterparty: { kind: "patient", name: cand.name, ref: cand.phone || null },
            subject: { name: cand.name },
            summary: `Recall-Anruf bei ${cand.name}: möchte einen Termin zu ANDERER Zeit — bitte kurzfristig mit konkreten Vorschlägen zurückrufen.`,
            signals: { needsHuman: true },
            payloadRef: { kind: "lisa_task", id: contact.taskId },
            extractor: "recall@wants-other-time",
            tags: ["recall", "wants_other_time"],
          }).catch(() => {});
        }
        else if (DECLINE_RE.test(said)) outcome = "declined";
        else if (ACCEPT_RE.test(said)) outcome = await bookAcceptedCandidate(clientId, c, list, cand, { testTarget: task.testRedirect || null });
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
        // NUR solange der Slot noch offen ist: Ist die Lücke inzwischen gefüllt
        // (Buchung im Gespräch oder per Sweep), wäre die SMS ein Angebot auf
        // einen vergebenen Termin — dann nur das Ergebnis protokollieren.
        const gapSlotBooked = c.status === CASE_STATUS.RESOLVED || candidates.some(
          (x) => x.contact?.outcome === "booked" &&
            (!x.contact.bookedSlotIso || String(x.contact.bookedSlotIso).slice(0, 16) === gapSlotKey)
        );
        if (!gapSlotBooked) {
          const specialtyKey = await specialtyKeyForClient(clientId).catch(() => "");
          const timeLabel = minutesToHHMM(list.slot?.startMin);
          // Auch die Fallback-SMS bekommt das Online-Zusage-Ticket.
          const testTarget = task.testRedirect || await testTargetFor(clientId).catch(() => null);
          const claim = await claimForCandidate(clientId, { c, cand, list, booking, timeLabel, testTarget });
          const out = await lisaSendSms(clientId, {
            phone: cand.phone,
            message: buildSmsOffer({ cand, booking, date: list.date, timeLabel, specialtyKey, claimUrl: claim?.url }),
            recipientName: cand.name,
            by: "Recall-Coach",
          });
          candidates[i] = { ...cand, contact: { ...contact, outcome, fallbackSmsTaskId: out.taskId || null, claimToken: claim?.token || null } };
          if (out.ok !== false) {
            await recordContact(clientId, { patientId: cand.patientId, name: cand.name, phoneNorm: cand.phoneNorm, channel: "sms" }).catch(() => {});
          }
          changed = true;
          processed++;
          continue;
        }
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
      // Liste abschließen, sobald die LÜCKE gebucht ist (Live-Buchungen auf
      // Alternativtermine zählen als Erfolg, füllen aber nicht diesen Slot)
      // oder alle Kontaktversuche ein Ergebnis haben.
      const gapBooked = candidates.some(
        (x) => x.contact?.outcome === "booked" &&
          (!x.contact.bookedSlotIso || String(x.contact.bookedSlotIso).slice(0, 16) === gapSlotKey)
      );
      const altBooked = candidates.filter(
        (x) => x.contact?.outcome === "booked" &&
          x.contact.bookedSlotIso && String(x.contact.bookedSlotIso).slice(0, 16) !== gapSlotKey
      ).length;
      const allDone = candidates.every((x) => !x.contact?.taskId || x.contact?.outcome || x.contact?.via !== "call");
      if (gapBooked && c.status !== CASE_STATUS.RESOLVED) {
        await setStatus(clientId, c.id, CASE_STATUS.RESOLVED, {
          by: "Recall-Coach",
          note: `Lücke gefüllt — Termin gebucht.${altBooked ? ` Zusätzlich ${altBooked} Alternativtermin${altBooked === 1 ? "" : "e"} gebucht.` : ""}`,
        });
      } else if (allDone && c.status !== CASE_STATUS.RESOLVED) {
        await addUpdate(clientId, c.id, {
          by: "Recall-Coach",
          kind: "note",
          text: altBooked
            ? `Alle Kontaktversuche abgeschlossen — die Lücke selbst blieb offen, aber ${altBooked} Alternativtermin${altBooked === 1 ? " wurde" : "e wurden"} gebucht.`
            : "Alle Kontaktversuche abgeschlossen — kein Termin zustande gekommen. Liste bleibt zur Nachverfolgung offen.",
        });
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
  // Nur die Luecken des gekoppelten Behandlers zaehlen — ist ein Operator
  // identifiziert, gilt sein Kalender. Ohne Operator bleibt es praxisweit
  // (kein Regress). Vorfall 17.07.2026: praxisweiter Scan meldete zu viele
  // freie Luecken (leere Kollegen-Kalender).
  let scopeCalId = null;
  try {
    const scanOp = await getOperator(clientId).catch(() => null);
    const scanOpName = String(scanOp?.doctorName || scanOp?.name || "").trim();
    if (scanOpName) {
      const scanBooking = await loadBooking(clientId).catch(() => null);
      const scanCal = scanBooking ? resolveCalendar(scanBooking, scanOpName) : null;
      if (scanCal) scopeCalId = scanCal.id;
    }
  } catch { /* Operator-Lookup darf den Scan nie blockieren */ }
  const run = await runGapFill(clientId, { date, horizonDays: 1, calendarId: scopeCalId });
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
      const reason = `${summary} Verbinden Sie sich, wenn ich versuchen soll, die Lücken zu schließen und Recall-Patienten anrufen zu lassen.`;
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
          spoken: `Ich habe Sie angerufen: ${summary} Soll ich versuchen, die Lücken zu schließen und Recall-Patienten anrufen zu lassen?`,
          instruction:
            `KONTEXT: Du (Clara) hast den Chef soeben aktiv per Push angerufen. Anlass: ${summary} ` +
            `Du hast gefragt, ob du versuchen sollst, die Lücken zu schließen und Recall-Patienten anrufen zu lassen. ` +
            `Stimmt der Chef zu ('ja', 'ja bitte', 'ok', 'mach das', 'gib frei', 'leg los'), ` +
            `rufe SOFORT das Tool approve_recall mit date=${date} auf — auch bei einem einzelnen 'Ja'. ` +
            `Lehnt er ab ('nein', 'nee', 'heute nicht', 'nicht jetzt', 'kein Recall'), ` +
            `rufe SOFORT recall_snooze auf — auch bei einem einzelnen 'Nein'. Nicht nachfragen, nicht 'nicht verstanden' sagen. ` +
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
  return { ok: true, message: "Alles klar, ich halte mich mit dem Recall zurück. Sagen Sie einfach Bescheid, wenn Sie ihn doch starten wollen." };
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
  return ` Übrigens: ${cfg.summary} Soll ich versuchen, die Lücken zu schließen und Recall-Patienten anrufen zu lassen? Sagen Sie einfach ja, dann lege ich los.`;
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

  let booked = 0, declined = 0, noAnswer = 0, pending = 0, smsSent = 0, unclear = 0, complaints = 0, wantsOther = 0, webBooked = 0;
  for (const c of lists) {
    for (const cand of c.callList.candidates || []) {
      const ct = cand.contact;
      if (!ct || ct.via === "none") continue;
      if (ct.via === "sms") {
        // Online-Zusage (28.07.2026): SMS-Kandidaten koennen ueber den Link
        // zu- oder absagen — dann zaehlen sie als Buchung/Absage, nicht mehr
        // nur als "SMS verschickt".
        if (ct.outcome === "booked") { booked++; webBooked++; }
        else if (ct.outcome === "declined") declined++;
        else smsSent++;
        continue;
      }
      switch (ct.outcome) {
        case "booked": booked++; if (ct.bookedVia === "sms_web") webBooked++; break;
        case "declined": declined++; break;
        case "voicemail":
        case "no_answer": noAnswer++; break;
        case "complaint": complaints++; break;
        case "wants_other_time": wantsOther++; break;
        case "unclear":
        case "accepted_booking_failed": unclear++; break;
        default: pending++; break;
      }
    }
  }

  const parts = [`Recall-Stand für ${lists.length} Liste${lists.length === 1 ? "" : "n"}:`];
  if (complaints) parts.push(`WICHTIG: ${complaints} Beschwerde${complaints === 1 ? "" : "n"} beziehungsweise Opt-out — bitte sofort im Monitor prüfen.`);
  if (booked) parts.push(`${booked} Termin${booked === 1 ? "" : "e"} fest gebucht${webBooked ? ` (davon ${webBooked} über den SMS-Link)` : ""}.`);
  if (wantsOther) parts.push(`${wantsOther} Patient${wantsOther === 1 ? " wünscht" : "en wünschen"} eine andere Zeit — bitte heute mit Vorschlägen zurückrufen.`);
  if (smsSent) parts.push(`${smsSent} SMS mit Terminangebot verschickt.`);
  if (declined) parts.push(`${declined} Absage${declined === 1 ? "" : "n"}.`);
  if (noAnswer) parts.push(`${noAnswer} nicht erreicht.`);
  if (unclear) parts.push(`${unclear} unklar — bitte im Monitor prüfen.`);
  if (pending) parts.push(`${pending} Anruf${pending === 1 ? "" : "e"} noch offen.`);
  if (parts.length === 1) parts.push("Noch keine Kontakte gestartet.");
  const deterministisch = parts.join(" ");
  // W-UMBAU-2 Werkzeug 5 (28.07.2026): Der Zaehl-Bericht wird lebendig erzaehlt
  // (FreiSprech: Fakten-Guard sichert alle Zahlen). Pflichtwoerter: bei
  // Beschwerden/Unklarem MUESSEN "Beschwerde" bzw. der Verweis auf den
  // "Monitor" woertlich ueberleben — das ist die Handlungsaufforderung an den
  // Chef. Der LEERE Fall oben bleibt bewusst unangetastet: "Sage: Recall
  // starten" ist ein Sprachbefehl wie die Abhak-Anleitung der Wiedervorlage.
  try {
    const pflicht = [];
    if (complaints) pflicht.push("Beschwerde", "Monitor");
    if (unclear) pflicht.push("Monitor");
    const frei = await freiFormulieren(deterministisch, {
      kontext: "Zwischenstand einer laufenden Recall-Aktion (gebucht / SMS / Absagen / nicht erreicht / offen)",
      pflicht,
    });
    return frei.text;
  } catch {
    return deterministisch;
  }
}
