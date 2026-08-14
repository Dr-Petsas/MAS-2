// Gespräch übernehmen: reine Prüfungen ohne Twilio/Netz.
import { phoneFromRecord, displayNameOf } from "../src/lisa/outbound.js";
import {
  phonesMatch,
  phoneDigits,
  classifyCallLeg,
  conferenceTwiml,
  parseTranscriptionPayload,
  mergeTakeoverLine,
  resolveChefPhone,
  twilioSignatureExpected,
  twilioSignatureOk,
} from "../src/lisa/takeover.js";

let fehler = 0;
function check(name, ok, info = "") {
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${info ? "  -> " + info : ""}`);
  if (!ok) fehler += 1;
}

check("E.164 und 0er-Nummer treffen sich", phonesMatch("+491776004600", "0177 600 46 00"));
check("0049 trifft +49", phonesMatch("00491776004600", "+491776004600"));
check("fremde Nummer trifft nicht", !phonesMatch("+491776004600", "+4915112345678"));
check("phoneDigits macht +49 aus 0", phoneDigits("01776004600") === "491776004600");

check("Bein zum Patienten ist patient",
  classifyCallLeg({ to: "+491776004600", from: "+492211234567" }, "+491776004600") === "patient");
check("anderes Bein ist Lisa",
  classifyCallLeg({ to: "+492211234567", from: "+15551234567" }, "+491776004600") === "lisa");

const twimlChef = conferenceTwiml({
  name: "lisa-abc",
  muted: false,
  endOnExit: true,
  label: "chef",
  transcribeUrl: "https://example.test/t?leg=chef",
  statusCallback: "https://example.test/c",
});
check("Chef-TwiML ist eine Konferenz", /<Conference/.test(twimlChef) && /lisa-abc/.test(twimlChef));
check("Chef beendet die Konferenz beim Auflegen", /endConferenceOnExit="true"/.test(twimlChef));
check("Chef ist nicht stumm", /muted="false"/.test(twimlChef));
check("Transkription startet mit", /<Start>/.test(twimlChef) && /de-DE/.test(twimlChef));

const twimlLisa = conferenceTwiml({ name: "lisa-abc", muted: true, endOnExit: false, label: "lisa" });
check("Lisa ist stumm", /muted="true"/.test(twimlLisa));
check("Lisa beendet die Konferenz nicht", /endConferenceOnExit="false"/.test(twimlLisa));

const parsed = parseTranscriptionPayload({
  TranscriptionEvent: "transcription-content",
  TranscriptionData: JSON.stringify({ transcript: "Guten Tag", is_final: true }),
});
check("Transkriptions-Webhook liest den Text", parsed?.message === "Guten Tag" && parsed.partial === false);

const partial = parseTranscriptionPayload({
  TranscriptionEvent: "transcription-content",
  TranscriptionData: JSON.stringify({ transcript: "Gu", is_final: false }),
});
check("Partial wird erkannt", partial?.partial === true && partial.message === "Gu");
check("andere Events werden ignoriert", parseTranscriptionPayload({ TranscriptionEvent: "transcription-started" }) === null);

let rows = [];
rows = mergeTakeoverLine(rows, { role: "chef", message: "Hallo", partial: true });
rows = mergeTakeoverLine(rows, { role: "chef", message: "Hallo, hier ist Petsas", partial: false });
check("Partial wird zur fertigen Zeile", rows.length === 1 && rows[0].message.includes("Petsas") && !rows[0].partial);
rows = mergeTakeoverLine(rows, { role: "user", message: "Ja, hallo" });
check("zweite Stimme hängt an", rows.length === 2 && rows[1].role === "user");

check("Chef-Nummer aus der Anfrage", resolveChefPhone({ requested: "0177 6004600" }) === "+491776004600");
check("Chef-Nummer aus dem Gerät", resolveChefPhone({ stored: "+491511111111" }) === "+491511111111");
check("ohne Nummer leer", resolveChefPhone({ envPhone: "" }) == null);

const token = "test-token";
const url = "https://mas.example/lisa/twilio/chef/c/t";
const params = { CallStatus: "in-progress", CallSid: "CAxxx" };
const sig = twilioSignatureExpected(token, url, params);
check("Twilio-Signatur stimmt", twilioSignatureOk(token, url, params, sig));
check("falsche Signatur fällt durch", !twilioSignatureOk(token, url, params, "xxxx"));

check("Nummer aus Festnetz-Feld", phoneFromRecord({ phoneNumber: "0177 6004600" }) === "+491776004600");
check("Handy schlaegt Festnetz", phoneFromRecord({ mobilePhoneNumber: "015111111111", phone: "02211234567" }) === "+4915111111111");
check("Adressbuch-phones-Array", phoneFromRecord({ phones: ["+491701234567"] }) === "+491701234567");
check("leerer Datensatz ohne Nummer", phoneFromRecord({ firstName: "Max" }) === "");
check("Name aus Vor- und Nachname", displayNameOf({ firstName: "Max", lastName: "Meier" }) === "Max Meier");

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : "\nAlle Prüfungen bestanden.");
process.exitCode = fehler ? 1 : 0;
