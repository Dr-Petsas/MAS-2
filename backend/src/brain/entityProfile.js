import admin from "../firebase.js";
import { loadBooking } from "../clara/booking.js";
import { getPatientAppointments } from "../clara/daySchedule.js";
import { getPatientAnamnese } from "../clara/anamnese.js";
import { readPatientTreatmentDocs } from "../clara/treatmentDoc.js";
import { listCases } from "./caseStore.js";
import { queryLatest, queryByPatient } from "./eventStore.js";
import { applyHumanReview } from "./events.js";
import { isActiveStatus } from "./cases.js";
import { masCollection } from "../tenant.js";

// ============================================================================
// W-SUCHE-3 — Entity Profile (Patienten-Profil / Kontakt-Profil)
//
// Google-Business-artige Vollansicht: Stammdaten, Termine, Anamnese,
// Kommunikation, Dokumente, Abrechnung, Recall, Bewertungen.
// Kontakte (mas_contacts) ohne Gesundheitsdaten.
// ============================================================================

const CONTACT_COL = "mas_contacts";
const BACKFILL_MARKER = "_meta_backfill";

const CHANNEL_LABELS = {
  bianca_call: "Anruf (Bianca)",
  lisa_call: "Anruf (Lisa)",
  lisa_sms: "SMS",
  nadine_email: "E-Mail",
  nadine_letter: "Brief",
  clara_voice: "Clara",
  lena_doc: "Behandlungsdoku",
  frontdesk: "Empfang",
  system: "System",
};

const CALL_CHANNELS = new Set(["bianca_call", "lisa_call", "clara_voice"]);
const EMAIL_CHANNELS = new Set(["nadine_email"]);
const LETTER_CHANNELS = new Set(["nadine_letter"]);

function fold(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "s");
}

function tokenize(q) {
  return fold(q)
    .split(/[^a-z0-9@.]+/)
    .map((t) => t.trim().replace(/^[.@]+|[.@]+$/g, ""))
    .filter((t) => t.length >= 2);
}

function tsToMs(v) {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
}

function fmtIsoDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "").trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(s || "").trim();
}

function recallBucketLabel(key) {
  const k = String(key || "");
  if (k.startsWith("mot:")) return k.slice(4).replace(/-/g, " ");
  if (k.startsWith("calmot:")) return k.slice(7).replace(/_/g, " · ").replace(/-/g, " ");
  if (k.startsWith("spec:")) return k.slice(5).replace(/-/g, " ");
  if (k.startsWith("calspec:")) return k.slice(8).replace(/_/g, " · ").replace(/-/g, " ");
  if (k.startsWith("reactivation:")) return `Reaktivierung ${k.slice(13)}`;
  return k;
}

function publicEvent(e) {
  const m = applyHumanReview(e);
  return {
    id: m.id,
    ts: m.ts || 0,
    channel: m.channel,
    channelLabel: CHANNEL_LABELS[m.channel] || m.channel,
    direction: m.direction || "",
    summary: m.humanReview?.summary || m.summary || "",
    status: m.status || "none",
    caseId: m.caseId || null,
  };
}

function groupCommunication(events) {
  const out = {
    callsIn: [], callsOut: [],
    emailsIn: [], emailsOut: [],
    lettersIn: [], lettersOut: [],
    sms: [], clara: [], doku: [], other: [],
  };
  for (const raw of events) {
    const e = publicEvent(raw);
    const ch = e.channel;
    const dir = e.direction;
    if (CALL_CHANNELS.has(ch)) {
      (dir === "out" ? out.callsOut : out.callsIn).push(e);
    } else if (EMAIL_CHANNELS.has(ch)) {
      (dir === "out" ? out.emailsOut : out.emailsIn).push(e);
    } else if (LETTER_CHANNELS.has(ch)) {
      (dir === "out" ? out.lettersOut : out.lettersIn).push(e);
    } else if (ch === "lisa_sms") out.sms.push(e);
    else if (ch === "clara_voice") out.clara.push(e);
    else if (ch === "lena_doc") out.doku.push(e);
    else out.other.push(e);
  }
  return out;
}

async function resolveLocationId(clientId) {
  const booking = await loadBooking(clientId).catch(() => null);
  return booking?.locationId || null;
}

