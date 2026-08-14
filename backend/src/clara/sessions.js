import { randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

const FieldValue = admin.firestore.FieldValue;

// Live session channel. The PC (CalendR / Clara page) creates a session and a
// "live_session" pointer; the voice tools (which only know clientId) resolve the
// currently active session via that pointer and push UI commands. The PC listens
// to the session doc via onSnapshot and reacts (navigate to day, open popup).
//
// One active live session per client at a time is sufficient for in-practice use;
// concurrent multi-session follow is a later refinement (per-session profiles).

function sessionsCol(clientId) {
  return masCollection(clientId, "mas_sessions");
}
function configCol(clientId) {
  return masCollection(clientId, "mas_config");
}
// Voice working memory (active case / selected patient / operator). Kept on a
// stable per-client doc so the voice loop works WITHOUT a PC monitor session
// (e.g. briefings in the car). When a live session exists we also mirror the
// state onto the session doc so the monitor reflects what Clara is doing.
function voiceStateRef(clientId) {
  return configCol(clientId).doc("voice_state");
}
async function mirrorToSession(clientId, patch) {
  const sid = await getActiveSessionId(clientId);
  if (!sid) return null;
  await sessionsCol(clientId).doc(sid).set({ updatedAt: FieldValue.serverTimestamp(), ...patch }, { merge: true }).catch(() => {});
  return sid;
}

export async function createSession(clientId, sessionId) {
  const sid = (sessionId || "").trim() || `s_${randomUUID().slice(0, 8)}`;
  const now = FieldValue.serverTimestamp();
  await sessionsCol(clientId).doc(sid).set(
    {
      sessionId: sid,
      clientId,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      commandSeq: 0,
      lastCommand: null,
    },
    { merge: true }
  );
  // Point "currently active" live session at this one.
  await configCol(clientId).doc("live_session").set(
    { sessionId: sid, status: "waiting", updatedAt: now },
    { merge: true }
  );
  return { sessionId: sid };
}

export async function getActiveSessionId(clientId) {
  const snap = await configCol(clientId).doc("live_session").get();
  if (!snap.exists) return null;
  const sid = snap.data()?.sessionId;
  return sid ? String(sid) : null;
}

// Push a UI command to the active session. The PC reacts to lastCommand.seq
// changing. History is kept for debugging / replay.
export async function emitCommand(clientId, command) {
  const sid = await getActiveSessionId(clientId);
  if (!sid) return { ok: false, reason: "no_active_session" };
  const ref = sessionsCol(clientId).doc(sid);
  const cmd = { id: randomUUID(), ts: Date.now(), ...command };
  await ref.set(
    {
      status: "active",
      updatedAt: FieldValue.serverTimestamp(),
      commandSeq: FieldValue.increment(1),
      lastCommand: cmd,
      history: FieldValue.arrayUnion(cmd),
    },
    { merge: true }
  );
  return { ok: true, sessionId: sid, command: cmd };
}

// --- Server-side patient selection state ---------------------------------
// The voice LLM must NEVER carry a Firestore patientId across turns (an 8B
// model mangles opaque ids). Instead we remember the team's patient choice on
// the active session doc: search_patient stores candidates and (if unique) the
// selected patient; book_for_patient reads selectedPatient back. Robust + the
// monitor can show who Clara picked.

export async function setPatientCandidates(clientId, candidates, selected) {
  const data = {
    patientCandidates: Array.isArray(candidates) ? candidates : [],
    selectedPatient: selected || null,
  };
  await voiceStateRef(clientId).set({ updatedAt: FieldValue.serverTimestamp(), ...data }, { merge: true });
  const sid = await mirrorToSession(clientId, data);
  return { ok: true, sessionId: sid };
}

export async function getSelectedPatient(clientId) {
  const snap = await voiceStateRef(clientId).get();
  if (!snap.exists) return null;
  return snap.data()?.selectedPatient || null;
}

// Kandidaten der letzten Suche (fuer Kontext-Nachfragen wie "der, der gestern
// da war" — find_contact gleicht den Hinweis gegen genau diese Liste ab).
export async function getPatientCandidates(clientId) {
  const snap = await voiceStateRef(clientId).get();
  if (!snap.exists) return [];
  const list = snap.data()?.patientCandidates;
  return Array.isArray(list) ? list : [];
}

export async function clearSelectedPatient(clientId) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), selectedPatient: null, patientCandidates: [] },
    { merge: true }
  );
  await mirrorToSession(clientId, { selectedPatient: null, patientCandidates: [] });
  return { ok: true };
}

// --- Server-side active-case state ---------------------------------------
// Same principle as selectedPatient: the voice LLM must not juggle case ids.
// find_case stores the resolved case here; assign/update/close read it back.

export async function setActiveCase(clientId, activeCase) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), activeCase: activeCase || null },
    { merge: true }
  );
  const sid = await mirrorToSession(clientId, { activeCase: activeCase || null });
  return { ok: true, sessionId: sid };
}

export async function getActiveCase(clientId) {
  const snap = await voiceStateRef(clientId).get();
  if (!snap.exists) return null;
  return snap.data()?.activeCase || null;
}

export async function clearActiveCase(clientId) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), activeCase: null },
    { merge: true }
  );
  await mirrorToSession(clientId, { activeCase: null });
  return { ok: true };
}

