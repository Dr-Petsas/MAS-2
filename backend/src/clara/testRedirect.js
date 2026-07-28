// Testpatient-Umleitung fuer das Clara-Testlabor (W-LABOR WP6, 27.07.2026).
//
// VORGESCHICHTE — bitte vor jeder Aenderung lesen:
// Der erste Anlauf liess im Labor-Modus ALLE MAS-Werkzeuge echt laufen und
// verliess sich darauf, dass ein mitgeschicktes ``testRedirect`` die Wirkung
// serverseitig umbiegt. MAS kannte das Feld aber nicht. Der erste Probelauf hat
// daraufhin eine ECHTE Abwesenheit fuer Freitag, 07.08.2026 im Kalender
// Dr. Petsas eingetragen, samt Sperrblock. Musste von Hand entfernt werden.
//
// Lehre, die diese Datei umsetzt: NICHT die gefaehrlichen Wege sperren, sondern
// die ungefaehrlichen freigeben. Es gibt eine Positivliste; alles, was nicht
// darauf steht, wird im Testbetrieb VERWEIGERT. Ein morgen hinzugefuegtes
// Werkzeug ist damit automatisch gesperrt, bis jemand es bewusst einordnet —
// nicht automatisch scharf, wie es beim Vorfall der Fall war.
//
// Zwei Klassen sind freigegeben:
//   LESEND     — laeuft unveraendert, keine Wirkung.
//   UMGELEITET — schreibt nach aussen, aber das Ziel wird auf den Testpatienten
//                gebogen (Rufnummer) und der Text als Test gekennzeichnet.
//
// Die Umleitung selbst sitzt in den WIRKUNGS-Funktionen (lisaSendSms,
// lisaStartCall), nicht in den Routen. Grund: dieselben Funktionen werden auch
// aus recallCoach und absencePlanner heraus gerufen. Ein Haken pro Route haette
// genau diese indirekten Wege uebersehen — dieselbe Luecke wie beim Vorfall.
// Weitergereicht wird der Zustand ueber AsyncLocalStorage, damit keine der ~70
// Routen ihre Signatur aendern muss.

import { AsyncLocalStorage } from "node:async_hooks";
import { masCollection } from "../tenant.js";

const store = new AsyncLocalStorage();

/** Kennzeichnung im Text, damit ein Testempfaenger sofort sieht, was los ist. */
export const TEST_MARKER = "[TESTLAUF]";

// --- Positivliste ----------------------------------------------------------

/** Werkzeuge ohne bleibende Wirkung. Laufen im Testbetrieb unveraendert. */
const READ_PATHS = new Set([
  "/tools/open-tasks", "/tools/absence-status", "/tools/anamnesis-flags",
  "/tools/briefing", "/tools/call-log", "/tools/comms-digest",
  "/tools/day-appointments", "/tools/day-briefing",
  "/tools/doku-anforderungen", "/tools/doku-luecken", "/tools/doku-offen",
  "/tools/evening-briefing", "/tools/find-case", "/tools/find-contact",
  "/tools/find-slots", "/tools/lookup-caller", "/tools/morning-briefing",
  "/tools/nadine-briefing", "/tools/next-free-slot",
  "/tools/next-patients-briefing", "/tools/patient-appointments",
  "/tools/patient-timeline", "/tools/patient-treatments", "/tools/read-email",
  "/tools/read-ratings", "/tools/read-treatment-dictation",
  "/tools/read-treatment-labels", "/tools/recall-candidates",
  "/tools/recall-status", "/tools/search-patient",
]);

/**
 * Werkzeuge, deren Wirkung nachweislich auf den Testpatienten umgebogen wird.
 *
 * Bewusst klein gehalten: Nur der reine Nachrichten-Versand nach aussen laeuft
 * ueber lisaSendSms/lisaStartCall und damit durch die Umleitung unten. Buchen,
 * Stornieren und Abwesenheit brauchen zusaetzlich einen Testkalender — solange
 * es den nicht gibt, gehoeren sie NICHT hierher (siehe Vorfall oben).
 */
