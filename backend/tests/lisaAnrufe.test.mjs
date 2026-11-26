// Lisas Anrufe: ein Eintrag je Anruf im Praxisgedaechtnis, den Bianca beim
// Rueckruf liest und die Clara-Seite zeigt. Schreibt nur unter clients/zzz-mas2-lisaanrufe.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { pruefeAnruf, satzFuer, istOffen, gleicheSache, nummerMitVorwahl, beimRueckrufVon } from "../src/brain/lisaAnrufe.js";

const CID = "zzz-mas2-lisaanrufe";
const NUMMER = "+491700000301";
const jetzt = Date.now();
// Abstaende in Sekunden: die Anrufe sollen auch kurz nach Mitternacht "heute" liegen.
const MIN = 1_000;

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

function anruf(mehr = {}) {
  return {
    anruf_id: "t-1", nummer: NUMMER, beginn: jetzt - 30 * MIN, erreicht: "niemand",
    patient: { id: "pat-a", vorname: "Michael", nachname: "Petsas" },
    anlass: "Kontrolluntersuchung", behandler: "Dr. Beispiel", ...mehr,
  };
}
const melde = (mehr) => rufe("/brain/lisa-anrufe", { method: "POST", body: anruf(mehr) });
const kontext = async (nr = NUMMER) => (await rufe(`/brain/caller-context?phone=${encodeURIComponent(nr)}`)).daten;
const seite = async () => (await rufe("/brain/tagesliste")).daten.lisaAnrufe;

test.before(leeren);
test.after(async () => {
  await leeren();
  srv.close();
  await admin.app().delete().catch(() => {});
});

test("Pruefung, Satz und Regeln ohne Datenbank", () => {
  assert.equal(nummerMitVorwahl("0170 0000301"), "+491700000301");
  assert.equal(nummerMitVorwahl("0049 170 0000301"), "+491700000301");
  assert.equal(pruefeAnruf(anruf({ anruf_id: "" })).grund, "anruf_id_fehlt");
  assert.equal(pruefeAnruf(anruf({ erreicht: "vielleicht" })).grund, "erreicht_unbekannt");
  assert.equal(pruefeAnruf(anruf({ erreicht: "person" })).grund, "ausgang_unbekannt");
  assert.equal(pruefeAnruf(anruf({ erreicht: "person", ausgang: "termin" })).grund, "termin_fehlt");
  assert.equal(pruefeAnruf(anruf({ anlass: " " })).grund, "anlass_fehlt");

  const a = pruefeAnruf(anruf({ gesagt: "Intern: zweimal klingeln lassen.", beim_rueckruf: "Termin anbieten." })).anruf;
  const satz = satzFuer(a);
  assert.ok(satz.includes("Michael Petsas") && satz.includes("niemanden erreicht") && satz.includes("Kontrolluntersuchung bei Dr. Beispiel"), satz);
  assert.ok(!satz.includes("Intern") && !satz.includes("Termin anbieten"), "gesagt und beim_rueckruf stehen nicht im Satz");
  assert.equal(beimRueckrufVon(a), "Termin anbieten.");

  for (const erreicht of ["niemand", "besetzt", "abgelehnt", "mailbox", "andere_person"]) assert.equal(istOffen(pruefeAnruf(anruf({ erreicht })).anruf), true, erreicht);
  assert.equal(istOffen(pruefeAnruf(anruf({ erreicht: "gescheitert" })).anruf), false);
  for (const ausgang of ["rueckruf_gewuenscht", "meldet_sich_selbst", "nicht_mehr_anrufen", "falsche_person", "anderes_anliegen"]) {
    assert.equal(istOffen(pruefeAnruf(anruf({ erreicht: "person", ausgang })).anruf), true, ausgang);
  }
  for (const ausgang of ["nachricht_ausgerichtet", "kein_interesse"]) assert.equal(istOffen(pruefeAnruf(anruf({ erreicht: "person", ausgang })).anruf), false, ausgang);

  const p = (patient, nummer = NUMMER) => pruefeAnruf(anruf({ patient, nummer })).anruf;
  assert.equal(gleicheSache(p({ id: "a", nachname: "Petsas" }), p({ id: "a", nachname: "Petsas" })), true);
  assert.equal(gleicheSache(p({ id: "a", vorname: "Michael", nachname: "Petsas" }), p({ id: "b", vorname: "Anna", nachname: "Petsas" })), false, "Familie: gleiche Nummer, anderer Patient");
  assert.equal(gleicheSache(p({ vorname: "Michael", nachname: "Petsas" }), p({ id: "a", vorname: "Michael", nachname: "Petsas" })), true, "ohne Kennung zaehlt der Name");
  assert.equal(gleicheSache(p({}), p({})), true, "ohne Patient gilt die Nummer allein");
  assert.equal(gleicheSache(p({}), p({ id: "a", nachname: "Petsas" })), false);
  assert.equal(gleicheSache(p({ id: "a" }), p({ id: "a" }, "+491700000999")), false);
});

