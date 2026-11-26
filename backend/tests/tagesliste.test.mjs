// Tagesliste der Clara-Seite: was gehoert hinein, in welcher Reihenfolge, und
// dass QM getrennt und nachgeordnet bleibt. Reine Logik, ohne Firestore.
import { baueTagesliste, quelleVon, einstufen, QM_HOECHSTENS } from "../src/brain/tagesliste.js";
import { vorlagenSaeubern } from "../src/brain/notizVorlagen.js";

function check(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log("ok", msg);
}

const NOW = 1_800_000_000_000;
const STD = 3_600_000;
const kontakt = (by, text, eventId) => ({ kind: "contact", by, text, eventId });
const fall = (id, o = {}) => ({
  id, status: "open", topic: "other", priority: "normal", subject: { name: `Name ${id}` },
  contactCount: 1, lastContactAt: NOW - STD, eventIds: [], updates: [], ...o,
});

const events = [
  { id: "e-rueckruf", signals: { callbackRequested: true }, counterparty: { ref: "+49 170 0000101" } },
  { id: "e-termin", signals: { appointmentRequest: true }, counterparty: { ref: "01700000102" } },
  { id: "e-termin-rueckruf", signals: { appointmentRequest: true, callbackRequested: true }, counterparty: { ref: "01700000103" } },
  { id: "e-mail", signals: {}, counterparty: { ref: "jemand@example.org" } },
  { id: "e-system", channel: "system", signals: { appointmentRequest: true, callbackRequested: true }, counterparty: { ref: null } },
  { id: "e-mail-kritisch", signals: { critical: true }, counterparty: { ref: "anwalt@example.org" } },
];

const cases = [
  fall("rueckruf", { topic: "callback", eventIds: ["e-rueckruf"], updates: [kontakt("Bianca", "Bittet um Rückruf", "e-rueckruf")], lastContactAt: NOW - 2 * STD }),
  fall("termin", { topic: "appointment", eventIds: ["e-termin"], updates: [kontakt("Bianca", "Termin gebucht", "e-termin")] }),
  fall("termin-rueckruf", { topic: "appointment", eventIds: ["e-termin-rueckruf"], updates: [kontakt("Bianca", "Termin, bitte Rückruf", "e-termin-rueckruf")], lastContactAt: NOW - 5 * STD }),
  fall("team-notiz", { topic: "appointment", updates: [kontakt("Sabine", "Zahnersatz ist da")] }),
  fall("mail", { eventIds: ["e-mail"], updates: [kontakt("Nadine", "Newsletter", "e-mail")] }),
  fall("mail-kritisch", { eventIds: ["e-mail-kritisch"], updates: [kontakt("Nadine", "[Anwalt] Schreiben", "e-mail-kritisch")] }),
  fall("mail-freigabe", { status: "waiting_approval", updates: [kontakt("Nadine", "Antwort vorbereitet")] }),
  fall("beschwerde", { topic: "complaint", updates: [kontakt("bianca", "Schmerzen halten an")], lastContactAt: NOW - 3 * STD }),
  fall("lisa", { topic: "callback", updates: [kontakt("Lisa", "Möchte Rückruf der Praxis")], lastContactAt: NOW - 1.5 * STD }),
  fall("erledigt", { status: "resolved", topic: "callback", updates: [kontakt("Bianca", "Rückruf")] }),
  fall("clara-aufgabe", { updates: [], createdBy: "Clara" }),
  fall("ampel", { topic: "document", updates: [kontakt("Clara", "Dokumenten-Ampel: ROT", "appt-watch:t1:docs:red:2026-11-26")] }),
  fall("kalender", { topic: "appointment", eventIds: ["e-system"], updates: [kontakt("Clara", "Termin entfernt", "e-system")] }),
  fall("bei-lisa", { topic: "appointment", assignee: "Lisa", createdBy: "Clara", updates: [] }),
];

const qmJobs = [
  { id: "q-heute", status: "assigned", title: "Kühlschrank", dueAtMs: NOW + STD, assignedToName: "Sabine" },
  { id: "q-alt", status: "overdue", title: "Sterilisator", dueAtMs: NOW - 30 * STD },
  { id: "q-morgen", status: "planned", title: "Wartung", dueAtMs: NOW + 40 * STD },
  { id: "q-fertig", status: "done", title: "Erledigt", dueAtMs: NOW - STD },
];

const out = baueTagesliste({ cases, events, qmJobs, nowMs: NOW, endOfDayMs: NOW + 6 * STD });
const ids = out.patienten.map((p) => p.id);

