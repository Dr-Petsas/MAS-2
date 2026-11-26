// Clara-Seite gegen einen Testmandanten: die Notiz geht ueber den bestehenden
// Weg ins Praxisgedaechtnis und kommt bei Biancas Abfrage an; die Tagesliste
// zeigt eine wartende Anrufliste; Uebernehmen, Erledigen und Rueckgaengig
// laufen ueber den bestehenden Statusweg der Vorgaenge. Schreibt nur unter clients/zzz-mas2-claraseite.
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

test("wartende Anrufliste steht in der Tagesliste, Nicht anrufen und Rückgängig", async () => {
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
  assert.deepEqual(zeile.freigabe, {
    art: "anrufliste", kandidaten: 1, anrufe: 1, patienten: [{ name: "Test Eins", grund: "", weg: "Anruf" }],
    datum: "2099-01-05", zeit: "10:00–11:00", kalender: "Dr. Beispiel", anlass: "Kontrolle Zahnersatz", moeglich: true,
  });
  assert.equal(zeile.bereich, "patient");

  // "Nicht anrufen" auf der Seite: Status erledigt, mit Rueckgaengig wieder wartend.
  const status = (st, note) => rufe(`/brain/cases/${id}/status`, { method: "POST", body: { status: st, by: "Sabine", note } });
  assert.equal((await status("resolved")).status, 200);
  const weg = await rufe("/brain/tagesliste");
  assert.ok(!weg.daten.patienten.some((p) => p.id === id), "abgelehnte Liste steht nicht mehr in der Tagesliste");
  const eintrag = weg.daten.erledigtHeute.find((v) => v.id === id);
  assert.ok(eintrag && eintrag.anrufliste && eintrag.wer === "Sabine" && eintrag.zurueck === "waiting_approval", "sie steht unter heute erledigt, Rückgängig führt auf wartend");
  await status(eintrag.zurueck, "Rückgängig");
  const wieder = await rufe("/brain/tagesliste");
  assert.ok(wieder.daten.patienten.some((p) => p.id === id && p.freigabe.moeglich), "nach Rückgängig wartet die Liste wieder");
  const doc = (await masCollection(CID, "mas_cases").doc(id).get()).data();
  assert.equal(doc.callList.approvedBy, null, "auf diesem Weg wird nichts freigegeben");
});

test("Ich kümmere mich und Erledigt tragen aus, der Verlauf steht am Vorgang, Rückgängig holt zurück", async () => {
  const id = "case_test_rueckruf";
  await createCase(CID, {
    id, title: "Rückruf", topic: "callback", subject: { name: "Erika Musterfrau" }, status: "open", createdBy: "Bianca",
    updates: [{ by: "Bianca", kind: "contact", text: "Bittet um Rückruf wegen des Kostenplans." }],
  });
  const status = (st, by, note) => rufe(`/brain/cases/${id}/status`, { method: "POST", body: { status: st, by, note } });
  const liste = async () => (await rufe("/brain/tagesliste")).daten;

  assert.ok((await liste()).patienten.some((p) => p.id === id), "offener Rückrufwunsch steht in der Liste");

  await status("in_progress", "Sabine", "Sabine kümmert sich");
  let l = await liste();
  assert.ok(!l.patienten.some((p) => p.id === id), "übernommen: nicht mehr in der offenen Liste");
  const ueb = l.uebernommen.find((v) => v.id === id);
  assert.ok(ueb && ueb.wer === "Sabine" && ueb.von === "open" && ueb.nach === "in_progress" && ueb.wannMs > 0, "übernommen: wer, wann, von, nach");

  await status("resolved", "Chef");
  l = await liste();
  assert.ok(!l.uebernommen.some((v) => v.id === id) && !l.patienten.some((p) => p.id === id), "erledigt: weder offen noch übernommen");
  const erl = l.erledigtHeute.find((v) => v.id === id);
  assert.ok(erl && erl.wer === "Chef" && erl.von === "in_progress" && erl.nach === "resolved" && erl.zurueck === "in_progress", "erledigt: wer, von, nach");

  await status(erl.zurueck, "Chef", "Rückgängig");
  l = await liste();
  assert.ok(l.uebernommen.some((v) => v.id === id), "Rückgängig nach Erledigt: wieder übernommen");
  await status("open", "Chef", "Rückgängig");
  l = await liste();
  assert.ok(l.patienten.some((p) => p.id === id) && !l.uebernommen.some((v) => v.id === id), "Rückgängig nach Übernehmen: wieder offen in der Liste");

  const schritte = (await masCollection(CID, "mas_cases").doc(id).get()).data().updates.filter((u) => u.kind === "status");
  assert.deepEqual(schritte.map((u) => `${u.by}:${u.statusFrom}>${u.statusTo}`),
    ["Sabine:open>in_progress", "Chef:in_progress>resolved", "Chef:resolved>in_progress", "Chef:in_progress>open"], "jeder Schritt steht mit Name und altem/neuem Status am Vorgang");
  assert.ok(schritte.every((u) => Number(u.ts) > 0), "jeder Schritt trägt seine Uhrzeit");
});
