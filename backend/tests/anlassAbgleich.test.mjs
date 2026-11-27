// Anlass-Abgleich fuer "Luecke fuellen" (27.11.2026): abgerechnete Leistungen im Praxisprogramm gegen die
// Terminhistorie in Pickadoc. Sicher ist der Anlass nur, wenn beide dasselbe sagen. Erfundene Daten, kein Zugriff
// auf eine Praxis und kein Abruf bei PlanR. Start: node --test backend/tests/anlassAbgleich.test.mjs
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

process.env.PLANR_HKP_KEY = "test-schluessel";
const A = await import("../src/clara/anlassAbgleich.js");

const JETZT = Date.parse("2026-11-27T10:00:00Z");
const um = (tag, uhr = "09:00") => Date.parse(`${tag}T${uhr}:00+02:00`);
const zeile = (date, kind, text, anzahl = 1) => ({ date, kind, nr: kind, text, zahn: "", anzahl });
const termin = (tag, name, x = {}) => ({ start: um(tag), status: "confirmed", patientStatus: 2, isDeleted: false, visitMotive: { id: `id-${name}`, name }, ...x });
const ok = (...leistungen) => ({ stand: "ok", leistungen });
const ab = (dampsoft, termine, o = {}) => A.abgleichen(dampsoft, termine, { jetzt: JETZT, toleranz: 1, ...o });

test("Toleranz: Vorgabe ein Tag, einstellbar von 0 bis 7", () => {
  assert.equal(A.toleranzTage(""), 1);
  assert.equal(A.toleranzTage(undefined), 1);
  assert.equal(A.toleranzTage("0"), 0);
  assert.equal(A.toleranzTage("3"), 3);
  assert.equal(A.toleranzTage("8"), 1);
  assert.equal(A.toleranzTage("viel"), 1);
});

test("Behandlungsart aus dem Text: nur ueber die feste Tabelle", () => {
  const arten = (t) => [...A.behandlungsarten(t)];
  assert.deepEqual(arten("PRO professionelle Zahnreinigung"), ["zahnreinigung"]);
  assert.deepEqual(arten("Professionelle Zahnreinigung"), ["zahnreinigung"]);
  assert.deepEqual(arten("PZR"), ["zahnreinigung"]);
  assert.deepEqual(arten("KCH Kontrolluntersuchung"), ["untersuchung"]);
  assert.deepEqual(arten("Eingehende Untersuchung"), ["untersuchung"]);
  assert.deepEqual(arten("Kompositfüllung, zweiflächig"), ["fuellung"]);
  assert.deepEqual(arten("KCH Endo groß"), ["wurzelbehandlung"]);
  assert.deepEqual(arten("Wurzelkanalaufbereitung"), ["wurzelbehandlung"]);
  assert.deepEqual(arten("PAR 3 Antiinfektiöse Therapie"), ["parodontitis"]);
  assert.deepEqual(arten("Beratung"), []);
  assert.deepEqual(arten("Reparatur"), [], "kurzes Stichwort nur als ganzes Wort");
  assert.deepEqual(arten(""), []);
});

test("wahrgenommene Termine: juengster zuerst; Platzhalter, Absagen, Geloeschte und Zukunft zaehlen nicht", () => {
  const liste = A.besuchteTermine([
    termin("2026-03-03", "KCH Kontrolluntersuchung"),
    termin("2026-09-14", "PRO professionelle Zahnreinigung"),
    termin("2026-10-01", "KCH Füllung klein", { patientStatus: 5 }),
    termin("2026-10-02", "KCH Füllung klein", { patientStatus: 4 }),
    termin("2026-10-03", "KCH Füllung klein", { isDeleted: true }),
    termin("2026-10-04", "KCH Füllung klein", { status: "declined", patientStatus: 0 }),
    termin("2026-10-05", "KCH Kontrolluntersuchung", { status: "needsConfirmation", patientStatus: 0 }),
    termin("2026-12-10", "KCH Kontrolluntersuchung", { patientStatus: 0 }),
    termin("2026-10-06", ""),
  ], JETZT);
  assert.deepEqual(liste.map((t) => [t.datum, t.behandlung]), [["2026-09-14", "professionelle Zahnreinigung"], ["2026-03-03", "Kontrolluntersuchung"]]);
  const offen = A.besuchteTermine([termin("2026-09-14", "PRO professionelle Zahnreinigung", { patientStatus: 0 })], JETZT);
  assert.equal(offen.length, 1, "bestaetigt und vergangen zaehlt auch ohne Kennzeichen");
});

