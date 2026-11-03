import test from "node:test";
import assert from "node:assert/strict";
import {
  anrufRueckfrage, callProvider, smsConfigured, smsflatrateAbsender, smsflatrateUrl, telefonkiBundle, telefonkiReportFuer,
} from "../src/lisa/outbound.js";

function mitEnv(werte, fn) {
  const alt = {};
  for (const k of Object.keys(werte)) { alt[k] = process.env[k]; if (werte[k] == null) delete process.env[k]; else process.env[k] = werte[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(werte)) { if (alt[k] == null) delete process.env[k]; else process.env[k] = alt[k]; }
  }
}

test("SMS laeuft ueber smsflatrate, sobald der Schluessel da ist", () => {
  mitEnv({ SMSFLATRATE_KEY: "k", TWILIO_ACCOUNT_SID: null }, () => assert.equal(smsConfigured(), true));
  mitEnv({ SMSFLATRATE_KEY: null, TWILIO_ACCOUNT_SID: null, TWILIO_AUTH_TOKEN: null }, () => assert.equal(smsConfigured(), false));
});

test("smsflatrate-URL: Nummer ohne Plus, GSM-Text normal, Unicode mit unitext", () => {
  const u = new URL(smsflatrateUrl({ key: "k", to: "+491776004600", body: "Termin morgen 10 Uhr, Grüße", from: "med dent" }));
  assert.equal(u.searchParams.get("to"), "491776004600");
  assert.equal(u.searchParams.get("type"), "auto1or2");
  assert.equal(u.searchParams.get("unitext"), null);
  assert.equal(u.searchParams.get("text"), "Termin morgen 10 Uhr, Grüße");
  const e = new URL(smsflatrateUrl({ key: "k", to: "0177", body: "Bis bald 😊", from: "x" }));
  assert.equal(e.searchParams.get("type"), "auto10or11");
  assert.equal(e.searchParams.get("unitext"), "1");
});

test("smsflatrate-Absender: hoechstens 11 Zeichen ohne Sonderzeichen", () => {
  assert.equal(smsflatrateAbsender("\"Med Dent\" Zahnklinik Düsseldorf"), "Med Dent Za");
  assert.equal(smsflatrateAbsender("Praxis Weiß"), "Praxis Weis");
  assert.equal(smsflatrateAbsender(""), "");
});

test("Anrufweg: TelefonKI schlaegt ElevenLabs, sobald die Basis-URL gesetzt ist", () => {
  mitEnv({ LISA_OUTBOUND_BASE_URL: "https://lisa.example", ELEVENLABS_API_KEY: "x", LISA_AGENT_ID: "a", LISA_PHONE_NUMBER_ID: "p" },
    () => assert.equal(callProvider(), "telefonki"));
  mitEnv({ LISA_OUTBOUND_BASE_URL: null, ELEVENLABS_API_KEY: "x", LISA_AGENT_ID: "a", LISA_PHONE_NUMBER_ID: "p" },
    () => assert.equal(callProvider(), "elevenlabs"));
  mitEnv({ LISA_OUTBOUND_BASE_URL: null, ELEVENLABS_API_KEY: null }, () => assert.equal(callProvider(), ""));
});

test("TelefonKI-Auftrag traegt Mandant, Nummern, Auftrag und Patient", () => {
  const b = telefonkiBundle({
    clientId: "C", locationId: "L", taskId: "T1", to: "+491776004600", fromDid: "+4921100000",
    auftrag: "Bitte Termin bestaetigen", name: "Michael Petsas",
    agent: { id: "A", name: "Med Dent", locationId: "L" }, bookingContext: { patientId: "P", calendarId: "K" },
  });
  assert.equal(b.phoneCallId, "T1");
  assert.equal(b.clientId, "C");
  assert.equal(b.locationId, "L");
  assert.equal(b.toE164, "+491776004600");
  assert.equal(b.fromDid, "+4921100000");
  assert.equal(b.auftrag, "Bitte Termin bestaetigen");
  assert.equal(b.agent.phoneNumber, "+4921100000");
  assert.deepEqual([b.patient.firstName, b.patient.lastName, b.patient.id], ["Michael", "Petsas", "P"]);
  assert.equal(b.calendarId, "K");
  assert.match(b.currentTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("Gespraechs-Report der TelefonKI wird dem Auftrag ueber die Nummer zugeordnet", () => {
  const task = { phone: "+491776004600", ts: 1_000_000 };
  const passend = { channel: "lisa_call", type: "interaction", extractor: "telefonki@v1", ts: 1_050_000, counterparty: { ref: "491776004600" }, summary: "erreicht" };
  const events = [
    { ...passend, type: "note" },
    { ...passend, counterparty: { ref: "4917600000" } },
    { ...passend, ts: 100 },
    { ...passend, extractor: "lisa@outbound" },
    passend,
  ];
  assert.equal(telefonkiReportFuer(task, events), passend);
  assert.equal(telefonkiReportFuer(task, events.slice(0, 4)), null);
  const alsBianca = { ...passend, channel: "bianca_call" };
  assert.equal(telefonkiReportFuer(task, [{ ...passend, type: "note" }, alsBianca]), alsBianca);
  assert.equal(telefonkiReportFuer(task, [{ ...passend, channel: "email" }]), null);
  assert.equal(telefonkiReportFuer({ phone: "" }, events), null);
});

test("Anruf-Rueckfrage: ausserhalb der Anrufzeiten einplanen ODER trotzdem jetzt", () => {
  const frueh = Date.parse("2026-11-03T07:31:00+01:00");
  const mittag = Date.parse("2026-11-03T11:00:00+01:00");
  const f = anrufRueckfrage("Michael Petsas", frueh);
  assert.match(f, /außerhalb der Anrufzeiten/);
  assert.match(f, /einplanen, oder trotzdem jetzt anrufen\?$/);
  assert.match(f, /soll Lisa\b.*\banruf/i);
  assert.equal(anrufRueckfrage("Michael Petsas", mittag), "Ist das Michael Petsas? Soll Lisa jetzt anrufen?");
});
