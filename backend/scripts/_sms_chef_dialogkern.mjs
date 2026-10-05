// Einmal-SMS an den Chef: der neue Dialogkern nimmt seine Anrufe an.
// Twilio ist tot (Konto gesperrt, HTTP 401 "status 8 is not active"), darum
// derselbe Weg, den die Plattform live nutzt: smsflatrate.net
// (docgendaweb/functions/src/services/smsService.ts). Ein Wurf, kein Job.
import "dotenv/config";

const KEY = process.env.SMSFLATRATE_KEY || "a01cbc5c1f3d53a976ed585da5938331";
const FROM = "Pickadoc";
const TO = "491776004600";

const TEXT = [
  "Pickadoc: der neue Dialogkern ist live und nimmt ab jetzt IHRE Anrufe an",
  "(scharf nur fuer 0177 6004600, alle anderen Anrufer unveraendert).",
  "Einfach MedDent, Thaler, Blessing oder Ruether anrufen.",
  "Qwen laeuft als Korrektor mit, Anrufansicht wieder einspaltig.",
].join(" ");

// Leerzeichen als "+", Zeilenumbrueche als %0a - genau wie die Plattform.
const text = TEXT.replace(/ /g, "+");
const url =
  `https://www.smsflatrate.net/schnittstelle.php?key=${KEY}&from=${FROM}` +
  `&to=${TO}&text=${text}&type=auto1or2&status=1&cost=1`;

const r = await fetch(url);
const roh = (await r.text()).trim();
const [status, smsId, cost] = roh.split(",");
console.log(`HTTP ${r.status} | status=${status} id=${smsId || "-"} kosten=${cost || "-"}`);
// 100 = angenommen; alles andere ist ein Fehlercode des Gateways.
process.exit(status === "100" ? 0 : 1);
