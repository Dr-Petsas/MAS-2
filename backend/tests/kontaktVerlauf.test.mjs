// Kontaktverlauf: was aus einem Kontaktversuch geworden ist (Kontakt, Termin, Einhaltung), je Quelle getrennt.
// Schreibt nur unter clients/zzz-mas2-kontaktverlauf (Praxisgedaechtnis und erfundene Termine).
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { appendEvent, getEvent, queryByPatient, queryLatest, queryRecent } from "../src/brain/eventStore.js";
import { getRetentionConfig } from "../src/brain/retention.js";
import { fortschreiben, _taktVergessen } from "../src/brain/kontaktVerlauf.js";
import {
  abfrageAus, aufbewahrungAus, berlinTag, berlinUhrzeit, bezugAus, einhaltungAus, ersatzTermin, monateVon, pruefeReaktion, pruefeSendung, quelleVonAnruf,
  reaktionAnwenden, sendungEintrag, terminForm, termineZurechnen, verlaufAusAnruf, verlaufZeile, zahlenAus,
} from "../src/brain/kontaktVerlaufLogik.js";

const CID = "zzz-mas2-kontaktverlauf";
const ORT = "ort-1";
const jetzt = Date.now();
const STD = 3_600_000;
const TAG = 24 * STD;

// Die Meldepfade nehmen nur mit Schluessel an. Der Test bringt seinen eigenen mit, in einer Datei wie im Betrieb.
const SCHLUESSEL = randomBytes(32).toString("hex");
const SCHLUESSEL_DATEI = join(tmpdir(), `mas-kontaktverlauf-test-${process.pid}.txt`);
writeFileSync(SCHLUESSEL_DATEI, `${SCHLUESSEL}\n`);
process.env.MAS_KONTAKT_VERLAUF_SCHLUESSEL_DATEI = SCHLUESSEL_DATEI;

const { default: brainRouter } = await import("../src/routes/brain.js");
const { default: seiteRouter } = await import("../src/routes/claraSeite.js");
const { default: verlaufRouter } = await import("../src/routes/kontaktVerlauf.js");
const app = express();
app.use(express.json());
app.use(brainRouter);
app.use(seiteRouter);
app.use(verlaufRouter);
const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });

