// HKP per Sprache (Chef 05.10.2026): Engine-Bundle aus PlanR, Befundkaskade,
// Sprachtexte, HKP-Auswahl, Doppelungen und das Register (Versionskonflikt)
// gegen einen isolierten Testmandanten.
import "dotenv/config";
import * as E from "../src/vendor/hkp-engine.mjs";
import { befundAusLena01, befundErmitteln } from "../src/hkp/befundQuelle.js";
import { euroSprech, uebersichtSatz, zahlWort } from "../src/hkp/sprech.js";
import { annahmenSatz, doppelungen, namePasst, waehleHkp } from "../src/routes/hkp.js";
import {
  KonfliktFehler, hkpAktualisieren, hkpAnlegen, hkpDateiAnhaengen, hkpDateiLesen, hkpFeldSetzen, hkpListe, hkpLesen, hkpLoeschenFuerTest, praxisLaden, praxisSpeichern,
} from "../src/hkp/store.js";

let fehler = 0;
function check(name, ok, info = "") {
  console.log(`${ok ? "OK  " : "FEHL"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) fehler += 1;
}

const SATZ = "Teleskopprothese mit Teleskopen auf den OK 4ern und nach distal ersetzt als Cover Denture";
const PATIENT = { id: "p1", firstName: "Hans", lastName: "Meier", label: "Herrn Meier" };
const tageZurueck = (n) => new Date(Date.now() - n * 86400000).toISOString();
const lenaTeeth = Object.fromEntries(["18", "17", "16", "15", "13", "12", "11", "21", "22", "23", "25", "26", "27", "28"].map((z) => [z, { missing: true }]));
lenaTeeth["36"] = { mark: { krone: true, ze_insuffizient: true } };
lenaTeeth["46"] = { surfaces: { okklusal: ["karies"] } };

// --- Sprache ---
check("Zahlwort 1806", zahlWort(1806) === "eintausendachthundertsechs", zahlWort(1806));
check("Zahlwort 21", zahlWort(21) === "einundzwanzig");
check("Euro mit Cent", euroSprech(1806.56) === "eintausendachthundertsechs Euro sechsundfünfzig", euroSprech(1806.56));
check("Euro glatt", euroSprech(1) === "ein Euro" && euroSprech(300) === "dreihundert Euro");

// --- Engine-Bundle ---
check("Engine-Stand gesetzt", typeof E.ENGINE_STAND === "string" && E.ENGINE_STAND.length > 3, E.ENGINE_STAND);
check("Position verstehen", JSON.stringify(E.positionVerstehen("BEL neun sieben null null")) === JSON.stringify({ ebene: "BEL", nr: "9700" }));

// --- Lena-01 -> Befund ---
const l = befundAusLena01(lenaTeeth);
check("Lena-01: fehlend -> f", l.befund["16"] === "f" && l.befund["24"] === "" && l.befund["14"] === "");
check("Lena-01: insuffiziente Krone -> kw", l.befund["36"] === "kw");
check("Lena-01: Karies macht keine Krone", l.befund["46"] === "");
check("Lena-01: alle 32 Zaehne", Object.keys(l.befund).length === 32);

// --- Kaskade ---
const lenaFrisch = async () => ({ teeth: lenaTeeth, datum: tageZurueck(10), appointmentId: "a1" });
const lenaAlt = async () => ({ teeth: lenaTeeth, datum: tageZurueck(400), appointmentId: "a0" });
const nichts = async () => null;
let b = await befundErmitteln("x", PATIENT, { lena: lenaFrisch, pvs: nichts });
check("Kaskade: Lena-01 frisch", b.ok && b.quelle.art === "lena01" && b.befund["16"] === "f");
b = await befundErmitteln("x", PATIENT, { lena: lenaAlt, pvs: nichts });
check("Kaskade: Lena-01 alt -> Rueckfrage", !b.ok && b.grund === "befund_alt" && /Gilt der noch/.test(b.frage), b.frage);
b = await befundErmitteln("x", PATIENT, { lena: lenaAlt, pvs: nichts, bestaetigt: true });
check("Kaskade: alt, aber bestaetigt", b.ok && b.hinweise.some((h) => /weiterhin gültig/.test(h)));
b = await befundErmitteln("x", PATIENT, { lena: lenaFrisch, pvs: nichts, gesprochen: "14 fehlt", kiefer: "OK" });
check("Kaskade: gesprochen ueberschreibt Lena", b.ok && b.befund["14"] === "f" && b.befund["16"] === "f" && b.quelle.art === "gesprochen+lena01");
b = await befundErmitteln("x", PATIENT, { lena: nichts, pvs: nichts });
check("Kaskade: nichts -> fragen", !b.ok && b.grund === "befund_fehlt");
b = await befundErmitteln("x", PATIENT, { lena: nichts, pvs: nichts, ohneBefundOk: true });
check("Kaskade: reine Totalprothese braucht keinen Befund", b.ok && !Object.keys(b.befund).length);
const tp = E.hkpEntwurf("Im Oberkiefer eine Vollprothese und im Unterkiefer eine Vollprothese", b.befund, {});
check("Entwurf: Vollprothese in beiden Kiefern ohne Befund", tp.status === "ok", tp.status === "ok" ? "" : tp.frage);
check("Name: 'Michael Petzers' trifft Michael Petzas",
  namePasst("Michael Petzers", { firstName: "Michael", lastName: "Petzas" }) === 2
  && namePasst("Michael Petzers", { firstName: "Rozana", lastName: "Psarris" }) === 0);

// --- Entwurf aus Lena-Befund ---
const lb = await befundErmitteln("x", PATIENT, { lena: lenaFrisch, pvs: nichts });
const r = E.hkpEntwurf(SATZ, lb.befund, { bonus: "70" });
check("Entwurf: Teleskope 14/24", r.status === "ok" && r.zusammenfassung.teleskope.join() === "14,24", r.status === "ok" ? "" : r.frage);
check("Entwurf: Annahmen gesprochen", /konventioneller Abdruck/.test(annahmenSatz(r.hinweise, r.zusammenfassung.warnungen)));

// --- Auswahl und Doppelungen ---
const hk = [
  { id: "a", status: "wartet_auf_freigabe", kiefer: "OK", erstellt: tageZurueck(1) },
  { id: "b", status: "genehmigt", kiefer: "UK", erstellt: tageZurueck(30) },
  { id: "c", status: "verworfen", kiefer: "OK", erstellt: tageZurueck(60) },
];
check("Auswahl: zweite", waehleHkp(hk, "der zweite")?.id === "b");
check("Auswahl: Unterkiefer", waehleHkp(hk, "der im Unterkiefer")?.id === "b");
check("Auswahl: ohne Angabe -> Rueckfrage", waehleHkp(hk, "") === null);
check("Doppelung: OK aktiv", doppelungen(hk, "OK").map((h) => h.id).join() === "a");
check("Doppelung: verworfen zaehlt nicht", !doppelungen(hk, "OK").some((h) => h.id === "c"));
check("Uebersicht: wartende zaehlen", /Ein HKP wartet auf Freigabe/.test(uebersichtSatz([{ ...hk[0], patient: { label: "Hans Meier" } }, hk[1]])));

// --- Register gegen Testmandanten ---
const CID = `zzz-mas2-hkp-${Date.now().toString(36)}`;
let id = "";
try {
  const h = await hkpAnlegen(CID, { patient: { ...PATIENT, label: "Hans Meier" }, kiefer: "OK", planJson: "{}", summen: { gesamt: 1 }, verlaufText: "Test" }, "Test");
  id = h.id;
  check("Register: angelegt, wartet auf Freigabe, Version 1", h.status === "wartet_auf_freigabe" && h.version === 1);
  const u = await hkpAktualisieren(CID, id, { version: 1, felder: { status: "freigegeben" }, wer: "PlanR", was: "Status: freigegeben" });
  check("Register: Version zaehlt hoch", u.version === 2 && u.verlauf.length === 2);
  let konflikt = false;
  try { await hkpAktualisieren(CID, id, { version: 1, felder: { status: "verworfen" }, wer: "PlanR", was: "x" }); } catch (e) { konflikt = e instanceof KonfliktFehler; }
  check("Register: veraltete Version -> Konflikt", konflikt);
  await hkpFeldSetzen(CID, id, { offeneAenderung: { id: "v1" } });
  const g = await hkpLesen(CID, id);
  check("Register: Vorschlag ohne Versionssprung", g.version === 2 && g.offeneAenderung?.id === "v1");
  const alle = await hkpListe(CID, { patientId: "p1" });
  check("Register: Liste je Patient", alle.length === 1 && alle[0].id === id);
  await hkpDateiAnhaengen(CID, id, { id: "befund", name: "Befund_Meier_Hans.json", art: "befund", inhalt: '{"format":"planr-zahnbefund"}' });
  const mitDatei = await hkpLesen(CID, id);
  const datei = await hkpDateiLesen(CID, id, "befund");
  check("Register: Befund-Datei am HKP, Kopf in der Liste, Version unveraendert",
    mitDatei.version === 2 && mitDatei.dateien?.[0]?.name === "Befund_Meier_Hans.json" && JSON.parse(datei.inhalt).format === "planr-zahnbefund");
  await praxisSpeichern(CID, { preislisten: [{ id: "eigene-bel", typ: "bel2", name: "Test", gueltigAb: "2026-01-01", eintraege: [] }], eigen: [{ nr: "0001" }], einstellungen: { praxisPlz: "80331" } });
  const p = await praxisLaden(CID);
  check("Praxis: Listen und Einstellungen", p.preislisten.length === 1 && p.eigen.length === 1 && p.einstellungen.praxisPlz === "80331");
  await praxisSpeichern(CID, {});
} finally {
  if (id) await hkpLoeschenFuerTest(CID, id).catch(() => {});
}

console.log(fehler ? `\n${fehler} Fehler` : "\nAlles gruen");
process.exit(fehler ? 1 : 0);