test("nicht erreicht: Bianca bekommt den Eintrag, doppeltes Schicken erzeugt nichts", async () => {
  const erst = await melde({ gesagt: "", beim_rueckruf: "Sagen, dass es um die Kontrolle geht, und einen Termin anbieten." });
  assert.equal(erst.status, 201);
  assert.deepEqual({ id: erst.daten.id, neu: erst.daten.neu, offen: erst.daten.offen, versuche: erst.daten.versuche, ersetzt: erst.daten.ersetzt },
    { id: "lisa-anruf-t-1", neu: true, offen: true, versuche: 1, ersetzt: [] });

  const doppelt = await melde({ anlass: "etwas anderes" });
  assert.equal(doppelt.status, 200);
  assert.equal(doppelt.daten.neu, false);
  assert.equal(doppelt.daten.satz, erst.daten.satz, "der erste Stand bleibt");
  const alle = await masCollection(CID, "mas_events").get();
  assert.equal(alle.size, 1, "genau ein Eintrag");
  assert.equal((await masCollection(CID, "mas_cases").get()).size, 0, "es entsteht kein Vorgang");

  const k = await kontext("0170 0000301");
  assert.equal(k.found, true);
  assert.deepEqual(k.openEventIds, ["lisa-anruf-t-1"]);
  assert.ok(k.context.includes("niemanden erreicht") && k.context.includes("Michael Petsas"), k.context);
  assert.ok(!k.context.includes("Termin anbieten"), "die Anweisung steht nicht im Text für den Anrufer");
  assert.equal(k.items.length, 1);
  const it = k.items[0];
  assert.deepEqual({ id: it.id, art: it.art, patient: it.patient, grund: it.grund, ausgang: it.ausgang, versuche: it.versuche, nicht_vortragen: it.nicht_vortragen },
    { id: "lisa-anruf-t-1", art: "lisa_anruf", patient: "Michael Petsas", grund: "Kontrolluntersuchung bei Dr. Beispiel", ausgang: "niemand", versuche: 1, nicht_vortragen: false });
  assert.equal(it.beim_rueckruf, "Sagen, dass es um die Kontrolle geht, und einen Termin anbieten.");

  const trocken = await melde({ anruf_id: "t-trocken", trocken: true });
  assert.equal(trocken.daten.trocken, true);
  assert.equal((await masCollection(CID, "mas_events").get()).size, 1, "trocken speichert nichts");
});

test("zweiter Versuch ersetzt den ersten, ein anderer Patient derselben Nummer bleibt daneben offen", async () => {
  const zweiter = await melde({ anruf_id: "t-2", beginn: jetzt - 20 * MIN, erreicht: "mailbox", mailbox_nachricht: true });
  assert.deepEqual(zweiter.daten.ersetzt, ["lisa-anruf-t-1"]);
  assert.equal(zweiter.daten.versuche, 2);

  const schwester = await melde({ anruf_id: "t-3", beginn: jetzt - 15 * MIN, patient: { id: "pat-b", vorname: "Anna", nachname: "Petsas" }, anlass: "Zahnreinigung", behandler: "" });
  assert.deepEqual(schwester.daten.ersetzt, [], "Patient B schließt Patient A nicht");
  assert.equal(schwester.daten.versuche, 1);

  const k = await kontext();
  assert.deepEqual(k.openEventIds.sort(), ["lisa-anruf-t-2", "lisa-anruf-t-3"]);
  assert.ok(k.context.includes("Anrufbeantworter hinterlassen") && k.context.includes("Anna Petsas"));
  assert.equal(k.items.find((i) => i.id === "lisa-anruf-t-2").versuche, 2);

  const s = await seite();
  assert.deepEqual(s.offen.map((z) => z.id), ["lisa-anruf-t-2", "lisa-anruf-t-3"], "offen: je Patient der jüngste, ältester zuerst");
  assert.ok(!s.heute.some((z) => z.id === "lisa-anruf-t-1"), "der ersetzte Versuch steht nicht mehr da");
  const z = s.offen[0];
  assert.deepEqual({ patient: z.patient, telefon: z.telefon, anlass: z.anlass, ausgang: z.ausgang, versuche: z.versuche, mailboxNachricht: z.mailboxNachricht, offen: z.offen },
    { patient: "Michael Petsas", telefon: NUMMER, anlass: "Kontrolluntersuchung bei Dr. Beispiel", ausgang: "mailbox", versuche: 2, mailboxNachricht: true, offen: true });

  // Ein technisch gescheiterter Anruf ersetzt nichts und ist selbst nicht offen.
  const kaputt = await melde({ anruf_id: "t-4", beginn: jetzt - 12 * MIN, erreicht: "gescheitert" });
  assert.deepEqual({ offen: kaputt.daten.offen, ersetzt: kaputt.daten.ersetzt }, { offen: false, ersetzt: [] });
  assert.deepEqual((await kontext()).openEventIds.sort(), ["lisa-anruf-t-2", "lisa-anruf-t-3"]);
});