async function loadPatientRecord(clientId, patientId) {
  const locationId = await resolveLocationId(clientId);
  if (!locationId || !patientId) return null;
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("patients").doc(patientId)
      .get();
    if (!snap.exists) return null;
    const o = snap.data();
    const phone = String(o.mobilePhoneNumber || o.phoneNumber || "").trim();
    let birthDate = null;
    if (o.birthDate) {
      const ms = tsToMs(o.birthDate);
      birthDate = ms ? fmtIsoDay(new Date(ms).toISOString().slice(0, 10)) : fmtIsoDay(String(o.birthDate));
    }
    return {
      id: patientId,
      title: String(o.title || "").trim(),
      firstName: String(o.firstName || "").trim(),
      lastName: String(o.lastName || "").trim(),
      birthDate,
      phone,
      mobilePhoneNumber: phone,
      email: String(o.email || "").trim(),
      street: String(o.street || "").trim(),
      postalCode: String(o.postalCode || "").trim(),
      city: String(o.city || "").trim(),
      recallBuckets: Array.isArray(o.recallBuckets) ? o.recallBuckets : [],
      recallBucketsUpdatedAt: tsToMs(o.recallBucketsUpdatedAt),
      comments: String(o.comments || "").trim(),
      newPatient: o.newPatient === true,
      privateInsurance: o.privateInsurance === true,
    };
  } catch {
    return null;
  }
}

async function loadPatientRecallCampaigns(clientId, locationId, patientId) {
  const pid = String(patientId || "").trim();
  if (!locationId || !pid) return [];
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("campaigns")
      .where("status", "==", 1)
      .limit(50)
      .get();
    const active = [];
    await Promise.all(snap.docs.map(async (d) => {
      const o = d.data() || {};
      if (o.hidden === true) return;
      const pSnap = await d.ref.collection("patients").doc(pid).get();
      if (!pSnap.exists) return;
      active.push({
        id: d.id,
        name: String(o.name || "").trim() || "Recall-Kampagne",
      });
    }));
    active.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return active;
  } catch {
    return [];
  }
}

async function loadPatientDocuments(clientId, locationId, patientId) {
  if (!locationId || !patientId) return [];
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("patients").doc(patientId)
      .collection("pdocuments")
      .get();
    return snap.docs.map((d) => {
      const o = d.data();
      const name = String(o.name || "").trim();
      return {
        id: d.id,
        name,
        status: String(o.status || "").trim(),
        isAnamnese: /anamnese|anamnesis|history/i.test(name),
        signedAtMs: tsToMs(o.pdfCreatedAt || o.signedAt),
        createdAtMs: tsToMs(o.createdAt),
      };
    }).sort((a, b) => (b.signedAtMs || b.createdAtMs) - (a.signedAtMs || a.createdAtMs));
  } catch {
    return [];
  }
}

async function loadPatientRatings(clientId, locationId, patientId) {
  if (!locationId || !patientId) return { avg: null, count: 0, items: [] };
  try {
    const snap = await admin.firestore().collection("ratings")
      .where("locationId", "==", locationId)
      .where("patientId", "==", patientId)
      .limit(30)
      .get();
    const items = snap.docs.map((d) => {
      const o = d.data();
      return {
        id: d.id,
        rating: Number(o.rating || 0),
        comments: String(o.comments || "").trim(),
        ratedAtMs: tsToMs(o.ratedAt),
        doctorName: String(o.doctorName || "").trim(),
        visitMotiveName: String(o.visitMotiveName || "").trim(),
      };
    }).filter((r) => r.rating >= 1 && r.rating <= 5 && r.ratedAtMs > 0)
      .sort((a, b) => b.ratedAtMs - a.ratedAtMs);
    const sum = items.reduce((n, r) => n + r.rating, 0);
    return {
      avg: items.length ? Math.round((sum / items.length) * 10) / 10 : null,
      count: items.length,
      items: items.slice(0, 10),
    };
  } catch {
    return { avg: null, count: 0, items: [] };
  }
}