test("uebereinstimmend: gleicher Tag, gleiche Behandlungsart: Dampsoft gilt", () => {
  const e = ab(ok(zeile("2026-03-03", "01", "Eingehende Untersuchung"), zeile("2026-09-14", "1040", "Professionelle Zahnreinigung"), zeile("2026-09-14", "Ä1", "Beratung")),
    [termin("2026-03-03", "KCH Kontrolluntersuchung"), termin("2026-09-14", "PRO professionelle Zahnreinigung")]);
  assert.equal(e.anlass_abgleich, "uebereinstimmend");
  assert.equal(e.anlass_sicher, true);
  assert.deepEqual(e.letzter_besuch, { datum: "2026-09-14", grund: "Professionelle Zahnreinigung, Beratung" });
  assert.equal(e.kontrollgrund, "Zuletzt am 14. September 2026 abgerechnet: Professionelle Zahnreinigung, Beratung.");
  assert.equal(e.anlass_quelle, "abrechnung");
  assert.deepEqual(e.anlass_kandidaten.map((k) => [k.quelle, k.behandlung, k.datum, k.vorauswahl]), [
    ["dampsoft", "Professionelle Zahnreinigung, Beratung", "2026-09-14", true],
    ["pickadoc", "professionelle Zahnreinigung", "2026-09-14", false],
  ]);
});

test("uebereinstimmend auch einen Tag versetzt, nicht zwei", () => {
  const leistung = ok(zeile("2026-09-15", "1040", "Professionelle Zahnreinigung"));
  assert.equal(ab(leistung, [termin("2026-09-14", "PRO professionelle Zahnreinigung")]).anlass_abgleich, "uebereinstimmend");
  const zwei = ab(leistung, [termin("2026-09-13", "PRO professionelle Zahnreinigung")]);
  assert.equal(zwei.anlass_abgleich, "abweichend");
  assert.equal(zwei.anlass_abweichung, "datum");
  assert.equal(ab(leistung, [termin("2026-09-13", "PRO professionelle Zahnreinigung")], { toleranz: 2 }).anlass_abgleich, "uebereinstimmend");
});

test("abweichend im Datum: Pickadoc kennt einen spaeteren Besuch; beide Kandidaten, Dampsoft zuerst und vorausgewaehlt", () => {
  const e = ab(ok(zeile("2026-09-14", "1040", "Professionelle Zahnreinigung")),
    [termin("2026-09-14", "PRO professionelle Zahnreinigung"), termin("2026-10-20", "KCH Füllung klein")]);
  assert.equal(e.anlass_abgleich, "abweichend");
  assert.equal(e.anlass_abweichung, "datum");
  assert.equal(e.anlass_sicher, false);
  assert.equal("letzter_besuch" in e, false, "kein Anlass am Patienten, solange niemand gewaehlt hat");
  assert.equal("kontrollgrund" in e, false);
  assert.deepEqual(e.anlass_kandidaten.map((k) => [k.quelle, k.behandlung, k.datum, k.vorauswahl]), [
    ["dampsoft", "Professionelle Zahnreinigung", "2026-09-14", true],
    ["pickadoc", "Füllung klein", "2026-10-20", false],
  ]);
  assert.deepEqual(e.anlass_kandidaten[0].letzter_besuch, { datum: "2026-09-14", grund: "Professionelle Zahnreinigung" });
  assert.equal(e.anlass_kandidaten[0].anlass_quelle, "abrechnung");
  assert.ok(e.anlass_kandidaten[0].kontrollgrund.startsWith("Zuletzt am 14. September 2026 abgerechnet"));
  assert.deepEqual(e.anlass_kandidaten[1].letzter_besuch, { datum: "2026-10-20", grund: "Füllung klein" });
});

test("abweichend in der Behandlung: gleicher Tag, andere Art", () => {
  const e = ab(ok(zeile("2026-09-14", "13b", "Kompositfüllung, zweiflächig")), [termin("2026-09-14", "PRO professionelle Zahnreinigung")]);
  assert.equal(e.anlass_abgleich, "abweichend");
  assert.equal(e.anlass_abweichung, "behandlung");
  assert.deepEqual(e.anlass_kandidaten.map((k) => k.quelle), ["dampsoft", "pickadoc"]);
});

test("nicht vergleichbar: eine Seite laesst sich keiner Behandlungsart zuordnen, also keine Uebereinstimmung", () => {
  const a = ab(ok(zeile("2026-09-14", "Ä1", "Beratung")), [termin("2026-09-14", "PRO professionelle Zahnreinigung")]);
  assert.equal(a.anlass_abgleich, "abweichend");
  assert.equal(a.anlass_abweichung, "nicht_vergleichbar");
  const b = ab(ok(zeile("2026-09-14", "1040", "Professionelle Zahnreinigung")), [termin("2026-09-14", "Sprechstunde")]);
  assert.equal(b.anlass_abweichung, "nicht_vergleichbar");
});

