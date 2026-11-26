// Tagesliste der Clara-Seite: was gehoert hinein, in welcher Reihenfolge, und
// dass QM getrennt und nachgeordnet bleibt. Reine Logik, ohne Firestore.
import { baueTagesliste, quelleVon, einstufen, bereichVon, QM_HOECHSTENS } from "../src/brain/tagesliste.js";
import { vorlagenSaeubern } from "../src/brain/notizVorlagen.js";
import { bisAus, bisGesprochen, naechsterArbeitstag, berlinMs } from "../src/brain/zurueckstellen.js";

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
check(ids.join(",") === "beschwerde,termin-rueckruf,rueckruf,lisa,mail-kritisch,mail-freigabe,clara-aufgabe",
  `Reihenfolge: Patienten zuerst, darin Dringendes und das Älteste oben (${ids.join(",")})`);

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

// Bereiche und ihre Reihenfolge — nur aus vorhandenen Feldern.
const TAG = 24 * STD;
const ev2 = [
  { id: "m-mahnung", signals: { critical: true, invoiceOrPayment: true }, tags: ["kritisch", "mahnung", "rechnung"], counterparty: { kind: "unknown", ref: "inkasso@example.org" } },
  { id: "m-rechnung", signals: { invoiceOrPayment: true }, tags: ["rechnung"], deadlineMs: NOW + 2 * TAG, deadlineStrong: true, counterparty: { kind: "unknown", ref: "labor@example.org" } },
  { id: "m-frist", signals: {}, tags: [], deadlineMs: NOW + 10 * TAG, deadlineStrong: true, counterparty: { kind: "unknown", ref: "amt@example.org" } },
  { id: "m-frist-alt", signals: {}, deadlineMs: NOW - 40 * TAG, deadlineStrong: true, counterparty: { kind: "unknown", ref: "amt@example.org" } },
  { id: "m-frist-schwach", signals: {}, deadlineMs: NOW + TAG, counterparty: { kind: "unknown", ref: "werbung@example.org" } },
  { id: "m-rechnung-ohne", signals: { invoiceOrPayment: true }, tags: ["rechnung"], counterparty: { kind: "unknown", ref: "shop@example.org" } },
  { id: "m-patient", signals: { critical: true }, tags: ["kritisch", "anwalt"], counterparty: { kind: "patient", ref: "patient@example.org" } },
  { id: "b-rueckruf", signals: { callbackRequested: true }, counterparty: { kind: "patient", ref: "01700000109" } },
];
const post = (id, eventId, o = {}) => fall(id, { eventIds: [eventId], updates: [kontakt("Nadine", id, eventId)], ...o });
const c2 = [
  post("frist", "m-frist"),
  post("mahnung", "m-mahnung"),
  post("rechnung", "m-rechnung", { topic: "billing" }),
  post("frist-alt", "m-frist-alt"),
  post("frist-schwach", "m-frist-schwach"),
  post("rechnung-ohne", "m-rechnung-ohne", { topic: "billing" }),
  post("patientenpost", "m-patient"),
  fall("anruf", { topic: "callback", eventIds: ["b-rueckruf"], updates: [kontakt("Bianca", "Rückruf", "b-rueckruf")] }),
];
const o2 = baueTagesliste({ cases: c2, events: ev2, nowMs: NOW, endOfDayMs: NOW + 6 * STD });
const reihe = o2.patienten.map((p) => `${p.id}:${p.bereich}:${p.dringlichkeit}`).join(" ");
check(reihe === "patientenpost:patient:sofort anruf:patient:heute rechnung:rechnung:heute mahnung:mahnung:sofort frist:frist:normal",
  `Patienten vor Rechnungen, Mahnungen und Fristsachen — auch vor einer dringenden Mahnung (${reihe})`);
check(!o2.patienten.some((p) => ["frist-alt", "frist-schwach", "rechnung-ohne"].includes(p.id)), "verfallene Frist, schwache Frist und Rechnung ohne Frist bleiben gewöhnliche Post");
check(o2.patienten.find((p) => p.id === "rechnung").fristMs === NOW + 2 * TAG, "die Frist steht an der Zeile");
check(bereichVon(fall("x", { subject: { patientId: "p1" }, topic: "billing" }), "Nadine", {}) === "patient", "Rechnungsfrage eines Patienten ist ein Patienten-Vorgang");

