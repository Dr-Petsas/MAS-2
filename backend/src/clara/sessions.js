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

export async function endSession(clientId, sessionId) {
  const sid = (sessionId || "").trim() || (await getActiveSessionId(clientId));
  if (!sid) return { ok: false };
  await sessionsCol(clientId).doc(sid).set(
    { status: "ended", updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, sessionId: sid };
}