test("Dampsoft hat abgerechnet, Pickadoc kennt keinen Besuch: abweichend, nur der Dampsoft-Kandidat", () => {
  const e = ab(ok(zeile("2026-09-14", "1040", "Professionelle Zahnreinigung")), [termin("2026-09-14", "PRO professionelle Zahnreinigung", { patientStatus: 5 })]);
  assert.equal(e.anlass_abgleich, "abweichend");
  assert.equal(e.anlass_abweichung, "pickadoc_leer");
  assert.deepEqual(e.anlass_kandidaten.map((k) => k.quelle), ["dampsoft"]);
});

test("Dampsoft liefert nichts: eigenes Kennzeichen, Pickadoc als einziger Kandidat und vorausgewaehlt", () => {
  for (const leer of [ok(), ok(zeile("2026-09-14", "", "Karteitext", 0)), ok(zeile("2026-09-14", "1040", ""))]) {
    const e = ab(leer, [termin("2026-03-03", "KCH Kontrolluntersuchung"), termin("2026-09-14", "PRO professionelle Zahnreinigung")]);
    assert.equal(e.anlass_abgleich, "dampsoft_leer");
    assert.equal(e.anlass_sicher, false);
    assert.equal("letzter_besuch" in e, false);
    assert.deepEqual(e.anlass_kandidaten, [{ quelle: "pickadoc", behandlung: "professionelle Zahnreinigung", datum: "2026-09-14", vorauswahl: true,
      letzter_besuch: { datum: "2026-09-14", grund: "professionelle Zahnreinigung" } }]);
  }
  assert.deepEqual(ab(ok(), []).anlass_kandidaten, [], "auch Pickadoc kennt keinen Besuch");
});

test("Dampsoft nicht gelesen: anderes Kennzeichen als leer, mit Grund", () => {
  for (const stand of ["kein_geburtsdatum", "nicht_gefunden", "nicht_freigegeben", "anderes_programm", "nicht_erreichbar"]) {
    const e = ab({ stand }, [termin("2026-09-14", "PRO professionelle Zahnreinigung")]);
    assert.equal(e.anlass_abgleich, "dampsoft_nicht_gelesen");
    assert.equal(e.anlass_abgleich_grund, stand);
    assert.equal(e.anlass_sicher, false);
    assert.deepEqual(e.anlass_kandidaten.map((k) => [k.quelle, k.vorauswahl]), [["pickadoc", true]]);
  }
  assert.equal(ab(null, []).anlass_abgleich_grund, "nicht_erreichbar");
});

const gruppen = () => [{
  besuchsgrund: "professionelle Zahnreinigung", anzahl: 3,
  patienten: [
    { patientId: "p1", name: "Erika Beispiel", faellig: "seit 5 Tagen fällig" },
    { patientId: "p2", name: "Ohne Geburtsdatum", faellig: "seit 9 Tagen fällig" },
    { patientId: "p3", name: "Otto Beispiel", faellig: "seit 12 Tagen fällig" },
  ],
}];
const kartei = async () => [
  { id: "p1", firstName: "Erika", lastName: "Beispiel", birthDate: "1970-01-01" },
  { id: "p2", firstName: "Ohne", lastName: "Geburtsdatum", birthDate: null },
  { id: "p3", firstName: "Otto", lastName: "Beispiel", birthDate: "1980-05-05" },
];

test("wer geprueft wird: die Gewuenschten zuerst, dann die vordersten je Gruppe, hoechstens 20", () => {
  const viele = [{ patienten: Array.from({ length: 30 }, (_, i) => ({ patientId: `a${i}` })) }, { patienten: [{ patientId: "b0" }, { patientId: "a1" }] }];
  assert.deepEqual(A.zuPruefen(viele, [], 2), ["a0", "a1", "b0"]);
  assert.deepEqual(A.zuPruefen(viele, ["a25", "fremd", "a25", ""], 2), ["a25", "a0", "a1", "b0"]);
  assert.equal(A.zuPruefen(viele, Array.from({ length: 30 }, (_, i) => `a${i}`), 2).length, 20);
  assert.deepEqual(A.zuPruefen([], ["a1"]), []);
});

test("Vorschlag: jeder Patient bekommt ein Kennzeichen, die uebrigen Felder bleiben", async () => {
  const gefragt = [];
  const aus = await A.anlassAbgleichen("praxisA", gruppen(), {
    laden: kartei, jetzt: JETZT,
    leistungen: async (cid, wer) => {
      gefragt.push(wer.name);
      if (!wer.geburt) return { stand: "kein_geburtsdatum" };
      return wer.vorname === "Erika" ? ok(zeile("2026-09-14", "1040", "Professionelle Zahnreinigung")) : ok();
    },
    historie: async () => [termin("2026-09-14", "PRO professionelle Zahnreinigung")],
  });
  const [p1, p2, p3] = aus[0].patienten;
  assert.equal(p1.faellig, "seit 5 Tagen fällig");
  assert.equal(p1.anlass_abgleich, "uebereinstimmend");
  assert.equal(p1.anlass_sicher, true);
  assert.equal(p1.anlass_quelle, "abrechnung");
  assert.equal(p2.anlass_abgleich, "dampsoft_nicht_gelesen");
  assert.equal(p2.anlass_abgleich_grund, "kein_geburtsdatum");
  assert.equal(p3.anlass_abgleich, "dampsoft_leer");
  assert.equal(p3.anlass_kandidaten.length, 1);
  assert.equal(aus[0].besuchsgrund, "professionelle Zahnreinigung");
});