// "Ich kümmere mich" und "Erledigt" tragen aus; der Verlauf am Vorgang liefert die Listen.
const schritt = (by, von, nach, ts) => ({ kind: "status", by, statusFrom: von, statusTo: nach, ts });
const START = NOW - 8 * STD;
const c3 = [
  fall("genommen", { topic: "callback", status: "in_progress", updates: [kontakt("Bianca", "Rückruf"), schritt("Sabine", "open", "in_progress", NOW - STD)] }),
  fall("fertig", { topic: "callback", status: "resolved", updates: [kontakt("Bianca", "Rückruf"), schritt("Sabine", "open", "in_progress", NOW - 3 * STD), schritt("Sabine", "in_progress", "resolved", NOW - 2 * STD)] }),
  fall("mehrfach", { topic: "callback", status: "resolved", updates: [kontakt("Bianca", "Rückruf"), schritt("Chef", "open", "resolved", NOW - STD), schritt("Chef", "resolved", "resolved", NOW - STD + 1)] }),
  fall("gestern", { topic: "callback", status: "resolved", updates: [kontakt("Bianca", "Rückruf"), schritt("Sabine", "open", "resolved", START - STD)] }),
  fall("von-ki", { topic: "callback", status: "resolved", updates: [kontakt("Bianca", "Rückruf"), schritt("Clara", "open", "resolved", NOW - STD)] }),
  fall("termin-fertig", { topic: "appointment", status: "resolved", updates: [kontakt("Bianca", "Termin gebucht"), schritt("Sabine", "open", "resolved", NOW - STD)] }),
  fall("bei-lisa-arbeit", { topic: "callback", status: "in_progress", assignee: "Lisa", updates: [kontakt("Bianca", "Rückruf"), schritt("Sabine", "open", "in_progress", NOW - STD)] }),
  fall("offen", { topic: "callback", updates: [kontakt("Bianca", "Rückruf")] }),
  fall("arbeit-ohne-klick", { topic: "callback", status: "in_progress", assignee: "Team", updates: [kontakt("Bianca", "Rückruf"), { kind: "note", by: "Clara", text: "Delegiert an Team" }] }),
];
const o3 = baueTagesliste({ cases: c3, nowMs: NOW, endOfDayMs: NOW + 6 * STD, startOfDayMs: START });
check(o3.patienten.map((p) => p.id).sort().join(",") === "arbeit-ohne-klick,offen", "übernommene und erledigte Vorgänge stehen nicht mehr in der offenen Liste; in Arbeit ohne Klick eines Menschen bleibt sichtbar");
const gen = o3.uebernommen[0];
check(o3.uebernommen.length === 1 && gen.id === "genommen" && gen.wer === "Sabine" && gen.von === "open" && gen.nach === "in_progress" && gen.zurueck === "open" && gen.wannMs === NOW - STD,
  "übernommen: wer, wann, von, nach und der Stand fürs Rückgängig");
check(o3.erledigtHeute.map((v) => v.id).join(",") === "mehrfach,fertig", "heute erledigt: nur heutige Schritte von Menschen an Vorgängen der Liste, Neuestes oben");
check(o3.erledigtHeute.find((v) => v.id === "fertig").zurueck === "in_progress", "Rückgängig nach Erledigt führt zurück auf übernommen");
check(o3.erledigtHeute.find((v) => v.id === "mehrfach").zurueck === "open", "Mehrfachklick: Rückgängig findet den letzten offenen Stand");

const mitNamen = fall("liste2", { status: "waiting_approval", topic: "appointment", assignee: "Lisa", createdBy: "Clara", updates: [],
  callList: { date: "2026-12-01", slot: { label: "10:00–11:00" }, calendarName: "Dr. Beispiel", bucketLabel: "Prophylaxe",
    candidates: [{ name: "Erika Musterfrau", visitMotiveName: "Zahnreinigung", consent: { sms: true, reminder: true } }, { name: "Weg", removed: true }, { name: "Otto Normal", campaignName: "Recall Herbst", consent: { sms: true } }] } });
const fl = baueTagesliste({ cases: [mitNamen], heute: "2026-11-26" }).patienten[0];
check(fl.bereich === "patient" && fl.freigabe.anrufe === 2 && fl.freigabe.patienten.map((k) => `${k.name}/${k.grund}/${k.weg}`).join(";") === "Erika Musterfrau/Zahnreinigung/Anruf;Otto Normal/Recall Herbst/SMS",
  "Anrufliste nennt ihre Patienten mit Anlass und Weg");

const sauber = vorlagenSaeubern({ "ze-da": "  Eigener Text  ", leer: "   ", zahl: 5, "": "x" });
check(Object.keys(sauber).join(",") === "ze-da" && sauber["ze-da"] === "Eigener Text", "Knopf-Texte: nur saubere Einträge bleiben");
check(Object.keys(vorlagenSaeubern(["a"])).length === 0, "Knopf-Texte: Liste statt Objekt wird verworfen");