test("Termin gebucht schließt den offenen Versuch und ist selbst nicht offen", async () => {
  const termin = await melde({ anruf_id: "t-5", beginn: jetzt - 10 * MIN, erreicht: "person", ausgang: "termin",
    termin: { datum: "2099-01-05", uhrzeit: "10:30", behandler: "Dr. Beispiel", termin_id: "x1" } });
  assert.equal(termin.daten.offen, false);
  assert.deepEqual(termin.daten.ersetzt, ["lisa-anruf-t-2"]);
  assert.ok(termin.daten.satz.includes("Termin vereinbart") && termin.daten.satz.includes("10:30 Uhr"), termin.daten.satz);

  const k = await kontext();
  assert.deepEqual(k.openEventIds, ["lisa-anruf-t-3"], "Bianca erwähnt den gebuchten Termin nicht als offen");
  const s = await seite();
  const z = s.heute.find((x) => x.id === "lisa-anruf-t-5");
  assert.ok(z && !z.offen && z.termin.includes("10:30 Uhr"), "der Termin steht als Tatsache des Tages auf der Seite");
});

test("resolve mit Kennungen schließt nur diese, das andere Familienmitglied bleibt offen", async () => {
  const nr = "+491700000302";
  await melde({ anruf_id: "f-1", nummer: nr, beginn: jetzt - 9 * MIN });
  await melde({ anruf_id: "f-2", nummer: nr, beginn: jetzt - 8 * MIN, patient: { id: "pat-b", vorname: "Anna", nachname: "Petsas" } });
  const loese = (body) => rufe("/brain/caller-context/resolve", { method: "POST", body: { phone: nr, actor: "Bianca", note: "Am Telefon mitgeteilt", ...body } });

  const fremd = await loese({ ids: ["lisa-anruf-t-3", "gibt-es-nicht"] });
  assert.deepEqual(fremd.daten.resolved, [], "Kennungen einer anderen Nummer oder unbekannte schließen nichts");
  const leer = await loese({ ids: [] });
  assert.deepEqual(leer.daten.resolved, [], "leere Liste schließt nichts");

  const eins = await loese({ ids: ["lisa-anruf-f-1"] });
  assert.deepEqual(eins.daten.resolved, ["lisa-anruf-f-1"]);
  assert.deepEqual((await kontext(nr)).openEventIds, ["lisa-anruf-f-2"], "Annas Eintrag bleibt offen");
  const nochmal = await loese({ ids: ["lisa-anruf-f-1"] });
  assert.deepEqual({ ok: nochmal.daten.ok, resolved: nochmal.daten.resolved }, { ok: true, resolved: [] }, "zweimal dieselbe Kennung ist kein Fehler");

  const alle = await loese({});
  assert.deepEqual(alle.daten.resolved, ["lisa-anruf-f-2"], "ohne Kennungen wie bisher alle offenen der Nummer");
});

test("nicht mehr anrufen: für das Team offen, für Bianca nur eine Tatsache", async () => {
  const nein = await melde({ anruf_id: "t-6", beginn: jetzt - 5 * MIN, erreicht: "person", ausgang: "nicht_mehr_anrufen",
    patient: { id: "pat-c", vorname: "Otto", nachname: "Petsas" } });
  assert.equal(nein.daten.offen, true);

  const k = await kontext();
  assert.ok(!k.openEventIds.includes("lisa-anruf-t-6"), "nicht unter den offenen Kennungen für Bianca");
  assert.ok(!k.context.includes("Otto") && !k.context.includes("nicht mehr angerufen"), "nicht im Text für den Anrufer");
  const it = k.items.find((i) => i.id === "lisa-anruf-t-6");
  assert.ok(it && it.nicht_vortragen === true && it.ausgang === "nicht_mehr_anrufen", "in items mit Kennzeichen");

  // Bianca erledigt am Telefon: mehrfach erlaubt, die Tatsache bleibt für das Team offen.
  const erledigt = await rufe("/brain/caller-context/resolve", { method: "POST", body: { phone: NUMMER, actor: "Bianca", note: "Am Telefon mitgeteilt" } });
  assert.deepEqual(erledigt.daten.resolved, ["lisa-anruf-t-3"]);
  const nochmal = await rufe("/brain/caller-context/resolve", { method: "POST", body: { phone: NUMMER, actor: "Bianca", note: "Am Telefon mitgeteilt" } });
  assert.deepEqual({ ok: nochmal.daten.ok, resolved: nochmal.daten.resolved }, { ok: true, resolved: [] });

  let s = await seite();
  assert.deepEqual(s.offen.map((z) => z.id), ["lisa-anruf-t-6"]);
  assert.equal(s.offen[0].nichtMehrAnrufen, true);
  const vonBianca = s.heute.find((z) => z.id === "lisa-anruf-t-3");
  assert.equal(vonBianca.erledigtVon, "Bianca", "auf der Seite steht, wer erledigt hat");

  // Das Team setzt den Eintrag auf der Seite auf erledigt.
  const team = await rufe("/brain/events/lisa-anruf-t-6/resolve", { method: "POST", body: { actor: "Sabine", note: "Lisas Anruf erledigt" } });
  assert.equal(team.daten.ok, true);
  s = await seite();
  assert.deepEqual(s.offen, []);
  assert.equal((await kontext()).items.length, 0);
});