check(!ids.includes("termin"), "reines Termintelefonat steht nicht in der Liste");
check(ids.includes("termin-rueckruf"), "Termin mit Rückrufwunsch steht in der Liste");
check(!ids.includes("team-notiz"), "eigene Team-Notiz steht nicht in der Tagesliste");
check(!ids.includes("mail"), "gewöhnliche E-Mail steht nicht in der Liste");
check(ids.includes("mail-kritisch") && ids.includes("mail-freigabe"), "dringende E-Mail und Freigabe stehen in der Liste");
check(!ids.includes("erledigt"), "Erledigtes fehlt");
check(!ids.includes("ampel") && !ids.includes("kalender"), "Beobachtungen der Kalender-Automatik stehen nicht in der Liste");
check(!ids.includes("bei-lisa"), "Auftrag, an dem Lisa arbeitet, steht nicht in der Liste");
check(ids.join(",") === "beschwerde,mail-kritisch,termin-rueckruf,rueckruf,lisa,mail-freigabe,clara-aufgabe",
  `Reihenfolge: Dringendes zuerst, darin das Älteste oben (${ids.join(",")})`);

const rueckruf = out.patienten.find((p) => p.id === "rueckruf");
check(rueckruf.quelle === "Bianca" && rueckruf.telefon === "+49 170 0000101" && rueckruf.dringlichkeit === "heute", "Rückruf trägt Quelle, Nummer und Dringlichkeit");
check(out.patienten.find((p) => p.id === "mail-kritisch").telefon === null, "E-Mail-Adresse ist keine Rückrufnummer");
check(out.patienten.find((p) => p.id === "beschwerde").quelle === "Bianca", "Quelle unabhängig von Groß- und Kleinschreibung");
check(out.patienten.find((p) => p.id === "lisa").quelle === "Lisa", "Lisa liefert ohne Umbau ein");
check(out.patienten.find((p) => p.id === "clara-aufgabe").quelle === "Clara", "Vorgang ohne Kontakt nimmt den Anleger als Quelle");

check(out.qm.map((q) => q.id).join(",") === "q-heute,q-alt", "QM: nur bis heute Fälliges, Heutiges zuerst");
const viel = baueTagesliste({ qmJobs: Array.from({ length: 50 }, (_, i) => ({ id: `q${i}`, status: "overdue", dueAtMs: NOW - i * STD })), nowMs: NOW });
check(viel.qm.length === QM_HOECHSTENS && viel.zaehler.qm === 50 && viel.qm[0].id === "q0", "QM-Rückstand wird gezählt, aber nur das Neueste gezeigt");
check(out.patienten.every((p) => p.art === "vorgang") && out.qm.every((q) => q.art === "qm" && q.quelle === "Julia"), "QM bleibt ein eigener Abschnitt");
check(out.zaehler.sofort === 2 && out.zaehler.heute === 4 && out.zaehler.normal === 1 && out.zaehler.qmUeberfaellig === 1, "Zähler stimmen");

check(quelleVon(fall("x", { updates: [kontakt("Bianca", "a"), kontakt("Sabine", "b")] })) === "Bianca", "Team-Ergänzung ändert die Quelle nicht");
check(einstufen(fall("x", { status: "closed" }), "Bianca", {}) === null, "geschlossener Vorgang wird nicht eingestuft");

const liste = (date) => fall("liste", { status: "waiting_approval", topic: "appointment", assignee: "Lisa", createdBy: "Clara",
  updates: [{ kind: "note", by: "Clara", text: "Lücke erkannt" }], callList: { date, slot: { label: "10:00–11:00" }, calendarName: "Dr. Beispiel", candidates: [{}, { removed: true }, {}] } });
const frei = baueTagesliste({ cases: [liste("2026-12-01")], heute: "2026-11-26" }).patienten[0];
check(frei && frei.dringlichkeit === "heute" && frei.freigabe.kandidaten === 2 && frei.freigabe.moeglich === true, "wartende Anrufliste trägt die Freigabe mit aktiven Kandidaten");
check(baueTagesliste({ cases: [liste("2026-11-20")], heute: "2026-11-26" }).patienten[0].freigabe.moeglich === false, "Anrufliste für einen vergangenen Tag wird nicht zur Freigabe angeboten");
check(out.patienten.every((p) => p.freigabe === null), "Vorgänge ohne Anrufliste tragen keine Freigabe");

const sauber = vorlagenSaeubern({ "ze-da": "  Eigener Text  ", leer: "   ", zahl: 5, "": "x" });
check(Object.keys(sauber).join(",") === "ze-da" && sauber["ze-da"] === "Eigener Text", "Knopf-Texte: nur saubere Einträge bleiben");
check(Object.keys(vorlagenSaeubern(["a"])).length === 0, "Knopf-Texte: Liste statt Objekt wird verworfen");

console.log("tagesliste ok");
