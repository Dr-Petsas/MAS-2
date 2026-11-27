// Lisas Ausgang `eintrag_gescheitert`: die Person hat einer Zeit zugestimmt, das Eintragen ist gescheitert.
// Der Eintrag bleibt offen, bis die Praxis den Termin von Hand eingetragen hat: kein späterer Anruf und nicht
// Bianca schließen ihn. Erfundene Daten; der Teil mit Datenbank schreibt nur unter clients/zzz-mas2-lisavonhand.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { pruefeAnruf, eintragAus, itemAus, istOffen, satzFuer, beimRueckrufVon, wirdAufgegriffen, vonHandEintragen,
  lisaAnrufeFuerSeite } from "../src/brain/lisaAnrufe.js";
import { kontextZeile, nurPraxisErledigt } from "../src/bianca/callerContext.js";

const CID = "zzz-mas2-lisavonhand";
const NUMMER = "+491700000377";
const jetzt = Date.now();
const MIN = 1_000;
// Wortlaut wie Lisa V8 (Commit 721f236) ihn in `gesagt` schickt: Stand des Gesprächs, dann die Notiz zum Ausgang.
const NOTIZ = "Die Person hat dem Termin am 7.12.2099 um 09:30 Uhr bei Dr. Muster zugestimmt. Das Eintragen ist gescheitert "
  + "(Plattform: The slot is not available.). Bitte eintragen und der Person Bescheid geben.";
const GESAGT = `Lisa hat gesagt: in wessen Auftrag sie anruft, den Anlass, Terminzeiten. ${NOTIZ}`;
const LISAS_TEXT = "Den Termin selbst anbieten und buchen: Kontrolluntersuchung bei Dr. Muster.";
const AUFTRAG = { art: "recall", ziel: "Kontrolltermin vereinbaren", arzt: "Dr. Muster", behandlungsart: { id: "g1", name: "Kontrolluntersuchung" } };

function anruf(mehr = {}) {
  return {
    anruf_id: "hand-1", nummer: NUMMER, beginn: jetzt - 30 * MIN, erreicht: "person", ausgang: "eintrag_gescheitert",
    patient: { id: "pat-h", vorname: "Michael", nachname: "Petsas" }, anlass: "Kontrolluntersuchung", behandler: "Dr. Muster",
    gesagt: GESAGT, angebot: [{ datum: "2099-12-07", uhrzeit: "09:30", behandler: "Dr. Muster" }, { datum: "2099-12-08", uhrzeit: "11:00", behandler: "Dr. Muster" }],
    beim_rueckruf: LISAS_TEXT, auftrag: AUFTRAG, ...mehr,
  };
}

function eintrag(mehr) {
  const p = pruefeAnruf(anruf(mehr));
  assert.equal(p.ok, true, p.klartext);
  return eintragAus("zzz-ohne-datenbank", p.anruf);
}

test("der Ausgang wird angenommen, der Eintrag ist offen, ein Termin gilt nicht als eingetragen", () => {
  const e = eintrag();
  assert.equal(e.status, "open");
  assert.equal(istOffen(e.anruf), true);
  assert.equal(vonHandEintragen(e.anruf), true);
  assert.equal(e.anruf.termin, null, "es gibt keinen eingetragenen Termin");
  assert.deepEqual(e.anruf.zugesagt, { datum: "2099-12-07", uhrzeit: "09:30", behandler: "Dr. Muster" });
});

test("die zugesagte Zeit kommt aus `termin` (ohne Kennung), sonst aus Lisas Satz; ohne beides bleibt sie leer", () => {
  const ausTermin = eintrag({ gesagt: "", termin: { datum: "2099-12-09", uhrzeit: "14:15", behandler: "Dr. Anders", termin_id: "gibt-es-nicht" } });
  assert.deepEqual(ausTermin.anruf.zugesagt, { datum: "2099-12-09", uhrzeit: "14:15", behandler: "Dr. Anders" });
  assert.equal(ausTermin.anruf.termin, null);
  assert.deepEqual(eintrag({ gesagt: NOTIZ.replace(" bei Dr. Muster", "") }).anruf.zugesagt, { datum: "2099-12-07", uhrzeit: "09:30", behandler: "" });
  const ohne = eintrag({ gesagt: "Lisa hat gesagt: den Anlass." });
  assert.equal(ohne.anruf.zugesagt, null);
  assert.equal(ohne.status, "open", "auch ohne lesbare Zeit kein Fehler und offen");
  assert.ok(satzFuer(ohne.anruf).includes("hat einem Termin zugestimmt."), satzFuer(ohne.anruf));
  // Bei anderen Ausgängen entsteht das Feld nicht, auch wenn der Satz in `gesagt` stünde.
  assert.equal(eintrag({ ausgang: "abgebrochen" }).anruf.zugesagt, null);
});

