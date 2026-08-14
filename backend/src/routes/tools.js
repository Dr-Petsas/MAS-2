// Clara-Sprach-Tools (/tools/*): Briefings, Doku, Kontakte, Buchung, Delegation.
// Mechanischer W1.2-Split aus server.js (04.07.2026): Pfade und Handler
// byte-identisch uebernommen, nur app. -> router. Kein Verhalten geaendert.
import express from "express";
import { completeTask } from "../tools/createTask.js";
import { assertAppEnabled } from "../entitlements.js";
import { findSlots, bookAppointment, loadBooking, resolveCalendar, checkInviteSlot, ensureBerlinTz } from "../clara/booking.js";
import { findDirectoryContact, hasColleagueTitle, spokenDirectoryEntry } from "../clara/directory.js";
import { getDayAppointments, buildSpokenDayList, buildSpokenMemoryHints, buildSpokenPatientPrep, todayBerlin, relativeDayLabel, spokenOwnAbsence, getPatientAppointments, buildSpokenPatientAppointments, buildSpokenNextFreeSlot, buildSpokenTreatmentHistory, findSameTimeCompanions, buildSpokenCompanionQuestion, dayOfMs } from "../clara/daySchedule.js";
import { searchContacts } from "../brain/entityProfile.js";
import { getPatientAnamnese, buildSpokenAnamnese } from "../clara/anamnese.js";
import { getPatientDocuments, buildSpokenDocuments } from "../clara/patientDocuments.js";
import { polishForChannel } from "../clara/dictation.js";
import { buildSpokenDayOverview } from "../clara/dayOverview.js";
import { resolveDateRange } from "../clara/dateRange.js";
import { buildSpokenRangeOverview, buildSpokenRangeList } from "../clara/rangeOverview.js";
import { buildNextPatientsBriefing } from "../clara/nextPatientsBriefing.js";
import { loadWeightedVisitBriefing } from "../shared/lenaBridge.js";
import { saveTreatmentDictation, strikeTreatmentDictation, readPatientTreatmentDocs, buildSpokenPatientDocs, resolveAppointmentInfo, readAppointmentSegments, combineActiveSegments } from "../clara/treatmentDoc.js";
import { strukturiereKarteikarte } from "../clara/dokuNote.js";
import { trenneMemo, appendAbrechnungsHinweis, getAbrechnungsMemo, pruefeAbrechnung, sophieMitSlotfill } from "../clara/dokuAbrechnung.js";
import { findePatientenLuecken, sprichPatientenLuecken, findePraxisLuecken, sprichPraxisLuecken } from "../clara/dokuWaechter.js";
import { pruefeUndKorrigiereBesuchsgrund, overwatchSweep, sprichSweep } from "../clara/motiveOverwatch.js";
import { freiFormulieren } from "../clara/freiSprech.js";
import { karteDoku, karteLuecken, karteSophie, karteTerminliste, karteZeitraum, karteKontakt, karteLisaErgebnis, karteLisaLive, karteLisaSms, karteWiedervorlage, karteRecallKandidaten, karteDokumente } from "../clara/karten.js";
import { buildWiedervorlage, spokenWiedervorlage, resolveWiedervorlage, formatEuro, ABHAK_ANLEITUNG } from "../brain/wiedervorlage.js";
import { specialtyKeyForClient } from "../clara/dokuPflicht.js";
import { effektiveAnforderungen, applyAnpassung } from "../clara/dokuLernen.js";
import { pruefeDoku, baueRueckfragenSatz } from "../clara/dokuCheck.js";
import { runGapFill, buildSpokenGapBriefing, buildSpokenGapCandidates, gapCandidateCardData, listRecallBuckets, listRecallFachbereiche, spokenFachbereichFrage, resolveBucketKey, removeCandidateByName, spokenGapAnswer, spokenAnrede, discardWaitingLists } from "../clara/gapFill.js";
import { composeInviteInstruction, inviteReadback, dateDe, normTime } from "../clara/gapInvite.js";
import { outreachForClient, buildAutoInviteMessage } from "../clara/outreachTemplates.js";
import { recordContact } from "../clara/outreachStats.js";
import { spokenMorningBriefing } from "../clara/morningBriefing.js";
import { spokenEveningBriefing } from "../clara/eveningBriefing.js";
import { buildAsapQueue, spokenAsapQueue } from "../clara/asapQueue.js";
import { snoozeProaktiv } from "../clara/interruptPolicy.js";
import { approveAndExecute, snoozeInitiative, initiativeSuffix, recallStatusSpoken, recallInstructionPreview, setRecallChefHinweis } from "../clara/recallCoach.js";
import { planAbsence, approveAbsence, absenceStatusSpoken } from "../clara/absencePlanner.js";
import { lookupCaller, normalizePhone } from "../clara/callerLookup.js";
import { spokenCallLog } from "../clara/callLog.js";
import { summarizeForSpeech } from "../clara/summarize.js";
import { dayInboundComms, buildSpokenComms, cardInboundComms } from "../clara/commsDigest.js";
import { spokenRatings } from "../clara/ratings.js";
import { notizInNaechstenTermin, terminLabel } from "../clara/terminNotiz.js";
import { searchPatient, resolveBooking, commitBooking, defaultControlMotive } from "../clara/agentBooking.js";
import { spokenLooksLikeNewPerson } from "../clara/patientCatalog.js";
import { emitCommand, setPatientCandidates, getSelectedPatient, getPatientCandidates, clearSelectedPatient, setActiveCase, getActiveCase, clearActiveCase, getOperator, getLastContext, getPendingRecording, setPendingRecording, clearPendingRecording, getActiveRecording, setActiveRecording, clearActiveRecording } from "../clara/sessions.js";
import { pickCurrentAppointment, spokenApptWhen, startRecordingSession, stopRecordingSession, matchTodayAppointmentsByName, resolveChairAppointment } from "../clara/treatmentRecording.js";
import { readTreatmentDictation, findInTreatment, readTreatmentLabels, addTreatmentLabel, findBackdatedAppointment } from "../shared/lenaBridge.js";
import { disambiguationQuestion, ordinalPick, narrowByPhoneFragment, narrowByExactName, narrowByNearName, isOrdinalChoice, collapseSamePerson } from "../clara/patientDisambig.js";
import { listPatientNamesForStt } from "../clara/sttPatientNames.js";
import { koelnerPhonetikToken } from "../clara/phonetics.js";
import { notifyOperator } from "../clara/devices.js";
import { buildAppointmentProof, publishProof } from "../clara/proofCard.js";
import { lisaSendSms, lisaStartCall, findLisaCallResult, ensureDialogSummary, phoneFromRecord, displayNameOf } from "../lisa/outbound.js";
import { liveBookingConfigured } from "../lisa/agentTools.js";
import { appendEvent, queryRecent } from "../brain/eventStore.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { createCase, getCase, listCases, listActiveCasesByPatientIds, addUpdate, setStatus, linkEventToCase, assignCase, getCaseContext } from "../brain/caseStore.js";
import { buildCaseBriefing, buildSpokenCaseBriefing } from "../brain/caseBriefing.js";
import { recordCommunication } from "../brain/record.js";
import { upsertSharedContact } from "../brain/addressBook.js";
import { listAccounts } from "../mail/accounts.js";
import { sendMail } from "../mail/mailbox.js";
import { listMessages, getMessage, listContacts } from "../mail/store.js";
import { prepareCaseDraft } from "../mail/nadineAuto.js";
import { strongLlm } from "../mail/llm.js";
import { buildMailBriefing } from "../mail/briefing.js";
import admin from "../firebase.js";
import { log } from "../log.js";
import { PUBLIC_BASE_URL, actorName, buildSpokenPatientTimeline, clockHHMM, operatorMailAccountIds, resolveClientId, spokenClockBerlin } from "./_shared.js";

const router = express.Router();


// ONE task/ticket system: a delegation "task" is now a Case, so everything the
// team must act on lives in ONE place (Clara monitor + Nadine Aufträge + the
// briefing) instead of a parallel mas_tasks store that nothing surfaced. The
// task shape is preserved in the response for backward compatibility.
function caseAsTask(c) {
  return {
    id: c.id,
    text: c.title || "",
    status: c.status === "resolved" || c.status === "closed" ? "done" : "open",
    caseStatus: c.status,
    assignee: c.assignee || null,
    patientName: c.subject?.name || "",
    source: c.createdBy || "clara",
    createdAt: c.createdAt?.toMillis?.() ?? c.createdAt ?? null,
  };
}


