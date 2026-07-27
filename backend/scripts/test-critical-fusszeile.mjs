// ============================================================================
// Eskalations-Radar: Pflicht-Fusszeile zaehlt nicht (Vorfall 27.07.2026).
//
// Im Heads-up standen als Auffaelligkeiten "Post von Kammer oder Behoerde" —
// von „Hoergeraet-Sensation 2026" und von prepaid@reichelt.de. Ausgeloest hat
// das nicht der Inhalt, sondern der Rechtsanhang jeder deutschen
// Geschaeftsmail ("Registergericht: Amtsgericht Muenchen HRB 12345",
// „zustaendige Kammer: IHK"). 17 von 27 Eintraegen der roten Liste waren so
// entstanden — der Chef bekam Werbung als Behoerdenpost vorgelesen.
//
// Geprueft wird beides: Werbung faellt raus, echte Post bleibt drin.
// Laeuft ohne Netz/LLM in Millisekunden.
// ============================================================================
import { assessCritical, ohneFusszeile } from "../src/brain/critical.js";

let fehler = 0;
function check(name, cond, detail = "") {
  if (cond) { console.log(`PASS  ${name}${detail ? "  -> " + detail : ""}`); return; }
  fehler += 1;
  console.log(`FEHL  ${name}${detail ? "  -> " + detail : ""}`);
}

const IMPRESSUM = `

--
Muster Dental GmbH, Musterweg 1, 12345 Musterstadt
Registergericht: Amtsgericht Muenchen HRB 12345
Zustaendige Kammer: IHK fuer Muenchen und Oberbayern
Aufsichtsbehoerde: Regierung von Oberbayern
Newsletter abbestellen: https://example.com/u/123`;

const werbung = assessCritical({
  subject: "Dieses Mini-Hoergeraet verkauft sonst keiner!",
  text: `Schnell reservierten Testplatz sichern und heute noch sparen.${IMPRESSUM}`,
});
check("Werbung mit Impressum ist NICHT kritisch", !werbung.critical, werbung.category || "-");

const rechnung = assessCritical({
  subject: "Rechnung Nr. 2626943254 zu Ihrer Bestellung",
  text: `Sehr geehrte Damen und Herren, anbei die Rechnung zu Ihrer Bestellung.${IMPRESSUM}`,
});
check("Lieferantenrechnung ist NICHT kritisch", !rechnung.critical, rechnung.category || "-");

const kammer = assessCritical({
  subject: "Anhoerung der Zahnaerztekammer",
  text: `Sehr geehrter Herr Doktor, die Zahnaerztekammer bittet um Stellungnahme bis zum 05.08.2026.${IMPRESSUM}`,
});
check("Echte Kammer-Post bleibt kritisch", kammer.critical && kammer.category === "behoerde", kammer.category || "-");
check("Frist der echten Kammer-Post erkannt", !!kammer.deadlineMs,
  kammer.deadlineMs ? new Date(kammer.deadlineMs).toLocaleDateString("de-DE") : "-");

const mahnung = assessCritical({
  subject: "2. Mahnung fuer Anwender-Nr. 1907",
  text: `Sehr geehrte Damen und Herren, anbei erhalten Sie die zweite Mahnung.${IMPRESSUM}`,
});
check("Echte Mahnung bleibt kritisch", mahnung.critical, mahnung.category || "-");

const drohung = assessCritical({
  subject: "Beschwerde",
  text: "Wenn das nicht geregelt wird, werde ich die Kammer einschalten.",
});
check("Patienten-Drohung bleibt kritisch", drohung.critical, drohung.category || "-");

check("Text ohne Fusszeile bleibt unveraendert",
  ohneFusszeile("Nur ein Satz ohne Anhang.") === "Nur ein Satz ohne Anhang.");
check("Reine Fusszeile ohne Text davor wird NICHT weggeschnitten",
  ohneFusszeile("Impressum\nMuster GmbH").includes("Muster GmbH"));

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exitCode = fehler === 0 ? 0 : 1;
