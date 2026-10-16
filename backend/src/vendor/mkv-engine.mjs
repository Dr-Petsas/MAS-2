// GENERIERT aus F:\PlanR\KONS\MKV (src/clara/index.ts) – nicht von Hand ändern.
// Neu bauen: cd F:\PlanR\KONS\MKV && npm run build:engine   (sha256 3ca362da1f36)
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
/** Kein natürlicher Zahn an der Stelle (fehlt, ersetzt, Brückenglied, Implantat) */
var KEIN_ZAHN = /* @__PURE__ */ new Set([
	"f",
	"e",
	"ew",
	"b",
	"bw",
	"ab",
	"abw",
	"i",
	"ix",
	"r",
	"rw",
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
/** Natürlicher Zahn, aber überkront bzw. als Pfeiler versorgt – keine Füllung, kein Inlay */
var VERSORGT = /* @__PURE__ */ new Set([
	"k",
	"kw",
	"pkw",
	"t",
	"tw",
	"t2w",
	"a",
	"aw"
]);
var KRONE_WIRD_ERNEUERT = /* @__PURE__ */ new Set([
	"kw",
	"pkw",
	"tw",
	"t2w",
	"aw"
]);
/** Was der Befund für die geplante Kons-Leistung an einem Zahn sagt */
function konsHinweis(code, art = "fuellung") {
	const c = code.trim().toLowerCase();
	const name = BEFUND_KUERZEL[c] ?? c;
	if (KEIN_ZAHN.has(c)) return {
		geht: false,
		text: `laut 01 ${name} – kein natürlicher Zahn`
	};
	if (c === "x") return {
		geht: false,
		text: "laut 01 nicht erhaltungswürdig"
	};
	if (VERSORGT.has(c)) {
		if (art === "endo") return {
			geht: true,
			text: `laut 01 ${name} – Zugang durch die Krone`
		};
		if (art === "aufbau" && KRONE_WIRD_ERNEUERT.has(c)) return {
			geht: true,
			text: `laut 01 ${name} – Aufbau vor der Neuversorgung`
		};
		return {
			geht: false,
			text: `laut 01 ${name}`
		};
	}
	if (c === "ww") {
		if (art === "fuellung") return {
			geht: true,
			text: "laut 01 weitgehend zerstört – eher Aufbau, Teilkrone oder Krone"
		};
		return {
			geht: true,
			text: "laut 01 weitgehend zerstört – Teilkrone oder Krone einplanen"
		};
	}
	if (c === "pw") return {
		geht: true,
		text: art === "fuellung" ? "laut 01 partieller Substanzdefekt" : ""
	};
	return {
		geht: true,
		text: ""
	};
}
`${typeof location === "undefined" ? "http://127.0.0.1:5189" : location.pathname.startsWith("/planer/") ? location.origin : location.hostname.endsWith(".pickadoc-tunnel.com") ? "https://planr.pickadoc-tunnel.com" : `http://${location.hostname}:5189`}`;
//#endregion
//#region src/data/katalog.ts
var BEMA_13 = [
	{
		nr: "13a",
		kuerzel: "F1",
		text: "Füllung einflächig",
		punkte: 33
	},
	{
		nr: "13b",
		kuerzel: "F2",
		text: "Füllung zweiflächig",
		punkte: 41
	},
	{
		nr: "13c",
		kuerzel: "F3",
		text: "Füllung dreiflächig",
		punkte: 53
	},
	{
		nr: "13d",
		kuerzel: "F4",
		text: "Füllung mehr als dreiflächig oder Eckenaufbau",
		punkte: 63
	}
];
/** Vergleichbare preisgünstigste plastische Füllung nach Flächenzahl. */
var bemaFuer = (flaechen) => BEMA_13[Math.min(4, Math.max(1, flaechen)) - 1];
var komposit = (f) => f <= 1 ? "2060" : f === 2 ? "2080" : f === 3 ? "2100" : "2120";
var einlage = (f) => f <= 1 ? "2150" : f === 2 ? "2160" : "2170";
var THERAPIEN = [
	{
		id: "komposit",
		kuerzel: "K",
		titel: "Kompositfüllung in Adhäsivtechnik",
		kurz: "Komposit adhäsiv (Seitenzahn)",
		goz: komposit,
		plastisch: true,
		hinweis: "Mehrkostenfähig im Seitenzahnbereich: adhäsiv befestigte Kompositfüllung statt selbstadhäsiver Kassenfüllung."
	},
	{
		id: "mehrfarben",
		kuerzel: "M",
		titel: "Kompositfüllung in Mehrfarbentechnik",
		kurz: "Mehrfarbentechnik (ästhetisch)",
		goz: komposit,
		plastisch: true,
		hinweis: "Mehrkostenfähig in Front- und Seitenzahnbereich: Mehrfarben-Schichttechnik zur ästhetischen Optimierung."
	},
	{
		id: "inlay",
		kuerzel: "I",
		titel: "Einlagefüllung (Inlay)",
		kurz: "Inlay (Keramik, CAD/CAM, Gold)",
		goz: einlage,
		plastisch: false,
		hinweis: "Einlagefüllung mit Laborleistung; Anästhesie und besondere Maßnahmen sind dabei keine Kassenleistung (BEMA-Bestimmung 2 zu Nr. 13)."
	},
	{
		id: "goldhaemmer",
		kuerzel: "G",
		titel: "Goldhämmerfüllung",
		kurz: "Goldhämmerfüllung (analog)",
		goz: einlage,
		analog: true,
		plastisch: false,
		hinweis: "In der GOZ nicht beschrieben, analog nach § 6 Abs. 1 GOZ (BZÄK-Katalog); Vergleichsleistung Einlagefüllung nach Flächen."
	},
	{
		id: "aufbau",
		kuerzel: "A",
		titel: "Adhäsiver Aufbau zur Aufnahme einer Krone",
		kurz: "Aufbau adhäsiv (vor Krone)",
		goz: () => "2180",
		plastisch: true,
		festbetrag: false,
		maxFlaechen: 4,
		hinweis: "Aufbaufüllung in adhäsiver Mehrschichttechnik (GOZ 2180 + 2197); die Kasse trägt die plastische Aufbaufüllung (BEMA 13a–d nach Flächen). Ein Glasfaserstift ist keine Mehrkostenleistung – dafür gilt eine Privatvereinbarung nach § 8 Abs. 7 BMV-Z."
	}
];
var THERAPIE = Object.fromEntries(THERAPIEN.map((t) => [t.id, t]));
Object.fromEntries(THERAPIEN.map((t) => [t.kuerzel, t]));
var STANDARD_LABOR = [
	{
		id: "keramik",
		name: "Keramik-Inlay (Fremdlabor)",
		preis: 185
	},
	{
		id: "cadcam",
		name: "CAD/CAM-Keramik (chairside)",
		preis: 120
	},
	{
		id: "gold",
		name: "Gold-Inlay (Labor + Legierung)",
		preis: 330
	}
];
var LABOR_KLASSE_FAKTOR = [
	.85,
	1,
	1.2
];
var punktwerte_default = {
	stand: "2026-10-07",
	quelle: "Punktwertuebersichten der KZVen (BW, BY, BE, LB, HH, HE, RLP, SL, SN, WL) sowie Fremdkassenlisten der KZV Sachsen (Q3/2026) und KZV Berlin (IV/2026); ZE: KZBV-Bekanntmachung zum 01.01.2026",
	hinweis: "Regional vereinbarte Punktwerte; verbindlich ist das aktuelle KZV-Rundschreiben.",
	kzv: /* @__PURE__ */ JSON.parse("{\"02\":{\"KCH\":{\"primaer\":1.3853,\"ersatz\":1.3758,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvbw.de/wp-content/uploads/2026-06-23-Punktwerttabelle_Stand_26.06.2026_vdek_Heilfuersorge.pdf\",\"geprueft\":true,\"hinweis\":\"vdek = HKK/HEK/KKH/DAK; BARMER 1,3761, TK 1,3769. Ersatzkassen-Abschluss rueckwirkend zum 01.01.2026.\"},\"KB\":{\"primaer\":1.3853,\"ersatz\":1.3758,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvbw.de/wp-content/uploads/2026-06-23-Punktwerttabelle_Stand_26.06.2026_vdek_Heilfuersorge.pdf\",\"geprueft\":true,\"hinweis\":\"vdek = HKK/HEK/KKH/DAK; BARMER 1,3761, TK 1,3769. Ersatzkassen-Abschluss rueckwirkend zum 01.01.2026.\"},\"PAR\":{\"primaer\":1.3853,\"ersatz\":1.3758,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvbw.de/wp-content/uploads/2026-06-23-Punktwerttabelle_Stand_26.06.2026_vdek_Heilfuersorge.pdf\",\"geprueft\":true,\"hinweis\":\"vdek = HKK/HEK/KKH/DAK; BARMER 1,3761, TK 1,3769. Ersatzkassen-Abschluss rueckwirkend zum 01.01.2026.\"},\"KFO\":{\"primaer\":1.1752,\"ersatz\":1.1676,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvbw.de/wp-content/uploads/2026-06-23-Punktwerttabelle_Stand_26.06.2026_vdek_Heilfuersorge.pdf\",\"geprueft\":true,\"hinweis\":\"BARMER 1,1677, TK 1,1688.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"11\":{\"KCH\":{\"primaer\":1.3795,\"ersatz\":1.3117,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.kzvb.de/fileadmin/user_upload/Abrechnung/Punktwerte/PW_Q4_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.01.2026; vdek noch Wert 2025 (gilt laut KZVB vorlaeufig bis zu neuer Vereinbarung weiter). BKK 1,3848, IKK 1,3854, Knappschaft 1,3883 (je ab 01.07.2026).\"},\"KB\":{\"primaer\":1.3795,\"ersatz\":1.3117,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.kzvb.de/fileadmin/user_upload/Abrechnung/Punktwerte/PW_Q4_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.01.2026; vdek noch Wert 2025 (gilt laut KZVB vorlaeufig bis zu neuer Vereinbarung weiter). BKK 1,3848, IKK 1,3854, Knappschaft 1,3883 (je ab 01.07.2026).\"},\"PAR\":{\"primaer\":1.3795,\"ersatz\":1.3117,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.kzvb.de/fileadmin/user_upload/Abrechnung/Punktwerte/PW_Q4_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.01.2026; vdek noch Wert 2025 (gilt laut KZVB vorlaeufig bis zu neuer Vereinbarung weiter). BKK 1,3848, IKK 1,3854, Knappschaft 1,3883 (je ab 01.07.2026).\"},\"KFO\":{\"primaer\":1.1858,\"ersatz\":1.1275,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.kzvb.de/fileadmin/user_upload/Abrechnung/Punktwerte/PW_Q4_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab Q1/2026; vdek-Wert aus 2025 gilt vorlaeufig weiter.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"30\":{\"KCH\":{\"primaer\":1.3378,\"ersatz\":1.3377,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/3_Publikationen/1_Rundschreiben/2026/SR_2026_01_KZV-Berlin_AOK-Vertrag_2026.pdf\",\"geprueft\":true,\"hinweis\":\"vdek-Wert laut KZV-Sachsen-Fremdkassenliste Q3/2026 (https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf).\"},\"KB\":{\"primaer\":1.3378,\"ersatz\":1.3377,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/3_Publikationen/1_Rundschreiben/2026/SR_2026_01_KZV-Berlin_AOK-Vertrag_2026.pdf\",\"geprueft\":true,\"hinweis\":\"vdek-Wert laut KZV-Sachsen-Fremdkassenliste Q3/2026 (https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf).\"},\"PAR\":{\"primaer\":1.3378,\"ersatz\":1.3377,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/3_Publikationen/1_Rundschreiben/2026/SR_2026_01_KZV-Berlin_AOK-Vertrag_2026.pdf\",\"geprueft\":true,\"hinweis\":\"vdek-Wert laut KZV-Sachsen-Fremdkassenliste Q3/2026 (https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf).\"},\"KFO\":{\"primaer\":1.1902,\"ersatz\":1.1901,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/1_Abrechnung/7_Punktwerte/2026/Punktwerte_2026_IV_Ersatzkassen.pdf\",\"geprueft\":true,\"hinweis\":\"AOK-Wert aus KZV-Berlin-Sonderrundschreiben AOK-Vertrag 2026.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"53\":{\"KCH\":{\"primaer\":1.3593,\"ersatz\":1.3452,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvlb.de/fileadmin/user_upload/Aktuelles/Punktwerte/27_05_PUNKTWERT%C3%9CBERSICHT_LAND_BRANDENBURG_ab_01.01.2026_.pdf\",\"geprueft\":true},\"KB\":{\"primaer\":1.3593,\"ersatz\":1.3452,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvlb.de/fileadmin/user_upload/Aktuelles/Punktwerte/27_05_PUNKTWERT%C3%9CBERSICHT_LAND_BRANDENBURG_ab_01.01.2026_.pdf\",\"geprueft\":true},\"PAR\":{\"primaer\":1.3593,\"ersatz\":1.3452,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvlb.de/fileadmin/user_upload/Aktuelles/Punktwerte/27_05_PUNKTWERT%C3%9CBERSICHT_LAND_BRANDENBURG_ab_01.01.2026_.pdf\",\"geprueft\":true},\"KFO\":{\"primaer\":1.2093,\"ersatz\":1.1730,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvlb.de/fileadmin/user_upload/Aktuelles/Punktwerte/27_05_PUNKTWERT%C3%9CBERSICHT_LAND_BRANDENBURG_ab_01.01.2026_.pdf\",\"geprueft\":true},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"31\":{\"KCH\":{\"primaer\":1.3329,\"ersatz\":1.2127,\"gueltigAb\":\"2024-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Primaer (alle Kassenarten) ab 01.01.2026; vdek laut Fremdkassenlisten noch Wert ab 01.01.2024.\"},\"KB\":{\"primaer\":1.3329,\"ersatz\":1.2127,\"gueltigAb\":\"2024-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Primaer (alle Kassenarten) ab 01.01.2026; vdek laut Fremdkassenlisten noch Wert ab 01.01.2024.\"},\"PAR\":{\"primaer\":1.3329,\"ersatz\":1.2127,\"gueltigAb\":\"2024-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Primaer (alle Kassenarten) ab 01.01.2026; vdek laut Fremdkassenlisten noch Wert ab 01.01.2024.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"32\":{\"KCH\":{\"primaer\":1.3976,\"ersatz\":1.3976,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-hh.de/fileadmin/Redaktion/KZV/Abrechnung/2026-Punktwerte.pdf\",\"geprueft\":true,\"hinweis\":\"Hamburger Verteilungspunktwert fuer Hamburger Praxen; Gesamtvertragswert (Fremdkassenlisten) 1,3391.\"},\"KB\":{\"primaer\":1.3976,\"ersatz\":1.3976,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-hh.de/fileadmin/Redaktion/KZV/Abrechnung/2026-Punktwerte.pdf\",\"geprueft\":true,\"hinweis\":\"Hamburger Verteilungspunktwert fuer Hamburger Praxen; Gesamtvertragswert (Fremdkassenlisten) 1,3391.\"},\"PAR\":{\"primaer\":1.3976,\"ersatz\":1.3976,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-hh.de/fileadmin/Redaktion/KZV/Abrechnung/2026-Punktwerte.pdf\",\"geprueft\":true,\"hinweis\":\"Hamburger Verteilungspunktwert fuer Hamburger Praxen; Gesamtvertragswert (Fremdkassenlisten) 1,3391.\"},\"KFO\":{\"primaer\":1.1503,\"ersatz\":1.1661,\"gueltigAb\":\"2026-04-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-hh.de/fileadmin/Redaktion/KZV/Abrechnung/2026-Punktwerte.pdf\",\"geprueft\":true,\"hinweis\":\"vdek-KFO ab 01.04.2026 (Stand KZV Hamburg 23.06.2026).\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"20\":{\"KCH\":{\"primaer\":1.3948,\"ersatz\":1.3260,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-07-01\",\"quelle\":\"https://www.kzvh.de/wcm/idc/groups/public/documents/web/df8y/mdez/~edisp/am_komplett_2013_10.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.07.2026 (01.01.-30.06.2026: 1,3901); vdek noch Wert ab 01.01.2025.\"},\"KB\":{\"primaer\":1.3948,\"ersatz\":1.3260,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-07-01\",\"quelle\":\"https://www.kzvh.de/wcm/idc/groups/public/documents/web/df8y/mdez/~edisp/am_komplett_2013_10.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.07.2026 (01.01.-30.06.2026: 1,3901); vdek noch Wert ab 01.01.2025.\"},\"PAR\":{\"primaer\":1.3948,\"ersatz\":1.3260,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-07-01\",\"quelle\":\"https://www.kzvh.de/wcm/idc/groups/public/documents/web/df8y/mdez/~edisp/am_komplett_2013_10.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.07.2026 (01.01.-30.06.2026: 1,3901); vdek noch Wert ab 01.01.2025.\"},\"KFO\":{\"primaer\":1.1519,\"ersatz\":1.0947,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-07-01\",\"quelle\":\"https://www.kzvh.de/wcm/idc/groups/public/documents/web/df8y/mdez/~edisp/am_komplett_2013_10.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.07.2026 (01.01.-30.06.2026: 1,1480); vdek noch Wert 2025.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"52\":{\"KCH\":{\"primaer\":1.3510,\"ersatz\":1.3324,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true,\"hinweis\":\"BARMER 1,3351. vdek-Wert auch in KZV-Berlin-Ersatzkassenliste IV/2026 (https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/1_Abrechnung/7_Punktwerte/2026/Punktwerte_2026_IV_Ersatzkassen.pdf).\"},\"KB\":{\"primaer\":1.3510,\"ersatz\":1.3324,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true,\"hinweis\":\"BARMER 1,3351. vdek-Wert auch in KZV-Berlin-Ersatzkassenliste IV/2026 (https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/1_Abrechnung/7_Punktwerte/2026/Punktwerte_2026_IV_Ersatzkassen.pdf).\"},\"PAR\":{\"primaer\":1.3510,\"ersatz\":1.3324,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true,\"hinweis\":\"BARMER 1,3351. vdek-Wert auch in KZV-Berlin-Ersatzkassenliste IV/2026 (https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/1_Abrechnung/7_Punktwerte/2026/Punktwerte_2026_IV_Ersatzkassen.pdf).\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"04\":{\"KCH\":{\"primaer\":1.3776,\"ersatz\":1.3675,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true,\"hinweis\":\"Primaer einheitlich fuer AOK/BKK/IKK/Knappschaft/SVLFG.\"},\"KB\":{\"primaer\":1.3776,\"ersatz\":1.3675,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true,\"hinweis\":\"Primaer einheitlich fuer AOK/BKK/IKK/Knappschaft/SVLFG.\"},\"PAR\":{\"primaer\":1.3776,\"ersatz\":1.3675,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true,\"hinweis\":\"Primaer einheitlich fuer AOK/BKK/IKK/Knappschaft/SVLFG.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"13\":{\"KCH\":{\"primaer\":1.3234,\"ersatz\":1.3234,\"gueltigAb\":\"2025-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Laut Fremdkassenlisten (Stand 09/2026) fuer alle Kassenarten noch Wert ab 01.01.2025.\"},\"KB\":{\"primaer\":1.3234,\"ersatz\":1.3234,\"gueltigAb\":\"2025-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Laut Fremdkassenlisten (Stand 09/2026) fuer alle Kassenarten noch Wert ab 01.01.2025.\"},\"PAR\":{\"primaer\":1.3234,\"ersatz\":1.3234,\"gueltigAb\":\"2025-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Laut Fremdkassenlisten (Stand 09/2026) fuer alle Kassenarten noch Wert ab 01.01.2025.\"},\"KFO\":{\"primaer\":1.1000,\"ersatz\":1.1000,\"gueltigAb\":\"2025-01-01\",\"quelle\":\"https://www.kzvnr.de/service/wissen-to-go\",\"geprueft\":true,\"hinweis\":\"Punktwertuebersicht der KZV Nordrhein ab 01.01.2026, Stand 15.12.2025 (Anlage Informationsdienst 6/2025): KFO noch Wert ab 01.01.2025.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"06\":{\"KCH\":{\"primaer\":1.2796,\"ersatz\":1.2796,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvrlp.de/mitglieder/abrechnung/\",\"geprueft\":true,\"hinweis\":\"Punktwertuebersicht 2026, Stand 05.03.2026.\"},\"KB\":{\"primaer\":1.1098,\"ersatz\":1.1098,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvrlp.de/mitglieder/abrechnung/\",\"geprueft\":true,\"hinweis\":\"Punktwertuebersicht 2026, Stand 05.03.2026.\"},\"PAR\":{\"primaer\":1.2796,\"ersatz\":1.2796,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvrlp.de/mitglieder/abrechnung/\",\"geprueft\":true,\"hinweis\":\"Punktwertuebersicht 2026, Stand 05.03.2026.\"},\"KFO\":{\"primaer\":1.1043,\"ersatz\":1.1043,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzvrlp.de/mitglieder/abrechnung/\",\"geprueft\":true,\"hinweis\":\"Punktwertuebersicht 2026, Stand 05.03.2026.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"35\":{\"KCH\":{\"primaer\":1.2964,\"ersatz\":1.3008,\"gueltigAb\":\"2025-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Laut Fremdkassenlisten Werte ab 01.01.2025; die eigene KZV-Saarland-Uebersicht (Stand 01.04.2026) fuehrt KCH noch mit 1,2416 (AOK) / 1,2459 (vdek) aus 2024.\"},\"KB\":{\"primaer\":1.2964,\"ersatz\":1.3008,\"gueltigAb\":\"2025-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Laut Fremdkassenlisten Werte ab 01.01.2025; die eigene KZV-Saarland-Uebersicht (Stand 01.04.2026) fuehrt KCH noch mit 1,2416 (AOK) / 1,2459 (vdek) aus 2024.\"},\"PAR\":{\"primaer\":1.2964,\"ersatz\":1.3008,\"gueltigAb\":\"2025-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Laut Fremdkassenlisten Werte ab 01.01.2025; die eigene KZV-Saarland-Uebersicht (Stand 01.04.2026) fuehrt KCH noch mit 1,2416 (AOK) / 1,2459 (vdek) aus 2024.\"},\"KFO\":{\"primaer\":1.1029,\"ersatz\":1.0542,\"gueltigAb\":\"2024-01-01\",\"gueltigAbPrimaer\":\"2025-01-01\",\"quelle\":\"https://www.kzv-saarland.de/api/view/019db928-dd8c-7280-82a7-86b05274b1c9\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.01.2025, vdek ab 01.01.2024; kein KFO-Wert 2026 veroeffentlicht.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"56\":{\"KCH\":{\"primaer\":1.3886,\"ersatz\":1.2692,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Sachsen_03_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK PLUS ab 01.01.2026; vdek noch Wert 2025 (TK 1,2839, BARMER 1,2705).\"},\"KB\":{\"primaer\":1.3886,\"ersatz\":1.2692,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Sachsen_03_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK PLUS ab 01.01.2026; vdek noch Wert 2025.\"},\"PAR\":{\"primaer\":1.3886,\"ersatz\":1.2692,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Sachsen_03_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Fuer S-Positionen (4S, AIT/CPT/UPT ...S, 108S, 111S): AOK 1,4266, vdek 1,2972.\"},\"KFO\":{\"primaer\":1.2481,\"ersatz\":1.1435,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Sachsen_03_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK PLUS ab 01.01.2026; vdek noch Wert 2025.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"54\":{\"KCH\":{\"primaer\":1.3474,\"ersatz\":1.2622,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.01.2026; vdek noch Wert 2025 (Schiedsspruch Ersatzkassen 2026 vom 31.08.2026 noch nicht in den Listen).\"},\"KB\":{\"primaer\":1.3474,\"ersatz\":1.2622,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.01.2026; vdek noch Wert 2025 (Schiedsspruch Ersatzkassen 2026 vom 31.08.2026 noch nicht in den Listen).\"},\"PAR\":{\"primaer\":1.3474,\"ersatz\":1.2622,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK ab 01.01.2026; vdek noch Wert 2025 (Schiedsspruch Ersatzkassen 2026 vom 31.08.2026 noch nicht in den Listen).\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"36\":{\"KCH\":{\"primaer\":1.3918,\"ersatz\":1.3918,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true},\"KB\":{\"primaer\":1.3918,\"ersatz\":1.3918,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true},\"PAR\":{\"primaer\":1.3918,\"ersatz\":1.3918,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":true},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"55\":{\"KCH\":{\"primaer\":1.3886,\"ersatz\":1.2734,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK PLUS ab 01.01.2026; vdek noch Wert 2025 (TK 1,2827, BARMER 1,2755).\"},\"KB\":{\"primaer\":1.3886,\"ersatz\":1.2734,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK PLUS ab 01.01.2026; vdek noch Wert 2025 (TK 1,2827, BARMER 1,2755).\"},\"PAR\":{\"primaer\":1.3886,\"ersatz\":1.2734,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Punktwerte/2026/Punktwerte_Fremdkassen_Q3_2026.pdf\",\"geprueft\":false,\"hinweis\":\"AOK PLUS ab 01.01.2026; vdek noch Wert 2025 (TK 1,2827, BARMER 1,2755).\"},\"KFO\":{\"primaer\":1.2481,\"ersatz\":1.1381,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://www.kzvth.de/services/asset/KZVTh/Downloadbereich/Punktwertlisten/PWL%202026/Verguetungspunktwerte_III_2026.pdf\",\"geprueft\":false,\"hinweis\":\"Vorlaeufige Verguetungspunktwerte III/2026 (Rundschreiben 4/2026): AOK 1,2481; BKK 1,2405, IKK 1,2115, Knappschaft 1,1929 (ab 01.04.2026), LKK 1,1997; vdek 1,1381 (BARMER 1,1415, TK 1,1454) noch Wert 2025.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}},\"37\":{\"KCH\":{\"primaer\":1.3826,\"ersatz\":1.3195,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://zahnaerzte-wl.de/download/825076873b6b1262795a47ac3/Punktwert-Tabelle-Stand-03.09.2026.pdf\",\"geprueft\":false,\"hinweis\":\"Primaer ab 01.01.2026; vdek noch Wert ab 01.01.2025.\"},\"KB\":{\"primaer\":1.3826,\"ersatz\":1.3195,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://zahnaerzte-wl.de/download/825076873b6b1262795a47ac3/Punktwert-Tabelle-Stand-03.09.2026.pdf\",\"geprueft\":false,\"hinweis\":\"Primaer ab 01.01.2026; vdek noch Wert ab 01.01.2025.\"},\"PAR\":{\"primaer\":1.3826,\"ersatz\":1.3195,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://zahnaerzte-wl.de/download/825076873b6b1262795a47ac3/Punktwert-Tabelle-Stand-03.09.2026.pdf\",\"geprueft\":false,\"hinweis\":\"PAR nach Paragraph 22a: Primaer 1,4131, vdek 1,3486.\"},\"KFO\":{\"primaer\":1.1270,\"ersatz\":1.0756,\"gueltigAb\":\"2025-01-01\",\"gueltigAbPrimaer\":\"2026-01-01\",\"quelle\":\"https://zahnaerzte-wl.de/download/825076873b6b1262795a47ac3/Punktwert-Tabelle-Stand-03.09.2026.pdf\",\"geprueft\":false,\"hinweis\":\"Primaer ab 01.01.2026; vdek noch Wert ab 01.01.2025.\"},\"ZE\":{\"primaer\":1.1844,\"ersatz\":1.1844,\"gueltigAb\":\"2026-01-01\",\"quelle\":\"https://www.kzbv.de/wp-content/uploads/2025-12-05_FZ-RL_Anpassung-Betraege_01-01-2026_TrG.pdf\",\"geprueft\":true,\"hinweis\":\"Bundeseinheitlich (+4,78 %); massgeblich ist der Tag der HKP-Ausstellung.\"}}}")
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
//#region src/data/kzv.ts
var KZVEN = [
	{
		nr: "02",
		slug: "bw",
		name: "Baden-Württemberg",
		kurz: "KZV BW",
		bereich: "BW",
		seite: "https://www.kzvbw.de/zahnaerzte/abrechnung/punktwerte-formulare-vordrucke/bel-leistungen-download/",
		muster: ["https://www.kzvbw.de/wp-content/uploads/02la{MM}{JJ}.csv"]
	},
	{
		nr: "11",
		slug: "bayern",
		name: "Bayern",
		kurz: "KZVB",
		bereich: "BY",
		seite: "https://www.kzvb.de/abrechnung/bel-preise",
		muster: ["https://www.kzvb.de/fileadmin/user_upload/Abrechnung/BEL/11la{MM}{JJ}.csv"]
	},
	{
		nr: "30",
		slug: "berlin",
		name: "Berlin",
		kurz: "KZV Berlin",
		bereich: "BE",
		seite: "https://www.kzv-berlin.de/fuer-praxen/abrechnung/bel-ii-laborpreise",
		muster: ["https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/1_Abrechnung/8_BEL_II__Laborpreise/30la{MM}{JJ}.csv"]
	},
	{
		nr: "53",
		slug: "brandenburg",
		name: "Brandenburg",
		kurz: "KZVLB",
		bereich: "BBG",
		seite: "https://www.kzvlb.de/service/downloadcenter",
		muster: ["https://www.kzvlb.de/fileadmin/user_upload/sw/53la{MM}{JJ}.csv"]
	},
	{
		nr: "31",
		slug: "bremen",
		name: "Bremen",
		kurz: "KZV Bremen",
		bereich: "HB",
		seite: "https://www.kzv-bremen.de/mitglieder/abrechnung/bel",
		login: true
	},
	{
		nr: "32",
		slug: "hamburg",
		name: "Hamburg",
		kurz: "KZV Hamburg",
		bereich: "HH",
		seite: "https://www.zahnaerzte-hh.de/zahnaerzte-portal/praxis/abrechnung/kassenabrechnung-kzv/punktwerte-laborpreise-bel-materialkosten",
		muster: ["https://www.zahnaerzte-hh.de/fileadmin/Redaktion/KZV/Abrechnung/32la{MM}{JJ}.csv"]
	},
	{
		nr: "20",
		slug: "hessen",
		name: "Hessen",
		kurz: "KZVH",
		bereich: "HS",
		seite: "https://www.kzvh.de/BEL-Preisliste/index.html",
		muster: ["https://www.kzvh.de/wcm/idc/groups/public/documents/web/mdiw/bgew/~edisp/20la{MM}{JJ}.csv"]
	},
	{
		nr: "52",
		slug: "mv",
		name: "Mecklenburg-Vorpommern",
		kurz: "KZV M-V",
		bereich: "MVO",
		seite: "https://www.kzvmv.de/bkv-download/index.html",
		muster: ["https://www.kzvmv.de/dokumente/52la{MM}{JJ}.csv"]
	},
	{
		nr: "04",
		slug: "niedersachsen",
		name: "Niedersachsen",
		kurz: "KZVN",
		bereich: "NS",
		seite: "https://www.kzvn.de/abrechnung/punktwerte-formulare/bel-ll/"
	},
	{
		nr: "13",
		slug: "nordrhein",
		name: "Nordrhein",
		kurz: "KZV Nordrhein",
		bereich: "NR",
		seite: "https://www.kzvnr.de/praxis/abrechnung-honorar/bel-ii-listen",
		nurPraxis: true,
		muster: ["https://www.kzvnr.de/fileadmin/user_upload/PDF/Zahnaerzteseite/BEL-II-Listen/13la{MM}{JJ}.csv"]
	},
	{
		nr: "06",
		slug: "rlp",
		name: "Rheinland-Pfalz",
		kurz: "KZV RLP",
		bereich: "RP",
		seite: "https://www.kzvrlp.de/mitglieder/abrechnung/bel-ii/"
	},
	{
		nr: "35",
		slug: "saarland",
		name: "Saarland",
		kurz: "KZV Saarland",
		bereich: "SAA",
		seite: "https://www.kzv-saarland.de/praxen/abrechnung/zahntechnik-bel"
	},
	{
		nr: "56",
		slug: "sachsen",
		name: "Sachsen",
		kurz: "KZVS",
		bereich: "SA",
		seite: "https://www.zahnaerzte-in-sachsen.de/zahnarztpraxis/abrechnung/bema-abrechnung/allgemeine-abrechnungsinformationen/",
		muster: ["https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Abrechnung/BEL_II/{JJJJ}/56la{MM}{JJ}.csv"]
	},
	{
		nr: "54",
		slug: "lsa",
		name: "Sachsen-Anhalt",
		kurz: "KZV LSA",
		bereich: "SAN",
		seite: "https://www.kzv-lsa.de/f%C3%BCr-die-praxis/abrechnung/bel-liste.html",
		muster: ["https://www.kzv-lsa.de/files/Inhalte/Abrechnung/BEL/{JJJJ}/54la{MM}{JJ}csv_mitU.csv"]
	},
	{
		nr: "36",
		slug: "sh",
		name: "Schleswig-Holstein",
		kurz: "KZV S-H",
		bereich: "SH",
		seite: "https://www.kzv-sh.de/fuer-die-praxis/abrechnung/bel-csv/"
	},
	{
		nr: "55",
		slug: "thueringen",
		name: "Thüringen",
		kurz: "KZV Thüringen",
		bereich: "TH",
		seite: "https://www.kzvth.de/bel-beb",
		muster: ["https://www.kzvth.de/services/asset/KZVTh/Downloadbereich/BEL/BEL%20{JJJJ}/55la{MM}{JJ}.csv"]
	},
	{
		nr: "37",
		slug: "wl",
		name: "Westfalen-Lippe",
		kurz: "ZÄKWL/KZVWL",
		bereich: "WL",
		seite: "https://zahnaerzte-wl.de/pages/aktuelle-abrechnungsinfos"
	}
];
var kzvNachNr = (nr) => KZVEN.find((k) => k.nr === nr);
/**
* PLZ-Leitbereiche → KZV-Nr. Zweistellig, mit dreistelligen Ausnahmen an Landesgrenzen.
* Näherung: Postleitzahlen folgen nicht exakt den Landesgrenzen – die KZV lässt sich in den Einstellungen festlegen.
*/
var PLZ2 = {
	"01": "56",
	"02": "56",
	"03": "53",
	"04": "56",
	"06": "54",
	"07": "55",
	"08": "56",
	"09": "56",
	"10": "30",
	"12": "30",
	"13": "30",
	"14": "53",
	"15": "53",
	"16": "53",
	"17": "52",
	"18": "52",
	"19": "52",
	"20": "32",
	"21": "32",
	"22": "32",
	"23": "36",
	"24": "36",
	"25": "36",
	"26": "04",
	"27": "04",
	"28": "31",
	"29": "04",
	"30": "04",
	"31": "04",
	"32": "37",
	"33": "37",
	"34": "20",
	"35": "20",
	"36": "20",
	"37": "04",
	"38": "04",
	"39": "54",
	"40": "13",
	"41": "13",
	"42": "13",
	"44": "37",
	"45": "13",
	"46": "13",
	"47": "13",
	"48": "37",
	"49": "04",
	"50": "13",
	"51": "13",
	"52": "13",
	"53": "13",
	"54": "06",
	"55": "06",
	"56": "06",
	"57": "37",
	"58": "37",
	"59": "37",
	"60": "20",
	"61": "20",
	"63": "20",
	"64": "20",
	"65": "20",
	"66": "35",
	"67": "06",
	"68": "02",
	"69": "02",
	"70": "02",
	"71": "02",
	"72": "02",
	"73": "02",
	"74": "02",
	"75": "02",
	"76": "02",
	"77": "02",
	"78": "02",
	"79": "02",
	"80": "11",
	"81": "11",
	"82": "11",
	"83": "11",
	"84": "11",
	"85": "11",
	"86": "11",
	"87": "11",
	"88": "02",
	"89": "02",
	"90": "11",
	"91": "11",
	"92": "11",
	"93": "11",
	"94": "11",
	"95": "11",
	"96": "11",
	"97": "11",
	"98": "55",
	"99": "55"
};
var PLZ3 = {
	"019": "53",
	"046": "55",
	"049": "53",
	"140": "30",
	"141": "30",
	"172": "53",
	"210": "32",
	"211": "32",
	"212": "04",
	"213": "04",
	"214": "04",
	"215": "36",
	"216": "04",
	"217": "04",
	"228": "36",
	"229": "36",
	"239": "52",
	"275": "31",
	"288": "04",
	"289": "04",
	"364": "55",
	"372": "20",
	"373": "55",
	"388": "54",
	"389": "54",
	"455": "37",
	"456": "37",
	"457": "37",
	"458": "37",
	"459": "37",
	"462": "37",
	"463": "37",
	"484": "04",
	"485": "04",
	"494": "37",
	"495": "37",
	"534": "06",
	"535": "06",
	"536": "06",
	"575": "06",
	"576": "06",
	"637": "11",
	"638": "11",
	"639": "11",
	"668": "06",
	"669": "06",
	"685": "20",
	"686": "20",
	"767": "06",
	"768": "06",
	"769": "06",
	"881": "11",
	"892": "11",
	"893": "11",
	"894": "11",
	"979": "02"
};
function kzvAusPlz(plz) {
	const p = plz.replace(/\D/g, "");
	if (p.length < 2) return "";
	return PLZ3[p.slice(0, 3)] ?? PLZ2[p.slice(0, 2)] ?? "";
}
//#endregion
//#region src/mandant.ts
var LISTE_KEY = "planr.mandanten.v1";
var AKTIV_KEY = "planr.mandant.v1";
/** Der Standard-Mandant liest die alten Schlüssel ohne Zusatz – vorhandene Daten bleiben ihm erhalten. */
var STANDARD_ID = "standard";
var STANDARD = {
	id: STANDARD_ID,
	name: "Praxis"
};
var speicher = () => typeof localStorage === "undefined" ? null : localStorage;
function kennung(text) {
	return text.toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
/** Speicherschlüssel eines Mandanten */
var schluessel = (key, mandantId) => mandantId === "standard" ? key : `${key}@${mandantId}`;
function lesen() {
	let liste = [];
	try {
		const roh = JSON.parse(speicher()?.getItem(LISTE_KEY) ?? "[]");
		if (Array.isArray(roh)) liste = roh.filter((m) => m && typeof m.id === "string" && kennung(m.id) === m.id && m.id);
	} catch {
		liste = [];
	}
	return [liste.find((m) => m.id === "standard") ?? STANDARD, ...liste.filter((m) => m.id !== STANDARD_ID)].map((m) => ({
		id: m.id,
		name: String(m.name || m.id)
	}));
}
var schreiben = (liste) => speicher()?.setItem(LISTE_KEY, JSON.stringify(liste));
/** Aktiver Mandant beim Laden der Seite; ?mandant=kürzel wählt (und legt bei Bedarf an). */
function starten() {
	const liste = lesen();
	let id = speicher()?.getItem(AKTIV_KEY) ?? "standard";
	const aufruf = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("mandant");
	if (aufruf && kennung(aufruf)) {
		id = kennung(aufruf);
		if (!liste.some((m) => m.id === id)) {
			liste.push({
				id,
				name: aufruf.trim()
			});
			schreiben(liste);
		}
		speicher()?.setItem(AKTIV_KEY, id);
	}
	return {
		liste,
		aktiv: liste.find((m) => m.id === id) ?? liste[0]
	};
}
/** Gilt für die ganze Sitzung; ein Wechsel lädt die Seite neu, damit alle Speicher den neuen Mandanten lesen. */
var MANDANT_ID = starten().aktiv.id;
var mk = (key) => schluessel(key, MANDANT_ID);
//#endregion
//#region src/punktwerte.ts
/**
* BEMA-Punktwerte je KZV, Leistungsbereich und Kassenart – in allen Kassenplanern gleich.
*
* Es gibt keine bundeseinheitliche Tabelle (außer ZE): KZV und Kassen(-verbände) vereinbaren
* die Werte regional, meist jährlich. Maßgeblich ist die KZV der Praxis.
* Vorrang: fester Wert in den Einstellungen > praxiseigene Werte (CSV) > Tabelle > Fallback.
* Die Tabelle kommt mitgeliefert und lässt sich per "Punktwerte aktualisieren" vom
* Datendienst der Startseite erneuern (daten.ts).
*/
var PUNKTWERTE_DATEI = "punktwerte.json";
var MITGELIEFERT = punktwerte_default;
/** Die gültige Tabelle (aktualisiert, sonst mitgeliefert). */
var punktwertTabelle = () => aktuell(PUNKTWERTE_DATEI, MITGELIEFERT);
/** Praxiseigene Werte je Mandant: KZV -> Bereich -> Paar. */
var K_EIGEN = mk("planr.punktwerte-eigen.v1");
function eigeneWerte() {
	try {
		const roh = localStorage.getItem(K_EIGEN);
		return roh ? JSON.parse(roh) : {};
	} catch {
		return {};
	}
}
/** KZV der Praxis: fest gewählt, sonst aus der PLZ. */
var kzvDerPraxis = (p) => p.kzvNr || kzvAusPlz(p.plz);
/** Mittelwert aller KZVen – nur, wenn gar keine KZV bestimmbar ist. */
function fallback(tab, bereich, kassenart) {
	const werte = Object.values(tab.kzv).map((k) => k[bereich]?.[kassenart]).filter((x) => !!x);
	return werte.length ? Math.round(werte.reduce((a, b) => a + b, 0) / werte.length * 1e4) / 1e4 : 1.2;
}
function ermittlePunktwert(a) {
	const tab = punktwertTabelle();
	const kzvNr = kzvDerPraxis(a.praxis);
	const basis = {
		bereich: a.bereich,
		kzvNr,
		kassenart: a.kassenart,
		stand: standVon(tab)
	};
	const kasse = a.kassenart === "ersatz" ? "Ersatzkassen" : "Primärkassen";
	if (a.fest != null && a.fest > 0) return {
		...basis,
		wert: a.fest,
		quelle: "fest",
		geprueft: true,
		hinweis: "Punktwert fest eingetragen (Einstellungen)."
	};
	const eigen = kzvNr ? eigeneWerte()[kzvNr]?.[a.bereich] : void 0;
	if (eigen) return {
		...basis,
		wert: eigen[a.kassenart],
		quelle: "eigen",
		geprueft: true,
		hinweis: `Praxiseigener Punktwert (${kasse}).`
	};
	const t = kzvNr ? tab.kzv[kzvNr]?.[a.bereich] : void 0;
	if (t) {
		const geprueft = t.geprueft !== false;
		return {
			...basis,
			wert: t[a.kassenart],
			quelle: "tabelle",
			geprueft,
			hinweis: `${kzvNachNr(kzvNr)?.name ?? kzvNr}, ${kasse}${t.gueltigAb ? `, gültig ab ${t.gueltigAb.split("-").reverse().join(".")}` : ""}${geprueft ? "" : " – nicht bestätigt, bitte mit dem KZV-Rundschreiben abgleichen"}.`
		};
	}
	return {
		...basis,
		kzvNr: "",
		wert: fallback(tab, a.bereich, a.kassenart),
		quelle: "fallback",
		geprueft: false,
		hinweis: kzvNr ? `Für ${kzvNachNr(kzvNr)?.name ?? kzvNr} ist kein Wert hinterlegt – Bundesmittel.` : "Keine KZV bestimmbar (Praxis-PLZ fehlt) – Bundesmittel."
	};
}
//#endregion
//#region src/engine/begruendung.ts
/**
* Standardbegründungen für GOZ-Faktoren über dem Schwellenwert 2,3 (§ 10 Abs. 3 GOZ).
* Sie müssen sich auf Schwierigkeit, Zeitaufwand oder Umstände bei der Ausführung beziehen (§ 5 Abs. 2 GOZ)
* und sind im Einzelfall patientenbezogen zu prüfen. DENS speichert höchstens 274 Zeichen je Begründung.
*/
var GRUPPEN = [
	[/^(0080|0090|0100)$/, "Erschwerte Anästhesie durch anatomische Besonderheiten und entzündlich verändertes Gewebe; Nachinjektion und verlängerte Einwirkzeit erforderlich."],
	[/^0065$/, "Erhöhter Zeitaufwand bei der digitalen Abformung durch subgingival liegende Kavitätenränder, Blutungsneigung und mehrfache Teilscans."],
	[/^2000$/, "Erschwerte Versiegelung durch tief zerklüftete Fissuren, eingeschränkte Zugänglichkeit und schwierige Trockenlegung."],
	[/^(2030|2040)$/, "Erschwerte Trockenlegung durch eingeschränkte Mundöffnung, starken Speichelfluss und subgingivale Defektränder."],
	[/^(20[5-9]0|2100|2110|2120)$/, "Erhöhter Zeitaufwand durch subgingival reichende Kavitätenränder, erschwerte Trockenlegung und aufwendige adhäsive Mehrschichttechnik mit anatomischer Gestaltung der Kontaktpunkte."],
	[/^(21[5-7]0|2200|2210|2220)$/, "Erschwerte Präparation durch subgingival reichende Kavitätenränder; erhöhter Zeitaufwand für Blutstillung, Darstellung der Präparationsgrenze, Anprobe und adhäsive Befestigung."],
	[/^(2180|2190|2195|2197)$/, "Überdurchschnittlicher Zeitaufwand durch stark zerstörte Zahnhartsubstanz mit tief subgingivalen Defekträndern; aufwendige Trockenlegung und adhäsive Mehrschichttechnik."],
	[/^(2310|2320)$/, "Erhöhter Aufwand für Reinigung, Anpassung und Kontrolle der Passung vor der Wiederbefestigung."],
	[/^(2330|2340|2350)$/, "Erschwerte Vitalerhaltung durch tiefe, pulpanahe Karies und Blutungsneigung; erhöhter Zeitaufwand für keimarmes Vorgehen und dichte Abdeckung."],
	[/^(2360|2380|2390)$/, "Erschwerter Zugang zum Kanalsystem durch eingeschränkte Mundöffnung, Kalzifikationen oder versteckte Kanaleingänge; erhöhter Zeitaufwand."],
	[/^(2400|2410|2420|2430|2440)$/, "Erschwerte Wurzelkanalbehandlung durch stark gekrümmte, obliterierte oder verzweigte Kanäle; erhöhter Zeitaufwand für Längenbestimmung, Aufbereitung, Desinfektion und dichte Füllung."]
];
var ALLGEMEIN = "Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand bei der Ausführung aufgrund der individuellen anatomischen und klinischen Verhältnisse.";
var standardBegruendung = (nr) => GRUPPEN.find(([re]) => re.test(nr.trim()))?.[1] ?? ALLGEMEIN;
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
/** BEB-Positionen des digitalen Ablaufs nach Intraoralscan (Standardpositionen jeder BEB-Liste) */
var DIGITAL_BEB = {
	oralscan: "0007",
	praepFreilegen: "0013",
	druckstumpf: "0017",
	sintern: "0032",
	auftragsdaten: "0901",
	registrierung: "0902",
	segmentierung: "0903",
	segment: "0904",
	praepgrenze: "0905",
	glanzbrand: "0906",
	krone: "0907",
	glied: "0908",
	kauflaeche: "0909",
	verbinder: "0910",
	nacharbeiten: "0911"
};
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
var GOZ = new Map(gozDaten.eintraege.map((e) => [e.nr, e]));
var runden = (x) => Math.round(x * 100) / 100;
var MWST_NR = "MwSt.";
function mwstZeile(zeilen) {
	const betrag = runden(zeilen.filter((z) => z.ebene === "LABOR" && z.nr !== "MwSt." && z.nr !== "Mat.").reduce((s, z) => s + z.summe, 0) * 7 / 100);
	return betrag > 0 ? {
		ebene: "LABOR",
		nr: MWST_NR,
		text: `MwSt. 7 % auf zahntechnische Leistungen`,
		anzahl: 1,
		einzel: betrag,
		summe: betrag
	} : null;
}
/** GOZ-Faktorrahmen (alle Abschnitte gleich). */
var GOZ_SCHWELLE = 2.3;
var GOZ_HOECHSTSATZ = 3.5;
var gozPunkte = (nr) => GOZ.get(nr)?.punkte ?? 0;
var gozText = (nr) => GOZ.get(nr)?.text ?? "";
//#endregion
//#region src/engine/inlaylabor.ts
/** BEB: Keramik gefräst 2551–2554, Metall (gegossen) 2301–2304, nach Flächen */
var INLAY_BEB = {
	keramik: [
		"2551",
		"2552",
		"2553",
		"2554"
	],
	gold: [
		"2301",
		"2302",
		"2303",
		"2304"
	]
};
var inlayBebNr = (w, flaechen) => INLAY_BEB[w][Math.min(4, Math.max(1, flaechen)) - 1];
var kiefer = (zahn) => zahn[0] === "1" || zahn[0] === "2" ? "OK" : "UK";
function inlayPositionen(inlays, abformung) {
	if (!inlays.length) return [];
	const out = [];
	const p = (nr, zahn, text) => out.push({
		nr,
		zahn,
		anzahl: 1,
		...text ? { text } : {}
	});
	const sortiert = [...inlays].sort((a, b) => a.zahn.localeCompare(b.zahn));
	const mitInlay = new Set(sortiert.map((i) => kiefer(i.zahn)));
	for (const i of sortiert) p(inlayBebNr(i.werkstoff, i.flaechen), i.zahn);
	if (abformung === "abdruck") {
		for (const k of ["OK", "UK"]) p(mitInlay.has(k) ? "0021" : "0001", k);
		p("0402", "");
		return out;
	}
	const D = DIGITAL_BEB;
	for (const k of ["OK", "UK"]) p("0009", k);
	p(D.oralscan, "", "Oralscan aufbereiten");
	p(D.auftragsdaten, "");
	p(D.registrierung, "");
	for (const k of mitInlay) p(D.segmentierung, k);
	for (const i of sortiert) for (const nr of [
		D.praepFreilegen,
		D.druckstumpf,
		D.segment,
		D.praepgrenze,
		D.kauflaeche,
		D.nacharbeiten
	]) p(nr, i.zahn);
	for (const i of sortiert) if (i.werkstoff === "keramik") p(D.glanzbrand, i.zahn);
	return out;
}
/** Inlays mit eigener Praxisposition einzeln nach BEB, die übrigen bleiben für die Pauschale */
function inlayLabor(inlays, abformung, katalog, beb) {
	const ablauf = {
		auto: true,
		ablauf: abformung
	};
	const einzeln = inlays.filter((i) => eigenFinden(katalog, inlayBebNr(i.werkstoff, i.flaechen), ablauf));
	return {
		zeilen: inlayPositionen(einzeln, abformung).map((p) => {
			const e = eigenFinden(katalog, p.nr, ablauf);
			const liste = beb.get(p.nr);
			return {
				...p,
				text: e?.text ?? p.text ?? liste?.text ?? "Laborleistung",
				preis: Math.round((e?.preis ?? liste?.preis ?? 0) * 100) / 100,
				...e ? { praxis: e.nr } : {}
			};
		}),
		pauschal: inlays.filter((i) => !einzeln.includes(i))
	};
}
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
/** Kieferhälfte/Front einer Zahnregion – für GOZ-Positionen „je Kieferhälfte oder Frontzahnbereich". */
function regionVon(zahn) {
	const ok = kieferVon(zahn) === "OK";
	if (istFrontzahn(zahn)) return ok ? "OK-F" : "UK-F";
	const rechts = zahn[0] === "1" || zahn[0] === "4";
	if (ok) return rechts ? "OK-R" : "OK-L";
	return rechts ? "UK-R" : "UK-L";
}
//#endregion
//#region src/engine/mkv.ts
var euro = (x) => x.toLocaleString("de-DE", {
	style: "currency",
	currency: "EUR",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});
var faktorText = (f) => f.toLocaleString("de-DE", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 2
});
var flaechenWort = (n) => [
	"",
	"einflächig",
	"zweiflächig",
	"dreiflächig",
	"vierflächig",
	"fünfflächig"
][n] ?? `${n}-flächig`;
function gozZeile(nr, faktor, anzahl = 1, ebene = "GOZ", text) {
	const einzel = runden(gozPunkte(nr) * GOZ_PUNKTWERT * faktor);
	return {
		ebene,
		nr: ebene === "ANALOG" ? `${nr}a` : nr,
		text: text ?? gozText(nr),
		anzahl,
		faktor,
		einzel,
		summe: runden(einzel * anzahl)
	};
}
/** Faktor, mit dem die Hauptleistung genau den Zielbetrag an Mehrkosten ergibt. */
function faktorFuerZiel(nr, ziel, kassenanteil) {
	const punkte = gozPunkte(nr);
	if (!punkte) return GOZ_SCHWELLE;
	return Math.round((ziel + kassenanteil) / (punkte * GOZ_PUNKTWERT) * 100) / 100;
}
function zahnRechnen(zahn, z, plan, einst, punktwert, laborEinzeln) {
	const t = THERAPIE[z.therapie];
	const r = plan.regler;
	const flaechen = Math.min(5, Math.max(1, z.flaechen || 1));
	const nr = t.goz(flaechen);
	const hinweise = [];
	const warnungen = [];
	const bema = bemaFuer(flaechen);
	const kassenanteil = z.austausch ? 0 : runden(bema.punkte * punktwert);
	const kasse = z.austausch ? null : {
		ebene: "BEMA",
		nr: bema.nr,
		text: `${bema.text} (vergleichbare plastische Füllung)`,
		anzahl: 1,
		einzel: kassenanteil,
		summe: kassenanteil
	};
	let faktor = z.faktor ?? (t.plastisch ? r.faktor : r.inlayFaktor);
	let ziel;
	if (t.plastisch && t.festbetrag !== false && r.modell !== "gozDifferenz" && !z.austausch) {
		ziel = r.modell === "proZahn" ? r.proZahn : runden(r.proFlaeche * flaechen);
		faktor = faktorFuerZiel(nr, ziel, kassenanteil);
		if (faktor < 1) {
			const minimum = runden(gozPunkte(nr) * GOZ_PUNKTWERT - kassenanteil);
			warnungen.push(`Zielbetrag ${euro(ziel)} liegt unter dem GOZ-Einfachsatz – mindestens ${euro(Math.max(0, minimum))} Mehrkosten.`);
			faktor = 1;
		}
	}
	const mehrschicht = z.therapie === "aufbau" && !!z.mehrschicht;
	const zeilen = [mehrschicht ? gozZeile("2120", faktor, 1, "ANALOG", "Dentinadhäsiver mehrschichtiger Kompositaufbau, analog § 6 Abs. 1 GOZ entsprechend GOZ 2120 (BZÄK-Analogkatalog)") : gozZeile(nr, faktor, 1, t.analog ? "ANALOG" : "GOZ", t.analog ? `Goldhämmerfüllung, ${flaechenWort(flaechen)}, analog § 6 Abs. 1 GOZ entsprechend GOZ ${nr} (${gozText(nr)})` : void 0)];
	if (z.therapie === "aufbau") zeilen.push(gozZeile("2197", faktor));
	if (z.therapie === "inlay") {
		const lab = einst.laborPreise.find((l) => l.id === (z.labor ?? "keramik"));
		if (lab && lab.id !== "gold") zeilen.push(gozZeile("2197", r.faktor));
		if (laborEinzeln?.length) zeilen.push(...laborEinzeln);
		else if (lab) {
			const preis = runden(lab.preis * (LABOR_KLASSE_FAKTOR[r.laborKlasse] ?? 1));
			zeilen.push({
				ebene: "LABOR",
				nr: "Labor",
				text: lab.name,
				anzahl: 1,
				einzel: preis,
				summe: preis
			});
		}
	}
	if (z.anaesthesie && !t.plastisch) zeilen.push(gozZeile("0090", r.faktor));
	if (z.provisorium && !t.plastisch) zeilen.push(gozZeile("2260", r.faktor));
	const mwst = mwstZeile(zeilen);
	if (mwst) zeilen.push(mwst);
	for (const x of zeilen) x.zahn = zahn;
	const privat7 = [];
	if (z.therapie === "aufbau" && z.stift) {
		const stift = runden(einst.stiftPreis ?? 18);
		privat7.push({
			...gozZeile("2195", r.faktor),
			zahn
		}, {
			...gozZeile("2197", r.faktor, 1, "GOZ", `${gozText("2197")} – Stift`),
			zahn
		}, {
			ebene: "LABOR",
			nr: "Mat.",
			text: "Glasfaserstift",
			anzahl: 1,
			einzel: stift,
			summe: stift,
			zahn
		});
		hinweise.push("Glasfaserstift (GOZ 2195 mit adhäsiver Befestigung 2197 und Stift als Material): keine Mehrkostenleistung – Privatvereinbarung nach § 8 Abs. 7 BMV-Z. Die Ummantelung bleibt der Aufbau 2180 in der Mehrkostenvereinbarung.");
	}
	if (z.therapie === "aufbau") hinweise.push("GOZ 2180/2195 setzen die anschließende Überkronung voraus; bleibt es bei einer Füllung, Kompositfüllung nach Flächen planen.");
	const privat = runden(zeilen.reduce((s, x) => s + x.summe, 0));
	const mehrkosten = runden(Math.max(0, privat - kassenanteil));
	if (z.austausch) warnungen.push("Austausch einer intakten Füllung: keine Mehrkostenregelung (§ 28 Abs. 2 S. 5 SGB V) – komplett privat nach § 8 Abs. 7 BMV-Z.");
	if ((z.therapie === "komposit" || z.therapie === "aufbau") && istFrontzahn(zahn)) warnungen.push(z.therapie === "aufbau" ? "Frontzahn: die adhäsive Aufbaufüllung ist hier Kassenleistung – keine Mehrkosten." : "Frontzahn: die adhäsive Füllung ist hier Kassenleistung – Mehrkosten nur mit Mehrfarbentechnik.");
	if (!t.plastisch && (z.kofferdam || z.bmf)) hinweise.push("Beim Inlay sind Kofferdam und besondere Maßnahmen privat (BEMA 12 entfällt).");
	if (privat < kassenanteil) warnungen.push(z.therapie === "aufbau" && !mehrschicht ? "GOZ 2180 + 2197 liegen unter dem Kassenanteil – es entstehen keine Mehrkosten. Für einen adhäsiven Aufbau mit Mehrkosten den mehrschichtigen Kompositaufbau (analog 2120) wählen, sonst bleibt es bei der Kassenleistung." : "GOZ-Honorar liegt unter dem Kassenanteil – es entstehen keine Mehrkosten.");
	if (faktor > 3.5) hinweise.push(`Faktor ${faktorText(faktor)} über 3,5: Vereinbarung nach § 2 Abs. 1 und 2 GOZ nötig.`);
	else if (faktor > 2.3) hinweise.push(`Faktor ${faktorText(faktor)} über 2,3: Begründung auf der Rechnung (§ 10 Abs. 3 GOZ).`);
	if (z.therapie === "inlay" && !z.anaesthesie) hinweise.push("Anästhesie beim Inlay ist privat (GOZ 0090), nicht über die Kasse.");
	return {
		zahn,
		titel: `${t.titel}, ${flaechenWort(flaechen)}`,
		therapie: z.therapie,
		flaechen,
		zeilen,
		kasse,
		privat,
		kassenanteil,
		mehrkosten,
		faktor,
		ziel,
		hinweise,
		warnungen,
		privat7
	};
}
/**
* Inlay-Labor des Plans einzeln nach BEB für die Inlays, deren Position die Praxis führt (DS-Win-Eigenlabor):
* Inlay je Zahn, Modelle bzw. digitaler Ablauf je Kiefer und Auftrag. Übrige Inlays behalten die Laborpauschale.
*/
function laborDesPlans(plan, einst) {
	const inlays = ALLE_ZAEHNE.flatMap((zahn) => {
		const z = plan.zaehne[zahn];
		const w = z?.labor ?? "keramik";
		return z?.therapie === "inlay" && (w === "keramik" || w === "gold") ? [{
			zahn,
			werkstoff: w,
			flaechen: z.flaechen || 1
		}] : [];
	});
	const jeZahn = /* @__PURE__ */ new Map();
	const auftrag = [];
	if (!inlays.length || !einst.eigenlabor?.length) return {
		jeZahn,
		auftrag
	};
	const { zeilen } = inlayLabor(inlays, plan.abformung ?? "abdruck", eigenKatalog(einst.eigenlabor), BEB);
	for (const l of zeilen) {
		const zeile = {
			ebene: "LABOR",
			nr: `BEB ${l.nr}`,
			text: l.praxis ? `${l.text} (Praxis ${l.praxis})` : l.text,
			anzahl: l.anzahl,
			einzel: l.preis,
			summe: runden(l.preis * l.anzahl),
			zahn: l.zahn || void 0
		};
		if (/^\d\d$/.test(l.zahn)) jeZahn.set(l.zahn, [...jeZahn.get(l.zahn) ?? [], zeile]);
		else auftrag.push(zeile);
	}
	return {
		jeZahn,
		auftrag
	};
}
function rechnen(plan, einst) {
	const pw = ermittlePunktwert({
		bereich: "KCH",
		praxis: einst.praxis,
		kassenart: plan.patient.kassenart,
		fest: einst.punktwertFest.KCH
	});
	const labor = laborDesPlans(plan, einst);
	const zaehne = ALLE_ZAEHNE.filter((z) => plan.zaehne[z]).map((z) => zahnRechnen(z, plan.zaehne[z], plan, einst, pw.wert, labor.jeZahn.get(z)));
	const f = plan.regler.faktor;
	const jeRegion = (nr, wahl) => {
		const n = new Set(ALLE_ZAEHNE.filter((z) => plan.zaehne[z] && wahl(plan.zaehne[z])).map(regionVon)).size;
		return n ? [gozZeile(nr, f, n, "GOZ", `${gozText(nr)} (${n}×)`)] : [];
	};
	const massnahmen = [...jeRegion("2030", (z) => z.bmf), ...jeRegion("2040", (z) => z.kofferdam)];
	const inlayZaehne = ALLE_ZAEHNE.filter((z) => plan.zaehne[z]?.therapie === "inlay");
	const scan = [];
	if (plan.abformung === "scan" && inlayZaehne.length) {
		const bereiche = new Set(inlayZaehne.map(regionVon)).size;
		const gegenkiefer = 2 - new Set(inlayZaehne.map((z) => z[0] === "1" || z[0] === "2" ? "OK" : "UK")).size;
		scan.push(gozZeile("0065", plan.regler.inlayFaktor, bereiche + gegenkiefer, "GOZ", `${gozText("0065")} (${bereiche + gegenkiefer}×)`));
	}
	const auftragMwst = mwstZeile(labor.auftrag);
	const begleit = [
		...massnahmen,
		...scan,
		...labor.auftrag,
		...auftragMwst ? [auftragMwst] : []
	];
	const wunsch = plan.privat ?? {};
	const fuellRegionen = new Set(zaehne.map((z) => regionVon(z.zahn))).size;
	const privat7 = [
		...zaehne.flatMap((z) => z.privat7),
		...wunsch.oberflaeche && fuellRegionen ? [gozZeile("0080", f, fuellRegionen, "GOZ", `${gozText("0080")} (${fuellRegionen}×)`)] : [],
		...wunsch.fluorid ? [gozZeile("1020", f)] : [],
		...wunsch.adhaesivKomposit ? zaehne.filter((z) => z.kasse && (z.therapie === "komposit" || z.therapie === "mehrfarben")).map((z) => ({
			...gozZeile("2197", f),
			zahn: z.zahn
		})) : []
	];
	const privat7Summe = runden(privat7.reduce((s, x) => s + x.summe, 0));
	const begleitSumme = runden(begleit.reduce((s, x) => s + x.summe, 0));
	const privat = runden(zaehne.reduce((s, x) => s + x.privat, 0) + begleitSumme);
	const kassenanteil = runden(zaehne.reduce((s, x) => s + x.kassenanteil, 0));
	const mehrkosten = runden(zaehne.reduce((s, x) => s + x.mehrkosten, 0) + begleitSumme);
	const vereinbarung2 = [...zaehne.flatMap((z) => z.zeilen), ...begleit].filter((x) => (x.faktor ?? 0) > GOZ_HOECHSTSATZ);
	const begruendungen = /* @__PURE__ */ new Map();
	for (const x of [
		...zaehne.flatMap((z) => z.zeilen),
		...begleit,
		...privat7
	]) {
		if (x.ebene !== "GOZ" && x.ebene !== "ANALOG" || (x.faktor ?? 0) <= 2.3) continue;
		const eigen = plan.begruendungen?.[x.nr]?.trim();
		x.begruendung = eigen || standardBegruendung(x.nr);
		const b = begruendungen.get(x.nr);
		begruendungen.set(x.nr, {
			nr: x.nr,
			faktor: Math.max(b?.faktor ?? 0, x.faktor),
			text: x.begruendung,
			eigen: !!eigen
		});
	}
	const hinweise = [];
	if (plan.regler.modell !== "gozDifferenz" && zaehne.some((z) => z.ziel !== void 0)) hinweise.push(plan.regler.modell === "proZahn" ? `Mehrkosten je plastischer Füllung ${euro(plan.regler.proZahn)} – der GOZ-Faktor ergibt sich daraus.` : `Mehrkosten je Fläche ${euro(plan.regler.proFlaeche)} – der GOZ-Faktor ergibt sich daraus.`);
	if (massnahmen.length) hinweise.push("Besondere Maßnahmen (GOZ 2030) und Kofferdam (GOZ 2040) je Kieferhälfte oder Frontzahnbereich gehören nur in die Mehrkosten, wenn erst die Mehrkostenfüllung sie erfordert; wären sie auch bei der Kassenfüllung nötig, BEMA 12 über die KZV.");
	if (labor.jeZahn.size) hinweise.push(plan.abformung === "scan" ? "Inlay-Labor nach den BEB-Positionen der Praxis: digitaler Ablauf nach Intraoralscan (Oralscan aufbereiten, CAD-Daten, Registrierung, Segmentierung, CAD-Kaufläche, CAM-Nacharbeit) und gedruckte Modelle." : "Inlay-Labor nach den BEB-Positionen der Praxis: Sägemodell je Kiefer mit Inlay, Gegenkiefermodell und Mittelwertartikulator einmal je Auftrag.");
	if (inlayZaehne.length && !plan.abformung) hinweise.push("Abformung für die Inlays: Abdruck angenommen – bei Intraoralscan umstellen (GOZ 0065 und digitaler Laborablauf).");
	if (wunsch.adhaesivKomposit) hinweise.push("GOZ 2197 neben Kompositfüllungen (2060 ff.) ist strittig – nur mit ausdrücklicher Privatvereinbarung ansetzen.");
	if (privat7.length) hinweise.push("Leistungen außerhalb der Mehrkostenregelung stehen auf einer eigenen Privatvereinbarung nach § 8 Abs. 7 BMV-Z.");
	return {
		zaehne,
		begleit,
		privat,
		kassenanteil,
		mehrkosten,
		punktwert: pw.wert,
		punktwertHinweis: pw.hinweis,
		vereinbarung2,
		begruendungen: [...begruendungen.values()],
		hinweise,
		privat7,
		privat7Summe
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
var STANDARD_EINSTELLUNGEN = {
	praxis: standardPraxis(),
	modell: "proFlaeche",
	proZahn: 50,
	proFlaeche: 20,
	faktor: 2.3,
	inlayFaktor: 2.3,
	gueltigMonate: 6,
	naechsteNummer: 1,
	punktwertFest: {},
	laborPreise: STANDARD_LABOR.map((l) => ({ ...l })),
	stiftPreis: 18
};
var reglerAus = (e) => ({
	modell: e.modell,
	proZahn: e.proZahn,
	proFlaeche: e.proFlaeche,
	faktor: e.faktor,
	inlayFaktor: e.inlayFaktor,
	laborKlasse: 1
});
function neuerPlan(nummer, einst) {
	return {
		nummer,
		datum: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
		patient: leererPatient(),
		zaehne: {},
		regler: reglerAus(einst),
		bemerkung: ""
	};
}
//#endregion
//#region src/clara/index.ts
/**
* Einstieg für MAS/Clara: Füllungs-Mehrkostenvereinbarung per Sprache. Versteht den gesprochenen Auftrag
* ("Komposit an 36 mo und 37 okklusal", "zweiflächiges Keramikinlay an 46"), prüft ihn gegen den 01 und rechnet
* mit der Engine dieses Planers. `npm run build:engine` baut daraus MAS-2/backend/src/vendor/mkv-engine.mjs.
*/
var ENGINE_STAND = "2026-10-16 21:28";
var GUELTIG = new Set(ALLE_ZAEHNE);
var ZAHL = {
	ein: 1,
	eine: 1,
	zwei: 2,
	drei: 3,
	vier: 4,
	fuenf: 5,
	"fünf": 5
};
var FLAECHE_WORT = [
	[/^okklusal/, "o"],
	[/^mesial/, "m"],
	[/^distal/, "d"],
	[/^(?:bukkal|vestibul|labial)/, "b"],
	[/^(?:lingual|palatinal|oral)/, "l"],
	[/^(?:inzisal|incisal)/, "i"]
];
/** Wörter aus Flächenbuchstaben, die im Satz etwas anderes heißen */
var KEIN_KUERZEL = /* @__PURE__ */ new Set([
	"ob",
	"do",
	"lob",
	"dom",
	"pol",
	"bold",
	"mob",
	"im",
	"bild",
	"blid"
]);
/** "m-o-d", "M O D", "M.O.D." -> "mod" */
var buchstabenZusammen = (t) => t.replace(/\b[modblpvi](?:[\s.-]+[modblpvi])+\b\.?/gi, (m) => m.replace(/[\s.-]+/g, ""));
function zaehneFinden(t) {
	const funde = [];
	const re = /(?<!\d|\d[,.])([1-4])\s?[,.]?\s?([1-8])(?!\d|[,.]\d|\s*(?:euro|€|prozent|%|-?\s?fach|mal\b))/gi;
	for (let m = re.exec(t); m; m = re.exec(t)) {
		const vorher = t.slice(Math.max(0, m.index - 8), m.index);
		if (/faktor\s*$/i.test(vorher)) continue;
		const zahn = m[1] + m[2];
		if (GUELTIG.has(zahn)) funde.push({
			zahn,
			pos: m.index,
			ende: m.index + m[0].length
		});
	}
	return funde;
}
function flaechenFinden(t) {
	const funde = [];
	const zahl = /\b(ein|eine|zwei|drei|vier|f(?:ü|ue)nf|[1-5])[\s-]*fl(?:ä|ae)ch(?:ig\w*|en|e)?\b/gi;
	for (let m = zahl.exec(t); m; m = zahl.exec(t)) {
		const n = ZAHL[m[1].toLowerCase().replace("ü", "ue")] ?? Number(m[1]);
		funde.push({
			pos: m.index,
			ende: m.index + m[0].length,
			flaechen: n,
			text: `${n}-flächig`
		});
	}
	const wort = /[a-zäöüß]+/gi;
	let lauf = null;
	const abschliessen = () => {
		if (lauf?.buchstaben.size) {
			const b = [...lauf.buchstaben].join("");
			funde.push({
				pos: lauf.pos,
				ende: lauf.ende,
				flaechen: Math.min(5, lauf.buchstaben.size),
				text: b
			});
		}
		lauf = null;
	};
	for (let m = wort.exec(t); m; m = wort.exec(t)) {
		const w = m[0].toLowerCase();
		const zwischen = lauf ? t.slice(lauf.ende, m.index) : "";
		if (lauf && /[,;:!?]|\d/.test(zwischen)) abschliessen();
		let buchstaben = [];
		const fw = FLAECHE_WORT.find(([re]) => re.test(w));
		if (fw) buchstaben = [fw[1]];
		else if (/^[modblpvi]{1,5}$/.test(w) && w !== "i" && new Set(w).size === w.length && !KEIN_KUERZEL.has(w)) buchstaben = [...w];
		if (buchstaben.length) {
			lauf ??= {
				pos: m.index,
				ende: m.index,
				buchstaben: /* @__PURE__ */ new Set()
			};
			buchstaben.forEach((x) => lauf.buchstaben.add(x));
			lauf.ende = m.index + m[0].length;
		} else if (!(lauf && w === "und")) abschliessen();
	}
	abschliessen();
	return funde.sort((a, b) => a.pos - b.pos);
}
function therapienFinden(t) {
	const funde = [];
	const re = /\b[\wäöüß-]*(aufbau|goldh(?:ä|ae)mmer|goldhammer|inlay|einlagef(?:ü|ue)llung|mehrfarb|mehrschicht|komposit|kunststoff|f(?:ü|ue)llung)[\wäöüß-]*/gi;
	for (let m = re.exec(t); m; m = re.exec(t)) {
		const w = m[0].toLowerCase();
		let therapie;
		if (w.includes("aufbau")) therapie = "aufbau";
		else if (/goldh/.test(w)) therapie = "goldhaemmer";
		else if (/inlay|einlage/.test(w)) therapie = "inlay";
		else if (/mehrfarb|mehrschicht/.test(w)) therapie = "mehrfarben";
		else therapie = "komposit";
		const f = {
			pos: m.index,
			ende: m.index + m[0].length,
			therapie
		};
		if (therapie === "inlay") {
			const umfeld = t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).toLowerCase();
			f.labor = /gold/.test(umfeld) ? "gold" : /cad|cerec|chairside/.test(umfeld) ? "cadcam" : "keramik";
		}
		funde.push(f);
	}
	return funde;
}
var VORRANG = [
	"aufbau",
	"inlay",
	"goldhaemmer",
	"mehrfarben",
	"komposit"
];
var NUR_VERBINDUNG = /^[\s,]*(?:(?:und|sowie|auch|plus|bei|an|auf|zahn|zähnen|zaehnen)[\s,]*)*$/i;
/** Erkennt Zähne, Flächen und Therapie je Zahn; ohne Flächen fehlt der Zahn in `zaehne` und steht in `ohneFlaechen`. */
function mkvAuftragVerstehen(roh) {
	const t = buchstabenZusammen(roh.replace(/\s+/g, " ").replace(/\b(\d\d),(?=\d\d\b)/g, "$1, "));
	const zf = zaehneFinden(t);
	const ff = flaechenFinden(t).filter((f) => !zf.some((z) => f.pos < z.ende && z.pos < f.ende));
	const tf = therapienFinden(t);
	const vor = (i) => [i ? zf[i - 1].ende : 0, zf[i].pos];
	const nach = (i) => [zf[i].ende, i + 1 < zf.length ? zf[i + 1].pos : t.length];
	const darin = (fs, [a, b]) => fs.filter((f) => f.pos >= a && f.ende <= b);
	const flPrefix = !!zf.length && !!ff.length && ff[0].ende <= zf[0].pos;
	const thPrefix = !!zf.length && !!tf.length && tf[0].ende <= zf[0].pos;
	const flaechenVon = zf.map((_, i) => {
		if (flPrefix) return darin(ff, vor(i)).at(-1) ?? (i === zf.length - 1 ? darin(ff, nach(i))[0] : void 0);
		return darin(ff, nach(i))[0] ?? (i === 0 ? darin(ff, vor(i)).at(-1) : void 0);
	});
	for (let i = 0; i < zf.length; i++) {
		if (flaechenVon[i]) continue;
		if (i + 1 < zf.length && flaechenVon[i + 1] && NUR_VERBINDUNG.test(t.slice(zf[i].ende, zf[i + 1].pos))) flaechenVon[i] = flaechenVon[i + 1];
		else if (i > 0 && flaechenVon[i - 1] && NUR_VERBINDUNG.test(t.slice(zf[i - 1].ende, zf[i].pos))) flaechenVon[i] = flaechenVon[i - 1];
	}
	const gewaehlt = /\bgew(?:ä|ae)hlt:\s*/gi;
	let schlussAb = -1;
	for (let m = gewaehlt.exec(t); m; m = gewaehlt.exec(t)) schlussAb = m.index + m[0].length;
	const schlussTh = schlussAb < 0 ? [] : tf.filter((f) => f.pos >= schlussAb);
	const entscheid = new Set(schlussTh.map((f) => f.therapie === "aufbau")).size === 1 ? schlussTh[0] : void 0;
	const aufbauUndFuellung = [];
	const therapieVon = zf.map((z, i) => {
		const eigene = thPrefix ? darin(tf, vor(i)) : darin(tf, nach(i));
		const letzte = i === zf.length - 1 && thPrefix ? darin(tf, nach(i)) : [];
		const erste = i === 0 && !thPrefix ? darin(tf, vor(i)) : [];
		const kandidaten = [
			...eigene,
			...letzte,
			...erste
		].filter((f) => !schlussTh.includes(f));
		if (new Set(kandidaten.map((f) => f.therapie === "aufbau")).size > 1) {
			if (entscheid) return entscheid.therapie === "aufbau" ? entscheid : kandidaten.find((f) => f.therapie !== "aufbau");
			if (!aufbauUndFuellung.includes(z.zahn)) aufbauUndFuellung.push(z.zahn);
		}
		if (kandidaten.length) return kandidaten.sort((a, b) => VORRANG.indexOf(a.therapie) - VORRANG.indexOf(b.therapie))[0];
		return thPrefix ? tf.filter((f) => f.ende <= z.pos).at(-1) : tf.find((f) => f.pos >= z.ende);
	});
	const klein = t.toLowerCase();
	const kofferdam = /kofferdam/.test(klein);
	const bmf = /besondere\w* ma(?:ß|ss)nahme/.test(klein);
	const anaesthesie = /an(?:ä|ae)sthes|spritze|bet(?:ä|ae)ub/.test(klein);
	const provisorium = /provisor/.test(klein);
	const stift = /stift/.test(klein);
	const mehrschicht = /mehrschicht/.test(klein);
	const zaehne = {};
	const ohneFlaechen = [];
	zf.forEach((z, i) => {
		const th = therapieVon[i];
		const therapie = th?.therapie ?? "komposit";
		const fl = flaechenVon[i];
		if (!fl) {
			if (!zaehne[z.zahn] && !ohneFlaechen.includes(z.zahn)) ohneFlaechen.push(z.zahn);
			return;
		}
		const max = THERAPIE[therapie].maxFlaechen ?? 5;
		zaehne[z.zahn] = {
			therapie,
			flaechen: Math.min(max, fl.flaechen),
			flaechenText: fl.text,
			...th?.labor ? { labor: th.labor } : {},
			...kofferdam ? { kofferdam } : {},
			...bmf ? { bmf } : {},
			...therapie === "inlay" || therapie === "goldhaemmer" ? {
				...anaesthesie ? { anaesthesie } : {},
				...provisorium ? { provisorium } : {}
			} : {},
			...therapie === "aufbau" ? {
				...stift ? { stift } : {},
				...mehrschicht ? { mehrschicht } : {}
			} : {}
		};
		const weg = ohneFlaechen.indexOf(z.zahn);
		if (weg >= 0) ohneFlaechen.splice(weg, 1);
	});
	return {
		zaehne,
		ohneFlaechen,
		aufbauUndFuellung,
		abformung: /scan|intraoral|digital/.test(klein) ? "scan" : /abdruck|abform/.test(klein) ? "abdruck" : void 0,
		privat: {
			.../fluorid/.test(klein) ? { fluorid: true } : {},
			.../oberfl(?:ä|ae)chenan(?:ä|ae)sthes/.test(klein) ? { oberflaeche: true } : {}
		}
	};
}
var liste = (xs) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs.at(-1)}`;
var sortiert = (zs) => [...zs].sort((a, b) => ALLE_ZAEHNE.indexOf(a) - ALLE_ZAEHNE.indexOf(b));
/** Gesprochener Auftrag + 01 → gerechnete Füllungs-MKV (ohne Nummer) oder Rückfrage */
function mkvEntwurf(auftragText, befund = {}, optionen = {}) {
	const a = mkvAuftragVerstehen(auftragText);
	const geplant = sortiert(Object.keys(a.zaehne));
	if (!geplant.length && !a.ohneFlaechen.length) return {
		status: "rueckfrage",
		grund: "zaehne",
		frage: "An welchen Zähnen soll ich die Füllungen planen, und mit wie vielen Flächen?"
	};
	for (const zahn of sortiert([...geplant, ...a.ohneFlaechen])) {
		const code = (befund[zahn] ?? "").trim().toLowerCase();
		const art = a.zaehne[zahn]?.therapie === "aufbau" ? "aufbau" : "fuellung";
		if (!konsHinweis(code, art).geht) return {
			status: "rueckfrage",
			grund: "befund_konflikt",
			zahn,
			frage: `Laut Befund ist ${zahn} ${BEFUND_KUERZEL[code] ? `ein${/zahn$/i.test(BEFUND_KUERZEL[code]) ? "" : "e"} ${BEFUND_KUERZEL[code]}` : code}, dort geht keine ${art === "aufbau" ? "Aufbaufüllung" : "Füllung"}. Welchen Zahn meinen Sie?`
		};
	}
	if (a.aufbauUndFuellung.length) {
		const z = sortiert(a.aufbauUndFuellung);
		const fl = z.length === 1 ? a.zaehne[z[0]]?.flaechen : void 0;
		return {
			status: "rueckfrage",
			grund: "aufbau_oder_fuellung",
			frage: `An ${liste(z)} haben Sie einen Aufbau und eine Füllung genannt; ein Aufbau setzt eine Krone voraus. Soll ich an ${liste(z)} den Aufbau oder die ${fl ? `${[
				"",
				"ein",
				"zwei",
				"drei",
				"vier",
				"fünf"
			][fl]}flächige ` : ""}Füllung planen?`
		};
	}
	if (a.ohneFlaechen.length) {
		const z = sortiert(a.ohneFlaechen);
		return {
			status: "rueckfrage",
			grund: "flaechen",
			frage: `Wie viele Flächen ${z.length > 1 ? `jeweils an ${liste(z)}` : `an ${z[0]}`}?`
		};
	}
	const einst = {
		...STANDARD_EINSTELLUNGEN,
		...optionen.einstellungen,
		praxis: {
			...STANDARD_EINSTELLUNGEN.praxis,
			...optionen.einstellungen?.praxis,
			...optionen.praxis
		}
	};
	const basis = neuerPlan("", einst);
	const zaehne = Object.fromEntries(geplant.map((z) => {
		const { flaechenText: _, ...rest } = a.zaehne[z];
		return [z, rest];
	}));
	const plan = {
		...basis,
		patient: {
			...basis.patient,
			...optionen.patient
		},
		zaehne,
		...Object.keys(a.privat ?? {}).length ? { privat: a.privat } : {},
		...a.abformung && geplant.some((z) => zaehne[z].therapie === "inlay") ? { abformung: a.abformung } : {}
	};
	const rechnung = rechnen(plan, einst);
	const hinweise = [];
	for (const zahn of geplant) {
		const h = konsHinweis((befund[zahn] ?? "").trim().toLowerCase(), zaehne[zahn].therapie === "aufbau" ? "aufbau" : "fuellung");
		if (h.text) hinweise.push(`Zahn ${zahn}: ${h.text}.`);
	}
	for (const z of rechnung.zaehne) hinweise.push(...z.warnungen.map((w) => `Zahn ${z.zahn}: ${w}`));
	if (geplant.some((z) => zaehne[z].therapie === "inlay") && !a.abformung) hinweise.push("Für die Inlays habe ich Abdruck angenommen.");
	const { regler: _, ...ablagePlan } = plan;
	return {
		status: "ok",
		plan,
		ablagePlan,
		rechnung,
		hinweise: [...new Set(hinweise)],
		zusammenfassung: {
			zaehne: rechnung.zaehne.map((z) => ({
				zahn: z.zahn,
				titel: z.titel,
				mehrkosten: z.mehrkosten
			})),
			privat: rechnung.privat,
			kassenanteil: rechnung.kassenanteil,
			mehrkosten: rechnung.mehrkosten,
			privat7: rechnung.privat7Summe
		}
	};
}
/** "Kompositfüllung in Adhäsivtechnik, zweiflächig an 36 und 37; Einlagefüllung (Inlay), dreiflächig an 46" */
function mkvVersorgungSatz(z) {
	const gruppen = /* @__PURE__ */ new Map();
	for (const x of z.zaehne) gruppen.set(x.titel, [...gruppen.get(x.titel) ?? [], x.zahn]);
	return [...gruppen].map(([titel, zs]) => `${titel} an ${liste(zs)}`).join("; ");
}
//#endregion
export { ENGINE_STAND, euro, mkvAuftragVerstehen, mkvEntwurf, mkvVersorgungSatz };
