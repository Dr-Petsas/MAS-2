// Clara-Seite gegen einen Testmandanten: die Notiz geht ueber den bestehenden
// Weg ins Praxisgedaechtnis und kommt bei Biancas Abfrage an; die Tagesliste
// zeigt eine wartende Anrufliste und gibt sie ueber den bestehenden
// Freigabeweg frei. Schreibt nur unter clients/zzz-mas2-claraseite.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { createCase } from "../src/brain/caseStore.js";

const CID = "zzz-mas2-claraseite";
const TELEFON = "01700000101";

const { default: brainRouter } = await import("../src/routes/brain.js");
const { default: seiteRouter } = await import("../src/routes/claraSeite.js");
const app = express();
app.use(express.json());
app.use(brainRouter);
app.use(seiteRouter);
const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });

async function rufe(pfad, { method = "GET", body } = {}) {
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${pfad}`, {
    method, headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, daten: await r.json() };
}

async function leeren() {
  for (const name of ["mas_cases", "mas_events", "mas_config"]) {
    const snap = await masCollection(CID, name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

test.before(leeren);
test.after(async () => {
  await leeren();
  srv.close();
  await admin.app().delete().catch(() => {});
});

test("Notiz von der Seite kommt bei Biancas Abfrage an und laesst sich erledigen", async () => {
  const text = "Wir haben angerufen, weil der Zahnersatz aus dem Labor da ist. Bitte einen Termin zum Einsetzen vereinbaren.";
  // Genau der Eintrag, den die Seite beim Speichern schickt.
  const gespeichert = await rufe("/brain/events", {
    method: "POST",
    body: {
      channel: "frontdesk", type: "note", direction: "internal", status: "open", ts: Date.now(), by: "Sabine",
      counterparty: { kind: "unknown", name: "Erika Musterfrau", ref: TELEFON },
      subject: { patientId: null, name: "Erika Musterfrau", matchStatus: "ambiguous" },
      summary: text, signals: { appointmentRequest: true },
    },
  });
  assert.equal(gespeichert.status, 201);
  assert.equal(gespeichert.daten.event.status, "open");

  const kontext = await rufe(`/brain/caller-context?phone=${encodeURIComponent("+49 170 0000101")}`);
  assert.equal(kontext.daten.found, true);
  assert.ok(kontext.daten.context.includes("Zahnersatz aus dem Labor"), "Bianca bekommt den Text der Notiz");

  const zeitleiste = await rufe("/brain/timeline?sinceMinutes=60");
  assert.ok(zeitleiste.daten.events.some((e) => e.id === gespeichert.daten.event.id && e.channel === "frontdesk"), "Notiz steht unter den offenen Notizen");

  const liste = await rufe("/brain/tagesliste");
  assert.equal(liste.daten.patienten.length, 0, "eigene Notiz steht nicht in der Tagesliste");
  assert.equal(liste.daten.qmAusgeblendet, true);
  assert.deepEqual(liste.daten.qm, []);

  const erledigt = await rufe("/brain/caller-context/resolve", { method: "POST", body: { phone: TELEFON, actor: "Sabine", note: "Team-Notiz erledigt" } });
  assert.equal(erledigt.daten.resolved.length, 1);
  const danach = await rufe(`/brain/caller-context?phone=${TELEFON}`);
  assert.equal(danach.daten.found, false, "erledigte Notiz erwaehnt Bianca nicht mehr");
});

test("Knopf-Text merken und Vorgabe wiederherstellen", async () => {
  const start = await rufe("/brain/notiz-vorlagen");
  assert.deepEqual(start.daten.texte, {});
  assert.ok(start.daten.vorgaben.some((g) => g.knoepfe.some((k) => k.id === "ze-da")), "Vorgaben kommen mit");

  const gemerkt = await rufe("/brain/notiz-vorlagen", { method: "PUT", body: { id: "ze-da", text: "Eigener Text der Praxis.", by: "Sabine" } });
  assert.deepEqual(gemerkt.daten.texte, { "ze-da": "Eigener Text der Praxis." });
  assert.deepEqual((await rufe("/brain/notiz-vorlagen")).daten.texte, { "ze-da": "Eigener Text der Praxis." });

  const zurueck = await rufe("/brain/notiz-vorlagen", { method: "PUT", body: { id: "ze-da", text: "" } });
  assert.deepEqual(zurueck.daten.texte, {});
});

test("wartende Anrufliste steht in der Tagesliste und wird ueber den bestehenden Weg freigegeben", async () => {
  const id = "gapfill_test_liste";
  // Form wie clara/gapFill.upsertCallListCase; Kandidaten ohne Nummer.
  await createCase(CID, {
    id, title: "Anrufliste: Dr. Beispiel 2099-01-05 10:00–11:00", topic: "appointment",
    subject: { name: "Lückenfüller Dr. Beispiel" }, status: "waiting_approval", assignee: "Lisa", createdBy: "Clara",
    updates: [{ by: "Clara", kind: "note", text: "Lücke erkannt." }],
  });
  await masCollection(CID, "mas_cases").doc(id).update({
    callList: {
      kind: "gap_fill", date: "2099-01-05", calendarId: "k1", calendarName: "Dr. Beispiel",
      slot: { startMin: 600, endMin: 660, minutes: 60, label: "10:00–11:00" },
      candidates: [{ patientId: "t1", name: "Test Eins" }, { patientId: "t2", name: "Test Zwei", removed: true }],
      bucketKey: "fach:ze", bucketLabel: "Kontrolle Zahnersatz", promptVersionTag: "pv:lisa:0", approvedBy: null, approvedAt: null,
    },
  });

  const vorher = await rufe("/brain/tagesliste");
  const zeile = vorher.daten.patienten.find((p) => p.id === id);
  assert.ok(zeile, "wartende Anrufliste steht in der Liste");
  assert.equal(zeile.dringlichkeit, "heute");
  assert.deepEqual(zeile.freigabe, { art: "anrufliste", kandidaten: 1, datum: "2099-01-05", zeit: "10:00–11:00", kalender: "Dr. Beispiel", anlass: "Kontrolle Zahnersatz", moeglich: true });

  const frei = await rufe(`/brain/gap-fill/${id}/approve`, { method: "POST", body: { by: "Sabine" } });
  assert.equal(frei.status, 200);
  assert.equal(frei.daten.approvedBy, "Sabine");

  const nachher = await rufe("/brain/tagesliste");
  assert.ok(!nachher.daten.patienten.some((p) => p.id === id), "freigegebene Liste liegt bei Lisa und steht nicht mehr in der Tagesliste");
  assert.equal((await rufe(`/brain/gap-fill/${id}/approve`, { method: "POST", body: { by: "Sabine" } })).status, 409, "zweite Freigabe wird abgelehnt");
});