async function rufe(pfad, { method = "GET", body, schluessel = method === "POST" && pfad.startsWith("/brain/kontakt-verlauf/") ? SCHLUESSEL : "" } = {}) {
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${pfad}`, {
    method, headers: { "Content-Type": "application/json", "X-Client-Id": CID, ...(schluessel ? { "X-Service-Token": schluessel } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, daten: await r.json() };
}

const termine = () => admin.firestore().collection("clients").doc(CID).collection("locations").doc(ORT).collection("appointments");
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);

const buchung = () => masCollection(CID, "mas_config").doc("booking");

async function leeren() {
  const snaps = await Promise.all([masCollection(CID, "mas_events").get(), masCollection(CID, "mas_cases").get(), termine().get()]);
  await Promise.all([...snaps.flatMap((s) => s.docs.map((d) => d.ref.delete())), buchung().delete()]);
}

function termin(id, patientId, mehr = {}) {
  return termine().doc(id).set({ patient: { id: patientId }, status: "confirmed", patientStatus: 0, isDeleted: false, createdBy: "online",
    calendar: { name: "Dr. Beispiel" }, ...mehr });
}

function sendung(mehr = {}) {
  return { kontakt_id: "s-1", weg: "sms", zeit: new Date(jetzt - 3 * TAG).toISOString(), ergebnis: "gesendet", quelle: "luecke", aktion_id: "akt-1",
    patient: { id: "pat-a", vorname: "Erika", nachname: "Beispiel" }, standort: ORT, anlass: "Zahnreinigung", link: true, ...mehr };
}

const auskunft = async (abfrage = "") => {
  _taktVergessen();
  return (await rufe(`/brain/kontakt-verlauf${abfrage}`)).daten;
};
const zeile = (d, id) => d.eintraege.find((z) => z.id === id);

test.before(leeren);
test.after(async () => {
  await leeren();
  rmSync(SCHLUESSEL_DATEI, { force: true });
  srv.close();
  await admin.app().delete().catch(() => {});
});

test("Quelle und Block eines Anrufs ohne Datenbank", () => {
  assert.equal(bezugAus({}), null);
  assert.deepEqual(bezugAus({ quelle: "luecke-fuellen", aktionId: "a1", phoneCallId: "pc" }), { quelle: "luecke-fuellen", kennung: "", aktion_id: "a1", kampagne_id: "", phone_call_id: "pc" });
  assert.equal(quelleVonAnruf({ bezug: { kampagne_id: "k1" }, auftrag: { art: "luecke" } }), "kampagne");
  assert.equal(quelleVonAnruf({ bezug: { aktion_id: "a1" } }), "luecke");
  assert.equal(quelleVonAnruf({ auftrag: { art: "luecke" } }), "luecke");
  assert.equal(quelleVonAnruf({ auftrag: { art: "recall" } }), "recall");
  assert.equal(quelleVonAnruf({ auftrag: { art: "recall", kampagne: "Prophylaxe" } }), "kampagne");
  assert.equal(quelleVonAnruf({ auftrag: { art: "nachricht" } }), "sonst");
  assert.equal(quelleVonAnruf({}), "sonst");

  const beginnMs = new Date("2026-11-27T10:00:00+01:00").getTime();
  const niemand = verlaufAusAnruf({ beginnMs, erreicht: "niemand", standort: ORT });
  assert.deepEqual({ weg: niemand.weg, monat: niemand.monat, stand: niemand.kontakt.stand, erreicht: niemand.kontakt.erreicht, termin: niemand.termin.stand, einhaltung: niemand.einhaltung.stand, pruefen: niemand.pruefen },
    { weg: "anruf", monat: "2026-11", stand: "nicht_erreicht", erreicht: false, termin: "keiner", einhaltung: "kein_termin", pruefen: false });
  assert.equal(verlaufAusAnruf({ beginnMs, erreicht: "mailbox" }).kontakt.stand, "anrufbeantworter");
  assert.equal(verlaufAusAnruf({ beginnMs, erreicht: "gescheitert" }).kontakt.stand, "fehlgeschlagen");
  assert.equal(verlaufAusAnruf({ beginnMs, erreicht: "person", ausgang: "falsche_person" }).kontakt.erreicht, false);
  const mitTermin = verlaufAusAnruf({ beginnMs, erreicht: "person", ausgang: "termin", termin: { termin_id: "t1", datum: "2026-12-04", uhrzeit: "9:30", behandler: "Dr. Beispiel" } });
  assert.deepEqual({ erreicht: mitTermin.kontakt.erreicht, termin: mitTermin.termin.stand, id: mitTermin.termin.termin_id, uhrzeit: mitTermin.termin.uhrzeit, ueber: mitTermin.termin.ueber, einhaltung: mitTermin.einhaltung.stand, pruefen: mitTermin.pruefen },
    { erreicht: true, termin: "vereinbart", id: "t1", uhrzeit: "09:30", ueber: "lisa", einhaltung: "offen", pruefen: true });
  assert.equal(verlaufAusAnruf({ beginnMs, erreicht: "person", ausgang: "eintrag_gescheitert", zugesagt: { datum: "2026-12-04", uhrzeit: "10:00" } }).termin.stand, "zugesagt_nicht_eingetragen");
});

test("Meldungen der Plattform pruefen ohne Datenbank", () => {
  const grund = (mehr) => pruefeSendung(sendung(mehr)).grund;
  assert.equal(grund({ kontakt_id: " " }), "kontakt_id_fehlt");
  assert.equal(grund({ weg: "brief" }), "weg_unbekannt");
  assert.equal(grund({ zeit: "irgendwann" }), "zeit_unlesbar");
  assert.equal(grund({ ergebnis: "vielleicht" }), "ergebnis_unbekannt");
  assert.equal(grund({ quelle: "sonst" }), "quelle_unbekannt");
  assert.equal(grund({ aktion_id: "" }), "bezug_fehlt");
  assert.equal(grund({ quelle: "kampagne" }), "bezug_fehlt");
  assert.equal(grund({ patient: {} }), "patient_fehlt");
  assert.equal(grund({ standort: "" }), "standort_fehlt");

  const gemeldet = pruefeSendung(sendung({ quelle: "kampagne", kampagne_id: "k1", kampagne_name: "Prophylaxe" })).sendung;
  const e = sendungEintrag(CID, gemeldet, { verfallMs: gemeldet.ms + 90 * TAG });
  assert.equal(e.id, "kontakt-s-1");
  assert.equal("ts" in e, false, "ausserhalb der Zeitreihe: kein Feld ts");
  assert.deepEqual([e.zeitMs, e.expiresAtMs], [gemeldet.ms, gemeldet.ms + 90 * TAG], "die Zeit steht in zeitMs, geloescht wird ueber die eigene Frist");
  assert.equal(e.channel, "praxis_sms", "eigener Kanal: die Sperre der alten Lisa-SMS und die Anrufliste aendern sich nicht");
  assert.equal(e.status, "none");
  assert.deepEqual({ quelle: e.verlauf.quelle, kampagne: e.verlauf.kampagne_id, stand: e.verlauf.kontakt.stand, erreicht: e.verlauf.kontakt.erreicht },
    { quelle: "kampagne", kampagne: "k1", stand: "gesendet", erreicht: false });

  assert.equal(pruefeReaktion({ art: "klick" }).grund, "art_unbekannt");
  assert.equal(pruefeReaktion({ art: "antwort", zeit: jetzt }).grund, "patient_fehlt");
  assert.equal(pruefeReaktion({ art: "buchung", zeit: jetzt, patient_id: "pat-a" }).grund, "termin_fehlt");
  const r = pruefeReaktion({ art: "buchung", zeit: jetzt, patient_id: "pat-a", termin: { termin_id: "t9", datum: "2026-12-04", uhrzeit: "10:00" } }).reaktion;
  const nach = reaktionAnwenden(e.verlauf, r);
  assert.deepEqual({ erreicht: nach.kontakt.erreicht, reaktion: nach.kontakt.reaktion, termin: nach.termin.termin_id, ueber: nach.termin.ueber, einhaltung: nach.einhaltung.stand, pruefen: nach.pruefen },
    { erreicht: true, reaktion: "buchung", termin: "t9", ueber: "online", einhaltung: "offen", pruefen: true });
  assert.equal(reaktionAnwenden(nach, pruefeReaktion({ art: "link_geoeffnet", zeit: jetzt, patient_id: "pat-a" }).reaktion), null, "die erste Reaktion bleibt stehen");
});

test("Zurechnung und Einhaltung ohne Datenbank", () => {
  const kontakt = (id, vorMs, mehr = {}) => ({ id, verlauf: { ...verlaufAusAnruf({ beginnMs: jetzt - vorMs, erreicht: "niemand" }), ...mehr } });
  const t = (id, mehr = {}) => terminForm(id, { start: jetzt + 5 * TAG, createdAt: jetzt - 1 * TAG, status: "confirmed", createdBy: "agent", calendar: { name: "Dr. Beispiel" }, ...mehr });

  // Der Termin gehoert zum letzten Kontakt davor.
  let aus = termineZurechnen([kontakt("a", 6 * TAG), kontakt("b", 2 * TAG), kontakt("c", 2 * STD)], [t("t1")], { jetzt });
  assert.deepEqual(aus.map((x) => [x.id, x.termin.termin_id, x.termin.ueber]), [["b", "t1", "telefon_ki"]]);
  // Aelter als 14 Tage: nicht mehr zugerechnet. Vor dem Kontakt gebucht: auch nicht.
  assert.deepEqual(termineZurechnen([kontakt("a", 20 * TAG)], [t("t1")], { jetzt }), []);
  assert.deepEqual(termineZurechnen([kontakt("a", 2 * STD)], [t("t1")], { jetzt }), []);
  // Unbestaetigt zaehlt nicht; der bestaetigte Platzhalter der Kampagne zaehlt ueber seine Kennung.
  assert.deepEqual(termineZurechnen([kontakt("a", 2 * TAG)], [t("t1", { status: "needsConfirmation" })], { jetzt }), []);
  aus = termineZurechnen([{ ...kontakt("a", 2 * TAG), angebotTerminId: "p1" }], [t("p1", { createdAt: jetzt - 3 * TAG, updatedAt: jetzt - 1 * TAG, createdBy: "campaign" })], { jetzt });
  assert.deepEqual(aus.map((x) => [x.id, x.termin.termin_id, x.termin.ueber, x.termin.vereinbart_ms]), [["a", "p1", "online", jetzt - 1 * TAG]]);
  // Ein fehlgeschlagener Versand bekommt keinen Termin.
  assert.deepEqual(termineZurechnen([kontakt("a", 2 * TAG, { kontakt: { stand: "fehlgeschlagen", ms: jetzt - 2 * TAG } })], [t("t1")], { jetzt }), []);

  const start = jetzt + 5 * TAG;
  const v = { termin: { stand: "vereinbart", termin_id: "t1", datum: berlinTag(start), uhrzeit: berlinUhrzeit(start) }, einhaltung: { stand: "offen", verlegt: false } };
  const e = (mehr, wann = jetzt) => einhaltungAus(v, mehr === null ? null : t("t1", mehr), { jetzt: wann });
  assert.deepEqual([e({}).stand, e({}).fertig], ["offen", false]);
  for (const s of [1, 2, 3]) assert.deepEqual([e({ patientStatus: s }).stand, e({ patientStatus: s }).fertig], ["wahrgenommen", true]);
  assert.equal(e({ patientStatus: 4 }).stand, "nicht_erschienen");
  assert.equal(e({ patientStatus: 5 }).stand, "abgesagt");
  assert.equal(e({ isDeleted: true }).stand, "abgesagt");
  assert.equal(e({ status: "declined" }).stand, "abgesagt");
  // Der Tag ist vorbei und nichts ist vermerkt: unklar, nicht eingehalten; 14 Tage wird weiter nachgesehen.
  assert.deepEqual([e({}, start + 2 * TAG).stand, e({}, start + 2 * TAG).fertig], ["unklar", false]);
  assert.equal(e({}, start + 16 * TAG).fertig, true);
  // Andere Zeit unter derselben Kennung: verlegt; danach wahrgenommen bleibt "verlegt" vermerkt.
  const verlegt = e({ start: start + 2 * TAG });
  assert.deepEqual([verlegt.stand, verlegt.verlegt, verlegt.verlegt_auf.datum], ["verlegt", true, berlinTag(start + 2 * TAG)]);
  const danach = einhaltungAus({ ...v, einhaltung: verlegt }, t("t1", { start: start + 2 * TAG, patientStatus: 2 }), { jetzt });
  assert.deepEqual([danach.stand, danach.verlegt], ["wahrgenommen", true]);
  assert.deepEqual([e(null).stand, e(null).hinweis], ["unklar", "termin_nicht_gefunden"]);

  const alt = t("t1", { isDeleted: true, deletedAt: jetzt - 2 * STD });
  assert.equal(ersatzTermin(alt, [alt, t("t2", { createdAt: jetzt - 1 * STD, start: jetzt + 7 * TAG })])?.id, "t2");
  assert.equal(ersatzTermin(alt, [t("t3", { createdAt: jetzt - 3 * TAG })]), null, "ein Termin von frueher ist kein Ersatz");
});

test("Zahlen: Patienten einmal, Versuche daneben, je Quelle getrennt", () => {
  const z = (id, quelle, patient, mehr = {}) => {
    const e = sendungEintrag(CID, pruefeSendung(sendung({ kontakt_id: id, quelle, kampagne_id: quelle === "kampagne" ? "k1" : "", kampagne_name: quelle === "kampagne" ? "Prophylaxe" : "",
      aktion_id: quelle === "luecke" ? "akt-1" : "", patient: { id: patient, nachname: patient }, ergebnis: mehr.ergebnis || "gesendet" })).sendung);
    return verlaufZeile({ ...e, verlauf: { ...e.verlauf, ...(mehr.verlauf || {}) } });
  };
  const gebucht = { kontakt: { stand: "gesendet", erreicht: true, ms: jetzt - 3 * TAG, reaktion: "buchung" }, termin: { stand: "vereinbart", termin_id: "t1" } };
  const zahlen = zahlenAus([
    z("1", "kampagne", "a", { verlauf: { ...gebucht, einhaltung: { stand: "wahrgenommen" } } }),
    z("2", "kampagne", "a"),
    z("3", "kampagne", "b", { ergebnis: "fehlgeschlagen" }),
    z("4", "luecke", "a", { verlauf: { ...gebucht, einhaltung: { stand: "unklar" } } }),
    z("5", "luecke", "c"),
  ]);
  const vier = (b) => [b.kontaktiert, b.erreicht, b.termin, b.eingehalten, b.versuche];
  assert.deepEqual(vier(zahlen.je_quelle.kampagne), [1, 1, 1, 1, 3], "fehlgeschlagen ist ein Versuch, aber kein Kontakt");
  assert.deepEqual(vier(zahlen.je_quelle.luecke), [2, 1, 1, 0, 2], "unklar ist nicht eingehalten");
  assert.deepEqual(vier(zahlen.je_quelle.recall), [0, 0, 0, 0, 0]);
  assert.deepEqual(vier(zahlen.gesamt), [2, 1, 1, 1, 5], "Patient a zaehlt in der Summe einmal");
  assert.deepEqual(zahlen.je_quelle.luecke.einhaltung, { offen: 0, wahrgenommen: 0, abgesagt: 0, nicht_erschienen: 0, verlegt: 0, unklar: 1 });
  assert.deepEqual(zahlen.je_aktion.map((a) => [a.quelle, a.kampagne_id || a.aktion_id, a.name, a.zahlen.versuche]).sort(), [["kampagne", "k1", "Prophylaxe", 3], ["luecke", "akt-1", "", 2]]);

  const a = abfrageAus({ von: "2026-10-15", bis: "2026-11-20", quelle: "kampagne,quatsch", weg: "sms" }, { jetzt: new Date("2026-11-27T12:00:00Z").getTime() });
  assert.deepEqual({ von: a.von, bis: a.bis, quellen: a.quellen, wege: a.wege }, { von: "2026-10-15", bis: "2026-11-20", quellen: ["kampagne"], wege: ["sms"] });
  assert.deepEqual(monateVon("2026-10-15", "2027-01-03"), ["2026-10", "2026-11", "2026-12", "2027-01"]);
  const ohne = abfrageAus({}, { jetzt: new Date("2026-11-27T12:00:00Z").getTime() });
  assert.deepEqual([ohne.von, ohne.bis], ["2026-10-29", "2026-11-27"], "ohne Angabe die letzten 30 Tage");
  assert.deepEqual([ohne.standorte, abfrageAus({ standort: "ort-1, ort-2,,ort-1" }).standorte], [[], ["ort-1", "ort-2"]]);

  // Aufbewahrung 90 Tage am 27.11.: der 29.08. ist nur noch zum Teil da, ab dem 30.08. ist alles da.
  const mittag = new Date("2026-11-27T12:00:00Z").getTime();
  assert.deepEqual(aufbewahrungAus(90, "2026-10-29", { jetzt: mittag }), { tage: 90, vollstaendig_ab: "2026-08-30", zeitraum_vollstaendig: true });
  assert.equal(aufbewahrungAus(90, "2026-08-30", { jetzt: mittag }).zeitraum_vollstaendig, true);
  assert.equal(aufbewahrungAus(90, "2026-08-29", { jetzt: mittag }).zeitraum_vollstaendig, false);
});

test("Zugang: die Meldepfade nehmen nur mit dem Schluessel an, alles andere bleibt offen wie bisher", async () => {
  const melden = (pfad, schluessel, body) => rufe(`/brain/kontakt-verlauf/${pfad}`, { method: "POST", schluessel, body });
  const reaktion = { art: "antwort", zeit: jetzt, patient_id: "pat-niemand", trocken: true };
  for (const [pfad, body] of [["sendung", sendung({ kontakt_id: "s-zugang", trocken: true })], ["reaktion", reaktion]]) {
    const ohne = await melden(pfad, "", body);
    assert.deepEqual([ohne.status, ohne.daten.ok, ohne.daten.grund], [401, false, "schluessel_ungueltig"], `${pfad} ohne Schluessel`);
    const falsch = await melden(pfad, `${SCHLUESSEL.slice(0, -1)}x`, body);
    assert.deepEqual([falsch.status, falsch.daten.grund], [401, "schluessel_ungueltig"], `${pfad} mit falschem Schluessel`);
    const mit = await melden(pfad, SCHLUESSEL, body);
    assert.deepEqual([mit.status, mit.daten.ok], [200, true], `${pfad} mit Schluessel`);
  }
  assert.equal((await masCollection(CID, "mas_events").get()).size, 0, "abgelehnt und trocken schreiben nichts");

  // Kein Schluessel eingerichtet, Datei fehlt oder Inhalt zu kurz: nichts wird angenommen, auch nicht mit dem alten Schluessel.
  const kurz = join(tmpdir(), `mas-kontaktverlauf-test-kurz-${process.pid}.txt`);
  writeFileSync(kurz, "zu-kurz");
  try {
    for (const datei of ["", join(tmpdir(), "mas-kontaktverlauf-gibt-es-nicht.txt"), kurz]) {
      process.env.MAS_KONTAKT_VERLAUF_SCHLUESSEL_DATEI = datei;
      const r = await melden("sendung", datei === kurz ? "zu-kurz" : SCHLUESSEL, sendung({ trocken: true }));
      assert.deepEqual([r.status, r.daten.grund], [503, "schluessel_nicht_eingerichtet"]);
    }
  } finally {
    process.env.MAS_KONTAKT_VERLAUF_SCHLUESSEL_DATEI = SCHLUESSEL_DATEI;
    rmSync(kurz, { force: true });
  }

  // Auskunft, Tagesliste und Lisas Meldung brauchen den Schluessel nicht.
  assert.equal((await rufe("/brain/kontakt-verlauf?eintraege=0")).status, 200);
  assert.equal((await rufe("/brain/tagesliste")).status, 200);
  const lisa = await rufe("/brain/lisa-anrufe", { method: "POST", body: {} });
  assert.equal(lisa.status, 400, "Lisas Meldung wird inhaltlich geprueft, nicht am Schluessel abgewiesen");
  assert.ok(lisa.daten.grund && !String(lisa.daten.grund).startsWith("schluessel"));
  assert.equal((await masCollection(CID, "mas_events").get()).size, 0);
});

test("Sendung melden: ein Eintrag, doppelt und trocken erzeugen nichts", async () => {
  const erst = await rufe("/brain/kontakt-verlauf/sendung", { method: "POST", body: sendung() });
  assert.equal(erst.status, 201);
  assert.deepEqual({ ok: erst.daten.ok, id: erst.daten.id, neu: erst.daten.neu }, { ok: true, id: "kontakt-s-1", neu: true });
  const doppelt = await rufe("/brain/kontakt-verlauf/sendung", { method: "POST", body: sendung({ anlass: "etwas anderes" }) });
  assert.deepEqual([doppelt.status, doppelt.daten.neu], [200, false]);
  const trocken = await rufe("/brain/kontakt-verlauf/sendung", { method: "POST", body: sendung({ kontakt_id: "s-trocken", trocken: true }) });
  assert.deepEqual([trocken.status, trocken.daten.trocken], [200, true]);
  const falsch = await rufe("/brain/kontakt-verlauf/sendung", { method: "POST", body: sendung({ weg: "brief" }) });
  assert.deepEqual([falsch.status, falsch.daten.grund], [400, "weg_unbekannt"]);
  assert.equal((await masCollection(CID, "mas_events").get()).size, 1, "genau ein Eintrag");
  assert.equal((await masCollection(CID, "mas_cases").get()).size, 0, "es entsteht kein Vorgang");

  const d = await auskunft();
  const l = d.zahlen.je_quelle.luecke;
  assert.deepEqual([l.kontaktiert, l.erreicht, l.termin, l.eingehalten, l.versuche], [1, 0, 0, 0, 1], "verschickt zaehlt als kontaktiert, nicht als erreicht");
  assert.equal(zeile(d, "kontakt-s-1").kontakt.text, "verschickt, keine Reaktion");
  assert.equal(zeile(d, "kontakt-s-1").patientSchluessel, undefined);
});

test("Reaktion melden: Link geoeffnet macht aus kontaktiert erreicht", async () => {
  const r = await rufe("/brain/kontakt-verlauf/reaktion", { method: "POST", body: { art: "link_geoeffnet", zeit: jetzt - 3 * TAG + STD, patient_id: "pat-a", aktion_id: "akt-1" } });
  assert.deepEqual([r.status, r.daten.zugeordnet, r.daten.id], [200, true, "kontakt-s-1"]);
  const fremd = await rufe("/brain/kontakt-verlauf/reaktion", { method: "POST", body: { art: "antwort", zeit: jetzt, patient_id: "pat-unbekannt" } });
  assert.deepEqual([fremd.status, fremd.daten.zugeordnet], [200, false]);
  const d = await auskunft();
  assert.equal(d.zahlen.je_quelle.luecke.erreicht, 1);
  assert.equal(zeile(d, "kontakt-s-1").kontakt.text, "verschickt, Link geöffnet");
});

test("spaeter gebuchter Termin wird zugerechnet, Einhaltung kommt aus dem Terminstatus", async () => {
  // Gebucht einen Tag nach der SMS, Termin war gestern, im Kalender ist nichts vermerkt.
  await termin("t-a", "pat-a", { start: ts(jetzt - 1 * TAG), createdAt: ts(jetzt - 2 * TAG), createdBy: "agent" });
  let d = await auskunft();
  let z = zeile(d, "kontakt-s-1");
  assert.deepEqual({ termin: z.termin.stand, id: z.termin.termin_id, ueber: z.termin.ueber, einhaltung: z.einhaltung.stand },
    { termin: "vereinbart", id: "t-a", ueber: "telefon_ki", einhaltung: "unklar" });
  let l = d.zahlen.je_quelle.luecke;
  assert.deepEqual([l.termin, l.eingehalten, l.einhaltung.unklar], [1, 0, 1], "unklar ist nicht eingehalten");

  // Die Praxis traegt nach: behandelt.
  await termine().doc("t-a").update({ patientStatus: 2 });
  d = await auskunft();
  z = zeile(d, "kontakt-s-1");
  assert.equal(z.einhaltung.stand, "wahrgenommen");
  l = d.zahlen.je_quelle.luecke;
  assert.deepEqual([l.kontaktiert, l.erreicht, l.termin, l.eingehalten, l.versuche], [1, 1, 1, 1, 1]);
  const gespeichert = (await masCollection(CID, "mas_events").doc("kontakt-s-1").get()).data().verlauf;
  assert.deepEqual([gespeichert.pruefen, gespeichert.einhaltung.fertig], [false, true], "danach wird nicht mehr nachgesehen");
});

test("Kampagne: abgesagt und neu gebucht ist verlegt; die Quellen bleiben getrennt", async () => {
  await rufe("/brain/kontakt-verlauf/sendung", { method: "POST", body: sendung({ kontakt_id: "k-1", weg: "email", quelle: "kampagne", aktion_id: "", kampagne_id: "kam-1", kampagne_name: "Prophylaxe im November",
    patient: { id: "pat-b", vorname: "Max", nachname: "Beispiel" } }) });
  const buchung = await rufe("/brain/kontakt-verlauf/reaktion", { method: "POST", body: { art: "buchung", zeit: jetzt - 2 * TAG, patient_id: "pat-b", kontakt_id: "k-1",
    termin: { termin_id: "t-b1", standort: ORT, datum: berlinTag(jetzt + 5 * TAG), uhrzeit: berlinUhrzeit(jetzt + 5 * TAG), behandler: "Dr. Beispiel" } } });
  assert.equal(buchung.daten.zugeordnet, true);
  await termin("t-b1", "pat-b", { start: ts(jetzt + 5 * TAG), createdAt: ts(jetzt - 2 * TAG) });
  let d = await auskunft();
  assert.deepEqual([zeile(d, "kontakt-k-1").termin.ueber, zeile(d, "kontakt-k-1").einhaltung.stand], ["online", "offen"]);

  await termine().doc("t-b1").update({ isDeleted: true, deletedAt: ts(jetzt - 2 * STD) });
  await termin("t-b2", "pat-b", { start: ts(jetzt + 6 * TAG), createdAt: ts(jetzt - 1 * STD), createdBy: "user-1" });
  d = await auskunft();
  const z = zeile(d, "kontakt-k-1");
  assert.deepEqual([z.einhaltung.stand, z.einhaltung.verlegt, z.einhaltung.verlegtAuf.datum], ["verlegt", true, berlinTag(jetzt + 6 * TAG)]);

  await termine().doc("t-b2").update({ patientStatus: 1 });
  d = await auskunft();
  assert.equal(zeile(d, "kontakt-k-1").einhaltung.stand, "wahrgenommen", "verlegt und dann wahrgenommen zaehlt als eingehalten");
  const vier = (b) => [b.kontaktiert, b.erreicht, b.termin, b.eingehalten, b.versuche];
  assert.deepEqual(vier(d.zahlen.je_quelle.kampagne), [1, 1, 1, 1, 1]);
  assert.deepEqual(vier(d.zahlen.je_quelle.luecke), [1, 1, 1, 1, 1]);
  assert.deepEqual(vier(d.zahlen.je_quelle.recall), [0, 0, 0, 0, 0]);
  assert.deepEqual(vier(d.zahlen.gesamt), [2, 2, 2, 2, 2]);
  assert.deepEqual(d.zahlen.je_aktion.map((a) => [a.quelle, a.name]).sort(), [["kampagne", "Prophylaxe im November"], ["luecke", ""]]);

  const nur = await auskunft("?quelle=kampagne&eintraege=0");
  assert.equal(nur.eintraege, undefined);
  assert.equal(nur.zahlen.gesamt.versuche, 1, "der Filter nach Quelle gilt auch fuer die Zahlen");
});

test("Lisas Anruf: Bezug bestimmt die Quelle, ein Rueckruf bei Bianca zaehlt als erreicht", async () => {
  const anruf = (mehr) => rufe("/brain/lisa-anrufe", { method: "POST", body: { nummer: "+491700000401", beginn: jetzt - 2 * TAG, erreicht: "niemand",
    patient: { id: "pat-c", vorname: "Lena", nachname: "Beispiel" }, anlass: "Zahnreinigung", standort: ORT, ...mehr } });
  const luecke = await anruf({ anruf_id: "v-1", bezug: { quelle: "luecke-fuellen", aktionId: "akt-1", phoneCallId: "pc-1" } });
  assert.equal(luecke.status, 201);
  const recall = await anruf({ anruf_id: "v-2", nummer: "+491700000402", beginn: jetzt - 1 * TAG, erreicht: "person", ausgang: "termin", auftrag: { art: "recall" },
    patient: { id: "pat-d", vorname: "Jonas", nachname: "Beispiel" }, termin: { datum: berlinTag(jetzt + 3 * TAG), uhrzeit: berlinUhrzeit(jetzt + 3 * TAG), behandler: "Dr. Beispiel" } });
  assert.equal(recall.status, 201);
  // Lisa hat keine Kennung gemeldet: der Termin wird ueber Tag und Uhrzeit im Kalender gefunden.
  await termin("t-d", "pat-d", { start: ts(jetzt + 3 * TAG), createdAt: ts(jetzt - 1 * TAG), createdBy: "recaller" });

  const gespeichert = (await masCollection(CID, "mas_events").doc("lisa-anruf-v-1").get()).data();
  assert.deepEqual([gespeichert.verlauf.quelle, gespeichert.verlauf.aktion_id, gespeichert.anruf.phone_call_id], ["luecke", "akt-1", "pc-1"]);

  let d = await auskunft();
  assert.deepEqual([zeile(d, "lisa-anruf-v-1").quelle, zeile(d, "lisa-anruf-v-1").kontakt.erreicht], ["luecke", false]);
  const r = zeile(d, "lisa-anruf-v-2");
  assert.deepEqual([r.quelle, r.termin.termin_id, r.termin.ueber, r.einhaltung.stand], ["recall", "t-d", "lisa", "offen"]);
  assert.deepEqual([d.zahlen.je_quelle.recall.kontaktiert, d.zahlen.je_quelle.recall.termin, d.zahlen.je_quelle.luecke.versuche], [1, 1, 2]);

  // Die Person ruft bei Bianca zurueck.
  await appendEvent(CID, { id: "evt-rueckruf", ts: jetzt - 1 * TAG, channel: "bianca_call", direction: "in", type: "interaction", summary: "Rückruf",
    counterparty: { kind: "patient", name: "Lena Beispiel" }, subject: { patientId: "pat-c", name: "Lena Beispiel" } });
  d = await auskunft();
  const z = zeile(d, "lisa-anruf-v-1");
  assert.deepEqual([z.kontakt.stand, z.kontakt.erreicht, z.kontakt.reaktion, z.kontakt.text], ["nicht_erreicht", true, "rueckruf", "nicht erreicht, hat zurückgerufen"]);
  assert.equal(d.zahlen.je_quelle.luecke.erreicht, 2);

  // Auf der Clara-Seite steht dieselbe Zeile am Anruf.
  const seite = (await rufe("/brain/tagesliste")).daten.lisaAnrufe;
  const alle = [...seite.offen, ...seite.heute];
  for (const x of alle) assert.ok(x.verlauf && x.verlauf.quelle && x.verlauf.patientSchluessel === undefined, "jede Zeile traegt den Verlauf");
});

test("ein Anruf aus der Zeit vor dem Block wird einmal nachgetragen", async () => {
  const ref = masCollection(CID, "mas_events").doc("lisa-anruf-v-2");
  await ref.update({ verlauf: admin.firestore.FieldValue.delete() });
  _taktVergessen();
  const lauf = await fortschreiben(CID, { erzwingen: true });
  assert.equal(lauf.nachgetragen, 1);
  const v = (await ref.get()).data().verlauf;
  assert.deepEqual([v.weg, v.quelle, v.termin.stand, v.termin.termin_id], ["anruf", "recall", "vereinbart", "t-d"], "nachgetragen und im selben Lauf wieder mit dem Termin verknuepft");
  assert.deepEqual(await fortschreiben(CID), { uebersprungen: true }, "hoechstens alle zehn Minuten");
});

test("Auskunft: Filter nach Standort, die Aufbewahrung der Praxis steht in der Antwort", async () => {
  await rufe("/brain/kontakt-verlauf/sendung", { method: "POST", body: sendung({ kontakt_id: "o-2", standort: "ort-2", aktion_id: "akt-2", patient: { id: "pat-e", nachname: "Zwei" } }) });
  // Ein Anruf von Lisa ohne Standort gehoert zum Standardstandort der Praxis.
  await buchung().set({ locationId: ORT });
  const ohne = await rufe("/brain/lisa-anrufe", { method: "POST", body: { anruf_id: "v-ohne-ort", nummer: "+491700000405", beginn: jetzt - 2 * STD, erreicht: "niemand",
    patient: { id: "pat-f", vorname: "Ida", nachname: "Beispiel" }, anlass: "Zahnreinigung" } });
  assert.equal(ohne.status, 201);

  const alle = await auskunft();
  const zwei = await auskunft("?standort=ort-2");
  const eins = await auskunft(`?standort=${ORT}`);
  const beide = await auskunft(`?standort=${ORT},ort-2`);
  assert.deepEqual(zwei.eintraege.map((z) => z.id), ["kontakt-o-2"]);
  assert.deepEqual([zwei.zahlen.gesamt.versuche, zwei.zahlen.je_quelle.luecke.kontaktiert, zwei.zahlen.je_aktion.map((a) => a.aktion_id)], [1, 1, ["akt-2"]], "der Filter gilt auch fuer die Zahlen");
  assert.ok(eins.eintraege.length > 1 && eins.eintraege.every((z) => z.standort === ORT));
  assert.equal(zeile(eins, "lisa-anruf-v-ohne-ort").standort, ORT, "ohne eigenen Standort: Standardstandort");
  assert.equal(eins.zahlen.gesamt.versuche + zwei.zahlen.gesamt.versuche, alle.zahlen.gesamt.versuche);
  assert.equal(beide.zahlen.gesamt.versuche, alle.zahlen.gesamt.versuche);
  assert.equal((await auskunft("?standort=gibt-es-nicht")).zahlen.gesamt.versuche, 0);

  const tage = (await getRetentionConfig(CID)).days;
  assert.deepEqual(alle.aufbewahrung, { tage, vollstaendig_ab: berlinTag(Date.now() - (tage - 1) * TAG), zeitraum_vollstaendig: true });
  const weit = await auskunft(`?von=${berlinTag(jetzt - 300 * TAG)}&eintraege=0`);
  assert.equal(weit.aufbewahrung.zeitraum_vollstaendig, tage >= 301, "weiter zurueck als die Aufbewahrung ist als unvollstaendig gekennzeichnet");
});

test("Sendungen stehen ausserhalb der Zeitreihe: 801 neuere Sendungen verdraengen den offenen Anruf von Lisa nicht", async () => {
  const NUMMER = "+491700000409";
  const offen = await rufe("/brain/lisa-anrufe", { method: "POST", body: { anruf_id: "v-9", nummer: NUMMER, beginn: jetzt - 3 * STD, erreicht: "niemand",
    patient: { id: "pat-z", vorname: "Otto", nachname: "Beispiel" }, anlass: "Kontrolluntersuchung", standort: ORT } });
  assert.deepEqual([offen.status, offen.daten.offen], [201, true]);

  // Eine Kampagne meldet danach 801 Sendungen: mehr, als Biancas Auskunft und die Tagesliste lesen (800).
  const ANZAHL = 801;
  const db = admin.firestore();
  for (let von = 0; von < ANZAHL; von += 400) {
    const batch = db.batch();
    for (let i = von; i < Math.min(ANZAHL, von + 400); i += 1) {
      const s = pruefeSendung(sendung({ kontakt_id: `m-${i}`, zeit: jetzt - STD + i, quelle: "kampagne", aktion_id: "", kampagne_id: "kam-gross", kampagne_name: "Grosse Kampagne",
        patient: { id: `pat-m-${i}`, nachname: `Muster${i}` } })).sendung;
      const e = sendungEintrag(CID, s, { verfallMs: s.ms + 90 * TAG });
      batch.create(masCollection(CID, "mas_events").doc(e.id), e);
    }
    await batch.commit();
  }

  // Wer "die neuesten N seit" liest, sieht keine Sendung und findet den Anruf.
  for (const lesen of [queryLatest, queryRecent]) {
    const reihe = await lesen(CID, jetzt - 14 * TAG, 800);
    assert.equal(reihe.filter((e) => e.extractor === "plattform-versand").length, 0, `${lesen.name}: keine Sendung in der Zeitreihe`);
    assert.ok(reihe.some((e) => e.id === "lisa-anruf-v-9"), `${lesen.name}: der offene Anruf ist da`);
  }
  const k = (await rufe(`/brain/caller-context?phone=${encodeURIComponent(NUMMER)}`)).daten;
  assert.deepEqual([k.found, k.openEventIds], [true, ["lisa-anruf-v-9"]], "Bianca kennt den offenen Anruf beim Rueckruf");
  const seite = (await rufe("/brain/tagesliste")).daten.lisaAnrufe;
  assert.ok(seite.offen.some((z) => z.id === "lisa-anruf-v-9"), "die Tagesliste zeigt den offenen Anruf");
  // Ein spaeterer Anruf von Lisa findet den frueheren Versuch und ersetzt ihn.
  const zweiter = await rufe("/brain/lisa-anrufe", { method: "POST", body: { anruf_id: "v-10", nummer: NUMMER, beginn: jetzt - 1 * STD, erreicht: "mailbox",
    patient: { id: "pat-z", vorname: "Otto", nachname: "Beispiel" }, anlass: "Kontrolluntersuchung", standort: ORT } });
  assert.deepEqual([zweiter.daten.ersetzt, zweiter.daten.versuche], [["lisa-anruf-v-9"], 2]);

  // Gezaehlt werden die Sendungen trotzdem, und je Patient sind sie mit ihrer Zeit zu finden.
  const d = await auskunft("?kampagne_id=kam-gross&eintraege=0");
  assert.deepEqual([d.zahlen.gesamt.versuche, d.zahlen.je_quelle.kampagne.kontaktiert, d.zahlen.je_quelle.luecke.versuche], [ANZAHL, ANZAHL, 0]);
  const einer = await queryByPatient(CID, "pat-m-5");
  assert.deepEqual([einer.length, einer[0].id, einer[0].ts], [1, "kontakt-m-5", jetzt - STD + 5]);
  assert.equal((await getEvent(CID, "kontakt-m-5")).ts, jetzt - STD + 5);

  // Ueber die Schnittstelle gemeldet: ohne ts, mit der Aufbewahrung der Praxis als eigener Frist. Der taegliche
  // Aufraeumlauf loescht ueber genau diese Abfrage (retention.js, Schritt 1b).
  const alt = jetzt - 400 * TAG;
  const gemeldet = await rufe("/brain/kontakt-verlauf/sendung", { method: "POST", body: sendung({ kontakt_id: "uralt", zeit: alt, patient: { id: "pat-alt", nachname: "Alt" } }) });
  assert.equal(gemeldet.status, 201);
  const roh = (await masCollection(CID, "mas_events").doc("kontakt-uralt").get()).data();
  const tage = (await getRetentionConfig(CID)).days;
  assert.deepEqual(["ts" in roh, roh.zeitMs, roh.expiresAtMs], [false, alt, alt + tage * TAG]);
  const abgelaufen = await masCollection(CID, "mas_events").where("expiresAtMs", "<", Date.now()).get();
  assert.deepEqual(abgelaufen.docs.map((x) => x.id), ["kontakt-uralt"], "abgelaufen ist nur die alte Sendung");
});