const REDIRECT_PATHS = new Set([
  "/tools/send-sms",
  "/tools/delegate-call",
]);

/** Klartext, warum ein Werkzeug im Testbetrieb nicht laufen darf. */
const DENY_REASONS = {
  "/tools/book-appointment": "Termine buchen",
  "/tools/book-for-patient": "Termine buchen",
  "/tools/plan-absence": "Abwesenheiten eintragen",
  "/tools/absence-approve": "Abwesenheiten freigeben",
  "/tools/recall-approve": "Recall-Aktionen freigeben",
  "/tools/motive-overwatch": "Besuchsgruende im Kalender korrigieren",
  "/tools/send-prepared-email": "E-Mails verschicken",
};

export function classifyToolPath(path) {
  const p = String(path || "").split("?")[0].replace(/\/+$/, "") || "/";
  if (READ_PATHS.has(p)) return "read";
  if (REDIRECT_PATHS.has(p)) return "redirect";
  return "deny";
}

// --- Konfiguration pro Mandant ---------------------------------------------

/**
 * clients/{clientId}/mas_config/test_redirect
 *   { enabled, phone, name, patientId, email, note }
 *
 * ``phone`` ist das Einzige, was fuer SMS/Anruf zwingend ist: dorthin geht im
 * Testbetrieb JEDE Nachricht, egal welchen Patienten Clara gemeint hat.
 */
export async function loadTestPatient(clientId) {
  try {
    const snap = await masCollection(clientId, "mas_config").doc("test_redirect").get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    if (d.enabled === false) return null;
    const phone = String(d.phone || d.mobilePhoneNumber || "").trim();
    if (!phone) return null;
    return {
      phone,
      name: String(d.name || "Testpatient").trim(),
      patientId: String(d.patientId || "").trim(),
      email: String(d.email || "").trim(),
      note: String(d.note || "").trim(),
    };
  } catch {
    return null;
  }
}