router.post("/tools/create-task", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const body = req.body || {};
    const text = String(body.text || body.task || body.title || "").trim();
    const who = String(body.assignee || "").trim() || null;
    const by = String(body.by || body.source || "Clara").trim();
    const subjectName = String(body.patientName || body.name || "").trim();

    let subject = { name: subjectName, matchStatus: "unmatched", matchMethod: null };
    if (subjectName) {
      const s = await resolvePatientSubject(clientId, subjectName).catch(() => null);
      if (s?.patientId) subject = { patientId: s.patientId, name: s.name || subjectName, matchStatus: "matched", matchMethod: s.matchMethod || "name" };
    }

    const c = await createCase(clientId, {
      subject,
      topic: "other",
      title: text ? text.slice(0, 90) : (subjectName ? `Aufgabe – ${subjectName}` : "Aufgabe"),
      createdBy: by,
      assignee: who,
      status: "open",
      updates: text ? [{ by, kind: "note", text }] : [],
    });
    res.status(201).json({ ok: true, clientId, task: caseAsTask(c), caseId: c.id });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.get("/tools/open-tasks", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const cases = await listCases(clientId, { activeOnly: true, limit: 200 });
    const tasks = cases.map(caseAsTask);
    res.json({ ok: true, clientId, count: tasks.length, tasks });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Mark a delegation task done. Backed by cases; falls back to the legacy
// mas_tasks store for any task id created before the unification.
router.post("/tools/tasks/:id/done", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const by = req.body?.by || "Team";
    const out = await setStatus(clientId, req.params.id, "resolved", { by, note: "Als erledigt markiert" });
    if (out.ok) return res.json({ ok: true, clientId, id: req.params.id, status: "resolved" });
    // Legacy fallback (id is an old mas_tasks doc).
    const legacy = await completeTask(clientId, req.params.id, { by });
    if (!legacy.ok) return res.status(legacy.reason === "not_found" ? 404 : 400).json({ ok: false, ...legacy });
    res.json({ ok: true, clientId, ...legacy });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Clara case voice tools (custom_tools) ---------------------------------
// Let Clara work the follow-up loop hands-free: find the ticket for a patient,
// delegate it (Nadine/Lisa/Team), note progress, or close it. The resolved case
// is kept SERVER-SIDE (activeCase) so the 8B model never carries a case id.
const CASE_TOPIC_LABELS = {
  complaint: "Beschwerde",
  billing: "Rechnung/Kosten",
  appointment: "Termin",
  callback: "Rückruf",
  document: "Dokumente",
  other: "Allgemein",
};

function normalizeAssignee(raw) {
  const v = (raw || "").toLowerCase();
  if (/nadine|brief|e-?mail|schreiben/.test(v)) return "Nadine";
  if (/lisa|r[üu]ckruf|anruf|telefon|sms/.test(v)) return "Lisa";
  if (/ich|selbst|pers[öo]nlich|team|mitarbeiter/.test(v)) return "Team";
  return (raw || "").trim() || "Team";
}

function caseSpoken(c) {
  const topic = CASE_TOPIC_LABELS[c.topic] || c.topic;
  const cnt = c.contactCount > 1 ? `, ${c.contactCount} Kontakte` : "";
  const asg = c.assignee ? `, delegiert an ${c.assignee}` : "";
  return `Vorgang ${topic}${c.subject?.name ? ` für ${c.subject.name}` : ""}: Status ${c.status}${cnt}${asg}.`;
}

// Gesprochene Namen kommen mit Anrede an ("Herr Diedershagen", "Frau Meier") --
// die Patienten-DB kennt nur nackte Namen. Vor JEDER Suche entfernen, sonst
// endet "find_case name='Herr Diedershagen'" in "Kein Patient gefunden",
// obwohl Vorgang UND Patient existieren (systemischer Fehler 2026-06-10).
function cleanSpokenPersonName(raw) {
  return String(raw || "")
    .replace(/\b(herrn?|frau|fr(?:ä|ae)ulein|hr|fr|dr|prof|doktor|patient(?:in)?)\.?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// STT schreibt, was sie hört: "Tzannis" wird zu "Zannis", "Christou" zu
// "Kristu". Wenn die exakte Suche leer ausgeht, probieren wir gängige
// Transliterations-Varianten je Namens-Token durch, bevor wir aufgeben.
const SPOKEN_NAME_VARIANTS = [
  [/^z/, "tz"], [/^tz/, "z"], [/^ts/, "tz"],
  [/^c(?!h)/, "k"], [/^k/, "c"], [/^ch/, "k"],
  [/^v/, "w"], [/^w/, "v"], [/^f/, "ph"], [/^ph/, "f"],
  [/^j/, "y"], [/^y/, "j"],
  // Beobachtete STT-Hörfehler aus dem Testlauf 2026-06-10 (Token-Mitte,
  // jeweils nur die erste Fundstelle wird ersetzt):
  [/ay/, "ei"], [/ey/, "ei"], [/ai/, "ei"], [/ei/, "ay"], // Mayer/Meyer/Maier -> Meier
  [/äu/, "eu"], [/eu/, "äu"],                             // Häuser -> Heuser
  [/^tr/, "thr"], [/^thr/, "tr"],                         // Trandorf -> Thrandorf
  [/^t(?!h)/, "th"], [/^th/, "t"],                        // Termos -> Thermos
  [/t/, "d"], [/d/, "t"],                                 // Dietershagen -> Diedershagen
  [/id/, "ied"], [/ied/, "id"],                           // Didershagen -> Diedershagen
  [/ahn/, "ann"], [/ann/, "ahn"],                         // Zahnis -> Zannis/Tzannis
  [/z/, "ts"], [/ts/, "z"],                               // Pezas -> Petsas
  // Parakeet-Testlauf 2026-06-11: verschluckte Konsonanten in der Wortmitte.
  [/nor/, "ndor"], [/ndor/, "nor"],                       // Tranorf -> Trandorf
  [/sagen/, "shagen"], [/shagen/, "sagen"],               // Diedersagen -> Diedershagen
  [/iu$/, "iou"], [/iou$/, "iu"],                         // Vassiliu -> Vassiliou
];
// Doppelt angelegte / nur minimal anders geschriebene Patienten (dieselbe
// Person) werden ZENTRAL zusammengefasst, bevor irgendein Aufrufer die Liste
// sieht — sonst landet Clara bei "Xenofon oder Xenofon?" in einer Schleife
// (Chef-Regel 31.07.2026). Wirklich verschiedene Personen bleiben getrennt.
function tightenNameHits(query, patients) {
  if (!query || !Array.isArray(patients) || patients.length < 2) return patients;
  const exact = narrowByExactName(String(query).toLowerCase(), patients);
  if (exact.length) return exact;
  const near = narrowByNearName(query, patients);
  if (near.length) return near;
  return patients;
}

function collapseResultPatients(res) {
  if (res && Array.isArray(res.patients) && res.patients.length > 1) {
    return { ...res, patients: collapseSamePerson(res.patients) };
  }
  return res;
}
async function searchPatientSpoken(clientId, name) {
  const first = await searchPatient(clientId, name);
  if (!first.ok) return first;
  if ((first.patients || []).length) return collapseResultPatients(first);

  const tokens = String(name).split(/\s+/).filter(Boolean);
  const variants = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    for (const [re, rep] of SPOKEN_NAME_VARIANTS) {
      if (!re.test(t)) continue;
      const v = [...tokens];
      v[i] = t.replace(re, rep);
      const candidate = v.join(" ");
      if (candidate !== name.toLowerCase()) variants.push(candidate);
    }
  }
  for (const v of [...new Set(variants)].slice(0, 12)) {
    const r = await searchPatient(clientId, v).catch(() => null);
    if (r?.ok && (r.patients || []).length) return collapseResultPatients({ ...r, variantUsed: v });
  }

  // Phonetische Rettung ueber die Praesenzliste (Chef 31.07.2026): findet die
  // exakte Transliterations-Tabelle nichts, gleichen wir jedes gesprochene
  // Token per KLANG (Koelner Phonetik) gegen die Patientennamen aus dem
  // Kalenderfenster (+-2 Wochen) + Praxisgedaechtnis ab und suchen mit der so
  // wiederhergestellten, echten Schreibweise erneut. So wird "Termos"/"Dermos"
  // zu "Thermos", sobald die Person im Praesenzfenster steht. Best-effort:
  // faellt die Liste aus, bleibt exakt das bisherige Verhalten.
  try {
    const recovered = await recoverNamePhonetically(clientId, name, tokens);
    if (recovered && recovered.toLowerCase() !== String(name).toLowerCase()) {
      const r = await searchPatient(clientId, recovered).catch(() => null);
      if (r?.ok && (r.patients || []).length) {
        return collapseResultPatients({ ...r, variantUsed: recovered, phonetic: true });
      }
    }
  } catch (e) { /* Praesenzliste optional — kein Regress */ }

  return first; // ok:true, patients:[]
}

// Ersetzt jedes gesprochene Namens-Token durch einen klanggleichen, ECHTEN
// Namen aus der Praesenzliste (Einzel-Token-Namen: Vor-/Nachnamen). Liefert die
// wiederhergestellte Such-Query oder "" wenn nichts Klanggleiches gefunden wurde.
const _presenceKeyCache = new Map(); // clientId -> { at, byKey: Map<code, name> }
async function _presenceKeyIndex(clientId) {
  const hit = _presenceKeyCache.get(clientId);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.byKey;
  const byKey = new Map();
  const data = await listPatientNamesForStt(clientId).catch(() => null);
  for (const nm of (data?.names || [])) {
    const parts = String(nm).trim().split(/\s+/);
    if (parts.length !== 1) continue;          // nur Einzel-Token-Namen
    const code = koelnerPhonetikToken(parts[0]);
    if (code && !byKey.has(code)) byKey.set(code, parts[0]);
  }
  _presenceKeyCache.set(clientId, { at: Date.now(), byKey });
  return byKey;
}
async function recoverNamePhonetically(clientId, name, tokens) {
  const toks = (tokens && tokens.length ? tokens : String(name).split(/\s+/)).filter((t) => t && t.length >= 3);
  if (!toks.length) return "";
  const byKey = await _presenceKeyIndex(clientId);
  if (!byKey.size) return "";
  let changed = false;
  const out = toks.map((tok) => {
    const code = koelnerPhonetikToken(tok);
    if (!code) return tok;
    const real = byKey.get(code);
    if (real && real.toLowerCase() !== tok.toLowerCase()) { changed = true; return real; }
    return real || tok;
  });
  return changed ? out.join(" ") : "";
}

// Token-Match eines gesprochenen Namens gegen den Vorgangs-Betreff. Erlaubt
// Treffer auch ohne Patientendatensatz (z.B. E-Mail-Absender, die noch nicht
// in der Patienten-DB stehen) und überlebt Teil-Namen ("Diedershagen").
function nameMatchesCaseSubject(c, cleanedName) {
  const subj = String(c?.subject?.name || "").toLowerCase();
  if (!subj) return false;
  const tokens = String(cleanedName || "").toLowerCase().split(" ").filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  return tokens.every((t) => subj.includes(t));
}


router.post("/tools/briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const cases = await listCases(clientId, { activeOnly: true, limit: 200 });
    const briefing = buildCaseBriefing(cases, { role: op?.role, operatorName: op?.name });
    let message = buildSpokenCaseBriefing(briefing, { operatorName: op?.name });
    // FreiSprech: Vorgangs-Briefing menschlicher formulieren (Fakten-Guard).
    try { message = (await freiFormulieren(message, { kontext: "Briefing zu offenen Vorgaengen" })).text; } catch { /* deterministisch weiter */ }
    return res.json({ ok: true, message, operator: op ? { name: op.name, role: op.role } : null });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Clara asks Nadine: "Was gab es heute für E-Mails?" -> Nadine's spoken summary.
router.post("/tools/nadine-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const accountIds = await operatorMailAccountIds(clientId);
    const { spokenText } = await buildMailBriefing(clientId, { sinceMinutes: Number(req.body?.sinceMinutes) || 720, accountIds });
    return res.json({ ok: true, message: spokenText });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Clara: "Lies mir die E-Mail von Signpeople vor." — findet die neueste
// Posteingangs-Mail zu einem gesprochenen Absender/Betreff und liefert den
// INHALT zum Vorlesen. Deckt ALLE Absender ab (Labore, Firmen, Patienten);
// find_case kennt nur Patienten mit offenem Vorgang und lief hier ins Leere.
router.post("/tools/read-email", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const query = String(req.body?.query || req.body?.name || req.body?.sender || "").trim();
    if (!query) return res.json({ ok: false, message: "Von welchem Absender oder zu welchem Betreff soll ich die E-Mail vorlesen?" });

    const accountIds = await operatorMailAccountIds(clientId);
    const rows = await listMessages(clientId, { folder: "INBOX", limit: 50, accountIds });
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    const fromText = (f) => (typeof f === "object" && f !== null ? `${f.name || ""} ${f.address || ""}` : String(f || ""));
    const hay = (r) => `${fromText(r.from)} ${r.subject || ""} ${r.preview || ""}`.toLowerCase();
    let hits = tokens.length ? rows.filter((r) => tokens.some((t) => hay(r).includes(t))) : [];
    // Volltreffer (alle Wörter) schlagen Teiltreffer; Liste ist neueste zuerst.
    const strong = hits.filter((r) => tokens.every((t) => hay(r).includes(t)));
    if (strong.length) hits = strong;
    if (!hits.length) {
      return res.json({ ok: false, message: `Ich finde im Posteingang keine E-Mail zu „${query}“. Soll ich stattdessen die neuesten E-Mails nennen?` });
    }

    const full = await getMessage(clientId, hits[0].id);
    const htmlText = String(full?.htmlBody || "")
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    const body = (String(full?.textBody || "").replace(/\s+/g, " ").trim() || htmlText || String(full?.preview || "")).slice(0, 1500);
    // "from" ist je nach Sync-Pfad ein String ("Name <addr>") oder ein Objekt
    // ({ name, address }) — beides auf einen sprechbaren Namen reduzieren.
    const fromRaw = full?.from;
    const fromLabel = (
      typeof fromRaw === "object" && fromRaw !== null
        ? String(fromRaw.name || fromRaw.address || "")
        : String(fromRaw || "")
    ).replace(/<[^>]*>/g, "").trim() || "Unbekannt";
    const when = full?.date ? new Date(full.date).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", hour: "2-digit", minute: "2-digit" }) : "";
    const more = hits.length > 1 ? ` Es gibt noch ${hits.length - 1} weitere passende E-Mail${hits.length > 2 ? "s" : ""}.` : "";
    const subj = full?.subject || "(kein Betreff)";
    const head = `E-Mail von ${fromLabel}${when ? `, eingegangen ${when}` : ""}. Betreff: ${subj}.`;

    // Zusammenfassen statt Textwand (Chef 10.07.2026): Standard ist eine
    // fluessige Zusammenfassung des ECHTEN Inhalts (abgeschottetes LLM,
    // Zahlen-Waechter). Will der Chef den Wortlaut, ruft die KI mit full=true
    // erneut auf. LLM offline/unsicher -> deterministischer Volltext wie bisher.
    const wantFull = req.body?.full === true || String(req.body?.full || "").toLowerCase() === "true";
    if (!wantFull && body && body.length >= 200) {
      // E-Mail-Inhalte fasst das starke Modell (qwen3.6 auf dem 5090) zusammen —
      // deutlich treffsicherer als das lokale Kleinmodell. Zahlen-Waechter greift.
      const strong = strongLlm();
      const sum = await summarizeForSpeech("email", body, { subject: subj, sender: fromLabel, baseUrl: strong.base, model: strong.model });
      if (sum.ok) {
        const message = `${head} Zusammengefasst: ${sum.text} Soll ich die ganze Mail vorlesen?${more}`;
        return res.json({ ok: true, message, messageId: hits[0].id, summarized: true });
      }
    }
    const message = `${head} Inhalt: ${body || "(kein Text erkennbar)"}${more}`;
    return res.json({ ok: true, message, messageId: hits[0].id, summarized: false });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Persönlicher Assistent: Das gekoppelte Handy gehört EINEM Behandler. Ohne
// explizite Behandler-Angabe gilt deshalb NUR dessen eigener Kalender — Clara
// liest Dr. Petsas nicht ungefragt die Termine von Dr. Patrikis vor. Mit
// doctorName "alle"/"Praxis" (oder einem Kollegen-Namen) wird breiter gescopt.
const ALL_DOCTORS_RE = /^(alle|alles|gesamt|praxis|team|komplett|jede[rn]?)\b/i;

// Operator -> Behandlername fuer die "Sie haben ..."-Ansprache. Das Pairing
// schreibt role "doctor" (englisch) und doctorName null — die alte Pruefung
// auf role.startsWith("arzt") griff dadurch nie und Clara sprach den Chef in
// der dritten Person an ("Morgen hat Dr. Petsas ..."). Jetzt zaehlen beide
// Sprachen plus ein Titel-Heuristik-Fallback ("Dr. ..." im Namen).
function operatorDoctorNameOf(op) {
  if (!op) return "";
  const explicit = String(op.doctorName || "").trim();
  if (explicit) return explicit;
  const role = String(op.role || "").trim().toLowerCase();
  const name = String(op.name || "").trim();
  if (/^(arzt|aerztin|ärztin|doctor|doktor|behandler|dentist|zahnarzt|zahnaerztin|zahnärztin)/.test(role)) return name;
  if (/^(dr|prof)\b/i.test(name)) return name;
  return "";
}

async function resolveDayCalendarScope(clientId, body) {
  let calendarId = String(body?.calendarId || "").trim() || null;
  const rawDoctor = String(body?.doctorName || "").trim();
  if (calendarId) return { calendarId, scope: "explicit" };
  if (rawDoctor && ALL_DOCTORS_RE.test(rawDoctor)) return { calendarId: null, scope: "all" };
  if (rawDoctor) {
    const booking = await loadBooking(clientId).catch(() => null);
    const cal = booking ? resolveCalendar(booking, rawDoctor) : null;
    // Unbekannter Name: lieber ungefiltert antworten als still falsch filtern.
    return { calendarId: cal?.id || null, scope: cal ? "named" : "all" };
  }
  // Kein Behandler genannt -> auf den identifizierten Operator scopen.
  try {
    const op = await getOperator(clientId);
    const opName = String(op?.doctorName || op?.name || "").trim();
    if (opName) {
      const booking = await loadBooking(clientId).catch(() => null);
      const cal = booking ? resolveCalendar(booking, opName) : null;
      if (cal) return { calendarId: cal.id, scope: "operator" };
    }
  } catch { /* Operator-Lookup darf nie den Kalender blockieren */ }
  return { calendarId: null, scope: "all" };
}

// Datumsbereich aus dem Tool-Body: entweder explizite ISO-Grenzen (from+to)
// ODER eine gesprochene Phrase (range: "letzte Woche", "naechster Monat", ...),
// die deterministisch aufgeloest wird. Liefert null, wenn KEIN Zeitraum vorliegt
// -> der Aufrufer bleibt dann beim unveraenderten Einzeltag-Pfad (Vertragstreue).
function resolveRangeFromBody(body) {
  const iso = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim()) ? String(s).trim() : "");
  const from = iso(body?.from);
  const to = iso(body?.to);
  if (from && to) return { from, to, label: "" };
  const phrase = String(body?.range || "").trim();
  if (phrase) {
    const r = resolveDateRange(phrase, todayBerlin());
    if (r) return r;
  }
  return null;
}


// Clara: "Was steht heute (oder am …) im Kalender?" — reads the ACTUAL booked
// appointments and speaks a per-Behandler overview incl. free gaps + highlights.
// Optional doctorName scopes it; the monitor jumps to the day for context.
// Morgen-Moment (Jawdropper ②): "Guten Morgen, Clara" -> EIN flüssiger
// Auftakt aus roter Liste (zuerst!), Tagesplan, Über-Nacht-Eingängen, offenen
// Anliegen und dem Lücken-Radar (ohne Umsatzzahlen). Variierend statt Bandansage.
router.post("/tools/morning-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const mailAccountIds = await operatorMailAccountIds(clientId);
    let message = await spokenMorningBriefing(clientId, {
      operatorName: op?.name || "",
      operatorDoctorName: operatorDoctorNameOf(op),
      mailAccountIds,
    });
    // FreiSprech: menschlich-variantenreich statt Bandansage; der Fakten-Guard
    // sichert Namen/Zahlen/Uhrzeiten, sonst bleibt der deterministische Text.
    try { message = (await freiFormulieren(message, { kontext: "Morgen-Briefing zum Tagesstart" })).text; } catch { /* deterministisch weiter */ }
    // Den Tag auf dem Monitor aufschlagen (best-effort).
    try { await emitCommand(clientId, { type: "navigate", date: todayBerlin() }); } catch { /* keine Session */ }
    return res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// ASAP-Queue (Masterplan Phase 5): "Was brennt?" — EINE serverseitige
// Dringlichkeits-Schicht aus roter Liste, Fristen, offenen Anliegen, Post-/
// Recall-Freigaben und Doku-Wächter. Antwortet IMMER aus den Quellsystemen,
// nie aus dem LLM-Gedächtnis. KEINE Umsatzzahlen im Sprechtext.
router.post("/tools/asap-queue", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const mailAccountIds = await operatorMailAccountIds(clientId);
    const queue = await buildAsapQueue(clientId, { mailAccountIds });
    let message = spokenAsapQueue(queue);
    // FreiSprech: Varianz mit Fakten-Guard, deterministischer Text als Netz.
    try { message = (await freiFormulieren(message, { kontext: "Dringlichkeits-Auskunft (Was brennt?)" })).text; } catch { /* deterministisch weiter */ }
    return res.json({ ok: true, message, counts: queue.counts, items: queue.items });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Proaktiv-Snooze ("Clara, Ruhe jetzt"): pausiert Spontan-Meldungen der
// Proaktiv-Engine. Lern-Regel: zweimal am selben Tag gesnoozt => Rest des
// Tages nur noch P0. Kritisches (P0) kommt IMMER durch.
router.post("/tools/proaktiv-snooze", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const minutes = Number(req.body?.minutes) || 60;
    const op = await getOperator(clientId).catch(() => null);
    const out = await snoozeProaktiv(clientId, { minutes, by: op?.name || "" });
    return res.json({ ok: true, message: out.message, minutes: out.minutes, restOfDay: out.restOfDay });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Abend-Moment ("Feierabend, Clara"): dringlichkeitsfokussierter Tagesabschluss
// — rote Liste zuerst (Anwalt/Kammer/Mahnung/Pfändung/Fristen), dann stressende
// Patienten, dann offene Freigaben. KEINE Statistik, KEINE Umsatzzahlen.
router.post("/tools/evening-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const mailAccountIds = await operatorMailAccountIds(clientId);
    let message = await spokenEveningBriefing(clientId, {
      operatorName: op?.name || "",
      mailAccountIds,
    });
    // FreiSprech: siehe Morgen-Briefing — Varianz mit Fakten-Guard.
    try { message = (await freiFormulieren(message, { kontext: "Feierabend-Briefing (Tagesabschluss)" })).text; } catch { /* deterministisch weiter */ }
    return res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/tools/day-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = (req.body?.date || "").trim() || todayBerlin();
    const calScope = await resolveDayCalendarScope(clientId, req.body);
    const calendarId = calScope.calendarId;

    // Zeitraum-Zweig (09.07.2026): "Wie war letzte Woche?", "Wie voll ist
    // naechster Monat?", "dieses Quartal" -> aggregiertes Bereichs-Lagebild
    // (Summe + vollster/ruhigster Tag). Nur wenn ein Zeitraum vorliegt; sonst
    // laeuft der unveraenderte Einzeltag-Pfad weiter.
    const range = resolveRangeFromBody(req.body);
    if (range) {
      const r = await buildSpokenRangeOverview(clientId, {
        from: range.from, to: range.to, calendarId, rangeLabel: range.label,
      });
      if (!r.ok) return res.json({ ok: false, message: r.message });
      let rmsg = r.message;
      try { rmsg = (await freiFormulieren(rmsg, { kontext: "Zeitraum-Lagebild fuer den Chef" })).text; } catch { /* deterministisch weiter */ }
      // 27.07.2026: stand hier fest auf card:null — der Flip blieb bei jeder
      // Zeitraum-Frage leer. Jetzt die Tages-Aufschluesselung als Karte.
      let rcard = null;
      try {
        rcard = karteZeitraum({
          label: range.label || "Zeitraum", from: r.from, to: r.to,
          days: (r.dayStats || []).map((d) => ({ date: d.day, count: d.total })),
          total: r.counts?.total || 0,
        });
      } catch { /* Karte ist Komfort */ }
      return res.json({ ok: true, date: r.from, from: r.from, to: r.to, days: r.days, message: rmsg, counts: r.counts, card: rcard });
    }

    const op = await getOperator(clientId);
    const opDoctor = operatorDoctorNameOf(op);
    // Lagebild statt Einzelvorlesen: Kopfzeile (Termine + E-Mails + Anrufe) +
    // Top-Auffälligkeiten, Details auf Nachfrage (Chef-Wunsch 15.06.2026).
    const overview = await buildSpokenDayOverview(clientId, { date, calendarId, operatorDoctorName: opDoctor });
    if (!overview.ok) return res.json({ ok: false, message: overview.message });
    let message = overview.message;
    // FreiSprech: menschlich-variantenreiche Umformulierung, Fakten-Guard
    // sichert Zahlen/Namen — bei Zweifel bleibt der deterministische Text.
    try { message = (await freiFormulieren(message, { kontext: "Tages-Lagebild fuer den Chef" })).text; } catch { /* deterministisch weiter */ }
    // Offene Recall-Initiative? Clara bringt sich aktiv ein ("morgen ist wenig
    // los — soll ich die Anruflisten freigeben?"). NACH FreiSprech anhaengen,
    // damit der Freigabe-Wortlaut kanonisch bleibt.
    try { message += await initiativeSuffix(clientId); } catch { /* optional */ }
    // Show the day on the monitor (best-effort; works only with an active session).
    try { await emitCommand(clientId, { type: "navigate", date: overview.date, calendarId: calendarId || null }); } catch { /* no live session */ }
    // card = Übersichts-Karte fürs Handy (Hero-Design) — deterministische
    // Fakten, unabhängig von der FreiSprech-Formulierung.
    return res.json({ ok: true, date: overview.date, message, counts: overview.counts, card: overview.card || null });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Clara: "Gibt es neue Bewertungen?" — liest Patienten-Bewertungen vor und
// kommentiert sie (schleimig bei 4-5 Sternen, sarkastisch bei 1-2). Die
// Pointen kommen deterministisch aus clara/humor.js, nicht vom LLM.
router.post("/tools/read-ratings", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const sinceDays = Math.max(0, Math.min(365, Number(req.body?.sinceDays || 0)));
    const message = await spokenRatings(clientId, { limit: 3, sinceDays });
    return res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Clara: "Wer kommt morgen?" / "Welche Patienten hat Dr. Petsas?" — the
// CONCRETE appointment list with patient names + times (day_briefing only
// summarises counts and gaps). Internal team tool; never exposed to patients.
router.post("/tools/day-appointments", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = (req.body?.date || "").trim() || todayBerlin();
    const calScope = await resolveDayCalendarScope(clientId, req.body);
    const calendarId = calScope.calendarId;

    // Zeitraum-Zweig (09.07.2026): "Wer kam letzte Woche?", "Termine naechsten
    // Monat" -> Tages-Aufschluesselung ueber den Bereich (statt Einzeltermine).
    // Nur bei vorliegendem Zeitraum; sonst unveraenderter Einzeltag-Pfad.
    const range = resolveRangeFromBody(req.body);
    if (range) {
      const r = await buildSpokenRangeList(clientId, {
        from: range.from, to: range.to, calendarId, rangeLabel: range.label,
      });
      if (!r.ok) return res.json({ ok: false, message: r.message });
      let rcard = null;
      try {
        rcard = karteZeitraum({
          label: range.label || "Zeitraum", from: r.from, to: r.to,
          days: (r.dayStats || []).map((d) => ({ date: d.day, count: d.total })),
          total: r.count || 0,
        });
      } catch { /* Karte ist Komfort */ }
      return res.json({ ok: true, date: r.from, from: r.from, to: r.to, message: r.message, count: r.count, card: rcard });
    }

    const day = await getDayAppointments(clientId, { date, calendarId });
    if (!day.ok) return res.json({ ok: false, message: day.reason === "no_location" ? "Es ist keine Praxis-Buchungskonfiguration hinterlegt." : `Terminliste nicht verfügbar (${day.reason}).` });

    // "Wie viele Termine habe ich NOCH?" -> nur die noch kommenden zaehlen,
    // vergangene/erledigte raus (Chef-Feedback 15.06.2026). Nur sinnvoll fuer
    // HEUTE; bei anderen Tagen ignorieren wir das Flag.
    const wantRemaining = req.body?.remaining === true || String(req.body?.remaining || "").toLowerCase() === "true";
    const remaining = wantRemaining && day.date === todayBerlin();
    let appts = day.appointments;
    if (remaining) {
      const nowMs = Date.now();
      appts = appts.filter((a) => !a.isAbsence && (a.endMs || a.startMs) >= nowMs);
    }

    // "Sie haben morgen ..." only when the asking operator IS that doctor.
    const op = await getOperator(clientId);
    const operatorDoctorName = operatorDoctorNameOf(op);

    // ZAEHLFRAGE (27.07.2026): "Wie viele Termine habe ich heute?" wurde bisher
    // mit der KOMPLETTEN Vorleseliste beantwortet — der Chef fragte dreimal
    // nach und bekam dreimal dieselbe Aufzaehlung, am Ende eine erfundene Zahl
    // ("insgesamt fuenf Termine", es waren elf). countOnly liefert genau die
    // Zahl; die Einzelheiten stehen auf der Flip-Karte, die ohnehin mitfaehrt.
    const wantCountOnly = req.body?.countOnly === true
      || String(req.body?.countOnly || "").toLowerCase() === "true";
    if (wantCountOnly) {
      const echte = appts.filter((a) => !a.isAbsence);
      const n = echte.length;
      const wer = String(req.body?.doctorName || "").trim() || operatorDoctorName || "";
      const rel = relativeDayLabel(day.date);
      // Rueckblick auch fuer HEUTE, sobald der letzte Termin durch ist —
      // abends "Heute haben Sie 3 Termine" klingt nach Zukunft.
      const letzterDurch = n > 0
        && (echte[n - 1].endMs || echte[n - 1].startMs) < Date.now();
      const vergangen = day.date < todayBerlin()
        || (day.date === todayBerlin() && !remaining && letzterDurch);
      // Wortstellung (27.07.2026): die Zeitangabe steht vorn, also MUSS das
      // Verb vor das Subjekt ("Letzte Woche Mittwoch hatten Sie ..."). Vorher
      // kam "Letzte Woche Mittwoch Sie hatten 5 Termine" heraus.
      const fremd = wer && wer !== operatorDoctorName;
      const verb = fremd
        ? `${vergangen ? "hatte" : "hat"} ${wer}`
        : `${vergangen ? "hatten" : "haben"} Sie`;
      const spanne = n
        ? `, von ${new Date(echte[0].startMs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr bis ${new Date(echte[n - 1].startMs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr`
        : "";
      // Abends mit remaining=true heisst 0 nicht "keine Termine" (der Tag hatte
      // welche), sondern "nichts mehr".
      const zahlSatz = n === 0
        ? (remaining ? `${rel} steht nichts mehr an.` : `${rel} ${verb} keine Termine.`)
        : `${rel} ${verb} ${n === 1 ? "einen Termin" : `${n} Termine`}${remaining ? " noch vor sich" : ""}${spanne}.`;
      // "Keine Termine" heisst an einem Urlaubstag etwas anderes als an einem
      // leeren Arbeitstag (Chef 27.07.2026) — die eigene Sperre gehoert dazu.
      const eigeneSperre = spokenOwnAbsence(
        (day.appointments || []).filter((a) => a.isAbsence).map((a) => ({
          calendarName: a.calendarName, startMs: a.startMs, endMs: a.endMs,
          title: a.title || "", multiDay: a.isMultiDay === true,
        })),
        { operatorDoctorName, dayOver: vergangen });
      const countMessage = `${zahlSatz.charAt(0).toUpperCase()}${zahlSatz.slice(1)}`
        + `${eigeneSperre ? ` ${eigeneSperre}` : ""}${n ? " Die Namen lese ich auf Zuruf vor." : ""}`;
      let ccard = null;
      try {
        ccard = karteTerminliste({
          dateIso: day.date,
          appointments: echte.map((a) => ({
            id: a.id, startMs: a.startMs, endMs: a.endMs,
            patientName: a.patientName, patientLastName: a.patientLastName,
            visitMotive: a.visitMotive, calendarName: a.calendarName,
            comments: a.comments || "", docsStatus: a.docsStatus || "",
          })),
          remaining,
          doctorName: String(req.body?.doctorName || "").trim(),
        });
      } catch { /* Karte ist Komfort */ }
      return res.json({ ok: true, date: day.date, message: countMessage, count: n, countOnly: true, card: ccard });
    }

    const list = buildSpokenDayList(appts, { date: day.date, calendars: day.calendars, operatorDoctorName, remaining });

    // Shared brain: surface open cases (e.g. the e-mail Nadine threaded) for
    // the patients on this schedule. Best-effort — the list must never fail
    // because the memory lookup hiccuped.
    let memory = "";
    try {
      const pids = appts.filter((a) => !a.isAbsence && a.patientId).map((a) => a.patientId);
      const caseMap = await listActiveCasesByPatientIds(clientId, pids);
      memory = buildSpokenMemoryHints(appts, caseMap);
    } catch (err) {
      log.warn("day-appointments memory hints failed", { clientId, err: String(err?.message || err) });
    }

    // Vorbereitung pro Tagespatient (09.07.2026): Anamnese-Auffaelligkeiten
    // (Allergien/Medikamente/Vorerkrankungen) + letzte Behandlung. Pro Patient
    // zwei Reads — deshalb auf die ersten MEMORY_HINT_MAX Patienten begrenzt und
    // strikt best-effort: die Liste darf nie an der Vorbereitung scheitern.
    let prep = "";
    try {
      const uniquePids = [...new Set(appts.filter((a) => !a.isAbsence && a.patientId).map((a) => a.patientId))].slice(0, 5);
      const prepMap = new Map();
      await Promise.all(uniquePids.map(async (pid) => {
        const [ana, hist] = await Promise.all([
          getPatientAnamnese(clientId, { patientId: pid }).catch(() => null),
          getPatientAppointments(clientId, { patientId: pid }).catch(() => null),
        ]);
        const findings = (ana && ana.ok && ana.hasAnamnese) ? (ana.findings || []) : [];
        const lastAppt = (hist && hist.ok) ? (hist.last || null) : null;
        // W-LENA-8d: kurzes gewichtetes Template-Snippet (kein Roman).
        let lenaSnippet = "";
        if (lastAppt?.id) {
          const w = await loadWeightedVisitBriefing(clientId, { lastAppt }).catch(() => null);
          if (w?.spoken) lenaSnippet = w.spoken;
        }
        if (findings.length || lastAppt || lenaSnippet) {
          prepMap.set(pid, { findings, lastAppt, lenaSnippet });
        }
      }));
      prep = buildSpokenPatientPrep(appts, prepMap);
    } catch (err) {
      log.warn("day-appointments patient prep failed", { clientId, err: String(err?.message || err) });
    }

    const message = [list, memory, prep].filter(Boolean).join(" ");
    try { await emitCommand(clientId, { type: "navigate", date: day.date, calendarId: calendarId || null }); } catch { /* no live session */ }
    // W-DIALOG: strukturierte Termine mitliefern, damit Clara sie turn-
    // uebergreifend merken kann ("verschieb den" / "den um 14 Uhr"). Der
    // gesprochene Text (message) bleibt unveraendert.
    const appointments = appts
      .filter((a) => !a.isAbsence)
      .map((a) => ({
        id: a.id,
        startMs: a.startMs,
        endMs: a.endMs,
        patientName: a.patientName,
        patientLastName: a.patientLastName,
        visitMotive: a.visitMotive,
        calendarName: a.calendarName,
        comments: a.comments || "",
        docsStatus: a.docsStatus || "",
      }));
    // Flip-Karte (27.07.2026): dieselben Fakten wie der gesprochene Text.
    // Ohne sie blieb die Karten-Rueckseite bei der haeufigsten Frage ueberhaupt
    // ("Was habe ich heute fuer Termine?") leer.
    let card = null;
    try {
      card = karteTerminliste({
        dateIso: day.date,
        appointments,
        remaining,
        doctorName: String(req.body?.doctorName || "").trim(),
      });
    } catch { /* Karte ist Komfort — die gesprochene Antwort steht auch ohne */ }

    return res.json({
      ok: true, date: day.date, message,
      count: appointments.length,
      appointments,
      card,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1) PATIENTEN-ZEITSTRAHL: "Was war mit Herrn Meier?" -> komplette Spur aus dem
// Shared Memory. Patientenbestimmung wie find_contact (neuer Name -> Suche,
// sonst gemerkte Kandidaten; bei Mehrdeutigkeit Rueckfrage).
router.post("/tools/patient-timeline", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = String(req.body?.name || "").trim();
    const hint = String(req.body?.hint || "").trim();

    // Ordinal-Nachfrage ("der erste", "der von gestern") gegen die zuletzt
    // vorgelesene Kandidatenliste aufloesen — gleiche Logik wie find_contact.
    const ordinalSource = `${hint} ${rawName}`.trim().toLowerCase();
    if (ordinalSource) {
      const remembered = await getPatientCandidates(clientId);
      const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
      if (byOrd) {
        await setPatientCandidates(clientId, [byOrd], byOrd);
        const message = await buildSpokenPatientTimeline(clientId, byOrd);
        return res.json({ ok: true, message });
      }
    }

    let candidates = [];
    if (rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const found = await searchPatientSpoken(clientId, name);
      if (!found.ok) return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${found.error}` });
      candidates = found.patients || [];
      if (candidates.length > 1) {
        const exact = narrowByExactName(name.toLowerCase(), candidates);
        if (exact.length) candidates = exact;
      }
      if (!candidates.length) {
        await setPatientCandidates(clientId, [], null);
        return res.json({ ok: false, message: `Zu ${name} finde ich keinen Patienten im Praxisgedächtnis.` });
      }
    } else {
      candidates = await getPatientCandidates(clientId);
      if (!candidates.length) return res.json({ ok: false, message: "Zu wem soll ich nachsehen? Bitte den Namen nennen." });
    }

    if (candidates.length > 1) {
      await setPatientCandidates(clientId, candidates, null);
      return res.json({ ok: true, message: disambiguationQuestion(candidates) });
    }

    const sel = candidates[0];
    await setPatientCandidates(clientId, candidates, sel);
    await emitCommand(clientId, {
      type: "patient_selected",
      patient: { firstName: sel.firstName, lastName: sel.lastName, birthDate: sel.birthDate },
      hasPhone: !!sel.hasPhone,
    }).catch(() => {});
    const message = await buildSpokenPatientTimeline(clientId, sel);
    return res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1b) NAECHSTER TERMIN EINES PATIENTEN: "Wann hat Frau Thrandorf ihren
// naechsten Termin / hat sie ueberhaupt einen?" -> echter Kalender, NICHT das
// Gedaechtnis. Patientenbestimmung exakt wie patient-timeline (Ordinal gegen
// gemerkte Kandidaten, sonst Namenssuche, bei Mehrdeutigkeit Rueckfrage).
// Anders als das eingebaute findAppointment braucht das KEIN Geburtsdatum.
router.post("/tools/patient-appointments", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = String(req.body?.name || "").trim();
    const hint = String(req.body?.hint || "").trim();

    // W-DIALOG WP5b: Umfeld am Gegenstand (Nachbar zur gleichen Zeit + offene
    // Vorgaenge/Mail). Best-effort — die Terminantwort darf nie daran scheitern.
    // Rueckfragen nur bei Befund; keine automatische Doppelabsage.
    const packPatientAppts = async (result, who, patient) => {
      const next = result?.next || null;
      const upcoming = Array.isArray(result?.upcoming) ? result.upcoming : (next ? [next] : []);
      const named = (a) => a ? {
        ...a,
        patientName: a.patientName || who,
        patientLastName: a.patientLastName || patient?.lastName || "",
        lastName: patient?.lastName || a.patientLastName || "",
      } : null;
      const focus = named(next);
      let message = buildSpokenPatientAppointments(result, { who });
      const surroundings = { companions: [], caseHint: "" };
      if (focus?.startMs) {
        try {
          const date = dayOfMs(focus.startMs);
          const day = await getDayAppointments(clientId, {
            date,
            calendarId: focus.calendarId || undefined,
          });
          if (day?.ok) {
            const companions = findSameTimeCompanions(day.appointments, focus);
            const q = buildSpokenCompanionQuestion(companions);
            if (q) {
              message = `${message} ${q}`;
              surroundings.companions = companions
                .filter((c) => c.sameLastName)
                .slice(0, 2)
                .map((c) => ({
                  appointmentId: c.id,
                  patientId: c.patientId,
                  patientName: c.patientName,
                  patientLastName: c.patientLastName,
                  startMs: c.startMs,
                }));
            }
          }
        } catch (err) {
          log.warn("patient-appointments companion scan failed", { clientId, err: String(err?.message || err) });
        }
        try {
          const pid = focus.patientId || patient?.id;
          if (pid) {
            const caseMap = await listActiveCasesByPatientIds(clientId, [pid]);
            const mem = buildSpokenMemoryHints([focus], caseMap);
            if (mem) {
              message = `${message} ${mem}`;
              surroundings.caseHint = mem;
            }
          }
        } catch (err) {
          log.warn("patient-appointments case scan failed", { clientId, err: String(err?.message || err) });
        }
      }
      return {
        ok: true,
        message,
        next: focus,
        upcoming: upcoming.map(named).filter(Boolean),
        surroundings,
      };
    };

    const ordinalSource = `${hint} ${rawName}`.trim().toLowerCase();
    if (ordinalSource) {
      const remembered = await getPatientCandidates(clientId);
      const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
      if (byOrd) {
        await setPatientCandidates(clientId, [byOrd], byOrd);
        const who = `${byOrd.firstName || ""} ${byOrd.lastName || ""}`.trim() || "der Patient";
        const result = await getPatientAppointments(clientId, { patientId: byOrd.id, firstName: byOrd.firstName, lastName: byOrd.lastName });
        return res.json(await packPatientAppts(result, who, byOrd));
      }
    }

    let candidates = [];
    if (rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const found = await searchPatientSpoken(clientId, name);
      if (!found.ok) return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${found.error}` });
      candidates = found.patients || [];
      if (candidates.length > 1) {
        const exact = narrowByExactName(name.toLowerCase(), candidates);
        if (exact.length) candidates = exact;
      }
      if (!candidates.length) {
        await setPatientCandidates(clientId, [], null);
        return res.json({ ok: false, message: `Zu ${name} finde ich keinen Patienten im Praxisgedächtnis.` });
      }
    } else {
      candidates = await getPatientCandidates(clientId);
      if (!candidates.length) return res.json({ ok: false, message: "Zu welchem Patienten soll ich nach dem Termin sehen? Bitte den Namen nennen." });
    }

    if (candidates.length > 1) {
      await setPatientCandidates(clientId, candidates, null);
      return res.json({ ok: true, message: disambiguationQuestion(candidates) });
    }

    const sel = candidates[0];
    await setPatientCandidates(clientId, candidates, sel);
    const who = `${sel.firstName || ""} ${sel.lastName || ""}`.trim() || "der Patient";
    const result = await getPatientAppointments(clientId, { patientId: sel.id, firstName: sel.firstName, lastName: sel.lastName });
    return res.json(await packPatientAppts(result, who, sel));
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1c) NAECHSTER FREIER TERMIN: "Wann ist der naechste freie Termin (bei Dr. X)?"
// Liest die echten freien Slots ueber getFreeTimeSlots (kennt Sprechzeiten +
// Belegung) und nennt den fruehesten. Ohne Behandlungsart waehlen wir einen
// Kontrolltermin als Default (die CF braucht die Dauer fuer die Slot-Laenge).
router.post("/tools/next-free-slot", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const doctorName = String(req.body?.doctorName || "").trim();
    let visitMotiveName = String(req.body?.visitMotiveName || "").trim();
    if (!visitMotiveName) {
      const booking = await loadBooking(clientId).catch(() => null);
      visitMotiveName = booking ? (defaultControlMotive(booking)?.name || "") : "";
    }
    const result = await findSlots(clientId, { doctorName, visitMotiveName, startDate: todayBerlin() });
    if (!result.ok) {
      return res.json({ ok: false, message: `Freie Termine kann ich gerade nicht abrufen: ${result.error}` });
    }
    const slot = (result.slots || [])[0];
    const message = buildSpokenNextFreeSlot(slot, {
      calendarName: result.calendarName || doctorName,
      visitMotiveName: result.visitMotiveName || visitMotiveName,
    });
    return res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Gemeinsame Patientenbestimmung fuer Sprach-Lesetools (Termine, Behandlungen,
// Anamnese): Ordinal gegen gemerkte Kandidaten, sonst Namenssuche, bei
// Mehrdeutigkeit Rueckfrage. Liefert entweder {done:true, payload} fuer eine
// fertige (Frage-)Antwort oder {done:false, sel} mit dem eindeutigen Patienten.
// Bricht NIE auf ein Geburtsdatum zu (am Telefon selten bekannt).
async function resolveSpokenPatientForRead(clientId, { rawName, hint, askWho }) {
  const ordinalSource = `${hint} ${rawName}`.trim().toLowerCase();
  if (ordinalSource) {
    const remembered = await getPatientCandidates(clientId);
    const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
    if (byOrd) {
      await setPatientCandidates(clientId, [byOrd], byOrd);
      return { done: false, sel: byOrd };
    }
  }

  let candidates = [];
  if (rawName) {
    const name = cleanSpokenPersonName(rawName) || rawName;
    const found = await searchPatientSpoken(clientId, name);
    if (!found.ok) return { done: true, payload: { ok: false, message: `Patientensuche fehlgeschlagen: ${found.error}` } };
    candidates = found.patients || [];
    if (candidates.length > 1) {
      const exact = narrowByExactName(name.toLowerCase(), candidates);
      if (exact.length) candidates = exact;
    }
    if (!candidates.length) {
      await setPatientCandidates(clientId, [], null);
      return { done: true, payload: { ok: false, message: `Zu ${name} finde ich keinen Patienten im Praxisgedächtnis.` } };
    }
  } else {
    candidates = await getPatientCandidates(clientId);
    if (!candidates.length) return { done: true, payload: { ok: false, message: askWho } };
  }

  if (candidates.length > 1) {
    await setPatientCandidates(clientId, candidates, null);
    return { done: true, payload: { ok: true, message: disambiguationQuestion(candidates) } };
  }

  const sel = candidates[0];
  await setPatientCandidates(clientId, candidates, sel);
  return { done: false, sel };
}


// --- LENA-AUFNAHME per Sprachbefehl (W-LENA-1) -------------------------------
// "Clara, starte/beende die Aufnahme". Der Patient wird IMMER halluzinations-
// frei aus dem echten Kalender gebunden: explizite appointmentId (Termin offen)
// startet sofort mit Readback; sonst schlaegt Clara den aktuellen Stuhl-
// Patienten (bzw. den genannten Namen) vor und wartet auf Bestaetigung, damit
// nie ins falsche Blatt dokumentiert wird. "Nein, Herr Meier" ist eine
// Korrektur (neuer Kalender-Abgleich), "Ja" startet den schwebenden Kandidaten.
function _recTruthy(v) {
  if (v === true) return true;
  const s = String(v || "").trim().toLowerCase();
  return ["true", "1", "yes", "confirm", "bestaetigt", "bestätigt"].includes(s);
}
function _recIsYes(s) {
  const n = String(s || "").trim().toLowerCase().replace(/[.!?,]+$/g, "");
  return ["ja", "jap", "jo", "genau", "richtig", "stimmt", "passt", "korrekt",
    "ok", "okay", "jawohl", "genau so", "ja bitte", "ja genau"].includes(n);
}
async function _recPropose(clientId, info, opts = {}) {
  const mode = opts.mode === "dictation" ? "dictation" : "recording";
  const when = spokenApptWhen(info.apptStartMs);
  const who = info.patientName || "den Patienten";
  await setPendingRecording(clientId, {
    appointmentId: info.appointmentId, locationId: info.locationId,
    patientId: info.patientId || "", patientName: info.patientName || "",
    mode, forceTee: opts.forceTee === true,
  });
  return {
    ok: true, needsConfirm: true, appointmentId: info.appointmentId,
    patientName: info.patientName || "",
    message: mode === "dictation"
      ? `Diktat für ${who}${when} — richtig?`
      : `Aufnahme für ${who}${when} — richtig?`,
  };
}
async function _recBegin(clientId, info, by, opts = {}) {
  const mode = opts.mode === "dictation" ? "dictation" : "recording";
  const out = await startRecordingSession(clientId, {
    locationId: info.locationId, appointmentId: info.appointmentId,
    patientName: info.patientName, patientId: info.patientId, by,
    mode, forceTee: opts.forceTee === true,
  });
  if (out.ok) {
    await setActiveRecording(clientId, {
      appointmentId: info.appointmentId, locationId: info.locationId,
      patientId: info.patientId || "", patientName: info.patientName || "",
      startedAtMs: Date.now(), mode,
    });
    await clearPendingRecording(clientId);
  }
  return out;
}

router.post("/tools/start-treatment-recording", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const appointmentId = String(req.body?.appointmentId || "").trim();
    let patientId = String(req.body?.patientId || "").trim();
    let name = String(req.body?.lastName || req.body?.name || "").trim();
    const confirm = _recTruthy(req.body?.confirm) || _recIsYes(name);
    if (_recIsYes(name)) name = "";
    const operator = await getOperator(clientId).catch(() => null);
    const by = operator?.name || "Clara";

    // A) Termin explizit offen (Deep-Link) -> sofort starten, Name als Readback.
    if (appointmentId) {
      const info = await resolveAppointmentInfo(clientId, { appointmentId });
      if (!info?.ok) return res.json({ ok: false, message: info?.message || "Den Termin finde ich nicht." });
      return res.json(await _recBegin(clientId, info, by));
    }

    // B) Bestaetigung ("Ja") eines schwebenden Kandidaten. Ein schwebendes
    // DIKTAT wird als Diktat gestartet (mode/forceTee aus dem Pending-Eintrag).
    if (confirm && !name && !patientId) {
      const pend = await getPendingRecording(clientId);
      if (pend?.appointmentId && pend?.locationId) {
        return res.json(await _recBegin(clientId, {
          ok: true, appointmentId: pend.appointmentId, locationId: pend.locationId,
          patientId: pend.patientId || "", patientName: pend.patientName || "",
        }, by, { mode: pend.mode, forceTee: pend.forceTee }));
      }
      // kein schwebender Kandidat -> weiter zur Zeit-/Kontext-Aufloesung
    }

    // C) Name genannt (Erstauswahl ODER Korrektur "Nein, Herr Meier").
    if (name || patientId) {
      if (!patientId && name) {
        const r = await resolveSpokenPatientForRead(clientId, {
          rawName: name, hint: String(req.body?.hint || "").trim(),
          askWho: "Für welchen Patienten soll ich die Aufnahme starten? Bitte den Namen nennen.",
        });
        if (r.done) return res.json(r.payload);
        patientId = r.sel?.id || ""; name = r.sel?.lastName || name;
      }
      const info = await resolveAppointmentInfo(clientId, { patientId, lastName: name });
      if (!info?.ok) return res.json({ ok: false, message: info?.message || `Zu ${name || "dem Patienten"} finde ich heute keinen Termin.` });
      return res.json(await _recPropose(clientId, info));
    }

    // D) Nichts genannt: zuletzt gewaehlter Patient, sonst "wer sitzt im Stuhl?".
    const selPat = await getSelectedPatient(clientId).catch(() => null);
    if (selPat?.id) {
      const info = await resolveAppointmentInfo(clientId, { patientId: selPat.id, lastName: selPat.lastName || "" });
      if (info?.ok) return res.json(await _recPropose(clientId, info));
    }
    const day = await getDayAppointments(clientId, { date: todayBerlin() });
    if (day?.ok) {
      const pick = pickCurrentAppointment(day.appointments || [], Date.now());
      if (pick.appointment) {
        const a = pick.appointment;
        return res.json(await _recPropose(clientId, {
          ok: true, appointmentId: a.id, locationId: day.locationId,
          patientName: a.patientName, patientId: a.patientId,
          apptStartMs: a.startMs, motiveName: a.visitMotive,
        }));
      }
      if (pick.reason === "ambiguous") {
        return res.json({ ok: true, needsConfirm: true, message: "Es laufen gerade mehrere Behandlungen. Für welchen Patienten soll ich aufnehmen?" });
      }
    }
    return res.json({ ok: true, needsConfirm: true, message: "Für welchen Patienten soll ich die Aufnahme starten?" });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.post("/tools/stop-treatment-recording", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveRecording(clientId).catch(() => null);
    let appointmentId = String(req.body?.appointmentId || "").trim();
    let locationId = "";
    let patientName = "";
    if (appointmentId) {
      const info = await resolveAppointmentInfo(clientId, { appointmentId });
      if (info?.ok) { locationId = info.locationId; patientName = info.patientName; }
    } else if (active?.appointmentId && active?.locationId) {
      appointmentId = active.appointmentId;
      locationId = active.locationId;
      patientName = active.patientName || "";
    }
    if (!appointmentId || !locationId) {
      await clearPendingRecording(clientId).catch(() => {});
      return res.json({ ok: true, message: "Es läuft gerade keine Aufnahme." });
    }
    const out = await stopRecordingSession(clientId, { locationId, appointmentId, patientName, mode: active?.mode });
    await clearActiveRecording(clientId).catch(() => {});
    await clearPendingRecording(clientId).catch(() => {});
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Lena-Befund per Sprachbefehl (Clara-Modus → iPad Schema-Schritt) --------
// "Clara, Patient XY Befund aufnehmen" / "Befundaufnahme für Herrn XY":
// Patient NUR gegen die HEUTIGE Terminliste; bei eindeutigem Treffer liefert
// das Tool ``lenaOpenFindings`` — der Worker pusht LiveKit ``lena_open_findings``
// ans iPad (Termin wählen → Schema → bestehender Aufnahme-Start mit Tee).
// Kein Raten, kein Halluzinieren: mehrdeutig / nicht gefunden = sprechbare Frage.
router.post("/tools/start-findings-for-patient", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = String(req.body?.lastName || req.body?.name || "").trim();
    const hint = String(req.body?.hint || "").trim();
    const name = cleanSpokenPersonName(rawName) || rawName;
    if (!name) {
      // "nehmen wir die 01 auf" / "die 01" OHNE Namen (Chef 24.07.2026): kein
      // Nachfragen, sondern den aktuellen Stuhl-Termin oeffnen.
      // 1) zuletzt gewaehlter Patient, 2) laufende Aufnahme / Termin "jetzt".
      const day0 = await getDayAppointments(clientId, { date: todayBerlin() });
      let cur = null;
      const selPat0 = await getSelectedPatient(clientId).catch(() => null);
      if (selPat0?.id && day0?.ok) {
        cur = (day0.appointments || []).find(
          (a) => String(a.patientId || "") === String(selPat0.id),
        ) || null;
      }
      if (!cur && day0?.ok) {
        const active0 = await getActiveRecording(clientId).catch(() => null);
        const resv = resolveChairAppointment(
          active0, day0.appointments || [], Date.now(), day0.locationId || "",
        );
        if (resv?.ok && resv.appointmentId) {
          cur = (day0.appointments || []).find(
            (a) => String(a.id) === String(resv.appointmentId),
          ) || {
            id: resv.appointmentId, patientId: resv.patientId,
            patientName: resv.patientName, startMs: resv.startMs,
            locationId: resv.locationId,
          };
        } else if (resv?.reason === "ambiguous") {
          return res.json({
            ok: true,
            needsConfirm: true,
            message: "Es laufen gerade mehrere Behandlungen. Für welchen Patienten soll ich den Befund öffnen?",
          });
        }
      }
      const loc0 = String((day0 && day0.locationId) || (cur && cur.locationId) || "").trim();
      if (cur?.id && loc0) {
        const who0 = cur.patientName || "dem aktuellen Patienten";
        const when0 = spokenApptWhen(cur.startMs);
        return res.json({
          ok: true,
          appointmentId: cur.id,
          patientId: cur.patientId || "",
          patientName: who0,
          lenaOpenFindings: {
            appointmentId: cur.id,
            locationId: loc0,
            patientId: cur.patientId || "",
            patientName: who0,
          },
          message: `Ich öffne den Befund für ${who0}${when0}.`,
        });
      }
      return res.json({
        ok: true,
        needsConfirm: true,
        message: "Für welchen Patienten soll ich den Befund öffnen? Bitte den Namen nennen.",
      });
    }
    const day = await getDayAppointments(clientId, { date: todayBerlin() });
    if (!day?.ok) {
      return res.json({ ok: false, message: "Den Kalender kann ich gerade nicht lesen." });
    }
    const { matches, reason } = matchTodayAppointmentsByName(day.appointments || [], name, hint);
    if (reason === "none" || !matches.length) {
      return res.json({
        ok: false,
        message: `Zu ${name} finde ich heute keinen Termin. Für wen soll ich den Befund öffnen?`,
      });
    }
    if (reason === "ambiguous" || matches.length > 1) {
      const liste = matches.slice(0, 4).map((a) => {
        const who = a.patientName || a.patientLastName || "Patient";
        const when = spokenApptWhen(a.startMs) || "";
        return `${who}${when}`;
      }).join("; ");
      return res.json({
        ok: true,
        needsConfirm: true,
        message: `Es gibt mehrere passende Termine heute: ${liste}. Welchen meinen Sie?`,
      });
    }
    const a = matches[0];
    const who = a.patientName || a.patientLastName || name;
    const when = spokenApptWhen(a.startMs);
    const locationId = String(day.locationId || a.locationId || "").trim();
    if (!locationId || !a.id) {
      return res.json({ ok: false, message: `Den Termin von ${who} kann ich gerade nicht öffnen.` });
    }
    return res.json({
      ok: true,
      appointmentId: a.id,
      patientId: a.patientId || "",
      patientName: who,
      lenaOpenFindings: {
        appointmentId: a.id,
        locationId,
        patientId: a.patientId || "",
        patientName: who,
      },
      message: `Ich öffne den Befund für ${who}${when}.`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- W-LENA-7: Clara-Sprach-Diktat fuer Patient -----------------------------
// "Clara, nimm fuer Herrn XY bitte Doku auf" -> patienten-/termingebundenes
// Diktat. Gleiche halluzinationsfreie Bindung wie die Aufnahme; Clara quittiert
// ("Ich nehme jetzt Ihr Diktat fuer … auf, ich starte die Aufnahme") und tee't
// die Arzt-Stimme (forceTee) als Doku-Segmente in dictations + Shared Memory.
// "Clara, beende das Diktat" stoppt.
router.post("/tools/start-patient-dictation", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const appointmentId = String(req.body?.appointmentId || "").trim();
    let patientId = String(req.body?.patientId || "").trim();
    let name = String(req.body?.lastName || req.body?.name || "").trim();
    const confirm = _recTruthy(req.body?.confirm) || _recIsYes(name);
    if (_recIsYes(name)) name = "";
    const operator = await getOperator(clientId).catch(() => null);
    const by = operator?.name || "Clara";
    const dictOpts = { mode: "dictation", forceTee: true };

    // A) Termin explizit offen -> sofort starten, Name als Readback.
    if (appointmentId) {
      const info = await resolveAppointmentInfo(clientId, { appointmentId });
      if (!info?.ok) return res.json({ ok: false, message: info?.message || "Den Termin finde ich nicht." });
      return res.json(await _recBegin(clientId, info, by, dictOpts));
    }

    // B) Bestaetigung ("Ja") eines schwebenden Diktat-Kandidaten.
    if (confirm && !name && !patientId) {
      const pend = await getPendingRecording(clientId);
      if (pend?.appointmentId && pend?.locationId) {
        return res.json(await _recBegin(clientId, {
          ok: true, appointmentId: pend.appointmentId, locationId: pend.locationId,
          patientId: pend.patientId || "", patientName: pend.patientName || "",
        }, by, { mode: pend.mode || "dictation", forceTee: pend.forceTee !== false }));
      }
    }

    // C) Name genannt (Erstauswahl ODER Korrektur).
    if (name || patientId) {
      if (!patientId && name) {
        const r = await resolveSpokenPatientForRead(clientId, {
          rawName: name, hint: String(req.body?.hint || "").trim(),
          askWho: "Für welchen Patienten soll ich das Diktat aufnehmen? Bitte den Namen nennen.",
        });
        if (r.done) return res.json(r.payload);
        patientId = r.sel?.id || ""; name = r.sel?.lastName || name;
      }
      const info = await resolveAppointmentInfo(clientId, { patientId, lastName: name });
      if (!info?.ok) return res.json({ ok: false, message: info?.message || `Zu ${name || "dem Patienten"} finde ich heute keinen Termin.` });
      return res.json(await _recPropose(clientId, info, dictOpts));
    }

    // D) Nichts genannt: zuletzt gewaehlter Patient, sonst "wer sitzt im Stuhl?".
    const selPat = await getSelectedPatient(clientId).catch(() => null);
    if (selPat?.id) {
      const info = await resolveAppointmentInfo(clientId, { patientId: selPat.id, lastName: selPat.lastName || "" });
      if (info?.ok) return res.json(await _recPropose(clientId, info, dictOpts));
    }
    const day = await getDayAppointments(clientId, { date: todayBerlin() });
    if (day?.ok) {
      const pick = pickCurrentAppointment(day.appointments || [], Date.now());
      if (pick.appointment) {
        const a = pick.appointment;
        return res.json(await _recPropose(clientId, {
          ok: true, appointmentId: a.id, locationId: day.locationId,
          patientName: a.patientName, patientId: a.patientId,
          apptStartMs: a.startMs, motiveName: a.visitMotive,
        }, dictOpts));
      }
      if (pick.reason === "ambiguous") {
        return res.json({ ok: true, needsConfirm: true, message: "Es laufen gerade mehrere Behandlungen. Für welchen Patienten soll ich das Diktat aufnehmen?" });
      }
    }
    return res.json({ ok: true, needsConfirm: true, message: "Für welchen Patienten soll ich das Diktat aufnehmen?" });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.post("/tools/stop-patient-dictation", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveRecording(clientId).catch(() => null);
    let appointmentId = String(req.body?.appointmentId || "").trim();
    let locationId = "";
    let patientName = "";
    if (appointmentId) {
      const info = await resolveAppointmentInfo(clientId, { appointmentId });
      if (info?.ok) { locationId = info.locationId; patientName = info.patientName; }
    } else if (active?.appointmentId && active?.locationId) {
      appointmentId = active.appointmentId;
      locationId = active.locationId;
      patientName = active.patientName || "";
    }
    if (!appointmentId || !locationId) {
      await clearPendingRecording(clientId).catch(() => {});
      return res.json({ ok: true, message: "Es läuft gerade kein Diktat." });
    }
    const out = await stopRecordingSession(clientId, { locationId, appointmentId, patientName, mode: "dictation" });
    await clearActiveRecording(clientId).catch(() => {});
    await clearPendingRecording(clientId).catch(() => {});
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// 7f NACHTRAG ZU VERGANGENEM TERMIN: "Clara, ich moechte einen Nachtrag zu
// Frau Meier von vor drei Wochen machen." -> den passenden VERGANGENEN Termin
// aus dem echten Kalender finden, mit Datum + Behandlung zur BESTAETIGUNG
// vorschlagen; erst nach "Ja" beginnt das Diktat, gebunden an genau diesen
// alten Termin (Tee schreibt die Segmente dorthin). "Nein, vom 3. April" =
// Korrektur (neuer Zeitpunkt). So landet ein Nachtrag nie auf dem falschen
// Termin.
router.post("/tools/start-backdated-dictation", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let patientId = String(req.body?.patientId || "").trim();
    let name = String(req.body?.lastName || req.body?.name || "").trim();
    let firstName = "";
    const when = String(req.body?.when || "").trim();
    const date = String(req.body?.date || "").trim();
    const confirm = _recTruthy(req.body?.confirm) || _recIsYes(name);
    if (_recIsYes(name)) name = "";
    const operator = await getOperator(clientId).catch(() => null);
    const by = operator?.name || "Clara";

    // A) Bestaetigung ("Ja") des vorgeschlagenen vergangenen Termins.
    if (confirm && !name && !patientId && !when && !date) {
      const pend = await getPendingRecording(clientId);
      if (pend?.appointmentId && pend?.locationId) {
        const out = await _recBegin(clientId, {
          ok: true, appointmentId: pend.appointmentId, locationId: pend.locationId,
          patientId: pend.patientId || "", patientName: pend.patientName || "",
        }, by, { mode: pend.mode || "dictation", forceTee: pend.forceTee !== false });
        if (out.ok) {
          const wann = pend.dateLabel ? ` zum Termin vom ${pend.dateLabel}` : "";
          const wer = pend.patientName ? ` für ${pend.patientName}` : "";
          out.message = `Alles klar — ich nehme jetzt Ihren Nachtrag${wann}${wer} auf. Ich starte die Aufnahme.`;
        }
        return res.json(out);
      }
      return res.json({ ok: true, needsConfirm: true, message: "Zu welchem vergangenen Termin soll ich den Nachtrag aufnehmen? Bitte Patient und Zeitpunkt nennen." });
    }

    // B) Patient aufloesen (Name genannt ODER Kontext-Patient).
    if (!patientId && name) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: name, hint: String(req.body?.hint || "").trim(),
        askWho: "Für welchen Patienten soll ich den Nachtrag aufnehmen? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || ""; name = r.sel?.lastName || name; firstName = r.sel?.firstName || "";
    } else if (!patientId && !name) {
      const sel = await getSelectedPatient(clientId).catch(() => null);
      if (sel?.id) { patientId = sel.id; name = sel.lastName || ""; firstName = sel.firstName || ""; }
    }
    if (!patientId && !name) {
      return res.json({ ok: true, needsConfirm: true, message: "Für welchen Patienten und welchen vergangenen Termin soll ich den Nachtrag aufnehmen?" });
    }

    // C) Vergangenen Termin finden (relativer/absoluter Zeitpunkt) + vorschlagen.
    const found = await findBackdatedAppointment(clientId, { patientId, lastName: name, firstName, when, date });
    if (!found.ok) {
      const hint = (when || date) ? "" : " Von wann war die Behandlung — zum Beispiel vor drei Wochen oder ein konkretes Datum?";
      return res.json({ ok: false, message: `${found.message || "Ich finde den Termin nicht."}${hint}` });
    }
    await setPendingRecording(clientId, {
      appointmentId: found.appointmentId, locationId: found.locationId,
      patientId: found.patientId || "", patientName: found.patientName || "",
      mode: "dictation", forceTee: true, backdated: true, dateLabel: found.dateLabel,
    });
    const grund = found.motiveName ? `, ${found.motiveName}` : "";
    return res.json({
      ok: true, needsConfirm: true,
      appointmentId: found.appointmentId, patientName: found.patientName,
      message: `Nachtrag zu ${found.patientName}: Termin am ${found.dateLabel}${grund}. Richtig?`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// 7b VORLESEN: "Clara, lies vor, was schon steht" / "lies das letzte Diktat" /
// "fass die Doku zusammen". mode: full | last | summary.
router.post("/tools/read-treatment-dictation", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let patientId = "";
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    const appointmentId = String(req.body?.appointmentId || "").trim();
    const date = String(req.body?.date || "").trim();
    if (!appointmentId && lastName) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: lastName, hint: String(req.body?.hint || "").trim(),
        askWho: "Zu welchem Patienten soll ich die Dokumentation vorlesen? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || ""; lastName = r.sel?.lastName || lastName;
    } else if (!appointmentId && !lastName) {
      const sel = await getSelectedPatient(clientId).catch(() => null);
      if (sel?.id) { patientId = sel.id; lastName = sel.lastName || ""; }
    }
    const modeRaw = String(req.body?.mode || "full").trim().toLowerCase();
    const mode = ["full", "last", "summary"].includes(modeRaw) ? modeRaw : "full";
    const out = await readTreatmentDictation(clientId, { mode, appointmentId, patientId, lastName, date });
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// 7e SUCHE + PUSH: "Clara, wo habe ich bei Frau Meier die Wurzelbehandlung
// dokumentiert?" -> Fundstelle sprechen + auf den Monitor pushen.
router.post("/tools/find-in-treatment", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const query = String(req.body?.query || req.body?.text || "").trim();
    let patientId = "";
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    const appointmentId = String(req.body?.appointmentId || "").trim();
    const date = String(req.body?.date || "").trim();
    if (!appointmentId && lastName) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: lastName, hint: String(req.body?.hint || "").trim(),
        askWho: "Bei welchem Patienten soll ich in der Doku suchen? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || ""; lastName = r.sel?.lastName || lastName;
    } else if (!appointmentId && !lastName) {
      const sel = await getSelectedPatient(clientId).catch(() => null);
      if (sel?.id) { patientId = sel.id; lastName = sel.lastName || ""; }
    }
    const out = await findInTreatment(clientId, { query, appointmentId, patientId, lastName, date });
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// 7d LABEL-AUSKUNFT: "Clara, welche Behandlungen sind für Frau Meier geplant?"
// (Lesen des Sophie-Plans). Ergaenzen/Loeschen laeuft ueber Diktat/Streichen.
router.post("/tools/read-treatment-labels", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let patientId = "";
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    const appointmentId = String(req.body?.appointmentId || "").trim();
    const date = String(req.body?.date || "").trim();
    if (!appointmentId && lastName) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: lastName, hint: String(req.body?.hint || "").trim(),
        askWho: "Zu welchem Patienten soll ich die geplanten Behandlungen nennen? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || ""; lastName = r.sel?.lastName || lastName;
    } else if (!appointmentId && !lastName) {
      const sel = await getSelectedPatient(clientId).catch(() => null);
      if (sel?.id) { patientId = sel.id; lastName = sel.lastName || ""; }
    }
    const out = await readTreatmentLabels(clientId, { appointmentId, patientId, lastName, date });
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// 7d+ LABEL ANLEGEN: "Clara, plane fuer Frau Meier eine Fuellung an 35" ->
// gesprochene Behandlung serverseitig zu einem Sophie-Label machen (Konzept +
// Attribute, KEINE Ziffern) und additiv in den Sophie-Plan des Termins schreiben.
router.post("/tools/add-treatment-label", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const text = String(req.body?.behandlung || req.body?.text || req.body?.query || "").trim();
    let patientId = "";
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    const appointmentId = String(req.body?.appointmentId || "").trim();
    const date = String(req.body?.date || "").trim();
    if (!appointmentId && lastName) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: lastName, hint: String(req.body?.hint || "").trim(),
        askWho: "Für welchen Patienten soll ich die Behandlung planen? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || ""; lastName = r.sel?.lastName || lastName;
    } else if (!appointmentId && !lastName) {
      const sel = await getSelectedPatient(clientId).catch(() => null);
      if (sel?.id) { patientId = sel.id; lastName = sel.lastName || ""; }
    }
    const out = await addTreatmentLabel(clientId, { text, appointmentId, patientId, lastName, date });
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1d) BEHANDLUNGS-HISTORIE: "Was wurde bei Herrn Meier zuletzt gemacht?" ->
// echte vergangene Termine aus dem Kalender (Datum + Behandlungsart + Notiz),
// bevorzugt erledigte ("treated"). NICHT aus dem Gedaechtnis raten.
router.post("/tools/patient-treatments", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const r = await resolveSpokenPatientForRead(clientId, {
      rawName: String(req.body?.name || "").trim(),
      hint: String(req.body?.hint || "").trim(),
      askWho: "Zu welchem Patienten soll ich die letzten Behandlungen nachsehen? Bitte den Namen nennen.",
    });
    if (r.done) return res.json(r.payload);
    const sel = r.sel;
    const who = `${sel.firstName || ""} ${sel.lastName || ""}`.trim() || "der Patient";
    const result = await getPatientAppointments(clientId, { patientId: sel.id, firstName: sel.firstName, lastName: sel.lastName });
    // Bestehender Plan + tatsächlich DOKUMENTIERTE Behandlung (dictations/sophiePlan)
    // gehen vor der reinen Kalender-Historie (Terminart): der Chef will beim
    // Briefing auf Nachfrage die echten Details (Vorgabe 24.06.2026).
    let message;
    try {
      const docData = await readPatientTreatmentDocs(clientId, { patientId: sel.id, firstName: sel.firstName, lastName: sel.lastName });
      const spokenDocs = buildSpokenPatientDocs(docData, { who });
      if (spokenDocs) {
        // Plan/Doku vorhanden -> diese Details nennen, knapp um die Kalender-Historie ergänzt.
        message = spokenDocs;
      }
    } catch { /* Doku optional -> Kalender-Historie als Fallback */ }
    if (!message) message = buildSpokenTreatmentHistory(result, { who });
    return res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1e) ANAMNESE-AUFFAELLIGKEITEN (SignR): "Gibt es bei Frau Thrandorf etwas
// Auffaelliges in der Anamnese?" -> liest den Anamnesebogen (Allergien,
// Medikamente, Vorerkrankungen). Seit 04.07.2026 werden auch unterschriebene
// Boegen ausgewertet (PDF-Textebene); nur echte Scans bleiben "nicht lesbar".
router.post("/tools/anamnesis-flags", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const r = await resolveSpokenPatientForRead(clientId, {
      rawName: String(req.body?.name || "").trim(),
      hint: String(req.body?.hint || "").trim(),
      askWho: "Zu welchem Patienten soll ich die Anamnese prüfen? Bitte den Namen nennen.",
    });
    if (r.done) return res.json(r.payload);
    const sel = r.sel;
    const who = `${sel.firstName || ""} ${sel.lastName || ""}`.trim() || "der Patient";
    const result = await getPatientAnamnese(clientId, { patientId: sel.id });
    return res.json({ ok: true, message: buildSpokenAnamnese(result, { who }) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1e2) PATIENTEN-DOKUMENTE (Chef 29.07.2026): "Welche Dokumente hat Frau X
// unterschrieben?" -> ECHTE pdocuments lesen (Name, Status, Datum, Pflicht,
// abgelaufen) statt zu erfinden (Live-Halluzination 00:00 Uhr). Read-only,
// mit Karte aufs Handy/Monitor. Der PDF-INHALT wird hier NICHT gerendert
// (haengt am Plattform-pdfService) — es geht um die ehrliche Auflistung.
router.post("/tools/patient-documents", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const r = await resolveSpokenPatientForRead(clientId, {
      rawName: String(req.body?.name || "").trim(),
      hint: String(req.body?.hint || "").trim(),
      askWho: "Zu welchem Patienten soll ich die Dokumente prüfen? Bitte den Namen nennen.",
    });
    if (r.done) return res.json(r.payload);
    const sel = r.sel;
    const who = `${sel.firstName || ""} ${sel.lastName || ""}`.trim() || "der Patient";
    const result = await getPatientDocuments(clientId, { patientId: sel.id });
    const message = buildSpokenDocuments(result, { who });
    const card = result.ok ? karteDokumente({ who, docs: result.docs }) : null;
    return res.json({ ok: true, message, card });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1f) NÄCHSTE-2-PATIENTEN-BRIEFING: "Wer kommt als Nächstes?" / "Briefing für
// die nächsten zwei Patienten." -> pro anstehendem Patienten Terminart, geplante
// Notiz und — am wichtigsten — was beim letzten Termin war. Reine Lesefunktion
// aus dem Plattform-Kalender (read-only).
router.post("/tools/next-patients-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const calScope = await resolveDayCalendarScope(clientId, req.body);
    const count = Math.max(1, Math.min(5, Number(req.body?.count) || 2));
    const out = await buildNextPatientsBriefing(clientId, {
      date: (req.body?.date || "").trim() || todayBerlin(),
      calendarId: calScope.calendarId,
      count,
      patientName: (req.body?.patientName || req.body?.name || "").trim() || undefined,
      time: (req.body?.time || "").trim() || undefined,
    });
    // FreiSprech: Patienten-Heads-up natuerlich umformulieren (Guard sichert
    // Namen, Uhrzeiten, Anamnese-Zahlen; sonst deterministischer Text).
    if (out?.ok && out.message) {
      try { out.message = (await freiFormulieren(out.message, { kontext: "Heads-up zu den naechsten Patienten" })).text; } catch { /* deterministisch weiter */ }
    }
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1g) DOKUMENTATIONSDIKTAT (Clara → Lena): "Dokumentiere für Herrn Meier: ..."
// -> legt den diktierten Text als Segment unter dem Termin ab (dictations/*),
// genau dort, wo Lena-Seite und Termintab live mitlesen. KEIN Versand.
// GEMISCHTE MEMOS (04.07.2026): Aerzte diktieren Doku und Abrechnung in einem
// Atemzug. Der Endpunkt trennt das (trenneMemo): Klinisches -> Kartei,
// Abrechnungsanweisungen -> Abrechnungs-Arbeitsstand des Termins. BEIDE
// Spuren stellen ihre Rueckfragen in derselben Bestaetigung, und beide werden
// pro Memo aus dem Gesamtstand NEU berechnet — offene Fragen koennen nicht
// vergessen werden, sie kommen wieder, bis sie beantwortet sind.
router.post("/tools/save-treatment-dictation", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let appointmentId = String(req.body?.appointmentId || "").trim();
    let patientId = String(req.body?.patientId || "").trim();
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    // Datum, auf das dokumentiert werden soll (z.B. "dokumentiere für den Termin
    // am 25."). Ohne Datum faellt saveTreatmentDictation auf heute/naechsten Termin
    // zurueck — genau das fuehrte dazu, dass Doku faelschlich auf HEUTE landete.
    const date = String(req.body?.date || "").trim();
    // Wenn nur ein Name kam, Patient sauflösen (gleiche Logik wie die Lese-Tools).
    if (!appointmentId && !patientId && lastName) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: lastName,
        hint: String(req.body?.hint || "").trim(),
        askWho: "Für welchen Patienten soll ich das dokumentieren? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || "";
      lastName = r.sel?.lastName || lastName;
    }
    // Kein Termin, kein Patient, kein Name? -> auf den im Gespraech zuletzt
    // eindeutig gewaehlten Patienten zurueckfallen (gleiche Quelle wie bei
    // Anrufen: search_patient legt ihn in voice_state.selectedPatient ab). So
    // kann der Arzt erst "Patient Mueller" sagen und danach nur "dokumentiere ...".
    if (!appointmentId && !patientId && !lastName) {
      try {
        const sel = await getSelectedPatient(clientId);
        if (sel && sel.id) { patientId = sel.id; lastName = sel.lastName || ""; }
      } catch { /* kein aktiver Patient im Kontext */ }
    }

    const memoText = String(req.body?.text || "").trim();

    // Termin VOR dem Speichern aufloesen: die Memo-Trennung braucht die offene
    // Abrechnungsfrage dieses Termins (kurze Antworten wie "Faktor 3,5" muessen
    // der Abrechnung zugeordnet werden, nicht der Kartei).
    let apptInfo = null;
    try {
      apptInfo = await resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date });
    } catch { /* Aufloesung unten erneut ueber saveTreatmentDictation */ }
    const apptId = apptInfo?.ok ? apptInfo.appointmentId : "";
    const memoStand = apptId ? await getAbrechnungsMemo(clientId, apptId) : { lastFrage: "", hinweise: "" };

    // Memo trennen: Klinisches vs. pure Abrechnungsanweisungen.
    let teil = { dokuText: memoText, abrechnungText: "", methode: "aus" };
    try {
      teil = await trenneMemo(memoText, { offeneAbrechnungsFrage: memoStand.lastFrage || "" });
    } catch { /* im Zweifel alles Doku */ }

    // Abrechnungsanweisungen zum Termin merken (kumuliert, bis abgerechnet wird).
    if (apptId && teil.abrechnungText) {
      try {
        await appendAbrechnungsHinweis(clientId, apptId, { text: teil.abrechnungText, patientId, lastName });
      } catch (e) {
        log.warn("doku.abrechnung_memo_failed", { clientId, err: String(e?.message || e) });
      }
    }

    // Klinischen Teil als Diktat-Segment speichern (wie bisher). Ist das Memo
    // eine REINE Abrechnungsanweisung, wird nichts in die Kartei geschrieben.
    let out;
    if (teil.dokuText) {
      out = await saveTreatmentDictation(clientId, {
        text: teil.dokuText,
        appointmentId: apptId || appointmentId,
        patientId,
        lastName,
        date,
        lang: String(req.body?.lang || "de-DE").trim() || "de-DE",
      });
    } else if (apptId) {
      let combined = "";
      try {
        const segs = await readAppointmentSegments(clientId, apptInfo.locationId, apptId);
        combined = combineActiveSegments(segs);
      } catch { /* Sonde laeuft dann nur auf den Hinweisen */ }
      out = {
        ok: true,
        appointmentId: apptId,
        motiveName: apptInfo.motiveName || "",
        patientName: apptInfo.patientName || "",
        combinedText: combined,
        message: "Verstanden — das nehme ich für die Abrechnung auf.",
      };
    } else {
      out = { ok: false, message: "Zu welchem Termin gehört das? Ich konnte keinen passenden Termin finden." };
    }

    if (out?.ok) {
      out.memoTrennung = { methode: teil.methode, abrechnungErkannt: !!teil.abrechnungText };

      // BEIDE Pruefspuren parallel: Doku-Check auf dem KUMULIERTEN Klinik-Text
      // (nur wenn ein Segment gespeichert wurde) + stille Sophie-Sonde auf
      // Klinik-Text + Abrechnungs-Hinweisen. Best-effort: gespeichert ist
      // gespeichert — LLM-/CF-Probleme kosten nur die Rueckfragen.
      const dokuCheckLauf = out.dictationId
        ? specialtyKeyForClient(clientId)
            .then((sk) => pruefeDoku(clientId, sk, {
              motiveName: out.motiveName || "",
              text: out.combinedText || teil.dokuText,
              neuText: teil.dokuText,
            }))
            .catch((e) => { log.warn("doku.check_failed", { clientId, err: String(e?.message || e) }); return null; })
        : Promise.resolve(null);
      const sondeLauf = out.appointmentId
        ? pruefeAbrechnung(clientId, {
            appointmentId: out.appointmentId,
            klinischText: out.combinedText || teil.dokuText || "",
            explizit: !!teil.abrechnungText,
            patientId,
            lastName,
          }).catch((e) => { log.warn("doku.abrechnung_sonde_failed", { clientId, err: String(e?.message || e) }); return null; })
        : Promise.resolve(null);
      // Doku-Wächter: fehlt bei DEMSELBEN Patienten noch die Doku eines
      // juengeren Termins, sagt Clara das gleich mit ("Übrigens: ...").
      const lueckenLauf = (out.dictationId && (patientId || apptInfo?.patientId))
        ? findePatientenLuecken(clientId, {
            patientId: patientId || apptInfo?.patientId,
            lastName,
            excludeApptId: out.appointmentId,
          }).catch(() => [])
        : Promise.resolve([]);
      const [check, sonde, luecken] = await Promise.all([dokuCheckLauf, sondeLauf, lueckenLauf]);

      if (check) {
        const nachsatz = baueRueckfragenSatz(check);
        if (nachsatz) out.message = `${out.message} ${nachsatz}`.trim();
        out.dokuCheck = {
          dokuPflichtig: check.dokuPflichtig,
          regelId: check.regelId,
          fragen: check.fragen,
          lernVorschlag: check.lernVorschlag,
        };
      }
      if (sonde) {
        if (sonde.zeile) out.message = `${out.message} ${sonde.zeile}`.trim();
        out.abrechnung = { status: sonde.status, frage: sonde.frage, label: sonde.label };
      }
      if (luecken?.length) {
        const satz = sprichPatientenLuecken(luecken, out.patientName || lastName);
        if (satz) out.message = `${out.message} ${satz}`.trim();
        out.dokuLuecken = luecken.map((l) => ({ date: l.date, motive: l.motive }));
      }

      // Clara Overwatch (05.07.2026): passt der gebuchte Besuchsgrund zur
      // dokumentierten Behandlung? Bei klarem Mismatch (Kons-Besprechung
      // gebucht, Implantat dokumentiert) wird der Besuchsgrund des Termins
      // korrigiert — sonst landet der Patient im falschen Recall-Bucket.
      // Best-effort: gespeichert ist gespeichert.
      try {
        const ow = await pruefeUndKorrigiereBesuchsgrund(clientId, {
          appointmentId: out.appointmentId,
          locationId: out.locationId || apptInfo?.locationId || "",
          text: [out.combinedText || teil.dokuText || "", teil.abrechnungText || ""].filter(Boolean).join("\n"),
          streckenLabel: sonde?.status === "complete" ? (sonde.label || "") : "",
          basis: "doku",
        });
        if (ow?.spoken) out.message = `${out.message} ${ow.spoken}`.trim();
        if (ow && ow.status !== "skip" && ow.status !== "disabled") {
          out.motiveOverwatch = { status: ow.status, from: ow.from?.name, to: ow.to?.name, dominant: ow.dominant?.label };
          if (ow.status === "corrected" && ow.to?.name) out.motiveName = ow.to.name;
        }
      } catch (e) {
        log.warn("overwatch.hook_failed", { clientId, err: String(e?.message || e) });
      }

      // Doku-Memo-Karte fürs Handy: Notiz-Punkte + offene Fragen auf der
      // "geflippten Rückseite" während des Diktierens (Wunsch 04.07.2026).
      try {
        out.card = karteDoku({
          patientName: out.patientName || lastName,
          motiveName: out.motiveName || "",
          apptStartMs: out.apptStartMs || 0,
          combinedText: out.combinedText || teil.dokuText || "",
          fragen: check?.fragen || [],
          abrechnung: sonde ? { status: sonde.status, frage: sonde.frage, label: sonde.label } : null,
          luecken: luecken || [],
          lernVorschlag: check?.lernVorschlag || null,
        });
      } catch { /* Karte ist Komfort */ }

      // Karteikarte im Hintergrund neu strukturieren (treatment/main) — Claras
      // Antwort wartet NICHT darauf. Nur noetig, wenn ein Segment dazukam.
      if (out.dictationId) {
        setImmediate(() => {
          strukturiereKarteikarte(clientId, {
            locationId: out.locationId,
            appointmentId: out.appointmentId,
            combinedText: out.combinedText || teil.dokuText,
            motiveName: out.motiveName || "",
            segmentsCount: (out.combinedText || "").split("\n").filter(Boolean).length,
          }).then((r) => {
            if (!r.ok) log.warn("doku.autonote_failed", { clientId, reason: r.reason });
          }).catch((e) => log.warn("doku.autonote_failed", { clientId, err: String(e?.message || e) }));
        });
      }
    }
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1g5) OFFENE FRAGEN ("Was fehlt noch bei Herrn Meier?"): berechnet BEIDE
// Spuren aus dem Gesamtstand neu — Doku-Luecken (Pflichtfelder gegen alle
// aktiven Segmente) und Abrechnungs-Stand (Sophie-Sonde). Reine Auskunft:
// es wird nichts gespeichert und nichts gelernt.
router.post("/tools/doku-offen", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let patientId = String(req.body?.patientId || "").trim();
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    if (!patientId && lastName) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: lastName,
        hint: String(req.body?.hint || "").trim(),
        askWho: "Für welchen Patienten soll ich den Doku-Stand prüfen? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || "";
      lastName = r.sel?.lastName || lastName;
    }
    if (!patientId && !lastName) {
      try {
        const sel = await getSelectedPatient(clientId);
        if (sel && sel.id) { patientId = sel.id; lastName = sel.lastName || ""; }
      } catch { /* kein aktiver Patient */ }
    }
    const info = await resolveAppointmentInfo(clientId, {
      appointmentId: String(req.body?.appointmentId || "").trim(),
      patientId, lastName, date: String(req.body?.date || "").trim(),
    });
    if (!info.ok) return res.json(info);

    let combined = "";
    try {
      const segs = await readAppointmentSegments(clientId, info.locationId, info.appointmentId);
      combined = combineActiveSegments(segs);
    } catch { /* keine Segmente lesbar */ }

    const wer = info.patientName || lastName || "diesem Termin";
    const teile = [];
    let check = null;

    if (!combined) {
      teile.push(`Zu ${wer} ist noch nichts dokumentiert.`);
    } else {
      check = await pruefeDoku(clientId, await specialtyKeyForClient(clientId), {
        motiveName: info.motiveName || "",
        text: combined,
        lernen: false,
      }).catch(() => null);
      if (check && check.fragen?.length) {
        teile.push(`Zur Doku fehlt noch: ${check.fragen.map((f) => f.frage.replace(/\s+/g, " ").trim()).join(" ")}`);
      } else if (check) {
        teile.push("Die Doku wirkt vollständig.");
      } else {
        teile.push("Den Doku-Check konnte ich gerade nicht laufen lassen.");
      }
    }

    const sonde = await pruefeAbrechnung(clientId, {
      appointmentId: info.appointmentId,
      klinischText: combined,
      explizit: true,
      patientId,
      lastName,
    }).catch(() => null);
    if (sonde?.zeile) teile.push(sonde.zeile);

    // Doku-Status-Karte fürs Handy (gleiches Motiv wie beim Diktat).
    let card = null;
    try {
      card = karteDoku({
        patientName: info.patientName || lastName,
        motiveName: info.motiveName || "",
        apptStartMs: info.apptStartMs || 0,
        combinedText: combined,
        fragen: check?.fragen || [],
        abrechnung: sonde ? { status: sonde.status, frage: sonde.frage, label: sonde.label } : null,
      });
    } catch { /* Karte ist Komfort */ }

    return res.json({
      ok: true,
      appointmentId: info.appointmentId,
      motiveName: info.motiveName || "",
      abrechnung: sonde ? { status: sonde.status, frage: sonde.frage, label: sonde.label } : null,
      message: teile.join(" "),
      card,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1g6) DOKU-LÜCKEN PRAXISWEIT ("Welche Dokumentationen fehlen noch?"):
// scannt die letzten Tage nach vergangenen Patiententerminen OHNE
// Behandlungsdoku (weder aktives Diktat noch Karteikarte). Dieselbe Liste
// arbeitet der Abendlauf per aktivem Anruf ab. Reine Auskunft.
router.post("/tools/doku-luecken", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const tage = Number(req.body?.days) > 0 ? Math.min(Number(req.body.days), 30) : 7;
    const { ok, luecken } = await findePraxisLuecken(clientId, { tageZurueck: tage });
    if (!ok) return res.json({ ok: false, message: "Ich finde den Standort der Praxis nicht." });
    return res.json({
      ok: true,
      count: luecken.length,
      luecken: luecken.map((l) => ({ appointmentId: l.appointmentId, date: l.date, patientName: l.patientName, motive: l.motive })),
      message: sprichPraxisLuecken(luecken),
      card: karteLuecken(luecken),
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1g7) CLARA OVERWATCH — Besuchsgrund-Sweep (05.07.2026): prueft dokumentierte
// Termine der letzten Tage, ob der gebuchte Besuchsgrund zur DOKUMENTIERTEN
// Behandlung passt (Kons-Besprechung gebucht, Implantat dokumentiert -> Termin
// wird auf Implantat-OP umgestellt, damit der Recall-Bucket stimmt).
// body: { days?:number, dryRun?:boolean } — dryRun berichtet nur, schreibt nichts.
router.post("/tools/motive-overwatch", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const tage = Number(req.body?.days) > 0 ? Math.min(Number(req.body.days), 30) : 7;
    const dryRun = req.body?.dryRun === true;
    const { ok, ergebnisse } = await overwatchSweep(clientId, { tageZurueck: tage, dryRun });
    if (!ok) return res.json({ ok: false, message: "Ich finde den Standort der Praxis nicht." });
    return res.json({
      ok: true,
      count: ergebnisse.length,
      dryRun,
      ergebnisse,
      message: sprichSweep(ergebnisse),
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1g4) DOKU STREICHEN per Stimme: "Streich das letzte Diktat bei Herrn Meier" /
// "Das mit dem Roentgen war falsch, nimm das raus". § 630f BGB: Der Eintrag
// wird NICHT geloescht, sondern als gestrichen markiert (Frontend rendert
// durchgestrichen, der Urspruung bleibt erkennbar). Die Shared-Memory-Kopie
// wird entfernt, die Karteikarte im Hintergrund neu gebaut.
router.post("/tools/strike-treatment-dictation", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let appointmentId = String(req.body?.appointmentId || "").trim();
    let patientId = String(req.body?.patientId || "").trim();
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    const date = String(req.body?.date || "").trim();
    if (!appointmentId && !patientId && lastName) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: lastName,
        hint: String(req.body?.hint || "").trim(),
        askWho: "Bei welchem Patienten soll ich die Doku streichen? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || "";
      lastName = r.sel?.lastName || lastName;
    }
    if (!appointmentId && !patientId && !lastName) {
      try {
        const sel = await getSelectedPatient(clientId);
        if (sel && sel.id) { patientId = sel.id; lastName = sel.lastName || ""; }
      } catch { /* kein aktiver Patient im Kontext */ }
    }
    const out = await strikeTreatmentDictation(clientId, {
      appointmentId, patientId, lastName, date,
      dictationId: String(req.body?.dictationId || "").trim(),
      textHint: String(req.body?.textHint || "").trim(),
      reason: String(req.body?.reason || "").trim(),
    });
    if (out?.ok) {
      // Karteikarte ohne den gestrichenen Eintrag neu bauen (Hintergrund).
      setImmediate(() => {
        strukturiereKarteikarte(clientId, {
          locationId: out.locationId,
          appointmentId: out.appointmentId,
          combinedText: out.combinedText || "",
          motiveName: out.motiveName || "",
          segmentsCount: (out.combinedText || "").split("\n").filter(Boolean).length,
        }).then((r) => {
          if (!r.ok) log.warn("doku.autonote_failed", { clientId, reason: r.reason });
        }).catch((e) => log.warn("doku.autonote_failed", { clientId, err: String(e?.message || e) }));
      });
    }
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1g2) DOKU-PFLICHT-AUSKUNFT: "Was ist bei diesem Termin dokumentationspflichtig?"
// -> loest den Termin (Patient/Datum/Besuchsgrund) auf und liest die PFLICHT-
// Felder der effektiven Anforderungen (Basis-Katalog +/− Lern-Profil) vor.
router.post("/tools/doku-anforderungen", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let besuchsgrund = String(req.body?.besuchsgrund || "").trim();
    // Ohne expliziten Besuchsgrund: Termin des Patienten aufloesen (wie beim Diktat).
    if (!besuchsgrund) {
      let patientId = String(req.body?.patientId || "").trim();
      let lastName = String(req.body?.lastName || req.body?.name || "").trim();
      if (!patientId && lastName) {
        const r = await resolveSpokenPatientForRead(clientId, {
          rawName: lastName,
          hint: String(req.body?.hint || "").trim(),
          askWho: "Für welchen Patienten soll ich die Doku-Pflichten nennen? Bitte den Namen nennen.",
        });
        if (r.done) return res.json(r.payload);
        patientId = r.sel?.id || "";
        lastName = r.sel?.lastName || lastName;
      }
      if (!patientId && !lastName) {
        try {
          const sel = await getSelectedPatient(clientId);
          if (sel && sel.id) { patientId = sel.id; lastName = sel.lastName || ""; }
        } catch { /* kein aktiver Patient */ }
      }
      const probe = await resolveAppointmentInfo(clientId, {
        appointmentId: String(req.body?.appointmentId || "").trim(),
        patientId, lastName, date: String(req.body?.date || "").trim(),
      });
      if (!probe.ok) return res.json(probe);
      besuchsgrund = probe.motiveName || "";
    }
    const eff = await effektiveAnforderungen(clientId, await specialtyKeyForClient(clientId), besuchsgrund);
    if (!eff.dokuPflichtig) {
      return res.json({ ok: true, besuchsgrund, dokuPflichtig: false, message: `Für ${besuchsgrund || "diesen Termin"} ist keine Behandlungsdokumentation nötig — interner Termin.` });
    }
    const pflicht = eff.felder.filter((f) => f.pflicht).map((f) => f.frage.replace(/\?$/, ""));
    const basis = eff.umfang === "voll"
      ? "dazu wie immer Befund, Diagnose, Massnahme, Komplikationen und Procedere"
      : "dazu kurz Befund und Massnahme";
    const kern = pflicht.length
      ? `Dokumentationspflichtig sind hier: ${pflicht.join("; ")} — ${basis}.`
      : `Hier reicht die Standard-Doku: ${basis}.`;
    const aufkl = eff.regel?.eingriff ? " Es ist ein Eingriff — die Aufklärung muss vorliegen; die prüfe ich über die signierten Dokumente." : "";
    return res.json({
      ok: true, besuchsgrund, dokuPflichtig: true, regelId: eff.regelId,
      pflichtFelder: eff.felder.filter((f) => f.pflicht).map((f) => ({ key: f.key, frage: f.frage, gelernt: !!f.gelernt })),
      message: `${kern}${aufkl}`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1g3) DOKU-REGEL-KORREKTUR per Stimme: "Frag bei Zahnreinigung nicht mehr nach
// Röntgenbildern" / "Frag bei Füllungen künftig auch nach der Zahnfarbe".
// -> Lern-Profil der Praxis (mas_doku_lernprofil), wirkt SOFORT (Cache-
// Invalidierung im selben Prozess) und bleibt für die Zukunft gespeichert.
router.post("/tools/doku-regel", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await applyAnpassung(clientId, await specialtyKeyForClient(clientId), {
      aktion: String(req.body?.aktion || "").trim(),
      besuchsgrund: String(req.body?.besuchsgrund || "").trim(),
      feld: String(req.body?.feld || "").trim(),
      frage: String(req.body?.frage || "").trim(),
      pflicht: req.body?.pflicht !== false,
      original: String(req.body?.original || req.body?.text || "").trim(),
      by: "chef",
    });
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1h) BEHANDLUNGSPLAN-VERMERK (Clara → Sophie/Termin): "Erstelle für Frau
// Thrandorf einen Behandlungsplan für den Termin (am 25.)". -> vermerkt
// "Plan erstellt" in der Behandlungsdokumentation des Termins (dictations/*),
// exakt wie der Sophie-Plan-Button im Frontend. Termin wird ueber Patient +
// optionales Datum aufgeloest. KEIN Versand, keine Abrechnung.
router.post("/tools/plan-dokumentieren", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let appointmentId = String(req.body?.appointmentId || "").trim();
    let patientId = String(req.body?.patientId || "").trim();
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    const date = String(req.body?.date || "").trim();
    const grund = String(req.body?.grund || req.body?.titel || "").trim();
    if (!appointmentId && !patientId && lastName) {
      const r = await resolveSpokenPatientForRead(clientId, {
        rawName: lastName,
        hint: String(req.body?.hint || "").trim(),
        askWho: "Für welchen Patienten soll ich den Plan vermerken? Bitte den Namen nennen.",
      });
      if (r.done) return res.json(r.payload);
      patientId = r.sel?.id || "";
      lastName = r.sel?.lastName || lastName;
    }
    if (!appointmentId && !patientId && !lastName) {
      try {
        const sel = await getSelectedPatient(clientId);
        if (sel && sel.id) { patientId = sel.id; lastName = sel.lastName || ""; }
      } catch { /* kein aktiver Patient im Kontext */ }
    }
    const text = grund ? `Plan erstellt – ${grund}` : "Plan erstellt";
    const out = await saveTreatmentDictation(clientId, {
      text,
      appointmentId,
      patientId,
      lastName,
      date,
      lang: "de-DE",
    });
    if (out?.ok) out.message = "Erledigt — ich habe ‚Plan erstellt' in der Behandlungsdokumentation des Termins vermerkt.";
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1i) ABRECHNUNGSVORSCHLAG (Clara → Sophie): "Rechne den Termin ab",
// "Was kostet ein Implantat Regio 36 mit Knochenaufbau?". Ruft die Sophie-
// Engine (Cloud Function masSophieBilling) auf und gibt ENTWEDER die naechste
// Gegenfrage ODER die Endsummen (GOZ 2,3 / GOZ 3,5 / BEMA / BEMA+) zurueck.
// OHNE text (04.07.2026): "Rechne den Termin von Frau Meier ab" zieht die
// Grundlage automatisch aus der Termin-Doku (aktive Segmente) plus den beim
// Diktieren gemerkten Abrechnungs-Hinweisen (mas_abrechnung_memo) — der Chef
// muss nichts wiederholen. Persistenz nur, wenn ein Termin aufgeloest ist.
// KEIN Versand, keine verbindliche Abrechnung.
router.post("/tools/bill-treatment", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    let text = String(req.body?.text || "").trim();
    let appointmentId = String(req.body?.appointmentId || "").trim();
    let patientId = String(req.body?.patientId || "").trim();
    let lastName = String(req.body?.lastName || req.body?.name || "").trim();
    const streckeId = String(req.body?.streckeId || "").trim();
    const streckeIds = Array.isArray(req.body?.streckeIds) ? req.body.streckeIds : undefined;

    // Ohne Behandlungsbeschreibung: Doku + gemerkte Hinweise des Termins nutzen.
    if (!text && !streckeId && !(streckeIds && streckeIds.length)) {
      if (!appointmentId && !patientId && lastName) {
        const r = await resolveSpokenPatientForRead(clientId, {
          rawName: lastName,
          hint: String(req.body?.hint || "").trim(),
          askWho: "Für welchen Patienten soll ich abrechnen? Bitte den Namen nennen.",
        });
        if (r.done) return res.json(r.payload);
        patientId = r.sel?.id || "";
        lastName = r.sel?.lastName || lastName;
      }
      if (!appointmentId && !patientId && !lastName) {
        try {
          const sel = await getSelectedPatient(clientId);
          if (sel && sel.id) { patientId = sel.id; lastName = sel.lastName || ""; }
        } catch { /* kein aktiver Patient */ }
      }
      const info = await resolveAppointmentInfo(clientId, {
        appointmentId, patientId, lastName, date: String(req.body?.date || "").trim(),
      });
      if (info.ok) {
        appointmentId = info.appointmentId;
        try {
          const segs = await readAppointmentSegments(clientId, info.locationId, info.appointmentId);
          const klinisch = combineActiveSegments(segs);
          const memo = await getAbrechnungsMemo(clientId, info.appointmentId);
          text = [klinisch.slice(-1200), memo.hinweise].filter(Boolean).join(" ").trim();
        } catch { /* unten ehrliche Rueckfrage */ }
      }
      if (!text) {
        return res.json({ ok: false, message: "Zu diesem Termin ist noch nichts dokumentiert — beschreib mir kurz die Behandlung, die ich abrechnen soll." });
      }
    }

    // Slot-Fuellung (04.07.2026): Sophies Gegenfragen werden erst aus dem Text
    // selbst beantwortet (deterministisch + lokales LLM); nur was der Text
    // wirklich nicht hergibt, geht als Frage an den Chef.
    const out = await sophieMitSlotfill(clientId, {
      text,
      streckeId,
      streckeIds,
      slots: req.body?.slots && typeof req.body.slots === "object" ? req.body.slots : undefined,
      faktor: typeof req.body?.faktor === "number" ? req.body.faktor : undefined,
      bemaPunktwert: typeof req.body?.bemaPunktwert === "number" ? req.body.bemaPunktwert : undefined,
      appointmentId,
      patientId,
      lastName,
    });
    // Abrechnungs-Karte fürs Handy: Endsummen bzw. Sophies Gegenfrage. Nur hier
    // beim EXPLIZITEN Abrechnen — Briefings bleiben frei von Euro-Zahlen.
    try { out.card = karteSophie(out); } catch { /* Karte ist Komfort */ }

    // Clara Overwatch: die ABGERECHNETE Strecke ist die zweite unabhaengige
    // Quelle fuer "was wurde wirklich gemacht". Weicht sie vom gebuchten
    // Besuchsgrund ab (Implantat abgerechnet, Kons-Besprechung gebucht),
    // wird der Termin korrigiert — fuer den richtigen Recall-Bucket.
    if (out?.ok && out.status === "complete" && appointmentId) {
      try {
        const ow = await pruefeUndKorrigiereBesuchsgrund(clientId, {
          appointmentId,
          text,
          streckenLabel: String(out.label || ""),
          basis: "abrechnung",
        });
        if (ow?.spoken) out.message = `${out.message || ""} ${ow.spoken}`.trim();
        if (ow && ow.status !== "skip" && ow.status !== "disabled") {
          out.motiveOverwatch = { status: ow.status, from: ow.from?.name, to: ow.to?.name, dominant: ow.dominant?.label };
        }
      } catch (e) {
        log.warn("overwatch.billing_hook_failed", { clientId, err: String(e?.message || e) });
      }
    }
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 2) SPRACH-NOTIZ WIRD ZUM VORGANG: "Merk dir: Herr Fountas braucht eine neue
// Schiene." -> Notiz als Event ins Shared Memory + als (Vorgangs-)Case am
// Patienten, damit sie beim NAECHSTEN Termin von allein wieder hochkommt
// (buildSpokenMemoryHints liest aktive Cases der Tagespatienten vor).
router.post("/tools/remember-note", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = String(req.body?.name || "").trim();
    const note = String(req.body?.note || req.body?.text || "").trim();
    if (!note) return res.json({ ok: false, message: "Was genau soll ich mir merken?" });

    // Bei Mehrdeutigkeit muss das Modell die Notiz erneut mitschicken — sonst
    // ginge sie nach der Auswahl ("der erste") verloren.
    const reaskDirective = "Bei Rueckfrage erneut remember_note aufrufen: name = die gewaehlte Person (z.B. 'der erste'), note = DIESELBE Notiz wie eben.";

    // Patient bestimmen. Reihenfolge: Ordinal-Auswahl gegen gemerkte Kandidaten
    // ("der erste") -> kein Name + genau ein gemerkter -> Namenssuche.
    let sel = null;
    {
      const ordinalSource = rawName.toLowerCase();
      if (ordinalSource) {
        const remembered = await getPatientCandidates(clientId);
        const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
        if (byOrd) {
          sel = byOrd;
          await setPatientCandidates(clientId, [byOrd], byOrd);
        }
      }
    }
    if (!sel && !rawName) {
      const remembered = await getPatientCandidates(clientId);
      if (remembered.length === 1) sel = remembered[0];
      else if (remembered.length > 1) {
        await setPatientCandidates(clientId, remembered, null);
        return res.json({ ok: true, message: `Für wen soll ich die Notiz merken? ${disambiguationQuestion(remembered)}`, directive: reaskDirective });
      }
    }
    if (!sel && rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const found = await searchPatientSpoken(clientId, name);
      if (!found.ok) return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${found.error}` });
      let cands = found.patients || [];
      if (cands.length > 1) {
        const exact = narrowByExactName(name.toLowerCase(), cands);
        if (exact.length) cands = exact;
      }
      if (!cands.length) {
        return res.json({ ok: false, message: `Ich finde keinen Patienten namens ${name}, dem ich die Notiz anhängen kann.` });
      }
      if (cands.length > 1) {
        await setPatientCandidates(clientId, cands, null);
        return res.json({ ok: true, message: `Für wen soll ich die Notiz merken? ${disambiguationQuestion(cands)}`, directive: reaskDirective });
      }
      sel = cands[0];
      await setPatientCandidates(clientId, cands, sel);
    }
    if (!sel) return res.json({ ok: false, message: "Für welchen Patienten soll ich mir das merken? Bitte den Namen nennen." });

    const who = `${sel.firstName || ""} ${sel.lastName || ""}`.trim() || "den Patienten";
    const subject = {
      patientId: sel.id || null,
      name: who,
      matchStatus: sel.id ? "matched" : "unmatched",
      matchMethod: sel.id ? "name" : null,
    };
    // Als NOTE-Event ablegen (taucht im Zeitstrahl auf) und als Vorgang
    // verknuepfen (taucht beim naechsten Termin im Tages-Memory wieder auf).
    const { event } = await appendEvent(clientId, {
      channel: "clara_voice",
      type: "note",
      direction: "internal",
      counterparty: { kind: "system", name: "Clara", ref: null },
      subject,
      status: "none",
      summary: `Notiz von Ihnen: ${note}`,
      extractor: "clara@voice-note",
    });
    let caseId = null;
    try {
      const link = await linkEventToCase(clientId, event, { by: "Clara" });
      caseId = link?.caseId || null;
    } catch { /* Vorgang best-effort — die Notiz selbst ist schon gespeichert */ }

    // 11.08.2026 (Chef): Die Notiz gehoert zusaetzlich dorthin, wo beim
    // naechsten Mal ohnehin jeder hinschaut — ins Notizfeld des Termins.
    // Woertlich: "Wenn du das ins Notizfeld schreibst, hat das immer
    // Wiedervorlage-Effekt beim naechsten Mal." Vorhandene Eintraege der Praxis
    // bleiben stehen, die Notiz kommt in eine neue Zeile. Schlaegt das fehl,
    // ist die Notiz trotzdem sicher — sie liegt schon im Praxisgedaechtnis.
    let imTermin = null;
    try {
      imTermin = await notizInNaechstenTermin(clientId, {
        patientId: sel.id || "",
        firstName: sel.firstName || "",
        lastName: sel.lastName || "",
        notiz: note,
      });
    } catch (e) {
      log.warn("remember_note.termin_notiz_failed", { clientId, err: String(e?.message || e) });
    }

    let wo = "Ich bringe sie beim nächsten Termin von allein wieder hoch.";
    if (imTermin?.geschrieben) {
      const label = terminLabel(imTermin.termin?.startMs);
      wo = label
        ? `Sie steht ab sofort auch im Termin am ${label}.`
        : "Sie steht ab sofort auch im nächsten Termin.";
    } else if (imTermin?.grund === "schon_da") {
      wo = "Im nächsten Termin stand sie bereits.";
    } else if (imTermin?.grund === "kein_termin") {
      wo = "Ein nächster Termin steht noch nicht — sobald einer gebucht ist, kommt die Notiz von allein hoch.";
    }

    return res.json({
      ok: true,
      message: `Notiz zu ${who} gespeichert: ${note}. ${wo}`,
      caseId,
      imTermin: imTermin?.geschrieben ? { id: imTermin.termin?.id || "", startMs: imTermin.termin?.startMs || 0 } : null,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 3) VERZUGS-RETTER: "Ich bin 20 Minuten im Verzug." -> Lagebild der noch
// kommenden Termine, wie weit sie sich verschieben, plus Vorschlag — und das
// Ganze als PUSH aufs Handy (Chef-Wunsch: "als push nachricht!").
router.post("/tools/running-late", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const lateRaw = Number(req.body?.minutesLate ?? req.body?.minutes ?? 0);
    const minutesLate = Number.isFinite(lateRaw) ? Math.max(0, Math.min(240, Math.round(lateRaw))) : 0;

    const date = todayBerlin();
    const calScope = await resolveDayCalendarScope(clientId, req.body);
    const day = await getDayAppointments(clientId, { date, calendarId: calScope.calendarId });
    if (!day.ok) return res.json({ ok: false, message: "Ich kann den heutigen Tagesplan gerade nicht laden." });

    const nowMs = Date.now();
    const upcoming = (day.appointments || [])
      .filter((a) => !a.isAbsence && (a.startMs || 0) >= nowMs)
      .sort((a, b) => a.startMs - b.startMs);

    if (!upcoming.length) {
      const msg = "Für heute steht nichts mehr an — der Verzug holt Sie also nicht mehr ein.";
      return res.json({ ok: true, message: msg, pushed: false, affected: 0 });
    }

    const spokenPat = (a) => {
      const last = a.patientLastName || a.patientName || "";
      if (!last) return "ein Patient ohne Namen";
      if (a.patientGender === "f") return `Frau ${last}`;
      if (a.patientGender === "m") return `Herr ${last}`;
      return last;
    };
    const next = upcoming[0];
    const shiftedNext = spokenClockBerlin(next.startMs + minutesLate * 60000);
    const lateBit = minutesLate ? `Du bist ${minutesLate} Minuten im Verzug. ` : "";
    const headline = `${lateBit}Als Nächstes um ${spokenClockBerlin(next.startMs)} ${spokenPat(next)}` +
      (minutesLate ? `, das verschiebt sich auf etwa ${shiftedNext}` : "") + ".";
    const more = upcoming.length - 1;
    const moreBit = more > 0 ? ` Danach sind noch ${more} ${more === 1 ? "Termin" : "Termine"} betroffen.` : "";
    const proposal = ` Soll ich ${spokenPat(next)} eine SMS schicken, dass es ${minutesLate ? `etwa ${minutesLate} Minuten ` : ""}später wird?`;
    const message = `${headline}${moreBit}${proposal}`;

    // Lagebild als Push aufs gekoppelte Handy.
    let pushed = false;
    try {
      const op = await getOperator(clientId);
      if (op?.id) {
        const title = minutesLate ? `${minutesLate} Min im Verzug` : "Verzug im Tagesplan";
        const bodyLines = upcoming.slice(0, 4).map((a) =>
          `${clockHHMM(a.startMs)} ${spokenPat(a)}` +
          (minutesLate ? ` → ~${clockHHMM(a.startMs + minutesLate * 60000)}` : "")
        );
        const body = `${more + 1} Termine offen. ${bodyLines.join(" · ")}`;
        const url = `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/m/call.html`;
        const r = await notifyOperator(clientId, op.id, { title, body: body.slice(0, 300), url });
        pushed = !!(r && r.sent > 0);
      }
    } catch { /* Push best-effort — gesprochenes Lagebild bleibt */ }
    try { await emitCommand(clientId, { type: "navigate", date: day.date, calendarId: calScope.calendarId || null }); } catch { /* keine Live-Session */ }

    return res.json({
      ok: true,
      message: pushed ? `${message} (Das Lagebild liegt auch auf Ihrem Handy.)` : message,
      pushed,
      affected: upcoming.length,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Wo ist morgen Luft und wer passt rein?" — spoken gap briefing.
// Themen-Pflicht (Chef 28.07.2026): kurze Fachbereichsfrage — Prophylaxe,
// Kons oder ZE; Zusatz wie Implantat nur wenn Bestand. Keine Zahlen, keine
// Abkuerzungen (KCH/PRO). Erst die Antwort (thema) formt die Listen.
const RECALL_ALLE_THEMEN_RE = /\b(alle|alles|egal|gemischt|querbeet|komplett|s?aemtliche)(\s+themen?)?\b/i;

router.post("/tools/gap-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const demoOnly = req.body?.demoOnly === true || req.body?.demoOnly === "true";
    const thema = String(req.body?.thema || req.body?.bucket || "").trim();

    // Themen-Rueckfrage (nicht im Demo-Modus — dort bleibt der Ablauf starr):
    let bucketKey = null;
    if (!demoOnly) {
      // Lag-Fix (Chef 28.07.2026 "am schlimmsten ist der lag"): Fachbereichs-
      // Antworten ("Prophylaxe", "Kons", "ZE", "Implantat" inkl. Hoerfehler)
      // loesen die Regexe OHNE Bucket-Inventar auf — der Voll-Scan laeuft nur
      // noch fuer die Themen-FRAGE selbst oder fuer Fein-Bucket-Antworten.
      const alleThemen = thema && RECALL_ALLE_THEMEN_RE.test(thema);
      if (thema && !alleThemen) {
        bucketKey = resolveBucketKey([], thema);
      }
      if (!alleThemen && !bucketKey) {
        const fach = await listRecallFachbereiche(clientId).catch(() => ({ ok: false, kern: [], zusatz: [], buckets: [] }));
        const hatBestand = fach.ok && ((fach.kern?.length || 0) + (fach.zusatz?.length || 0) > 0);
        if (hatBestand) {
          if (!thema) {
            // NEUSTART-DOKTRIN (Chef 28.07. 21:40: "wurde der workflow nicht
            // vollstaendig durchgespielt und beendet, soll beim neuen anlauf
            // nicht die spur aufgenommen werden sondern komplett von vorne
            // begonnen werden — keine bereits fertige Kons-Liste anbieten,
            // alles vorherige verworfen"): Wartende, unkontaktierte Listen
            // werden verworfen — dann ANTWORT ZUERST (Chef 20:52) und die
            // frische Themenfrage.
            await discardWaitingLists(clientId, {
              reason: "neuer Anlauf — der Lücken-Workflow startet von vorne (Chef-Vorgabe 28.07.2026)",
            }).catch(() => 0);
            const { calendarId: scanCalId } = await resolveDayCalendarScope(clientId, req.body);
            const scan = await runGapFill(clientId, {
              date: req.body?.date,
              horizonDays: Number(req.body?.horizonDays) || 1,
              calendarId: scanCalId,
              scanOnly: true,
            }).catch(() => null);
            const antwort = scan ? spokenGapAnswer(scan) : "";
            const hatLuecken = !!scan?.gaps?.length;
            return res.json({
              ok: true,
              needsTheme: hatLuecken,
              fachbereiche: [...(fach.kern || []), ...(fach.zusatz || [])],
              // Ohne Luecke ist die Themenfrage sinnlos — nur die ehrliche Antwort.
              message: hatLuecken ? `${antwort} ${spokenFachbereichFrage(fach)}` : antwort,
              gaps: scan?.gaps?.length || 0,
            });
          }
          bucketKey = resolveBucketKey(fach.buckets || [], thema);
          if (!bucketKey) {
            return res.json({
              ok: true,
              needsTheme: true,
              fachbereiche: [...(fach.kern || []), ...(fach.zusatz || [])],
              message: `${spokenFachbereichFrage(fach)} Ich habe „${thema}" nicht erkannt.`,
            });
          }
        }
      }
    }
    // Themenwahl (auch "alle"): ebenfalls Neustart — Reste frueherer Anlaeufe
    // verwerfen; der Scan unten baut die Liste(n) dieses Anlaufs frisch und
    // upsertCallListCase eroeffnet auf demselben Fall eine neue Runde
    // (bucketExplicit), entfernte Kandidaten bleiben entfernt.
    if (!demoOnly && thema) {
      await discardWaitingLists(clientId, {
        reason: `neuer Anlauf mit Thema „${thema}" — frühere wartende Listen verworfen`,
      }).catch(() => 0);
    }

    // Wie day-briefing: ohne explizite Behandler-Angabe nur der Kalender des
    // angemeldeten Behandlers (sonst zaehlt Clara fremde/leere Kalender als frei).
    const { calendarId: gapCalId } = await resolveDayCalendarScope(clientId, req.body);
    const run = await runGapFill(clientId, {
      date: req.body?.date,
      horizonDays: Number(req.body?.horizonDays) || 1,
      demoOnly,
      calendarId: gapCalId,
      bucketKey,
      // Der Chef hat das Thema ausdruecklich gewaehlt (auch "alle Themen"):
      // eine bestehende themengebundene Liste wird dann umgeformt.
      bucketExplicit: !!thema,
    });
    const op = await getOperator(clientId);
    // Kandidaten DIREKT anzeigen (Chef 28.07.2026: "nicht explizit fragen ob
    // sie die Listen anzeigen soll, sondern direkt anzeigen"): Karten mit den
    // Kandidaten samt Kontakt-Zaehlern gehen als Zugabe mit — der Worker pusht
    // sie aufs Display, das LLM sieht davon nichts.
    let cards = [];
    if (!demoOnly && run.ok && run.callLists?.length) {
      try {
        cards = (await gapCandidateCardData(clientId, { date: req.body?.date }))
          .map((d) => karteRecallKandidaten(d));
      } catch { /* Karte ist Zugabe — Sprechtext traegt die Wahrheit */ }
    }
    // Thema wird EINGEWOBEN (kein "Recall-Thema X."-Stummel mehr) und der
    // Freigabe-Hinweis kommt aus dem Builder — keine doppelten Schluss-Saetze
    // (Wiederholungs-Ekel, Chef 28.07.2026).
    let message = buildSpokenGapBriefing(run, {
      // Nur der Nachname mit Titel (Live 20:52: TTS sprach "Michael" als
      // "Mikkel" — der Vorname gehoert nicht in die Anrede).
      operatorName: spokenAnrede(op?.name),
      themaLabel: run.ok ? run.bucketLabel : null,
      bucketKey: run.ok ? run.bucketKey : null,
      kandidatenAngezeigt: cards.length > 0,
    });
    if (demoOnly) message = `[Demo-Testlauf] ${message}`;
    res.json({ ok: true, message, card: cards[0] || null, cards, gaps: run.gaps?.length || 0, callLists: run.callLists?.length || 0, bucketKey: run.bucketKey || null, bucketLabel: run.bucketLabel || null });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// ============================================================================
// Recall-Coach — mündliche Freigabe, Status, Snooze, Initiative-Scan.
// Flow: Initiative (Push/Briefing) -> "Recall starten" (gap_briefing baut die
// Listen) -> "Recall freigeben" (approve + Lisa legt los, consent-gemischt
// SMS/Anruf) -> Sweep bucht Zusagen DIREKT fest -> "Wie läuft der Recall?"
// ============================================================================

// Voice: "Recall freigeben" — alle wartenden Listen (optional eines Tages)
// freigeben UND sofort ausführen. Die Freigabe wird mit Sprecher auditiert.
router.post("/tools/recall-approve", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    // Testsuite-Schutz: niemand wird kontaktiert, keine Liste freigegeben.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: "Testlauf: Die wartenden Anruflisten wären jetzt freigegeben worden. Es wurde niemand kontaktiert." });
    }
    const out = await approveAndExecute(clientId, {
      date: req.body?.date,
      caseId: req.body?.caseId,
      by: op?.name || "Team",
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Wie läuft der Recall?" — gesprochener Zwischenstand.
router.post("/tools/recall-status", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const message = await recallStatusSpoken(clientId, { date: req.body?.date });
    res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Heute nicht" — Initiative stummschalten (Anti-Nerv-Regel).
router.post("/tools/recall-snooze", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    res.json(await snoozeInitiative(clientId));
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Wer sind die Kandidaten?" / "Welche Patienten schlägst du vor?" —
// liest die KONKRETEN Namen der offenen Anruflisten vor. Vorher konnte Clara nur
// die Anzahl nennen; das beantwortet die Chef-Nachfrage "welche 5 denn?".
router.post("/tools/recall-candidates", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const message = await buildSpokenGapCandidates(clientId, { date: req.body?.date });
    // Kandidaten-Karten mit Kontakt-Zaehlern am Namen (Chef 28.07.2026):
    // hochgestellte Gesamtzahl + ✓-Erfolgszahl, eine Karte je Anrufliste.
    let cards = [];
    try {
      cards = (await gapCandidateCardData(clientId, { date: req.body?.date }))
        .map((d) => karteRecallKandidaten(d));
    } catch { /* Karte ist Zugabe — Sprechtext traegt die Wahrheit */ }
    res.json({ ok: true, message, card: cards[0] || null, cards });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice: "Entferne Tatjana Kruse von der Liste." (Chef 28.07.2026 — es gab
// kein Sprach-Tool zum Entfernen; das LLM griff zu gapfill_call_patient und
// las alle Kandidaten vor). Der Name kommt aus STT und darf verhoert sein
// ("Krose" -> Kruse): removeCandidateByName sucht tolerant ueber alle offenen
// Anruflisten. Antwort ist kurz und wird woertlich gesprochen.
router.post("/tools/recall-remove-candidate", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const gesagt = String(req.body?.patientName || "").trim();
    if (!gesagt) {
      return res.json({ ok: false, message: "Wen soll ich von der Liste nehmen? Bitte den Namen sagen." });
    }
    const out = await removeCandidateByName(clientId, { patientName: gesagt, by: op?.name || "Chef (Telefon)" });
    let message;
    if (out.ok) {
      message = out.listen > 1
        ? `${out.name} ist von allen ${out.listen} Anruflisten gestrichen.`
        : `${out.name} ist von der Liste gestrichen.`;
    } else if (out.reason === "ambiguous") {
      message = `Da passen mehrere: ${out.kandidaten.join(" oder ")} — wen meinen Sie?`;
    } else if (out.reason === "no_lists") {
      message = "Es gibt gerade keine offene Anrufliste.";
    } else {
      message = `${gesagt} finde ich auf keiner offenen Anrufliste.`;
    }
    // Frische Kandidaten-Karte mitschicken, damit der Monitor sofort stimmt.
    let cards = [];
    try {
      cards = (await gapCandidateCardData(clientId, {})).map((d) => karteRecallKandidaten(d));
    } catch { /* Karte ist Zugabe */ }
    res.json({ ok: out.ok, message, card: cards[0] || null, cards });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Wie instruierst du Lisa?" — Clara bespricht die Anruf-Ansage VOR der
// Freigabe mit dem Chef (Chef 28.07.2026: "zur absicherung den prompt mit mir
// besprechen … und ich habe eine chance das umzustellen").
router.post("/tools/recall-instruction-preview", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await recallInstructionPreview(clientId, { caseId: req.body?.caseId });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Sag Lisa zusätzlich, dass …" — diktierte Korrektur an Lisas Ansprache
// aufnehmen; sie wird als Vorrang-Block in jede Anruf-Instruktion eingewebt.
router.post("/tools/recall-instruction-adjust", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const out = await setRecallChefHinweis(clientId, {
      caseId: req.body?.caseId,
      hinweis: req.body?.hinweis,
      by: op?.name || "Chef (Telefon)",
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: gezieltes Einbestellen — Lisa ruft EINEN vom Chef genannten Patienten
// an und bietet eine konkrete Lücke an. Zwei Schritte: OHNE confirm liest Clara
// die vorbereitete Anweisung zur Bestätigung vor; MIT confirm löst sie den Anruf
// aus. Es wird NICHTS gebucht. Der Patient muss zuvor per search_patient
// feststehen (resolveDelegationTarget liest die gemerkte Nummer).
// Sprechbarer Vorschlag aus einem freien Slot, z. B. "Dienstag, 23. Juni um 10:30 Uhr".
function spokenSuggestion(s) {
  if (!s) return "";
  return `${dateDe(s.date)}${s.time ? ` um ${s.time} Uhr` : ""}`;
}

// Baut die Ablehnungs-Ansage, die Clara dem Chef vorliest, wenn der gewuenschte
// Einbestell-Termin im Kalender nicht frei ist (inkl. echter Alternativen +
// Override-Frage).
function buildInviteRejection(check, { date, time, calendarName }) {
  const cal = String(calendarName || "").trim() ? ` bei ${String(calendarName).trim()}` : "";
  let head;
  if (!check.daySlots || !check.daySlots.length) {
    head = `Im Kalender${cal} ist ${date ? `am ${dateDe(date)}` : "an dem Tag"} nichts mehr frei — da ist entweder schon zu oder ausgebucht.`;
  } else {
    const whenReq = `${date ? `am ${dateDe(date)}` : ""}${time ? ` um ${normTime(time)} Uhr` : ""}`.trim();
    head = `${whenReq ? whenReq.charAt(0).toUpperCase() + whenReq.slice(1) : "Zu der Zeit"}${cal} ist nichts frei.`;
  }
  const sugg = Array.isArray(check.suggestions) ? check.suggestions : [];
  const offer = sugg.length ? ` Frei wäre ${sugg.slice(0, 2).map(spokenSuggestion).join(" oder ")}.` : "";
  return `${head}${offer} Soll ich einen davon anbieten lassen — oder den Termin trotzdem zur Wunschzeit anbieten? Sag dann: trotzdem anbieten.`;
}


router.post("/tools/gapfill-call-patient", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const target = await resolveDelegationTarget(clientId, req.body);
    if (!target.phone) {
      return res.json({ ok: false, message: "Ich habe noch keinen Patienten. Sage zuerst: Suche den Patienten — und den Namen. Danach lasse ich Lisa anrufen." });
    }
    const date = String(req.body?.date || "").trim();
    const time = String(req.body?.time || req.body?.uhrzeit || "").trim();
    let message = String(req.body?.message || req.body?.saywhat || req.body?.instruction || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const calendarName = String(req.body?.calendarName || req.body?.doctorName || "").trim();
    const visitMotiveName = String(req.body?.visitMotiveName || req.body?.behandlung || "").trim();
    const override = req.body?.override === true || req.body?.override === "true";
    if (!time && !date) {
      return res.json({ ok: false, message: `Für wann soll Lisa ${target.name || "dem Patienten"} den Termin anbieten? Sag mir Tag und Uhrzeit.` });
    }
    // W-OUTREACH: Ohne diktierte Botschaft baut Clara selbst eine motiv-
    // spezifische Kernbotschaft aus dem zentralen Vorlagen-Katalog (der Chef
    // hört sie im Bestätigungs-Readback und kann sie ändern). Nur wenn auch
    // kein Besuchsgrund da ist, fragt Clara nach.
    if (!message && visitMotiveName) {
      const outreach = await outreachForClient(clientId, visitMotiveName).catch(() => null);
      message = buildAutoInviteMessage({ visitMotiveName, outreach: outreach || undefined });
    }
    if (!message) {
      return res.json({ ok: false, message: `Was genau soll Lisa ${target.name || "dem Patienten"} am Telefon sagen? Zum Beispiel der Grund für den Anruf — oder nenne mir die Behandlung, dann formuliere ich es.` });
    }

    // Vorab-Verifikation gegen den ECHTEN Kalender (Sprechzeiten + Belegung):
    // Clara darf KEINEN Termin anbieten lassen, den es gar nicht gibt (Vorfall
    // 16.06.2026: Lisa bot "heute 16:30" an, obwohl die Praxis zu war). STRENG:
    // die genannte Uhrzeit muss frei sein. override=true (Chef sagt ausdruecklich
    // "trotzdem anbieten") ueberspringt die Pruefung bewusst.
    if (!override) {
      const check = await checkInviteSlot(clientId, { doctorName: calendarName, visitMotiveName, date, time });
      if (!check.verified) {
        if (check.reason === "no_motive") {
          return res.json({ ok: false, needsMotive: true, message: `Für welche Behandlung soll der Termin sein — zum Beispiel eine Kontrolle oder eine professionelle Zahnreinigung? Das brauche ich, um die Verfügbarkeit im Kalender zu prüfen.` });
        }
        return res.json({ ok: false, needsOverride: true, message: `Ich konnte die Verfügbarkeit${calendarName ? ` bei ${calendarName}` : ""} gerade nicht prüfen. Soll ich es trotzdem anbieten lassen? Sag dann: trotzdem anbieten.` });
      }
      if (!check.available) {
        return res.json({ ok: false, needsOverride: true, suggestions: check.suggestions, message: buildInviteRejection(check, { date, time, calendarName }) });
      }
    }

    let booking = null;
    try { booking = await loadBooking(clientId); } catch { /* optional */ }
    const practiceName = booking?.practiceName || "";

    // W-OUTREACH-2: Kalender-Kontext für Lisas Live-Buchung (book_slot/
    // offer_slots). Nur möglich, wenn der Patient per Suche feststeht (ID!)
    // und Kalender + Besuchsgrund auflösbar sind — sonst läuft der Anruf wie
    // bisher ohne Buchungswerkzeuge (Praxis meldet sich).
    let bookingContext = null;
    const liveBooking = liveBookingConfigured();
    if (liveBooking && booking) {
      const sel = await getSelectedPatient(clientId).catch(() => null);
      const selPhone = String(sel?.mobilePhoneNumber || "").trim();
      const samePatient = sel?.id && (!req.body?.phone || selPhone === target.phone);
      const cal = resolveCalendar(booking, calendarName) ||
        (booking.calendars || []).find((x) => x.id === String(booking.defaultCalendarId || "")) || null;
      const vms = Array.isArray(booking.visitMotives) ? booking.visitMotives : [];
      const q = visitMotiveName.toLowerCase();
      const vm = q ? (vms.find((v) => String(v.name || "").toLowerCase() === q) ||
        vms.find((v) => String(v.name || "").toLowerCase().includes(q) || q.includes(String(v.name || "").toLowerCase()))) : null;
      if (samePatient && cal?.id && vm?.id && date) {
        bookingContext = {
          kind: "invite",
          patientId: String(sel.id),
          patientName: target.name || `${sel.firstName || ""} ${sel.lastName || ""}`.trim(),
          visitMotiveId: vm.id,
          visitMotiveName: vm.name || null,
          calendarId: cal.id,
          calendarName: cal.name || null,
          slotIso: time ? ensureBerlinTz(`${date}T${normTime(time)}:00`) : null,
        };
      }
    }

    const instruction = composeInviteInstruction({
      patientName: target.name, practiceName, date, time, calendarName, reason, message,
      liveBooking: !!bookingContext,
    });

    const confirm = req.body?.confirm === true || req.body?.confirm === "true";
    if (!confirm) {
      const readback = inviteReadback({ patientName: target.name, date, time, calendarName, message, liveBooking: !!bookingContext });
      return res.json({ ok: true, needsConfirm: true, message: override ? `Achtung, Ausnahmetermin außerhalb der regulären Verfügbarkeit. ${readback}` : readback });
    }
    // Testsuite-Schutz: kompletter Pfad, aber NIEMAND wird angerufen.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: `Testlauf: Lisa hätte jetzt ${target.name || target.phone} angerufen und den Termin angeboten.` });
    }
    const out = await lisaStartCall(clientId, {
      phone: target.phone,
      instruction,
      contactName: target.name,
      callLanguage: req.body?.callLanguage,
      by: op?.name || "Team",
      bookingContext,
    });
    // Kontakt-Zaehler (Chef 28.07.2026): auch das gezielte Einbestellen zaehlt
    // als Kontaktversuch — sofern der Patient per Suche feststeht (ID).
    if (out.ok !== false && bookingContext?.patientId) {
      recordContact(clientId, {
        patientId: bookingContext.patientId,
        name: bookingContext.patientName,
        channel: "call",
      }).catch(() => {});
    }
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Nächsten Freitag bin ich nicht da" / "Morgen zwischen 15 und 17 Uhr
// bin ich weg" / "Sperr heute ab 10 Uhr die Buchungen" — Abwesenheit PLANEN.
// Mit startTime/endTime wird nur das Zeitfenster gesperrt; sind KEINE Termine
// betroffen, trägt planAbsence den Sperrblock sofort ein (nichts abzusagen).
// Sonst: Auftrag als Case, Ausführung erst nach Freigabe (approval-first).
router.post("/tools/plan-absence", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = String(req.body?.date || "").trim();
    const calScope = await resolveDayCalendarScope(clientId, req.body);
    if (!calScope.calendarId) {
      return res.json({ ok: false, message: "Für welchen Behandler soll ich die Abwesenheit eintragen? Bitte den Namen nennen." });
    }
    const booking = await loadBooking(clientId).catch(() => null);
    const calName = (booking?.calendars || []).find((x) => x.id === calScope.calendarId)?.name || "";
    const op = await getOperator(clientId);
    const out = await planAbsence(clientId, {
      date,
      startTime: req.body?.startTime,
      endTime: req.body?.endTime,
      calendarId: calScope.calendarId,
      calendarName: calName,
      by: op?.name || "Operator",
      operatorDoctorName: operatorDoctorNameOf(op),
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Abwesenheit freigeben" — Tag sperren, Termine stornieren, Absagen
// verschicken (SMS/Anruf via Lisa, E-Mail via Nadine — je Patient EIN Kanal).
router.post("/tools/absence-approve", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const out = await approveAbsence(clientId, {
      date: req.body?.date,
      caseId: req.body?.caseId,
      by: op?.name || "Operator",
      dryRun: req.body?.dryRun === true,
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Waren heute Anrufe für mich da?" — ehrliches Anruf-Protokoll aus dem
// Praxisgedächtnis (eingehend via Bianca, ausgehend via Lisa). Verhindert die
// beobachtete Halluzination "es gab keine Anrufe" ohne Daten-Check.
router.post("/tools/call-log", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const message = await spokenCallLog(clientId, { date: req.body?.date });
    res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Was ist heute reingekommen?" — EIN kombinierter Digest der
// eingehenden Kommunikation (Anrufe, E-Mails, Briefe, Empfang), mit kurzem
// Inhalt je Eingang. Ergaenzt call_log (nur Telefon) und read_email (eine Mail).
router.post("/tools/comms-digest", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const { day, events } = await dayInboundComms(clientId, { date: req.body?.date });
    let message = await buildSpokenComms(events, { day });
    // W-UMBAU-2 Werkzeug 2 (28.07.2026): Kommunikationsbericht lebendig
    // erzaehlen statt Zeilen-Schema. Fakten-Guard sichert Anzahlen, Namen und
    // Uhrzeiten (inkl. Handelnden-Wache); bei Zweifel bleibt der
    // deterministische Text. Die Karte behaelt den woertlichen Inhalt.
    try {
      message = (await freiFormulieren(message, {
        kontext: "Bericht ueber die heutigen Eingaenge (Anrufe, E-Mails, Briefe, Empfang)",
      })).text;
    } catch { /* deterministisch weiter */ }
    // W-FLIP-TIEFE (WP8): additive Eingaenge-Karte (Flip + vertiefbares detail).
    let card;
    try { card = cardInboundComms(events, { day }); } catch { /* Karte ist Komfort */ }
    res.json(card ? { ok: true, message, card } : { ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// W-STABIL-8 Wiedervorlage (Verkaufskern 24/25): "Welche Fristen sind offen?" /
// "Gibt es offene Rechnungen?" — EIN Waechter ueber Mail, gescannte Post und
// Telefonate. Gesprochen werden Absender/Sache/Frist; Betraege stehen NUR auf
// der Karte (Chef-Regel: keine Euro-Betraege in gesprochenen Briefings).
router.post("/tools/wiedervorlage", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const liste = await buildWiedervorlage(clientId);
    // Optional eingrenzen: { nur: "rechnungen" | "fristen" }
    const nur = String(req.body?.nur || "").toLowerCase();
    if (nur.startsWith("rechnung")) liste.items = liste.items.filter((i) => i.rechnung);
    else if (nur.startsWith("frist")) liste.items = liste.items.filter((i) => i.deadlineMs);
    let message = spokenWiedervorlage(liste);
    // W-UMBAU-2 Werkzeug 3 (28.07.2026): Der BERICHT wird lebendig erzaehlt
    // (FreiSprech: LLM formuliert, Fakten-Guard sichert Zahlen/Daten und blockt
    // dazuerfundene Euro-Betraege). Die ABHAK-ANLEITUNG dahinter ist ein
    // Sprachbefehl und bleibt WOERTLICH — sonst lernt der Chef den falschen
    // Satz. Die ABSENDER gehen als Pflichtwoerter mit (namenOk im Guard sieht
    // nur Namen mit Anrede — "Finanzamt Bochum" waere sonst ungeschuetzt).
    // Die Karte behaelt immer den woertlichen Inhalt (Pruefpunkt Handy).
    try {
      const anleitung = message.endsWith(ABHAK_ANLEITUNG);
      const bericht = anleitung
        ? message.slice(0, message.length - ABHAK_ANLEITUNG.length).trimEnd()
        : message;
      const frei = await freiFormulieren(bericht, {
        kontext: "Bericht ueber offene Fristen und Rechnungssachen auf der Wiedervorlage (ohne Geldbetraege)",
        pflicht: liste.items.slice(0, 4).map((i) => i.wer).filter((w) => w && w !== "Unbekannt"),
      });
      if (frei.ok) {
        message = anleitung ? `${frei.text} ${ABHAK_ANLEITUNG}` : frei.text;
      }
    } catch { /* deterministisch weiter */ }
    let card;
    try { card = karteWiedervorlage({ items: liste.items, euro: formatEuro }); } catch { /* Karte ist Komfort */ }
    res.json(card ? { ok: true, message, card } : { ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Sprach-Quittung: "Die Sache mit Meier ist erledigt." Eindeutigkeit Pflicht —
// bei mehreren Treffern fragt Clara zurueck statt zu raten.
router.post("/tools/wiedervorlage-erledigt", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await resolveWiedervorlage(clientId, {
      wer: req.body?.wer || req.body?.who || "",
      actor: req.body?.actor || "Chef (Sprache)",
    });
    res.json({ ok: out.ok, message: out.message, reason: out.reason || undefined });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice: "Wie steht es um die Abwesenheit?" — gesprochener Zwischenstand
// (informiert/neu gebucht/offen).
router.post("/tools/absence-status", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    res.json({ ok: true, message: await absenceStatusSpoken(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Merk dir fürs Team: …" — ein Memo ins Praxisgedächtnis. Landet als
// offenes Brain-Event (sichtbar im Monitor) und ist damit für Nadine/Lisa/
// Team-Briefings abrufbar.
router.post("/tools/team-memo", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const text = String(req.body?.text || "").trim();
    if (!text) return res.json({ ok: false, message: "Was soll ich mir für das Team merken?" });
    const op = await getOperator(clientId);
    const who = op?.name || "Operator";

    // 14.06.2026: Memo als auffindbaren VORGANG ins Praxisgedaechtnis statt als
    // flaches Event. Frueher schrieb team_memo nur ein mas_event — das taucht
    // aber weder in read_briefing (liest NUR Vorgaenge) noch via find_case auf,
    // d.h. Clara fand ihre eigenen Memos nicht wieder. Als Vorgang ist es jetzt
    // im Briefing, in den offenen Aufgaben UND (bei Patientenbezug) via find_case
    // ueber den Namen abrufbar — gleiche Mechanik wie create_task.
    const subjectName = String(req.body?.patientName || req.body?.name || req.body?.subject || "").trim();
    let subject = { name: subjectName, matchStatus: subjectName ? "unmatched" : "n/a", matchMethod: null };
    if (subjectName) {
      const s = await resolvePatientSubject(clientId, subjectName).catch(() => null);
      if (s?.patientId) subject = { patientId: s.patientId, name: s.name || subjectName, matchStatus: "matched", matchMethod: s.matchMethod || "name" };
    }
    const c = await createCase(clientId, {
      subject,
      topic: "other",
      title: `Memo: ${text.slice(0, 84)}`,
      createdBy: `${who} (Memo)`,
      status: "open",
      updates: [{ by: who, kind: "note", text }],
    });
    const findHint = subjectName ? ` Sie finden es unter ${subject.name}.` : "";
    res.json({ ok: true, caseId: c.id, message: `Notiert — das Memo steht als Vorgang im Praxisgedächtnis und ist fürs ganze Team sichtbar.${findHint}` });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Inbound phone AI: who is calling and WHY did we contact them? Matches the
// caller id against open Gesprächsauftrag cases + recent outbound events and
// returns a compact spoken context block. The static inbound prompt never
// changes — the knowledge comes from the shared brain at call time.
router.post("/tools/lookup-caller", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await lookupCaller(clientId, { phone: req.body?.phone || req.body?.number, name: req.body?.name });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/tools/find-case", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = (req.body?.name || req.body?.query || "").trim();
    const topic = (req.body?.topic || "").trim().toLowerCase();
    if (!rawName) return res.json({ ok: false, message: "Zu welchem Patienten ist der Vorgang?" });

    // Cross-Call-Gedaechtnis: "der Vorgang von vorhin / worueber sprachen wir
    // zuletzt" — an den zuletzt geoeffneten Vorgang anknuepfen, statt ihn als
    // Patientennamen zu suchen (was ins Leere liefe). Nur bei echter Anschluss-
    // Phrase ohne verwertbaren Namen und frischem lastContext.
    if (isContinuityReference(rawName) && !(cleanSpokenPersonName(rawName) || "").trim()) {
      const lc = freshLastContext(await getLastContext(clientId));
      if (lc?.case?.id) {
        await setActiveCase(clientId, lc.case);
        let context = "";
        try { context = (await getCaseContext(clientId, lc.case.id))?.contextText || ""; } catch { /* Komfort */ }
        return res.json({ ok: true, message: `Ich knuepfe an den vorigen Vorgang an: ${caseSpoken(lc.case)}`, context });
      }
    }

    const name = cleanSpokenPersonName(rawName) || rawName;

    // 1) Regulärer Weg: Patient in der DB finden, Vorgänge über die Patient-ID.
    let cases = [];
    let displayName = name;
    const found = await searchPatientSpoken(clientId, name);
    const patients = found.ok ? found.patients || [] : [];
    if (patients.length > 1) {
      const list = patients.slice(0, 4).map((p) => `${p.firstName} ${p.lastName}`).join(", ");
      return res.json({ ok: true, message: `Mehrere Patienten: ${list}. Welcher genau?` });
    }
    if (patients.length === 1) {
      const p = patients[0];
      displayName = `${p.firstName} ${p.lastName}`.trim();
      cases = await listCases(clientId, { patientId: p.id, activeOnly: true });
    }

    // 2) Fallback: kein (eindeutiger) Patient ODER keine verknüpften Vorgänge ->
    //    direkt in den offenen Vorgängen nach dem Betreff-Namen suchen. Deckt
    //    E-Mail-Absender ohne Patientendatensatz und Match-Lücken ab.
    if (cases.length === 0) {
      const all = await listCases(clientId, { activeOnly: true, limit: 200 });
      cases = all.filter((c) => nameMatchesCaseSubject(c, name));
      if (cases.length && cases[0].subject?.name) displayName = cases[0].subject.name;
    }

    if (cases.length === 0) {
      await clearActiveCase(clientId);
      return res.json({ ok: true, message: `Zu ${displayName} finde ich weder einen Patienten noch einen offenen Vorgang.` });
    }

    // Themenfilter darf nie in eine Sackgasse führen: passt das Thema nicht,
    // nimm trotzdem die gefundenen Vorgänge (das Modell rät Topics oft falsch).
    if (topic) {
      const filtered = cases.filter((c) => c.topic === topic);
      if (filtered.length) cases = filtered;
    }

    const c = cases[0];
    await setActiveCase(clientId, c);

    // Vollständigen Vorgangs-Kontext (inkl. E-Mail-Zusammenfassungen aus dem
    // Verlauf) mitliefern, damit Nachfragen wie "Was steht in der E-Mail?"
    // direkt aus dem Tool-Ergebnis beantwortet werden können.
    let context = "";
    try {
      const ctx = await getCaseContext(clientId, c.id);
      context = ctx?.contextText || "";
    } catch { /* Kontext ist Komfort, nie ein Blocker */ }

    if (cases.length > 1) {
      const topics = cases.map((x) => CASE_TOPIC_LABELS[x.topic] || x.topic).join(", ");
      return res.json({
        ok: true,
        message: `Es gibt mehrere offene Vorgänge (${topics}). Ich habe den neuesten geöffnet: ${caseSpoken(c)} Sage ein Thema, um zu wechseln.`,
        context,
      });
    }
    return res.json({ ok: true, message: caseSpoken(c), context });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/tools/assign-case", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveCase(clientId);
    if (!active?.id) return res.json({ ok: false, message: "Welcher Vorgang? Bitte zuerst den Patienten nennen." });
    const assignee = normalizeAssignee(req.body?.assignee);
    const instruction = (req.body?.instruction || req.body?.text || "").trim();
    const op = await getOperator(clientId);
    const out = await assignCase(clientId, active.id, { assignee, instruction, by: op?.name || "Clara" });
    if (!out.ok) return res.json({ ok: false, message: `Delegieren nicht möglich: ${out.reason}` });

    // Delegated to Nadine -> auto-prepare an approval-ready draft (background, so
    // Clara answers immediately and the human approves it later in Nadine).
    let prepNote = "";
    if (String(assignee || "").toLowerCase() === "nadine") {
      prepNote = " Nadine bereitet einen Entwurf zur Freigabe vor.";
      prepareCaseDraft(clientId, active.id, { by: "Nadine" }).catch(() => { /* best-effort */ });
    }
    const who = active.subject?.name ? ` für ${active.subject.name}` : "";
    return res.json({
      ok: true,
      message: `Erledigt. ${assignee} übernimmt den Vorgang${who}${instruction ? `: ${instruction}` : ""}.${prepNote}`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice: "Schreib der Frau Mueller eine E-Mail, dass ..." — ein E-Mail-ENTWURF in
// EINEM Schritt, OHNE vorheriges find_case. Loest den Empfaenger auf, haengt an
// einen offenen Vorgang des Patienten an (Shared Memory) oder legt einen neuen an,
// delegiert an Nadine und laesst sie einen freigabereifen Entwurf vorbereiten.
// Es wird NIE automatisch gesendet — der Mensch gibt in Nadine frei (approval-first).
router.post("/tools/compose-email", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const instruction = String(req.body?.instruction || req.body?.text || req.body?.body || "").trim();
    if (!instruction) return res.json({ ok: false, message: "Was soll in der E-Mail stehen?" });
    const recipientName = String(req.body?.recipient || req.body?.name || req.body?.to || "").trim();
    const op = await getOperator(clientId);
    const by = op?.name || "Clara";

    // Empfaenger bestimmen: ein ausdruecklich genannter Name gewinnt immer; sonst
    // der gerade aktive Vorgang. So funktioniert das Tool ohne vorheriges find_case,
    // schleppt aber auch keinen falschen Patienten mit (Halluzinations-Schutz).
    let caseId = null;
    let displayName = "";
    if (recipientName) {
      let subject = { name: recipientName, matchStatus: "unmatched", matchMethod: null };
      const s = await resolvePatientSubject(clientId, recipientName).catch(() => null);
      if (s?.patientId) {
        subject = { patientId: s.patientId, name: s.name || recipientName, matchStatus: "matched", matchMethod: s.matchMethod || "name" };
        const open = await listCases(clientId, { patientId: s.patientId, activeOnly: true, limit: 1 }).catch(() => []);
        if (open?.length) caseId = open[0].id;
      }
      displayName = subject.name;
      if (!caseId) {
        const c = await createCase(clientId, {
          subject,
          topic: "other",
          title: `E-Mail an ${displayName}`,
          createdBy: by,
          status: "open",
          updates: [{ by, kind: "note", text: `E-Mail-Auftrag: ${instruction}` }],
        });
        caseId = c.id;
      }
    } else {
      const active = await getActiveCase(clientId);
      if (!active?.id) return res.json({ ok: false, message: "An wen soll die E-Mail gehen?" });
      caseId = active.id;
      displayName = active.subject?.name || "";
    }

    // Wie bei assign_case -> Nadine: delegieren + Entwurf vorbereiten (im
    // Hintergrund, damit Clara sofort antwortet). Der Entwurf landet auf
    // "waiting_approval"; gesendet wird ausschliesslich nach menschlicher Freigabe.
    await assignCase(clientId, caseId, { assignee: "Nadine", instruction, by });
    prepareCaseDraft(clientId, caseId, { by: "Nadine" }).catch(() => { /* best-effort */ });
    // Diesen Vorgang aktiv setzen, damit eine direkt folgende Freigabe
    // ("Sende die E-Mail" -> approve_and_send / send-prepared-email) GENAU
    // diesen Entwurf trifft (Live-Test 15.06.2026: ohne das fand der Versand
    // den frischen Entwurf nicht).
    await setActiveCase(clientId, { id: caseId, subject: { name: displayName } }).catch(() => {});

    return res.json({
      ok: true,
      caseId,
      message: `Alles klar. Nadine schreibt eine E-Mail${displayName ? ` an ${displayName}` : ""} und legt sie Ihnen zur Freigabe vor — gesendet wird erst nach Ihrer Bestätigung. Soll ich sie senden?`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// FREI-DIKTAT ZU BRIEF/E-MAIL (16.06.2026): Diktat -> Nadine arbeitet einen
// Entwurf zur FREIGABE aus. Bewaehrter Pfad (assignCase -> prepareCaseDraft ->
// waiting_approval, taucht im Nadine-Dashboard auf). Nichts wird gesendet.
// Empfaenger: ausdruecklich genannter Name gewinnt, sonst der aktive Vorgang;
// fehlt beides, wird trotzdem ein Entwurf angelegt (Empfaenger ergaenzt der
// Mensch im Dashboard), damit das Diktat nicht verloren geht.
async function assignNadineDraftFromDictation(clientId, { channelLabel, recipientName, dictation, by }) {
  const instruction = channelLabel === "Brief"
    ? `Diktat des Praxisteams wortgetreu zu einem formellen Brief (Sie-Form, professionell) ausarbeiten. Diktat: „${dictation}“`
    : `Diktat des Praxisteams zu einer professionellen E-Mail (Sie-Form) ausarbeiten. Diktat: „${dictation}“`;
  let caseId = null;
  let displayName = "";
  if (recipientName) {
    let subject = { name: recipientName, matchStatus: "unmatched", matchMethod: null };
    const s = await resolvePatientSubject(clientId, recipientName).catch(() => null);
    if (s?.patientId) {
      subject = { patientId: s.patientId, name: s.name || recipientName, matchStatus: "matched", matchMethod: s.matchMethod || "name" };
      const open = await listCases(clientId, { patientId: s.patientId, activeOnly: true, limit: 1 }).catch(() => []);
      if (open?.length) caseId = open[0].id;
    }
    displayName = subject.name;
    if (!caseId) {
      const c = await createCase(clientId, {
        subject,
        topic: "other",
        title: `${channelLabel} an ${displayName}`,
        createdBy: by,
        status: "open",
        updates: [{ by, kind: "note", text: `Diktat-${channelLabel}-Auftrag: ${dictation}` }],
      });
      caseId = c.id;
    }
  } else {
    const active = await getActiveCase(clientId);
    if (active?.id) {
      caseId = active.id;
      displayName = active.subject?.name || "";
    } else {
      const c = await createCase(clientId, {
        subject: { name: "", matchStatus: "unmatched", matchMethod: null },
        topic: "other",
        title: `Diktierter ${channelLabel} (Empfänger offen)`,
        createdBy: by,
        status: "open",
        updates: [{ by, kind: "note", text: `Diktat-${channelLabel}-Auftrag: ${dictation}` }],
      });
      caseId = c.id;
    }
  }
  await assignCase(clientId, caseId, { assignee: "Nadine", instruction, by });
  prepareCaseDraft(clientId, caseId, { by: "Nadine" }).catch(() => { /* best-effort */ });
  await setActiveCase(clientId, { id: caseId, subject: { name: displayName } }).catch(() => {});
  return { caseId, displayName };
}


router.post("/tools/dictate-letter", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const dictation = String(req.body?.text || req.body?.dictation || req.body?.body || "").trim();
    if (!dictation) return res.json({ ok: false, message: "Was soll im Brief stehen? Diktier mir den Inhalt." });
    const recipientName = String(req.body?.recipient || req.body?.name || req.body?.to || "").trim();
    const op = await getOperator(clientId);
    const { caseId, displayName } = await assignNadineDraftFromDictation(clientId, { channelLabel: "Brief", recipientName, dictation, by: op?.name || "Clara" });
    return res.json({
      ok: true,
      caseId,
      message: `Alles klar, ich habe Ihr Diktat aufgenommen. Nadine arbeitet daraus einen Briefentwurf${displayName ? ` an ${displayName}` : ""} aus und legt ihn Ihnen zur Freigabe vor.`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// EINHEITLICHER DIKTIER-MODUS ueber alle Kanaele (16.06.2026):
// channel = brief | email | sms | call.
//  - brief/email: Nadine-Entwurf zur Freigabe (nichts wird versendet).
//  - sms/call: Diktat wird kanalgerecht ausformuliert, zum WOERTLICHEN
//    Vorlesen zurueckgegeben; gesendet/angerufen wird ERST mit confirm=true
//    nach ausdruecklicher Freigabe des Chefs (gleiches Muster wie
//    gapfill_call_patient -> kein versehentliches Senden).
router.post("/tools/dictate", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const channel = String(req.body?.channel || "").trim().toLowerCase();
    const dictation = String(req.body?.text || req.body?.dictation || req.body?.message || req.body?.body || "").trim();
    const recipientName = String(req.body?.recipient || req.body?.recipientName || req.body?.name || req.body?.to || "").trim();
    const confirm = req.body?.confirm === true || req.body?.confirm === "true";
    const op = await getOperator(clientId);
    const by = op?.name || "Clara";

    const CHANNELS = { brief: "brief", email: "email", "e-mail": "email", mail: "email", sms: "sms", call: "call", anruf: "call", telefon: "call" };
    const ch = CHANNELS[channel];
    if (!ch) return res.json({ ok: false, message: "Für welchen Kanal soll ich das Diktat verwenden? Brief, E-Mail, SMS oder Anruf?" });
    if (!dictation) return res.json({ ok: false, message: "Was soll im Text stehen? Diktier mir den Inhalt." });

    // Brief / E-Mail -> Nadine-Entwurf zur Freigabe.
    if (ch === "brief") {
      const { caseId, displayName } = await assignNadineDraftFromDictation(clientId, { channelLabel: "Brief", recipientName, dictation, by });
      return res.json({ ok: true, caseId, message: `Alles klar. Nadine macht aus Ihrem Diktat einen Briefentwurf${displayName ? ` an ${displayName}` : ""} und legt ihn Ihnen zur Freigabe vor.` });
    }
    if (ch === "email") {
      const { caseId, displayName } = await assignNadineDraftFromDictation(clientId, { channelLabel: "E-Mail", recipientName, dictation, by });
      return res.json({ ok: true, caseId, message: `Alles klar. Nadine macht aus Ihrem Diktat einen E-Mail-Entwurf${displayName ? ` an ${displayName}` : ""} und legt ihn Ihnen zur Freigabe vor.` });
    }

    // SMS / Anruf -> Ziel aufloesen, ausformulieren, vorlesen, erst auf 'ja' senden.
    const isCall = ch === "call";
    const target = await resolveDelegationTarget(clientId, req.body);
    if (!target.phone) {
      let missCard = null;
      try {
        missCard = karteLisaSms({
          contactName: target.name, phone: "", body: dictation, status: "no_phone",
        });
      } catch { /* Karte ist Komfort */ }
      return res.json({
        ok: false,
        message: "Ich habe keine Telefonnummer. Sage zuerst: Suche den Kontakt von — und den Namen.",
        card: missCard,
      });
    }
    const who = target.name || target.phone;

    if (!confirm) {
      const polished = await polishForChannel(isCall ? "call" : "sms", dictation, { recipientName: target.name });
      const text = polished.text || dictation;
      if (isCall) {
        return res.json({
          ok: true, prepared: true, channel: "call", callText: text,
          message: `Lisa würde ${who} anrufen und sinngemäß sagen: „${text}“. Soll Lisa jetzt so anrufen?`,
          directive: "Lies den Text WOERTLICH vor und frage, ob Lisa so anrufen soll. NUR auf ausdrueckliches 'Ja' rufst du dictate ERNEUT auf mit confirm=true, channel='call' und text=<dem soeben vorgelesenen Text>. Auf 'nein' NICHT anrufen.",
        });
      }
      return res.json({
        ok: true, prepared: true, channel: "sms", smsText: text,
        message: `Ich würde folgende SMS an ${who} senden: „${text}“. Soll ich sie so senden?`,
        directive: "Lies den SMS-Text WOERTLICH vor und frage, ob du ihn so senden sollst. NUR auf ausdrueckliches 'Ja' rufst du dictate ERNEUT auf mit confirm=true, channel='sms' und text=<dem soeben vorgelesenen Text>. Auf 'nein' NICHT senden.",
      });
    }

    // confirm=true: jetzt wirklich senden/anrufen (text ist der bereits
    // ausformulierte, vorgelesene Text).
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: `Testlauf: ${isCall ? `Lisa hätte ${who} angerufen` : `Die SMS an ${who} wäre verschickt worden`}.` });
    }
    if (isCall) {
      const out = await lisaStartCall(clientId, { phone: target.phone, instruction: dictation, contactName: target.name, callLanguage: req.body?.callLanguage, by });
      if (out?.taskId) {
        try {
          out.card = karteLisaLive({
            taskId: out.taskId,
            contactName: target.name,
            phone: target.phone,
            status: out.scheduled ? "scheduled" : "calling",
            instruction: dictation,
          });
        } catch { /* Karte ist Komfort */ }
      }
      return res.json(out);
    }
    const out = await lisaSendSms(clientId, { phone: target.phone, message: dictation, recipientName: target.name, by });
    try {
      out.card = karteLisaSms({
        taskId: out.taskId || "",
        contactName: out.contactName || target.name,
        phone: out.phone || target.phone,
        body: out.body || dictation,
        status: out.ok ? "done" : "failed",
      });
    } catch { /* Karte ist Komfort */ }
    return res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// E-Mail-Entwurf FREIGEBEN UND SENDEN (Gegenstueck zu compose_email).
// compose_email legt nur einen freigabe-pflichtigen Entwurf an; dieses Tool
// versendet ihn WORTWOERTLICH ueber den vorhandenen SMTP-Pfad (sendMail) — erst
// nach ausdruecklicher Freigabe des Chefs ("Sende die E-Mail", "Gib frei").
// Wichtig (Halluzinations-Schutz, Vorfall 15.06.2026): Es wird NUR der Status
// zurueckgegeben, der wirklich eintritt. Wenn kein Empfaenger aufloesbar ist,
// wird NICHT gesendet, sondern ehrlich nachgefragt. Zustellung ("eingetroffen")
// wird NIE behauptet — nur "gesendet" bei sent:true.
const _SEND_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function _normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(dr|doktor|herr|frau|prof)\.?\b/g, "")
    .replace(/[^a-z0-9äöüß ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

router.post("/tools/send-prepared-email", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveCase(clientId);
    if (!active?.id) {
      return res.json({ ok: false, sent: false, message: "Ich weiss gerade nicht, welche E-Mail gemeint ist. Sagen Sie mir kurz den Empfaenger, dann verfasse ich sie und sende nach Ihrer Freigabe." });
    }
    let c = await getCase(clientId, active.id);
    if (!c) return res.json({ ok: false, sent: false, message: "Den Vorgang finde ich nicht mehr. Bitte sag mir den Empfaenger neu." });

    // Entwurf evtl. noch nicht fertig (compose_email erstellt ihn im Hintergrund).
    // Wenn ein Auftrag vorliegt, aber noch kein Entwurf, jetzt SYNCHRON erzeugen,
    // damit die Freigabe nicht ins Leere laeuft.
    if (!c.draft?.subject && !c.draft?.body && (c.handoff?.instruction || c.assignee)) {
      await prepareCaseDraft(clientId, active.id, { by: "Nadine" }).catch(() => {});
      c = await getCase(clientId, active.id) || c;
    }
    const draftSubject = String(c.draft?.subject || "").trim();
    const draftBody = String(c.draft?.body || "").trim();
    if (!draftSubject && !draftBody) {
      return res.json({ ok: false, sent: false, message: "Es liegt noch kein fertiger Entwurf zum Senden vor. Soll ich die E-Mail erst verfassen?" });
    }
    // Doppel-Versand verhindern (z. B. zweimal "senden" gesagt).
    if ((c.status === "resolved" || c.status === "closed") && req.body?.force !== true) {
      return res.json({ ok: false, sent: false, message: "Diese E-Mail wurde fuer diesen Vorgang bereits gesendet." });
    }

    // Empfaenger aufloesen — strikte Reihenfolge, nie raten:
    const op = await getOperator(clientId);
    const accounts = (await listAccounts(clientId)).filter((a) => a.active !== false);
    const acc = accounts[0] || null;
    const accEmail = String(acc?.email || "").trim();
    const name = String(c.subject?.name || "").trim();

    let to = "";
    let how = "";
    const explicit = String(req.body?.to || "").trim();
    if (_SEND_EMAIL_RE.test(explicit)) { to = explicit; how = "explizit"; }
    else if (_SEND_EMAIL_RE.test(String(c.draft?.to || "").trim())) { to = String(c.draft.to).trim(); how = "entwurf"; }
    else if (c.subject?.patientId) {
      const s = await resolvePatientSubject(clientId, { name }).catch(() => null);
      const cand = s?.candidates?.[0] || null;
      const pmail = String(cand?.email || cand?.mail || cand?.emailAddress || "").trim();
      if (_SEND_EMAIL_RE.test(pmail)) { to = pmail; how = "patient"; }
    }
    // Selbst/Chef: Empfaengername == Operator -> eigene Praxisadresse.
    if (!to && accEmail) {
      const opName = _normName(op?.name);
      const rcpt = _normName(name);
      const selfish = !name || (opName && rcpt && (rcpt === opName || rcpt.includes(opName) || opName.includes(rcpt)));
      if (selfish) { to = accEmail; how = "selbst"; }
    }
    if (!to) {
      return res.json({ ok: false, sent: false, needRecipient: true, message: `Ich habe fuer ${name || "diesen Empfaenger"} keine E-Mail-Adresse hinterlegt. Sag mir die Adresse, dann sende ich.` });
    }
    if (!acc) {
      return res.json({ ok: false, sent: false, message: "Es ist kein E-Mail-Konto eingerichtet — ich kann nichts senden." });
    }

    const subject = draftSubject || "Ihre Nachricht aus der Praxis";
    const body = draftBody;
    const by = op?.name || actorName(req, "Clara");
    const sent = await sendMail(clientId, acc.id, { to: [to], subject, text: body });
    if (!sent.ok) {
      return res.json({ ok: true, sent: false, reason: sent.reason || "send_failed", message: `Das Senden hat nicht geklappt (${sent.reason || "unbekannt"}). Es wurde nichts verschickt — der Entwurf liegt weiter zur Freigabe bereit.` });
    }

    await addUpdate(clientId, active.id, {
      by,
      kind: "note",
      text: `Per Sprache freigegeben & gesendet von ${by} an ${to}${subject ? ` (Betreff: ${subject})` : ""}${sent.dryRun ? " [Testmodus]" : ""}.`,
    }).catch(() => {});
    if (!req.body?.keepOpen) {
      await setStatus(clientId, active.id, "resolved", { by, note: "Per E-Mail beantwortet (Clara)" }).catch(() => {});
    }
    return res.json({
      ok: true,
      sent: true,
      to,
      resolvedBy: how,
      dryRun: !!sent.dryRun,
      message: `Erledigt. Ich habe die E-Mail an ${to} gesendet${sent.dryRun ? " (Testmodus)" : ""}.`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/tools/update-case", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveCase(clientId);
    if (!active?.id) return res.json({ ok: false, message: "Welcher Vorgang? Bitte zuerst den Patienten nennen." });
    const text = (req.body?.text || req.body?.note || "").trim();
    if (!text) return res.json({ ok: false, message: "Was soll ich notieren?" });
    const op = await getOperator(clientId);
    const out = await addUpdate(clientId, active.id, { by: op?.name || "Clara", kind: "note", text });
    if (!out.ok) return res.json({ ok: false, message: `Notiz nicht möglich: ${out.reason}` });
    return res.json({ ok: true, message: "Notiert." });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/tools/close-case", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveCase(clientId);
    if (!active?.id) return res.json({ ok: false, message: "Welcher Vorgang? Bitte zuerst den Patienten nennen." });
    const note = (req.body?.note || req.body?.text || "").trim();
    const status = /schließ|geschlossen|closed|abschließ/.test((req.body?.status || "").toLowerCase()) ? "closed" : "resolved";
    const op = await getOperator(clientId);
    const out = await setStatus(clientId, active.id, status, { by: op?.name || "Clara", note });
    if (!out.ok) return res.json({ ok: false, message: `Schließen nicht möglich: ${out.reason}` });
    await clearActiveCase(clientId);
    const who = active.subject?.name ? ` von ${active.subject.name}` : "";
    return res.json({ ok: true, message: `Vorgang${who} als ${status === "closed" ? "geschlossen" : "gelöst"} markiert.` });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Lisa: outbound SMS + calls, delegated by Clara (voice) ----------------
// Clara (local LLM) extracts phone + content from the spoken order; these
// endpoints execute deterministically and write every delegation + outcome to
// the shared brain (lisa_sms / lisa_call).
// ============================================================================
// Kontakt-Auflösung per NAME + KONTEXT — "Ruf Herrn Meier an" ohne Nummer.
// Ablauf: find_contact(name) -> eindeutig? Kontakt wird serverseitig gemerkt
// und send_sms / delegate_call brauchen KEINE Telefonnummer mehr. Mehrdeutig?
// Clara nennt die Kandidaten; der Chef antwortet mit Vorname/Jahrgang ODER
// Kontext ("der gestern da war", "der wegen der Rechnung angerufen hat") und
// find_contact(hint) gleicht das gegen Termin-Historie + Vorgänge ab.
// ============================================================================

const HINT_TOPIC_WORDS = {
  rechnung: ["rechnung", "bezahl", "zahlung", "mahnung", "kostenplan", "erstattung"],
  termin: ["termin", "verschieb", "absag", "umbuch"],
  dokumente: ["dokument", "unterlagen", "formular", "anamnese", "ausgefüllt", "ausgefuellt"],
  beschwerde: ["beschwer", "unzufrieden", "ärger", "aerger"],
  rueckruf: ["rückruf", "rueckruf", "zurückrufen", "zurueckrufen"],
};
const HINT_CHANNEL_WORDS = {
  mail: ["e-mail", "email", "mail geschickt", "geschrieben", "gemailt"],
  call: ["angerufen", "anruf", "telefoniert", "gemeldet"],
  sms: ["sms"],
};
const NUM_WORDS_DE = { ein: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8 };

// Aus einem gesprochenen Zeit-Hinweis die zu prüfenden Tage (Offsets relativ zu
// heute, negativ = Vergangenheit) ableiten. null = kein Zeitbezug im Hinweis.
function hintDayOffsets(hintLower) {
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (/\bvorgestern\b/.test(hintLower)) return [-2];
  if (/\bgestern\b/.test(hintLower)) return [-1];
  if (/\bheute\b/.test(hintLower)) return [0];
  let m = hintLower.match(/vor\s+(\d+|\w+)\s+tagen?/);
  if (m) {
    const n = Number(m[1]) || NUM_WORDS_DE[m[1]] || 0;
    if (n > 0) return range(-n - 1, -n + 1).filter((o) => o < 0);
  }
  m = hintLower.match(/vor\s+(\d+|\w+)\s+wochen?/);
  if (m) {
    const n = Number(m[1]) || NUM_WORDS_DE[m[1]] || 0;
    if (n > 0) return range(-7 * n - 3, -7 * n + 3);
  }
  if (/letzte[rn]?\s+woche/.test(hintLower)) return range(-13, -5);
  if (/diese[rn]?\s+woche/.test(hintLower)) return range(-6, 0);
  const wd = { montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 0 };
  for (const [name, dow] of Object.entries(wd)) {
    if (hintLower.includes(name)) {
      // Letztes Vorkommen dieses Wochentags innerhalb der letzten 7 Tage.
      const today = new Date().getDay();
      let diff = today - dow;
      if (diff <= 0) diff += 7;
      return [-diff];
    }
  }
  return null;
}

function dayOffsetToIso(offset) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Welche Kandidaten hatten in den genannten Tagen einen Termin?
async function candidatesWithAppointment(clientId, candidates, offsets) {
  const ids = new Set(candidates.map((p) => String(p.id || "")));
  const hit = new Set();
  // Begrenzt auf 16 Tage, neueste zuerst — ein Tages-Read pro Tag ist ok,
  // Disambiguierung ist ein seltener, interaktiver Moment.
  for (const off of offsets.slice(0, 16)) {
    const day = await getDayAppointments(clientId, { date: dayOffsetToIso(off) }).catch(() => null);
    for (const a of day?.appointments || []) {
      if (!a.isAbsence && ids.has(String(a.patientId || ""))) hit.add(String(a.patientId));
    }
    if (hit.size === ids.size) break;
  }
  return candidates.filter((p) => hit.has(String(p.id || "")));
}

// Welche Kandidaten haben einen Vorgang, der zum Hinweis passt (Thema/Kanal,
// optional im genannten Zeitfenster)?
async function candidatesWithCase(clientId, candidates, hintLower, offsets) {
  const words = [];
  for (const list of Object.values(HINT_TOPIC_WORDS)) for (const w of list) if (hintLower.includes(w)) words.push(w);
  for (const list of Object.values(HINT_CHANNEL_WORDS)) for (const w of list) if (hintLower.includes(w)) words.push(w);
  const fromMs = offsets ? Date.now() + Math.min(...offsets) * 86400000 - 86400000 : 0;
  const toMs = offsets ? Date.now() + Math.max(...offsets) * 86400000 + 86400000 : Number.MAX_SAFE_INTEGER;
  const out = [];
  for (const p of candidates) {
    if (!p.id) continue;
    const cases = await listCases(clientId, { patientId: String(p.id), limit: 20 }).catch(() => []);
    const match = cases.some((c) => {
      const ts = c.updatedAt?.toMillis?.() ?? c.updatedAt ?? 0;
      if (offsets && (ts < fromMs || ts > toMs)) return false;
      if (!words.length) return true; // reiner Zeitbezug: jeder Vorgang im Fenster zählt
      const text = JSON.stringify({ t: c.topic, ti: c.title, s: c.summary, u: (c.updates || []).slice(-5) }).toLowerCase();
      return words.some((w) => text.includes(w));
    });
    if (match) out.push(p);
  }
  return out;
}

// Kontaktkarte aufs gekoppelte Handy des Behandlers pushen (Patient ODER
// externer Kontakt). Nutzt denselben Tap-to-Call-Push wie contact_card
// (/m/contact.html — antippen = anrufen). Liefert die Push-Bestaetigung zurueck,
// damit Clara WAHRHEITSGEMAESS sagen kann, ob die Karte wirklich angekommen ist
// (nie behaupten, wenn kein Geraet gekoppelt ist). Best-effort: wirft nie.
async function pushContactCard(clientId, p, { note = "" } = {}) {
  try {
    const name = `${p?.firstName || ""} ${p?.lastName || ""}`.trim() || String(p?.name || "").trim();
    const mobile = String(p?.mobilePhoneNumber || p?.mobile || "").trim();
    const phone = String(p?.phoneNumber || p?.phone || "").trim();
    const email = String(p?.email || "").trim();
    if (!name && !mobile && !phone && !email) return { ok: false, sent: 0, failed: 0 };
    const op = await getOperator(clientId);
    if (!op?.id) return { ok: false, sent: 0, failed: 0 };
    const qp = new URLSearchParams({ n: name });
    if (mobile) qp.set("m", mobile);
    if (phone) qp.set("p", phone);
    if (email) qp.set("e", email);
    if (note) qp.set("note", note.slice(0, 80));
    const url = `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/m/contact.html?${qp.toString()}`;
    const bodyBits = [mobile && `📱 ${mobile}`, !mobile && phone && `📞 ${phone}`, email].filter(Boolean);
    const r = await notifyOperator(clientId, op.id, { title: `Kontakt: ${name}`, body: bodyBits.join(" · "), url });
    return { ok: !!r.ok, sent: r.sent || (r.ok ? 1 : 0), failed: r.failed || 0 };
  } catch {
    return { ok: false, sent: 0, failed: 0 };
  }
}

// Bestaetigungs-Satz nach Push einer Kontaktkarte: ehrlich, je nachdem ob ein
// Handy erreicht wurde. IMMER mit der Rueckfrage "richtige Person?" plus dem
// Hinweis, dass der Chef danach SMS/E-Mail/Anruf mit Inhalt nennen kann.
function contactPushConfirm(p, pushed) {
  const name = `${p.firstName || ""} ${p.lastName || ""}`.trim() || String(p.name || "").trim();
  const reached = pushed && pushed.sent > 0;
  const phone = String(p.mobilePhoneNumber || p.phone || "").trim();
  const email = String(p.email || "").trim();
  const head = reached
    ? `Ich habe Ihnen die Kontaktdaten von ${name} gerade aufs Handy geschickt.`
    : `Gemeint ist ${name}${phone ? `, Telefon ${phone}` : ""}${email ? `${phone ? "," : ","} E-Mail ${email}` : ""}. (Aufs Handy konnte ich nichts schicken — kein Geraet gekoppelt.)`;
  return `${head} Ist das die richtige Person? Wenn ja, sag mir was ich tun soll — SMS, E-Mail oder Anruf, und den Inhalt. Wenn nein, suchen wir weiter.`;
}

function contactSummary(p) {
  const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  const phone = String(p.mobilePhoneNumber || "").trim();
  const email = String(p.email || "").trim();
  const parts = [];
  if (phone) parts.push("eine Handynummer ist hinterlegt");
  if (email) parts.push("eine E-Mail-Adresse ist hinterlegt");
  if (!parts.length) {
    return `Gemeint ist ${name} — aber es ist weder Telefonnummer noch E-Mail hinterlegt. Ich kann diesen Patienten nicht direkt erreichen.`;
  }
  const can = [];
  if (phone) { can.push("anrufen lassen"); can.push("eine SMS schicken"); }
  if (email) can.push("Nadine eine E-Mail schreiben lassen");
  return `Gemeint ist ${name}, ${parts.join(" und ")}. Ich kann ${can.join(", ")} — was darf es sein?`;
}

// Gemeinsame Disambiguierungs-Route für find_contact UND search_patient (also
// auch vor jeder Terminbuchung): Vorname/Jahrgang -> Termin-Historie ->
// Vorgänge. Liefert { status: "one"|"many"|"none", narrowed }.
async function narrowPatientCandidatesByHint(clientId, candidates, hintLower) {
  // Deterministische Schnellwege (Stefan-Meier-Loop, 2026-06-11):
  // 1. Ordinal ("der erste", "nummer zwei", "der letzte") gegen die Liste in
  //    der Reihenfolge, in der sie angesagt wurde.
  const byOrdinal = ordinalPick(hintLower, candidates);
  if (byOrdinal) return { status: "one", narrowed: [byOrdinal] };
  // 2. Genannte (Teil-)Telefonnummer gegen die hinterlegten Nummern.
  const byPhone = narrowByPhoneFragment(hintLower, candidates);
  if (byPhone.length === 1) return { status: "one", narrowed: byPhone };
  if (byPhone.length > 1) candidates = byPhone;
  // 3. Exakter voller Name ("Stefan Meier" trifft nicht Stefanie Meierhoefer).
  const byFullName = narrowByExactName(hintLower, candidates);
  if (byFullName.length === 1) return { status: "one", narrowed: byFullName };
  if (byFullName.length > 1) candidates = byFullName;

  const byName = candidates.filter((p) =>
    hintLower.includes(String(p.firstName || "").toLowerCase()) && String(p.firstName || "").length >= 3
  );
  const byYear = candidates.filter((p) => {
    const y = String(p.birthDate || "").slice(0, 4);
    return y && hintLower.includes(y);
  });
  let narrowed = byName.length === candidates.length ? [] : byName;
  if (!narrowed.length) narrowed = byYear;
  // Telefon-/Vollname-Eingrenzung zaehlt als Fortschritt, auch wenn am Ende
  // mehrere bleiben — dann mit MEHR Unterscheidungsmerkmalen nachfragen.
  if (!narrowed.length && (byPhone.length > 1 || byFullName.length > 1)) {
    narrowed = candidates;
  }
  if (!narrowed.length) {
    const offsets = hintDayOffsets(hintLower);
    const mentionsVisit = /\b(da war|hier war|termin|behandlung|gekommen)\b/.test(hintLower);
    const mentionsComm = Object.values(HINT_CHANNEL_WORDS).flat().some((w) => hintLower.includes(w))
      || Object.values(HINT_TOPIC_WORDS).flat().some((w) => hintLower.includes(w));
    if (offsets && (mentionsVisit || !mentionsComm)) {
      narrowed = await candidatesWithAppointment(clientId, candidates, offsets);
    }
    if (!narrowed.length && (mentionsComm || offsets)) {
      narrowed = await candidatesWithCase(clientId, candidates, hintLower, offsets);
    }
  }
  // Der Hint passt auf ALLE Kandidaten gleichermassen (z.B. der geteilte volle
  // Name "Stefan Meier" bei Namensvettern): kein "kein Treffer", sondern
  // gezielt mit Unterscheidungsmerkmalen nachfragen.
  if (!narrowed.length && candidates.length > 1) {
    const full = (p) => `${p.firstName || ""} ${p.lastName || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
    if (candidates.every((p) => full(p).length >= 5 && hintLower.includes(full(p)))) {
      return { status: "many", narrowed: candidates };
    }
  }
  if (narrowed.length === 1) return { status: "one", narrowed };
  if (narrowed.length > 1) return { status: "many", narrowed };
  return { status: "none", narrowed: [] };
}

// ============================================================================
// Externe Kontakte (Handwerker, Labor, Lieferanten): kein Patient, aber im
// Shared Memory auffindbar — Adressbuch (mas_contacts), Posteingang (Absender
// ODER Name im Text, Telefonnummer aus der Signatur) und Anruf-Events
// (counterparty.ref = Rufnummer). "Ruf Herrn Kasper an wegen der Leuchtreklame."
// ============================================================================

const PHONE_IN_TEXT_RE = /(?:\+49|0049|0)[\d\s\/\-().]{7,18}\d/g;

function extractPhoneFromText(text) {
  for (const m of String(text || "").match(PHONE_IN_TEXT_RE) || []) {
    const norm = normalizePhone(m);
    if (norm) return norm;
  }
  return "";
}

function stripHtmlToText(html) {
  return String(html || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDayDe(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

async function findExternalContact(clientId, name, hintLower) {
  const nameLower = name.toLowerCase();
  const tokens = [nameLower, ...hintLower.split(/\s+/).filter((t) => t.length >= 5)];
  const provenance = [];
  let phone = "";
  let email = "";
  let displayName = "";

  // 1) Geteiltes Adressbuch (gefüttert von Nadine, Lisa, Bianca und Clara)
  const book = await listContacts(clientId, { q: name, limit: 5 }).catch(() => ({ items: [] }));
  const bookHit = (book.items || [])[0];
  if (bookHit) {
    displayName = bookHit.name || "";
    email = bookHit.address || "";
    phone = (Array.isArray(bookHit.phones) && bookHit.phones[0]) || "";
    provenance.push(`steht im Adressbuch${bookHit.lastSubject ? ` (zuletzt: „${bookHit.lastSubject}“)` : ""}`);
  }

  // 2) Posteingang: Name im Absender ODER im Text (Signatur), Nummer extrahieren.
  // Auch die Adressbuch-Adresse zählt als Treffer (Name "Kasper" vs. Absender
  // "info@kasper-werbetechnik.de").
  const addrLower = (bookHit?.address || "").toLowerCase();
  const accountIds = await operatorMailAccountIds(clientId).catch(() => null);
  const rows = await listMessages(clientId, { folder: "INBOX", limit: 80, accountIds }).catch(() => []);
  const fromText = (f) => (typeof f === "object" && f !== null ? `${f.name || ""} ${f.address || ""}` : String(f || ""));
  const rowHay = (r) => `${fromText(r.from)} ${r.subject || ""} ${r.preview || ""}`.toLowerCase();
  const mailHits = rows.filter((r) => rowHay(r).includes(nameLower) || (addrLower && rowHay(r).includes(addrLower)));
  // Hint-Wörter (z.B. "leuchtreklame") priorisieren die richtige Mail.
  mailHits.sort((a, b) => {
    const score = (r) => tokens.filter((t) => rowHay(r).includes(t)).length;
    return score(b) - score(a);
  });
  for (const hit of mailHits.slice(0, 3)) {
    const full = await getMessage(clientId, hit.id).catch(() => null);
    if (!full) continue;
    const bodyText = `${String(full.textBody || "")} ${stripHtmlToText(full.htmlBody)}`;
    if (!displayName) {
      const f = full.from;
      displayName = (typeof f === "object" && f !== null ? String(f.name || f.address || "") : String(f || "")).replace(/<[^>]*>/g, "").trim();
    }
    if (!email) {
      const f = full.from;
      const addr = typeof f === "object" && f !== null ? String(f.address || "") : (String(f || "").match(/<([^>]+)>/) || [])[1] || "";
      if (addr.includes("@")) email = addr;
    }
    if (!phone) phone = extractPhoneFromText(bodyText);
    const when = fmtDayDe(full.date ? new Date(full.date).getTime() : 0);
    provenance.push(`hat${when ? ` am ${when}` : ""} eine E-Mail geschickt (Betreff: ${full.subject || "ohne Betreff"})${phone ? " — Telefonnummer aus der E-Mail übernommen" : ""}`);
    if (phone) break;
  }

  // 3) Anruf-Events im Shared Memory: Name als Gesprächspartner, Nummer am Event
  const events = await queryRecent(clientId, Date.now() - 60 * 86400000, 1000).catch(() => []);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const who = `${e.subject?.name || ""} ${e.counterparty?.name || ""}`.toLowerCase();
    if (!who.includes(nameLower)) continue;
    const evPhone = normalizePhone(e.counterparty?.ref || "");
    if (!displayName) displayName = e.subject?.name || e.counterparty?.name || "";
    if (!phone && evPhone) phone = evPhone;
    const channelPhrase =
      e.channel === "lisa_call" ? "Lisa hat dort angerufen"
      : e.channel === "lisa_sms" ? "Lisa hat dorthin gesimst"
      : e.channel === "bianca_call" ? "hat hier angerufen"
      : e.channel === "nadine_email" ? "E-Mail-Kontakt"
      : "Kontakt";
    provenance.push(`${fmtDayDe(e.ts)}: ${channelPhrase}${e.summary ? ` — ${String(e.summary).slice(0, 120)}` : ""}`);
    if (provenance.length >= 4) break;
  }

  if (!provenance.length && !phone && !email) return null;

  // Lernen: Der mühsam zusammengesuchte Kontakt (Nummer aus Signatur/Anruf-
  // Event) wandert ins geteilte Adressbuch — beim nächsten Mal ist er ein
  // Direkttreffer, für alle Agenten.
  if (phone || email) {
    await upsertSharedContact(clientId, {
      name: displayName || name, email, phone, source: "find_contact",
    });
  }

  return { displayName: displayName || name, phone, email, provenance };
}

// "null eins sieben sieben ..." / "0177 600 46 00" -> "01776004600".
// Liefert NUR dann Ziffern, wenn der gesamte Text eine reine Nummer ist
// (Ziffern + deutsche Zahlwoerter) — sonst "" (echter Name).
const GERMAN_DIGIT_WORDS = {
  null: "0", eins: "1", zwei: "2", zwo: "2", drei: "3", vier: "4",
  fuenf: "5", "fünf": "5", sechs: "6", sieben: "7", acht: "8", neun: "9",
};
function spokenDigitsOf(text) {
  const tokens = String(text || "").toLowerCase().split(/[\s\-\/.,()+]+/).filter(Boolean);
  if (!tokens.length) return "";
  let out = "";
  for (const t of tokens) {
    if (/^\d+$/.test(t)) out += t;
    else if (GERMAN_DIGIT_WORDS[t] != null) out += GERMAN_DIGIT_WORDS[t];
    else return "";
  }
  return out;
}


router.post("/tools/find-contact", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = String(req.body?.name || "").trim();
    const hint = String(req.body?.hint || "").trim();
    const hintLower = hint.toLowerCase();

    // Rettungsanker (Testlauf 00:33, sms-06/07): Das Modell ruft find_contact
    // mit einer TELEFONNUMMER als Name auf ("0177 600 46 00" oder diktiert
    // "null eins sieben sieben ..."). Eine Namenssuche darauf matcht im
    // schlimmsten Fall einen FALSCHEN Patienten. Stattdessen: Nummer erkennen,
    // als Ziel merken (send_sms/delegate_call ohne phone greifen darauf zu)
    // und das Modell zur direkten Aktion lotsen.
    {
      const purePhone = spokenDigitsOf(rawName || hint);
      if (purePhone && purePhone.length >= 6) {
        await setPatientCandidates(clientId, [], {
          id: null, firstName: "", lastName: "",
          mobilePhoneNumber: purePhone, hasPhone: true, external: true,
        });
        return res.json({
          ok: true,
          message: `Verstanden, die Nummer ${purePhone} ist als Ziel gemerkt. Sende jetzt direkt mit send_sms beziehungsweise delegate_call — phone kann leer bleiben.`,
        });
      }
    }

    // Ordinal-Antworten ("der erste") IMMER gegen die zuletzt vorgelesene
    // Kandidatenliste aufloesen — nie gegen eine frische Suche (siehe
    // search-patient: sonst trifft "der erste" den falschen Namensvetter).
    {
      const ordinalSource = `${hintLower} ${rawName.toLowerCase()}`.trim();
      if (ordinalSource) {
        const remembered = await getPatientCandidates(clientId);
        // Nur wenn tatsaechlich eine Auswahl offen ist (>1 gemerkte Kandidaten).
        const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
        if (byOrd) {
          await setPatientCandidates(clientId, [byOrd], byOrd);
          // 15.06.2026 (Chef-Wunsch): Nach der Auswahl ("der dritte") die
          // KONTAKTKARTE aufs Handy pushen und zur Bestaetigung zurueckfragen
          // ("richtige Person?"). Erst nach "ja" + Auftrag wird gesendet/angerufen
          // (send_sms/compose_email/delegate_call), bei "nein" weiter gesucht.
          const pushed = await pushContactCard(clientId, byOrd);
          return res.json({
            ok: true,
            message: `${contactPushConfirm(byOrd, pushed)}`,
            pushed: pushed?.sent > 0,
            directive: "Auf 'ja' + Auftrag JETZT send_sms / compose_email / delegate_call (phone leer lassen, Kontakt ist gemerkt) — NICHT erneut find_contact. Auf 'nein' weiter suchen.",
          });
        }
      }
    }
    if (rawName && isOrdinalChoice(rawName)) {
      return res.json({ ok: false, message: "Welchen Eintrag meinen Sie? Bitte den Namen nennen." });
    }

    // Kollegen der Praxis stehen VOR der Patientenkartei (Chef 27.07.2026:
    // "Wieso findet Clara die Kontaktdaten von Dr. Petsas nicht?"). In der
    // Kartei liegen gleichnamige Alt-/Testdatensaetze — ohne diesen Vorrang
    // fragt Clara "Welchen Petsas meinen Sie?" statt zu antworten. Nur bei
    // Titel-Anrede ("Dr. Petsas", "Doktor Patrikis"), damit ein Patient
    // desselben Nachnamens weiterhin normal gefunden wird.
    if (rawName && hasColleagueTitle(rawName)) {
      const kollege = await findDirectoryContact(clientId, rawName).catch(() => null);
      if (kollege && (kollege.mobile || kollege.phone || kollege.email)) {
        const nummer = kollege.mobile || kollege.phone;
        await setPatientCandidates(clientId, [], {
          id: null, firstName: "", lastName: kollege.name,
          mobilePhoneNumber: nummer, email: kollege.email,
          hasPhone: !!nummer, external: true,
        });
        const pushed = await pushContactCard(
          clientId,
          { name: kollege.name, phone: nummer, email: kollege.email },
          { note: kollege.role || "Praxis-Team" },
        );
        return res.json({
          ok: true,
          pushed: pushed?.sent > 0,
          message: `${kollege.name} aus dem Praxis-Team: ${spokenDirectoryEntry(kollege)}. ${contactPushConfirm({ name: kollege.name, mobilePhoneNumber: nummer, email: kollege.email }, pushed)}`,
          directive: "Auf 'ja' + Auftrag JETZT send_sms / compose_email / delegate_call (phone leer lassen, Kontakt ist gemerkt).",
        });
      }
    }

    // Kandidaten: neue Suche bei Namen, sonst die der letzten Suche (Nachfrage).
    let candidates = [];
    if (rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const found = await searchPatientSpoken(clientId, name);
      if (!found.ok) return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${found.error}` });
      candidates = found.patients || [];
      if (candidates.length > 1) candidates = tightenNameHits(name, candidates);
      if (!candidates.length) {
        // Kein Patient -> vielleicht ein Kollege ohne Titel im Satz
        // ("Ruf Patrikis an"), erst danach der externe Kontakt.
        const kollege = await findDirectoryContact(clientId, name).catch(() => null);
        if (kollege && (kollege.mobile || kollege.phone || kollege.email)) {
          const nummer = kollege.mobile || kollege.phone;
          await setPatientCandidates(clientId, [], {
            id: null, firstName: "", lastName: kollege.name,
            mobilePhoneNumber: nummer, email: kollege.email,
            hasPhone: !!nummer, external: true,
          });
          const pushed = await pushContactCard(
            clientId,
            { name: kollege.name, phone: nummer, email: kollege.email },
            { note: kollege.role || "Praxis-Team" },
          );
          return res.json({
            ok: true,
            pushed: pushed?.sent > 0,
            message: `${kollege.name} aus dem Praxis-Team: ${spokenDirectoryEntry(kollege)}. ${contactPushConfirm({ name: kollege.name, mobilePhoneNumber: nummer, email: kollege.email }, pushed)}`,
            directive: "Auf 'ja' + Auftrag JETZT send_sms / compose_email / delegate_call (phone leer lassen, Kontakt ist gemerkt).",
          });
        }
        // Kein Patient -> externer Kontakt? (Handwerker, Labor, Lieferant —
        // aus Adressbuch, Posteingang und Anruf-Events im Shared Memory.)
        const ext = await findExternalContact(clientId, name, hintLower);
        if (ext) {
          await setPatientCandidates(clientId, [], {
            id: null,
            firstName: "",
            lastName: ext.displayName,
            mobilePhoneNumber: ext.phone,
            email: ext.email,
            hasPhone: !!ext.phone,
            external: true,
          });
          const who = ext.displayName;
          const trail = ext.provenance.slice(0, 2).join("; ");
          if (ext.phone || ext.email) {
            const pushed = await pushContactCard(clientId, { name: who, phone: ext.phone, email: ext.email }, { note: trail ? trail.slice(0, 80) : "", role: "Externer Kontakt" });
            return res.json({
              ok: true,
              message: `${who} ist kein Patient, aber ich kenne den Kontakt${trail ? `: ${trail}` : ""}. ${contactPushConfirm({ name: who, mobilePhoneNumber: ext.phone, email: ext.email }, pushed)}`,
              pushed: pushed?.sent > 0,
              directive: "Auf 'ja' + Auftrag JETZT send_sms / compose_email / delegate_call (phone leer lassen, Kontakt ist gemerkt). Auf 'nein' weiter suchen.",
            });
          }
          return res.json({ ok: true, message: `${who} ist kein Patient, aber ich kenne den Kontakt${trail ? `: ${trail}` : ""}. Ich habe leider weder Telefonnummer noch E-Mail gefunden.` });
        }
        await setPatientCandidates(clientId, [], null);
        return res.json({ ok: false, message: `Ich finde weder einen Patienten noch einen bekannten Kontakt namens ${name} — auch nicht in E-Mails oder Anrufen.` });
      }
    } else {
      candidates = await getPatientCandidates(clientId);
      if (!candidates.length) {
        return res.json({ ok: false, message: "Für wen suche ich den Kontakt? Bitte den Namen nennen." });
      }
    }

    // Kontext-Hinweis abgleichen: erst Vorname/Jahrgang, dann Termin-Historie,
    // dann Vorgänge (Thema/Kanal/Zeitraum).
    if (hint && candidates.length > 1) {
      const r = await narrowPatientCandidatesByHint(clientId, candidates, hintLower);
      if (r.status === "one") candidates = r.narrowed;
      else if (r.status === "many") {
        await setPatientCandidates(clientId, r.narrowed, null);
        return res.json({ ok: true, message: `Das trifft noch auf mehrere zu. ${disambiguationQuestion(r.narrowed)}` });
      } else {
        // Passt der Hinweis auf keinen Patienten, ist vielleicht ein EXTERNER
        // Kontakt gemeint ("Herr Kasper wegen der Leuchtreklame" = Werbetechniker,
        // nicht der Patient Kasper) — erst prüfen, dann zurückfragen.
        if (rawName) {
          const ext = await findExternalContact(clientId, cleanSpokenPersonName(rawName) || rawName, hintLower);
          if (ext && (ext.phone || ext.email)) {
            await setPatientCandidates(clientId, [], {
              id: null, firstName: "", lastName: ext.displayName,
              mobilePhoneNumber: ext.phone, email: ext.email, hasPhone: !!ext.phone, external: true,
            });
            const trail = ext.provenance.slice(0, 2).join("; ");
            const pushed = await pushContactCard(clientId, { name: ext.displayName, phone: ext.phone, email: ext.email }, { note: trail ? trail.slice(0, 80) : "", role: "Externer Kontakt" });
            return res.json({
              ok: true,
              message: `Das passt auf keinen Patienten, aber auf einen bekannten Kontakt: ${ext.displayName}${trail ? ` — ${trail}` : ""}. ${contactPushConfirm({ name: ext.displayName, mobilePhoneNumber: ext.phone, email: ext.email }, pushed)}`,
              pushed: pushed?.sent > 0,
              directive: "Auf 'ja' + Auftrag JETZT send_sms / compose_email / delegate_call. Auf 'nein' weiter suchen.",
            });
          }
        }
        await setPatientCandidates(clientId, candidates, null);
        return res.json({ ok: true, message: `Der Hinweis hilft mir leider nicht weiter. ${disambiguationQuestion(candidates)}` });
      }
    }

    if (candidates.length > 1) {
      await setPatientCandidates(clientId, candidates, null);
      // Traegt ein KOLLEGE denselben Nachnamen (Patrikis: fuenf Patienten und
      // ein Arzt), gehoert er in die Rueckfrage — sonst sucht der Chef den
      // Kollegen zwischen lauter Patienten (Chef 27.07.2026).
      const kollege = rawName
        ? await findDirectoryContact(clientId, rawName).catch(() => null)
        : null;
      const kollegeZusatz = kollege && (kollege.mobile || kollege.phone || kollege.email)
        ? ` Oder meinen Sie den Kollegen ${kollege.name}?`
        : "";
      // Keine zitierbare Beispielantwort anhaengen ("Sie koennen auch sagen:
      // ...") — das 4B-Modell uebernimmt solche Saetze woertlich als eigene
      // Antwort statt die Rueckfrage zu stellen (Testlauf 2026-06-11).
      return res.json({ ok: true, message: `${disambiguationQuestion(candidates)}${kollegeZusatz}` });
    }

    const sel = candidates[0];
    await setPatientCandidates(clientId, candidates, sel);
    await emitCommand(clientId, {
      type: "patient_selected",
      patient: { firstName: sel.firstName, lastName: sel.lastName, birthDate: sel.birthDate },
      hasPhone: !!sel.hasPhone,
    }).catch(() => {});
    // 15.06.2026 (Chef-Wunsch): Steht GENAU EIN Kontakt fest, die Kontaktkarte
    // aufs Handy pushen und zur Bestaetigung zurueckfragen ("richtige Person?").
    // Erst nach "ja" + Auftrag wird gesendet/angerufen; bei "nein" weiter gesucht.
    // Ohne erreichbare Kontaktdaten bleibt es bei der ehrlichen Sprach-Auskunft.
    const reachable = !!(String(sel.mobilePhoneNumber || "").trim() || String(sel.email || "").trim());
    if (reachable) {
      const pushed = await pushContactCard(clientId, sel);
      return res.json({
        ok: true,
        message: `${contactPushConfirm(sel, pushed)}`,
        pushed: pushed?.sent > 0,
        directive: "Auf 'ja' + Auftrag JETZT send_sms / compose_email / delegate_call (phone leer lassen, Kontakt ist gemerkt) — NICHT erneut find_contact. Auf 'nein' weiter suchen.",
      });
    }
    return res.json({ ok: true, message: contactSummary(sel) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// KONTAKTKARTE aufs Handy schicken: pusht den zuletzt gemerkten Kontakt
// (find_contact/search_patient) als Karte. Fuer "Schick mir die Kontaktdaten
// von X aufs Handy" ruft das Modell zuerst find_contact (das pusht bereits
// automatisch); dieses Tool ist fuer "schick die Karte (nochmal)" auf den
// bereits gemerkten Kontakt. Ehrlich: ohne gekoppeltes Handy wird die Karte
// nicht behauptet, sondern die Daten vorgelesen.
router.post("/tools/push-contact", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const sel = await getSelectedPatient(clientId);
    const name = `${sel?.firstName || ""} ${sel?.lastName || ""}`.trim() || String(sel?.name || "").trim();
    const phone = String(sel?.mobilePhoneNumber || sel?.phone || "").trim();
    const email = String(sel?.email || "").trim();
    if (!sel || (!name && !phone && !email)) {
      return res.json({ ok: false, message: "Wen meinen Sie? Bitte nennen Sie mir zuerst den Namen, dann suche ich den Kontakt." });
    }
    if (!phone && !email) {
      return res.json({ ok: true, message: `Zu ${name} ist weder Telefonnummer noch E-Mail hinterlegt — es gibt nichts zu schicken.` });
    }
    const pushed = await pushContactCard(clientId, sel);
    if (pushed?.sent > 0) {
      return res.json({ ok: true, pushed: true, message: `Erledigt — ich habe Ihnen die Kontaktdaten von ${name} aufs Handy geschickt.` });
    }
    // Kein Geraet erreicht: ehrlich die Daten nennen statt einen Push zu behaupten.
    const parts = [phone && `Telefon ${phone}`, email && `E-Mail ${email}`].filter(Boolean).join(", ");
    return res.json({ ok: true, pushed: false, message: `Aufs Handy konnte ich nichts schicken — kein Geraet gekoppelt. Die Daten von ${name}: ${parts}.` });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Fallback auf den zuvor per find_contact/search_patient bestimmten Kontakt,
// damit SMS und Anruf OHNE gesprochene Telefonnummer funktionieren.
async function resolveDelegationTarget(clientId, body) {
  let phone = phoneFromRecord({
    phone: body?.phone, phoneNumber: body?.phoneNumber, mobile: body?.mobile,
  });
  let name = String(body?.recipientName || body?.contactName || "").trim();
  if (!phone) {
    const blob = [body?.phone, body?.phoneNumber, body?.message, body?.text, body?.instruction, name].filter(Boolean).join(" ");
    phone = extractPhoneFromText(blob) || "";
    if (!phone) {
      const spoken = spokenDigitsOf(blob);
      if (spoken && spoken.length >= 6) phone = spoken;
    }
  }
  const sel = await getSelectedPatient(clientId);
  if (!name) name = displayNameOf(sel);
  if (phone) return { phone, name };
  const selPhone = phoneFromRecord(sel);
  if (selPhone) return { phone: selPhone, name: name || displayNameOf(sel) };

  const cands = await getPatientCandidates(clientId);
  if (cands.length === 1) {
    const cPhone = phoneFromRecord(cands[0]);
    if (cPhone) return { phone: cPhone, name: name || displayNameOf(cands[0]) };
    if (!name) name = displayNameOf(cands[0]);
  }
  if (name) {
    const book = await listContacts(clientId, { q: name, limit: 5 }).catch(() => ({ items: [] }));
    const hit = (book.items || []).find((x) => phoneFromRecord(x));
    if (hit) return { phone: phoneFromRecord(hit), name: name || displayNameOf(hit) };
  }
  return { phone: "", name };
}


router.post("/tools/send-sms", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const target = await resolveDelegationTarget(clientId, req.body);
    const smsText = String(req.body?.message || req.body?.text || "").trim();
    if (!target.phone) {
      let missCard = null;
      try {
        missCard = karteLisaSms({
          contactName: target.name, phone: "", body: smsText, status: "no_phone",
        });
      } catch { /* Karte ist Komfort */ }
      return res.json({
        ok: false,
        message: "Ich habe keine Telefonnummer. Sage zuerst: Suche den Kontakt von — und den Namen.",
        card: missCard,
      });
    }
    // Testsuite-Schutz: validiert den kompletten Pfad (Kontakt, Nummer),
    // verschickt aber NICHTS über Twilio.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: `Testlauf: Die SMS an ${target.name || target.phone} wäre jetzt verschickt worden.` });
    }
    const out = await lisaSendSms(clientId, {
      phone: target.phone,
      message: smsText,
      recipientName: target.name,
      by: op?.name || "Team",
    });
    try {
      out.card = karteLisaSms({
        taskId: out.taskId || "",
        contactName: out.contactName || target.name,
        phone: out.phone || target.phone,
        body: out.body || smsText,
        status: out.ok ? "done" : "failed",
      });
    } catch { /* Karte ist Komfort */ }
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/tools/delegate-call", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const target = await resolveDelegationTarget(clientId, req.body);
    if (!target.phone) {
      return res.json({ ok: false, message: "Ich habe keine Telefonnummer. Sage zuerst: Suche den Kontakt von — und den Namen." });
    }
    // L3b (Chef 29.07.2026, Live 23:17): Aus "du sollst morgen frueh Termine
    // machen" wurde ein naechtlicher Anruf mit leerer Botschaft ("Bitte
    // kommen Sie morgen frueh in die Praxis" — auf "Wieso?" mauerte Lisa).
    // Ein delegierter Anruf braucht eine INHALTLICHE Botschaft: Ein blosses
    // "Komm in die Praxis" ohne jeden Grund wird nicht gewaehlt — Clara
    // fragt stattdessen nach der Botschaft.
    const instrText = String(req.body?.instruction || req.body?.message || req.body?.text || "").trim();
    const nurEinbestellung = /\b(?:komm\w*|vorbei\s?kommen|erschein\w*|in\s+die\s+praxis|zu\s+uns)\b/i.test(instrText)
      && !/\b(?:weil|wegen|grund|da\s|termin\w*|kontroll\w*|schmerz\w*|befund\w*|labor\w*|abhol\w*|besprech\w*|ergebnis\w*|unterlagen|rezept\w*|krank\w*|dringend\w*|nachricht|ausricht\w*|mitteil\w*|zahn\w*|behandl\w*|implant\w*|prothes\w*|krone\w*|fuellung\w*|füllung\w*|reinigung\w*|blutung\w*|op\b|operation\w*)\b/i.test(instrText);
    if (instrText.replace(/\s+/g, " ").length < 15 || nurEinbestellung) {
      return res.json({
        ok: false,
        needsMessage: true,
        message: "Was genau soll Lisa ausrichten — und aus welchem Grund? Ohne inhaltliche Botschaft rufe ich niemanden an. Sagen Sie zum Beispiel: Lisa soll Herrn Meier sagen, dass sein Zahnersatz da ist und er zur Eingliederung kommen kann.",
      });
    }
    // Testsuite-Schutz: validiert Kontakt + Nummer, ruft aber NIEMANDEN an.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: `Testlauf: Lisa hätte jetzt ${target.name || target.phone} angerufen.` });
    }
    const out = await lisaStartCall(clientId, {
      phone: target.phone,
      instruction: instrText,
      contactName: target.name,
      callLanguage: req.body?.callLanguage,
      by: op?.name || "Team",
    });
    if (out?.taskId) {
      try {
        out.card = karteLisaLive({
          taskId: out.taskId,
          contactName: target.name,
          phone: target.phone,
          status: out.scheduled ? "scheduled" : "calling",
          instruction: instrText,
        });
      } catch { /* Karte ist Komfort — der Anruf laeuft trotzdem */ }
    }
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Ausgang und Verlauf eines von Clara delegierten Anrufs (Chef 27.07.2026:
// "Lisa fuehrt die Auftraege super aus, aber sie gibt keine Rueckmeldung ueber
// den Gespraechsverlauf zurueck"). Die Daten lagen schon in mas_lisa_tasks —
// es fehlte der Weg zurueck in Claras Mund. Gesprochen wird der Ausgang plus
// die Zusammenfassung des GANZEN Dialogs; der volle Wortlaut steht auf der
// Karte (Flip-Rueckseite) und ist damit fuer Nachfragen gedeckt.
const LISA_OUTCOME_SATZ = {
  reached: "hat ihn erreicht",
  voicemail: "hat auf die Mailbox gesprochen",
  no_answer: "hat niemanden erreicht",
  failed: "kam nicht durch",
};

router.post("/tools/lisa-call-result", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const contactName = String(req.body?.contactName || req.body?.name || "").trim();
    const r = await findLisaCallResult(clientId, {
      taskId: String(req.body?.taskId || "").trim(),
      contactName,
    });

    if (!r.ok || r.state === "none") {
      return res.json({
        ok: true,
        found: false,
        message: contactName
          ? `Ich finde keinen Anruf von Lisa bei ${contactName}.`
          : "Lisa hat bisher keinen Anruf von mir bekommen.",
      });
    }

    const t = r.task || {};
    const wer = t.contactName || t.phone || "dem Kontakt";
    if (r.state === "running") {
      let liveCard = null;
      try {
        liveCard = karteLisaLive({
          taskId: t.id || "",
          contactName: t.contactName || "",
          phone: t.phone || "",
          status: "calling",
          instruction: t.prompt || "",
        });
      } catch { /* Karte ist Komfort */ }
      return res.json({
        ok: true, found: true, running: true, taskId: t.id || "",
        message: `Lisa telefoniert gerade noch mit ${wer}. Sie sehen den Verlauf auf dem Bildschirm.`,
        card: liveCard,
      });
    }

    // Fehlt die Verdichtung (Anruf aus der Zeit vor diesem Feature oder LLM
    // beim Auflegen nicht erreichbar), jetzt nachziehen — sonst liest Clara
    // die rohen letzten Lisa-Saetze vor, mitten im Satz abgeschnitten.
    const voll = await ensureDialogSummary(clientId, t).catch(() => t);
    const zusammenfassung = String(voll.dialogSummary || voll.resultSummary || "").trim();
    // Name IN den Satz bauen ("Lisa hat Dr. Petsas erreicht.") statt als
    // Nachklapp ("Lisa hat ihn erreicht, Dr. Petsas.") — der Nachklapp
    // verleitete die freie Umformulierung zu Stelzen wie "er war Dr. Petsas".
    const werName = t.contactName || "";
    const ausgangSatz = werName
      ? ({
        reached: `Lisa hat ${werName} erreicht.`,
        voicemail: `Lisa hat ${werName} nicht direkt erreicht und auf die Mailbox gesprochen.`,
        no_answer: `Lisa hat bei ${werName} niemanden erreicht.`,
        failed: `Lisa kam bei ${werName} nicht durch.`,
      }[t.outcome] || `Lisa hat ${werName} angerufen.`)
      : `Lisa ${LISA_OUTCOME_SATZ[t.outcome] || "hat angerufen"}.`;
    let satz = ausgangSatz
      + (zusammenfassung ? ` ${zusammenfassung}` : " Zum Inhalt liegt mir nichts vor.");
    // W-UMBAU-2 Werkzeug 1 (28.07.2026): Der Lisa-Bericht klang nach Schema
    // ("Lisa hat angerufen, X. <Zusammenfassung>"). FreiSprech erzaehlt ihn
    // lebendig nach; der Fakten-Guard sichert Namen/Zahlen/Uhrzeiten, bei
    // JEDEM Zweifel bleibt der deterministische Satz. Die Karte darunter
    // behaelt IMMER den woertlichen Inhalt (Pruefpunkt am Handy).
    try {
      satz = (await freiFormulieren(satz, {
        kontext: "Bericht ueber einen von Lisa erledigten Telefonanruf (Ausgang und Gespraechsverlauf)",
      })).text;
    } catch { /* deterministisch weiter */ }

    let card = null;
    try {
      const endedMs = t.endedAt?.toMillis?.() || t.endedAt?._seconds * 1000 || 0;
      card = karteLisaErgebnis({
        contactName: t.contactName || "",
        phone: t.phone || "",
        outcome: t.outcome || "",
        summary: zusammenfassung,
        auftrag: t.prompt || "",
        transcript: t.transcriptText || "",
        endedMs,
        durationSecs: Number(t.durationSecs || 0) || 0,
      });
    } catch { /* Karte ist Komfort */ }

    return res.json({
      ok: true, found: true, taskId: t.id || "", outcome: t.outcome || "",
      message: satz, card,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Clara calendar tools (custom_tools called by the voice worker) -------
// These are MAS-2's own endpoints. They run the same Pickadoc Cloud Functions
// the phone agent uses AND emit live UI commands so the monitor follows along.
function spokenSlots(slots, max = 6) {
  return (slots || [])
    .slice(0, max)
    .map((iso) => String(iso).replace("T", " ").slice(0, 16))
    .join(", ");
}


router.post("/tools/find-slots", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const result = await findSlots(clientId, req.body || {});
    if (!result.ok) {
      return res.json({ ok: false, message: `Keine Termine gefunden: ${result.error}` });
    }
    if (result.date) {
      await emitCommand(clientId, {
        type: "navigate",
        date: result.date,
        calendarId: result.calendarId,
        calendarName: result.calendarName,
        slots: (result.slots || []).slice(0, 12),
        visitMotiveName: result.visitMotiveName,
      });
    }
    const msg = result.slots.length
      ? `Freie Termine bei ${result.calendarName || "der Praxis"}: ${spokenSlots(result.slots)}.`
      : "Keine freien Termine im gewünschten Zeitraum.";
    res.json({ ok: true, message: msg, slots: result.slots, date: result.date });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/tools/book-appointment", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const result = await bookAppointment(clientId, req.body || {});
    if (!result.ok) {
      return res.json({ ok: false, message: `Buchung nicht möglich: ${result.error}` });
    }
    await emitCommand(clientId, {
      type: "appointment_created",
      date: result.date,
      slotIso: result.slotIso,
      calendarId: result.calendarId,
      calendarName: result.calendarName,
      patient: result.patient,
      visitMotiveName: result.visitMotiveName,
    });
    const who = `${result.patient.firstName} ${result.patient.lastName}`.trim();
    res.json({
      ok: true,
      message: `Termin gebucht für ${who} am ${String(result.slotIso).replace("T", " ").slice(0, 16)}.`,
      dryRun: !!result.dryRun,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Internal-team patient flow (search existing patient + book by id) ----
// Clara books for the practice staff: they name an EXISTING patient (no phone).
// search_patient finds them; the choice is remembered server-side; then
// book_for_patient books by patientId and drives the live monitor (jump to the
// day, open the appointment popup pre-filled). Uses the dedicated additive
// Cloud Functions masSearchPatients / masBookAppointment.
function prettySlot(iso) {
  return String(iso || "").replace("T", " ").slice(0, 16);
}
function birthYear(b) {
  const s = String(b || "");
  return /^\d{4}/.test(s) ? s.slice(0, 4) : "";
}
function patientLabel(p) {
  const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  const y = birthYear(p.birthDate);
  return y ? `${name} (Jahrgang ${y})` : name;
}

// Cross-Call-Gedaechtnis: ausdrueckliche Anschluss-Nachfrage an das ZULETZT
// beendete Gespraech ("der Patient von vorhin", "machen wir mit eben weiter",
// "der Vorgang von gerade"). Bewusst eng gehaltene Phrasen, damit kein echter
// Name faelschlich als Kontinuitaet gilt; "letzte/r" ist absichtlich NICHT
// dabei (kollidiert mit Datumsangaben wie "letzten Montag").
const CONTINUITY_RE = /\b(vorhin|vorher|eben|grad eben|gerade eben|von gerade|zuletzt|von vorhin|von eben)\b/i;
// Frischefenster: nur ein kuerzlich beendetes Gespraech darf reaktiviert werden.
const CONTINUITY_MAX_AGE_MS = 45 * 60 * 1000;
function isContinuityReference(text) {
  return CONTINUITY_RE.test(String(text || ""));
}
function freshLastContext(lc) {
  if (!lc || !lc.endedAt) return null;
  if (Date.now() - Number(lc.endedAt) > CONTINUITY_MAX_AGE_MS) return null;
  return lc;
}


router.post("/tools/search-patient", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = (req.body?.name || req.body?.query || "").trim();
    const hint = String(req.body?.hint || "").trim();
    const hintLower = hint.toLowerCase();

    // Ordinal-Antworten ("der erste") beziehen sich IMMER auf die zuletzt
    // VORGELESENE Kandidatenliste — nie auf eine frische Namenssuche. Sonst
    // greift "der erste" auf einer neu sortierten Liste daneben (Testlauf
    // 2026-06-11: name="Meier" + hint="der erste" traf Rainer statt Stefan).
    const ordinalSource = `${hintLower} ${rawName.toLowerCase()}`.trim();
    if (ordinalSource) {
      const remembered = await getPatientCandidates(clientId);
      // Nur wenn tatsaechlich eine Auswahl offen ist (>1 gemerkte Kandidaten).
      const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
      if (byOrd) {
        await setPatientCandidates(clientId, [byOrd], byOrd);
        await emitCommand(clientId, {
          type: "patient_selected",
          patient: { firstName: byOrd.firstName, lastName: byOrd.lastName, birthDate: byOrd.birthDate },
          hasPhone: !!byOrd.hasPhone,
        });
        const warn = byOrd.hasPhone ? "" : " Achtung: keine Telefonnummer hinterlegt.";
        // Anweisung ans Modell (Stefan-Meier-Loop 12.06.): Nach der Auswahl
        // NICHT erneut suchen, sondern den urspruenglichen Auftrag ausfuehren
        // (book_for_patient, delegate_call, ...). Der Patient ist gemerkt.
        return res.json({
          ok: true,
          message: `${patientLabel(byOrd)} ist eindeutig gemerkt.${warn} Fuehre den urspruenglichen Auftrag JETZT direkt aus: book_for_patient fuers Buchen, delegate_call fuer einen Anruf, send_sms fuer eine SMS — NICHT search_patient oder find_contact aufrufen, der Patient ist schon gefunden.`,
        });
      }
    }
    if (rawName && isOrdinalChoice(rawName)) {
      return res.json({ ok: false, message: "Welchen Eintrag meinen Sie? Bitte den Namen nennen." });
    }

    // Cross-Call-Gedaechtnis: "den Patienten von vorhin" — bezieht sich auf das
    // ZULETZT beendete Gespraech, nicht auf eine offene Kandidatenliste. Greift
    // nur, wenn KEIN echter Name vorliegt (cleanSpokenPersonName leer), KEINE
    // Auswahl mehr offen ist und der lastContext frisch ist. Wird der Patient
    // reaktiviert, nennt die Antwort ausdruecklich den Namen, damit ein Hoerer
    // einen Fehlgriff sofort korrigieren kann (Halluzinations-Schutz).
    const continuitySrc = `${rawName} ${hint}`.trim();
    const hasRealName = !!(rawName && (cleanSpokenPersonName(rawName) || "").trim());
    if (!hasRealName && isContinuityReference(continuitySrc)) {
      const remembered = await getPatientCandidates(clientId);
      if (remembered.length <= 1) {
        const lc = freshLastContext(await getLastContext(clientId));
        const p = lc?.patient;
        if (p && (p.firstName || p.lastName)) {
          await setPatientCandidates(clientId, [p], p);
          await emitCommand(clientId, {
            type: "patient_selected",
            patient: { firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate },
            hasPhone: !!p.hasPhone,
          });
          return res.json({
            ok: true,
            message: `Ich knuepfe an ${patientLabel(p)} aus dem vorigen Gespraech an. Fuehre den Auftrag JETZT direkt aus: book_for_patient fuers Buchen, delegate_call fuer einen Anruf, send_sms fuer eine SMS — NICHT erneut suchen.`,
          });
        }
      }
    }

    // Gleiche Identifikations-Route wie find_contact: bei einer Nachfrage
    // ("der, der gestern da war") OHNE neuen Namen gegen die gemerkten
    // Kandidaten der letzten Suche disambiguieren — auch vor Terminbuchung.
    let patients = [];
    if (rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const result = await searchPatientSpoken(clientId, name);
      if (!result.ok) {
        return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${result.error}` });
      }
      patients = result.patients || [];
      if (patients.length === 0) {
        await setPatientCandidates(clientId, [], null);
        // W-DIALOG WP6: Herkunft nennen + Adressbuch mitpruefen (kein Neustart).
        let contacts = [];
        try {
          contacts = await searchContacts(clientId, name, 3);
        } catch { contacts = []; }
        if (contacts.length) {
          const labels = contacts.map((c) => {
            const cat = c.category ? ` (${c.category})` : "";
            return `${c.name}${cat}`;
          });
          const list = labels.length === 1
            ? labels[0]
            : `${labels.slice(0, -1).join(", ")} und ${labels[labels.length - 1]}`;
          return res.json({
            ok: true,
            searchedIn: ["patients", "contacts"],
            contacts,
            message: `In den Patienten nichts zu ${name}. Im Adressbuch finde ich: ${list}. Meinen Sie einen davon?`,
          });
        }
        return res.json({
          ok: true,
          searchedIn: ["patients", "contacts"],
          contacts: [],
          message: `Kein Patient mit dem Namen ${name} gefunden. Auch im Adressbuch nichts Passendes.`,
        });
      }
      // Exakter / fast-exakter Name schlaegt Teil-Treffer (Haila El-Otmani
      // darf nicht Theresa Heldmann als zweiten Treffer behalten).
      if (patients.length > 1) patients = tightenNameHits(name, patients);
    } else {
      patients = await getPatientCandidates(clientId);
      if (!patients.length) {
        return res.json({ ok: false, message: "Bitte einen Namen nennen." });
      }
    }

    if (hint && spokenLooksLikeNewPerson(hint, patients)) {
      const result = await searchPatientSpoken(clientId, hint);
      if (result.ok) {
        patients = result.patients || [];
        if (patients.length > 1) patients = tightenNameHits(hint, patients);
        if (!patients.length) {
          await setPatientCandidates(clientId, [], null);
          return res.json({
            ok: true,
            message: `Kein Patient mit dem Namen ${hint} gefunden.`,
          });
        }
      }
    }

    if (hint && patients.length > 1) {
      const r = await narrowPatientCandidatesByHint(clientId, patients, hintLower);
      if (r.status === "one") patients = r.narrowed;
      else if (r.status === "many") {
        await setPatientCandidates(clientId, r.narrowed, null);
        return res.json({ ok: true, message: `Das trifft noch auf mehrere zu. ${disambiguationQuestion(r.narrowed)}` });
      } else {
        // "none" heisst: die NAMEN passen, nur der HINWEIS grenzt nicht ein
        // ("der gestern da war" traf keinen). Das ehrlich sagen statt des
        // verwirrenden "kein passender Treffer" (Live-Gespraech 11.06. 16:00).
        await setPatientCandidates(clientId, patients, null);
        return res.json({ ok: true, message: `Der Hinweis hilft mir leider nicht weiter. ${disambiguationQuestion(patients)}` });
      }
    }

    if (patients.length === 1) {
      const sel = patients[0];
      await setPatientCandidates(clientId, patients, sel);
      await emitCommand(clientId, {
        type: "patient_selected",
        patient: { firstName: sel.firstName, lastName: sel.lastName, birthDate: sel.birthDate },
        hasPhone: !!sel.hasPhone,
      });
      const warn = sel.hasPhone ? "" : " Achtung: keine Telefonnummer hinterlegt.";
      // Keine Buchungsfrage anhaengen: das Tool wird auch fuer reine
      // Nachschlage-Fragen genutzt und drueckte Clara sonst bei jeder
      // Patientensuche in den Termin-Modus (2026-06-10). AUSNAHME: war dies
      // eine Nachfrage zur Kandidatenliste (ohne neuen Namen), laeuft gerade
      // ein Auftrag — dann das Modell zum Ausfuehren lotsen statt es weiter
      // suchen zu lassen (Stefan-Meier-Loop 12.06.).
      const followUp = !rawName
        ? " Fuehre den urspruenglichen Auftrag JETZT direkt aus: book_for_patient fuers Buchen, delegate_call fuer einen Anruf, send_sms fuer eine SMS — NICHT search_patient oder find_contact aufrufen, der Patient ist schon gefunden."
        : "";
      return res.json({
        ok: true,
        message: `${patientLabel(sel)} gefunden.${warn}${followUp}`,
      });
    }

    // Multiple matches: remember candidates, ask to disambiguate (no selection).
    await setPatientCandidates(clientId, patients, null);
    await emitCommand(clientId, {
      type: "patient_candidates",
      candidates: patients.slice(0, 6).map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        hasPhone: !!p.hasPhone,
      })),
    });
    // Keine zitierbare Beispielantwort anhaengen — siehe find_contact oben.
    return res.json({ ok: true, message: disambiguationQuestion(patients) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Kontaktkarte: "Wie ist die Telefonnummer von Herrn Tzannis?" — identifiziert
// den Patienten über die gleiche Route wie search_patient/find_contact, liest
// Mobil/Festnetz/E-Mail aus dem Patientendokument und PUSHT die Karte aufs
// gekoppelte Handy (Antippen = anrufen). Gesprochen wird die Nummer dazu.
function spokenPhoneNumber(raw) {
  const d = String(raw || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  // "01776004600" -> "0177 600 4600", "+4915253904756" -> "+49 152 539 04 756"
  // — Häppchen liest die TTS sauber vor; nie eine einzelne Ziffer am Ende.
  let prefix = "";
  let body = d;
  let m;
  if ((m = /^0(\d{3})(\d+)$/.exec(d))) { prefix = `0${m[1]}`; body = m[2]; }
  else if ((m = /^(\+\d{2})(\d+)$/.exec(d))) { prefix = m[1]; body = m[2]; }
  const groups = [];
  let i = 0;
  while (i < body.length) {
    const take = body.length - i === 4 ? 2 : 3;
    groups.push(body.slice(i, i + take));
    i += take;
  }
  return `${prefix} ${groups.join(" ")}`.trim();
}


router.post("/tools/contact-card", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = (req.body?.name || "").trim();
    const hint = String(req.body?.hint || "").trim();

    // Ordinal zuerst — "Den ersten Eintrag" darf nie als frische Namenssuche
    // laufen (14.08.2026: Haila/Heldmann -> Philipp-Moritz Bitter).
    let patients = [];
    let pickedByOrdinal = false;
    {
      const ordinalSource = `${hint} ${rawName}`.trim().toLowerCase();
      if (ordinalSource) {
        const remembered = await getPatientCandidates(clientId);
        const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
        if (byOrd) {
          patients = [byOrd];
          pickedByOrdinal = true;
        }
      }
    }
    if (!pickedByOrdinal && rawName && isOrdinalChoice(rawName)) {
      return res.json({ ok: false, message: "Welchen Eintrag meinen Sie? Bitte den Namen nennen." });
    }

    // Kollegen zuerst (Chef 27.07.2026) — siehe find-contact: gleichnamige
    // Alt-Datensaetze in der Kartei duerfen Dr. Petsas nicht verdecken.
    if (!pickedByOrdinal && rawName && hasColleagueTitle(rawName)) {
      const kollege = await findDirectoryContact(clientId, rawName).catch(() => null);
      if (kollege && (kollege.mobile || kollege.phone || kollege.email)) {
        const nummer = kollege.mobile || kollege.phone;
        const pushed = await pushContactCard(
          clientId,
          { name: kollege.name, phone: nummer, email: kollege.email },
          { note: kollege.role || "Praxis-Team" },
        );
        const gesprochen = [
          `${kollege.name}:`,
          kollege.mobile ? `Mobil ${spokenPhoneNumber(kollege.mobile)}.` : "",
          !kollege.mobile && kollege.phone ? `Festnetz ${spokenPhoneNumber(kollege.phone)}.` : "",
          pushed?.sent > 0
            ? "Ich habe Ihnen die Kontaktkarte aufs Handy geschickt - antippen und Sie können direkt anrufen."
            : "Die Karte konnte ich nicht aufs Handy schicken - kein gekoppeltes Gerät erreichbar.",
        ].filter(Boolean).join(" ");
        return res.json({ ok: true, pushed: pushed?.sent > 0, message: gesprochen });
      }
    }

    // Patient identifizieren — gleiche Route wie search_patient (inkl.
    // Nachfrage gegen die gemerkten Kandidaten und STT-Varianten-Suche).
    if (!pickedByOrdinal && rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const result = await searchPatientSpoken(clientId, name);
      if (!result.ok) return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${result.error}` });
      patients = result.patients || [];
      if (patients.length > 1) patients = tightenNameHits(name, patients);
      if (!patients.length) {
        await setPatientCandidates(clientId, [], null);
        return res.json({ ok: true, message: `Kein Patient mit dem Namen ${name} gefunden.` });
      }
    } else if (!pickedByOrdinal) {
      patients = await getPatientCandidates(clientId);
      if (!patients.length) {
        const sel = await getSelectedPatient(clientId);
        if (sel?.id) patients = [sel];
      }
      if (!patients.length) return res.json({ ok: false, message: "Bitte einen Namen nennen." });
    }

    // Neuer Name nach falscher Trefferliste: nicht in Amofa/Karadavut
    // weitersuchen, sondern frisch (Chef 14.08.2026, Muhamedjanowa).
    if (!pickedByOrdinal && hint && spokenLooksLikeNewPerson(hint, patients)) {
      const result = await searchPatientSpoken(clientId, hint);
      if (result.ok) {
        patients = result.patients || [];
        if (patients.length > 1) patients = tightenNameHits(hint, patients);
        if (!patients.length) {
          await setPatientCandidates(clientId, [], null);
          return res.json({ ok: true, message: `Kein Patient mit dem Namen ${hint} gefunden.` });
        }
      }
    }

    if (hint && patients.length > 1) {
      const r = await narrowPatientCandidatesByHint(clientId, patients, hint.toLowerCase());
      if (r.status === "one") patients = r.narrowed;
      else {
        const pool = r.status === "many" ? r.narrowed : patients;
        await setPatientCandidates(clientId, pool, null);
        return res.json({ ok: true, message: `Das trifft auf mehrere zu. ${disambiguationQuestion(pool)}` });
      }
    }
    if (patients.length > 1) {
      await setPatientCandidates(clientId, patients, null);
      return res.json({ ok: true, message: disambiguationQuestion(patients) });
    }

    const sel = patients[0];
    await setPatientCandidates(clientId, patients, sel);
    const who = `${sel.firstName || ""} ${sel.lastName || ""}`.trim();

    // Kontaktdaten aus dem Patientendokument.
    const booking = await loadBooking(clientId).catch(() => null);
    let pdoc = null;
    if (booking?.locationId && sel.id) {
      pdoc = await admin.firestore()
        .collection("clients").doc(clientId)
        .collection("locations").doc(booking.locationId)
        .collection("patients").doc(String(sel.id)).get()
        .then((s2) => (s2.exists ? s2.data() : null))
        .catch(() => null);
    }
    const mobile = String(pdoc?.mobilePhoneNumber || "").trim();
    const phone = String(pdoc?.phoneNumber || "").trim();
    const email = String(pdoc?.email || "").trim();
    if (!mobile && !phone && !email) {
      return res.json({ ok: true, message: `${who} gefunden, aber es sind keine Kontaktdaten hinterlegt.` });
    }

    // Karte aufs gekoppelte Handy pushen (Antippen öffnet Anrufen/SMS).
    let pushed = false;
    try {
      const op = await getOperator(clientId);
      if (op?.id) {
        const qp = new URLSearchParams({ n: who });
        if (mobile) qp.set("m", mobile);
        if (phone) qp.set("p", phone);
        if (email) qp.set("e", email);
        const url = `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/m/contact.html?${qp.toString()}`;
        const bodyBits = [mobile && `📱 ${mobile}`, !mobile && phone && `📞 ${phone}`, email].filter(Boolean);
        const r = await notifyOperator(clientId, op.id, { title: `Kontakt: ${who}`, body: bodyBits.join(" · "), url });
        pushed = !!r.ok;
      }
    } catch { /* Push ist Komfort — die gesprochene Antwort steht auch ohne */ }

    const parts = [`${who}:`];
    if (mobile) parts.push(`Mobil ${spokenPhoneNumber(mobile)}.`);
    if (!mobile && phone) parts.push(`Festnetz ${spokenPhoneNumber(phone)}.`);
    if (!mobile && !phone && email) parts.push(`Keine Telefonnummer, aber eine E-Mail-Adresse ist hinterlegt.`);
    parts.push(pushed
      ? "Ich habe Ihnen die Kontaktkarte aufs Handy geschickt — antippen und Sie können direkt anrufen."
      : "Die Karte konnte ich nicht aufs Handy schicken — kein gekoppeltes Gerät erreichbar.");
    // 27.07.2026: bisher ging NUR eine Push-Nachricht raus; auf der Flip-
    // Rueckseite stand nichts, obwohl Clara "Karte aufs Handy geschickt" sagte.
    let card = null;
    try { card = karteKontakt({ name: who, mobile, phone, email, pushed }); } catch { /* Karte ist Komfort */ }
    return res.json({ ok: true, message: parts.join(" "), card });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Delay between progressive draft steps so the team can SEE the dialog fill
// field by field on the monitor. Tunable via env (0 = fill instantly).
const DRAFT_STEP_MS = Number(process.env.MAS_DRAFT_STEP_MS || 600);
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));


router.post("/tools/book-for-patient", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const selected = await getSelectedPatient(clientId);
    if (!selected || !selected.id) {
      return res.json({ ok: false, message: "Bitte zuerst den Patienten eindeutig suchen." });
    }
    if (!req.body?.appointmentStartDate) {
      return res.json({ ok: false, message: "Zu welchem Datum und welcher Uhrzeit?" });
    }

    // Ohne Arzt-Angabe: in den Kalender des gekoppelten Behandlers buchen —
    // nicht in den Praxis-Default. Gleiches Prinzip wie bei den Tagesansichten.
    let doctorName = String(req.body?.doctorName || "").trim();
    if (!doctorName) {
      try {
        const op = await getOperator(clientId);
        doctorName = String(op?.doctorName || op?.name || "").trim();
      } catch { /* fällt auf den Praxis-Default zurück */ }
    }

    // Resolve calendar + motive + time WITHOUT writing anything yet.
    const r = await resolveBooking(clientId, {
      doctorName: doctorName || undefined,
      visitMotiveName: req.body?.visitMotiveName,
      appointmentStartDate: req.body.appointmentStartDate,
    });
    if (!r.ok) {
      const map = {
        no_calendar: "Bei welchem Arzt soll der Termin gebucht werden?",
        no_motive: "Welche Behandlung soll gebucht werden?",
      };
      return res.json({ ok: false, message: map[r.error] || `Buchung nicht möglich: ${r.error}` });
    }

    const who = `${selected.firstName || ""} ${selected.lastName || ""}`.trim();
    // Testsuite-Schutz: Kalender/Behandlung/Zeit sind validiert (resolveBooking
    // lief durch), aber es wird NICHTS gebucht und kein Dialog geöffnet.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: `Testlauf: Der Termin für ${who} am ${r.slotIso} bei ${r.calendarName} wäre jetzt gebucht worden.` });
    }
    const patientPayload = {
      id: selected.id,
      firstName: selected.firstName,
      lastName: selected.lastName,
      hasPhone: !!selected.hasPhone,
    };
    const baseDraft = {
      type: "appointment_draft",
      status: "collecting",
      date: r.date,
      slotIso: r.slotIso,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
      visitMotiveId: r.visitMotiveId,
      visitMotiveName: r.visitMotiveName,
      visitMotiveDuration: r.visitMotiveDuration,
    };

    // Jump the monitor to the day, then OPEN AN EMPTY new-appointment dialog and
    // fill it step by step: time+calendar -> patient -> treatment. Each emit is a
    // cumulative snapshot; the dialog re-syncs on every change.
    await emitCommand(clientId, {
      type: "navigate",
      date: r.date,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
    });
    // step 1: time + calendar (patient + treatment still empty)
    await emitCommand(clientId, {
      type: "appointment_draft",
      status: "collecting",
      date: r.date,
      slotIso: r.slotIso,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
    });
    await sleep(DRAFT_STEP_MS);
    // step 2: + patient
    await emitCommand(clientId, {
      type: "appointment_draft",
      status: "collecting",
      date: r.date,
      slotIso: r.slotIso,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
      patient: patientPayload,
    });
    await sleep(DRAFT_STEP_MS);
    // step 3: + treatment (full draft)
    const fullDraft = { ...baseDraft, patient: patientPayload };
    await emitCommand(clientId, fullDraft);

    // Dry-run: never write a real appointment.
    if (process.env.MAS_BOOKING_DRY_RUN === "1") {
      await emitCommand(clientId, { ...fullDraft, status: "booked" });
      await clearSelectedPatient(clientId);
      return res.json({
        ok: true,
        dryRun: true,
        booked: true,
        message: `Testmodus: Termin für ${who} am ${prettySlot(r.slotIso)} vorbereitet.`,
      });
    }

    // No phone on file -> hand off to the human: leave the dialog open so the
    // number can be entered and saved through the normal flow. No booking.
    if (!selected.hasPhone) {
      await emitCommand(clientId, { ...fullDraft, status: "need_phone" });
      return res.json({
        ok: true,
        needsPhone: true,
        message: `${who} hat keine Telefonnummer hinterlegt. Der Termin ist im Kalender geöffnet — bitte die Nummer ergänzen und speichern.`,
      });
    }

    // Phone present -> book via the dedicated Cloud Function.
    const c = await commitBooking(clientId, {
      patientId: selected.id,
      calendarId: r.calendarId,
      visitMotiveId: r.visitMotiveId,
      slotIso: r.slotIso,
    });

    if (c.ok && c.needsPhone) {
      await emitCommand(clientId, { ...fullDraft, status: "need_phone" });
      return res.json({
        ok: true,
        needsPhone: true,
        message: `${who} hat keine Telefonnummer hinterlegt. Bitte im geöffneten Termin ergänzen und speichern.`,
      });
    }
    if (!c.ok) {
      // Leave the filled draft open so the team can adjust (e.g. another time).
      return res.json({ ok: false, message: `Buchung nicht möglich: ${c.error}` });
    }

    // Booked: open the saved appointment once it lands via the calendar listener.
    await emitCommand(clientId, {
      type: "appointment_created",
      date: r.date,
      slotIso: r.slotIso,
      calendarId: r.calendarId,
      calendarName: c.doctorName || r.calendarName,
      visitMotiveName: r.visitMotiveName,
      patient: { firstName: selected.firstName, lastName: selected.lastName },
    });
    await clearSelectedPatient(clientId);

    // Read-before-act, spoken back: if this patient ALREADY had an open case
    // in the shared brain, Clara mentions it right after confirming the
    // booking. Looked up BEFORE recording the booking event, so the hint can
    // never be the case this very booking just created.
    let memoryHint = "";
    try {
      const open = await listCases(clientId, { patientId: selected.id, activeOnly: true, limit: 3 });
      if (open.length) {
        const top = open[0];
        memoryHint = ` Hinweis aus dem Praxisgedächtnis: Zu ${who} gibt es einen offenen Vorgang (${top.title || top.topic})${top.assignee ? `, liegt bei ${top.assignee}` : ""}.`;
      }
    } catch { /* hint only — booking already succeeded */ }

    // Shared-brain contract: EVERY action lands on the patient's timeline
    // immediately, with operator attribution. The calendar watch skips this
    // appointment later because the appt-action event already exists.
    const opNow = await getOperator(clientId).catch(() => null);
    if (!c.alreadyBooked) {
      await recordCommunication(clientId, {
        id: `appt-action:${c.appointmentId || `${selected.id}:${r.slotIso}`}:booked`,
        channel: "clara_voice",
        direction: "internal",
        type: "interaction",
        counterparty: { kind: "patient", name: who, ref: null },
        subject: { patientId: selected.id, name: who, matchStatus: "matched", matchMethod: "calendar" },
        signals: { appointmentRequest: true },
        summary: `Clara hat für ${who} am ${prettySlot(r.slotIso)}${r.calendarName ? ` bei ${r.calendarName}` : ""} gebucht (${r.visitMotiveName || "Kontrolle"})${opNow?.name ? ` — auf Zuruf von ${opNow.name}` : ""}.`,
        extractor: "clara@booking",
        payloadRef: c.appointmentId ? { kind: "appointment", id: c.appointmentId } : null,
      }, { by: "Clara" });
    }

    // Beleg-Screenshot aufs Handy (14.06.2026): gleiche Mechanik wie bei der
    // Abwesenheit. publishProof speichert die Beleg-Karte, baut die SVG-URL und
    // pusht sie an gekoppelte Geraete. Best-effort — eine Buchung gilt auch ohne
    // Handy als erledigt. Clara erwaehnt den Beleg NUR, wenn der Push wirklich
    // an mindestens ein Geraet ging (kein falsches Versprechen).
    let proofNote = "";
    try {
      const proof = await publishProof(clientId, buildAppointmentProof({
        slotIso: r.slotIso,
        patientFirstName: selected.firstName,
        patientLastName: selected.lastName,
        visitMotiveName: r.visitMotiveName,
      }, { calendarName: c.doctorName || r.calendarName }));
      if (proof?.pushed?.sent > 0) proofNote = " Den Beleg habe ich Ihnen aufs Handy geschickt.";
    } catch { /* Beleg ist Komfort, nie ein Blocker fuer die Buchung */ }

    const pre = c.alreadyBooked ? "Der Termin war bereits gebucht" : "Termin gebucht";
    return res.json({
      ok: true,
      booked: true,
      message: `${pre} für ${who} am ${prettySlot(r.slotIso)}${r.calendarName ? ` bei ${r.calendarName}` : ""}.${memoryHint}${proofNote}`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

export default router;