async function loadBillingEntries(clientId, locationId, apptIds) {
  if (!locationId || !apptIds.length) return [];
  const col = admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments");
  const entries = [];
  for (const id of apptIds.slice(0, 12)) {
    try {
      const snap = await col.doc(id).get();
      if (!snap.exists) continue;
      const o = snap.data();
      const abr = o.sophieAbrechnung;
      if (abr && typeof abr === "object") {
        entries.push({
          appointmentId: id,
          dateMs: tsToMs(o.start),
          title: String(abr.terminGrund || o.visitMotive?.name || "").trim(),
          status: String(abr.status || "vorhanden").trim(),
          positions: Array.isArray(abr.positionen) ? abr.positionen.length : 0,
          summary: String(abr.kurztext || abr.zusammenfassung || "").trim().slice(0, 240),
        });
      }
      const plan = o.sophiePlan;
      if (plan && typeof plan === "object" && !entries.some((e) => e.appointmentId === id)) {
        entries.push({
          appointmentId: id,
          dateMs: tsToMs(o.start),
          title: String(plan.terminGrund || plan.title || o.visitMotive?.name || "").trim(),
          status: "plan",
          positions: Array.isArray(plan.positionen) ? plan.positionen.length : 0,
          summary: String(plan.notiz || "").trim().slice(0, 240),
        });
      }
    } catch { /* optional */ }
  }
  entries.sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
  return entries;
}

