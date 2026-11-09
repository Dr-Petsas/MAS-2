import assert from "node:assert/strict";
import { test } from "node:test";
import { regioZaehne, fallRechnen } from "../src/hkp/coach.js";

const SATZ = "Implantatversorgung OK mit 6 Implantaten regio 2, 4, 6 auf beiden Quadranten mit externem Sinuslift rechts und internem Sinuslift beim 4er und 6er links inklusive der späteren All-on-6-Prothetik";

test("regio 2, 4, 6 auf beiden Quadranten im Oberkiefer", () => {
  assert.deepEqual(regioZaehne(SATZ), ["12", "14", "16", "22", "24", "26"]);
  assert.deepEqual(regioZaehne("Implantat regio 6 rechts im Oberkiefer"), ["16"]);
  assert.deepEqual(regioZaehne("Implantat regio 6 links im Unterkiefer"), ["36"]);
  assert.deepEqual(regioZaehne("Sinuslift rechts und internem links, regio 4"), []);
});

test("Referenzfall: Implantation und All-on-6, Beträge nur auf der Karte", () => {
  const x = fallRechnen({ versorgung: SATZ, prothese: "kasse" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  const impl = x.teile.find((t) => t.planart === "impl");
  const kasse = x.teile.find((t) => t.planart === "kasse");
  assert.ok(impl && kasse);
  assert.deepEqual(impl.r.plan.zaehne ? Object.keys(impl.r.plan.zaehne).sort() : [], ["12", "14", "16", "22", "24", "26"]);
  assert.equal(impl.r.plan.regionen["OK-R"].sinusExtern, true);
  assert.equal(impl.r.plan.regionen["OK-L"].sinusIntern, true);
  assert.equal(impl.r.plan.regionen["OK-F"]?.sinusExtern, undefined);
  assert.equal(impl.r.plan.regionen["OK-F"]?.sinusIntern, undefined);
  const goz = impl.zeilen.filter((z) => z.ebene === "GOZ").map((z) => `${z.nr}@${z.zahn}`);
  assert.deepEqual(goz.filter((z) => z.startsWith("9120")), ["9120@OK-R"]);
  assert.deepEqual(goz.filter((z) => z.startsWith("9110")), ["9110@OK-L"]);
  assert.match(kasse.titel, /All-on-6/);
  assert.doesNotMatch(x.message, /€|\beuro\b/i);
  assert.match(x.message, /Soll ich den Entwurf so anlegen\?|Musterrechnung/);
  assert.ok(x.card.items.some((i) => /9120/.test(i.text) && /externe/.test(i.text) && !/Knochenf/.test(i.text)));
  assert.ok(x.card.items.some((i) => /2160/.test(i.text) && /Implantatplanung/.test(i.text)));
  assert.ok(x.card.items.some((i) => /9110/.test(i.text) && /€/.test(i.text)));
  assert.ok(x.card.items.some((i) => /€/.test(i.text) && /Kassenplan/.test(i.text)));
  assert.ok(x.card.items.some((i) => /Kassenplan · GOZ 5000 Versorgung/.test(i.text)), "Kassenzeilen tragen den Leistungsnamen");
  assert.equal(x.card.tag, "Musterrechnung");
});

test("Musterrechnung Füllung privat: Positionen je Zahn auf der Karte", () => {
  const x = fallRechnen({ versorgung: "Füllung mod an 14", planart: "kons" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.match(x.message, /Kompositfüllung, dreiflächig an 14/);
  assert.doesNotMatch(x.message, /€/);
  assert.equal(x.card.tag, "Musterrechnung");
  const zeilen = x.card.items.map((i) => i.text).join("\n");
  assert.match(zeilen, /GOZ 2100/);
  assert.match(zeilen, /GOZ 0090/);
  assert.match(zeilen, /Gesamt/);
});

test("Musterrechnung Mehrkosten zeigt GOZ und die BEMA-Leistung der Kasse", () => {
  const x = fallRechnen({ versorgung: "Füllung mod an 14", planart: "mkv" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  const zeilen = x.card.items.map((i) => i.text).join("\n");
  assert.match(zeilen, /GOZ 2100/);
  assert.match(zeilen, /BEMA 13c/);
  assert.match(zeilen, /Mehrkosten/);
});

test("Annahme des Modells steht vorne, nur bei einer Musterrechnung und ohne Beträge", () => {
  const body = { versorgung: "Implantat an 16 mit externem Sinuslift", planart: "impl", annahme: "Als Beispiel nehme ich Zahn 16" };
  const m = fallRechnen(body, { muster: true, befund: {} });
  assert.equal(m.status, "ok", m.frage || "");
  assert.ok(m.message.startsWith("Als Beispiel nehme ich Zahn 16."));
  const p = fallRechnen(body, { muster: false, befund: {} });
  assert.doesNotMatch(p.message || "", /Als Beispiel/);
  const e = fallRechnen({ ...body, annahme: "Kostet etwa 900 Euro" }, { muster: true, befund: {} });
  assert.doesNotMatch(e.message, /Euro/);
});

test("Ein mitgegebener Zahnersatz-Befund sperrt die Beispielfüllung nicht", () => {
  const x = fallRechnen({ versorgung: "Füllung o an 25", planart: "privat", befund: "25 k" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.match(x.message, /Kompositfüllung, einflächig an 25/);
  const k = fallRechnen({ versorgung: "Krone an 36", planart: "privat", befund: "36 k" }, { muster: true, befund: {} });
  assert.equal(k.status, "rueckfrage", "der Zahnersatz liest den Musterbefund weiter");
});

test("Außerhalb der Implantologie spricht die Engine ihre Annahmen, kein freier Modellsatz", () => {
  const x = fallRechnen({ versorgung: "Füllung mod an 14", planart: "kons", annahme: "Als Beispiel rechne ich eine Keramikfüllung." },
    { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.doesNotMatch(x.message, /Keramik/);
  assert.match(x.message, /Kompositfüllung, dreiflächig an 14/);
  const k = fallRechnen({ versorgung: "Krone an 36", planart: "privat", annahme: "Als Beispiel nehme ich eine Keramikkrone." },
    { muster: true, befund: {} });
  assert.equal(k.status, "ok", k.frage || "");
  assert.doesNotMatch(k.message, /Keramikkrone/);
});

test("Ohne Planart rät der Server beim Patienten nicht, die Musterrechnung nimmt private Kons", () => {
  assert.equal(fallRechnen({ versorgung: "Füllung mod an 14" }, { befund: {} }).status, "rueckfrage");
  const x = fallRechnen({ versorgung: "Füllung mod an 14" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.equal(x.teile[0].planart, "kons");
});

test("Im PlanR-Chat verweist die Rechnung nicht aufs Handy", () => {
  const x = fallRechnen({ versorgung: "Füllung mod an 14", planart: "kons" }, { muster: true, befund: {}, anzeige: "text" });
  assert.doesNotMatch(x.message, /Handy/);
  assert.match(x.message, /hier im Gespräch/);
});

const begleit = (x) => x.teile.flatMap((t) => t.zeilen).filter((z) => z.begleit);
const nrn = (x) => begleit(x).map((z) => `${z.ebene} ${z.nr}${z.kzv ? " KZV" : ""}`);

test("Musterrechnung Kons: Röntgen und Anästhetikum kommen dazu, die Summe stimmt", () => {
  const x = fallRechnen({ versorgung: "Füllung mod an 14", planart: "kons" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.deepEqual(nrn(x), ["GOAE Ä5000", "MAT Mat."]);
  const ohne = fallRechnen({ versorgung: "Füllung mod an 14", planart: "kons", begleit: "keine" }, { muster: true, befund: {} });
  assert.deepEqual(nrn(ohne), []);
  assert.equal(x.teile[0].summen.summe, Math.round((ohne.teile[0].summen.summe + 5.25 + 0.55) * 100) / 100);
  assert.match(x.message, /Begleitleistungen drin: Röntgen und Anästhetikum/);
  assert.doesNotMatch(x.message, /€/);
  assert.ok(x.card.items.some((i) => /GOAE Ä5000/.test(i.text) && /5,25 €/.test(i.text)));
});

test("Begleitleistungen ab- und zuwählen", () => {
  const body = { versorgung: "Füllung mod an 14", planart: "kons" };
  const x = fallRechnen({ ...body, begleit: "-roentgen, vitalitaet" }, { muster: true, befund: {} });
  assert.deepEqual(nrn(x), ["GOZ 0070", "MAT Mat."]);
  const opg = fallRechnen({ ...body, begleit: "opg" }, { muster: true, befund: {} });
  assert.deepEqual(nrn(opg), ["GOAE Ä5004", "MAT Mat."]);
  const ohne = fallRechnen({ ...body, begleit: "ohne roentgen" }, { muster: true, befund: {} });
  assert.deepEqual(nrn(ohne), ["MAT Mat."]);
});

test("Mehrkosten: Anästhesie, bMF und Röntgen laufen über die KZV, die Mehrkosten bleiben", () => {
  const x = fallRechnen({ versorgung: "Füllung mod an 14", planart: "mkv" }, { muster: true, befund: {} });
  const ohne = fallRechnen({ versorgung: "Füllung mod an 14", planart: "mkv", begleit: "keine" }, { muster: true, befund: {} });
  assert.deepEqual(nrn(x), ["BEMA 40 KZV", "BEMA 12 KZV", "BEMA Ä925a KZV"]);
  assert.equal(x.teile[0].summen.mehrkosten, ohne.teile[0].summen.mehrkosten);
  const kzv = begleit(x).reduce((s, z) => s + z.betrag, 0);
  assert.equal(x.teile[0].summen.kassenanteil, Math.round((ohne.teile[0].summen.kassenanteil + kzv) * 100) / 100);
  assert.match(x.message, /Über die Kasse rechnen Sie dazu ab: Anästhesie, besondere Maßnahmen und Röntgen/);
  const uk = fallRechnen({ versorgung: "Füllung mod an 36", planart: "mkv" }, { muster: true, befund: {} });
  assert.ok(nrn(uk).includes("BEMA 41a KZV") && !nrn(uk).includes("BEMA 40 KZV"), "Unterkiefer-Seitenzahn: Leitung");
});

test("Mehrkosten-Inlay: Anästhesie privat, Röntgen über die Kasse", () => {
  const x = fallRechnen({ versorgung: "Keramikinlay mod an 36", planart: "mkv" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.deepEqual(nrn(x), ["BEMA Ä925a KZV", "GOZ 0100", "MAT Mat."]);
});

test("Zahnersatz-Muster ohne Befund nimmt den typischen Ausgangsbefund an und sagt ihn", () => {
  const krone = fallRechnen({ versorgung: "Vollkeramikkrone an 36", planart: "privat" }, { muster: true, befund: {} });
  assert.equal(krone.status, "ok", krone.frage || "");
  assert.match(krone.message, /Als Ausgangsbefund nehme ich an: 36 ist erneuerungsbedürftig\./);
  assert.deepEqual(nrn(krone), ["GOZ 0100", "GOAE Ä5000", "GOZ 0070", "MAT Mat."]);
  const bruecke = fallRechnen({ versorgung: "Brücke 35 bis 37", planart: "kasse" }, { muster: true, befund: {} });
  assert.equal(bruecke.status, "ok", bruecke.frage || "");
  assert.match(bruecke.message, /35 und 37 sind erneuerungsbedürftig und 36 fehlt\./);
  const teleskop = fallRechnen({ versorgung: "Teleskopprothese Oberkiefer auf 13 und 23", planart: "privat" }, { muster: true, befund: {} });
  assert.equal(teleskop.status, "ok", teleskop.frage || "");
  assert.match(teleskop.message, /13 und 23 sind erneuerungsbedürftig und die übrigen Zähne im Kiefer fehlen\./);
  const implKrone = fallRechnen({ versorgung: "Implantatkrone an 36", planart: "privat" }, { muster: true, befund: {} });
  assert.equal(implKrone.status, "ok", implKrone.frage || "");
  assert.equal(fallRechnen({ versorgung: "Vollkeramikkrone an 36", planart: "privat" }, { muster: false, befund: {} }).status, "rueckfrage",
    "Ein Patientenplan rät keinen Befund");
});

test("Füllung unter planart privat rechnet die Kons-Engine", () => {
  const x = fallRechnen({ versorgung: "Füllung mod an 14", planart: "privat" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.equal(x.teile[0].planart, "kons");
  assert.ok(x.teile[0].zeilen.some((z) => z.nr === "2100"));
  assert.equal(fallRechnen({ versorgung: "Krone 36", planart: "privat" }, { muster: true, befund: {} }).teile[0].planart, "privat");
});

test("Füllung unter planart kasse rechnet die Mehrkosten-Engine, Wurzelbehandlung bleibt eine Frage", () => {
  const x = fallRechnen({ versorgung: "Füllung 36 mo", planart: "kasse" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.equal(x.teile[0].planart, "mkv");
  assert.ok(x.teile[0].zeilen.some((z) => z.nr === "13b"));
  assert.equal(fallRechnen({ versorgung: "Wurzelbehandlung an 46", planart: "kasse" }, { muster: true, befund: {} }).status, "rueckfrage");
  assert.equal(fallRechnen({ versorgung: "Krone 36", planart: "kasse" }, { muster: true, befund: {} }).teile[0].planart, "kasse");
});

test("Muster ohne Planart: reine Zahnerhaltung rechnet als private Kons, beim Patienten bleibt die Frage", () => {
  const x = fallRechnen({ versorgung: "Wurzelbehandlung an 46" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.equal(x.teile[0].planart, "kons");
  const p = fallRechnen({ versorgung: "Wurzelbehandlung an 46" }, { befund: {} });
  assert.equal(p.status, "rueckfrage");
  assert.match(p.frage, /Planart/);
});

test("Wurzelbehandlung als Muster ohne Kanalzahl nimmt die typische an", () => {
  const x = fallRechnen({ versorgung: "Wurzelbehandlung an 46 und 14", planart: "kons" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.match(x.message, /Als Beispiel nehme ich an 14 zwei Kanäle und an 46 drei Kanäle an\./);
  const aufbereitung = x.teile[0].zeilen.filter((z) => z.nr === "2410").reduce((s, z) => s + z.anzahl, 0);
  assert.equal(aufbereitung, 5);
  assert.equal(fallRechnen({ versorgung: "Wurzelbehandlung an 46", planart: "kons" }, { muster: false, befund: { 46: "c" } }).status, "rueckfrage",
    "Im Patientenplan fragt die Engine weiter nach den Kanälen");
});

test("Zahnersatz-Muster rechnet mit dem Musterbefund des Modells", () => {
  const p = fallRechnen({ versorgung: "Vollkeramikkrone an 36", planart: "privat", befund: "36 ww" }, { muster: true, befund: {} });
  assert.equal(p.status, "ok", p.frage || "");
  assert.deepEqual(nrn(p), ["GOZ 0100", "GOAE Ä5000", "GOZ 0070", "MAT Mat."]);
  const k = fallRechnen({ versorgung: "Brücke 35 bis 37", planart: "kasse", befund: "36 fehlt, 35 und 37 ww" }, { muster: true, befund: {} });
  assert.equal(k.status, "ok", k.frage || "");
  assert.deepEqual(nrn(k), ["BEMA 41a KZV", "BEMA Ä925a KZV", "BEMA 8 KZV"]);
  assert.equal(begleit(k)[0].anzahl, 1, "35 und 37 liegen auf einer Seite: eine Leitungsanästhesie");
  assert.ok(k.teile[0].summen.kzv > 0);
  assert.ok(k.card.items.some((i) => /Begleitleistungen über die KZV/.test(i.text)));
});

test("Keine Begleitzeilen bei Implantaten, auf Implantatpfeilern und im Patientenplan", () => {
  const impl = fallRechnen({ versorgung: "Implantat an 16", planart: "impl" }, { muster: true, befund: {} });
  assert.deepEqual(nrn(impl), []);
  const ref = fallRechnen({ versorgung: SATZ, prothese: "kasse" }, { muster: true, befund: {} });
  assert.deepEqual(nrn(ref), []);
  const patient = fallRechnen({ versorgung: "Füllung mod an 14", planart: "kons" }, { muster: false, befund: { 14: "c" } });
  assert.equal(patient.status, "ok", patient.frage || "");
  assert.deepEqual(nrn(patient), []);
});

test("Akte setzt Versicherung und Bonus, fehlender Bonus wird gefragt", () => {
  const akte = fallRechnen({ versorgung: SATZ }, { muster: false, befund: {}, akte: { versicherung: "kasse", bonus: "75" } });
  assert.equal(akte.status, "ok", akte.frage || "");
  assert.equal(akte.teile.find((t) => t.planart === "kasse").r.plan.zuschuss.bonus, "75");
  assert.match(akte.message, /Akte: gesetzlich/);
  assert.match(akte.message, /75 Prozent/);
  const ohne = fallRechnen({ versorgung: "Brücke von 14 auf 16", planart: "kasse" }, { muster: false, befund: { 15: "f", 14: "ww", 16: "ww" } });
  assert.equal(ohne.status, "rueckfrage");
  assert.match(ohne.frage, /Bonus/);
});

test("Prothese ohne Kasse oder Privat bleibt eine Frage", () => {
  const x = fallRechnen({ versorgung: SATZ }, { muster: true, befund: {} });
  assert.equal(x.status, "rueckfrage");
  assert.match(x.frage, /Kasse/);
  assert.equal(x.card, undefined);
});