test("der Satz sagt: zugestimmt, nicht eingetragen, die Praxis trägt von Hand ein; nichts Internes", () => {
  const satz = satzFuer(eintrag().anruf);
  for (const stueck of ["mit Michael Petsas gesprochen", "hat einem Termin zugestimmt: Montag, 7. Dezember, 09:30 Uhr bei Dr. Muster",
    "Das Eintragen ist gescheitert", "steht noch nicht im Kalender", "die Praxis trägt ihn von Hand ein", "Es ging um: Kontrolluntersuchung bei Dr. Muster."]) {
    assert.ok(satz.includes(stueck), `Satz ohne "${stueck}": ${satz}`);
  }
  assert.ok(!satz.includes("slot") && !satz.includes("Plattform") && !satz.includes("Termin vereinbart") && !satz.includes("anderes Anliegen"), satz);
});

test("Bianca: nicht als gebucht bestätigen, nicht selbst buchen, nicht aufgreifen; Lisas allgemeiner Text gilt hier nicht", () => {
  const e = eintrag();
  assert.equal(wirdAufgegriffen(e.anruf), false);
  const br = beimRueckrufVon(e.anruf);
  assert.ok(!br.includes("selbst anbieten"), br);
  for (const stueck of ["einem Termin zugestimmt (Montag, 7. Dezember, 09:30 Uhr bei Dr. Muster)", "eingetragen ist nichts",
    "nicht als gebucht bestätigen", "nicht selbst buchen", "von Hand einträgt"]) assert.ok(br.includes(stueck), `beim_rueckruf ohne "${stueck}": ${br}`);

  const item = itemAus(e);
  assert.equal(item.ausgang, "eintrag_gescheitert");
  assert.ok(item.ausgang_text.includes("von Hand"), item.ausgang_text);
  assert.equal(item.von_hand_eintragen, true);
  assert.deepEqual(item.zugesagt, { datum: "2099-12-07", uhrzeit: "09:30", behandler: "Dr. Muster", text: "Montag, 7. Dezember, 09:30 Uhr bei Dr. Muster" });
  assert.equal(item.auftrag.aufgreifen, false);
  assert.equal(item.beim_rueckruf, br);
  assert.equal(item.nicht_vortragen, false);

  const zeile = kontextZeile(e);
  assert.ok(zeile.includes("(noch offen) Dieser Termin ist NICHT eingetragen: bestätige ihn nicht als gebucht und buche ihn nicht selbst."), zeile);
  assert.ok(zeile.includes("Die Praxis trägt ihn von Hand ein und meldet sich bei der Person."), zeile);
  assert.ok(!zeile.includes("biete den Termin jetzt selbst an") && !zeile.includes("slot"), zeile);
  assert.equal(nurPraxisErledigt(e), true);
});

test("andere Ausgänge bleiben wie bisher: kein Kennzeichen, keine zugesagte Zeit, Lisas Text gilt", () => {
  const e = eintrag({ ausgang: "abgebrochen" });
  const item = itemAus(e);
  assert.equal(item.von_hand_eintragen, false);
  assert.equal(item.zugesagt, null);
  assert.equal(item.beim_rueckruf, LISAS_TEXT);
  assert.equal(nurPraxisErledigt(e), false);
  assert.ok(!kontextZeile(e).includes("NICHT eingetragen"));
  const zeile = lisaAnrufeFuerSeite([e], { startOfDayMs: 0 }).offen[0];
  assert.deepEqual({ zugesagt: zeile.zugesagt, vonHandEintragen: zeile.vonHandEintragen }, { zugesagt: "", vonHandEintragen: false });
});

test("die Clara-Seite zeigt den Eintrag unter offen, mit der zugesagten Zeit und ohne Termin", () => {
  const { offen } = lisaAnrufeFuerSeite([eintrag()], { startOfDayMs: 0 });
  assert.equal(offen.length, 1);
  const z = offen[0];
  assert.deepEqual({ ausgang: z.ausgang, offen: z.offen, vonHandEintragen: z.vonHandEintragen, zugesagt: z.zugesagt, termin: z.termin },
    { ausgang: "eintrag_gescheitert", offen: true, vonHandEintragen: true, zugesagt: "Montag, 7. Dezember, 09:30 Uhr bei Dr. Muster", termin: "" });
  assert.ok(z.ausgangText.includes("von Hand"), z.ausgangText);
  assert.ok(z.gesagt.includes("The slot is not available."), "die Meldung der Plattform steht für das Team in `gesagt`");
  assert.ok(z.beimRueckruf.includes("nicht selbst buchen"), z.beimRueckruf);
});

