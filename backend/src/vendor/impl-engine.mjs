// GENERIERT aus F:\PlanR\Implantologie\Privat-Impl (src/clara/index.ts) – nicht von Hand ändern.
// Neu bauen: cd F:\PlanR\Implantologie\Privat-Impl && npm run build:engine   (sha256 bf76f0ba382e)
//#region src/befund01.ts
var OBERKIEFER$1 = [
	"18",
	"17",
	"16",
	"15",
	"14",
	"13",
	"12",
	"11",
	"21",
	"22",
	"23",
	"24",
	"25",
	"26",
	"27",
	"28"
];
var UNTERKIEFER$1 = [
	"48",
	"47",
	"46",
	"45",
	"44",
	"43",
	"42",
	"41",
	"31",
	"32",
	"33",
	"34",
	"35",
	"36",
	"37",
	"38"
];
[...OBERKIEFER$1, ...UNTERKIEFER$1];
/** eHKP-Befundkürzel, wie sie DS-Win im 01 führt */
var BEFUND_KUERZEL = {
	a: "Adhäsivbrücke (Anker)",
	ab: "Adhäsivbrücke (Brückenglied)",
	abw: "erneuerungsbedürftige Adhäsivbrücke (Brückenglied)",
	aw: "erneuerungsbedürftige Adhäsivbrücke (Anker)",
	b: "Brückenglied",
	bw: "erneuerungsbedürftiges Brückenglied",
	e: "ersetzter Zahn",
	ew: "ersetzter, aber erneuerungsbedürftiger Zahn",
	f: "fehlender Zahn",
	i: "Implantat mit intakter Suprakonstruktion",
	ix: "zu entfernendes Implantat",
	k: "klinisch intakte Krone",
	kw: "erneuerungsbedürftige Krone",
	pkw: "erneuerungsbedürftige Teilkrone",
	pw: "erhaltungswürdiger Zahn mit partiellen Substanzdefekten",
	r: "Wurzelstiftkappe mit ersetztem Zahn",
	rw: "erneuerungsbedürftige Wurzelstiftkappe",
	sb: "implantatgetragenes Brückenglied",
	sbw: "erneuerungsbedürftiges implantatgetragenes Brückenglied",
	se: "ersetzter Zahn einer implantatgetragenen (Teil-)Prothese",
	sew: "erneuerungsbedürftiger ersetzter Zahn einer implantatgetragenen Prothese",
	sk: "implantatgetragene intakte Krone",
	skw: "erneuerungsbedürftige implantatgetragene Krone",
	so: "implantatgetragenes Verbindungselement mit ersetztem Zahn",
	sow: "erneuerungsbedürftiges implantatgetragenes Verbindungselement",
	st: "implantatgetragene Teleskopkrone",
	stw: "erneuerungsbedürftige implantatgetragene Teleskopkrone",
	t: "Teleskopkrone",
	t2w: "erneuerungsbedürftiges Sekundärteil einer Teleskopkrone",
	tw: "erneuerungsbedürftige Teleskopkrone",
	ur: "unzureichende Retention",
	ww: "erhaltungswürdiger Zahn mit weitgehender Zerstörung",
	x: "nicht erhaltungswürdiger Zahn",
	")(": "Lückenschluss"
};
`${typeof location === "undefined" ? "http://127.0.0.1:5189" : location.pathname.startsWith("/planer/") ? location.origin : location.hostname.endsWith(".pickadoc-tunnel.com") ? "https://planr.pickadoc-tunnel.com" : `http://${location.hostname}:5189`}`;
//#endregion
//#region src/data/implantatkoerper.ts
var p = (koerper, deckschraube, gingivaformer) => ({
	koerper,
	deckschraube,
	gingivaformer
});
var sys = (id, hersteller, system, preise, quelle, stand, genau) => ({
	id,
	hersteller,
	system,
	preise,
	quelle,
	stand,
	genau
});
var SYSTEME = [
	sys("straumann-bl", "Straumann", "Bone Level / BLT RC", p(290, 18, 40), "Straumann Systemübersicht 2026-01", "2026-01", "teilweise"),
	sys("nobel-active", "Nobel Biocare", "NobelActive / Parallel CC", p(300, 25, 55), "geschätzt (Login)", "2026-10", "geschaetzt"),
	sys("astra-ev", "Dentsply Sirona", "Astra Tech EV", p(260, 21, 50), "Dentsply Preisliste 2023-07", "2023-07", "teilweise"),
	sys("camlog", "Camlog", "CAMLOG / CONELOG", p(210, 17, 37), "CAMLOG Preisliste 2026-05", "2026-05", "teilweise"),
	sys("medentis-icx", "medentis medical", "ICX", p(79, 0, 29), "medentis Produktkatalog 2026 (All-in-Konzept)", "2026", "teilweise"),
	sys("bego-semados", "BEGO", "Semados S/RSX", p(180, 19, 36), "BEGO Katalog 2022-06", "2022-06", "geschaetzt"),
	sys("bredent-copasky", "bredent medical", "copaSKY", p(150, 24.9, 35), "bredent copaSKY 2025-12", "2025-12", "geschaetzt"),
	sys("mis-c1", "MIS", "C1 / V3", p(140, 20, 34), "MIS Preisliste 2023-07", "2023-07", "geschaetzt"),
	sys("osstem-tsiii", "Osstem", "TSIII", p(95, 0, 25), "geschätzt", "2026-10", "geschaetzt"),
	sys("megagen-anyridge", "MegaGen", "AnyRidge", p(120, 15, 30), "geschätzt", "2026-10", "geschaetzt")
];
var mittel = (k) => Math.round(SYSTEME.reduce((s, x) => s + x.preise[k], 0) / SYSTEME.length);
var IMPLANTATKOERPER = [sys("durchschnitt", "Mittelwert", `System noch nicht gewählt (Ø aus ${SYSTEME.length} Systemen)`, p(mittel("koerper"), mittel("deckschraube"), mittel("gingivaformer")), "Mittelwert der hinterlegten Systeme", "2026-10", "geschaetzt"), ...SYSTEME];
var implantatkoerper = (id) => IMPLANTATKOERPER.find((s) => s.id === id) ?? IMPLANTATKOERPER[0];
//#endregion
//#region src/types.ts
var REGIONEN = [
	"OK-R",
	"OK-F",
	"OK-L",
	"UK-L",
	"UK-F",
	"UK-R"
];
var REGION_NAME = {
	"OK-R": "Oberkiefer rechts",
	"OK-F": "Oberkiefer Front",
	"OK-L": "Oberkiefer links",
	"UK-L": "Unterkiefer links",
	"UK-F": "Unterkiefer Front",
	"UK-R": "Unterkiefer rechts"
};
//#endregion
//#region src/data/material.ts
var m = (id, titel, rolle, produkt, hersteller, einheit, preis, klasse, genau, quelle = "Marktbeobachtung", stand = "2026-10") => ({
	id,
	titel,
	rolle,
	produkt,
	hersteller,
	einheit,
	preis,
	klasse,
	genau,
	quelle,
	stand
});
var MATERIAL = [
	m("kem-autolog-dentin", "Dentin als Knochenersatz (aufbereitet)", "kem-autolog", "Smart Dentin Grinder (Einmalkammer)", "KometaBio", "Aufbereitung", 42, 1, "teilweise"),
	m("kem-maxgraft", "Allogenes Knochenersatzmaterial (Granulat)", "kem-allogen", "maxgraft", "botiss", "0,5 cc", 150, 2, "geschaetzt"),
	m("kem-puros", "Allogenes Knochenersatzmaterial (Granulat)", "kem-allogen", "Puros", "Zimmer Biomet", "0,5 cc", 165, 2, "geschaetzt"),
	m("kem-osteobiol", "Xenogenes Knochenersatzmaterial (porcin)", "kem-xenogen", "OsteoBiol Gen-Os", "OsteoBiol / Tecnoss", "0,5 g", 95, 0, "geschaetzt"),
	m("kem-cerabone", "Xenogenes Knochenersatzmaterial (bovin)", "kem-xenogen", "cerabone", "botiss", "0,5 cc", 120, 1, "geschaetzt"),
	m("kem-bio-oss", "Xenogenes Knochenersatzmaterial (bovin)", "kem-xenogen", "Bio-Oss spongiös", "Geistlich", "0,5 g", 180, 2, "teilweise"),
	m("kem-bio-oss-collagen", "Xenogenes KEM mit Kollagen (Blockform)", "kem-xenogen", "Bio-Oss Collagen", "Geistlich", "100 mg", 92, 3, "teilweise"),
	m("kem-creos", "Xenogenes Knochenersatzmaterial (bovin)", "kem-xenogen", "creos xenogain", "Nobel Biocare", "0,5 g", 120, 2, "geschaetzt"),
	m("kem-maxresorb", "Synthetisches Knochenersatzmaterial (β-TCP/HA)", "kem-synthetisch", "maxresorb", "botiss", "0,5 cc", 105, 1, "geschaetzt"),
	m("kem-ethoss", "Synthetisches KEM (β-TCP + Calciumsulfat)", "kem-synthetisch", "Ethoss", "Ethoss Regeneration", "0,5 cc", 130, 2, "geschaetzt"),
	m("mem-jason", "Resorbierbare Membran (Perikard)", "membran-resorbierbar", "Jason membrane", "botiss", "20 × 30 mm", 78, 0, "geschaetzt"),
	m("mem-creos", "Resorbierbare Kollagenmembran", "membran-resorbierbar", "creos xenoprotect", "Nobel Biocare", "15 × 20 mm", 85, 1, "geschaetzt"),
	m("mem-bio-gide", "Resorbierbare Kollagenmembran", "membran-resorbierbar", "Bio-Gide", "Geistlich", "25 × 25 mm", 95, 2, "teilweise"),
	m("mem-ossix", "Resorbierbare Membran (quervernetzt, langsam)", "membran-resorbierbar", "Ossix Plus", "Datum Dental", "25 × 30 mm", 112, 3, "geschaetzt"),
	m("mem-cytoplast", "Nicht-resorbierbare Membran (dPTFE)", "membran-nichtresorbierbar", "Cytoplast Ti-250", "Osteogenics", "25 × 30 mm", 125, 2, "geschaetzt"),
	m("mem-yxoss", "Individuelles Titangitter (CAD/CAM)", "membran-titan", "Yxoss CBR", "ReOss", "Stück (individuell)", 480, 3, "geschaetzt"),
	m("wg-mucograft", "Kollagenmatrix (Weichgewebe)", "weichgewebematrix", "Mucograft", "Geistlich", "15 × 20 mm", 150, 1, "geschaetzt"),
	m("wg-mucoderm", "Azelluläre dermale Matrix", "weichgewebematrix", "mucoderm", "botiss", "15 × 20 mm", 160, 2, "geschaetzt"),
	m("wg-fibrogide", "Volumenstabile Kollagenmatrix", "weichgewebematrix", "Fibro-Gide", "Geistlich", "15 × 20 × 6 mm", 195, 3, "geschaetzt"),
	m("fix-pin", "Membran-Fixierungspin (Titan)", "fixierung-pin", "Membran-Pin", "diverse", "Stück", 15, 1, "geschaetzt"),
	m("fix-schraube", "Osteosyntheseschraube (Mikroschraube)", "fixierung-schraube", "Osteosyntheseschraube", "diverse", "Stück", 25, 2, "geschaetzt"),
	m("koll-safescraper", "Knochenschaber (Einmal)", "kollektor", "SafeScraper TWIST", "META / OsteoBiol", "Stück", 32, 1, "geschaetzt"),
	m("koll-micross", "Knochenschaber (Einmal)", "kollektor", "Micross", "META", "Stück", 36, 1, "geschaetzt"),
	m("koll-bonetrap", "Knochenfilter / Bone Trap", "kollektor", "Bone Trap", "diverse", "Stück", 20, 0, "geschaetzt"),
	m("naht-resorbierbar", "Resorbierbarer Faden", "naht", "Vicryl 5-0", "Ethicon", "Faden", 4.5, 0, "geschaetzt"),
	m("naht-ptfe", "Nicht-resorbierbarer PTFE-Faden", "naht", "Cytoplast PTFE 4-0", "Osteogenics", "Faden", 6.5, 1, "geschaetzt"),
	m("fraese-set", "Einmal-Bohrerset (steril)", "fraese", "Einmal-Bohrset", "systemabhängig", "Set", 48, 1, "geschaetzt"),
	m("anae-articain-200", "Articain 4 % 1:200.000", "anaesthetikum", "Ultracain D-S", "Sanofi", "Zylinderampulle", .55, 0, "geschaetzt"),
	m("anae-articain-100", "Articain 4 % 1:100.000", "anaesthetikum", "Ultracain D-S forte", "Sanofi", "Zylinderampulle", .55, 1, "geschaetzt"),
	m("roehrchen-prf", "PRF-Röhrchen (Glas, ohne Antikoagulans)", "roehrchen", "PRF-Röhrchen", "diverse", "Stück", 1.5, 1, "geschaetzt"),
	m("roehrchen-aprf", "A-PRF+-Röhrchen", "roehrchen", "A-PRF+ Tube", "Process for PRF", "Stück", 2.5, 2, "geschaetzt"),
	m("roehrchen-iprf", "i-PRF-Röhrchen", "roehrchen", "i-PRF Tube", "Process for PRF", "Stück", 2.5, 2, "geschaetzt"),
	m("roehrchen-lprf", "L-PRF-Röhrchen", "roehrchen", "L-PRF Tube", "Intra-Lock", "Stück", 2.5, 2, "geschaetzt"),
	m("kit-prgf", "PRGF-Entnahme-/Fraktionier-Kit", "kit", "Endoret (PRGF) Kit", "BTI", "Set", 38, 2, "geschaetzt"),
	m("kit-prp", "PRP-Entnahme-/Aufbereitungs-Kit", "kit", "PRP-Kit", "diverse", "Set", 30, 1, "geschaetzt")
];
var materialFinden = (id) => MATERIAL.find((x) => x.id === id);
var materialDerRolle = (rolle) => MATERIAL.filter((x) => x.rolle === rolle);
/**
* Standardprodukt einer Rolle für eine Materialklasse: der Posten mit der
* höchsten Klasse ≤ gewünschter Klasse (sonst der günstigste).
*/
function materialFuerKlasse(rolle, klasse) {
	const liste = materialDerRolle(rolle);
	if (!liste.length) return void 0;
	return liste.filter((x) => x.klasse <= klasse).sort((a, b) => b.klasse - a.klasse)[0] ?? [...liste].sort((a, b) => a.klasse - b.klasse)[0];
}
/** Preis mit optionaler Praxis-Überschreibung. */
var materialPreis = (posten, overrides) => overrides[posten.id] ?? posten.preis;
//#endregion
//#region src/engine/zahnschema.ts
/** Zahnreihenfolge von links nach rechts (Blick auf den Patienten) */
var OBERKIEFER = [
	"18",
	"17",
	"16",
	"15",
	"14",
	"13",
	"12",
	"11",
	"21",
	"22",
	"23",
	"24",
	"25",
	"26",
	"27",
	"28"
];
var UNTERKIEFER = [
	"48",
	"47",
	"46",
	"45",
	"44",
	"43",
	"42",
	"41",
	"31",
	"32",
	"33",
	"34",
	"35",
	"36",
	"37",
	"38"
];
var ALLE_ZAEHNE = [...OBERKIEFER, ...UNTERKIEFER];
var kieferVon = (zahn) => zahn[0] === "1" || zahn[0] === "2" ? "OK" : "UK";
var istFrontzahn = (zahn) => [
	"1",
	"2",
	"3"
].includes(zahn[1]);
/** Kieferhälfte/Front einer Zahnregion – für GOÄ/GOZ-Positionen „je Kieferhälfte oder Frontzahnbereich". */
function regionVon(zahn) {
	const ok = kieferVon(zahn) === "OK";
	if (istFrontzahn(zahn)) return ok ? "OK-F" : "UK-F";
	const rechts = zahn[0] === "1" || zahn[0] === "4";
	if (ok) return rechts ? "OK-R" : "OK-L";
	return rechts ? "UK-R" : "UK-L";
}
/** Planungskürzel, die ein zu setzendes Implantat bedeuten. */
var IMPLANTAT_KUERZEL = /* @__PURE__ */ new Set([
	"I",
	"IS",
	"ISS",
	"IK",
	"IB",
	"IST",
	"IA"
]);
/** Sofortimplantat-Kürzel (Insertion in dieselbe Alveole). */
var SOFORT_KUERZEL = /* @__PURE__ */ new Set(["IS", "ISS"]);
/** Planungskürzel, die eine Zahnentfernung bedeuten. */
var ENTFERNUNG_KUERZEL = /* @__PURE__ */ new Set([
	"EX",
	"OX",
	"XS",
	"EXP"
]);
var tpVon = (plan, z) => (plan.zaehne[z]?.TP ?? "").trim().toUpperCase();
var bVon = (plan, z) => (plan.zaehne[z]?.B ?? "").trim().toLowerCase();
/** Alle Zähne mit geplantem Implantat. */
var implantatZaehne = (plan) => Object.keys(plan.zaehne).filter((z) => IMPLANTAT_KUERZEL.has(tpVon(plan, z)));
/** Alle Zähne mit Entfernung. */
var entfernungZaehne = (plan) => Object.keys(plan.zaehne).filter((z) => ENTFERNUNG_KUERZEL.has(tpVon(plan, z)));
/** Regionen, in denen irgendetwas geplant ist (Implantat, Entfernung, Augmentation …). */
function geplanteRegionen(plan) {
	const aktiv = /* @__PURE__ */ new Set();
	for (const z of Object.keys(plan.zaehne)) if (tpVon(plan, z)) aktiv.add(regionVon(z));
	for (const r of REGIONEN) {
		const o = plan.regionen[r];
		if (o && (o.augmentation || o.boneSplitting || o.sinusIntern || o.sinusExtern || o.blockEntnahme || o.ringEntnahme || o.kollektor || o.fixierung || o.eigenblut || !!o.material || o.membran && o.membran !== "keine" || o.weichgewebe && o.weichgewebe !== "keine")) aktiv.add(r);
	}
	return REGIONEN.filter((r) => aktiv.has(r));
}
/** Befund (01) ohne eigenen Zahn an der Stelle: Lücke, ersetzt, Brückenglied, Implantat, Lückenschluss */
var OHNE_ZAHN$1 = /* @__PURE__ */ new Set([
	"f",
	"e",
	"ew",
	"b",
	"bw",
	"ab",
	"abw",
	"i",
	"ix",
	"sb",
	"sbw",
	"se",
	"sew",
	"sk",
	"skw",
	"so",
	"sow",
	"st",
	"stw",
	")("
]);
/** Zahn bzw. Wurzel, die vor dem Implantat entfernt werden muss */
var ZU_ENTFERNEN = /* @__PURE__ */ new Set([
	"x",
	"xw",
	"r",
	"rw",
	"ww",
	"pz"
]);
/** Abgleich der Planung mit dem Befund (01): nur, wenn ein Befund eingetragen ist */
function befundAbgleich(plan) {
	const zaehne = Object.keys(plan.zaehne).sort();
	if (!zaehne.some((z) => bVon(plan, z))) return [];
	const out = [];
	for (const z of zaehne) {
		const tp = tpVon(plan, z);
		const b = bVon(plan, z);
		if (!tp) continue;
		if (IMPLANTAT_KUERZEL.has(tp)) {
			if (b === "i") out.push(`Zahn ${z}: laut Befund steht dort schon ein Implantat – Planung prüfen.`);
			else if (b === "ix") out.push(`Zahn ${z}: laut Befund ist das vorhandene Implantat zu entfernen – Explantation (EXP, GOZ 9170) vorher planen.`);
			else if (SOFORT_KUERZEL.has(tp) && OHNE_ZAHN$1.has(b)) out.push(`Zahn ${z}: Sofortimplantat geplant, laut Befund „${b}“ steht dort kein Zahn – Spätimplantat (I) planen.`);
			else if (!SOFORT_KUERZEL.has(tp) && ZU_ENTFERNEN.has(b)) out.push(`Zahn ${z}: laut Befund „${b}“ steht dort noch ein Zahn bzw. eine Wurzel – Sofortimplantat (IS) oder vorher Entfernung (EX/OX) planen.`);
			else if (!SOFORT_KUERZEL.has(tp) && !OHNE_ZAHN$1.has(b)) out.push(`Zahn ${z}: Implantat geplant, laut Befund${b ? ` „${b}“` : ""} steht dort ein eigener Zahn – Befund oder Planung prüfen.`);
		} else if ((tp === "EX" || tp === "OX" || tp === "XS") && OHNE_ZAHN$1.has(b)) out.push(`Zahn ${z}: Entfernung geplant, laut Befund „${b}“ steht dort kein Zahn – Planung prüfen.`);
	}
	return out;
}
function planen(plan, _einst) {
	const positionen = [];
	const hinweise = [...befundAbgleich(plan)];
	const klasse = plan.regler.materialKlasse;
	const goz = (nr, zahn, sitzung, grund, anzahl = 1) => ({
		id: `auto:${nr}:${zahn}:${sitzung}`,
		ebene: "GOZ",
		nr,
		zahn,
		anzahl,
		sitzung,
		grund,
		auto: true
	});
	const mat = (rolle, zahn, sitzung, anzahl = 1) => {
		const posten = materialFuerKlasse(rolle, klasse);
		if (!posten) return null;
		return {
			id: `mat:${rolle}:${zahn}:${sitzung}`,
			ebene: "MAT",
			nr: posten.id,
			zahn,
			anzahl,
			sitzung,
			text: `${posten.titel} – ${posten.produkt}`,
			material: true,
			auto: true,
			grund: posten.titel
		};
	};
	const push = (p) => {
		if (p) positionen.push(p);
	};
	const impl = implantatZaehne(plan);
	const kieferMitImplantat = new Set(impl.map(kieferVon));
	for (const k of kieferMitImplantat) push(goz("9000", k === "OK" ? "OK" : "UK", 1, "Implantatbezogene Analyse und Vermessung"));
	for (const z of impl) {
		const tp = tpVon(plan, z);
		const d = plan.implantate[z] ?? {
			system: "durchschnitt",
			deckung: "gedeckt"
		};
		push(goz("9010", z, 3, "Implantatinsertion"));
		const sys = implantatkoerper(d.system ?? "durchschnitt");
		push({
			id: `mat:koerper:${z}`,
			ebene: "MAT",
			nr: `impl:${sys.id}:koerper`,
			zahn: z,
			anzahl: 1,
			sitzung: 3,
			text: `Implantatkörper ${sys.hersteller} ${sys.system}`,
			material: true,
			auto: true,
			grund: "Implantatkörper"
		});
		if ((d.deckung ?? "gedeckt") === "gedeckt") {
			push({
				id: `mat:deck:${z}`,
				ebene: "MAT",
				nr: `impl:${sys.id}:deckschraube`,
				zahn: z,
				anzahl: 1,
				sitzung: 3,
				text: `Deckschraube ${sys.hersteller}`,
				material: true,
				auto: true,
				grund: "Deckschraube"
			});
			push(goz("9040", z, 4, "Freilegen des Implantats"));
			push({
				id: `mat:gf:${z}`,
				ebene: "MAT",
				nr: `impl:${sys.id}:gingivaformer`,
				zahn: z,
				anzahl: 1,
				sitzung: 4,
				text: `Gingivaformer ${sys.hersteller}`,
				material: true,
				auto: true,
				grund: "Gingivaformer"
			});
		} else push({
			id: `mat:gf:${z}`,
			ebene: "MAT",
			nr: `impl:${sys.id}:gingivaformer`,
			zahn: z,
			anzahl: 1,
			sitzung: 3,
			text: `Gingivaformer ${sys.hersteller}`,
			material: true,
			auto: true,
			grund: "Gingivaformer (einzeitig)"
		});
		if (SOFORT_KUERZEL.has(tp) && tp !== "ISS") push(goz("3000", z, 3, "Entfernung des Zahnes vor der Sofortimplantation"));
		push(mat("fraese", z, 3));
	}
	for (const z of entfernungZaehne(plan)) {
		const tp = tpVon(plan, z);
		if (tp === "EX") push(goz("3000", z, 2, "Entfernung eines Zahnes"));
		else if (tp === "OX") push(goz("3030", z, 2, "Entfernung durch Osteotomie"));
		else if (tp === "XS") push(goz("3000", z, 2, "Extraktion vor Socket Preservation"));
		if (bVon(plan, z) === "ix" || tp === "EXP") push(goz("9170", z, 2, "Entfernung des Implantats durch Osteotomie"));
	}
	for (const r of geplanteRegionen(plan)) {
		const o = plan.regionen[r] ?? {};
		const simultan = Object.keys(plan.zaehne).some((z) => regionVon(z) === r && IMPLANTAT_KUERZEL.has(tpVon(plan, z)));
		const opSitz = simultan ? 3 : 2;
		if (o.augmentation) push(goz("9100", r, opSitz, "Aufbau des Alveolarfortsatzes (GBR)"));
		if (o.boneSplitting) push(goz("9130", r, opSitz, "Bone Splitting / Spreading"));
		if (o.sinusIntern) push(goz("9110", r, opSitz, "Interner Sinuslift (geschlossene Sinusbodenelevation)"));
		if (o.sinusExtern) push(goz("9120", r, opSitz, "Externer Sinuslift (Knochenfensterung)"));
		const block = o.blockEntnahme || o.ringEntnahme;
		const fremd = o.material === "allogen";
		if (block && !fremd) push({
			...goz("9140", r, 2, o.blockEntnahme ? "Intraorale Knochenblockentnahme" : "Knochenringentnahme"),
			anzahl: o.fixierung ? 2 : 1
		});
		else if (block && fremd) hinweise.push(`${r}: Block aus Fremdmaterial – GOZ 9140 (Entnahme) entfällt.`);
		if (o.kollektor) {
			push(goz("9090", r, opSitz, "Knochengewinnung mit Kollektor/Schaber"));
			push(mat("kollektor", r, opSitz));
		}
		if (o.fixierung) {
			push(goz("9150", r, 2, "Fixation/Stabilisierung des Augmentates"));
			push(mat(o.blockEntnahme ? "fixierung-schraube" : "fixierung-pin", r, 2, 2));
			if (block) push(goz("9170", r, 4, "Entfernung der Osteosyntheseschrauben"));
		}
		const kemRolle = {
			autolog: null,
			allogen: "kem-allogen",
			xenogen: "kem-xenogen",
			synthetisch: "kem-synthetisch"
		};
		if (o.material && kemRolle[o.material]) push(mat(kemRolle[o.material], r, opSitz));
		if (o.membran && o.membran !== "keine") {
			push(mat({
				resorbierbar: "membran-resorbierbar",
				"nicht-resorbierbar": "membran-nichtresorbierbar",
				titan: "membran-titan",
				vlies: "membran-vlies"
			}[o.membran] ?? "membran-resorbierbar", r, opSitz));
			push(goz("4138", r, opSitz, "Verwendung einer Membran"));
		}
		const wg = o.weichgewebe;
		if (wg && wg !== "keine") {
			const wgSitz = plan.implantate && simultan ? 4 : opSitz;
			if (wg === "rolllappen") push(goz("3100", r, wgSitz, "Plastische Deckung (Rolllappen)"));
			else if (wg === "fst") {
				push(goz("4130", r, wgSitz, "Gewinnung/Transplantation von Schleimhaut"));
				push(mat("naht", r, wgSitz, 2));
			} else if (wg === "btt") push(goz("4133", r, wgSitz, "Gewinnung/Transplantation von Bindegewebe"));
			else if (wg === "vestibulumplastik") push(goz("3240", r, wgSitz, "Vestibulumplastik kleineren Umfangs"));
			else if (wg === "tuberplastik") push({
				id: `auto:goae2675:${r}`,
				ebene: "GOAE",
				nr: "2675",
				zahn: r,
				anzahl: 1,
				sitzung: wgSitz,
				grund: "Tuberplastik (GOÄ 2675)",
				auto: true
			});
		}
	}
	return {
		positionen,
		hinweise
	};
}
//#endregion
//#region src/engine/regelwerk.ts
/** GOZ-Nummern einer Region sammeln. */
var nummernInRegion = (ps, region) => new Set(ps.filter((p) => p.ebene === "GOZ" && p.zahn === region).map((p) => p.nr));
/**
* Konfliktgraph aus GOZ-Bestimmungen und BZÄK-Hinweisen. Entfernt oder reduziert
* Positionen, die nicht nebeneinander berechnungsfähig sind, und meldet jeden
* Eingriff als Hinweis.
*/
function regelwerkAnwenden(eingang) {
	let positionen = [...eingang];
	const hinweise = [];
	const raus = /* @__PURE__ */ new Set();
	const regionen = new Set(positionen.filter((p) => p.ebene === "GOZ").map((p) => p.zahn));
	for (const region of regionen) {
		const nrs = nummernInRegion(positionen, region);
		const has = (nr) => nrs.has(nr);
		const find = (nr) => positionen.find((p) => p.ebene === "GOZ" && p.zahn === region && p.nr === nr);
		if (has("9100")) {
			for (const nr of ["9090", "9130"]) if (has(nr)) {
				raus.add(find(nr).id);
				hinweise.push(`${region}: GOZ ${nr} ist neben 9100 nicht berechnungsfähig – entfernt.`);
			}
		}
		if (has("9110") && (has("9120") || has("9130"))) {
			raus.add(find("9110").id);
			hinweise.push(`${region}: GOZ 9110 ist neben 9120/9130 an derselben Kavität nicht berechnungsfähig – entfernt.`);
		}
		const p9100 = find("9100");
		if (p9100 && !raus.has(p9100.id)) {
			if (has("9120")) {
				p9100.gebuehrenanteil = 1 / 3;
				hinweise.push(`${region}: GOZ 9100 neben 9120 nur zu einem Drittel.`);
			} else if (has("9110")) {
				p9100.gebuehrenanteil = .5;
				hinweise.push(`${region}: GOZ 9100 neben 9110 nur zur Hälfte.`);
			}
		}
		if (has("9150") && !has("9100")) {
			raus.add(find("9150").id);
			hinweise.push(`${region}: GOZ 9150 ist nur zusammen mit 9100 berechnungsfähig – entfernt.`);
		}
		if (has("4138") && (has("9100") || has("9120") || has("9130"))) {
			raus.add(find("4138").id);
			hinweise.push(`${region}: GOZ 4138 (Membran) ist in 9100/9120/9130 enthalten – entfernt.`);
		}
		if (has("3100") && (has("9100") || has("3090"))) {
			raus.add(find("3100").id);
			hinweise.push(`${region}: GOZ 3100 ist neben 9100/3090 nicht berechnungsfähig – entfernt.`);
		}
		if (has("9050") && (has("9010") || has("9040"))) {
			raus.add(find("9050").id);
			hinweise.push(`${region}: GOZ 9050 ist neben 9010/9040 nicht berechnungsfähig – entfernt.`);
		}
	}
	if (positionen.some((p) => p.ebene === "GOAE" && p.nr === "5370")) {
		for (const p of positionen) if (p.ebene === "GOAE" && (p.nr === "5002" || p.nr === "5004")) {
			raus.add(p.id);
			hinweise.push("GOÄ 5002/5004 (Panorama) ist neben 5370 aus demselben Datensatz nicht berechnungsfähig – entfernt.");
		}
	}
	positionen = positionen.filter((p) => !raus.has(p.id));
	return {
		positionen,
		hinweise
	};
}
var goz_2012_default = {
	typ: "goz",
	name: "GOZ Gebührenverzeichnis (Anlage 1, Stand 2012)",
	gueltigAb: "2012-01-01",
	punktwert: .0562421,
	quelle: "https://www.gesetze-im-internet.de/goz_1987/anlage_1.html",
	eintraege: [
		{
			"nr": "0010",
			"text": "Eingehende Untersuchung zur Feststellung von Zahn-, Mund- und Kiefererkrankungen einschließlich Erhebung des Parodontalbefundes sowie Aufzeichnung des Befundes",
			"hinweis": "",
			"punkte": 100,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0030",
			"text": "Aufstellung eines schriftlichen Heil- und Kostenplans nach Befundaufnahme und gegebenenfalls Auswertung von Modellen",
			"hinweis": "",
			"punkte": 200,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0040",
			"text": "Aufstellung eines schriftlichen Heil- und Kostenplans bei kieferorthopädischer Behandlung oder bei funktionsanalytischen und funktionstherapeutischen Maßnahmen nach Befundaufnahme und Ausarbeitung einer Behandlungsplanung",
			"hinweis": "Die Leistungen nach den Nummern 0030 und 0040 sind nicht nebeneinander berechnungsfähig.",
			"punkte": 250,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0050",
			"text": "Abformung oder Teilabformung eines Kiefers für ein Situationsmodell einschließlich Auswertung zur Diagnose oder Planung",
			"hinweis": "",
			"punkte": 120,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0060",
			"text": "Abformung beider Kiefer für Situationsmodelle und einfache Bissfixierung einschließlich Auswertung zur Diagnose oder Planung",
			"hinweis": "Die Nebeneinanderberechnung der Leistungen nach den Nummern 0050 und 0060 ist in der Rechnung zu begründen.",
			"punkte": 260,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0065",
			"text": "Optisch-elektronische Abformung einschließlich vorbereitender Maßnahmen, einfache digitale Bissregistrierung und Archivierung, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Neben der Leistung nach der Nummer 0065 sind konventionelle Abformungen nach diesem Gebührenverzeichnis für dieselbe Kieferhälfte oder denselben Frontzahnbereich nicht berechnungsfähig.",
			"punkte": 80,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0070",
			"text": "Vitalitätsprüfung eines Zahnes oder mehrerer Zähne einschließlich Vergleichstest, je Sitzung",
			"hinweis": "",
			"punkte": 50,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0080",
			"text": "Intraorale Oberflächenanästhesie, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 30,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0090",
			"text": "Intraorale Infiltrationsanästhesie",
			"hinweis": "",
			"punkte": 60,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0100",
			"text": "Intraorale Leitungsanästhesie",
			"hinweis": "Wird die Leistung nach der Nummer 0090 je Zahn mehr als einmal berechnet, ist dies in der Rechnung zu begründen.Bei den Leistungen nach den Nummern 0090 und 0100 sind die Kosten der verwendeten Anästhetika gesondert berechnungsfähig.",
			"punkte": 70,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0110",
			"text": "Zuschlag für die Anwendung eines Operationsmikroskops bei den Leistungen nach den Nummern 2195, 2330, 2340, 2360, 2410, 2440, 3020, 3030, 3040, 3045, 3060, 3110, 3120, 3190, 3200, 4090, 4100, 4130, 4133, 9100, 9110, 9120, 9130 und 9170Der Zuschlag nach der Nummer 0110 ist je Behandlungstag nur einmal und nur mit dem einfachen Gebührensatz berechnungsfähig.",
			"hinweis": "",
			"punkte": 400,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "1000",
			"text": "Erstellung eines Mundhygienestatus und eingehende Unterweisung zur Vorbeugung gegen Karies und parodontale Erkrankungen, Dauer mindestens 25 Minuten",
			"hinweis": "",
			"punkte": 200,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "1010",
			"text": "Kontrolle des Übungserfolges einschließlich weiterer Unterweisung, Dauer mindestens 15 Minuten",
			"hinweis": "",
			"punkte": 100,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "1020",
			"text": "Lokale Fluoridierung zur Verbesserung der Zahnhartsubstanz, zur Kariesvorbeugung und -behandlung, mit Lack oder Gel, je Sitzung",
			"hinweis": "Die Leistung nach der Nummer 1000 ist innerhalb eines Jahres einmal, die Leistung nach der Nummer 1010 innerhalb eines Jahres dreimal berechnungsfähig.Die Leistungen umfassen die Erhebung von Mundhygiene-Indizes, das Anfärben der Zähne, die praktische Unterweisung mit individuellen Übungen und die Motivierung des Patienten.Im Zusammenhang mit den Leistungen nach den Nummern 1000 und 1010 sind Leistungen nach den Nummern 0010, 4000 und 8000 sowie Beratungen und Untersuchungen nach der Gebührenordnung für Ärzte nur dann berechnungsfähig, wenn diese Leistungen anderen Zwecken dienen und dies in der Rechnung begründet wird.Die Leistung nach der Nummer 1020 ist innerhalb eines Jahres höchstens viermal berechnungsfähig.",
			"punkte": 50,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "1030",
			"text": "Lokale Anwendung von Medikamenten zur Kariesvorbeugung oder initialen Kariesbehandlung mit einer individuell gefertigten Schiene als Medikamententräger, je Kiefer",
			"hinweis": "1. Die Herstellung einer individuell angefertigten Schiene als Medikamententräger (z. B. Tiefziehschiene) ist gesondert berechnungsfähig.2. Mit der Gebühr sind die Kosten für das verwendete Medikament abgegolten.3. Die Anwendung eines konfektionierten Löffels als Medikamententräger erfüllt nicht den Inhalt der Leistung nach der Nummer 1030.4. Bei Anwendung einer individuell gefertigten Schiene als Medikamententräger für Fluoridierungsmittel ist die mehr als viermalige Berechnung der Leistung nach der Nummer 1030 innerhalb eines Jahres in der Rechnung zu begründen.",
			"punkte": 90,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "1040",
			"text": "Professionelle Zahnreinigung",
			"hinweis": "Die Leistung umfasst das Entfernen der supragingivalen/gingivalen Beläge auf Zahn- und Wurzeloberflächen einschließlich Reinigung der Zahnzwischenräume, das Entfernen des Biofilms, die Oberflächenpolitur und geeignete Fluoridierungsmaßnahmen, je Zahn oder Implantat oder Brückenglied.Die Leistung nach der Nummer 1040 ist neben den Leistungen nach den Nummern 1020, 4050, 4055, 4060, 4070, 4075, 4090 und 4100 nicht berechnungsfähig.",
			"punkte": 28,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "2000",
			"text": "Versiegelung von kariesfreien Zahnfissuren mit aushärtenden Kunststoffen, auch Glattflächenversiegelung, je Zahn",
			"hinweis": "",
			"punkte": 90,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2010",
			"text": "Behandlung überempfindlicher Zahnflächen, je Kiefer",
			"hinweis": "",
			"punkte": 50,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2020",
			"text": "Temporärer speicheldichter Verschluss einer Kavität",
			"hinweis": "",
			"punkte": 98,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2030",
			"text": "Besondere Maßnahmen beim Präparieren oder Füllen von Kavitäten (z. B. Separieren, Beseitigen störenden Zahnfleisches, Stillung einer übermäßigen Papillenblutung), je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Die Leistung nach der Nummer 2030 ist je Sitzung für eine Kieferhälfte oder einen Frontzahnbereich höchstens einmal für besondere Maßnahmen beim Präparieren und höchstens einmal für besondere Maßnahmen beim Füllen von Kavitäten berechnungsfähig.",
			"punkte": 65,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2040",
			"text": "Anlegen von Spanngummi, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 65,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2050",
			"text": "Präparieren einer Kavität und Restauration mit plastischem Füllungsmaterial einschließlich Unterfüllung, Anlegen einer Matrize oder Benutzen anderer Hilfsmittel zur Formung der Füllung, einflächig",
			"hinweis": "",
			"punkte": 213,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2060",
			"text": "Präparieren einer Kavität und Restauration mit Kompositmaterialien, in Adhäsivtechnik (Konditionieren), einflächig, gegebenenfalls einschließlich Mehrschichttechnik, einschließlich Polieren, gegebenenfalls einschließlich Verwendung von Inserts",
			"hinweis": "",
			"punkte": 527,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2070",
			"text": "Präparieren einer Kavität und Restauration mit plastischem Füllungsmaterial einschließlich Unterfüllung, Anlegen einer Matrize oder Benutzen anderer Hilfsmittel zur Formung der Füllung, zweiflächig",
			"hinweis": "",
			"punkte": 242,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2080",
			"text": "Präparieren einer Kavität und Restauration mit Kompositmaterialien, in Adhäsivtechnik (Konditionieren), zweiflächig, gegebenenfalls einschließlich Mehrschichttechnik, einschließlich Polieren, gegebenenfalls einschließlich Verwendung von Inserts",
			"hinweis": "",
			"punkte": 556,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2090",
			"text": "Präparieren einer Kavität und Restauration mit plastischem Füllungsmaterial einschließlich Unterfüllung, Anlegen einer Matrize oder Benutzen anderer Hilfsmittel zur Formung der Füllung, dreiflächig",
			"hinweis": "",
			"punkte": 297,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2100",
			"text": "Präparieren einer Kavität und Restauration mit Kompositmaterialien, in Adhäsivtechnik (Konditionieren), dreiflächig, gegebenenfalls einschließlich Mehrschichttechnik, einschließlich Polieren, gegebenenfalls einschließlich Verwendung von Inserts",
			"hinweis": "",
			"punkte": 642,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2110",
			"text": "Präparieren einer Kavität und Restauration mit plastischem Füllungsmaterial einschließlich Unterfüllung, Anlegen einer Matrize oder Benutzen anderer Hilfsmittel zur Formung der Füllung, mehr als dreiflächig",
			"hinweis": "",
			"punkte": 319,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2120",
			"text": "Präparieren einer Kavität und Restauration mit Kompositmaterialien, in Adhäsivtechnik (Konditionieren), mehr als dreiflächig, gegebenenfalls einschließlich Mehrschichttechnik, einschließlich Polieren, gegebenenfalls einschließlich Verwendung von Inserts",
			"hinweis": "",
			"punkte": 770,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2130",
			"text": "Kontrolle, Finieren/Polieren einer Restauration in separater Sitzung, auch Nachpolieren einer vorhandenen Restauration",
			"hinweis": "",
			"punkte": 104,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2150",
			"text": "Einlagefüllung, einflächig",
			"hinweis": "",
			"punkte": 1141,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2160",
			"text": "Einlagefüllung, zweiflächig",
			"hinweis": "",
			"punkte": 1356,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2170",
			"text": "Einlagefüllung, mehr als zweiflächig",
			"hinweis": "",
			"punkte": 1709,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2180",
			"text": "Vorbereitung eines zerstörten Zahnes mit plastischem Aufbaumaterial zur Aufnahme einer Krone",
			"hinweis": "",
			"punkte": 150,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2190",
			"text": "Vorbereitung eines zerstörten Zahnes durch gegossenen Aufbau mit Stiftverankerung zur Aufnahme einer Krone",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2195",
			"text": "Vorbereitung eines zerstörten Zahnes durch einen Schraubenaufbau oder Glasfaserstift o. Ä. zur Aufnahme einer Krone",
			"hinweis": "Die Leistungen nach den Nummern 2180, 2190 oder 2195 sind neben den Leistungen nach den Nummern 2150 bis 2170 nicht berechnungsfähig.Die Leistung nach der Nummer 2180 ist neben der Leistung nach der Nummer 2190 nicht berechnungsfähig.Die Leistung nach der Nummer 2195 ist neben der Leistung nach der Nummer 2180 berechnungsfähig.Die Leistungen nach den Nummern 2180, 2190 und/oder die Leistung nach der Nummer 2195 ist je Zahn nur jeweils einmal berechnungsfähig.Die Kosten für die Verankerungselemente sind gesondert berechnungsfähig.",
			"punkte": 300,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2197",
			"text": "Adhäsive Befestigung (plastischer Aufbau, Stift, Inlay, Krone, Teilkrone, Veneer etc.)",
			"hinweis": "",
			"punkte": 130,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2200",
			"text": "Versorgung eines Zahnes oder Implantats durch eine Vollkrone (Tangentialpräparation)",
			"hinweis": "",
			"punkte": 1322,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2210",
			"text": "Versorgung eines Zahnes durch eine Vollkrone (Hohlkehl- oder Stufenpräparation)",
			"hinweis": "",
			"punkte": 1678,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2220",
			"text": "Versorgung eines Zahnes durch eine Teilkrone mit Retentionsrillen oder -kästen oder mit Pinledges einschließlich Rekonstruktion der gesamten Kaufläche, auch Versorgung eines Zahnes durch ein Veneer",
			"hinweis": "Neben den Leistungen nach den Nummern 2200 bis 2220 sind die Leistungen nach den Nummern 2050 bis 2130 nicht berechnungsfähig.Die Leistung nach der Nummer 2210 ist im Zusammenhang mit Implantaten nicht berechnungsfähig.Durch die Leistungen nach den Nummern 2150 bis 2170 und 2200 bis 2220 sind folgende zahnärztliche Leistungen abgegolten: Präparieren des Zahnes oder Implantats, Relationsbestimmung, Abformungen, Einproben, provisorisches Eingliedern, festes Einfügen der Einlagefüllung oder der Krone oder der Teilkrone oder des Veneers, Nachkontrolle und Korrekturen.Die Leistung nach der Nummer 2200 umfasst auch die Verschraubung und Abdeckung mit Füllungsmaterial.Zu den Kronen nach den Nummern 2200 bis 2220 gehören Kronen (Voll- und Teilkronen) jeder zahntechnischen Ausführung.",
			"punkte": 2067,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2250",
			"text": "Eingliederung einer konfektionierten Krone in der pädiatrischen Zahnheilkunde",
			"hinweis": "Die Kosten für konfektionierte Kronen sind gesondert berechnungsfähig.",
			"punkte": 210,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2260",
			"text": "Provisorium im direkten Verfahren ohne Abformung, je Zahn oder Implantat, einschließlich Entfernung",
			"hinweis": "",
			"punkte": 100,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2270",
			"text": "Provisorium im direkten Verfahren mit Abformung, je Zahn oder Implantat, einschließlich Entfernung",
			"hinweis": "Bei Verwendung eines konfektionierten Provisoriums sind die Kosten hierfür gesondert berechnungsfähig.Das Wiedereingliedern desselben Provisoriums, gegebenenfalls auch mehrmals, einschließlich Entfernung, ist mit der Gebühr nach der Nummer 2260 oder 2270 abgegolten.",
			"punkte": 270,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2290",
			"text": "Entfernung einer Einlagefüllung, einer Krone, eines Brückenankers, Abtrennen eines Brückengliedes oder Steges oder Ähnliches",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2300",
			"text": "Entfernung eines Wurzelstiftes",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2310",
			"text": "Wiedereingliederung einer Einlagefüllung, einer Teilkrone, eines Veneers oder einer Krone oder Wiederherstellung einer Verblendschale an herausnehmbarem Zahnersatz",
			"hinweis": "",
			"punkte": 145,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2320",
			"text": "Wiederherstellung einer Krone, einer Teilkrone, eines Veneers, eines Brückenankers, einer Verblendschale oder einer Verblendung an festsitzendem Zahnersatz, gegebenenfalls einschließlich Wiedereingliederung und Abformung",
			"hinweis": "",
			"punkte": 350,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2330",
			"text": "Maßnahmen zur Erhaltung der vitalen Pulpa bei Caries profunda (Exkavieren, indirekte Überkappung), je Kavität",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2340",
			"text": "Maßnahmen zur Erhaltung der freiliegenden vitalen Pulpa (Exkavieren, direkte Überkappung), je Kavität",
			"hinweis": "",
			"punkte": 200,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2350",
			"text": "Amputation und Versorgung der vitalen Pulpa einschließlich Exkavieren",
			"hinweis": "",
			"punkte": 290,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2360",
			"text": "Exstirpation der vitalen Pulpa einschließlich Exkavieren, je Kanal",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2380",
			"text": "Amputation und endgültige Versorgung der avitalen Milchzahnpulpa",
			"hinweis": "",
			"punkte": 160,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2390",
			"text": "Trepanation eines Zahnes, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 65,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2400",
			"text": "Elektrometrische Längenbestimmung eines Wurzelkanals",
			"hinweis": "Die Leistung nach der Nummer 2400 ist je Wurzelkanal höchstens zweimal je Sitzung berechnungsfähig.",
			"punkte": 70,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2410",
			"text": "Aufbereitung eines Wurzelkanals auch retrograd, je Kanal, gegebenenfalls in mehreren Sitzungen",
			"hinweis": "Die Leistung nach der Nummer 2410 ist für denselben Wurzelkanal nur dann erneut berechnungsfähig, wenn der Wurzelkanal nach der ersten Aufbereitung definitiv versorgt worden ist.Wenn auf Grund anatomischer Besonderheiten eine Aufbereitung in einer Sitzung nicht erfolgen kann, ist die Leistung nach der Nummer 2410 für denselben Wurzelkanal erneut berechnungsfähig. Dies ist in der Rechnung zu begründen. Je Aufbereitung eines Wurzelkanals ist die Leistung in diesem Fall höchstens zweimal berechnungsfähig.",
			"punkte": 392,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2420",
			"text": "Zusätzliche Anwendung elektrophysikalisch-chemischer Methoden, je Kanal",
			"hinweis": "",
			"punkte": 70,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2430",
			"text": "Medikamentöse Einlage in Verbindung mit Maßnahmen nach den Nummern 2360, 2380 und 2410, je Zahn und Sitzung",
			"hinweis": "",
			"punkte": 204,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2440",
			"text": "Füllung eines Wurzelkanals",
			"hinweis": "",
			"punkte": 258,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "3000",
			"text": "Entfernung eines einwurzeligen Zahnes oder eines enossalen Implantats",
			"hinweis": "",
			"punkte": 70,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3010",
			"text": "Entfernung eines mehrwurzeligen Zahnes",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3020",
			"text": "Entfernung eines tief frakturierten oder tief zerstörten Zahnes",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3030",
			"text": "Entfernung eines Zahnes oder eines enossalen Implantats durch Osteotomie",
			"hinweis": "",
			"punkte": 350,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3040",
			"text": "Entfernung eines retinierten, impaktierten oder verlagerten Zahnes durch Osteotomie",
			"hinweis": "",
			"punkte": 540,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3045",
			"text": "Entfernen eines extrem verlagerten und/oder extrem retinierten Zahnes durch umfangreiche Osteotomie bei gefährdeten anatomischen Nachbarstrukturen",
			"hinweis": "",
			"punkte": 767,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3050",
			"text": "Stillung einer übermäßigen Blutung im Mund- und/oder Kieferbereich, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3060",
			"text": "Stillung einer Blutung durch Abbinden oder Umstechen des Gefäßes oder durch Knochenbolzung",
			"hinweis": "",
			"punkte": 140,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3070",
			"text": "Exzision von Schleimhaut oder Granulationsgewebe, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 45,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3080",
			"text": "Exzision einer Schleimhautwucherung größeren Umfangs (z. B. lappiges Fibrom, Epulis)",
			"hinweis": "",
			"punkte": 150,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3090",
			"text": "Plastischer Verschluss einer eröffneten Kieferhöhle",
			"hinweis": "",
			"punkte": 370,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3100",
			"text": "Plastische Deckung im Rahmen einer Wundversorgung einschließlich einer Periostschlitzung, je Operationsgebiet (Raum einer zusammenhängenden Schnittführung)",
			"hinweis": "Die Leistung nach der Nummer 3100 ist für dasselbe Operationsgebiet nicht neben der Leistung nach der Nummer 3090 berechnungsfähig.",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3110",
			"text": "Resektion einer Wurzelspitze an einem Frontzahn",
			"hinweis": "",
			"punkte": 460,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3120",
			"text": "Resektion einer Wurzelspitze an einem Seitenzahn",
			"hinweis": "Die Kosten für konfektionierte apikale Stiftsysteme sind gesondert berechnungsfähig.",
			"punkte": 580,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3130",
			"text": "Hemisektion und Teilextraktion eines mehrwurzeligen Zahnes",
			"hinweis": "",
			"punkte": 280,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3140",
			"text": "Reimplantation eines Zahnes einschließlich einfacher Fixation",
			"hinweis": "",
			"punkte": 550,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3160",
			"text": "Transplantation eines Zahnes einschließlich operativer Schaffung des Knochenbettes",
			"hinweis": "",
			"punkte": 650,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3190",
			"text": "Operation einer Zyste durch Zystektomie in Verbindung mit einer Osteotomie oder Wurzelspitzenresektion",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3200",
			"text": "Operation einer Zyste durch Zystektomie, als selbstständige Leistung",
			"hinweis": "Das Auskratzen von Granulationsgewebe oder kleinen Zysten in Verbindung mit Extraktionen, Osteotomien oder Wurzelspitzenresektionen kann nicht nach den Nummern 3190 bis 3200 sowie 3310 berechnet werden.",
			"punkte": 500,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3210",
			"text": "Beseitigung störender Schleimhautbänder, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 140,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3230",
			"text": "Knochenresektion am Alveolarfortsatz zur Formung des Prothesenlagers, als selbstständige Leistung, je Kiefer",
			"hinweis": "",
			"punkte": 440,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3240",
			"text": "Vestibulumplastik oder Mundbodenplastik kleineren Umfangs auch Gingivaextensionsplastik, je Kieferhälfte oder Frontzahnbereich, für einen Bereich bis zu zwei nebeneinander liegenden Zähnen, gegebenenfalls auch am zahnlosen Kieferabschnitt",
			"hinweis": "",
			"punkte": 550,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3250",
			"text": "Tuberplastik, einseitig",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3260",
			"text": "Freilegen eines retinierten oder verlagerten Zahnes zur orthopädischen Einstellung",
			"hinweis": "",
			"punkte": 550,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3270",
			"text": "Germektomie",
			"hinweis": "",
			"punkte": 590,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3280",
			"text": "Lösen, Verlegen und Fixieren des Lippenbändchens und Durchtrennen des Septums bei echtem Diastema",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3290",
			"text": "Kontrolle nach chirurgischem Eingriff, als selbstständige Leistung, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 55,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3300",
			"text": "Nachbehandlung nach chirurgischem Eingriff (z. B. Tamponieren), als selbstständige Leistung, je Operationsgebiet (Raum einer zusammenhängenden Schnittführung)",
			"hinweis": "Die Leistung nach der Nummer 3300 ist höchstens zweimal je Kieferhälfte oder Frontzahnbereich berechnungsfähig.Neben der Leistung nach der Nummer 3300 sind die Leistungen nach den Nummern 3060 oder 3310 nicht berechnungsfähig.",
			"punkte": 65,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3310",
			"text": "Chirurgische Wundrevision (z. B. Glätten des Knochens, Auskratzen, Naht), je Operationsgebiet (Raum einer zusammenhängenden Schnittführung)",
			"hinweis": "Die Leistung nach der Nummer 3310 ist höchstens zweimal je Kieferhälfte oder Frontzahnbereich berechnungsfähig.Neben der Leistung nach der Nummer 3310 sind die Leistungen nach den Nummern 3060 oder 3300 nicht berechnungsfähig.",
			"punkte": 100,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "4000",
			"text": "Erstellen und Dokumentieren eines Parodontalstatus",
			"hinweis": "Die Leistung nach der Nummer 4000 ist innerhalb eines Jahres höchstens zweimal berechnungsfähig.",
			"punkte": 160,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4005",
			"text": "Erhebung mindestens eines Gingivalindex und/oder eines Parodontalindex (z. B. des Parodontalen Screening-Index PSI)",
			"hinweis": "Die Leistung nach der Nummer 4005 ist innerhalb eines Jahres höchstens zweimal berechnungsfähig.",
			"punkte": 80,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4020",
			"text": "Lokalbehandlung von Mundschleimhauterkrankungen, gegebenenfalls einschließlich Taschenspülungen, je Sitzung",
			"hinweis": "",
			"punkte": 45,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4025",
			"text": "Subgingivale medikamentöse antibakterielle Lokalapplikation, je Zahn",
			"hinweis": "Die verwendeten antibakteriellen Materialien sind gesondert berechnungsfähig.",
			"punkte": 15,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4030",
			"text": "Beseitigung von scharfen Zahnkanten, störenden Prothesenrändern und Fremdreizen am Parodontium, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 35,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4040",
			"text": "Beseitigung grober Vorkontakte der Okklusion und Artikulation durch Einschleifen des natürlichen Gebisses oder bereits vorhandenen Zahnersatzes, je Sitzung",
			"hinweis": "",
			"punkte": 45,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4050",
			"text": "Entfernung harter und weicher Zahnbeläge, gegebenenfalls einschließlich Polieren an einem einwurzeligen Zahn oder Implantat, auch Brückenglied",
			"hinweis": "",
			"punkte": 10,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4055",
			"text": "Entfernung harter und weicher Zahnbeläge, gegebenenfalls einschließlich Polieren an einem mehrwurzeligen Zahn",
			"hinweis": "Die Leistungen nach den Nummern 4050 und 4055 sind für denselben Zahn innerhalb von 30 Tagen nur einmal berechnungsfähig.",
			"punkte": 13,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4060",
			"text": "Kontrolle nach Entfernung harter und weicher Zahnbeläge oder professioneller Zahnreinigung nach der Nummer 1040 mit Nachreinigung einschließlich Polieren, je Zahn, oder Implantat, auch Brückenglied",
			"hinweis": "Die Leistung nach der Nummer 4060 ist neben den Leistungen nach den Nummern 1040, 4050 und 4055 nicht berechnungsfähig.",
			"punkte": 7,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4070",
			"text": "Parodontalchirurgische Therapie (insbesondere Entfernung subgingivaler Konkremente und Wurzelglättung) an einem einwurzeligen Zahn oder Implantat, geschlossenes Vorgehen",
			"hinweis": "",
			"punkte": 100,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4075",
			"text": "Parodontalchirurgische Therapie (insbesondere Entfernung subgingivaler Konkremente und Wurzelglättung) an einem mehrwurzeligen Zahn, geschlossenes Vorgehen",
			"hinweis": "",
			"punkte": 130,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4080",
			"text": "Gingivektomie, Gingivoplastik, je Parodontium",
			"hinweis": "",
			"punkte": 45,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4090",
			"text": "Lappenoperation, offene Kürettage einschließlich Osteoplastik an einem Frontzahn, je Parodontium",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4100",
			"text": "Lappenoperation, offene Kürettage einschließlich Osteoplastik an einem Seitenzahn, je Parodontium",
			"hinweis": "Neben den Leistungen nach den Nummern 4090 und 4100 sind Leistungen nach den Nummern 4050 bis 4080 in der gleichen Sitzung nicht berechnungsfähig.",
			"punkte": 275,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4110",
			"text": "Auffüllen von parodontalen Knochendefekten mit Aufbaumaterial (Knochen- und/oder Knochenersatzmaterial), auch Einbringen von Proteinen, zur regenerativen Behandlung parodontaler Defekte, gegebenenfalls einschließlich Materialentnahme im Aufbaugebiet, je Zahn oder Parodontium oder Implantat",
			"hinweis": "Die Leistung nach der Nummer 4110 ist auch im Rahmen einer chirurgischen Behandlung berechnungsfähig.Die Kosten eines einmal verwendbaren Knochenkollektors oder -schabers sind gesondert berechnungsfähig.",
			"punkte": 180,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4120",
			"text": "Verlegen eines gestielten Schleimhautlappens, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 275,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4130",
			"text": "Gewinnung und Transplantation von Schleimhaut, gegebenenfalls einschließlich Versorgung der Entnahmestelle, je Transplantat",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4133",
			"text": "Gewinnung und Transplantation von Bindegewebe einschließlich Versorgung der Entnahmestelle, je Zahnzwischenraum",
			"hinweis": "",
			"punkte": 880,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4136",
			"text": "Osteoplastik auch Kronenverlängerung, Tunnelierung oder Ähnliches je Zahn oder Parodontium, auch Implantat, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 200,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4138",
			"text": "Verwendung einer Membran zur Behandlung eines Knochendefektes einschließlich Fixierung, je Zahn, je Implantat",
			"hinweis": "",
			"punkte": 220,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4150",
			"text": "Kontrolle/Nachbehandlung nach parodontalchirurgischen Maßnahmen, je Zahn, Implantat oder Parodontium",
			"hinweis": "",
			"punkte": 7,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "5000",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn oder Implantat als Brücken- oder Prothesenanker mit einer Vollkrone (Tangentialpräparation)",
			"hinweis": "",
			"punkte": 1016,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5010",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn als Brücken- oder Prothesenanker mit einer Vollkrone (Hohlkehl- und Stufenpräparation) oder Einlagefüllung",
			"hinweis": "",
			"punkte": 1483,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5020",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn als Brücken- oder Prothesenanker mit einer Teilkrone mit Retentionsrillen oder -kasten oder mit Pinledges einschließlich Rekonstruktion der Kaufläche",
			"hinweis": "",
			"punkte": 1997,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5030",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn oder Implantat als Brücken- oder Prothesenanker mit einer Wurzelkappe mit Stift, gegebenenfalls zur Aufnahme einer Verbindungsvorrichtung oder anderer Verbindungselemente",
			"hinweis": "",
			"punkte": 1483,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5040",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn oder Implantat als Brücken- oder Prothesenanker mit einer Teleskopkrone, auch Konuskrone",
			"hinweis": "Die Leistung nach der Nummer 5040 ist neben der Leistung nach der Nummer 5080 nicht berechnungsfähig.Durch die Leistungen nach den Nummern 5000 bis 5040 sind folgende zahnärztliche Leistungen abgegolten: Präparieren des Zahnes oder Implantats, Relationsbestimmung, Abformungen, Einproben, provisorisches Eingliedern, festes Einfügen der Krone, der Einlagefüllung, der Teilkrone o. a., Nachkontrolle und KorrekturenDie Leistungen nach den Nummern 5000 und 5030 umfassen auch die Verschraubung und Abdeckung mit Füllungsmaterial.Zu den Leistungen nach den Nummern 5000 bis 5040 gehören Brücken- oder Prothesenanker mit Verbindungselementen jeder Ausführung.Die Leistungen nach den Nummern 5010 und 5020 sind im Zusammenhang mit Implantaten nicht berechnungsfähig.Zu den Kronen nach den Nummern 5000 bis 5040 gehören Kronen (Voll-, Teil- und Teleskopkronen, sowie Wurzelstiftkappen) jeder zahntechnischen Ausführung.",
			"punkte": 2605,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5070",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: Verbindung von Kronen oder Einlagefüllungen durch Brückenglieder, Prothesenspannen oder Stege, je zu überbrückende Spanne oder Freiendsattel",
			"hinweis": "",
			"punkte": 400,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5080",
			"text": "Versorgung eines Lückengebisses durch eine zusammengesetzte Brücke oder Prothese, je Verbindungselement",
			"hinweis": "Matrize und Patrize gelten als ein Verbindungselement. Die Leistung nach der Nummer 5080 ist neben der Leistung nach der Nummer 5040 nicht berechnungsfähig.",
			"punkte": 230,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5090",
			"text": "Wiederherstellung der Funktion eines Verbindungselements nach der Nummer 5080",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5100",
			"text": "Erneuern des Sekundärteils einer Teleskopkrone einschließlich Abformung",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5110",
			"text": "Wiedereingliederung einer endgültigen Brücke nach Wiederherstellung der Funktion",
			"hinweis": "",
			"punkte": 360,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5120",
			"text": "Provisorische Brücke im direkten Verfahren mit Abformung, je Zahn oder Implantat, einschließlich Entfernung",
			"hinweis": "",
			"punkte": 240,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5140",
			"text": "Provisorische Brücke im direkten Verfahren mit Abformung, je Brückenspanne oder Freiendsattel, einschließlich Entfernung",
			"hinweis": "Das Wiedereingliedern derselben provisorischen Brücke, gegebenenfalls auch mehrmals, einschließlich Entfernung ist mit den Gebühren nach den Nummern 5120 bis 5140 abgegolten.",
			"punkte": 80,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5150",
			"text": "Versorgung eines Lückengebisses mit Hilfe einer durch Adhäsivtechnik befestigten Brücke, für die erste zu überbrückende Spanne",
			"hinweis": "",
			"punkte": 730,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5160",
			"text": "Versorgung eines Lückengebisses nach der Nummer 5150, für jede weitere zu überbrückende Spanne",
			"hinweis": "",
			"punkte": 360,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5170",
			"text": "Anatomische Abformung des Kiefers mit individuellem Löffel bei ungünstigen Zahnbogen- und Kieferformen und/oder tief ansetzenden Bändern oder spezielle Abformung zur Remontage, je Kiefer",
			"hinweis": "",
			"punkte": 250,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5180",
			"text": "Funktionelle Abformung des Oberkiefers mit individuellem Löffel",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5190",
			"text": "Funktionelle Abformung des Unterkiefers mit individuellem Löffel",
			"hinweis": "",
			"punkte": 540,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5200",
			"text": "Versorgung eines teilbezahnten Kiefers durch eine Teilprothese mit einfachen, gebogenen Haftelementen einschließlich Einschleifen der Auflagen",
			"hinweis": "",
			"punkte": 700,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5210",
			"text": "Versorgung eines teilbezahnten Kiefers durch eine Modellgussprothese mit gegossenen Halte- und Stützelementen einschließlich Einschleifen der Auflagen",
			"hinweis": "",
			"punkte": 1400,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5220",
			"text": "Versorgung eines zahnlosen Kiefers durch eine totale Prothese oder Deckprothese bei Verwendung einer Kunststoff- oder Metallbasis, im Oberkiefer",
			"hinweis": "Eine Deckprothese setzt eine Basisgestaltung wie bei einer totalen Prothese voraus.",
			"punkte": 1850,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5230",
			"text": "Versorgung eines zahnlosen Kiefers durch eine totale Prothese oder Deckprothese bei Verwendung einer Kunststoff- oder Metallbasis, im Unterkiefer",
			"hinweis": "Eine Deckprothese setzt eine Basisgestaltung wie bei einer totalen Prothese voraus.Durch die Leistungen nach den Nummern 5200 bis 5230 sind folgende Leistungen abgegolten:Anatomische Abformungen (auch des Gegenkiefers), Bestimmung der Kieferrelation, Einproben, Einpassen bzw. Einfügen, Nachkontrolle und Korrekturen.",
			"punkte": 2200,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5250",
			"text": "Maßnahmen zur Wiederherstellung der Funktion oder zur Erweiterung einer abnehmbaren Prothese (ohne Abformung)",
			"hinweis": "",
			"punkte": 140,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5260",
			"text": "Maßnahmen zur Wiederherstellung der Funktion oder zur Erweiterung einer abnehmbaren Prothese (mit Abformung) einschließlich Halte- und Stützvorrichtungen",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5270",
			"text": "Teilunterfütterung einer Prothese",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5280",
			"text": "Vollständige Unterfütterung einer Prothese",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5290",
			"text": "Vollständige Unterfütterung einer Prothese einschließlich funktioneller Randgestaltung, im Oberkiefer",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5300",
			"text": "Vollständige Unterfütterung einer Prothese einschließlich funktioneller Randgestaltung, im Unterkiefer",
			"hinweis": "",
			"punkte": 540,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5310",
			"text": "Vollständige Unterfütterung bei einer Defektprothese einschließlich funktioneller Randgestaltung",
			"hinweis": "Im Zusammenhang mit Leistungen nach den Nummern 5270 bis 5310 dürfen Leistungen nach den Nummern 5250 und 5260 nur berechnet werden, wenn es sich um zeitlich getrennte Verrichtungen handelt.Leistungen nach den Nummern 5270 bis 5310 sind nur als Maßnahmen zur Wiederherstellung der Funktion einer abnehmbaren Prothese berechnungsfähig.",
			"punkte": 730,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5320",
			"text": "Eingliederung eines Obturators zum Verschluss von Defekten des Gaumens",
			"hinweis": "",
			"punkte": 2200,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5330",
			"text": "Eingliederung einer Resektionsprothese zum Verschluss und zum Ausgleich von Defekten der Kiefer",
			"hinweis": "",
			"punkte": 2800,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5340",
			"text": "Eingliederung einer Prothese oder Epithese zum Verschluss extraoraler Weichteildefekte oder zum Ersatz fehlender Gesichtsteile einschließlich Stütz-, Halte- oder Hilfsvorrichtungen",
			"hinweis": "Maßnahmen zur Weichteilstützung sind mit den Leistungen nach den Nummern 5200 bis 5340 abgegolten.",
			"punkte": 7300,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "6000",
			"text": "Profil- oder Enfacefotografie einschließlich kieferorthopädischer Auswertung",
			"hinweis": "Eine mehr als viermalige Berechnung der Leistung nach der Nummer 6000 im Verlauf einer kieferorthopädischen Behandlung ist in der Rechnung zu begründen.",
			"punkte": 80,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6010",
			"text": "Anwendung von Methoden zur Analyse von Kiefermodellen (dreidimensionale, graphische oder metrische Analysen, Diagramme), je Leistung nach der Nummer 0060",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6020",
			"text": "Anwendung von Methoden zur Untersuchung des Gesichtsschädels (zeichnerische Auswertung von Röntgenaufnahmen des Schädels, Wachstumsanalysen)",
			"hinweis": "",
			"punkte": 360,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6030",
			"text": "Maßnahmen zur Umformung eines Kiefers einschließlich Retention, geringer Umfang",
			"hinweis": "",
			"punkte": 1350,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6040",
			"text": "Maßnahmen zur Umformung eines Kiefers einschließlich Retention, mittlerer Umfang",
			"hinweis": "",
			"punkte": 2100,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6050",
			"text": "Maßnahmen zur Umformung eines Kiefers einschließlich Retention, hoher Umfang",
			"hinweis": "Bei Maßnahmen von mittlerem Umfang nach der Nummer 6040 müssen mindestens drei, bei Maßnahmen von hohem Umfang mindestens vier der Kriterien nach den Buchstaben a bis e erfüllt sein:a) Zahl der bewegten Zahngruppen: zwei und mehr Zahngruppen,b) Ausmaß der Zahnbewegung: mehr als 2 Millimeter,c) Art der Zahnbewegung: körperlich mehr als 2 Millimeter, kontrollierte Wurzelbewegung, direkte Veränderung der Bisshöhe, Zahndrehung mehr als 30 Grad,d) Richtung der Zahnbewegung: entgegen Wanderungstendenz,e) Verankerung: mit zusätzlichen intra- oder extraoralen Maßnahmen.",
			"punkte": 3600,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6060",
			"text": "Maßnahmen zur Einstellung der Kiefer in den Regelbiss während der Wachstumsphase einschließlich Retention, geringer Umfang",
			"hinweis": "",
			"punkte": 1800,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6070",
			"text": "Maßnahmen zur Einstellung der Kiefer in den Regelbiss während der Wachstumsphase einschließlich Retention, mittlerer Umfang",
			"hinweis": "",
			"punkte": 2600,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6080",
			"text": "Maßnahmen zur Einstellung der Kiefer in den Regelbiss während der Wachstumsphase einschließlich Retention, hoher Umfang",
			"hinweis": "Bei Maßnahmen von mittlerem Umfang muss mindestens ein Kriterium nach den Buchstaben a bis c, bei Maßnahmen von hohem Umfang müssen mindestens zwei der Kriterien erfüllt sein:a) Ausmaß der Bissverschiebung: mehr als 4 Millimeter,b) Richtung der durchzuführenden Bissverschiebung, Unterkiefer relativ zum Oberkiefer: dorsal,c) Skelettale Bedingungen: ungünstige Wachstumsvoraussetzungen.Die Leistungen nach den Nummern 6030 bis 6080 umfassen alle im Behandlungsplan festgelegten Maßnahmen innerhalb eines Zeitraumes von bis zu vier Jahren.Die Maßnahmen im Sinne der Nummern 6030 bis 6080 umfassen alle Leistungen zur Kieferumformung und Retention bzw. zur Einstellung des Unterkiefers in den Regelbiss innerhalb eines Zeitraumes von bis zu vier Jahren, unabhängig von den angewandten Behandlungsmethoden oder den verwendeten Therapiegeräten.Neben den Leistungen nach den Nummern 6030 bis 6080 sind Leistungen nach den Nummern 6190 bis 6260 nicht berechnungsfähig.",
			"punkte": 3600,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6090",
			"text": "Maßnahmen zur Einstellung der Okklusion durch alveolären Ausgleich bei abgeschlossener Wachstumsphase einschließlich Retention, je Kiefer",
			"hinweis": "",
			"punkte": 700,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6100",
			"text": "Eingliederung eines Klebebrackets zur Aufnahme orthodontischer Hilfsmittel",
			"hinweis": "",
			"punkte": 165,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6110",
			"text": "Entfernung eines Klebebrackets einschließlich Polieren und gegebenenfalls Versiegelung des Zahnes",
			"hinweis": "",
			"punkte": 70,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6120",
			"text": "Eingliederung eines Bandes zur Aufnahme orthodontischer Hilfsmittel",
			"hinweis": "",
			"punkte": 230,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6130",
			"text": "Entfernung eines Bandes einschließlich Polieren und gegebenenfalls Versiegelung des Zahnes",
			"hinweis": "",
			"punkte": 20,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6140",
			"text": "Eingliederung eines Teilbogens",
			"hinweis": "",
			"punkte": 210,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6150",
			"text": "Eingliederung eines ungeteilten Bogens, alle Zahngruppen umfassend, je Kiefer",
			"hinweis": "",
			"punkte": 500,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6160",
			"text": "Eingliederung einer intra-/extraoralen Verankerung (z. B. Headgear).",
			"hinweis": "",
			"punkte": 370,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6170",
			"text": "Eingliederung einer Kopf-Kinn-Kappe.",
			"hinweis": "Die Kosten für die eingegliederten Hilfsmittel nach den Nummern 6160 und 6170 sind gesondert berechnungsfähig.",
			"punkte": 500,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6180",
			"text": "Maßnahmen zur Wiederherstellung der Funktionsfähigkeit und/oder Erweiterung von herausnehmbaren Behandlungsgeräten einschließlich Abformung und Wiedereinfügen, je Kiefer und je Sitzung einmal berechnungsfähig",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6190",
			"text": "Beratendes und belehrendes Gespräch mit Anweisungen zur Beseitigung von schädlichen Gewohnheiten und Dysfunktionen",
			"hinweis": "Neben der Leistung nach der Nummer 6190 ist die Leistung nach der Nummer 0010 in derselben Sitzung nicht berechnungsfähig.",
			"punkte": 140,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6200",
			"text": "Eingliedern von Hilfsmitteln zur Beseitigung von Funktionsstörungen (z. B. Mundvorhofplatte) einschließlich Anweisung zum Gebrauch und Kontrollen",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6210",
			"text": "Kontrolle des Behandlungsverlaufs oder Weiterführung der Retention einschließlich kleiner Änderungen der Behandlungs- oder Retentionsgeräte, Therapiekontrolle der gesteuerten Extraktion, je Sitzung",
			"hinweis": "",
			"punkte": 90,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6220",
			"text": "Vorbereitende Maßnahmen zur Herstellung von kieferorthopädischen Behandlungsmitteln (z. B. Abformung, Bissnahme), je Kiefer",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6230",
			"text": "Eingliederung von kieferorthopädischen Behandlungsmitteln, je Kiefer",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6240",
			"text": "Maßnahmen zur Verhütung von Folgen vorzeitigen Zahnverlustes (Offenhalten einer Lücke)",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6250",
			"text": "Beseitigung des Diastemas, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6260",
			"text": "Maßnahmen zur Einordnung eines verlagerten Zahnes in den Zahnbogen, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 1100,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "7000",
			"text": "Eingliederung eines Aufbissbehelfs ohne adjustierte Oberfläche",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7010",
			"text": "Eingliederung eines Aufbissbehelfs mit adjustierter Oberfläche",
			"hinweis": "",
			"punkte": 800,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7020",
			"text": "Umarbeitung einer vorhandenen Prothese zum Aufbissbehelf",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7030",
			"text": "Wiederherstellung der Funktion eines Aufbissbehelfs, z. B. durch Unterfütterung",
			"hinweis": "",
			"punkte": 370,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7040",
			"text": "Kontrolle eines Aufbissbehelfs",
			"hinweis": "",
			"punkte": 65,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7050",
			"text": "Kontrolle eines Aufbissbehelfs mit adjustierter Oberfläche: subtraktive Maßnahmen, je Sitzung",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7060",
			"text": "Kontrolle eines Aufbissbehelfs mit adjustierter Oberfläche: additive Maßnahmen, je Sitzung",
			"hinweis": "",
			"punkte": 410,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7070",
			"text": "Semipermanente Schiene unter Anwendung der Ätztechnik, je Interdentalraum",
			"hinweis": "",
			"punkte": 90,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7080",
			"text": "Versorgung eines Kiefers mit einem festsitzenden laborgefertigten Provisorium (einschließlich Vorpräparation) im indirekten Verfahren, je Zahn oder je Implantat, einschließlich Entfernung",
			"hinweis": "",
			"punkte": 600,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7090",
			"text": "Versorgung eines Kiefers mit einem laborgefertigten Provisorium im indirekten Verfahren, je Brückenglied, einschließlich Entfernung",
			"hinweis": "Die Berechnung der Leistungen nach den Nummern 7080 und 7090 setzt voraus, dass es sich bei dem festsitzenden laborgefertigten Provisorium um ein Langzeitprovisorium mit einer Tragezeit von mindestens drei Monaten handelt.",
			"punkte": 270,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7100",
			"text": "Maßnahmen zur Wiederherstellung der Funktion eines Langzeitprovisoriums, je Krone, Spanne oder Freiendbrückenglied",
			"hinweis": "Die Wiedereingliederung desselben festsitzenden laborgefertigten Provisoriums nach den Nummern 7080 oder 7090, gegebenenfalls auch mehrmals, einschließlich Entfernung, ist mit den Gebühren nach den Nummern 7080 bis 7100 abgegolten.",
			"punkte": 200,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "8000",
			"text": "Klinische Funktionsanalyse einschließlich Dokumentation",
			"hinweis": "Die Leistung nach der Nummer 8000 umfasst auch folgende zahnärztliche Leistungen: prophylaktische, prothetische, parodontologische und okklusale Befunderhebung, funktionsdiagnostische Auswertung von Röntgenaufnahmen des Schädels und der Halswirbelsäule, klinische Reaktionstests (z. B. Resilienztest, Provokationstest).",
			"punkte": 500,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8010",
			"text": "Registrieren der gelenkbezüglichen Zentrallage des Unterkiefers, auch Stützstiftregistrierung, je Registrat",
			"hinweis": "Die Leistung nach der Nummer 8010 ist je Sitzung höchstens zweimal berechnungsfähig.Neben der Leistung nach der Nummer 8010 sind die Material- und Laborkosten für die Bissnahme und die Lieferung und Anbringung des Stützstiftbestecks gesondert berechnungsfähig.",
			"punkte": 180,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8020",
			"text": "Arbiträre Scharnierachsenbestimmung (eingeschlossen sind die arbiträre Scharnierachsenbestimmung, das Anlegen eines Übertragungsbogens, das Koordinieren eines Übertragungsbogens mit einem Artikulator)",
			"hinweis": "",
			"punkte": 300,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8030",
			"text": "Kinematische Scharnierachsenbestimmung (eingeschlossen sind die kinematische Scharnierachsenbestimmung, das definitive Markieren der Referenzpunkte, das Anlegen eines Übertragungsbogens, das Koordinieren eines Übertragungsbogens mit einem Artikulator)",
			"hinweis": "",
			"punkte": 550,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8035",
			"text": "Kinematische Scharnierachsenbestimmung mittels elektronischer Aufzeichnung (eingeschlossen sind die kinematische Scharnierachsenbestimmung, das definitive Markieren der Referenzpunkte, gegebenenfalls das Anlegen eines Übertragungsbogens, gegebenenfalls das Koordinieren eines Übertragungsbogens mit einem Artikulator)",
			"hinweis": "Neben den Leistungen nach den Nummern 8020 bis 8035 sind die Material- und Laborkosten für die Artikulation des Ober- und Unterkiefermodells im (halb) individuellen Artikulator gesondert berechnungsfähig.",
			"punkte": 550,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8050",
			"text": "Registrieren von Unterkieferbewegungen zur Einstellung halbindividueller Artikulatoren und Einstellung nach den gemessenen Werten, je Sitzung",
			"hinweis": "",
			"punkte": 500,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8060",
			"text": "Registrieren von Unterkieferbewegungen zur Einstellung voll adjustierbarer Artikulatoren und Einstellung nach den gemessenen Werten, je Sitzung",
			"hinweis": "",
			"punkte": 750,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8065",
			"text": "Registrieren von Unterkieferbewegungen mittels elektronischer Aufzeichnung zur Einstellung voll adjustierbarer Artikulatoren und Einstellung nach den gemessenen Werten, je Sitzung",
			"hinweis": "Neben den Leistungen nach den Nummern 8050 bis 8065 sind Material- und Laborkosten für die Einstellung des (halb) individuellen Artikulators nach den gemessenen Werten gesondert berechnungsfähig.",
			"punkte": 850,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8080",
			"text": "Diagnostische Maßnahmen an Modellen im Artikulator einschließlich subtraktiver oder additiver Korrekturen, Befundauswertung und Behandlungsplanung, je Sitzung",
			"hinweis": "",
			"punkte": 250,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8090",
			"text": "Diagnostischer Aufbau von Funktionsflächen am natürlichen Gebiss, am festsitzenden und/oder herausnehmbaren Zahnersatz, je Sitzung",
			"hinweis": "",
			"punkte": 250,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8100",
			"text": "Systematische subtraktive Maßnahmen am natürlichen Gebiss, am festsitzenden und/oder herausnehmbaren Zahnersatz, je Zahnpaar",
			"hinweis": "",
			"punkte": 20,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "9000",
			"text": "Implantatbezogene Analyse und Vermessung des Alveolarfortsatzes, des Kieferkörpers und der angrenzenden knöchernen Strukturen sowie der Schleimhaut, einschließlich metrischer Auswertung von radiologischen Befundunterlagen, Modellen und Fotos zur Feststellung der Implantatposition, gegebenenfalls mit Hilfe einer individuellen Schablone zur Diagnostik, einschließlich Implantatauswahl, je Kiefer.",
			"hinweis": "Bei Verwendung einer Röntgenmessschablone sind die Material- und Laborkosten gesondert berechnungsfähig.",
			"punkte": 884,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9003",
			"text": "Verwenden einer Orientierungsschablone/Positionierungsschablone zur Implantation, je Kiefer",
			"hinweis": "Bei Verwendung einer Orientierungsschablone sind die Material- und Laborkosten gesondert berechnungsfähig.",
			"punkte": 100,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9005",
			"text": "Verwenden einer auf dreidimensionale Daten gestützten Navigationsschablone/chirurgischen Führungsschablone zur Implantation, gegebenenfalls einschließlich Fixierung, je Kiefer",
			"hinweis": "Die verwendeten Fixierungselemente sowie die Material- und Laborkosten der Navigationsschablone sind gesondert berechnungsfähig.",
			"punkte": 300,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9010",
			"text": "Implantatinsertion, je Implantat Präparieren einer Knochenkavität für ein enossales Implantat, Einsetzen einer Implantatschablone zur Überprüfung der Knochenkavität (z. B. Tiefenlehre), gegebenenfalls einschließlich Knochenkondensation, Knochenglättung im Bereich des Implantats, Einbringen eines enossalen Implantats einschließlich Verschlussschraube und gegebenenfalls Einbringen von Aufbauelementen bei offener Einheilung sowie Wundverschluss",
			"hinweis": "",
			"punkte": 1545,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9020",
			"text": "Insertion eines Implantats zum temporären Verbleib, auch orthodontisches Implantat",
			"hinweis": "",
			"punkte": 515,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9040",
			"text": "Freilegen eines Implantats, und Einfügen eines oder mehrerer Aufbauelemente (z. B. eines Gingivaformers) bei einem zweiphasigen Implantatsystem",
			"hinweis": "",
			"punkte": 626,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9050",
			"text": "Entfernen und Wiedereinsetzen sowie Auswechseln eines oder mehrerer Aufbauelemente bei einem zweiphasigen Implantatsystem während der rekonstruktiven Phase",
			"hinweis": "1. Die Leistung nach der Nummer 9050 ist nicht neben den Leistungen nach den Nummern 9010 und 9040 berechnungsfähig.2. Die Leistung nach der Nummer 9050 ist je Implantat höchstens dreimal und höchstens einmal je Sitzung berechnungsfähig.",
			"punkte": 313,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9060",
			"text": "Auswechseln von Aufbauelementen (Sekundärteilen) im Reparaturfall",
			"hinweis": "Die Leistung nach der Nummer 9060 ist für ein Implantat höchstens einmal je Sitzung berechnungsfähig.",
			"punkte": 313,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9090",
			"text": "Knochengewinnung (z. B. Knochenkollektor oder Knochenschaber), Knochenaufbereitung und -implantation, auch zur Weichteilunterfütterung",
			"hinweis": "Die Kosten eines einmal verwendbaren Knochenkollektors oder -schabers sind gesondert berechnungsfähig.",
			"punkte": 400,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9100",
			"text": "Aufbau des Alveolarfortsatzes durch Augmentation ohne zusätzliche Stabilisierungsmaßnahmen, je Kieferhälfte oder Frontzahnbereich Mit der Leistung nach der Nummer 9100 sind folgende Leistungen abgegolten: Lagerbildung, Glättung des Alveolarfortsatzes, gegebenenfalls Entnahme von Knochen innerhalb des Aufbaugebietes, Einbringung von Aufbaumaterial (Knochen und/oder Knochenersatzmaterial) und Wundverschluss mit vollständiger Schleimhautabdeckung, gegebenenfalls einschließlich Einbringung und Fixierung resorbierbarer oder nicht resorbierbarer Barrieren",
			"hinweis": "1. Die Leistung nach der Nummer 9100 ist für die Glättung des Alveolarfortsatzes im Bereich des Implantatbettes nicht berechnungsfähig.2. Neben der Leistung nach der Nummer 9100 sind die Leistungen nach der Nummer 9130 nicht berechnungsfähig.3. Wird die Leistung nach der Nummer 9100 in derselben Kieferhälfte neben der Leistung nach der Nummer 9110 erbracht, ist die Hälfte der Gebühr der Nummer 9100 berechnungsfähig.4. Wird die Leistung nach der Nummer 9100 in derselben Kieferhälfte neben der Leistung nach der Nummer 9120 erbracht, ist ein Drittel der Gebühr der Nummer 9100 berechnungsfähig.",
			"punkte": 2694,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9110",
			"text": "Geschlossene Sinusbodenelevation vom Kieferkamm aus (interner Sinuslift) Mit einer Leistung nach der Nummer 9110 sind folgende Leistungen abgegolten: Schaffung des Zugangs durch die Alveole oder das Implantatfach, Anhebung des Kieferhöhlenbodens durch knochenverdrängende oder knochenverdichtende Maßnahmen und der Kieferhöhlenmembran, Entnahme von Knochenspänen innerhalb des Aufbaugebietes des Implantatfaches und Einbringen von Aufbaumaterial (Knochen und/oder Knochenersatzmaterial)",
			"hinweis": "Die Leistung nach der Nummer 9110 ist für dieselbe Implantatkavität nicht neben den Leistungen nach den Nummern 9120 und 9130 berechnungsfähig.",
			"punkte": 1500,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9120",
			"text": "Sinusbodenelevation durch externe Knochenfensterung (externer Sinuslift), je Kieferhälfte Mit einer Leistung nach der Nummer 9120 sind folgende Leistungen abgegolten: Schaffung des Zugangs zur Kieferhöhle durch Knochenfensterung (auch Knochendeckel), Präparation der Kieferhöhlenmembran, Anhebung des Kieferhöhlenbodens und der Kieferhöhlenmembran, Lagerbildung, gegebenenfalls Entnahme von Knochenspänen innerhalb des Aufbaugebietes, Einbringung von Aufbaumaterial (Knochen und/oder Knochenersatzmaterial), gegebenenfalls Einbringung resorbierbarer oder nicht resorbierbarer Barrieren – einschließlich Fixierung –, gegebenenfalls Reposition des Knochendeckels, Verschluss der Kieferhöhle und Wundverschluss",
			"hinweis": "",
			"punkte": 3e3,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9130",
			"text": "Spaltung und Spreizung von Knochensegmenten (Bone Splitting), gegebenenfalls mit Auffüllung der Spalträume mittels Knochen oder Knochenersatzmaterial, gegebenenfalls einschließlich zusätzlicher Osteosynthesemaßnahmen, gegebenenfalls einschließlich Einbringung resorbierbarer oder nicht resorbierbarer Barrieren und deren Fixierung je Kieferhälfte oder Frontzahnbereich, oder vertikale Distraktion des Alveolarfortsatzes einschließlich Fixierung, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Neben der Leistung nach der Nummer 9130 ist die Leistung nach der Nummer 9100 nicht berechnungsfähig.",
			"punkte": 1540,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9140",
			"text": "Intraorale Entnahme von Knochen außerhalb des Aufbaugebietes gegebenenfalls einschließlich Aufbereitung des Knochenmaterials und/oder der Aufnahmeregion, einschließlich der notwendigen Versorgung der Entnahmestelle, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Bei Entnahme von einem oder mehreren Knochenblöcken ist das Doppelte der Gebühr nach der Nummer 9140 berechnungsfähig. Von einem Knochenblock im Sinne dieser Abrechnungsbestimmung ist auszugehen, wenn dieser bei der Implantation eigenständig fixiert werden muss.",
			"punkte": 650,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9150",
			"text": "Fixation oder Stabilisierung des Augmentates durch Osteosynthesemaßnahmen (z. B. Schrauben- oder Plattenosteosynthese oder Titannetze), zusätzlich zu der Leistung nach der Nummer 9100, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 675,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9160",
			"text": "Entfernung unter der Schleimhaut liegender Materialien (z. B. Barrieren – einschließlich Fixierung –, Osteosynthesematerial), je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 330,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9170",
			"text": "Entfernung im Knochen liegender Materialien durch Osteotomie (z. B. Osteosynthesematerial, Knochenschrauben) oder Entfernung eines subperiostalen Gerüstimplantats, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Die Entfernung eines Implantats ist mit der Gebühr für die Leistungen nach den Nummern 3000 und 3030 abgegolten.",
			"punkte": 500,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "0500",
			"text": "Zuschlag bei nichtstationärer Durchführung von zahnärztlich-chirurgischen Leistungen, die mit Punktzahlen von 250 bis 499 Punkten bewertet sind, oder zu den Leistungen nach den Nummern 4090 oder 4130Der Zuschlag nach der Nummer 0500 ist je Behandlungstag nur einmal berechnungsfähig. Der Zuschlag nach der Nummer 0500 ist neben den Zuschlägen nach den Nummern 0510 bis 0530 nicht berechnungsfähig.",
			"hinweis": "",
			"punkte": 400,
			"abschnitt": "L Zuschläge"
		},
		{
			"nr": "0510",
			"text": "Zuschlag bei nichtstationärer Durchführung von zahnärztlich-chirurgischen Leistungen, die mit Punktzahlen von 500 bis 799 Punkten bewertet sind",
			"hinweis": "Der Zuschlag nach der Nummer 0510 ist je Behandlungstag nur einmal berechnungsfähig. Der Zuschlag nach der Nummer 0510 ist neben den Zuschlägen nach den Nummern 0500, 0520 und/oder 0530 nicht berechnungsfähig.",
			"punkte": 750,
			"abschnitt": "L Zuschläge"
		},
		{
			"nr": "0520",
			"text": "Zuschlag bei nichtstationärer Durchführung von zahnärztlich-chirurgischen Leistungen, die mit Punktzahlen von 800 bis 1199 Punkten bewertet sind",
			"hinweis": "Der Zuschlag nach der Nummer 0520 ist je Behandlungstag nur einmal berechnungsfähig. Der Zuschlag nach der Nummer 0520 ist neben den Zuschlägen nach den Nummern 0500, 0510 und/oder 0530 nicht berechnungsfähig.",
			"punkte": 1300,
			"abschnitt": "L Zuschläge"
		},
		{
			"nr": "0530",
			"text": "Zuschlag bei nichtstationärer Durchführung von zahnärztlich-chirurgischen Leistungen, die mit Punktzahlen von 1200 und mehr Punkten bewertet sind",
			"hinweis": "Der Zuschlag nach der Nummer 0530 ist je Behandlungstag nur einmal berechnungsfähig. Der Zuschlag nach der Nummer 0530 ist neben den Zuschlägen nach den Nummern 0500 bis 0520 nicht berechnungsfähig.",
			"punkte": 2200,
			"abschnitt": "L Zuschläge"
		}
	]
};
var goae_zahnarzt_default = {
	name: "GOÄ 1996 (für Zahnärzte geöffnete Abschnitte nach § 6 Abs. 2 GOZ)",
	quelle: "https://www.gesetze-im-internet.de/go__1982/anlage.html",
	stand: "2026-10",
	punktwert: .0582873,
	hinweis: "Nur die nach § 6 Abs. 2 GOZ für Zahnärzte zugänglichen Nummern. Faktorrahmen nach § 5 GOÄ: persönliche Leistungen 1,0–3,5 (Schwelle 2,3); Abschnitte A/E/O 1,0–2,5 (Schwelle 1,8); Nr. 250 höchstens 2,5; Zuschlag 5377 nur einfacher Satz.",
	eintraege: [
		{
			"nr": "250",
			"text": "Blutentnahme mittels Spritze, Kanüle oder Katheter aus der Vene",
			"punkte": 40,
			"abschnitt": "C II Blutentnahmen",
			"kat": "C",
			"maxFaktor": 2.5,
			"schwelle": 1.8
		},
		{
			"nr": "251",
			"text": "Blutentnahme mittels Spritze oder Kanüle aus der Arterie",
			"punkte": 60,
			"abschnitt": "C II Blutentnahmen",
			"kat": "C",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "252",
			"text": "Injektion, subkutan, submukös, intrakutan oder intramuskulär",
			"punkte": 40,
			"abschnitt": "C II Injektionen",
			"kat": "C",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "253",
			"text": "Injektion, intravenös",
			"punkte": 70,
			"abschnitt": "C II Injektionen",
			"kat": "C",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "255",
			"text": "Injektion, intraartikulär oder perineural",
			"punkte": 95,
			"abschnitt": "C II Injektionen",
			"kat": "C",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "256",
			"text": "Injektion in den Periduralraum",
			"punkte": 185,
			"abschnitt": "C II Injektionen",
			"kat": "C",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "271",
			"text": "Infusion, intravenös, bis zu 30 Minuten Dauer",
			"punkte": 120,
			"abschnitt": "C II Infusionen",
			"kat": "C",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "272",
			"text": "Infusion, intravenös, von mehr als 30 Minuten Dauer",
			"punkte": 180,
			"abschnitt": "C II Infusionen",
			"kat": "C",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "298",
			"text": "Entnahme und gegebenenfalls Aufbereitung von Abstrichmaterial zur mikrobiologischen Untersuchung – gegebenenfalls einschließlich Fixierung –",
			"punkte": 40,
			"abschnitt": "C II Abstrichentnahmen",
			"kat": "C",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2381",
			"text": "Einfache Hautlappenplastik",
			"punkte": 370,
			"abschnitt": "L V",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2382",
			"text": "Schwierige Hautlappenplastik oder Spalthauttransplantation",
			"punkte": 739,
			"abschnitt": "L V",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2386",
			"text": "Schleimhauttransplantation – einschließlich operativer Unterminierung der Entnahmestelle und plastischer Deckung –",
			"punkte": 688,
			"abschnitt": "L V",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2440",
			"text": "Operative Entfernung eines Naevus flammeus, je Sitzung",
			"punkte": 800,
			"abschnitt": "L VI",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2442",
			"text": "Implantation alloplastischen Materials zur Weichteilunterfütterung, als selbständige Leistung",
			"punkte": 900,
			"abschnitt": "L VI",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2670",
			"text": "Operative Entfernung eines Schlotterkammes oder einer Fibromatose, je Kieferhälfte oder Frontzahnbereich, als selbständige Leistung",
			"punkte": 500,
			"abschnitt": "L VII",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2671",
			"text": "Operative Entfernung eines Schlotterkammes oder einer Fibromatose, je Kieferhälfte oder Frontzahnbereich, in Verbindung mit Nr. 2675 oder 2676",
			"punkte": 300,
			"abschnitt": "L VII",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2675",
			"text": "Partielle Vestibulum- oder Mundbodenplastik oder große Tuberplastik, je Kieferhälfte oder Frontzahnbereich",
			"punkte": 850,
			"abschnitt": "L VII",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2676",
			"text": "Totale Mundboden- oder Vestibulumplastik zur Formung des Prothesenlagers mit partieller Ablösung der Mundbodenmuskulatur, je Kiefer",
			"punkte": 2200,
			"abschnitt": "L VII",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2730",
			"text": "Operative Maßnahmen zur Lagerbildung beim Aufbau des Alveolarfortsatzes, je Kieferhälfte oder Frontzahnbereich",
			"punkte": 500,
			"abschnitt": "L IX",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "2732",
			"text": "Operation zur Lagerbildung für Knochen oder Knorpel bei ausgedehnten Kieferdefekten",
			"punkte": 2e3,
			"abschnitt": "L IX",
			"kat": "L",
			"maxFaktor": 3.5,
			"schwelle": 2.3
		},
		{
			"nr": "5000",
			"text": "Röntgen Zähne, je Projektion",
			"punkte": 50,
			"abschnitt": "O I Strahlendiagnostik",
			"kat": "O",
			"maxFaktor": 2.5,
			"schwelle": 1.8
		},
		{
			"nr": "5002",
			"text": "Panoramaaufnahme(n) eines Kiefers",
			"punkte": 250,
			"abschnitt": "O I Strahlendiagnostik",
			"kat": "O",
			"maxFaktor": 2.5,
			"schwelle": 1.8
		},
		{
			"nr": "5004",
			"text": "Panoramaschichtaufnahme der Kiefer (OPG)",
			"punkte": 400,
			"abschnitt": "O I Strahlendiagnostik",
			"kat": "O",
			"maxFaktor": 2.5,
			"schwelle": 1.8
		},
		{
			"nr": "5010",
			"text": "Röntgen Gesichtsschädelteile, jeweils in zwei Ebenen",
			"punkte": 180,
			"abschnitt": "O I Strahlendiagnostik",
			"kat": "O",
			"maxFaktor": 2.5,
			"schwelle": 1.8
		},
		{
			"nr": "5095",
			"text": "Schädelteile in Spezialprojektionen, je Teil",
			"punkte": 200,
			"abschnitt": "O I Strahlendiagnostik",
			"kat": "O",
			"maxFaktor": 2.5,
			"schwelle": 1.8
		},
		{
			"nr": "5370",
			"text": "Computergesteuerte Tomographie im Kopfbereich (DVT), gegebenenfalls einschließlich des kranio-zervikalen Übergangs",
			"punkte": 2e3,
			"abschnitt": "O I Strahlendiagnostik",
			"kat": "O",
			"maxFaktor": 2.5,
			"schwelle": 1.8
		},
		{
			"nr": "5377",
			"text": "Zuschlag für computergesteuerte Analyse – einschließlich speziell nachfolgender 3D-Rekonstruktion –",
			"punkte": 800,
			"abschnitt": "O I Strahlendiagnostik",
			"kat": "O-fix",
			"maxFaktor": 1,
			"schwelle": 1
		}
	]
};
var beb_itz_2024_default = {
	typ: "beb",
	name: "BEB Preisliste ITZ GmbH (Stand 23.01.2024)",
	gueltigAb: "2024-01-23",
	quelle: "https://itzgmbh.de/wp-content/uploads/BEB-2024.pdf",
	hinweis: "Per Texterkennung aus einem Scan übernommen – Preise vor Verwendung prüfen.",
	eintraege: [
		{
			"nr": "0001",
			"text": "Modell aus Hartgips",
			"preis": 10.4
		},
		{
			"nr": "0002",
			"text": "Modell aus Superhartgips",
			"preis": 10.4
		},
		{
			"nr": "0004",
			"text": "Modell nach Überabformung",
			"preis": 23.64
		},
		{
			"nr": "0007",
			"text": "Kontrollmodell",
			"preis": 10.4
		},
		{
			"nr": "0009",
			"text": "Modell aus Kunststoff",
			"preis": 23
		},
		{
			"nr": "0010",
			"text": "Spezialmodell",
			"preis": 23
		},
		{
			"nr": "0018",
			"text": "Modell bei Implantatversorgung",
			"preis": 10.4
		},
		{
			"nr": "0019",
			"text": "Frässmodell",
			"preis": 16
		},
		{
			"nr": "0020",
			"text": "Remontage-Modell",
			"preis": 10.4
		},
		{
			"nr": "0021",
			"text": "Sägemodell",
			"preis": 23
		},
		{
			"nr": "0023",
			"text": "Modell für Einzelstümpfe",
			"preis": 10.4
		},
		{
			"nr": "0024",
			"text": "Verwendung Kunststoff",
			"preis": 19.64
		},
		{
			"nr": "0029",
			"text": "Keramikstufe",
			"preis": 40
		},
		{
			"nr": "0033",
			"text": "Bissgabel nach Gauge",
			"preis": 15
		},
		{
			"nr": "0036",
			"text": "Versandkosten bei Datenlieferung",
			"preis": 8.52
		},
		{
			"nr": "0037",
			"text": "Konstruieren und Fräsen einer Basis aus Kunststoff",
			"preis": 102
		},
		{
			"nr": "0039",
			"text": "Interimsprothese aus Polyamid",
			"preis": 199
		},
		{
			"nr": "0040",
			"text": "Interimsprothese aus Polyamid",
			"preis": 249
		},
		{
			"nr": "0042",
			"text": "Fräsen eines Sekundärteils NEM",
			"preis": 138
		},
		{
			"nr": "0105",
			"text": "Stumpf aus Kunststoff",
			"preis": 8.5
		},
		{
			"nr": "0217",
			"text": "Stumpf unter Mikroskop vorbereiten",
			"preis": 5.5
		},
		{
			"nr": "0221",
			"text": "Hilfsteil in Abdruck",
			"preis": 9
		},
		{
			"nr": "0223",
			"text": "Zahnfleischmaske, abnehmbar je Kieferhälfte",
			"preis": 31
		},
		{
			"nr": "0224",
			"text": "Modellimplantat repositionieren",
			"preis": 11
		},
		{
			"nr": "0225",
			"text": "Implantatpfosten auf Modellierimplantat aufschrauben",
			"preis": 6.2
		},
		{
			"nr": "0241",
			"text": "Dublieren eines Modelles oder Modellteiles",
			"preis": 21.33
		},
		{
			"nr": "0243",
			"text": "Dublieren eines Einzelstumpfes",
			"preis": 13.66
		},
		{
			"nr": "0251",
			"text": "Angeliefertes Modell untersockeln",
			"preis": 10.4
		},
		{
			"nr": "0252",
			"text": "Angeliefertes Modell oder Zahnkranz bearbeiten",
			"preis": 10.4
		},
		{
			"nr": "0253",
			"text": "Split-Cast Sockel an Modell: Erklärung und Preis",
			"preis": 10.4
		},
		{
			"nr": "0301",
			"text": "Zahn vermessen",
			"preis": 5
		},
		{
			"nr": "0302",
			"text": "Modell vermessen",
			"preis": 7
		},
		{
			"nr": "0307",
			"text": "Radieren des Abschlussrandes",
			"preis": 11
		},
		{
			"nr": "0401",
			"text": "Montage eines Modellpaares in Fixator",
			"preis": 13.07
		},
		{
			"nr": "0402",
			"text": "Modellmontage in Mittelwertartikulator I",
			"preis": 14.75
		},
		{
			"nr": "0403",
			"text": "Modellmontage in Mittelwertartikulator II",
			"preis": 16.2
		},
		{
			"nr": "0404",
			"text": "Modellmontage in Mittelwert nach Gesichtsbogen",
			"preis": 26.5
		},
		{
			"nr": "0405",
			"text": "Modellmontage in individuellen Artikulator II",
			"preis": 16.2
		},
		{
			"nr": "0408",
			"text": "Montage eines Gegenkiefermodelles",
			"preis": 7.7
		},
		{
			"nr": "0511",
			"text": "Mehraufwand für Einstellen nach Zentrikregistrat",
			"preis": 7.7
		},
		{
			"nr": "0521",
			"text": "Auswerten eines Registrates",
			"preis": 25.5
		},
		{
			"nr": "0522",
			"text": "Frontzahnführungsteller individuell",
			"preis": 26.5
		},
		{
			"nr": "0523",
			"text": "Pfeilwinkel auf Frontzahnführungsteller übertragen",
			"preis": 26.5
		},
		{
			"nr": "0601",
			"text": "Modellpaar trimmen, okklusionsbezogen",
			"preis": 11
		},
		{
			"nr": "0602",
			"text": "Modellpaar sockeln, dreidimensional",
			"preis": 11
		},
		{
			"nr": "0701",
			"text": "Versand je Versandgang",
			"preis": 8.52
		},
		{
			"nr": "0702",
			"text": "Sonderversand oder Fahrtkosten",
			"preis": 25
		},
		{
			"nr": "0703",
			"text": "Versand UPS Express bis 12:00",
			"preis": 14
		},
		{
			"nr": "0705",
			"text": "nachträgliche Farbanpassung im Labor",
			"preis": 58
		},
		{
			"nr": "0706",
			"text": "Foto oder Video Dokumentation",
			"preis": 10
		},
		{
			"nr": "0710",
			"text": "Eilterminzuschlag",
			"preis": 1
		},
		{
			"nr": "0721",
			"text": "Zeiteinheit, Zahntechniker-Meister je 15 Min",
			"preis": 28.5
		},
		{
			"nr": "0722",
			"text": "Zeiteinheit, Zahntechniker je 15 Min",
			"preis": 20
		},
		{
			"nr": "0723",
			"text": "Zahnfarbenbestimmung im Labor",
			"preis": 30
		},
		{
			"nr": "0724",
			"text": "Zahnfarbenbestimmung in der Praxis incl. Anfahrt",
			"preis": 45
		},
		{
			"nr": "0731",
			"text": "Individuelle Namenskennzeichnung",
			"preis": 35
		},
		{
			"nr": "0732",
			"text": "Desinfektion",
			"preis": 1.8
		},
		{
			"nr": "0801",
			"text": "Prothetische Planung",
			"preis": 15
		},
		{
			"nr": "0802",
			"text": "Prothetische Alternativplanung",
			"preis": 10
		},
		{
			"nr": "0811",
			"text": "Modellanalyse für Prothetik",
			"preis": 15
		},
		{
			"nr": "0821",
			"text": "Kostenvoranschlag",
			"preis": 15
		},
		{
			"nr": "0833",
			"text": "Set-Up/WaxUp/MockUp - je Zahn",
			"preis": 19
		},
		{
			"nr": "1002",
			"text": "Basis für Bissregistrierung",
			"preis": 31.68
		},
		{
			"nr": "1003",
			"text": "Basis für Stützstiftregistrat",
			"preis": 31.68
		},
		{
			"nr": "1005",
			"text": "Funktionslöffel aus Kunststoff",
			"preis": 31.68
		},
		{
			"nr": "1006",
			"text": "Individueller Löffel aus Kunststoff",
			"preis": 31.68
		},
		{
			"nr": "1007",
			"text": "Basis für Aufstellung",
			"preis": 31.68
		},
		{
			"nr": "1019",
			"text": "Basis für neue Abdrucknahme vorbereiten",
			"preis": 12
		},
		{
			"nr": "1108",
			"text": "Löffel für Implantatversorgung",
			"preis": 31.68
		},
		{
			"nr": "1111",
			"text": "Bisswall aus Wachs, auf Basis",
			"preis": 9.9
		},
		{
			"nr": "1113",
			"text": "Bisswall aus Kunststoff, auf Basis",
			"preis": 9.9
		},
		{
			"nr": "1115",
			"text": "Registrierplatte und -stift auf Basen",
			"preis": 39
		},
		{
			"nr": "1122",
			"text": "Wachsplatte für zentrische Bissnahme im Artikulator vorbereiten",
			"preis": 35
		},
		{
			"nr": "1201",
			"text": "Übertragungskappe aus Kunststoff",
			"preis": 12
		},
		{
			"nr": "1223",
			"text": "Basis für Bohrschablone bei Implantat",
			"preis": 31.68
		},
		{
			"nr": "1225",
			"text": "Implantat-Kontrollschablone",
			"preis": 25
		},
		{
			"nr": "1251",
			"text": "Vorwall",
			"preis": 8
		},
		{
			"nr": "1311",
			"text": "Röntgenkugel oder Bohrhülse positionieren",
			"preis": 7
		},
		{
			"nr": "1341",
			"text": "Walkhoffsche Tastkugel an Bißschablone",
			"preis": 12
		},
		{
			"nr": "1401",
			"text": "Provisorische Krone, Brückenglied, Stiftzahn, Onlay, Inlay aus Kunststoff",
			"preis": 35
		},
		{
			"nr": "1402",
			"text": "Provisorische Krone, Brückenglied, Stiftzahn, Onlay, Inlay aus Metall",
			"preis": 35
		},
		{
			"nr": "1403",
			"text": "Metallarmierung für provisorische Versorgung",
			"preis": 48
		},
		{
			"nr": "1404",
			"text": "Formteil für provisorische Versorgung",
			"preis": 35
		},
		{
			"nr": "1405",
			"text": "Formteil Kunststoff (Schleifkäppchen)",
			"preis": 19.2
		},
		{
			"nr": "1406",
			"text": "Reiseprothese aus PMMA (monochrome)",
			"preis": 190
		},
		{
			"nr": "1601",
			"text": "Allergietestplättchen",
			"preis": 11
		},
		{
			"nr": "1902",
			"text": "Aufwand bei Suprastruktur",
			"preis": 28.5
		},
		{
			"nr": "2001",
			"text": "Wurzelstift gegossen",
			"preis": 108.67
		},
		{
			"nr": "2011",
			"text": "Wurzelkappe",
			"preis": 108.67
		},
		{
			"nr": "2012",
			"text": "Wurzelstiftkappe",
			"preis": 108.67
		},
		{
			"nr": "2033",
			"text": "Individuelles Abutment",
			"preis": 95.31
		},
		{
			"nr": "2035",
			"text": "Gusstufenkrone oder Stegkappe auf Implantataufbau nach",
			"preis": 115.8
		},
		{
			"nr": "2101",
			"text": "Krone gegossen/gefräst",
			"preis": 115.8
		},
		{
			"nr": "2104",
			"text": "Dreiviertelkrone gegossen/gefräst",
			"preis": 115.8
		},
		{
			"nr": "2121",
			"text": "Krone gegossen / gefräst für Keramik/Kompositverblendung",
			"preis": 95
		},
		{
			"nr": "2126",
			"text": "Dreiviertelkrone gegossen/gefräst für Keramik/Kompositverblendung",
			"preis": 85.1
		},
		{
			"nr": "2154",
			"text": "Dreiviertelkrone gefräst",
			"preis": 80
		},
		{
			"nr": "2155",
			"text": "Anker gegossen/gefräst, für Klebebrücke",
			"preis": 114.38
		},
		{
			"nr": "2181",
			"text": "Stegkappe",
			"preis": 115.8
		},
		{
			"nr": "2251",
			"text": "Seitenzahnkrone aus Keramik gefräst (vollanatomisch)",
			"preis": 110
		},
		{
			"nr": "2252",
			"text": "Frontzahnkrone aus Keramik gefräst (vollanatomisch)",
			"preis": 135
		},
		{
			"nr": "2281",
			"text": "Krone aus Keramik gefräst",
			"preis": 110
		},
		{
			"nr": "2301",
			"text": "Inlay einflächig",
			"preis": 90
		},
		{
			"nr": "2302",
			"text": "Inlay zweiflächig",
			"preis": 90
		},
		{
			"nr": "2303",
			"text": "Inlay dreiflächig",
			"preis": 90
		},
		{
			"nr": "2304",
			"text": "Inlay mehrflächig",
			"preis": 115.8
		},
		{
			"nr": "2351",
			"text": "Brückenglied gefräßt Seitenzahn (vollanatomisch)",
			"preis": 110
		},
		{
			"nr": "2352",
			"text": "Brückenglied gefräßt Frontzahn (vollanatomisch)",
			"preis": 135
		},
		{
			"nr": "2361",
			"text": "Brückenglied gegossen/gefräst Metall",
			"preis": 98
		},
		{
			"nr": "2534",
			"text": "Teilkrone Keramik",
			"preis": 116.8
		},
		{
			"nr": "2551",
			"text": "Inlay aus Keramik, gefräst, einflächig",
			"preis": 78
		},
		{
			"nr": "2552",
			"text": "Inlay aus Keramik, gefräst, zweiflächig",
			"preis": 87
		},
		{
			"nr": "2553",
			"text": "Inlay aus Keramik, gefräst, dreiflächig",
			"preis": 98
		},
		{
			"nr": "2554",
			"text": "Inlay aus Keramik, gefräst, mehrflächig",
			"preis": 115.8
		},
		{
			"nr": "2601",
			"text": "Teil-Verblendungaus Komposite",
			"preis": 103.4
		},
		{
			"nr": "2602",
			"text": "mehrflachige Verblendungaus Komposite",
			"preis": 105.4
		},
		{
			"nr": "2603",
			"text": "Verblendschale aus Kunststoff",
			"preis": 72
		},
		{
			"nr": "2611",
			"text": "Teil-Verblendung aus Keramik",
			"preis": 132.2
		},
		{
			"nr": "2612",
			"text": "Mehrflächige Verblendung aus Keramik",
			"preis": 135.21
		},
		{
			"nr": "2653",
			"text": "Veneer aus Keramik",
			"preis": 135.21
		},
		{
			"nr": "2663",
			"text": "Verblendschale aus Komposit",
			"preis": 105.4
		},
		{
			"nr": "2671",
			"text": "Papille aus Komposite",
			"preis": 29
		},
		{
			"nr": "2672",
			"text": "Zahnfleisch aus Komposite",
			"preis": 29
		},
		{
			"nr": "2676",
			"text": "Papille aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2677",
			"text": "Zahnfleisch aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2678",
			"text": "Wurzelpontic aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2682",
			"text": "Papille aus Komposit",
			"preis": 29
		},
		{
			"nr": "2901",
			"text": "Stiftaufbau in vorhandene Krone einarbeiten",
			"preis": 35
		},
		{
			"nr": "2904",
			"text": "Angelieferte Modellation gießen/pressen",
			"preis": 29
		},
		{
			"nr": "2907",
			"text": "Brückenteilungsgeschiebe, individuell",
			"preis": 260
		},
		{
			"nr": "2909",
			"text": "Individuelles Charakterisieren eines Kunststoffzahnes",
			"preis": 20
		},
		{
			"nr": "2911",
			"text": "Krone/Brückenglied für Klammer vorbereiten",
			"preis": 21.13
		},
		{
			"nr": "2912",
			"text": "Krone/Brückenglied, Inlay passend für vorhandene Prothese arbeiten",
			"preis": 21.13
		},
		{
			"nr": "2913",
			"text": "Umgehungsbügel bei Diastema",
			"preis": 15
		},
		{
			"nr": "2918",
			"text": "Krone/Brückenglied für Klammer vorbereiten",
			"preis": 21.13
		},
		{
			"nr": "2922",
			"text": "Krone/Inlay/Brückenglied aufpassen",
			"preis": 7
		},
		{
			"nr": "2941",
			"text": "Individuell charakterisieren, Kunststoff",
			"preis": 15
		},
		{
			"nr": "2945",
			"text": "Individuell charakterisieren, Komposit",
			"preis": 15
		},
		{
			"nr": "2951",
			"text": "Individuell charakterisieren, Keramik",
			"preis": 21
		},
		{
			"nr": "2953",
			"text": "Fräsen je Glied bei Datenlieferung Material Katana YML",
			"preis": 39
		},
		{
			"nr": "2954",
			"text": "Fräsen je Glied bei Datenanlieferung - Material Katana MLo.ä.",
			"preis": 21.5
		},
		{
			"nr": "2955",
			"text": "Fräsen je Glied bei Datenanlieferung - Material NEM",
			"preis": 21.5
		},
		{
			"nr": "2956",
			"text": "Fräsen je Glied bei Datenanlieferung - Material PMMA",
			"preis": 21.5
		},
		{
			"nr": "2957",
			"text": "Fräsen einer Aufbisschiene bei Datenanlieferung (PMMA)",
			"preis": 53
		},
		{
			"nr": "2958",
			"text": "Fräsen einer Aufbisschiene bei Datenlieferung (Nylon)",
			"preis": 63
		},
		{
			"nr": "2959",
			"text": "Konst. und Fräsen einer Aufbisschiene bei Modellanlieferung (Nylon)",
			"preis": 73
		},
		{
			"nr": "2960",
			"text": "Konst. und Fräsen einer Aufbisschiene bei Modellanlieferung (PMMA)",
			"preis": 83
		},
		{
			"nr": "2961",
			"text": "Konst. und Fräsen KuB (NEM)",
			"preis": 32
		},
		{
			"nr": "2962",
			"text": "Konst. und Fräsen KuB aus (PMMA)",
			"preis": 29
		},
		{
			"nr": "2963",
			"text": "Krone/Inlay/Brückenglied aufpassen",
			"preis": 7
		},
		{
			"nr": "2964",
			"text": "Konst. und Fräsen KuB aus (ZrO2 Mono)",
			"preis": 29
		},
		{
			"nr": "2965",
			"text": "Konst. und Fräsen KuB aus (ZrO2 Multi)",
			"preis": 49
		},
		{
			"nr": "2966",
			"text": "Konst. und Fräsen KuB aus (Li2Silikat)",
			"preis": 69
		},
		{
			"nr": "2967",
			"text": "Fräsen je Glied bei Datenlieferung - Material (e.max)",
			"preis": 59
		},
		{
			"nr": "2972",
			"text": "Aufwandzu Suprastrukturbeiverschraubbarem Implantat",
			"preis": 28
		},
		{
			"nr": "2981",
			"text": "NEM Zuschlag",
			"preis": 20.46
		},
		{
			"nr": "2983",
			"text": "Titan verarbeiten bei festsitzendem Zahnersatz",
			"preis": 20.46
		},
		{
			"nr": "2984",
			"text": "Wax UP je Zahn",
			"preis": 13
		},
		{
			"nr": "3001",
			"text": "Teleskopkrone, primär/Sekundär",
			"preis": 210
		},
		{
			"nr": "3004",
			"text": "Teleskopkrone",
			"preis": 320
		},
		{
			"nr": "3021",
			"text": "Individuelles Geschiebe",
			"preis": 290
		},
		{
			"nr": "3023",
			"text": "Konfektioniertes Geschiebe, Gelenk, Anker einarbeiten",
			"preis": 135
		},
		{
			"nr": "3024",
			"text": "Lager für Raste",
			"preis": 35
		},
		{
			"nr": "3025",
			"text": "Umlaufraste für Schubverteilungsarm",
			"preis": 35
		},
		{
			"nr": "3027",
			"text": "Locator/Kugelanker in proth. einarbeiten",
			"preis": 130
		},
		{
			"nr": "3031",
			"text": "Individueller Steg, Grundeinheit",
			"preis": 95
		},
		{
			"nr": "3032",
			"text": "Individueller Steg, Längeneinheit",
			"preis": 15
		},
		{
			"nr": "3104",
			"text": "Stegfräsung",
			"preis": 110
		},
		{
			"nr": "3105",
			"text": "gefrästes Lager",
			"preis": 70
		},
		{
			"nr": "3215",
			"text": "Schubverteilungsarm",
			"preis": 59
		},
		{
			"nr": "3221",
			"text": "Individuelles Steggeschiebe",
			"preis": 260
		},
		{
			"nr": "3322",
			"text": "Steggeschiebe individuell, an/in Metallbasis",
			"preis": 54.96
		},
		{
			"nr": "3401",
			"text": "Drehriegel",
			"preis": 235
		},
		{
			"nr": "3403",
			"text": "Schwenkriegel",
			"preis": 235
		},
		{
			"nr": "3405",
			"text": "Schub- oder Steckriegel",
			"preis": 235
		},
		{
			"nr": "3521",
			"text": "Konfektionssteg Grundeinheit",
			"preis": 89
		},
		{
			"nr": "3523",
			"text": "Konfektionssteg Längeneinheit",
			"preis": 19
		},
		{
			"nr": "3621",
			"text": "Konfektions-Steglasche an/in Kunststoffbasis",
			"preis": 65
		},
		{
			"nr": "3623",
			"text": "Konfektions-Steglasche an/in Metallbasis",
			"preis": 75
		},
		{
			"nr": "3903",
			"text": "Friktionsstift einarbeiten",
			"preis": 32.5
		},
		{
			"nr": "3905",
			"text": "Verschraubung/Verbolzung",
			"preis": 102
		},
		{
			"nr": "3906",
			"text": "Verschraubung Implantat",
			"preis": 33
		},
		{
			"nr": "3931",
			"text": "Lösungsknopf für Verbindungselement",
			"preis": 31
		},
		{
			"nr": "4001",
			"text": "Metallbasis",
			"preis": 175
		},
		{
			"nr": "4007",
			"text": "Gitter total",
			"preis": 110
		},
		{
			"nr": "4008",
			"text": "Bügel",
			"preis": 110
		},
		{
			"nr": "4101",
			"text": "Einarmige Klammer gebogen",
			"preis": 12.8
		},
		{
			"nr": "4103",
			"text": "Kralle gebogen",
			"preis": 12.8
		},
		{
			"nr": "4106",
			"text": "Fortlaufende Klammer je Zahn gebogen",
			"preis": 12.8
		},
		{
			"nr": "4107",
			"text": "Gegenlager gebogen",
			"preis": 12.8
		},
		{
			"nr": "4111",
			"text": "Zweiarmige gefräste Klammer (Valplast)",
			"preis": 63
		},
		{
			"nr": "4112",
			"text": "Zweiarmige Klammer mit Auflage gebogen",
			"preis": 25.22
		},
		{
			"nr": "4119",
			"text": "Bonwill-Klammer gebogen",
			"preis": 25.22
		},
		{
			"nr": "4121",
			"text": "Ney Stiel gebogen",
			"preis": 15
		},
		{
			"nr": "4122",
			"text": "Auflage gegossen",
			"preis": 18.33
		},
		{
			"nr": "4201",
			"text": "gossene Retention",
			"preis": 69
		},
		{
			"nr": "4202",
			"text": "Gegossenes Basisteil",
			"preis": 96.54
		},
		{
			"nr": "4203",
			"text": "Retention an Sekundärteil",
			"preis": 49
		},
		{
			"nr": "4208",
			"text": "Retention gebogen",
			"preis": 50.44
		},
		{
			"nr": "4401",
			"text": "Einarmige Klammer gegossen",
			"preis": 18.33
		},
		{
			"nr": "4411",
			"text": "Zweiarmige Klammer gegossen",
			"preis": 21
		},
		{
			"nr": "4412",
			"text": "Zweiarmige Klammer mit Auflage gegossen",
			"preis": 30.97
		},
		{
			"nr": "4413",
			"text": "Bonwillkammer gegossen",
			"preis": 76.32
		},
		{
			"nr": "4421",
			"text": "Bearbeiten eines Implantataufbaus",
			"preis": 41
		},
		{
			"nr": "4431",
			"text": "Federarm inklusive Federarmlager",
			"preis": 17.9
		},
		{
			"nr": "4902",
			"text": "Rückenschutzplatte",
			"preis": 55.24
		},
		{
			"nr": "4903",
			"text": "Ruckenschutzplatte",
			"preis": 55.24
		},
		{
			"nr": "4905",
			"text": "Metallzahn",
			"preis": 55.24
		},
		{
			"nr": "4907",
			"text": "Metallfläche als Tuberabdeckung",
			"preis": 24
		},
		{
			"nr": "4941",
			"text": "Lösungsknopf für Friktionsprothese",
			"preis": 13
		},
		{
			"nr": "4951",
			"text": "Klammer einzeln gegossen",
			"preis": 27.2
		},
		{
			"nr": "5211",
			"text": "Lötvergoldung",
			"preis": 30
		},
		{
			"nr": "5307",
			"text": "Konditionieren je Zahn / Flügel",
			"preis": 20.9
		},
		{
			"nr": "6001",
			"text": "Aufstellen Grundeinheit",
			"preis": 41.6
		},
		{
			"nr": "6002",
			"text": "Aufstellen je Zahneinheit auf Wachs oder Kunststoffbasis",
			"preis": 2.69
		},
		{
			"nr": "6003",
			"text": "Aufstellen je Zahneinheit auf Metallbasis",
			"preis": 3.26
		},
		{
			"nr": "6021",
			"text": "Übertragen einer Wachsaufstellung auf Metallbasis",
			"preis": 2.22
		},
		{
			"nr": "6121",
			"text": "Zuschlag für Aufstellung bei Anwesenheit des Patienten",
			"preis": 60.5
		},
		{
			"nr": "6301",
			"text": "Grundeinheit Fertigstellung mit Kunststoffbasis",
			"preis": 69.84
		},
		{
			"nr": "6302",
			"text": "Fertigstellen mit Kunststoffbasis, je Zahneinheit",
			"preis": 4.86
		},
		{
			"nr": "6311",
			"text": "Grundeinheit Fertigstellung auf Metallbasis",
			"preis": 69.84
		},
		{
			"nr": "6312",
			"text": "Fertigstellen auf Metallbasis, je Zahneinheit",
			"preis": 4.86
		},
		{
			"nr": "6401",
			"text": "Transparente Gaumenplatte",
			"preis": 52.54
		},
		{
			"nr": "6405",
			"text": "Verarbeitung Weichkunststoff",
			"preis": 75.72
		},
		{
			"nr": "6412",
			"text": "Sonderkunststoff verarbeiten",
			"preis": 75.72
		},
		{
			"nr": "6414",
			"text": "Unterfütterbarer Abschlussrand",
			"preis": 27.62
		},
		{
			"nr": "6431",
			"text": "Befestigung eines Zahnes mit zahnfarbenem Kunststoff, Pontic",
			"preis": 12.5
		},
		{
			"nr": "6432",
			"text": "Herstellen eines Zahnes aus zahnfarbenem Kunststoff",
			"preis": 21.5
		},
		{
			"nr": "6433",
			"text": "Kauflacheauszahnfarbenem Kunststoff",
			"preis": 12.5
		},
		{
			"nr": "6451",
			"text": "Zahnfleischklammer",
			"preis": 23
		},
		{
			"nr": "6452",
			"text": "Pelottenklammer",
			"preis": 23
		},
		{
			"nr": "6501",
			"text": "Netz einarbeiten",
			"preis": 90
		},
		{
			"nr": "6502",
			"text": "Gußgitter einarbeiten",
			"preis": 90
		},
		{
			"nr": "6503",
			"text": "Konfektioniertes Metallgitter anpassen und einarbeiten",
			"preis": 70
		},
		{
			"nr": "6504",
			"text": "Draht einarbeiten",
			"preis": 36.54
		},
		{
			"nr": "6505",
			"text": "Bügel einarbeiten",
			"preis": 70
		},
		{
			"nr": "6506",
			"text": "Individuelle Beschwerungseinlage einarbeiten",
			"preis": 70
		},
		{
			"nr": "6509",
			"text": "Retention für Einzelzahn einarbeiten",
			"preis": 26.39
		},
		{
			"nr": "6521",
			"text": "Metallfacette einarbeiten",
			"preis": 36.54
		},
		{
			"nr": "6905",
			"text": "Primärteleskop aus Keramik Zuschlag je Teleskop",
			"preis": 35.99
		},
		{
			"nr": "6906",
			"text": "Individueller Implantataufbau Keramik",
			"preis": 70.91
		},
		{
			"nr": "6907",
			"text": "Veneer/Inlay aus Keramik",
			"preis": 115
		},
		{
			"nr": "6908",
			"text": "Provisorische Krone/Brücke je Glied (PMMA)",
			"preis": 33
		},
		{
			"nr": "6912",
			"text": "Versand UPS Express",
			"preis": 14
		},
		{
			"nr": "7001",
			"text": "Basis für Einzelkiefergerät",
			"preis": 64.94
		},
		{
			"nr": "7002",
			"text": "Basis für bimaxiläres Gerät",
			"preis": 129
		},
		{
			"nr": "7090",
			"text": "BetterSmile-Schiene Planungspauschale",
			"preis": 90
		},
		{
			"nr": "7091",
			"text": "BetterSmile-Modell und Regulierung-Schiene (Paar)",
			"preis": 75
		},
		{
			"nr": "7104",
			"text": "Dreiecksklammer",
			"preis": 12.45
		},
		{
			"nr": "7105",
			"text": "Pfeilklammer",
			"preis": 11.6
		},
		{
			"nr": "7106",
			"text": "Adams-Klammer",
			"preis": 16.17
		},
		{
			"nr": "7122",
			"text": "Auflage",
			"preis": 12.45
		},
		{
			"nr": "7201",
			"text": "Frontaler oder lateraler Aufbiß, hart",
			"preis": 15.67
		},
		{
			"nr": "7202",
			"text": "Frontaler oder lateraler Aufbiß, weich",
			"preis": 15.67
		},
		{
			"nr": "7301",
			"text": "Labialbogen",
			"preis": 27.47
		},
		{
			"nr": "7501",
			"text": "Trennen einer Basis und Funktionsfähigmachen der Schraube",
			"preis": 12
		},
		{
			"nr": "7503",
			"text": "Trennen einer Basis ohne Schraube",
			"preis": 8
		},
		{
			"nr": "7504",
			"text": "Funktionsfähigmachen einer Schraube ohne Trennen der Basis",
			"preis": 8
		},
		{
			"nr": "7601",
			"text": "Aufbisschiene adjustiert",
			"preis": 110.7
		},
		{
			"nr": "7602",
			"text": "Aufbisschiene nicht adjustiert",
			"preis": 80.19
		},
		{
			"nr": "7606",
			"text": "Bleaching Schiene",
			"preis": 52.95
		},
		{
			"nr": "7607",
			"text": "Fluoridierungsschiene",
			"preis": 59.69
		},
		{
			"nr": "7621",
			"text": "Aufbissschiene adjustiert",
			"preis": 110.7
		},
		{
			"nr": "7801",
			"text": "Sportschutz aus Weichkunststoff",
			"preis": 170
		},
		{
			"nr": "8002",
			"text": "Basis unterfüttern",
			"preis": 79.14
		},
		{
			"nr": "8003",
			"text": "Basis erneuern",
			"preis": 79.14
		},
		{
			"nr": "8006",
			"text": "Einarbeiten einer Modellgussbasis in vorhandene Kunststoffprothese",
			"preis": 70
		},
		{
			"nr": "8011",
			"text": "Instandsetzen einer Prothese, Kunststoffbasis oder KFO/FKO Gerät, Grundeinheit",
			"preis": 29.14
		},
		{
			"nr": "8021",
			"text": "Leistungseinheit, Sprung aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8022",
			"text": "Leistungseinheit, Bruch aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8023",
			"text": "Leistungseinheit, Wiederbefestigung Zahn",
			"preis": 12.55
		},
		{
			"nr": "8024",
			"text": "Leistungseinheit, Erneuerung Zahn",
			"preis": 12.55
		},
		{
			"nr": "8025",
			"text": "Leistungseinheit, Klammer einarbeiten",
			"preis": 12.55
		},
		{
			"nr": "8027",
			"text": "Leistungseinheit, Basisteil aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8028",
			"text": "Leistungseinheit, Sprung aus Metall",
			"preis": 12.55
		},
		{
			"nr": "8029",
			"text": "Leistungseinheit, Bruch aus Metall",
			"preis": 12.55
		},
		{
			"nr": "8030",
			"text": "Leistungseinheit, Kunststoffsattel lösen und wiederbefestigen",
			"preis": 12.55
		},
		{
			"nr": "8034",
			"text": "Leistungseinheit, Sekundärteil",
			"preis": 65.67
		},
		{
			"nr": "8036",
			"text": "Leistungseinheit Metallverbindung/Wiederherstellung",
			"preis": 27.38
		},
		{
			"nr": "8039",
			"text": "Prothesensattel kürzen, ausschleifen und polieren",
			"preis": 20.15
		},
		{
			"nr": "8111",
			"text": "Auswechseln von Konfektionsteil, einfach",
			"preis": 18.39
		},
		{
			"nr": "8112",
			"text": "Auswechseln von Konfektionsteil, kompliziert",
			"preis": 21
		},
		{
			"nr": "8123",
			"text": "Prothese/ABS/KFO-Gerät säubern und polieren",
			"preis": 35
		},
		{
			"nr": "8201",
			"text": "Kronen- oder Brückenglied Reparatur, je Glied",
			"preis": 49.8
		},
		{
			"nr": "8211",
			"text": "Leistungseinheit, Instandsetzen individueller Riegel",
			"preis": 25
		},
		{
			"nr": "8212",
			"text": "Leistungseinheit, Aktivieren Teleskopkrone oder Steggeschiebe",
			"preis": 25
		},
		{
			"nr": "8999",
			"text": "Rapid Prototyping Druck Pro Gramm inkl. Stützmaterial",
			"preis": 1.9
		},
		{
			"nr": "9029",
			"text": "Gerustaus Zikon monolitisch",
			"preis": 29
		},
		{
			"nr": "9031",
			"text": "Gerust vollanatomisch(glasiert)",
			"preis": 75
		},
		{
			"nr": "9034",
			"text": "Gerust NEM",
			"preis": 32
		},
		{
			"nr": "9581",
			"text": "Einarbeiten Sekundärteil",
			"preis": 65.67
		},
		{
			"nr": "9634",
			"text": "Fräsen je Einheit ohne Material",
			"preis": 10
		}
	]
};
//#endregion
//#region src/daten.ts
var SPEICHER = (datei) => `planr.daten.${datei}`;
var standVon = (d) => d?.stand || d?.gueltigAb || "";
function gespeichert(datei) {
	try {
		const roh = localStorage.getItem(SPEICHER(datei));
		return roh ? JSON.parse(roh) : null;
	} catch {
		return null;
	}
}
/** Geladener Stand, wenn er neuer ist als der mitgelieferte – sonst der mitgelieferte. */
function aktuell(datei, mitgeliefert) {
	const g = typeof localStorage === "undefined" ? null : gespeichert(datei);
	return g && standVon(g) > standVon(mitgeliefert) ? g : mitgeliefert;
}
//#endregion
//#region src/data/goz-sonderregeln.ts
/**
* GOZ 0120 – Laser-Zuschlag. Fehlt in goz-2012.json und wird hier ergänzt.
* Höchstens einmal je Behandlungstag, nur mit dem einfachen Gebührensatz,
* höchstens 68 € und nur zu den unten genannten Leistungen.
*/
var LASER_ZUSCHLAG = {
	nr: "0120",
	text: "Zuschlag für die Anwendung eines Lasers",
	bestimmung: "Je Behandlungstag nur einmal, nur mit dem einfachen Gebührensatz, höchstens 68 € (§ 5 Abs. 1 GOZ). Nur zu den Leistungen nach den Nummern 2410, 3070, 3080, 3210, 3240, 4080, 4090, 4100, 4130, 4133 und 9160.",
	hoechstbetrag: 68,
	nummern: [
		"2410",
		"3070",
		"3080",
		"3210",
		"3240",
		"4080",
		"4090",
		"4100",
		"4130",
		"4133",
		"9160"
	]
};
/**
* GOZ 0110 – Operationsmikroskop. Steht in goz-2012.json, die zuschlagsfähigen
* Nummern werden hier für das Regelwerk gespiegelt.
*/
var MIKROSKOP_ZUSCHLAG = {
	nr: "0110",
	hoechstbetrag: Infinity,
	nummern: [
		"2195",
		"2330",
		"2340",
		"2360",
		"2410",
		"2440",
		"3020",
		"3030",
		"3040",
		"3045",
		"3060",
		"3110",
		"3120",
		"3190",
		"3200",
		"4090",
		"4100",
		"4130",
		"4133",
		"9100",
		"9110",
		"9120",
		"9130",
		"9170"
	]
};
/** Positionen, die als Ergänzung in die GOZ-Map gemischt werden. */
var GOZ_ERGAENZUNG = [{
	nr: "0120",
	text: LASER_ZUSCHLAG.text,
	punkte: 0,
	abschnitt: "A"
}];
/** Chirurgische OP-Zuschläge (nichtstationär), je Tag nur der höchste. */
var OP_ZUSCHLAEGE = [
	"0500",
	"0510",
	"0520",
	"0530"
];
/** Chirurgische Leistungen des Planers (Sitzung mit Anästhesie, Kontrollröntgen, ggf. OP-Zuschlag). */
var OP_LEISTUNGEN = /* @__PURE__ */ new Set([
	"3000",
	"3010",
	"3020",
	"3030",
	"3040",
	"3045",
	"3070",
	"3080",
	"3100",
	"3110",
	"3120",
	"3210",
	"3230",
	"3240",
	"4080",
	"4090",
	"4100",
	"4120",
	"4130",
	"4133",
	"9010",
	"9020",
	"9040",
	"9090",
	"9100",
	"9110",
	"9120",
	"9130",
	"9140",
	"9150",
	"9160",
	"9170"
]);
/**
* OP-Zuschlag nach der Punktzahl der Leistung (GOZ Abschnitt L): 250–499 → 0500 (sowie 4090, 4130),
* 500–799 → 0510, 800–1199 → 0520, ab 1200 → 0530; unter 250 Punkten kein Zuschlag.
*/
function opZuschlagStufe(nr, punkte) {
	if (punkte >= 1200) return "0530";
	if (punkte >= 800) return "0520";
	if (punkte >= 500) return "0510";
	if (punkte >= 250 || nr === "4090" || nr === "4130") return "0500";
	return null;
}
//#endregion
//#region src/engine/beb-standard.ts
var r = (nr, text, preis) => ({
	nr,
	text,
	preis,
	richtpreis: true
});
/**
* Positionen, die jede BEB-Liste jedes Mandanten enthält. Fehlt eine Nummer, wird sie mit Richtpreis
* (netto) ergänzt; vorhandene Nummern behalten Text und Preis der Liste.
*/
var BEB_STANDARD = [
	r("0007", "Oralscan aufbereiten", 14),
	r("0009", "Scan Spezialmodell, Kunststoff gedruckt je Kiefer", 23),
	r("0013", "Präp freilegen Oralscan", 6.5),
	r("0017", "Stumpf Digitaldruck", 9.5),
	r("0032", "Sintern", 12),
	r("0710", "Eiltermin Zuschlag", 1),
	r("0723", "Zahnfarbenbestimmung I", 30),
	r("0724", "Zahnfarbenbestimmung II", 45),
	r("0901", "CAD: Anlage Auftragsdaten", 9.5),
	r("0902", "CAD: optisch digitale Registrierung", 14.5),
	r("0903", "CAD: Modellsegmentierung", 9.5),
	r("0904", "CAD: Segment / Biss digitalisieren, je Segment/Biss", 6.5),
	r("0905", "CAD: Bearbeitung Präpgrenze entsprechend dem Scan", 6.5),
	r("0906", "CAD: Glanz- und Kristallisationsbrand", 14),
	r("0907", "CAD: Einzelkrone konstruieren", 28),
	r("0908", "CAD: Brückenglied konstruieren", 24),
	r("0909", "CAD: Kaufläche konstruieren", 18),
	r("0910", "CAD: Verbundkonstruktion / Verbinder", 9.5),
	r("0911", "CAD: CAM Element nacharbeiten", 12),
	r("1401", "Provisorische Krone, Brückenglied, PMMA", 35),
	r("2281", "Krone aus Keramik gefräst (Anatomisch Vollzirkon)", 110),
	r("2361", "Brückenglied aus Keramik (Anatomisches Vollzirkon)", 110),
	r("2362", "Brückenglied gegossen/gefräst Metall", 98),
	r("2556", "Pro-Inlay, einflächig", 85),
	r("2557", "Pro-Inlay, zweiflächig", 95),
	r("2558", "Pro-Inlay, dreiflächig", 108),
	r("2559", "Pro-Inlay, mehrflächig; Onlay", 125),
	r("3303", "Sekundär Teleskop in Metallbasis einarbeiten", 45),
	r("3541", "Konfektionsriegel primär", 60),
	r("3641", "Konfektionsriegel sekundär", 60)
];
/** Nummern, die in älteren Listen eine andere Leistung tragen: die alte Leistung zieht auf `neu` um */
var UMZUG = [{
	nr: "0007",
	alt: /kontrollmodell/i,
	neu: "0008"
}, {
	nr: "2361",
	alt: /metall/i,
	neu: "2362"
}];
var norm = (nr) => nr.trim().padStart(4, "0");
/** Ergänzt eine BEB-Liste um die fehlenden Standardpositionen; ohne Änderung kommt dieselbe Liste zurück. */
function bebErgaenzen(liste) {
	const eintraege = [...liste.eintraege];
	let geaendert = false;
	for (const u of UMZUG) {
		const i = eintraege.findIndex((e) => norm(e.nr) === u.nr);
		if (i < 0 || !u.alt.test(eintraege[i].text)) continue;
		const [alt] = eintraege.splice(i, 1);
		if (!eintraege.some((e) => norm(e.nr) === u.neu)) eintraege.push({
			...alt,
			nr: u.neu
		});
		geaendert = true;
	}
	const fehlend = BEB_STANDARD.filter((s) => !eintraege.some((e) => norm(e.nr) === s.nr));
	if (!fehlend.length && !geaendert) return liste;
	return {
		...liste,
		eintraege: [...eintraege, ...fehlend].sort((a, b) => norm(a.nr).localeCompare(norm(b.nr)))
	};
}
//#endregion
//#region src/engine/digital.ts
/**
* Eigenlabor-Schritte des digitalen Workflows ohne BEB-Entsprechung. Den Ablauf nach Intraoralscan
* (Oralscan, CAD, Druckstumpf, Sintern …) plant abformung.ts mit den BEB-Standardpositionen;
* D101–D103 bleiben nur, damit ältere Pläne ihren Preis behalten. D106–D108: digitale Totalprothese.
*/
var DIGITAL = {
	daten: "D101",
	stumpf: "D102",
	artikulation: "D103",
	scanbody: "D104",
	anprobe: "D105",
	aufstellung: "D106",
	einsetzen: "D107",
	anprobeProthese: "D108"
};
var DIGITAL_KATALOG = [
	{
		nr: DIGITAL.daten,
		text: "Intraoralscan-Daten übernehmen, auf Vollständigkeit prüfen und für die Konstruktion aufbereiten (je Auftrag)",
		preis: 14
	},
	{
		nr: DIGITAL.stumpf,
		text: "Virtueller Stumpf: segmentieren, Präparationsgrenze festlegen, Zementspalt definieren (je Stumpf)",
		preis: 6.5
	},
	{
		nr: DIGITAL.artikulation,
		text: "Virtuelle Artikulation: Kieferrelation über Bukkalscan zuordnen, Okklusion im virtuellen Artikulator einstellen (je Auftrag)",
		preis: 14.5
	},
	{
		nr: DIGITAL.scanbody,
		text: "Scanbody-Matching: Implantatposition aus der Herstellerbibliothek zuordnen und prüfen (je Implantat)",
		preis: 9.5
	},
	{
		nr: DIGITAL.anprobe,
		text: "Anprobe gedruckt (Try-in aus Kunststoff) zur Passungs- und Ästhetikkontrolle (je Einheit)",
		preis: 9.5
	},
	{
		nr: DIGITAL.aufstellung,
		text: "CAD: Prothesenzähne virtuell aufstellen, Okklusion und Basis konstruieren (je Kiefer)",
		preis: 65
	},
	{
		nr: DIGITAL.einsetzen,
		text: "Prothesenzähne in die gefräste bzw. gedruckte Basis einsetzen, ausarbeiten und polieren (je Kiefer)",
		preis: 55
	},
	{
		nr: DIGITAL.anprobeProthese,
		text: "Anprobeprothese gedruckt (Try-in der CAD-Aufstellung, je Kiefer)",
		preis: 45
	}
];
DIGITAL.daten, DIGITAL.stumpf, DIGITAL.artikulation;
/** Eigener Katalog der Praxis zuerst; fehlende Schritte des digitalen Workflows mit Standardpreis */
function mitDigital(katalog) {
	const eigene = katalog ?? [];
	return [...eigene, ...DIGITAL_KATALOG.filter((d) => !eigene.some((e) => e.nr.trim() === d.nr))];
}
//#endregion
//#region src/engine/eigenlabor.ts
var bebNorm = (s) => s.trim().padStart(4, "0");
/**
* Dieselbe Leistung unter mehreren BEB-Nummern: die Planung setzt eine davon (Keramikkrone 2281,
* Keramik-Brückenglied 2351), Praxis- und Laborlisten führen oft die andere.
*/
var GLEICHWERTIG = [[
	"2281",
	"2251",
	"2252"
], [
	"2351",
	"2352",
	"2361"
]];
/**
* Praxisposition zu einer Nummer. Von Hand gewählt: die Position mit genau dieser Nummer. Von der Planung
* gesetzt: die dem Leistungsschritt zugeordnete Position (Variante des Ablaufs zuerst); Positionen ohne
* Zuordnung wie bisher über gleiche Nummer bzw. „statt BEB-Nr.“.
*/
function eigenFinden(katalog, nr, k = {}) {
	if (!katalog?.length || !nr.trim()) return void 0;
	const t = nr.trim();
	const ziel = /^\d{1,4}$/.test(t) ? bebNorm(t) : t;
	const gleicheNr = katalog.find((e) => e.nr.trim() === t);
	if (!k.auto && gleicheNr) return gleicheNr;
	const ablauf = k.ablauf === "scan" ? "scan" : "abdruck";
	const gruppe = GLEICHWERTIG.find((g) => g.includes(ziel)) ?? [ziel];
	const fuerNorm = (e) => e.fuer && /^\d{1,4}$/.test(e.fuer) ? bebNorm(e.fuer) : e.fuer ?? "";
	const zugeordnet = katalog.filter((e) => e.fuer && gruppe.includes(fuerNorm(e)) && (!e.wenn || e.wenn === ablauf));
	const rang = (e) => (fuerNorm(e) === ziel ? 0 : 4) + (e.wenn ? 0 : 2) + (e.nr.trim() === t ? 0 : 1);
	if (zugeordnet.length) return zugeordnet.reduce((a, b) => rang(b) < rang(a) ? b : a);
	const ohneZuordnung = (e) => e.fuer === void 0;
	if (gleicheNr && ohneZuordnung(gleicheNr)) return gleicheNr;
	return /^\d{1,4}$/.test(t) ? katalog.find((e) => ohneZuordnung(e) && e.ersetzt && bebNorm(e.ersetzt) === ziel) : void 0;
}
//#endregion
//#region src/engine/zuordnung.ts
/**
* Zuordnung der Praxis- bzw. Fremdlabor-Positionen zu den Leistungsschritten, die PlanR plant.
* PlanR plant mit den Nummern der BEB-Standardliste (BEB-ITZ 2024 + Standardpositionen + digitale Schritte).
* Praxislisten stammen aus anderen BEB-Ausgaben (BEB 97, BEB Zahntechnik, VDZI) oder haben eigene Nummern –
* gleiche Nummer heißt dort nicht gleiche Leistung (z. B. BEB 97 2955 „Glasieren“, BEB-ITZ 2955 „Fräsen je Glied“).
* Deshalb wird jede Position über ihren Text einem Schritt zugeordnet; Varianten (gegossen/gefräst) gelten nur
* für den passenden Ablauf (Abdruck/Intraoralscan). Material ohne BEB-Nummer bekommt eine Rolle (Prothesenzahn,
* Abformmaterial …), mit der die Planung es dort ansetzt, wo es anfällt. Von Hand festgelegte Zuordnungen bleiben.
*/
var rolleZiel = (r) => `MAT:${r}`;
var STOPP = /* @__PURE__ */ new Set([
	"aus",
	"auf",
	"fur",
	"fuer",
	"der",
	"die",
	"das",
	"des",
	"dem",
	"den",
	"und",
	"oder",
	"mit",
	"ohne",
	"von",
	"vom",
	"zum",
	"zur",
	"bei",
	"nach",
	"pro",
	"eines",
	"einer",
	"einem",
	"einen",
	"eine",
	"ein",
	"inkl",
	"incl",
	"zzgl",
	"als",
	"nur",
	"auch",
	"in",
	"an",
	"je",
	"voll"
]);
/** Begriffe, die auch in zusammengesetzten oder abgekürzten Wörtern stecken („Kompositverblendung“, „teilverbl.“) */
var BEGRIFFE = [
	[/verblendschalen?|veneers?/, "veneer"],
	[/verblend(ungen|ung|eten|ete|et)?|verbl$/, "verblendung"],
	[/keramik(en)?/, "keramik"],
	[/komposit(en|e)?|polymer(en|e)?|polyme$/, "komposit"],
	[/kunststoff(en|e)?/, "kunststoff"],
	[/zirkon(dioxid|oxid)?|lithiumdisilikat/, "keramik"],
	[/monolithisch(en|er|es|e)?|(voll)?anatomisch(en|er|es|e)?/, "vollanatomisch"],
	[/gefrae?s+t(en|er|es|e)?/, "gefraest"],
	[/^g?egossen(en|er|es|e)?|^gossen(en|er|es|e)?|^guss(?!s)/, "gegossen"]
];
/** Metall ist in der BEB der Normalfall; nennt der Schritt keinen Werkstoff, zählt die Legierung der Praxis nicht */
var METALL = /^(nem|edelmetall|hochgold|gold|titan|cocr|cocrmo|palladium|metall|legierung)$/;
var WERKSTOFF = /^(nem|edelmetall|hochgold|gold|titan|metall\w*|legierung|keramik|komposit|kunststoff|pmma|wachs)$/;
var NICHT_METALL = /* @__PURE__ */ new Set([
	"keramik",
	"komposit",
	"kunststoff"
]);
var RESTAURATION = /(krone|inlay|onlay|glied)$/;
var VERFAHREN = /* @__PURE__ */ new Set([
	"gegossen",
	"gefraest",
	"gebogen",
	"gepresst"
]);
/** Alternativen im Text des Schritts („gegossen/gefräst“, „Keramik/Kompositverblendung“) */
var ALTERNATIVEN = [["gegossen", "gefraest"], ["keramik", "komposit"]];
var klein = (s) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
/** Kleinbuchstaben ohne Umlaute, Wörter ohne Füllwörter; Komposita mit einem Begriff werden zerlegt */
function woerter(s) {
	const roh = klein(s).split(/[^a-z0-9]+/).filter((w) => (w.length >= 3 || w === "nem") && !STOPP.has(w) && !/^\d+$/.test(w));
	const aus = [];
	for (const w of roh) {
		let teile = [w];
		for (const [re, begriff] of BEGRIFFE) teile = teile.flatMap((t) => {
			const m = re.exec(t);
			if (!m) return [t];
			aus.push(begriff);
			return [t.slice(0, m.index), t.slice(m.index + m[0].length)];
		});
		if (teile.length === 1 && teile[0] === w) aus.push(w);
		else aus.push(...teile.filter((t) => t.length >= 4 && !STOPP.has(t)));
	}
	return [...new Set(aus)];
}
/**
* Gleiches Wort: Beugung oder abgeschnittenes Wort („individuellen/-er“, „Artikulat.“) und das Grundwort eines
* Kompositums („Spezialmodell“ – „Modell“). Locker (bei gleicher Nummer) zählt auch ein gemeinsamer Wortanfang.
*/
function wortTreffer(a, b, locker) {
	if (a === b) return "gleich";
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	const kurz = Math.min(a.length, b.length);
	const lang = Math.max(a.length, b.length);
	if (i >= 5 && kurz - i <= 2 && lang - i <= 4) return "gleich";
	if (locker && (i >= 5 ? kurz - i <= 2 : i >= 4 && i === kurz)) return "teil";
	const [k, l] = a.length <= b.length ? [a, b] : [b, a];
	return k.length >= 5 && l.endsWith(k) ? "teil" : void 0;
}
var VOKABULAR = (() => {
	const basis = bebErgaenzen({ eintraege: beb_itz_2024_default.eintraege }).eintraege;
	const alle = /* @__PURE__ */ new Map();
	const dazu = (nr, text) => {
		const t = alle.get(nr) ?? [];
		if (!t.includes(text)) t.push(text);
		alle.set(nr, t);
	};
	for (const e of basis) dazu(bebNorm(e.nr), e.text);
	for (const e of BEB_STANDARD) dazu(bebNorm(e.nr), e.text);
	for (const d of DIGITAL_KATALOG) dazu(d.nr, d.text);
	return [...alle].map(([nr, t]) => ({
		nr,
		text: t[0],
		texte: t.map(woerter)
	}));
})();
var NACH_NR = new Map(VOKABULAR.map((e) => [e.nr, e]));
var DF = (() => {
	const df = /* @__PURE__ */ new Map();
	for (const e of VOKABULAR) for (const w of new Set(e.texte.flat())) df.set(w, (df.get(w) ?? 0) + 1);
	return df;
})();
var gewicht = (w) => 1 + Math.log((VOKABULAR.length + 1) / ((DF.get(w) ?? 0) + 1));
/** Bauteile, deren Arten eigene Leistungen sind (Dreiviertel-, Teil-, Teleskop-, Doppelkrone) */
var KOPF = /* @__PURE__ */ new Set([
	"krone",
	"glied",
	"brueckenglied",
	"inlay"
]);
/**
* Anteil eines Worts, der in der anderen Wortliste wiederkommt. Teiltreffer zählen mit dem kleineren Gewicht,
* über Nummern hinweg nur zu einem Viertel („Doppelkrone“ ist keine „Krone“); bei gleicher Nummer voll, außer
* das Bauteil der Praxis ist allgemeiner als das des Schritts („Krone“ bestätigt nicht „Dreiviertelkrone“).
*/
function anteil(x, andere, locker, xVonPraxis) {
	let best = 0;
	for (const y of andere) {
		const t = wortTreffer(x, y, locker);
		if (t === "gleich") return gewicht(x);
		if (t !== "teil") continue;
		const [praxisWort, schrittWort] = xVonPraxis ? [x, y] : [y, x];
		const schrittSpezieller = schrittWort.length > praxisWort.length && KOPF.has(praxisWort);
		best = Math.max(best, Math.min(gewicht(x), gewicht(y)) * (!locker ? .25 : schrittSpezieller ? .5 : 1));
	}
	return best;
}
function aehnlichWorte(p, standard, locker) {
	let a = p.w;
	let b = standard;
	if (!a.length || !b.length) return 0;
	const letztes = a[a.length - 1];
	if (p.gekuerzt && !b.some((x) => wortTreffer(letztes, x, true))) a = a.slice(0, -1);
	for (const [x, y] of ALTERNATIVEN) {
		if (!b.includes(x) || !b.includes(y)) continue;
		if (a.includes(x) !== a.includes(y)) b = b.filter((w) => w !== (a.includes(x) ? y : x));
		else if (!a.includes(x)) b = b.filter((w) => w !== x && w !== y);
	}
	const neutral = /* @__PURE__ */ new Set();
	if (!b.some((w) => WERKSTOFF.test(w))) {
		for (const w of a) if (METALL.test(w)) neutral.add(w);
	}
	if (!b.some((w) => VERFAHREN.has(w) || NICHT_METALL.has(w))) neutral.add("gegossen");
	if (a.every((w) => neutral.has(w))) return 0;
	let treffer = 0;
	let summe = 0;
	for (const x of a) {
		summe += gewicht(x) * (neutral.has(x) ? .3 : 1);
		treffer += anteil(x, b, locker, true);
	}
	for (const y of b) {
		summe += gewicht(y);
		treffer += anteil(y, a, locker, false);
	}
	return summe ? treffer / summe : 0;
}
var aehnlichsterText = (p, e, locker = false) => Math.max(...e.texte.map((t) => aehnlichWorte(p, t, locker)));
/** Variante nur für einen Ablauf: der Schritt nennt beide Fertigungsarten („gegossen/gefräst“), die Praxisposition eine */
function ablaufVon(praxis, e) {
	if (!e.texte.some((t) => t.includes("gegossen") && t.includes("gefraest"))) return void 0;
	const p = woerter(praxis);
	if (p.includes("gegossen") === p.includes("gefraest")) return void 0;
	return p.includes("gefraest") ? "scan" : "abdruck";
}
var OHNE_ZAHN = /krone|bruecke|provisor|verblend|stift|charakteris|reparatur|instandsetz|erweiter|gnatholog|aufstell|modell|wachs/;
/** Material und Teile ohne BEB-Nummer: Rolle aus dem Text */
var ROLLEN_REGELN = [
	[
		"zahn-front",
		/\bfront ?z(ae|a)hne?\b/,
		OHNE_ZAHN
	],
	[
		"zahn-seite",
		/\bseiten ?z(ae|a)hne?\b/,
		OHNE_ZAHN
	],
	["abform-alginat", /alginat.*(kiefer|abdruck|abformung)|(kiefer|abdruck|abformung).*alginat/],
	["abform-praezision", /doppelmisch|korrekturabform|praezisionsabform|praezisionsabdruck/],
	["abform-funktion", /funktionsabform|funktionsabdruck/],
	["registrat", /registrier\w*material|registratmaterial|bissregistrat\b|\bfutar\b|occlufast|regisil|blu ?mousse/],
	["rohling-zirkon", /zirkon\w*.*(rohling|ronde|multilayer|block|disc)|(rohling|ronde|multilayer|block|disc).*zirkon/],
	["rohling-lithiumdisilikat", /(lithium|e ?max).*(rohling|block|cad)/],
	["rohling-presskeramik", /press ?keramik.*rohling|e ?max press/],
	["legierung-nem", /\b(nem|cocr|kobalt ?chrom)\b.*legierung|legierung.*\b(nem|cocr)\b|wirobond|remanium/],
	["legierung-hochgold", /hochgold/],
	["legierung-goldreduziert", /gold ?reduziert|edelmetall ?reduziert/],
	["implantat-abdruckpfosten", /abformpfosten|abdruckpfosten|abformkappe|abdruckkappe/],
	["implantat-scanbody", /scan ?body|scanpfosten/],
	["implantat-laboranalog", /laboranalog|implantatanalog|modellanalog/],
	["implantat-tiBase", /ti ?base|klebebasis/],
	["implantat-schraube", /prothetikschraube|abutmentschraube|halteschraube|okklusalschraube/],
	["implantat-abutmentStandard", /abutment.*(konfektion|titan|standard|gerade)|(konfektion|titan|standard).*abutment/]
];
/** gleiche Nummer: der Text muss nur erkennbar dieselbe Leistung meinen */
var NUMMER_MIN = .35;
/** andere Nummer: der Text muss klar passen und deutlich besser als der nächstbeste */
var TEXT_MIN = .72;
var TEXT_ABSTAND = .06;
/** gleiche Nummer, aber der Text ist fast wörtlich eine andere Leistung: die gilt */
var UMZUG_MIN = .85;
/** Zuordnung, die PlanR einer Position vorschlägt (undefined = keine – nur über die Suche) */
function zuordnungVorschlagen(e) {
	const text = e.text ?? "";
	if (e.ersetzt?.trim() && e.quelle !== "pvs") return {
		fuer: bebNorm(e.ersetzt),
		grund: "eingetragen"
	};
	const nr = e.ersetzt?.trim() || e.nr.trim();
	const kandidat = /^\d{1,4}$/.test(nr) ? NACH_NR.get(bebNorm(nr)) : NACH_NR.get(nr.toUpperCase());
	if (kandidat && /^D\d{3}$/.test(kandidat.nr)) return {
		fuer: kandidat.nr,
		grund: "nummer"
	};
	const pw = {
		w: woerter(text),
		gekuerzt: text.trim().length >= 38
	};
	const ueberText = () => {
		if (!pw.w.length) return void 0;
		const nichtMetall = pw.w.some((w) => NICHT_METALL.has(w)) && pw.w.some((w) => RESTAURATION.test(w)) && !pw.w.includes("verblendung") && !/\bfuer (keramik|kunststoff|komposit|polymer|kst)/.test(klein(text));
		const treffer = VOKABULAR.filter((v) => !nichtMetall || v.texte.some((t) => t.some((w) => WERKSTOFF.test(w)))).map((v) => ({
			v,
			a: aehnlichsterText(pw, v)
		})).sort((x, y) => y.a - x.a);
		const beste = treffer[0];
		const zweite = treffer.find((x) => x.v.text !== beste?.v.text)?.a ?? 0;
		return beste && beste.a >= TEXT_MIN && beste.a - zweite >= TEXT_ABSTAND ? {
			fuer: beste.v.nr,
			wenn: ablaufVon(text, beste.v),
			grund: "text",
			aehnlich: beste.a
		} : void 0;
	};
	if (kandidat) {
		const a = aehnlichsterText(pw, kandidat, true);
		if (a >= NUMMER_MIN) {
			const anders = a < TEXT_MIN ? ueberText() : void 0;
			if (anders && anders.fuer !== kandidat.nr && (anders.aehnlich ?? 0) >= UMZUG_MIN && (anders.aehnlich ?? 0) - a >= .3) return anders;
			return {
				fuer: kandidat.nr,
				wenn: ablaufVon(text, kandidat),
				grund: "nummer",
				aehnlich: a
			};
		}
	}
	const t = klein(text).replace(/[^a-z0-9]+/g, " ");
	for (const [rolle, ja, nein] of ROLLEN_REGELN) if (ja.test(t) && !nein?.test(t)) return {
		fuer: rolleZiel(rolle),
		grund: "rolle"
	};
	return ueberText();
}
var zugeordnet$1 = /* @__PURE__ */ new WeakMap();
/**
* Katalog mit Zuordnung: von Hand festgelegte bleiben, alle anderen bekommen den Vorschlag (fuer '' = keiner).
* Das Ergebnis wird je Katalog zwischengespeichert.
*/
function katalogZuordnen(katalog) {
	if (!katalog) return [];
	const da = zugeordnet$1.get(katalog);
	if (da) return da;
	const neu = katalog.map((e) => {
		if (e.zuordnung === "hand") return e;
		const v = zuordnungVorschlagen(e);
		const { wenn: _, ...ohne } = e;
		return {
			...ohne,
			fuer: v?.fuer ?? "",
			...v?.wenn ? { wenn: v.wenn } : {},
			zuordnung: "auto"
		};
	});
	zugeordnet$1.set(katalog, neu);
	return neu;
}
//#endregion
//#region src/engine/listen.ts
var gozDaten = aktuell("goz-2012.json", goz_2012_default);
var goaeDaten = aktuell("goae-zahnarzt.json", goae_zahnarzt_default);
var bebDaten = aktuell("beb-itz-2024.json", beb_itz_2024_default);
var BEB = new Map(bebErgaenzen({ eintraege: bebDaten.eintraege }).eintraege.map((e) => [e.nr, e]));
var LEER = [];
var zugeordnet = /* @__PURE__ */ new WeakMap();
/** Eigenlabor der Praxis, jede Position ihrem BEB-Leistungsschritt zugeordnet (wie im HKP) */
function eigenKatalog(k = LEER) {
	let z = zugeordnet.get(k);
	if (!z) zugeordnet.set(k, z = katalogZuordnen(mitDigital(k)));
	return z;
}
var GOZ_PUNKTWERT = gozDaten.punktwert;
var GOAE_PUNKTWERT = goaeDaten.punktwert;
var GOZ = new Map([...gozDaten.eintraege.map((e) => [e.nr, e]), ...GOZ_ERGAENZUNG.map((e) => [e.nr, e])]);
var GOAE = new Map(goaeDaten.eintraege.map((e) => [e.nr, e]));
var runden = (x) => Math.round(x * 100) / 100;
var GOZ_HOECHSTSATZ = 3.5;
var gozEinzel = (nr, faktor) => runden((GOZ.get(nr)?.punkte ?? 0) * GOZ_PUNKTWERT * faktor);
/** GOÄ-Faktorrahmen je Eintrag (persönliche Leistungen, Röntgen, feste Zuschläge). */
function goaeRahmen(nr) {
	const e = GOAE.get(nr);
	return {
		schwelle: e?.schwelle ?? 2.3,
		max: e?.maxFaktor ?? 3.5
	};
}
var goaeEinzel = (nr, faktor) => runden((GOAE.get(nr)?.punkte ?? 0) * GOAE_PUNKTWERT * faktor);
//#endregion
//#region src/engine/sitzungen.ts
var kieferAus = (zahn) => {
	if (zahn.startsWith("OK")) return "OK";
	if (zahn.startsWith("UK")) return "UK";
	if (/^\d\d$/.test(zahn)) return kieferVon(zahn);
	return "";
};
var istUkSeitenzahn = (zahn) => zahn === "UK" || zahn === "UK-L" || zahn === "UK-R" || /^\d\d$/.test(zahn) && kieferVon(zahn) === "UK" && ![
	"1",
	"2",
	"3"
].includes(zahn[1]);
/** Punkte einer GOZ-Nummer (für die Wahl des höchsten OP-Zuschlags). */
var punkte = (nr) => GOZ.get(nr)?.punkte ?? 0;
/**
* Ergänzt je Behandlungssitzung Anästhesie, einen OP-Zuschlag (nur den höchsten),
* Kontrollröntgen sowie die globale Bildgebung. Nachsorge-/Begleitleistungen
* kommen über den Regler (zusatz.ts).
*/
function sitzungenErgaenzen(plan, eingang, _einst) {
	const positionen = [...eingang];
	const hinweise = [];
	const klasse = plan.regler.materialKlasse;
	const opNummern = OP_LEISTUNGEN;
	const sitzungen = new Set(positionen.filter((p) => p.ebene === "GOZ" && opNummern.has(p.nr) && p.sitzung).map((p) => p.sitzung));
	for (const s of [...sitzungen].sort((a, b) => a - b)) {
		const inSitzung = positionen.filter((p) => p.sitzung === s && p.ebene === "GOZ" && opNummern.has(p.nr));
		const kiefer = new Set(inSitzung.map((p) => kieferAus(p.zahn)).filter(Boolean));
		const brauchtLeitung = inSitzung.some((p) => istUkSeitenzahn(p.zahn));
		for (const k of kiefer.size ? kiefer : /* @__PURE__ */ new Set(["OK"])) {
			const leitung = k === "UK" && brauchtLeitung;
			const nr = leitung ? "0100" : "0090";
			positionen.push({
				id: `auto:anae:${nr}:${k}:${s}`,
				ebene: "GOZ",
				nr,
				zahn: k,
				anzahl: 1,
				sitzung: s,
				grund: leitung ? "Leitungsanästhesie" : "Infiltrationsanästhesie",
				auto: true
			});
		}
		const anae = materialFuerKlasse("anaesthetikum", klasse);
		if (anae) positionen.push({
			id: `mat:anae:${s}`,
			ebene: "MAT",
			nr: anae.id,
			zahn: "",
			anzahl: Math.max(1, kiefer.size) * 2,
			sitzung: s,
			text: `${anae.titel}`,
			material: true,
			auto: true,
			grund: "Lokalanästhetikum"
		});
		const stufe = (p) => OP_ZUSCHLAEGE.indexOf(opZuschlagStufe(p.nr, punkte(p.nr)) ?? "");
		const hoechste = inSitzung.slice().sort((a, b) => stufe(b) - stufe(a) || punkte(b.nr) - punkte(a.nr))[0];
		const zuschlag = hoechste && opZuschlagStufe(hoechste.nr, punkte(hoechste.nr));
		if (hoechste && zuschlag) positionen.push({
			id: `auto:opzuschlag:${s}`,
			ebene: "GOZ",
			nr: zuschlag,
			zahn: "",
			anzahl: 1,
			sitzung: s,
			grund: `OP-Zuschlag (höchste Leistung: GOZ ${hoechste.nr})`,
			auto: true
		});
		positionen.push({
			id: `auto:roentgen-kontrolle:${s}`,
			ebene: "GOAE",
			nr: "5000",
			zahn: "",
			anzahl: 1,
			sitzung: s,
			grund: "Kontrollröntgen nach dem Eingriff",
			auto: true
		});
	}
	const b = plan.global.bildgebung;
	if (b === "opg" || b === "opg+dvt") positionen.push({
		id: "auto:bild:opg",
		ebene: "GOAE",
		nr: "5004",
		zahn: "",
		anzahl: 1,
		sitzung: 1,
		grund: "Panoramaschichtaufnahme (OPG)",
		auto: true
	});
	if (b === "dvt" || b === "opg+dvt") {
		positionen.push({
			id: "auto:bild:dvt",
			ebene: "GOAE",
			nr: "5370",
			zahn: "",
			anzahl: 1,
			sitzung: 1,
			grund: "DVT des Kopfbereichs",
			auto: true
		});
		positionen.push({
			id: "auto:bild:dvt-3d",
			ebene: "GOAE",
			nr: "5377",
			zahn: "",
			anzahl: 1,
			sitzung: 1,
			grund: "Zuschlag 3D-Rekonstruktion",
			auto: true
		});
	}
	if (plan.global.sedierung === "itn") hinweise.push("Intubationsnarkose ist eine Fremdleistung (Anästhesist) nach § 4 Abs. 5 GOZ und wird gesondert durch den Anästhesisten berechnet.");
	return {
		positionen,
		hinweise
	};
}
//#endregion
//#region src/data/analog-katalog.ts
var ANALOG_KATALOG = [
	{
		id: "virtuelle-implantation",
		titel: "Virtuelle Implantatplanung (3D)",
		beschreibung: "Dreidimensionale virtuelle Implantatplanung auf DVT-Datensatz einschließlich Auswertung und Positionsfestlegung, entsprechend GOZ-Nr. 2160",
		abschnitt: "K",
		einheit: "Fall",
		minuten: 45,
		materialEinkalkuliert: false,
		risiko: "mittel",
		pkv: "Teilweise als mit 9000 abgegolten angesehen; Analogansatz bei eigenständiger virtueller Planung vertretbar.",
		vergleich: [{
			ebene: "GOZ",
			nr: "2160",
			faktor: 2.3,
			euro: 175.41,
			quelle: "BLZK-Empfehlung 2024"
		}],
		stufe: 1,
		bedarf: "planung"
	},
	{
		id: "schablonenaufwand",
		titel: "Aufwand für die Bohrschablone (Konstruktion/Anpassung)",
		beschreibung: "Konstruktion und klinische Anpassung einer statischen Bohrschablone, entsprechend GOZ-Nr. 3030",
		abschnitt: "K",
		einheit: "Fall",
		minuten: 20,
		materialEinkalkuliert: false,
		risiko: "mittel",
		pkv: "Neben 9003/9005 strittig; getrennter Analogansatz für den Konstruktionsaufwand möglich.",
		vergleich: [{
			ebene: "GOZ",
			nr: "3030",
			faktor: 2.3,
			euro: 45.27,
			quelle: "BLZK-Empfehlung 2024"
		}],
		stufe: 1,
		bedarf: "planung"
	},
	{
		id: "rfa-isq",
		titel: "Resonanzfrequenzanalyse / Stabilitätsmessung (ISQ)",
		beschreibung: "Messung der Implantatstabilität mittels Resonanzfrequenzanalyse (ISQ), entsprechend GOZ-Nr. 5170",
		abschnitt: "K",
		einheit: "Implantat",
		minuten: 10,
		materialEinkalkuliert: false,
		risiko: "mittel",
		pkv: "Als Zusatzdiagnostik häufig nicht erstattet; Analogansatz vertretbar, wenn eigenständig dokumentiert.",
		vergleich: [{
			ebene: "GOZ",
			nr: "5170",
			faktor: 2.3,
			euro: 32.34,
			quelle: "BLZK-Empfehlung 2024"
		}, {
			ebene: "GOZ",
			nr: "4100",
			faktor: 2.3,
			euro: 35.57,
			quelle: "BLZK-Empfehlung 2024"
		}],
		stufe: 2,
		bedarf: "insertion"
	},
	{
		id: "emergenzprofil",
		titel: "Ausformung des Emergenzprofils",
		beschreibung: "Weichgewebliche Ausformung des Emergenzprofils mit individuellem Gingivaformer, entsprechend GOZ-Nr. 9050",
		abschnitt: "K",
		einheit: "Implantat",
		minuten: 15,
		materialEinkalkuliert: false,
		risiko: "mittel",
		pkv: "Teilweise als prothetische Leistung dem ZE zugeordnet; Analogansatz bei chirurgischer Ausformung vertretbar.",
		vergleich: [{
			ebene: "GOZ",
			nr: "9050",
			faktor: 2.3,
			euro: 40.49,
			quelle: "BLZK-Empfehlung 2024"
		}, {
			ebene: "GOZ",
			nr: "3230",
			faktor: 2.3,
			euro: 56.92,
			quelle: "BLZK-Empfehlung 2024"
		}],
		stufe: 2,
		bedarf: "freilegung"
	},
	{
		id: "lachgas",
		titel: "Lachgas-Sedierung (Analgosedierung)",
		beschreibung: "Sedierung mit Lachgas (N2O/O2) einschließlich Überwachung, entsprechend GOÄ-Nr. 2442 analog",
		abschnitt: "A",
		einheit: "Sitzung",
		minuten: 30,
		materialEinkalkuliert: true,
		risiko: "hoch",
		pkv: "In der PKV regelmäßig abgelehnt (keine eigene GOZ/GOÄ-Ziffer); als Verlangensleistung nach § 2 Abs. 3 vereinbaren.",
		vergleich: [{
			ebene: "GOAE",
			nr: "2442",
			faktor: 2.3,
			euro: 120.65,
			quelle: "ZÄK-Berlin-Beispiel"
		}],
		stufe: 3,
		bedarf: "sedierung"
	},
	{
		id: "pulsoxymetrie",
		titel: "Pulsoxymetrische Überwachung",
		beschreibung: "Kontinuierliche pulsoxymetrische Überwachung während der Sedierung, entsprechend GOÄ-Nr. 253 analog",
		abschnitt: "A",
		einheit: "Sitzung",
		minuten: 5,
		materialEinkalkuliert: false,
		risiko: "hoch",
		pkv: "Als mit der Sedierung abgegolten angesehen; Erstattung unwahrscheinlich.",
		vergleich: [{
			ebene: "GOAE",
			nr: "253",
			faktor: 2.3,
			euro: 9.38,
			quelle: "GOÄ § 5 (2,3-fach)"
		}],
		stufe: 3,
		bedarf: "sedierung"
	},
	{
		id: "gerinnungstest",
		titel: "Gerinnungs-Schnelltest (INR/POCT)",
		beschreibung: "Patientennahe Bestimmung des Gerinnungsstatus (INR) vor dem Eingriff, entsprechend GOÄ-Nr. 250 analog",
		abschnitt: "D",
		einheit: "Sitzung",
		minuten: 10,
		materialEinkalkuliert: true,
		risiko: "mittel",
		pkv: "Bei dokumentierter Antikoagulation meist anerkannt.",
		vergleich: [{
			ebene: "GOAE",
			nr: "250",
			faktor: 1.8,
			euro: 4.2,
			quelle: "GOÄ § 5 Abs. 3 (höchstens 2,5)"
		}],
		stufe: 3,
		bedarf: "antikoagulation"
	},
	{
		id: "prf-matrix",
		titel: "Herstellung und Einbringen einer Eigenblut-/PRF-Matrix",
		beschreibung: "Herstellung und Applikation einer thrombozytenreichen Fibrinmatrix (PRF) aus Eigenblut, entsprechend GOZ-Nr. 2150",
		abschnitt: "D",
		einheit: "Region",
		minuten: 20,
		materialEinkalkuliert: false,
		risiko: "hoch",
		pkv: "Die PKV sieht PRF teilweise als mit GOZ 4110 + GOÄ 250 abgegolten an; Analogansatz der Matrix ist strittig.",
		vergleich: [{
			ebene: "GOZ",
			nr: "2150",
			faktor: 2.3,
			euro: 147.6,
			quelle: "BLZK-Empfehlung 2024"
		}, {
			ebene: "GOZ",
			nr: "5210",
			faktor: 2.3,
			euro: 181.1,
			quelle: "BLZK-Empfehlung 2024"
		}],
		stufe: 4,
		bedarf: "eigenblut"
	},
	{
		id: "socket-preservation-kem",
		titel: "Alveolenmanagement mit Knochenersatzmaterial (Socket Preservation)",
		beschreibung: "Auffüllung und Konturerhalt der Extraktionsalveole mit Knochenersatzmaterial und Abdeckung, entsprechend GOÄ-Nr. 2442 analog (Material einkalkuliert)",
		abschnitt: "D",
		einheit: "Zahn",
		minuten: 25,
		materialEinkalkuliert: true,
		risiko: "mittel",
		pkv: "ZÄK-Berlin-Beispiel: GOÄ 2442 analog, Material inklusive. Erstattung uneinheitlich.",
		vergleich: [{
			ebene: "GOAE",
			nr: "2442",
			faktor: 2.3,
			euro: 120.65,
			quelle: "ZÄK-Berlin-Beispiel (inkl. Material)"
		}],
		stufe: 5,
		bedarf: "extraktion"
	},
	{
		id: "socket-shield",
		titel: "Socket-Shield-Technik (partielle Wurzelerhaltung)",
		beschreibung: "Belassen eines bukkalen Wurzelsegments zum Erhalt der Alveolenkontur bei Sofortimplantation, entsprechend GOZ-Nr. 3230",
		abschnitt: "K",
		einheit: "Zahn",
		minuten: 30,
		materialEinkalkuliert: false,
		risiko: "hoch",
		pkv: "Noch keine etablierte Erstattungslinie; als Verlangensleistung nach § 2 Abs. 3 absichern.",
		vergleich: [{
			ebene: "GOZ",
			nr: "3230",
			faktor: 2.3,
			euro: 56.92,
			quelle: "BLZK-Empfehlung 2024"
		}],
		stufe: 5,
		bedarf: "extraktion"
	},
	{
		id: "kollagenmatrix",
		titel: "Einbringen einer Kollagen-/Weichgewebematrix",
		beschreibung: "Einbringen und Fixierung einer volumenstabilen Kollagenmatrix zur Weichgewebeverdickung, entsprechend GOZ-Nr. 4130",
		abschnitt: "D",
		einheit: "Region",
		minuten: 25,
		materialEinkalkuliert: false,
		risiko: "mittel",
		pkv: "Als Ersatz des Bindegewebstransplantats (4133) teilweise anerkannt.",
		vergleich: [{
			ebene: "GOZ",
			nr: "4130",
			faktor: 2.3,
			euro: 23.28,
			quelle: "GOZ § 5 (2,3-fach)"
		}],
		stufe: 5,
		bedarf: "augmentation"
	},
	{
		id: "laser-dekontamination",
		titel: "Laser-Dekontamination des Implantatlagers/der Alveole",
		beschreibung: "Photodynamische bzw. Laser-Dekontamination des OP-Gebietes, entsprechend GOZ-Nr. 4080",
		abschnitt: "A",
		einheit: "Region",
		minuten: 10,
		materialEinkalkuliert: true,
		risiko: "hoch",
		pkv: "Erstattung unwahrscheinlich; Verlangensleistung.",
		vergleich: [{
			ebene: "GOZ",
			nr: "4080",
			faktor: 2.3,
			euro: 5.82,
			quelle: "GOZ § 5 (2,3-fach)"
		}],
		stufe: 5,
		bedarf: "immer"
	}
];
//#endregion
//#region src/data/blutprotokolle.ts
var BLUTPROTOKOLLE = [
	{
		id: "prf",
		titel: "PRF (Platelet Rich Fibrin)",
		gruppe: "prf",
		roehrchen: "Glasröhrchen ohne Antikoagulans",
		zusatz: "keine",
		schritte: [
			"Blutentnahme (GOÄ 250)",
			"Zentrifugation ca. 2.700 U/min, 12 min",
			"Fibrinkoagulum entnehmen",
			"PRF-Membran pressen"
		],
		produkt: "PRF-Membran / PRF-Plug",
		roehrchenProSitzung: 2,
		materialId: "roehrchen-prf",
		anzeigepflichtig: true,
		hinweis: "Vollblut ohne Zusätze. Verarbeitung unmittelbar nach Entnahme (keine Lagerung)."
	},
	{
		id: "aprf",
		titel: "A-PRF+ (Advanced PRF)",
		gruppe: "prf",
		roehrchen: "A-PRF-Röhrchen (Glas, ohne Antikoagulans)",
		zusatz: "keine",
		schritte: [
			"Blutentnahme (GOÄ 250)",
			"Zentrifugation ca. 1.300 U/min, 8 min (Low-Speed)",
			"A-PRF+-Koagulum entnehmen",
			"Membran pressen"
		],
		produkt: "A-PRF+-Membran (zellreich)",
		roehrchenProSitzung: 2,
		materialId: "roehrchen-aprf",
		anzeigepflichtig: true,
		hinweis: "Low-Speed-Konzept nach Choukroun: höherer Leukozyten- und Wachstumsfaktorgehalt."
	},
	{
		id: "iprf",
		titel: "i-PRF (injectable PRF)",
		gruppe: "prf",
		roehrchen: "i-PRF-Röhrchen (Kunststoff, ohne Antikoagulans)",
		zusatz: "keine",
		schritte: [
			"Blutentnahme (GOÄ 250)",
			"Zentrifugation ca. 700 U/min, 3 min",
			"flüssige i-PRF-Fraktion abziehen"
		],
		produkt: "flüssiges i-PRF (für Sticky Bone)",
		roehrchenProSitzung: 1,
		materialId: "roehrchen-iprf",
		anzeigepflichtig: true,
		hinweis: "Flüssige Phase zum Binden von Knochenersatzmaterial („Sticky Bone\")."
	},
	{
		id: "lprf",
		titel: "L-PRF (Leukocyte PRF)",
		gruppe: "prf",
		roehrchen: "L-PRF-Röhrchen (Glas)",
		zusatz: "keine",
		schritte: [
			"Blutentnahme (GOÄ 250)",
			"Zentrifugation ca. 2.700 U/min, 12 min",
			"Koagulum entnehmen",
			"Membran/Plug pressen"
		],
		produkt: "L-PRF-Membran / Plug",
		roehrchenProSitzung: 2,
		materialId: "roehrchen-lprf",
		anzeigepflichtig: true,
		hinweis: "Leukozytenreiches PRF nach Dohan/IntraSpin-Protokoll."
	},
	{
		id: "prgf",
		titel: "PRGF (Plasma Rich in Growth Factors, Endoret)",
		gruppe: "prgf",
		roehrchen: "Citrat-Röhrchen (Endoret-Kit)",
		zusatz: "Citrat + Calciumchlorid",
		schritte: [
			"Blutentnahme in Citrat (GOÄ 250)",
			"Zentrifugation ca. 580 g, 8 min",
			"Fraktion F2 (wachstumsfaktorenreich) abpipettieren",
			"Aktivierung mit Calciumchlorid",
			"Fibrin-Scaffold / flüssig / Membran"
		],
		produkt: "PRGF-Fraktion F2 (flüssig, Scaffold, Membran)",
		roehrchenProSitzung: 4,
		materialId: "kit-prgf",
		anzeigepflichtig: true,
		hinweis: "Citratblut, Aktivierung mit CaCl2. Fraktioniertes Protokoll (BTI Endoret)."
	},
	{
		id: "prp",
		titel: "PRP (Platelet Rich Plasma)",
		gruppe: "prp",
		roehrchen: "Citrat-Röhrchen (PRP-Kit)",
		zusatz: "Citrat + Calciumchlorid",
		schritte: [
			"Blutentnahme in Citrat (GOÄ 250)",
			"Erste Zentrifugation (Soft Spin) zur Plasmatrennung",
			"Zweite Zentrifugation (Hard Spin) zur Thrombozytenkonzentration",
			"Aktivierung mit Calciumchlorid"
		],
		produkt: "aktiviertes PRP (flüssig / Gel)",
		roehrchenProSitzung: 2,
		materialId: "kit-prp",
		anzeigepflichtig: true,
		hinweis: "Citratblut, Doppelzentrifugation, Aktivierung mit CaCl2."
	}
];
/** Protokolle einer Eigenblut-Gruppe (prf/prgf/prp). */
var protokolleDerGruppe = (gruppe) => BLUTPROTOKOLLE.filter((p) => p.gruppe === gruppe);
/** Standardprotokoll je Gruppe (das erste). */
var standardProtokoll = (gruppe) => protokolleDerGruppe(gruppe)[0];
//#endregion
//#region src/engine/analog.ts
/** Euro eines Vergleichs-/Kandidaten-Ansatzes beim gegebenen Faktor. */
var euroVon = (ebene, nr, faktor) => ebene === "GOZ" ? gozEinzel(nr, faktor) : goaeEinzel(nr, faktor);
/**
* Wählt die Vergleichsziffer für eine Analogleistung nach der Reglerstufe.
* 0 = niedrigste Kammer-Ziffer, 1 = höchste Kammer-Ziffer,
* 2 = Praxiskalkulation (Minuten × Stundensatz + einkalkuliertes Material),
*     gedeckt über die günstigste GOZ-Ziffer, die den Zielbetrag erreicht;
*     nur wenn keine GOZ-Ziffer reicht, eine geöffnete GOÄ-Ziffer.
*/
function analogWaehlen(leistung, opt) {
	const kammer = [...leistung.vergleich].sort((a, b) => a.euro - b.euro);
	if (opt.bewertung <= 0) {
		const v = kammer[0];
		return {
			basisEbene: v.ebene,
			nr: v.nr,
			faktor: v.faktor,
			euro: v.euro,
			quelle: v.quelle
		};
	}
	if (opt.bewertung === 1) {
		const v = kammer[kammer.length - 1];
		return {
			basisEbene: v.ebene,
			nr: v.nr,
			faktor: v.faktor,
			euro: v.euro,
			quelle: v.quelle
		};
	}
	const material = leistung.materialEinkalkuliert && opt.materialEinkalkulieren ? opt.materialBetrag : 0;
	const ziel = leistung.minuten / 60 * opt.stundensatz + material;
	const deckend = (ebene, map, faktor) => {
		let beste = null;
		for (const e of map.values()) {
			if (!e.punkte) continue;
			const euro = euroVon(ebene, e.nr, faktor);
			if (euro + 1e-4 < ziel) continue;
			if (!beste || euro < beste.euro) beste = {
				basisEbene: ebene,
				nr: e.nr,
				faktor,
				euro,
				quelle: "Praxiskalkulation (Minuten × Stundensatz" + (material ? " + Material" : "") + ")"
			};
		}
		return beste;
	};
	const goz = deckend("GOZ", GOZ, opt.gozFaktor);
	if (goz) return goz;
	const goae = deckend("GOAE", GOAE, opt.goaeFaktor);
	if (goae) return goae;
	let hoechste = null;
	for (const e of GOZ.values()) {
		if (!e.punkte) continue;
		const euro = gozEinzel(e.nr, opt.gozFaktor);
		if (!hoechste || euro > hoechste.euro) hoechste = {
			basisEbene: "GOZ",
			nr: e.nr,
			faktor: opt.gozFaktor,
			euro,
			quelle: "Praxiskalkulation (höchste verfügbare Ziffer)"
		};
	}
	return hoechste ?? {
		basisEbene: kammer[0].ebene,
		nr: kammer[0].nr,
		faktor: kammer[0].faktor,
		euro: kammer[0].euro,
		quelle: kammer[0].quelle
	};
}
/** Baut die Analog-Position (Honorarzeile) aus Leistung + gewählter Vergleichsziffer. */
function analogPosition(id, zahn, sitzung, leistung, wahl, anzahl = 1) {
	const ebeneLabel = wahl.basisEbene === "GOZ" ? "GOZ" : "GOÄ";
	return {
		id,
		ebene: wahl.basisEbene,
		nr: wahl.nr,
		zahn,
		anzahl,
		faktor: wahl.faktor,
		preis: wahl.euro,
		text: leistung.titel,
		analog: true,
		basisEbene: wahl.basisEbene,
		analogText: `${leistung.beschreibung} (Analog nach § 6 Abs. 1 GOZ, entsprechend ${ebeneLabel}-Nr. ${wahl.nr})`,
		risiko: leistung.risiko,
		begruendung: leistung.pkv,
		zusatz: "analog",
		sitzung,
		auto: true,
		grund: leistung.titel
	};
}
//#endregion
//#region src/engine/zusatz.ts
/** Echte OP-Sitzungen (mit chirurgischer Leistung, nicht die reine Planung). */
var opSitzungen = (basis) => {
	return [...new Set(basis.filter((p) => p.ebene === "GOZ" && p.sitzung && OP_LEISTUNGEN.has(p.nr)).map((p) => p.sitzung))].sort((a, b) => a - b);
};
/**
* Schablone je Kiefer mit Implantat: GOZ 9003 (Orientierungs-/Positionierungsschablone) bzw. 9005
* (3D-Navigationsschablone) beim Eingriff; das Labor als BEB-Positionen, Preis aus dem Eigenlabor der Praxis
* bzw. der BEB-Liste. Konventionell: Modell (0001), Basis (1223), Bohrhülse je Implantat (1311); mit Messschablone
* zusätzlich Röntgenkugel (1311) und Set-up (0833) je Implantat. Navigation: gedrucktes Modell (0009),
* CAD-Auftragsdaten (0901), virtuelles Set-up (0833) je Implantat, Basis und Bohrhülsen.
*/
function schablone(impl, stufe) {
	const nav = stufe >= 3;
	const out = [];
	const beb = (nr, zahn, anzahl, text) => out.push({
		id: `zus:schablone:${nr}:${zahn}`,
		ebene: "BEB",
		nr,
		zahn,
		anzahl,
		sitzung: 1,
		grund: nav ? "3D-Navigationsschablone" : "Bohrschablone",
		zusatz: "begleit",
		auto: true,
		...text ? { text } : {}
	});
	for (const k of ["OK", "UK"]) {
		const n = impl.filter((z) => kieferVon(z) === k).length;
		if (!n) continue;
		out.push({
			id: `zus:schablone-goz:${k}`,
			ebene: "GOZ",
			nr: nav ? "9005" : "9003",
			zahn: k,
			anzahl: 1,
			sitzung: 3,
			grund: nav ? "3D-Navigationsschablone" : "Orientierungs-/Positionierungsschablone",
			zusatz: "begleit",
			auto: true
		});
		beb(nav ? "0009" : "0001", k, 1);
		beb("1223", k, 1, nav ? "Basis für Navigationsschablone (gedruckt)" : void 0);
		beb("1311", k, stufe === 2 ? 2 * n : n, stufe === 2 ? "Röntgenkugel und Bohrhülse positionieren" : "Bohrhülse positionieren");
		if (stufe >= 2) beb("0833", k, n, nav ? "Virtuelles Set-up je Implantat (Backward Planning)" : "Set-up je Implantat (Backward Planning)");
	}
	if (nav) beb("0901", "", 1);
	return out;
}
function zusatzleistungen(plan, basis, einst) {
	const positionen = [];
	const nichtAngesetzt = [];
	const r = plan.regler;
	const klasse = r.materialKlasse;
	const effGoz = r.gozFaktor > 0 ? r.gozFaktor : einst.gozFaktor;
	const effGoae = r.goaeFaktor > 0 ? r.goaeFaktor : einst.goaeFaktor;
	const impl = implantatZaehne(plan);
	const sitzungen = opSitzungen(basis);
	if (r.begleitStufe >= 1 && impl.length) positionen.push({
		id: "zus:0060",
		ebene: "GOZ",
		nr: "0060",
		zahn: "",
		anzahl: 1,
		sitzung: 1,
		grund: "Situationsmodelle/Planung",
		zusatz: "begleit",
		auto: true
	});
	if (r.begleitStufe >= 2) for (const s of sitzungen) {
		positionen.push({
			id: `zus:3290:${s}`,
			ebene: "GOZ",
			nr: "3290",
			zahn: "",
			anzahl: 1,
			sitzung: s,
			grund: "Kontrolle nach chirurgischem Eingriff",
			zusatz: "begleit",
			auto: true
		});
		positionen.push({
			id: `zus:3300:${s}`,
			ebene: "GOZ",
			nr: "3300",
			zahn: "",
			anzahl: 2,
			sitzung: s,
			grund: "Nachbehandlung nach chirurgischem Eingriff",
			zusatz: "begleit",
			auto: true
		});
	}
	if (r.begleitStufe >= 3) zuschlagProSitzung(positionen, basis, sitzungen, "0110", MIKROSKOP_ZUSCHLAG.nummern, Infinity, "Operationsmikroskop");
	if (r.begleitStufe >= 4) zuschlagProSitzung(positionen, basis, sitzungen, "0120", LASER_ZUSCHLAG.nummern, LASER_ZUSCHLAG.hoechstbetrag, "Laseranwendung");
	if (r.schabloneStufe >= 1 && impl.length) positionen.push(...schablone(impl, r.schabloneStufe));
	const regionenMitAugmentation = REGIONEN.filter((reg) => {
		const o = plan.regionen[reg];
		return o && (o.augmentation || o.boneSplitting || o.sinusIntern || o.sinusExtern);
	});
	const eigenblutRegionen = REGIONEN.filter((reg) => plan.regionen[reg]?.eigenblut);
	const bewOpt = {
		bewertung: r.analogBewertung,
		gozFaktor: effGoz,
		goaeFaktor: effGoae,
		stundensatz: einst.stundensatz,
		materialEinkalkulieren: einst.materialAnalog
	};
	const anbieten = (leistung, zahn, idSuffix, sitzung, materialBetrag = 0) => {
		const wahl = analogWaehlen(leistung, {
			...bewOpt,
			materialBetrag
		});
		positionen.push(analogPosition(`zus:analog:${leistung.id}:${idSuffix}`, zahn, sitzung, leistung, wahl));
	};
	for (const leistung of ANALOG_KATALOG) {
		if (leistung.stufe > r.analogStufe) continue;
		switch (leistung.bedarf) {
			case "planung":
				if (impl.length) anbieten(leistung, "", "fall", 1);
				else nichtAngesetzt.push(`${leistung.titel}: keine Implantatplanung vorhanden.`);
				break;
			case "insertion":
				if (impl.length) impl.forEach((z) => anbieten(leistung, z, z, 3));
				else nichtAngesetzt.push(`${leistung.titel}: keine Implantation geplant.`);
				break;
			case "freilegung": {
				const gedeckt = impl.filter((z) => (plan.implantate[z]?.deckung ?? "gedeckt") === "gedeckt");
				if (gedeckt.length) gedeckt.forEach((z) => anbieten(leistung, z, z, 4));
				else nichtAngesetzt.push(`${leistung.titel}: keine zweizeitige Freilegung geplant.`);
				break;
			}
			case "augmentation":
				if (regionenMitAugmentation.length) regionenMitAugmentation.forEach((reg) => anbieten(leistung, reg, reg, 3));
				else nichtAngesetzt.push(`${leistung.titel}: keine Augmentation geplant.`);
				break;
			case "extraktion":
				if (leistung.id === "socket-shield") {
					const shields = Object.keys(plan.zaehne).filter((z) => (plan.zaehne[z]?.TP ?? "").trim().toUpperCase() === "ISS");
					if (shields.length) shields.forEach((z) => anbieten(leistung, z, z, 3));
					else nichtAngesetzt.push(`${leistung.titel}: kein Socket-Shield (ISS) geplant.`);
				} else {
					const sp = Object.keys(plan.zaehne).filter((z) => (plan.zaehne[z]?.TP ?? "").trim().toUpperCase() === "XS");
					if (sp.length) sp.forEach((z) => {
						const o = plan.regionen[regionVon(z)];
						const kem = o?.material && o.material !== "autolog" ? materialFuerKlasse(o.material === "allogen" ? "kem-allogen" : o.material === "synthetisch" ? "kem-synthetisch" : "kem-xenogen", klasse) : void 0;
						anbieten(leistung, z, z, 2, kem ? materialPreis(kem, einst.materialPreise) : 0);
					});
					else nichtAngesetzt.push(`${leistung.titel}: keine Socket Preservation (XS) geplant.`);
				}
				break;
			case "sedierung":
				if (leistung.id === "lachgas" && plan.global.sedierung === "lachgas" || leistung.id === "pulsoxymetrie" && (plan.global.sedierung === "lachgas" || plan.global.sedierung === "analgosedierung")) anbieten(leistung, "", "sed", 3);
				else nichtAngesetzt.push(`${leistung.titel}: Sedierung nicht gewählt.`);
				break;
			case "antikoagulation":
				if (plan.global.risiko) anbieten(leistung, "", "risk", 3);
				else nichtAngesetzt.push(`${leistung.titel}: kein Risikopatient markiert.`);
				break;
			case "eigenblut":
				if (plan.global.blut !== "keine" && (eigenblutRegionen.length || regionenMitAugmentation.length)) (eigenblutRegionen.length ? eigenblutRegionen : regionenMitAugmentation).forEach((reg) => anbieten(leistung, reg, reg, 3));
				else nichtAngesetzt.push(`${leistung.titel}: kein Eigenblut gewählt.`);
				break;
			case "immer": if (impl.length || regionenMitAugmentation.length) anbieten(leistung, "", "fall", 3);
			else nichtAngesetzt.push(`${leistung.titel}: keine Grundlage im Plan.`);
		}
	}
	if (plan.global.blut !== "keine") {
		const protokoll = standardProtokoll(plan.global.blut);
		const blutSitzungen = sitzungen.length ? sitzungen : [3];
		for (const s of blutSitzungen) positionen.push({
			id: `zus:goae250:${s}`,
			ebene: "GOAE",
			nr: "250",
			zahn: "",
			anzahl: 1,
			sitzung: s,
			grund: "Blutentnahme für Eigenblutaufbereitung",
			zusatz: "begleit",
			auto: true
		});
		const anzahlRoehrchen = plan.global.roehrchen > 0 ? plan.global.roehrchen : protokoll.roehrchenProSitzung * blutSitzungen.length;
		positionen.push({
			id: "zus:blut-material",
			ebene: "MAT",
			nr: protokoll.materialId,
			zahn: "",
			anzahl: anzahlRoehrchen,
			sitzung: 3,
			text: `${protokoll.roehrchen}`,
			material: true,
			zusatz: "begleit",
			auto: true,
			grund: "Blutröhrchen/Kit"
		});
	}
	return {
		positionen,
		nichtAngesetzt
	};
}
/** Zuschlag (0110/0120) je Sitzung einmal, Einfachsatz, optional gedeckelt. */
function zuschlagProSitzung(ziel, basis, sitzungen, nr, nummern, cap, grund) {
	const erlaubt = new Set(nummern);
	for (const s of sitzungen) {
		const inSitzung = basis.filter((p) => p.sitzung === s && p.ebene === "GOZ" && erlaubt.has(p.nr));
		if (!inSitzung.length) continue;
		const hoechsterEinfachsatz = Math.max(...inSitzung.map((p) => gozEinzel(p.nr, 1)));
		const betrag = nr === "0110" ? gozEinzel("0110", 1) : Math.min(cap, hoechsterEinfachsatz);
		ziel.push({
			id: `zus:${nr}:${s}`,
			ebene: "GOZ",
			nr,
			zahn: "",
			anzahl: 1,
			sitzung: s,
			faktor: 1,
			preis: betrag,
			grund,
			zusatz: "begleit",
			auto: true
		});
	}
}
//#endregion
//#region src/engine/begruendung.ts
var GRUPPEN = [
	[/^90(00|03|05)$/, "Erhöhter Zeit- und Analyseaufwand bei der dreidimensionalen Implantatplanung und Schablonenkontrolle."],
	[/^9010$/, "Erschwerte Implantatinsertion bei reduziertem Knochenangebot, besondere Lagerbedingungen und erhöhter Aufwand für primärstabile Positionierung."],
	[/^90(40|50|60)$/, "Erhöhter Aufwand bei der Freilegung bzw. Aufbaumontage durch verdickte Mukosa und schwierige Zugänglichkeit."],
	[/^9090$/, "Erschwerte Knochengewinnung bei dünner Kortikalis und eingeschränktem Zugang."],
	[/^91(00|10|20|30)$/, "Aufwändige Augmentation bei ausgedehntem vertikalem/horizontalem Defekt, erschwerte Darstellung und Membranfixierung."],
	[/^9140$/, "Erschwerte intraorale Knochenblockentnahme mit Darstellung und Schonung benachbarter Strukturen."],
	[/^9150$/, "Aufwändige Fixation des Augmentates mit mehrfacher Osteosynthese zur Lagestabilisierung."],
	[/^91(60|70)$/, "Erschwerte Materialentfernung durch Osteotomie bei verwachsenem Lager."],
	[/^30(00|10|20|30|40|45)$/, "Erschwerte Zahn-/Wurzelentfernung bei besonderer Lagebeziehung und erhöhtem Zeitaufwand zur Schonung der Nachbarstrukturen."],
	[/^3(100|240|210|230)$/, "Aufwändige plastische Weichgewebsdeckung mit spannungsfreier Adaptation und erhöhtem Nahtaufwand."],
	[/^41(00|10|20|30|33|38)$/, "Erhöhter Aufwand bei der regenerativen bzw. plastischen Maßnahme durch ausgedehnten Defekt und erschwerte Darstellung."],
	[/^00(80|90)$|^0100$/, "Erhöhter Aufwand der Anästhesie bei ausgedehntem Operationsgebiet und mehreren Injektionsorten."]
];
function standardBegruendung(nr) {
	for (const [re, text] of GRUPPEN) if (re.test(nr)) return text;
	return "Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand im konkreten Behandlungsfall.";
}
//#endregion
//#region src/engine/berechnung.ts
var euro = (x) => x.toLocaleString("de-DE", {
	style: "currency",
	currency: "EUR"
});
var key = (p) => `${p.ebene}|${p.nr}|${p.zahn}`;
/** Alle Positionen (Planung → Regelwerk → Sitzungen → Regler) zusammenführen. */
function positionen(plan, einst) {
	const basis = planen(plan, einst);
	const nachRegel = regelwerkAnwenden(basis.positionen);
	const nachSitzung = sitzungenErgaenzen(plan, nachRegel.positionen, einst);
	const zusatz = zusatzleistungen(plan, nachSitzung.positionen, einst);
	const alleAuto = regelwerkAnwenden([...nachSitzung.positionen, ...zusatz.positionen]);
	const entfernt = new Set(plan.entfernt);
	const aus = new Set(plan.regler.aus);
	return {
		positionen: [...alleAuto.positionen.filter((p) => !entfernt.has(p.id) && !aus.has(key(p))).map((p) => ({
			...p,
			...plan.anpassungen[p.id]
		})), ...plan.manuell],
		hinweise: [
			...basis.hinweise,
			...nachRegel.hinweise,
			...nachSitzung.hinweise,
			...alleAuto.hinweise
		],
		nichtAngesetzt: zusatz.nichtAngesetzt
	};
}
/** Netto-EK eines Material-Postens auflösen (Katalog, Implantatteil oder fester Preis). */
function materialEinzel(p, einst) {
	if (p.preis !== void 0) return runden(p.preis);
	if (p.nr.startsWith("impl:")) {
		const [, sysId, teil] = p.nr.split(":");
		return runden(implantatkoerper(sysId).preise[teil] ?? 0);
	}
	const posten = materialFinden(p.nr);
	if (posten) return runden(einst.materialPreise[posten.id] ?? posten.preis);
	return 0;
}
function kalkulieren(plan, einst) {
	const { positionen: alle, hinweise, nichtAngesetzt } = positionen(plan, einst);
	const r = plan.regler;
	const stdGoz = r.gozFaktor > 0 ? r.gozFaktor : einst.gozFaktor;
	const stdGoae = r.goaeFaktor > 0 ? r.goaeFaktor : einst.goaeFaktor;
	const gozMax = einst.erlaubeUeber35 ? 5 : GOZ_HOECHSTSATZ;
	const aufschlag = Math.min(Math.max(r.laborAufschlag, -20), 50);
	const honorarGoz = [];
	const honorarGoae = [];
	const material = [];
	const labor = [];
	for (const p of alle) {
		const anteil = p.gebuehrenanteil ?? 1;
		if (p.ebene === "GOZ") {
			const eintrag = GOZ.get(p.nr);
			if (p.analog && p.preis !== void 0) {
				honorarGoz.push({
					...p,
					faktor: p.faktor,
					einzel: runden(p.preis),
					text: p.text || p.analogText || "–",
					betrag: runden(p.preis * p.anzahl)
				});
				continue;
			}
			let faktor = Math.min(Math.max(p.faktor ?? stdGoz, 1), gozMax);
			if (p.preis !== void 0) faktor = p.faktor ?? 1;
			const einzel = p.preis !== void 0 ? runden(p.preis) : runden(gozEinzel(p.nr, faktor) * anteil);
			if (!eintrag && p.preis === void 0) hinweise.push(`GOZ ${p.nr} ist im Gebührenverzeichnis nicht vorhanden.`);
			if (faktor > gozMax) hinweise.push(`GOZ ${p.nr}: Faktor über ${gozMax.toFixed(1)} ist unzulässig.`);
			if (faktor > 3.5) hinweise.push(`GOZ ${p.nr}: Faktor ${faktor.toFixed(1).replace(".", ",")} über 3,5 erfordert eine schriftliche Vereinbarung nach § 2 GOZ.`);
			honorarGoz.push({
				...p,
				faktor,
				einzel,
				punkte: eintrag?.punkte,
				text: p.text || eintrag?.text || "–",
				begruendung: faktor > 2.3 && !p.preis ? p.begruendung || standardBegruendung(p.nr) : p.begruendung,
				betrag: runden(einzel * p.anzahl)
			});
		} else if (p.ebene === "GOAE") {
			const eintrag = GOAE.get(p.nr);
			if (p.analog && p.preis !== void 0) {
				honorarGoae.push({
					...p,
					faktor: p.faktor,
					einzel: runden(p.preis),
					text: p.text || p.analogText || "–",
					betrag: runden(p.preis * p.anzahl)
				});
				continue;
			}
			const rahmen = goaeRahmen(p.nr);
			const faktor = Math.min(Math.max(p.faktor ?? stdGoae, 1), rahmen.max);
			const einzel = p.preis !== void 0 ? runden(p.preis) : runden(goaeEinzel(p.nr, faktor) * anteil);
			if (!eintrag && p.preis === void 0) hinweise.push(`GOÄ ${p.nr} ist nicht in der geöffneten Liste vorhanden.`);
			honorarGoae.push({
				...p,
				faktor,
				einzel,
				punkte: eintrag?.punkte,
				text: p.text || eintrag?.text || "–",
				begruendung: faktor > rahmen.schwelle ? p.begruendung || standardBegruendung(p.nr) : p.begruendung,
				betrag: runden(einzel * p.anzahl)
			});
		} else if (p.ebene === "BEB") {
			const eigen = p.preis === void 0 ? eigenFinden(eigenKatalog(einst.eigenlabor), p.nr, { auto: p.auto }) : void 0;
			const eintrag = BEB.get(p.nr);
			const einzel = p.preis !== void 0 ? runden(p.preis) : eigen ? runden(eigen.preis) : runden((eintrag?.preis ?? 0) * (1 + aufschlag / 100));
			if (p.preis === void 0 && !eigen && !eintrag) hinweise.push(`BEB ${p.nr} ist in der Laborpreisliste nicht vorhanden – Preis bitte eintragen.`);
			labor.push({
				...p,
				einzel,
				...eigen ? { eigen: eigen.nr } : {},
				text: p.text || eigen?.text || eintrag?.text || "Laborleistung",
				betrag: runden(einzel * p.anzahl)
			});
		} else {
			const einzel = materialEinzel(p, einst);
			material.push({
				...p,
				einzel,
				text: p.text || "Material",
				betrag: runden(einzel * p.anzahl)
			});
		}
	}
	const sort = (a, b) => (a.sitzung ?? 0) - (b.sitzung ?? 0) || a.nr.localeCompare(b.nr) || a.zahn.localeCompare(b.zahn);
	honorarGoz.sort(sort);
	honorarGoae.sort(sort);
	material.sort(sort);
	labor.sort(sort);
	const summe = (z) => runden(z.reduce((s, x) => s + x.betrag, 0));
	const summeGoz = summe(honorarGoz);
	const summeGoae = summe(honorarGoae);
	const summeMaterialNetto = summe(material);
	const summeLaborNetto = summe(labor);
	const mwst = runden((summeMaterialNetto + summeLaborNetto) * einst.mwst / 100);
	return {
		honorarGoz,
		honorarGoae,
		material,
		labor,
		summeGoz,
		summeGoae,
		summeMaterialNetto,
		summeLaborNetto,
		mwst,
		gesamt: runden(summeGoz + summeGoae + summeMaterialNetto + summeLaborNetto + mwst),
		hinweise,
		nichtAngesetzt
	};
}
//#endregion
//#region src/stammdaten.ts
var leererPatient = () => ({
	anrede: "",
	vorname: "",
	name: "",
	geburtsdatum: "",
	strasse: "",
	plz: "",
	ort: "",
	kasse: "",
	kassenNr: "",
	versichertenNr: "",
	status: "",
	kassenart: "primaer"
});
var standardPraxis = () => ({
	name: "Zahnarztpraxis",
	zahnarzt: "",
	strasse: "",
	plz: "",
	ort: "",
	telefon: "",
	email: "",
	zahnarztNr: "",
	abrechnungsNr: "",
	kzvNr: ""
});
//#endregion
//#region src/planNeu.ts
var heute = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
var STANDARD_EINSTELLUNGEN = {
	praxis: standardPraxis(),
	gozFaktor: 2.3,
	goaeFaktor: 2.3,
	mwst: 19,
	gueltigMonate: 6,
	naechsteNummer: 1,
	erlaubeUeber35: false,
	stundensatz: 450,
	materialAnalog: true,
	materialPreise: {}
};
var STANDARD_REGLER = {
	begleitStufe: 1,
	analogStufe: 1,
	analogBewertung: 1,
	gozFaktor: 0,
	goaeFaktor: 0,
	materialKlasse: 1,
	schabloneStufe: 0,
	laborAufschlag: 0,
	aus: []
};
var STANDARD_GLOBAL = {
	bildgebung: "dvt",
	navigation: false,
	sedierung: "lokal",
	risiko: false,
	blut: "keine",
	roehrchen: 0,
	eigenesBlutlabor: true
};
var nummerFormat = (n) => `IMPL-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(n).padStart(3, "0")}`;
function neuerPlan(nummer) {
	return {
		nummer: nummerFormat(nummer),
		datum: heute(),
		patient: leererPatient(),
		zaehne: {},
		implantate: {},
		regionen: {},
		global: { ...STANDARD_GLOBAL },
		manuell: [],
		anpassungen: {},
		entfernt: [],
		regler: { ...STANDARD_REGLER },
		bemerkung: ""
	};
}
//#endregion
//#region src/clara/index.ts
/**
* Einstieg für MAS/Clara: Kostenvoranschlag Implantologie per Sprache. Versteht den gesprochenen Auftrag
* ("Implantate 36 und 46, Sinuslift extern, Knochenaufbau mit Bio-Oss, navigiert"), prüft ihn gegen den 01 und
* rechnet mit der Engine dieses Planers. `npm run build:engine` baut daraus MAS-2/backend/src/vendor/impl-engine.mjs.
* Die Versorgung auf den Implantaten (Krone, Brücke, Prothese) plant der Planer Zahnersatz privat.
*/
var ENGINE_STAND = "2026-10-15 22:48";
var GUELTIG = new Set(ALLE_ZAEHNE);
/** 01: dort steht schon ein Implantat */
var STEHT_IMPLANTAT = /* @__PURE__ */ new Set([
	"i",
	"sk",
	"skw",
	"st",
	"stw",
	"so",
	"sow"
]);
/** 01: kein eigener Zahn an der Stelle – Implantat geht */
var LUECKE = /* @__PURE__ */ new Set([
	"f",
	"e",
	"ew",
	"b",
	"bw",
	"ab",
	"abw",
	"sb",
	"sbw",
	"se",
	"sew",
	"ix"
]);
var SOFORT = /sofort/i;
var SPAET = /sp(?:ä|ae)t|verz(?:ö|oe)gert|erst (?:ent|zieh|extrah|raus)|nach (?:der )?(?:entfernung|extraktion|heilung|abheilung)/i;
var SYSTEM_WORT = [
	[/straumann/i, "straumann-bl"],
	[/nobel/i, "nobel-active"],
	[/astra|dentsply/i, "astra-ev"],
	[/camlog|conelog/i, "camlog"],
	[/\bicx\b|medentis/i, "medentis-icx"],
	[/\bbego\b|semados/i, "bego-semados"],
	[/bredent|copa ?sky/i, "bredent-copasky"],
	[/\bmis\b/i, "mis-c1"],
	[/osstem/i, "osstem-tsiii"],
	[/megagen|any ?ridge/i, "megagen-anyridge"]
];
function zaehneFinden(t) {
	const out = [];
	const re = /(?<!\d|\d[,.])([1-4])\s?[,.]?\s?([1-8])(?!\d|[,.]\d|\s*(?:euro|€|prozent|%|-?\s?fach|mal\b|mm\b|millimeter|r(?:ö|oe)hrchen))/gi;
	for (let m = re.exec(t); m; m = re.exec(t)) {
		if (/(?:faktor|durchmesser|l(?:ä|ae)nge)\s*$/i.test(t.slice(Math.max(0, m.index - 12), m.index))) continue;
		const zahn = m[1] + m[2];
		if (GUELTIG.has(zahn) && !out.includes(zahn)) out.push(zahn);
	}
	return out;
}
/** Erkennt Implantat-Positionen, Zeitpunkt, chirurgische Zusatzmaßnahmen und globale Angaben. */
function implAuftragVerstehen(roh) {
	const t = roh.replace(/\s+/g, " ").replace(/\b(\d\d),(?=\d\d\b)/g, "$1, ");
	const k = t.toLowerCase();
	const o = {};
	const sinus = /sinus|kieferh(?:ö|oe)hle/.test(k);
	let sinusOffen = false;
	if (sinus) {
		if (/intern|geschlossen|osteotom|krestal|crestal|summers/.test(k)) o.sinusIntern = true;
		else if (/extern|lateral|fenster/.test(k)) o.sinusExtern = true;
		else sinusOffen = true;
	}
	if (/augment|knochenaufbau|aufbau des kiefer|kieferkamm\w*aufbau|\bgbr\b|knochenregeneration/.test(k)) o.augmentation = true;
	if (/bone ?split|bone ?spread|splitting|spreading|kammspreiz/.test(k)) o.boneSplitting = true;
	if (/knochenblock|blockentnahme|block ?transplant/.test(k)) o.blockEntnahme = true;
	if (/knochenring/.test(k)) o.ringEntnahme = true;
	if (/kollektor|safe ?scraper|knochenfilter|knochenschaber/.test(k)) o.kollektor = true;
	if (/pins?\b|osteosynthese|fixier/.test(k) && (o.augmentation || o.blockEntnahme || o.ringEntnahme)) o.fixierung = true;
	if (/eigen(?:e[mnrs]?)? knochen|autolog/.test(k)) o.material = "autolog";
	else if (/allogen|spender|maxgraft/.test(k)) o.material = "allogen";
	else if (/xenogen|bio-? ?oss|rind|bovin|cerabone/.test(k)) o.material = "xenogen";
	else if (/synthetisch|alloplast|\btcp\b|hydroxyl/.test(k)) o.material = "synthetisch";
	const materialAngenommen = !!(o.augmentation || o.sinusIntern || o.sinusExtern || sinusOffen || o.boneSplitting) && !o.material && !o.blockEntnahme && !o.ringEntnahme;
	if (materialAngenommen) o.material = "xenogen";
	if (/ohne membran|keine membran/.test(k)) o.membran = "keine";
	else if (/titan/.test(k)) o.membran = "titan";
	else if (/nicht[\s-]?resorb|ptfe/.test(k)) o.membran = "nicht-resorbierbar";
	else if (/vlies|kollagenvlies/.test(k)) o.membran = "vlies";
	else if (/membran/.test(k)) o.membran = "resorbierbar";
	const membranAngenommen = !o.membran && !!(o.augmentation || o.sinusExtern || sinusOffen);
	if (membranAngenommen) o.membran = "resorbierbar";
	if (/bindegewebe|\bbgt\b|\bctg\b/.test(k)) o.weichgewebe = "btt";
	else if (/schleimhauttransplant|\bfst\b|freies schleimhaut/.test(k)) o.weichgewebe = "fst";
	else if (/vestibulumplastik/.test(k)) o.weichgewebe = "vestibulumplastik";
	else if (/roll-?lappen/.test(k)) o.weichgewebe = "rolllappen";
	const g = {};
	if (/\bprgf\b|endoret/.test(k)) g.blut = "prgf";
	else if (/\bprp\b/.test(k)) g.blut = "prp";
	else if (/\bprf\b|eigenblut|\bprf-|a-prf|i-prf/.test(k)) g.blut = "prf";
	if (g.blut) o.eigenblut = true;
	if (/navig|bohrschablone|schablone|gef(?:ü|ue)hrt/.test(k)) g.navigation = true;
	const dvt = /\bdvt\b|\bdvts\b|3d-?r(?:ö|oe)ntgen|digitale volumen/.test(k);
	const opg = /\bopg\b|panorama|orthopantomo/.test(k);
	if (/ohne (?:neues )?dvt|dvt (?:liegt|ist|haben wir) (?:schon |bereits )?(?:vor|da)|dvt vorhanden|kein (?:neues )?dvt/.test(k)) g.bildgebung = opg ? "opg" : "keine";
	else if (dvt && opg) g.bildgebung = "opg+dvt";
	else if (opg) g.bildgebung = "opg";
	if (/lachgas/.test(k)) g.sedierung = "lachgas";
	else if (/vollnarkose|\bnarkose|\bitn\b|intubation/.test(k)) g.sedierung = "itn";
	else if (/sedierung|sediert|d(?:ä|ae)mmerschlaf|analgosed/.test(k)) g.sedierung = "analgosedierung";
	if (/marcumar|antikoag|blutverd(?:ü|ue)nn|risikopatient|\basa ?(?:3|iii|drei)\b/.test(k)) g.risiko = true;
	const deckung = /einzeitig|offen einheil|transgingival|gingivaformer gleich/.test(k) ? "offen" : "gedeckt";
	const system = SYSTEM_WORT.find(([re]) => re.test(t))?.[1] ?? "durchschnitt";
	return {
		zaehne: zaehneFinden(t),
		sofort: SOFORT.test(t),
		spaet: SPAET.test(t),
		regionen: o,
		sinusOffen,
		materialAngenommen,
		membranAngenommen,
		global: g,
		deckung,
		system,
		prothetik: /krone|br(?:ü|ue)cke|prothese|teleskop|\bsteg\b|suprakonstruktion/.test(k)
	};
}
var liste = (xs) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs.at(-1)}`;
var sortiert = (zs) => [...zs].sort((a, b) => ALLE_ZAEHNE.indexOf(a) - ALLE_ZAEHNE.indexOf(b));
var befundName = (code) => {
	if (!code) return "ein eigener Zahn";
	const n = BEFUND_KUERZEL[code];
	if (!n) return `„${code}“`;
	const kopf = n.match(/\p{Lu}[\p{L}-]*/u)?.[0] ?? "";
	return `ein${/(?:zahn|implantat|glied|element|teil|schluss)$/i.test(kopf) ? "" : "e"} ${n}`;
};
var IST_OK_SEITE = (r) => r === "OK-R" || r === "OK-L";
var MASSNAHME = [
	["sinusExtern", "externer Sinuslift"],
	["sinusIntern", "interner Sinuslift"],
	["augmentation", "Knochenaufbau"],
	["boneSplitting", "Bone Splitting"],
	["blockEntnahme", "Knochenblock"],
	["ringEntnahme", "Knochenring"]
];
var WEICHGEWEBE = {
	btt: "Bindegewebstransplantat",
	fst: "Schleimhauttransplantat",
	vestibulumplastik: "Vestibulumplastik",
	rolllappen: "Rolllappen"
};
var SEDIERUNG = {
	lachgas: "Lachgas",
	analgosedierung: "Analgosedierung",
	itn: "Vollnarkose"
};
/** Gesprochener Auftrag + 01 → gerechneter Kostenvoranschlag Implantologie (ohne Nummer) oder Rückfrage */
function implEntwurf(auftragText, befund = {}, optionen = {}) {
	const a = implAuftragVerstehen(auftragText);
	if (!a.zaehne.length) return {
		status: "rueckfrage",
		grund: "zaehne",
		frage: "An welchen Zähnen soll ich Implantate planen?"
	};
	const zaehne = sortiert(a.zaehne);
	const mitBefund = Object.values(befund).some((c) => String(c ?? "").trim());
	const hinweise = [];
	const sofort = [];
	for (const zahn of zaehne) {
		const code = String(befund[zahn] ?? "").trim().toLowerCase();
		if (!mitBefund || LUECKE.has(code)) {
			if (code === "ix") hinweise.push(`Zahn ${zahn}: das vorhandene Implantat muss vorher entfernt werden, die Explantation bitte im Planer ergänzen.`);
			if (mitBefund && a.sofort) hinweise.push(`Zahn ${zahn}: laut Befund steht dort kein Zahn, ich habe ein Spätimplantat geplant.`);
			else if (!mitBefund && a.sofort) sofort.push(zahn);
			continue;
		}
		if (STEHT_IMPLANTAT.has(code)) return {
			status: "rueckfrage",
			grund: "befund_konflikt",
			zahn,
			frage: `Laut Befund steht an ${zahn} schon ein Implantat. Welchen Zahn meinen Sie?`
		};
		if (code === ")(") return {
			status: "rueckfrage",
			grund: "befund_konflikt",
			zahn,
			frage: `Laut Befund ist an ${zahn} ein Lückenschluss, dort ist kein Platz für ein Implantat. Welchen Zahn meinen Sie?`
		};
		if (a.sofort) {
			sofort.push(zahn);
			continue;
		}
		if (a.spaet) {
			hinweise.push(`Zahn ${zahn}: die Entfernung vor dem Implantat bitte im Planer ergänzen.`);
			continue;
		}
		if (code === "x") return {
			status: "rueckfrage",
			grund: "zeitpunkt",
			zahn,
			frage: `Laut Befund ist ${zahn} nicht erhaltungswürdig. Soll ich sofort implantieren oder später nach der Entfernung?`
		};
		return {
			status: "rueckfrage",
			grund: "befund_konflikt",
			zahn,
			frage: `Laut Befund steht an ${zahn} noch ${befundName(code)}. Soll der Zahn raus und sofort implantiert werden, oder meinen Sie einen anderen Zahn?`
		};
	}
	const regionen = REGIONEN.filter((r) => zaehne.some((z) => regionVon(z) === r));
	const sinusRegionen = regionen.filter(IST_OK_SEITE);
	if (a.sinusOffen && sinusRegionen.length) return {
		status: "rueckfrage",
		grund: "sinus",
		frage: "Interner oder externer Sinuslift?"
	};
	const einst = {
		...STANDARD_EINSTELLUNGEN,
		...optionen.einstellungen,
		praxis: {
			...STANDARD_EINSTELLUNGEN.praxis,
			...optionen.einstellungen?.praxis
		}
	};
	const basis = neuerPlan(1);
	const system = a.system !== "durchschnitt" ? a.system : implantatkoerper(optionen.implantatSystem ?? "").id;
	const { sinusIntern, sinusExtern, ...rest } = a.regionen;
	const planRegionen = {};
	for (const r of regionen) {
		const ro = { ...rest };
		if (IST_OK_SEITE(r)) Object.assign(ro, sinusIntern ? { sinusIntern } : {}, sinusExtern ? { sinusExtern } : {});
		planRegionen[r] = ro;
	}
	if ((sinusIntern || sinusExtern || a.sinusOffen) && !sinusRegionen.length) hinweise.push("Ein Sinuslift geht nur im Oberkiefer-Seitenzahnbereich, den habe ich nicht angesetzt.");
	const plan = {
		...basis,
		nummer: "",
		patient: {
			...basis.patient,
			...optionen.patient
		},
		zaehne: Object.fromEntries(zaehne.map((z) => [z, {
			B: "",
			TP: sofort.includes(z) ? "IS" : "I"
		}])),
		implantate: Object.fromEntries(zaehne.map((z) => [z, {
			system,
			durchmesser: 4.1,
			laenge: 10,
			zeitpunkt: sofort.includes(z) ? "sofort" : "verzoegert",
			deckung: a.deckung,
			abutment: "standard"
		}])),
		regionen: planRegionen,
		global: {
			...basis.global,
			...a.global
		}
	};
	const rechnung = kalkulieren(plan, einst);
	const massnahmen = [];
	for (const [feld, name] of MASSNAHME) if (regionen.some((r) => planRegionen[r]?.[feld])) massnahmen.push(name);
	if (a.regionen.weichgewebe) massnahmen.push(WEICHGEWEBE[a.regionen.weichgewebe]);
	if (a.global.blut) massnahmen.push(a.global.blut.toUpperCase());
	if (plan.global.navigation) massnahmen.push("navigiert mit Bohrschablone");
	if (SEDIERUNG[plan.global.sedierung]) massnahmen.push(SEDIERUNG[plan.global.sedierung]);
	const aufbauRegionen = regionen.filter((r) => planRegionen[r]?.augmentation);
	if (aufbauRegionen.length && regionen.length > 1) hinweise.push(`Den Knochenaufbau habe ich für ${liste(aufbauRegionen.map((r) => REGION_NAME[r]))} angesetzt.`);
	if (a.materialAngenommen && a.membranAngenommen) hinweise.push("Angenommen habe ich xenogenen Knochenersatz und eine resorbierbare Membran.");
	else if (a.materialAngenommen) hinweise.push("Als Knochenersatz habe ich xenogenes Material angenommen.");
	else if (a.membranAngenommen) hinweise.push("Eine resorbierbare Membran habe ich angenommen.");
	if (plan.global.bildgebung === "dvt" && !a.global.bildgebung) hinweise.push("Ein DVT zur Planung ist enthalten.");
	if (plan.global.sedierung === "itn") hinweise.push("Die Vollnarkose rechnet der Anästhesist gesondert ab.");
	if (a.prothetik) hinweise.push("Die Versorgung auf den Implantaten plant der Planer Zahnersatz privat.");
	const { regler: _, ...ablagePlan } = plan;
	return {
		status: "ok",
		plan,
		ablagePlan,
		rechnung,
		hinweise: [...new Set(hinweise)],
		zusammenfassung: {
			spaet: zaehne.filter((z) => !sofort.includes(z)),
			sofort,
			massnahmen,
			summe: rechnung.gesamt,
			honorar: Math.round((rechnung.summeGoz + rechnung.summeGoae) * 100) / 100,
			materialLabor: Math.round((rechnung.summeMaterialNetto + rechnung.summeLaborNetto + rechnung.mwst) * 100) / 100
		}
	};
}
/** "Implantate an 36 und 46, Sofortimplantat an 11; dazu externer Sinuslift und Knochenaufbau" */
function implVersorgungSatz(z) {
	const teile = [];
	if (z.spaet.length) teile.push(`${z.spaet.length > 1 ? "Implantate" : "Implantat"} an ${liste(z.spaet)}`);
	if (z.sofort.length) teile.push(`${z.sofort.length > 1 ? "Sofortimplantate" : "Sofortimplantat"} an ${liste(z.sofort)}`);
	return `${teile.join(", ")}${z.massnahmen.length ? `; dazu ${liste(z.massnahmen)}` : ""}`;
}
//#endregion
export { ENGINE_STAND, euro, implAuftragVerstehen, implEntwurf, implVersorgungSatz };