// --- Zurueckstellen ("spaeter, am Montag") ---------------------------------
const ZTAG = 24 * STD;
const zs = (bisMs, seitMs = NOW - STD, anzahl = 1) => ({ bisMs, seitMs, by: "Chef", anzahl });
const zFaelle = [
  fall("z-laeuft", { topic: "callback", updates: [kontakt("Bianca", "Bittet um Rückruf")], lastContactAt: NOW - 5 * STD, zurueckgestellt: zs(NOW + ZTAG) }),
  fall("z-vorbei", { topic: "callback", updates: [kontakt("Bianca", "Bittet um Rückruf")], lastContactAt: NOW - 50 * STD, zurueckgestellt: zs(NOW - STD, NOW - 30 * STD, 2) }),
  fall("z-neuer-anruf", { topic: "callback", updates: [kontakt("Bianca", "Ruft wieder an")], lastContactAt: NOW - 10 * 60_000, zurueckgestellt: zs(NOW + ZTAG) }),
  fall("z-uebernommen", { status: "in_progress", topic: "callback", updates: [kontakt("Bianca", "Rückruf"), { kind: "status", by: "Sabine", statusFrom: "open", statusTo: "in_progress", ts: NOW - 4 * STD }], lastContactAt: NOW - 5 * STD, zurueckgestellt: zs(NOW + 2 * ZTAG) }),
  fall("z-post", { eventIds: ["e-mail"], updates: [kontakt("Nadine", "Newsletter", "e-mail")], zurueckgestellt: zs(NOW + ZTAG) }),
  fall("z-erledigt", { status: "resolved", topic: "callback", updates: [kontakt("Bianca", "Rückruf")], zurueckgestellt: zs(NOW + ZTAG) }),
];
const zOut = baueTagesliste({ cases: zFaelle, events, nowMs: NOW, endOfDayMs: NOW + 6 * STD });
const zOffen = zOut.patienten.map((p) => p.id).join(",");
check(zOut.zurueckgestellt.map((p) => p.id).join(",") === "z-laeuft,z-uebernommen" && zOut.zaehler.zurueckgestellt === 2,
  `zurückgestellt: steht in eigener Liste, das Früheste oben (${zOut.zurueckgestellt.map((p) => p.id)})`);
check(!zOffen.includes("z-laeuft") && !zOut.uebernommen.some((v) => v.id === "z-uebernommen"), "zurückgestellt: nicht offen und nicht unter übernommen");
check(zOut.zurueckgestellt[0].wer === "Chef" && zOut.zurueckgestellt[0].bisMs === NOW + ZTAG, "zurückgestellt: trägt Wer und Bis");
const vorbei = zOut.patienten.find((p) => p.id === "z-vorbei");
check(vorbei && vorbei.wiederVorgelegt.anzahl === 2 && vorbei.wiederVorgelegt.wer === "Chef", "nach Ablauf wieder offen, mit Vermerk und Zahl der Rückstellungen");
check(zOut.patienten.find((p) => p.id === "z-neuer-anruf")?.wiederVorgelegt?.neuerKontakt === true, "neuer Anruf holt den Vorgang sofort zurück");
check(!zOffen.includes("z-post") && !zOut.zurueckgestellt.some((p) => p.id === "z-post" || p.id === "z-erledigt"), "was nie in der Liste stand oder erledigt ist, erscheint auch zurückgestellt nicht");
process.env.MAS_ZURUECKSTELLEN = "0";
check(baueTagesliste({ cases: zFaelle, events, nowMs: NOW, endOfDayMs: NOW + 6 * STD }).zurueckgestellt.length === 0, "Not-Aus MAS_ZURUECKSTELLEN=0: alles wie vorher offen");
delete process.env.MAS_ZURUECKSTELLEN;

// Donnerstag, 26.11.2026 16:00 Berlin
const DO = berlinMs("2026-11-26", 16 * 60);
check(new Date(DO).toISOString() === "2026-11-26T15:00:00.000Z" && new Date(berlinMs("2026-07-01", 0)).toISOString() === "2026-06-30T22:00:00.000Z", "Berliner Uhr: Winter- und Sommerzeit");
check(naechsterArbeitstag(DO) === "2026-11-27" && naechsterArbeitstag(berlinMs("2026-11-27", 600)) === "2026-11-30", "nächster Arbeitstag überspringt das Wochenende");
check(naechsterArbeitstag(berlinMs("2026-12-24", 600)) === "2026-12-28", "nächster Arbeitstag überspringt Feiertage");
const ohne = bisAus({ nowMs: DO });
check(ohne.ok && ohne.tag === "2026-11-27" && !ohne.mitUhrzeit && bisGesprochen(ohne.bisMs, { nowMs: DO }) === "morgen, Freitag, den 27. November", "ohne Angabe: nächster Arbeitstag");
const mo = bisAus({ date: "2026-11-30", time: "14:30", nowMs: DO });
check(mo.ok && bisGesprochen(mo.bisMs, { mitUhrzeit: true, nowMs: DO }) === "Montag, den 30. November um 14:30 Uhr", "Datum mit Uhrzeit");
const heuteAbend = bisAus({ time: "18", nowMs: DO });
check(heuteAbend.ok && bisGesprochen(heuteAbend.bisMs, { mitUhrzeit: true, nowMs: DO }) === "heute um 18:00 Uhr", "nur Uhrzeit: heute");
check(bisAus({ time: "9:00", nowMs: DO }).reason === "vergangen" && bisAus({ date: "2026-11-20", nowMs: DO }).reason === "vergangen", "Vergangenes wird abgelehnt");
check(bisAus({ date: "nächste Woche", nowMs: DO }).reason === "datum_unlesbar" && bisAus({ date: "2026-11-30", time: "halb drei", nowMs: DO }).reason === "uhrzeit_unlesbar" && bisAus({ date: "2028-01-01", nowMs: DO }).reason === "zu_weit", "Unlesbares und zu Fernes wird abgelehnt");

console.log("tagesliste ok");