// --- mit Datenbank, nur unter dem Prüf-Mandanten ----------------------------------------------------------

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
  for (const name of ["mas_cases", "mas_events"]) {
    const snap = await masCollection(CID, name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const melde = (mehr) => rufe("/brain/lisa-anrufe", { method: "POST", body: anruf(mehr) });
const kontext = async () => (await rufe(`/brain/caller-context?phone=${encodeURIComponent(NUMMER)}`)).daten;
const seite = async () => (await rufe("/brain/tagesliste")).daten.lisaAnrufe;
const schliesse = (body) => rufe("/brain/caller-context/resolve", { method: "POST", body: { phone: NUMMER, actor: "Bianca", note: "Am Telefon mitgeteilt", ...body } });

test.before(leeren);
test.after(async () => {
  await leeren();
  srv.close();
  await admin.app().delete().catch(() => {});
});

test("über die Schnittstelle: 201, offen, ersetzt den früheren Versuch; trocken speichert nichts", async () => {
  await melde({ anruf_id: "hand-0", beginn: jetzt - 40 * MIN, erreicht: "niemand", ausgang: "", gesagt: "", angebot: [] });
  const trocken = await melde({ anruf_id: "hand-trocken", trocken: true });
  assert.deepEqual({ status: trocken.status, trocken: trocken.daten.trocken, offen: trocken.daten.offen }, { status: 200, trocken: true, offen: true });
  const aus = await melde();
  assert.equal(aus.status, 201);
  assert.deepEqual({ id: aus.daten.id, neu: aus.daten.neu, offen: aus.daten.offen, versuche: aus.daten.versuche, ersetzt: aus.daten.ersetzt },
    { id: "lisa-anruf-hand-1", neu: true, offen: true, versuche: 2, ersetzt: ["lisa-anruf-hand-0"] });
  assert.ok(aus.daten.satz.includes("die Praxis trägt ihn von Hand ein"), aus.daten.satz);
  const kennungen = (await masCollection(CID, "mas_events").get()).docs.map((d) => d.id).filter((id) => id.startsWith("lisa-anruf-")).sort();
  assert.deepEqual(kennungen, ["lisa-anruf-hand-0", "lisa-anruf-hand-1"], "trocken hat nichts gespeichert");
  assert.equal((await masCollection(CID, "mas_cases").get()).size, 0, "es entsteht kein Vorgang");
});

test("Bianca weiß es beim Rückruf, kann den Eintrag aber nicht schließen", async () => {
  const k = await kontext();
  assert.equal(k.found, true);
  assert.ok(k.context.includes("hat einem Termin zugestimmt") && k.context.includes("NICHT eingetragen"), k.context);
  assert.deepEqual(k.openEventIds, [], "nicht unter den Kennungen, die Bianca schließt");
  const it = k.items.find((i) => i.id === "lisa-anruf-hand-1");
  assert.ok(it && it.von_hand_eintragen === true && it.zugesagt.uhrzeit === "09:30", JSON.stringify(it));

  assert.deepEqual((await schliesse({})).daten.resolved, [], "ohne Kennungen: bleibt offen");
  assert.deepEqual((await schliesse({ ids: ["lisa-anruf-hand-1"] })).daten.resolved, [], "auch mit Kennung: bleibt offen");
  assert.deepEqual((await seite()).offen.map((z) => z.id), ["lisa-anruf-hand-1"]);
});

test("ein späterer Anruf ersetzt den Eintrag nicht; das Team setzt ihn auf erledigt", async () => {
  const spaeter = await melde({ anruf_id: "hand-2", beginn: jetzt - 10 * MIN, erreicht: "mailbox", ausgang: "", gesagt: "", angebot: [] });
  assert.deepEqual(spaeter.daten.ersetzt, [], "der zugesagte Termin wartet weiter auf die Praxis");
  let s = await seite();
  assert.deepEqual(s.offen.map((z) => z.id), ["lisa-anruf-hand-1", "lisa-anruf-hand-2"]);
  // Bianca schließt beim Rückruf nur den Mailbox-Versuch.
  assert.deepEqual((await schliesse({})).daten.resolved, ["lisa-anruf-hand-2"]);

  const team = await rufe("/brain/events/lisa-anruf-hand-1/resolve", { method: "POST", body: { actor: "Sabine", note: "Termin von Hand eingetragen" } });
  assert.equal(team.daten.ok, true);
  s = await seite();
  assert.deepEqual(s.offen, []);
  const z = s.heute.find((x) => x.id === "lisa-anruf-hand-1");
  assert.ok(z && !z.offen && z.erledigtVon === "Sabine", JSON.stringify(z));
  assert.equal((await kontext()).items.length, 0);
});