export async function saveTestPatient(clientId, input = {}) {
  const doc = {
    enabled: input.enabled !== false,
    phone: String(input.phone || "").trim(),
    name: String(input.name || "").trim() || "Testpatient",
    patientId: String(input.patientId || "").trim(),
    email: String(input.email || "").trim(),
    note: String(input.note || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  // Begleiteter Livetest (28.07.2026): bis zu diesem Zeitstempel (ms) geht
  // JEDE ausgehende Lisa-Nachricht des Mandanten an den Testpatienten —
  // ohne Header/Flag im Request. Immer befristet, nie dauerhaft.
  if (input.liveUntilMs !== undefined) doc.liveUntilMs = Number(input.liveUntilMs) || 0;
  await masCollection(clientId, "mas_config").doc("test_redirect").set(doc, { merge: true });
  return doc;
}

// --- Zeitfenster-Umleitung fuer den begleiteten Livetest ---------------------
//
// Anders als der Request-Kontext (Header X-Test-Redirect, unten) wirkt dieses
// Fenster auf ALLE ausgehenden Nachrichten des Mandanten — auch die, die kein
// Request ausloest (Recall-Ausfuehrung, Outcome-Sweep, Scheduler). Damit laesst
// sich der komplette Lueckenfueller-Workflow (Liste -> Anrufe/SMS -> Zusagen)
// gefahrlos am eigenen Handy durchspielen. Sicherung: hartes Ablaufdatum, kein
// Dauerschalter; abgelaufenes Fenster verhaelt sich byte-identisch zu vorher.

/** Aktives Livetest-Fenster des Mandanten -> Testpatient oder null. */
export async function activeTenantRedirect(clientId) {
  try {
    const snap = await masCollection(clientId, "mas_config").doc("test_redirect").get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    const until = Number(d.liveUntilMs) || 0;
    if (!until || Date.now() >= until) return null;
    const phone = String(d.phone || d.mobilePhoneNumber || "").trim();
    if (!phone) return null;
    return {
      phone,
      name: String(d.name || "Testpatient").trim(),
      patientId: String(d.patientId || "").trim(),
      liveUntilMs: until,
    };
  } catch {
    return null;
  }
}

/**
 * EINE Frage fuer alle Wirkungs-Funktionen: Muss diese ausgehende Nachricht
 * umgeleitet werden? Erst der Request-Kontext (Testlabor), dann das
 * Livetest-Fenster des Mandanten. Liefert zusaetzlich ``target`` mit
 * patientId, damit Buchungswege im Test den TESTPATIENTEN buchen.
 */
export async function resolveOutboundRedirect(clientId, { phone, text, recipientName } = {}) {
  const viaContext = redirectOutbound({ phone, text, recipientName });
  if (viaContext) {
    return { ...viaContext, target: currentTestRedirect()?.target || null, mode: "context" };
  }
  const target = await activeTenantRedirect(clientId);
  if (!target) return null;
  const original = String(recipientName || phone || "unbekannt");
  return {
    phone: target.phone,
    recipientName: target.name,
    text: `${TEST_MARKER} (gedacht für ${original}) ${String(text || "").trim()}`.trim(),
    originalPhone: String(phone || ""),
    originalName: original,
    target,
    mode: "tenant_window",
  };
}

// --- Laufzeit-Zustand -------------------------------------------------------

/** Aktive Umleitung des laufenden Requests (oder null). */
export function currentTestRedirect() {
  return store.getStore() || null;
}

export function runWithTestRedirect(ctx, fn) {
  return store.run(ctx, fn);
}

/**
 * Biegt Empfaenger und Text einer ausgehenden Nachricht auf den Testpatienten.
 * Gibt ``null`` zurueck, wenn keine Umleitung aktiv ist (Normalbetrieb).
 */
export function redirectOutbound({ phone, text, recipientName } = {}) {
  const ctx = currentTestRedirect();
  if (!ctx || !ctx.target) return null;
  const t = ctx.target;
  const original = String(recipientName || phone || "unbekannt");
  return {
    phone: t.phone,
    recipientName: t.name,
    text: `${TEST_MARKER} (gedacht für ${original}) ${String(text || "").trim()}`.trim(),
    originalPhone: String(phone || ""),
    originalName: original,
  };
}

// --- Torwaechter ------------------------------------------------------------

function wantsTestRedirect(req) {
  if (req.header("X-Test-Redirect") === "1") return true;
  const b = req.body;
  return !!(b && typeof b === "object" && b.testRedirect === true);
}

/**
 * Express-Middleware VOR dem Tools-Router. Nur aktiv, wenn der Aufrufer die
 * Umleitung ausdruecklich anfordert — ohne das Kennzeichen aendert sich am
 * Normalbetrieb nichts (kein Firestore-Zugriff, kein zusaetzlicher Kontext).
 */
export function testRedirectMiddleware(resolveClientId) {
  return async function testRedirect(req, res, next) {
    if (!req.path.startsWith("/tools/") || !wantsTestRedirect(req)) return next();

    const kind = classifyToolPath(req.path);
    if (kind === "deny") {
      const was = DENY_REASONS[req.path.split("?")[0]] || "diese Aktion";
      return res.json({
        ok: false,
        testRedirect: true,
        blocked: true,
        message: `Im Testbetrieb kann ich ${was} nicht ausführen —`
          + " dafür fehlt noch ein Testkalender. Alles Lesende geht.",
      });
    }

    if (kind === "read") {
      return runWithTestRedirect({ mode: "read", target: null }, () => next());
    }

    const clientId = resolveClientId(req);
    const target = await loadTestPatient(clientId);
    if (!target) {
      return res.json({
        ok: false,
        testRedirect: true,
        blocked: true,
        message: "Im Testbetrieb schicke ich nichts an echte Patienten."
          + " Für diese Praxis ist noch kein Testpatient mit Rufnummer hinterlegt.",
      });
    }
    return runWithTestRedirect({ mode: "redirect", target, clientId }, () => next());
  };
}