async function loadMemoryForPatient(clientId, { patientId, name, sinceDays = 400 }) {
  const pid = String(patientId || "").trim();
  const nameTokens = tokenize(name || "");
  const sinceTs = Date.now() - sinceDays * 24 * 3_600_000;

  const [byPid, windowEvents, casesByPid, allCases] = await Promise.all([
    pid ? queryByPatient(clientId, pid, 300).catch(() => []) : Promise.resolve([]),
    queryLatest(clientId, sinceTs, 2000).catch(() => []),
    pid ? listCases(clientId, { patientId: pid, limit: 100 }).catch(() => []) : Promise.resolve([]),
    listCases(clientId, { limit: 300 }).catch(() => []),
  ]);

  const matchName = (s) => {
    if (!nameTokens.length) return false;
    const f = fold(s || "");
    return f.length > 0 && nameTokens.every((t) => f.includes(t));
  };

  const evMap = new Map();
  for (const e of byPid) evMap.set(e.id, e);
  for (const e of windowEvents) {
    if (evMap.has(e.id)) continue;
    if ((pid && e.subject?.patientId === pid) || matchName(e.subject?.name) || matchName(e.counterparty?.name)) {
      evMap.set(e.id, e);
    }
  }
  const events = [...evMap.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const caseMap = new Map();
  for (const c of casesByPid) caseMap.set(c.id, c);
  for (const c of allCases) {
    if (caseMap.has(c.id)) continue;
    if ((pid && c.subject?.patientId === pid) || matchName(c.subject?.name)) caseMap.set(c.id, c);
  }
  const ms = (v) => v?.toMillis?.() ?? (typeof v === "number" ? v : 0);
  const cases = [...caseMap.values()].sort((a, b) => {
    const aa = isActiveStatus(a.status) ? 1 : 0;
    const bb = isActiveStatus(b.status) ? 1 : 0;
    if (aa !== bb) return bb - aa;
    return (Number(b.lastContactAt) || ms(b.updatedAt)) - (Number(a.lastContactAt) || ms(a.updatedAt));
  });

  const billingCases = cases.filter((c) => c.topic === "billing");
  return { events, cases, billingCases };
}

function formatAppt(a) {
  if (!a) return null;
  return {
    id: a.id,
    startMs: a.startMs,
    visitMotive: a.visitMotive || "",
    calendarId: a.calendarId || "",
    calendarName: a.calendarName || "",
    patientStatus: a.patientStatus,
    comments: a.comments || "",
    docsStatus: a.docsStatus || "",
    newPatient: !!a.newPatient,
    isPast: a.startMs < Date.now(),
  };
}

/** Behandler-Foto aus Kalender/User (Mitarbeiter-Profilbild in der Plattform). */
async function loadCalendarBehandler(clientId, locationId, calendarId) {
  const cid = String(calendarId || "").trim();
  if (!locationId || !cid) return { name: "", avatarUrl: "", calendarId: cid };
  try {
    const calSnap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("calendars").doc(cid)
      .get();
    if (!calSnap.exists) return { name: "", avatarUrl: "", calendarId: cid };
    const cal = calSnap.data() || {};
    let avatarUrl = String(cal.avatarUrl || "").trim();
    let name = String(cal.name || cal.abbreviation || "").trim();
    const userId = String(cal.userId || "").trim();
    if ((!avatarUrl || !name) && userId) {
      const userSnap = await admin.firestore()
        .collection("clients").doc(clientId)
        .collection("users").doc(userId)
        .get();
      if (userSnap.exists) {
        const u = userSnap.data() || {};
        if (!avatarUrl) avatarUrl = String(u.avatarUrl || "").trim();
        if (!name) {
          name = `${String(u.title || "").trim()} ${String(u.firstName || "").trim()} ${String(u.lastName || "").trim()}`.replace(/\s+/g, " ").trim();
        }
      }
    }
    return { name, avatarUrl, calendarId: cid };
  } catch {
    return { name: "", avatarUrl: "", calendarId: cid };
  }
}

async function behandlerFromAppointments(clientId, locationId, appts) {
  const ref = appts?.last || appts?.next;
  if (!ref?.calendarId) {
    const name = ref?.calendarName || "";
    return { name, avatarUrl: "", calendarId: ref?.calendarId || "" };
  }
  const b = await loadCalendarBehandler(clientId, locationId, ref.calendarId);
  if (!b.name && ref.calendarName) b.name = ref.calendarName;
  return b;
}

/** Adressbuch-Suche fuer searchBrain (Kontakt-Profil). */
export async function searchContacts(clientId, q, limit = 5) {
  const tokens = tokenize(q);
  if (!tokens.length) return [];
  try {
    const snap = await masCollection(clientId, CONTACT_COL).limit(2000).get();
    const hits = [];
    for (const d of snap.docs) {
      if (d.id === BACKFILL_MARKER) continue;
      const c = d.data();
      const hay = fold([
        c.name, c.address, c.category, c.lastSubject,
        ...(Array.isArray(c.phones) ? c.phones : []),
        ...(Array.isArray(c.sources) ? c.sources : []),
      ].join(" "));
      if (!tokens.every((t) => hay.includes(t))) continue;
      let score = 0;
      for (const t of tokens) {
        if (fold(c.name || "").includes(t)) score += 8;
        if (fold(c.address || "").includes(t)) score += 4;
      }
      hits.push({
        id: d.id,
        name: String(c.name || "").trim() || "Kontakt",
        address: String(c.address || "").trim(),
        phones: Array.isArray(c.phones) ? c.phones : [],
        category: String(c.category || "").trim(),
        lastSeenAt: c.lastSeenAt || 0,
        count: c.count || 0,
        score,
      });
    }
    hits.sort((a, b) => b.score - a.score || (b.lastSeenAt - a.lastSeenAt));
    return hits.slice(0, limit);
  } catch {
    return [];
  }
}

/** Schnelle GBP-Vorschau (~3 Reads, kein Gedaechtnis-Scan). */
export async function buildProfilePreviewFast(clientId, { patientId, firstName, lastName, birthDate }) {
  const pid = String(patientId || "").trim();
  const locationId = await resolveLocationId(clientId);
  const [record, appts, ana] = await Promise.all([
    pid ? loadPatientRecord(clientId, pid) : Promise.resolve(null),
    pid ? getPatientAppointments(clientId, { patientId: pid, firstName, lastName }) : Promise.resolve(null),
    pid ? getPatientAnamnese(clientId, { patientId: pid }) : Promise.resolve(null),
  ]);
  const behandler = await behandlerFromAppointments(clientId, locationId, appts);

  return {
    phone: record?.phone || "",
    email: record?.email || "",
    address: [record?.street, record?.postalCode, record?.city].filter(Boolean).join(", "),
    birthDate: record?.birthDate || birthDate || null,
    lastAppointment: formatAppt(appts?.last),
    nextAppointment: formatAppt(appts?.next),
    behandler,
    anamneseFlags: (ana?.findings || []).slice(0, 6).map((f) => ({ category: f.category, text: f.text })),
    anamneseCount: (ana?.findings || []).length,
    hasAnamnese: !!ana?.hasAnamnese,
  };
}

/** Leichte Vorschau fuer Suchtreffer (Patient) — voller Zaehler-Scan, nur wenn explizit noetig. */
export async function buildProfilePreview(clientId, { patientId, firstName, lastName, birthDate }) {
  const pid = String(patientId || "").trim();
  const name = `${firstName || ""} ${lastName || ""}`.trim();
  const fast = await buildProfilePreviewFast(clientId, { patientId, firstName, lastName, birthDate });
  const locationId = await resolveLocationId(clientId);
  const [ratings, memory] = await Promise.all([
    pid ? loadPatientRatings(clientId, locationId, pid) : Promise.resolve({ avg: null, count: 0 }),
    pid || name ? loadMemoryForPatient(clientId, { patientId: pid, name, sinceDays: 400 }) : Promise.resolve({ events: [], cases: [], billingCases: [] }),
  ]);

  const comm = groupCommunication(memory.events || []);
  const calls = comm.callsIn.length + comm.callsOut.length;
  const mails = comm.emailsIn.length + comm.emailsOut.length;
  const letters = comm.lettersIn.length + comm.lettersOut.length;
  const record = pid ? await loadPatientRecord(clientId, pid) : null;

  return {
    ...fast,
    ratingAvg: ratings?.avg ?? null,
    ratingCount: ratings?.count || 0,
    recallBuckets: (record?.recallBuckets || []).map((k) => ({ key: k, label: recallBucketLabel(k) })),
    activeCaseCount: (memory.cases || []).filter((c) => isActiveStatus(c.status)).length,
    caseCount: (memory.cases || []).length,
    openBillingCount: (memory.billingCases || []).filter((c) => isActiveStatus(c.status)).length,
    commCounts: { calls, mails, letters, doku: comm.doku.length, sms: comm.sms.length },
    eventCount: (memory.events || []).length,
  };
}

async function buildContactProfile(clientId, { contactId, sinceDays = 400 }) {
  const id = String(contactId || "").trim();
  if (!id) return { ok: false, reason: "no_contact" };
  const snap = await masCollection(clientId, CONTACT_COL).doc(id).get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const c = snap.data();
  const name = String(c.name || "").trim() || "Kontakt";
  const phones = Array.isArray(c.phones) ? c.phones : [];
  const email = String(c.address || "").trim();
  const sinceTs = Date.now() - sinceDays * 24 * 3_600_000;
  const events = (await queryLatest(clientId, sinceTs, 2000).catch(() => []))
    .filter((e) => {
      const cp = fold(e.counterparty?.name || "");
      const ref = fold(e.counterparty?.ref || "");
      const nm = fold(name);
      if (email && ref.includes(fold(email.split("@")[0]))) return true;
      if (email && ref === fold(email)) return true;
      if (nm && cp.includes(nm)) return true;
      for (const p of phones) {
        const tail = String(p).replace(/\D/g, "").slice(-8);
        if (tail && ref.replace(/\D/g, "").includes(tail)) return true;
      }
      return false;
    })
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const comm = groupCommunication(events);
  const cases = (await listCases(clientId, { limit: 200 }).catch(() => []))
    .filter((cs) => {
      const sn = fold(cs.subject?.name || "");
      const nm = fold(name);
      return nm && sn.includes(nm) && !cs.subject?.patientId;
    });

  return {
    ok: true,
    kind: "contact",
    contact: {
      id,
      name,
      email,
      phones,
      category: String(c.category || "").trim(),
      lastSeenAt: c.lastSeenAt || 0,
      interactionCount: c.count || 0,
      sources: Array.isArray(c.sources) ? c.sources : [],
    },
    communication: comm,
    cases: cases.map((cs) => ({
      id: cs.id,
      title: cs.title,
      topic: cs.topic,
      status: cs.status,
      lastContactAt: cs.lastContactAt || 0,
      assignee: cs.assignee || null,
    })),
    stats: {
      eventCount: events.length,
      caseCount: cases.length,
      activeCaseCount: cases.filter((c) => isActiveStatus(c.status)).length,
    },
  };
}

async function buildPatientProfile(clientId, { patientId, name, sinceDays = 400 }) {
  const pid = String(patientId || "").trim();
  const displayName = String(name || "").trim();
  if (!pid && !displayName) return { ok: false, reason: "no_patient" };

  const record = pid ? await loadPatientRecord(clientId, pid) : null;
  const firstName = record?.firstName || displayName.split(/\s+/)[0] || "";
  const lastName = record?.lastName || displayName.split(/\s+/).slice(1).join(" ") || "";
  const fullName = `${firstName} ${lastName}`.trim() || displayName || "Patient";
  const locationId = await resolveLocationId(clientId);

  const [appts, ana, ratings, documents, treatment, memory, recallCampaigns] = await Promise.all([
    getPatientAppointments(clientId, { patientId: pid, firstName, lastName }),
    pid ? getPatientAnamnese(clientId, { patientId: pid }) : Promise.resolve({ hasAnamnese: false, findings: [] }),
    pid && locationId ? loadPatientRatings(clientId, locationId, pid) : Promise.resolve({ avg: null, count: 0, items: [] }),
    pid && locationId ? loadPatientDocuments(clientId, locationId, pid) : Promise.resolve([]),
    pid ? readPatientTreatmentDocs(clientId, { patientId: pid, firstName, lastName }) : Promise.resolve({ ok: false, plans: [], docs: [] }),
    loadMemoryForPatient(clientId, { patientId: pid, name: fullName, sinceDays }),
    pid && locationId ? loadPatientRecallCampaigns(clientId, locationId, pid) : Promise.resolve([]),
  ]);

  const allApptIds = [
    ...(appts?.past || []).slice(-8).map((a) => a.id),
    ...(appts?.upcoming || []).slice(0, 3).map((a) => a.id),
  ];
  const billingEntries = locationId ? await loadBillingEntries(clientId, locationId, allApptIds) : [];
  const behandler = await behandlerFromAppointments(clientId, locationId, appts);

  const comm = groupCommunication(memory.events);

  return {
    ok: true,
    kind: "patient",
    behandler,
    patient: {
      id: pid || record?.id || "",
      name: fullName,
      title: record?.title || "",
      firstName,
      lastName,
      birthDate: record?.birthDate || null,
      phone: record?.phone || "",
      email: record?.email || "",
      street: record?.street || "",
      postalCode: record?.postalCode || "",
      city: record?.city || "",
      address: [record?.street, record?.postalCode, record?.city].filter(Boolean).join(", "),
      comments: record?.comments || "",
      newPatient: record?.newPatient,
      privateInsurance: record?.privateInsurance,
      recallBuckets: (record?.recallBuckets || []).map((k) => ({ key: k, label: recallBucketLabel(k) })),
      recallBucketsUpdatedAt: record?.recallBucketsUpdatedAt || null,
    },
    appointments: {
      last: formatAppt(appts?.last),
      next: formatAppt(appts?.next),
      past: (appts?.past || []).slice(-20).reverse().map(formatAppt).filter(Boolean),
      upcoming: (appts?.upcoming || []).slice(0, 10).map(formatAppt).filter(Boolean),
      count: appts?.count || 0,
    },
    anamnese: {
      hasAnamnese: !!ana?.hasAnamnese,
      signedOnly: !!ana?.signedOnly,
      ausPdf: !!ana?.ausPdf,
      bogenMs: ana?.bogenMs || 0,
      findings: (ana?.findings || []).map((f) => ({ category: f.category, text: f.text })),
    },
    ratings,
    documents: documents.map((d) => ({
      ...d,
      statusLabel: d.status === "signed" ? "unterschrieben" : d.status === "sent" ? "verschickt" : d.status === "none" ? "ausgewählt" : d.status,
    })),
    treatment: {
      plans: treatment?.plans || [],
      docs: (treatment?.docs || []).slice(-20),
    },
    billing: {
      entries: billingEntries,
      openCases: (memory.billingCases || []).filter((c) => isActiveStatus(c.status)).map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        lastContactAt: c.lastContactAt || 0,
      })),
    },
    communication: comm,
    recallCampaigns,
    cases: memory.cases.map((c) => ({
      id: c.id,
      title: c.title,
      topic: c.topic,
      status: c.status,
      assignee: c.assignee || null,
      lastContactAt: c.lastContactAt || 0,
      isActive: isActiveStatus(c.status),
      eventCount: Array.isArray(c.eventIds) ? c.eventIds.length : 0,
    })),
    stats: {
      eventCount: memory.events.length,
      caseCount: memory.cases.length,
      activeCaseCount: memory.cases.filter((c) => isActiveStatus(c.status)).length,
      documentCount: documents.length,
      signedDocumentCount: documents.filter((d) => d.status === "signed").length,
    },
  };
}

/**
 * Vollstaendiges Entity-Profil (Patient oder Kontakt).
 * @param {string} clientId
 * @param {{patientId?:string, contactId?:string, name?:string, sinceDays?:number}} opts
 */
export async function buildEntityProfile(clientId, opts = {}) {
  const contactId = String(opts.contactId || "").trim();
  if (contactId) return buildContactProfile(clientId, opts);
  return buildPatientProfile(clientId, opts);
}