// --- Lena-Aufnahme: schwebende Bestaetigung + laufende Aufnahme (W-LENA-1) ---
// pendingRecording: der noch NICHT bestaetigte Aufnahme-Kandidat ("Aufnahme
// fuer Frau Mueller, richtig?"). Ein "Ja" startet ihn, "Nein, Herr Meier"
// ersetzt ihn. Nie geraten: der Patient stammt IMMER aus dem echten Kalender.
// activeRecording: die gerade laufende Aufnahme (fuer "Clara, beende die
// Aufnahme" ohne Namensnennung).

export async function setPendingRecording(clientId, pending) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), pendingRecording: pending || null },
    { merge: true }
  );
  await mirrorToSession(clientId, { pendingRecording: pending || null });
  return { ok: true };
}

export async function getPendingRecording(clientId) {
  const snap = await voiceStateRef(clientId).get();
  if (!snap.exists) return null;
  return snap.data()?.pendingRecording || null;
}

export async function clearPendingRecording(clientId) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), pendingRecording: null },
    { merge: true }
  );
  await mirrorToSession(clientId, { pendingRecording: null });
  return { ok: true };
}

// pendingLisaCall: Anruf vorgemerkt, noch NICHT gewählt. Super-GAU 14.08.2026:
// Lisa wählt erst nach ausdrücklichem "Ja" und NUR die Nummer aus dem Datensatz.
export async function setPendingLisaCall(clientId, pending) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), pendingLisaCall: pending || null },
    { merge: true }
  );
  await mirrorToSession(clientId, { pendingLisaCall: pending || null });
  return { ok: true };
}

export async function getPendingLisaCall(clientId) {
  const snap = await voiceStateRef(clientId).get();
  if (!snap.exists) return null;
  return snap.data()?.pendingLisaCall || null;
}

export async function clearPendingLisaCall(clientId) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), pendingLisaCall: null },
    { merge: true }
  );
  await mirrorToSession(clientId, { pendingLisaCall: null });
  return { ok: true };
}

export async function setActiveRecording(clientId, active) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), activeRecording: active || null },
    { merge: true }
  );
  await mirrorToSession(clientId, { activeRecording: active || null });
  return { ok: true };
}

export async function getActiveRecording(clientId) {
  const snap = await voiceStateRef(clientId).get();
  if (!snap.exists) return null;
  return snap.data()?.activeRecording || null;
}

export async function clearActiveRecording(clientId) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), activeRecording: null },
    { merge: true }
  );
  await mirrorToSession(clientId, { activeRecording: null });
  return { ok: true };
}

// --- Server-side operator (who is speaking) ------------------------------
// Set once per session after PIN/login identification. Voice tools read it to
// scope the briefing by role and to credit the real human in the case log.

export async function setOperator(clientId, operator) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), operator: operator || null },
    { merge: true }
  );
  const sid = await mirrorToSession(clientId, { operator: operator || null });
  return { ok: true, sessionId: sid };
}

export async function getOperator(clientId) {
  const snap = await voiceStateRef(clientId).get();
  if (!snap.exists) return null;
  return snap.data()?.operator || null;
}

export async function clearOperator(clientId) {
  await voiceStateRef(clientId).set(
    { updatedAt: FieldValue.serverTimestamp(), operator: null },
    { merge: true }
  );
  await mirrorToSession(clientId, { operator: null });
  return { ok: true };
}

export async function endSession(clientId, sessionId) {
  const sid = (sessionId || "").trim() || (await getActiveSessionId(clientId));
  if (!sid) return { ok: false };
  await sessionsCol(clientId).doc(sid).set(
    { status: "ended", updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  // Cross-Call-Gedaechtnis (14.06.2026): das Arbeitsgedaechtnis NICHT mehr
  // wegwerfen, sondern als `lastContext` sichern (letzter Patient/Vorgang/
  // Operator + Zeitstempel). Die AKTIVEN Felder werden weiterhin geleert, damit
  // ein neues Gespraech sauber startet und KEIN Patient unbemerkt mitgeschleppt
  // wird (Halluzinations-Schutz). `lastContext` ist nur auf ausdrueckliche,
  // zeitlich begrenzte Anschluss-Nachfrage abrufbar ("der Patient von vorhin",
  // siehe getLastContext + Kontinuitaets-Aufloesung in search_patient/find_case).
  const snap = await voiceStateRef(clientId).get();
  const prev = snap.exists ? snap.data() || {} : {};
  const lastContext = {
    patient: prev.selectedPatient || null,
    case: prev.activeCase || null,
    operator: prev.operator || null,
    endedAt: Date.now(),
  };
  await voiceStateRef(clientId).set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      activeCase: null,
      selectedPatient: null,
      patientCandidates: [],
      operator: null,
      pendingLisaCall: null,
      lastContext,
    },
    { merge: true }
  );
  return { ok: true, sessionId: sid };
}

// Cross-Call-Gedaechtnis: was war im ZULETZT beendeten Gespraech aktiv?
// Liefert { patient, case, operator, endedAt } oder null. Der Aufrufer MUSS
// die Frische pruefen (endedAt), damit ein tagealter Kontext nicht faelschlich
// reaktiviert wird.
export async function getLastContext(clientId) {
  const snap = await voiceStateRef(clientId).get();
  if (!snap.exists) return null;
  return snap.data()?.lastContext || null;
}