test("Vorschlag: wer nicht an der Reihe war oder dessen Termine nicht lesbar sind, gilt als nicht geprueft", async () => {
  const viele = [{ besuchsgrund: "Kontrolle", patienten: Array.from({ length: 12 }, (_, i) => ({ patientId: `p${i}`, name: `Patient ${i}` })) }];
  const aus = await A.anlassAbgleichen("praxisA", viele, {
    zuerst: ["p11"], jetzt: JETZT,
    laden: async (cid, ids) => ids.map((id) => ({ id, firstName: "A", lastName: "B", birthDate: "1970-01-01" })),
    leistungen: async () => ok(),
    historie: async (cid, id) => { if (id === "p0") throw new Error("Datenbank weg"); return []; },
  });
  const stand = Object.fromEntries(aus[0].patienten.map((p) => [p.patientId, p.anlass_abgleich]));
  assert.equal(stand.p11, "dampsoft_leer", "von der Maske gewuenscht");
  assert.equal(stand.p1, "dampsoft_leer");
  assert.equal(stand.p0, "nicht_geprueft", "Terminhistorie nicht lesbar");
  assert.equal(stand.p7, "nicht_geprueft", "jenseits der vordersten fuenf");
  assert.equal(aus[0].patienten.find((p) => p.patientId === "p7").anlass_sicher, false);
  assert.equal("anlass_kandidaten" in aus[0].patienten.find((p) => p.patientId === "p7"), false);
});

test("Fehler: Kartei weg laesst die Gruppen unveraendert; Abruf wirft: nicht gelesen", async () => {
  const a = await A.anlassAbgleichen("praxisA", gruppen(), { laden: async () => { throw new Error("Kartei weg"); } });
  assert.deepEqual(a, gruppen());
  const b = await A.anlassAbgleichen("praxisA", gruppen(), { laden: kartei, jetzt: JETZT, leistungen: async () => { throw new Error("Bridge weg"); }, historie: async () => [] });
  assert.equal(b[0].patienten[0].anlass_abgleich, "dampsoft_nicht_gelesen");
  assert.equal(b[0].patienten[0].anlass_abgleich_grund, "nicht_erreichbar");
});

test("Abruf bei PlanR: leere Liste ist eine Antwort, alles andere nennt den Grund", async () => {
  const wer = { vorname: "Erika", name: "Beispiel", geburt: "1970-01-01" };
  const rufe = [];
  A._setHolen(async (url, init) => { rufe.push({ url, init }); return { ok: true, status: 200, json: async () => ({ ok: true, leistungen: [] }) }; });
  assert.deepEqual(await A.leistungenAbfragen("praxisA", wer), { stand: "ok", leistungen: [] });
  assert.ok(rufe[0].url.includes("/api/intern/pvs/leistungen?clientId=praxisA&vorname=Erika&name=Beispiel&geburt=1970-01-01"));
  assert.equal(rufe[0].init.headers["X-PlanR-Key"], "test-schluessel");
  const bei = async (status) => { A._setHolen(async () => ({ ok: false, status, json: async () => ({}) })); return (await A.leistungenAbfragen("praxisA", wer)).stand; };
  assert.equal(await bei(409), "nicht_gefunden");
  assert.equal(await bei(403), "nicht_freigegeben");
  assert.equal(await bei(501), "anderes_programm");
  assert.equal(await bei(502), "nicht_erreichbar");
  assert.equal(await bei(503), "nicht_erreichbar");
  A._setHolen(async () => { throw new Error("Zeitlimit"); });
  assert.equal((await A.leistungenAbfragen("praxisA", wer)).stand, "nicht_erreichbar");
  A._setHolen(async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) }));
  assert.equal((await A.leistungenAbfragen("praxisA", wer)).stand, "nicht_erreichbar");
  rufe.length = 0;
  A._setHolen(async (url) => { rufe.push(url); return { ok: true, status: 200, json: async () => ({ ok: true, leistungen: [] }) }; });
  assert.equal((await A.leistungenAbfragen("praxisA", { ...wer, geburt: "" })).stand, "kein_geburtsdatum");
  assert.equal(rufe.length, 0, "ohne Geburtsdatum kein Abruf");
  A._setHolen(null);
});