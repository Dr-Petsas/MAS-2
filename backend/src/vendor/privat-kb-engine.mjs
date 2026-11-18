// GENERIERT aus F:\PlanR\KB\Privat-KB (src/clara/index.ts) – nicht von Hand ändern.
// Neu bauen: cd F:\PlanR\KB\Privat-KB && npm run build:engine   (sha256 1299551b0ad0)
//#region src/data/katalog.ts
/** Funktionsanalytische Leistungen rechnen mit dem eigenen Faktor-Regler. */
var istFunktionsanalyse = (nr) => nr.startsWith("80");
var BEB = new Map([
	{
		nr: "7601",
		text: "Schiene tiefgezogen (nicht adjustiert)",
		labor: "7602"
	},
	{
		nr: "7602",
		text: "Schiene tiefgezogen, zweiphasig",
		hinweis: "GOZ-Zuordnung strittig (7000 oder 7010)"
	},
	{
		nr: "7603",
		text: "Knirscherschiene aus Kunststoff",
		labor: "7621"
	},
	{
		nr: "7604",
		text: "Knirscherschiene aus Weichkunststoff"
	},
	{
		nr: "7605",
		text: "Retentionsschiene"
	},
	{
		nr: "7606",
		text: "Medikamententrägerschiene",
		labor: "7606"
	},
	{
		nr: "7611",
		text: "Schienungskappe aus Kunststoff, je Zahn"
	},
	{
		nr: "7612",
		text: "Schienungskappe aus Metall, je Zahn"
	},
	{
		nr: "7613",
		text: "Aufbisskappe aus Kunststoff, je Zahn"
	},
	{
		nr: "7614",
		text: "Aufbisskappe aus Metall, je Zahn"
	},
	{
		nr: "7621",
		text: "Adjustierte Aufbissschiene (Michigan-Typ)",
		labor: "7621"
	},
	{
		nr: "7622",
		text: "Aufbissschiene nach Schöttl"
	},
	{
		nr: "7623",
		text: "Aufbissschiene nach Shore"
	},
	{
		nr: "7624",
		text: "Aufbissplatte nach Schulz-Bongert"
	},
	{
		nr: "7625",
		text: "Bissführungsplatte"
	},
	{
		nr: "2957",
		text: "Fräsen einer Aufbissschiene bei Datenanlieferung (PMMA)",
		labor: "2957"
	},
	{
		nr: "2958",
		text: "Fräsen einer Aufbissschiene bei Datenanlieferung (Nylon)",
		labor: "2958"
	},
	{
		nr: "2959",
		text: "Konstruktion und Fräsen einer Aufbissschiene bei Modellanlieferung (Nylon)",
		labor: "2959"
	},
	{
		nr: "2960",
		text: "Konstruktion und Fräsen einer Aufbissschiene bei Modellanlieferung (PMMA)",
		labor: "2960"
	},
	{
		nr: "7201",
		text: "Frontaler oder lateraler Aufbiss, hart",
		labor: "7201",
		begleit: true
	},
	{
		nr: "7202",
		text: "Frontaler oder lateraler Aufbiss, weich",
		labor: "7202",
		begleit: true
	},
	{
		nr: "8015",
		text: "Instandsetzen einer Aufbissschiene, Grundeinheit",
		begleit: true
	},
	{
		nr: "8016",
		text: "Erweitern einer Aufbissschiene, Grundeinheit",
		begleit: true
	},
	{
		nr: "8021",
		text: "Leistungseinheit, Sprung aus Kunststoff",
		labor: "8021",
		begleit: true
	},
	{
		nr: "0001",
		text: "Modell aus Hartgips",
		labor: "0001",
		begleit: true
	},
	{
		nr: "0002",
		text: "Modell aus Superhartgips",
		labor: "0002",
		begleit: true
	},
	{
		nr: "0241",
		text: "Dublieren eines Modells oder Modellteils",
		labor: "0241",
		begleit: true
	},
	{
		nr: "0303",
		text: "Modell ausblocken, je Zahn oder Kieferteil",
		begleit: true
	},
	{
		nr: "0402",
		text: "Modellmontage in Mittelwertartikulator",
		labor: "0402",
		begleit: true
	},
	{
		nr: "0404",
		text: "Modellmontage in Mittelwertartikulator nach Gesichtsbogen",
		labor: "0404",
		begleit: true
	},
	{
		nr: "0405",
		text: "Modellmontage in individuellen Artikulator",
		labor: "0405",
		begleit: true
	},
	{
		nr: "0511",
		text: "Mehraufwand für Einstellen nach Zentrikregistrat",
		labor: "0511",
		begleit: true
	},
	{
		nr: "0521",
		text: "Auswerten eines Registrates",
		labor: "0521",
		begleit: true
	},
	{
		nr: "1115",
		text: "Registrierplatte und -stift auf Basen",
		labor: "1115",
		begleit: true
	},
	{
		nr: "1122",
		text: "Wachsplatte für zentrische Bissnahme vorbereiten",
		labor: "1122",
		begleit: true
	},
	{
		nr: "0732",
		text: "Desinfektion",
		labor: "0732",
		begleit: true
	},
	{
		nr: "0009",
		text: "Modell aus Kunststoff, gedruckt nach Intraoralscan",
		labor: "0009",
		begleit: true
	},
	{
		nr: "0701",
		text: "Versand je Versandgang",
		labor: "0701",
		begleit: true
	},
	{
		nr: "0036",
		text: "Versand bei Datenlieferung",
		labor: "0036",
		begleit: true
	},
	{
		nr: "F-UKPS",
		text: "Unterkieferprotrusionsschiene zweiteilig, Fremdlabor (lt. Kostenvoranschlag)",
		fremd: true,
		preis: 480
	},
	{
		nr: "F-UKPS-REP",
		text: "Instandsetzung/Erneuerung Protrusionselemente UKPS, Fremdlabor",
		fremd: true,
		preis: 90,
		begleit: true
	}
].map((b) => [b.nr, b]));
var G = (nr, anzahl = 1) => ({
	ebene: "GOZ",
	nr,
	anzahl
});
var L = (nr, anzahl = 1) => ({
	ebene: "LABOR",
	nr,
	anzahl
});
var A = (nr, text, anzahl = 1) => ({
	ebene: "GOZ",
	nr,
	anzahl,
	analog: true,
	text
});
/** Fremdlaborposition mit festem Preis und Text des Labors */
var F = (nr, text, preis, anzahl = 1) => ({
	ebene: "LABOR",
	nr,
	anzahl,
	text,
	preis
});
/** ResMed Narval (Polyamid, digital), Preise der Rechnung 6772594 vom 15.10.2026, netto zzgl. 7 % MwSt. */
var RESMED_NARVAL = [
	F("0009", "Modell aus Kunststoff inkl. Material CAM", 10.14, 2),
	F("0409", "Digitale Einartikulation mittelwertig", 14.89),
	F("7607", "Unterkieferprotrusionsschiene aus Polyamid (ResMed Narval)", 389.68),
	F("7626", "Befestigungselement Protrusionselement UKPS", 26.29, 4),
	F("7627", "Montage Protrusionselement UKPS", 26.29, 2),
	F("0701", "Versandkosten", 7.17)
];
var RESMED_MUNDOEFFNUNG = F("7628", "Befestigungselement Mundöffnungsbegrenzung UKPS", 15.1, 4);
/** Bemessung der UKPS-Eingliederung: BZÄK 07/2026 empfiehlt 6070, PKV und Beihilfe erkennen 2 × 7010 an. */
var UKPS_BEMESSUNG_STANDARD = "6070";
/** Texte und Bemessungen nach BZÄK, Ausschuss Gebührenrecht, „Unterkieferprotrusionsschiene zur Behandlung der Schlafapnoe“ (Juli 2026) */
var UKPS_TEXT = "Eingliederung einer Unterkieferprotrusionsschiene (zweiteilig, bimaxillär verankert, individuell nachjustierbar)";
var UKPS_DIAGNOSTIK = [
	A("4000", "Eingangsuntersuchung zur Versorgung mit einer Unterkieferprotrusionsschiene"),
	G("0040"),
	A("8050", "Dreidimensionale Registrierung der Startprotrusionsposition")
];
var UKPS_SCAN = [
	...UKPS_DIAGNOSTIK,
	G("0065", 4),
	A("UKPS", UKPS_TEXT)
];
/** Typische Behandlungen – fügen GOZ- und Laborpositionen hinzu, alles bleibt einzeln änderbar. */
var SCHIENEN = [
	{
		id: "michigan",
		titel: "Adjustierte Aufbissschiene",
		text: "Michigan-Typ, Mittelwertartikulator",
		pos: [
			G("7010"),
			L("0002", 3),
			L("0241"),
			L("0402"),
			L("7621"),
			L("0732", 2)
		]
	},
	{
		id: "knirscher",
		titel: "Knirscherschiene weich",
		text: "Weichkunststoff, adjustiert",
		pos: [
			G("7010"),
			L("0002", 2),
			L("0402"),
			L("7604"),
			L("0732", 2)
		]
	},
	{
		id: "tiefzieh",
		titel: "Tiefziehschiene",
		text: "nicht adjustiert (z. B. Miniplast)",
		pos: [
			G("7000"),
			L("0001"),
			L("7601"),
			L("0732", 2)
		]
	},
	{
		id: "digital",
		titel: "Digitale Schiene",
		text: "Intraoralscan, gefräst (PMMA)",
		pos: [
			G("0065", 4),
			G("7010"),
			L("0009", 2),
			L("0402"),
			L("2960"),
			L("0732")
		]
	}
];
var UKPS = [
	{
		id: "ukps-resmed",
		titel: "UKPS ResMed Narval",
		text: "nach BZÄK 07/2026, Intraoralscan, Labor ResMed (Preise 10/2026)",
		pos: [...UKPS_SCAN, ...RESMED_NARVAL]
	},
	{
		id: "ukps-resmed-mo",
		titel: "UKPS ResMed Narval + Mundöffnung",
		text: "wie oben, mit Mundöffnungsbegrenzung (4 Befestigungen)",
		pos: [
			...UKPS_SCAN,
			...RESMED_NARVAL,
			RESMED_MUNDOEFFNUNG
		]
	},
	{
		id: "ukps",
		titel: "UKPS anderes Labor",
		text: "nach BZÄK 07/2026, Abformung, Preis lt. Kostenvoranschlag",
		pos: [
			...UKPS_DIAGNOSTIK,
			G("0060"),
			A("UKPS", UKPS_TEXT),
			L("0002", 2),
			L("0402"),
			L("F-UKPS"),
			L("0701"),
			L("0732", 2)
		]
	},
	{
		id: "ukps-titration",
		titel: "Nachadaption und Kontrollen",
		text: "2 × Protrusionsgrad nachstellen, 2 × Kontrolle (je Sitzung)",
		pos: [A("5090", "Nachadaption des Protrusionsgrads einer Unterkieferprotrusionsschiene", 2), A("6210", "Kontrolle der Unterkieferprotrusionsschiene, ggf. mit einfachen Korrekturen", 2)]
	},
	{
		id: "ukps-reparatur",
		titel: "UKPS instand setzen",
		text: "Wiederherstellung mit Abformung, Fremdlabor",
		pos: [
			A("5260", "Maßnahmen zur Wiederherstellung der Funktion einer Unterkieferprotrusionsschiene (mit Abformung)"),
			L("F-UKPS-REP"),
			L("0701"),
			L("0732", 2)
		]
	}
];
var FUNKTION = [
	{
		id: "fal",
		titel: "Klinische Funktionsanalyse",
		text: "mit Heil- und Kostenplan",
		pos: [G("8000"), G("0040")]
	},
	{
		id: "fdi",
		titel: "Instrumentelle Funktionsanalyse",
		text: "Zentrikregistrat, Gesichtsbogen, Modellanalyse",
		pos: [
			G("8010", 2),
			G("8020"),
			G("8050"),
			G("8080"),
			L("0002", 2),
			L("0404"),
			L("0511"),
			L("0521"),
			L("1122")
		]
	},
	{
		id: "kontrolle",
		titel: "Kontrollen",
		text: "2 × Kontrolle, 1 × Einschleifen",
		pos: [G("7040", 2), G("7050")]
	},
	{
		id: "schienung",
		titel: "Semipermanente Schienung",
		text: "Ätztechnik, je Interdentalraum",
		pos: [G("7070", 5)]
	},
	{
		id: "lzp",
		titel: "Langzeitprovisorium",
		text: "je Zahn, mindestens 3 Monate Tragezeit",
		pos: [G("7080", 4), G("7090")]
	}
];
var VORLAGEN = [
	...SCHIENEN.map((v) => ({
		...v,
		gruppe: "Schienen"
	})),
	...UKPS.map((v) => ({
		...v,
		gruppe: "UKPS bei OSAS"
	})),
	...FUNKTION.map((v) => ({
		...v,
		gruppe: "Funktion und Nachsorge"
	}))
];
/** Gipsmodelle, die beim Intraoralscan durch gedruckte Modelle ersetzt werden */
var LABOR_GIPSMODELLE = ["0001", "0002"];
/** Entfallen beim Intraoralscan */
var LABOR_NUR_ABDRUCK = ["0241"];
/** Harte, adjustierte Schienen werden nach Scan konstruiert und gefräst – Position der Laborliste, Konstruktion inbegriffen */
var SCHIENE_GEFRAEST = {
	"7621": "2960",
	"7603": "2960"
};
/** Zurück auf Abdruck: gefräste Schiene → konventionelle Schiene */
var SCHIENE_ABDRUCK = { "2960": "7621" };
var LABOR_KLASSE_FAKTOR = [
	.85,
	1,
	1.2,
	1.5,
	1.8
];
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
			"nr": "2230",
			"text": "Teilleistung nach den Nummern 2200 bis 2220: Enden die Leistungen mit der Präparation eines Zahnes oder der Abdrucknahme beim Implantat, so ist die Hälfte der jeweiligen Gebühr berechnungsfähig.",
			"hinweis": "Keine eigene Punktzahl. Berechnungsfähig ist die Hälfte der Gebühr der jeweiligen Nummer 2200, 2210 oder 2220. Quelle: GOZ Anlage 1.",
			"punkte": 0,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2240",
			"text": "Teilleistung nach den Nummern 2200 bis 2220: Sind darüber hinaus weitere Maßnahmen erfolgt, so sind drei Viertel der jeweiligen Gebühr berechnungsfähig.",
			"hinweis": "Die Leistungen nach den Nummern 2230 oder 2240 sind nur berechnungsfähig, wenn es dem Zahnarzt objektiv auf Dauer unmöglich war, die Behandlung fortzusetzen oder eine Fortsetzung aus medizinischen Gründen nicht indiziert war. Keine eigene Punktzahl: drei Viertel der Gebühr der jeweiligen Nummer 2200, 2210 oder 2220. Quelle: GOZ Anlage 1.",
			"punkte": 0,
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
			"nr": "5050",
			"text": "Teilleistung nach den Nummern 5000 bis 5040: Enden die Leistungen mit der Präparation der Brückenpfeiler oder Prothesenanker mit Verbindungselementen oder der Abdrucknahme beim Implantat, so ist die Hälfte der jeweiligen Gebühr berechnungsfähig.",
			"hinweis": "Keine eigene Punktzahl. Berechnungsfähig ist die Hälfte der Gebühr der jeweiligen Nummer 5000 bis 5040. Quelle: GOZ Anlage 1.",
			"punkte": 0,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5060",
			"text": "Teilleistung nach den Nummern 5000 bis 5040: Sind darüber hinaus weitere Maßnahmen erfolgt, so sind drei Viertel der jeweiligen Gebühr berechnungsfähig.",
			"hinweis": "Die Leistungen nach den Nummern 5050 oder 5060 sind nur berechnungsfähig, wenn es dem Zahnarzt objektiv auf Dauer unmöglich war, die Behandlung fortzusetzen, oder eine Fortsetzung aus medizinischen Gründen nicht indiziert war. Keine eigene Punktzahl: drei Viertel der Gebühr der jeweiligen Nummer 5000 bis 5040. Quelle: GOZ Anlage 1.",
			"punkte": 0,
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
var goae_kb_default = {
	typ: "goae",
	name: "GOÄ – Röntgen für Schienentherapie und Funktionsdiagnostik (für Zahnärzte nach § 6 Abs. 2 GOZ)",
	punktwert: .0582873,
	quelle: "https://www.gesetze-im-internet.de/go__1982/anlage.html",
	eintraege: [{
		"nr": "5004",
		"punkte": 400,
		"kat": "O",
		"text": "Panoramaschichtaufnahme der Kiefer (OPG)"
	}, {
		"nr": "5090",
		"punkte": 400,
		"kat": "O",
		"text": "Schädel-Übersicht in zwei Ebenen (Fernröntgenseitenbild)"
	}]
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
//#region src/engine/listen.ts
var gozDaten = aktuell("goz-2012.json", goz_2012_default);
var bebDaten = aktuell("beb-itz-2024.json", beb_itz_2024_default);
var GOZ_PUNKTWERT = gozDaten.punktwert;
var GOZ = new Map(gozDaten.eintraege.map((e) => [e.nr, e]));
var LABOR = new Map(bebDaten.eintraege.map((e) => [e.nr, e]));
bebDaten.name;
var runden$1 = (x) => Math.round(x * 100) / 100;
var GOZ_SCHWELLE = 2.3;
var GOZ_HOECHSTSATZ = 3.5;
var gozPunkte = (nr) => GOZ.get(nr)?.punkte ?? 0;
var gozText = (nr) => GOZ.get(nr)?.text ?? "";
var gozEinzel = (nr, faktor) => runden$1(gozPunkte(nr) * GOZ_PUNKTWERT * faktor);
/** GOÄ (nach § 6 Abs. 2 GOZ), hier nur Röntgen: Abschnitt O mit Schwelle 1,8 und Höchstsatz 2,5. */
var GOAE = new Map(goae_kb_default.eintraege.map((e) => [e.nr, e]));
var GOAE_PUNKTWERT = goae_kb_default.punktwert;
var ROE_SCHWELLE = 1.8;
var ROE_HOECHSTSATZ = 2.5;
var goaeText = (nr) => GOAE.get(nr)?.text ?? "";
var istRoentgen = (nr) => GOAE.get(nr)?.kat === "O";
var goaeEinzel = (nr, faktor) => runden$1((GOAE.get(nr)?.punkte ?? 0) * GOAE_PUNKTWERT * faktor);
[...GOAE.keys()];
/** Röntgenfaktor zum GOZ-Faktor des Reglers: bis 2,3 höchstens 1,8, darüber gleichmäßig bis 2,5 bei 3,5. */
var roentgenFaktor = (f) => f <= 2.3 ? Math.min(f, ROE_SCHWELLE) : Math.min(ROE_HOECHSTSATZ, Math.round((ROE_SCHWELLE + (f - GOZ_SCHWELLE) * .7 / 1.2000000000000002) * 10) / 10);
/** Preis der Laborliste für eine Labornummer (undefined = nicht gelistet). */
var laborListenPreis = (nr) => nr ? LABOR.get(nr)?.preis : void 0;
//#endregion
//#region src/engine/kb.ts
var euro = (x) => x.toLocaleString("de-DE", {
	style: "currency",
	currency: "EUR",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});
var neueId = () => Math.random().toString(36).slice(2, 10);
/** Praxispreis, sonst Listenpreis der gleichbedeutenden Labornummer, sonst Platzhalter des Fremdlabors. */
function laborGrundpreis(nr, einst) {
	if (einst.laborPreise[nr] != null) return einst.laborPreise[nr];
	const b = BEB.get(nr);
	return laborListenPreis(b?.labor) ?? (b?.fremd ? b.preis : void 0);
}
/** Fremdlabor-Leistung ohne eigenen Preis und ohne Praxispreis: gerechnet wird mit dem Platzhalter aus dem Katalog. */
var istPlatzhalter = (p, einst) => p.preis == null && einst.laborPreise[p.nr] == null && !!BEB.get(p.nr)?.fremd;
var positionsFaktor = (p, plan) => p.faktor ?? (p.ebene === "GOAE" ? roentgenFaktor(plan.regler.faktor) : istFunktionsanalyse(p.nr) ? plan.regler.faFaktor : plan.regler.faktor);
/** Begründungsschwelle und Höchstsatz der Zeile (GOÄ-Röntgen 1,8/2,5, sonst GOZ 2,3/3,5) */
var grenzen = (z) => z.ebene === "GOAE" && istRoentgen(z.nr) ? {
	schwelle: ROE_SCHWELLE,
	hoechst: ROE_HOECHSTSATZ
} : {
	schwelle: GOZ_SCHWELLE,
	hoechst: GOZ_HOECHSTSATZ
};
function zeileAus(p, plan, einst) {
	const anzahl = Math.max(0, p.anzahl || 0);
	if (p.ebene === "GOAE") {
		const faktor = positionsFaktor(p, plan);
		const einzel = goaeEinzel(p.nr, faktor);
		return {
			id: p.id,
			ebene: "GOAE",
			nr: p.nr,
			text: p.text || goaeText(p.nr) || `GOÄ ${p.nr}`,
			anzahl,
			faktor,
			einzel,
			summe: runden$1(einzel * anzahl),
			ohnePreis: !einzel
		};
	}
	if (p.ebene === "GOZ") {
		const faktor = positionsFaktor(p, plan);
		const einzel = gozEinzel(p.nr, faktor);
		if (p.analog) return {
			id: p.id,
			ebene: "GOZ",
			nr: `${p.nr}a`,
			bemessung: p.nr,
			text: `${p.text || "Analogleistung"} – entsprechend GOZ ${p.nr}`,
			anzahl,
			faktor,
			einzel,
			summe: runden$1(einzel * anzahl)
		};
		return {
			id: p.id,
			ebene: "GOZ",
			nr: p.nr,
			text: p.text || gozText(p.nr),
			anzahl,
			faktor,
			einzel,
			summe: runden$1(einzel * anzahl)
		};
	}
	if (p.ebene === "MATERIAL") {
		const einzel = runden$1(p.preis ?? 0);
		return {
			id: p.id,
			ebene: "MATERIAL",
			nr: p.nr || "Mat.",
			text: p.text || "Material",
			anzahl,
			einzel,
			summe: runden$1(einzel * anzahl),
			ausXml: p.ausXml
		};
	}
	const platzhalter = istPlatzhalter(p, einst);
	const grund = p.preis ?? laborGrundpreis(p.nr, einst);
	const stufe = p.preis != null || platzhalter ? 1 : LABOR_KLASSE_FAKTOR[plan.regler.laborKlasse] ?? 1;
	const einzel = runden$1((grund ?? 0) * stufe);
	return {
		id: p.id,
		ebene: "LABOR",
		nr: p.nr,
		text: p.text || BEB.get(p.nr)?.text || `BEB ${p.nr}`,
		anzahl,
		einzel,
		summe: runden$1(einzel * anzahl),
		ohnePreis: grund == null,
		platzhalter,
		ausXml: p.ausXml
	};
}
var anzahlVon = (plan, nr) => plan.positionen.filter((p) => p.ebene === "GOZ" && !p.analog && p.nr === nr).reduce((s, p) => s + (p.anzahl || 0), 0);
function rechnen(plan, einst) {
	const zeilen = plan.positionen.filter((p) => p.anzahl > 0).map((p) => zeileAus(p, plan, einst));
	const honorar = zeilen.filter((z) => z.ebene === "GOZ" || z.ebene === "GOAE");
	const labor = zeilen.filter((z) => z.ebene === "LABOR" || z.ebene === "MATERIAL");
	const summeHonorar = runden$1(honorar.reduce((s, z) => s + z.summe, 0));
	const summeLabor = runden$1(labor.reduce((s, z) => s + z.summe, 0));
	const mwstSatz = einst.mwst ?? 7;
	const mwstBasis = labor.filter((z) => z.ebene === "LABOR" || z.ausXml).reduce((s, z) => s + z.summe, 0);
	const mwst = runden$1(Math.max(0, mwstBasis) * mwstSatz / 100);
	const hinweise = [];
	const warnungen = [];
	const hat = (nr) => anzahlVon(plan, nr) > 0;
	if (hat("0030") && hat("0040")) warnungen.push("GOZ 0030 und 0040 sind nicht nebeneinander berechnungsfähig.");
	if (anzahlVon(plan, "8010") > 2) hinweise.push("GOZ 8010 je Sitzung höchstens zweimal – bei mehr Registraten mehrere Sitzungen planen.");
	if ((hat("7080") || hat("7090")) && !hat("7100")) hinweise.push("7080/7090 setzen ein Langzeitprovisorium mit mindestens drei Monaten Tragezeit voraus; sonst 2260/2270 bzw. 5120/5140.");
	if (hat("7070")) hinweise.push("Entfernung der Schienung später nach GOÄ 2702 je Kiefer.");
	if (anzahlVon(plan, "0065") > 4) warnungen.push("GOZ 0065 je Kieferhälfte oder Frontzahnbereich: höchstens viermal je Sitzung (BZÄK-Kommentar zu 0065) – mehr nur bei eigener Indikation in einer weiteren Sitzung.");
	if (hat("0065") && hat("0060")) hinweise.push("Neben 0065 keine konventionelle Abformung derselben Kieferhälfte bzw. desselben Frontzahnbereichs.");
	if (labor.some((z) => z.ohnePreis)) warnungen.push("Für einzelne Laborpositionen ist kein Preis hinterlegt – Preis in der Zeile oder in den Einstellungen eintragen.");
	if (plan.positionen.some((p) => p.ebene === "LABOR" && p.nr === "7602")) hinweise.push("BEB 7602 (zweiphasig): GOZ-Zuordnung ist strittig (7000 oder 7010) – nach Gestaltung der Oberfläche wählen.");
	const vereinbarung2 = honorar.filter((z) => (z.faktor ?? 0) > grenzen(z).hoechst);
	const begruendung = honorar.filter((z) => (z.faktor ?? 0) > grenzen(z).schwelle && (z.faktor ?? 0) <= grenzen(z).hoechst);
	if (begruendung.some((z) => z.ebene === "GOZ")) hinweise.push("Faktoren über 2,3 brauchen eine schriftliche Begründung auf der Rechnung (§ 10 Abs. 3 GOZ).");
	if (begruendung.some((z) => z.ebene === "GOAE")) hinweise.push("Röntgen (GOÄ Abschnitt O) über 1,8 braucht eine schriftliche Begründung (§ 12 Abs. 3 GOÄ); höchstens 2,5.");
	if (vereinbarung2.some((z) => z.ebene === "GOZ")) hinweise.push("Faktoren über 3,5 nur mit Vereinbarung nach § 2 Abs. 1 und 2 GOZ vor Behandlungsbeginn.");
	if (vereinbarung2.some((z) => z.ebene === "GOAE")) warnungen.push("Röntgen (GOÄ Abschnitt O) über 2,5 ist nicht zulässig – auch nicht per Vereinbarung (§ 2 Abs. 3 GOÄ).");
	if (istUkps(plan.positionen)) {
		hinweise.push("Gesetzlich Versicherte: die UKPS bei OSAS ist Kassenleistung (BEMA UP1–UP6) – mit Veranlassung Schlafmedizin den Kassen-KB-Planer verwenden.");
		if (plan.positionen.some((p) => p.analog && /^Eingliederung einer Unterkieferprotrusionsschiene/.test(p.text ?? "") && p.nr !== "7010")) hinweise.push("PKV und Beihilfe erstatten die Eingliederung der UKPS oft nur nach 2 × 7010a – Patienten vorab über einen möglichen Eigenanteil informieren (BZÄK-Patienteninformation UKPS). Der Vergütungsanspruch bleibt davon unberührt.");
	}
	if (plan.positionen.some((p) => p.umfang)) hinweise.push("Begleitpositionen des Umfang-Reglers (Funktionsdiagnostik 8000 ff., Röntgen) nur berechnen, wenn sie indiziert sind, erbracht und dokumentiert werden – sonst in der Zeile entfernen. Röntgen nur mit rechtfertigender Indikation (§ 83 StrlSchG) und ohne aktuelle Vorbilder.");
	if (honorar.some((z) => z.bemessung)) hinweise.push("Analogleistung (§ 6 Abs. 1 GOZ): auf der Rechnung die erbrachte Leistung verständlich beschreiben, mit dem Hinweis „entsprechend“ und Nummer und Bezeichnung der Bemessungsleistung (§ 10 Abs. 4 GOZ).");
	const platzhalter = labor.filter((z) => z.platzhalter);
	if (platzhalter.length) warnungen.push(`Fremdlabor-Platzhalter (${platzhalter.map((z) => z.nr).join(", ")}): Kostenvoranschlag des Labors als XML einlesen oder Preis eintragen.`);
	if (plan.fremdlabor.import) hinweise.push(`Laborpreise aus dem Labor-XML ${plan.fremdlabor.import.datei} (Rechnung ${plan.fremdlabor.import.rechnungsnummer || "—"}, ${euro(plan.fremdlabor.import.netto)} netto).`);
	if (plan.abformung === "scan") {
		hinweise.push("Intraoralscan: GOZ 0065 je Kieferhälfte bzw. Frontzahnbereich statt 0060. Das Labor arbeitet auf gedruckten Modellen (0009) statt Gips; adjustierte harte Schienen werden konstruiert und gefräst (2960, Konstruktion inbegriffen), weiche und tiefgezogene Schienen entstehen auf dem gedruckten Modell. Versand bei Datenlieferung (0036). Laborkosten nach § 9 GOZ: maßgeblich ist die Rechnung des Labors.");
		if (plan.positionen.some((p) => p.ebene === "LABOR" && LABOR_GIPSMODELLE.includes(p.nr) && p.anzahl > 0)) warnungen.push("Intraoralscan gewählt, aber Gipsmodelle im Plan – Abformung umschalten oder Modelle prüfen.");
	}
	return {
		honorar,
		labor,
		summeHonorar,
		summeLabor,
		mwst,
		mwstSatz,
		gesamt: runden$1(summeHonorar + summeLabor + mwst),
		vereinbarung2,
		begruendung,
		hinweise,
		warnungen
	};
}
/** UKPS-Eingliederung: Bemessung aus den Einstellungen; 7010 (PKV/Beihilfe) bei zweiteiliger Schiene zweimal. */
function ukpsBemessung(v, einst) {
	const nr = einst?.ukpsAnalog || "6070";
	return {
		...v,
		nr,
		anzahl: v.anzahl * (nr === "7010" ? 2 : 1)
	};
}
/** Fügt die Positionen einer Vorlage an; gleiche Positionen werden zusammengezählt. `UKPS` = Bemessung aus den Einstellungen. */
function vorlageAnwenden(positionen, neu, einst) {
	const out = positionen.map((p) => ({ ...p }));
	for (const v of neu) {
		const n = v.nr === "UKPS" ? ukpsBemessung(v, einst) : v;
		const da = out.find((p) => p.ebene === n.ebene && p.nr === n.nr && p.faktor == null && p.preis == n.preis && !p.analog === !n.analog && (p.text ?? "") === (n.text ?? ""));
		if (da) da.anzahl += n.anzahl;
		else out.push({
			id: neueId(),
			ebene: n.ebene,
			nr: n.nr,
			anzahl: n.anzahl,
			...n.analog ? { analog: true } : {},
			...n.text ? { text: n.text } : {},
			...n.preis != null ? { preis: n.preis } : {}
		});
	}
	return out;
}
/** Vorlage, die einen Intraoralscan voraussetzt (GOZ 0065) – der Plan stellt dann auf Scan um. */
var vorlageMitScan = (vorlage) => vorlage.some((v) => v.ebene === "GOZ" && !v.analog && v.nr === "0065");
/** Fügt eine Vorlage ein; eine Scan-Vorlage stellt den Plan auf Intraoralscan um, im Scan-Plan läuft alles digital. */
function vorlageEinfuegen(positionen, vorlage, abformung, einst) {
	const ziel = abformung === "scan" || vorlageMitScan(vorlage) ? "scan" : "abdruck";
	const neu = vorlageAnwenden(positionen, vorlage, einst);
	return {
		positionen: ziel === "scan" ? abformungAnwenden(neu, "scan") : neu,
		abformung: ziel
	};
}
var istUkps = (positionen) => positionen.some((p) => p.anzahl > 0 && (p.nr.startsWith("F-UKPS") || p.ebene === "LABOR" && p.nr === "7607" || p.analog && /protrusion/i.test(p.text ?? "")));
/** Laborzeile mit festem Fremdlaborpreis (Vorlage oder Labor-XML) – bleibt beim Umstellen des Abformwegs unberührt. */
var festpreis = (p) => p.ebene === "LABOR" && p.preis != null;
var menge = (positionen, ebene, nrs) => positionen.filter((p) => p.ebene === ebene && !p.analog && !festpreis(p) && nrs.includes(p.nr) && p.anzahl > 0).reduce((s, p) => s + p.anzahl, 0);
function ersetzen(positionen, ebene, alt, nr, anzahl) {
	const rest = positionen.filter((p) => !(p.ebene === ebene && !p.analog && !festpreis(p) && alt.includes(p.nr)));
	if (!anzahl) return rest;
	const da = rest.find((p) => p.ebene === ebene && p.nr === nr && !p.analog && p.preis == null && p.faktor == null);
	if (da) return rest.map((p) => p === da ? {
		...p,
		anzahl: p.anzahl + anzahl
	} : p);
	return [...rest, {
		id: neueId(),
		ebene,
		nr,
		anzahl
	}];
}
var umstellbar = (p) => p.ebene === "LABOR" && !p.analog && !festpreis(p);
/** Tauscht Labornummern nach Tabelle; gleiche Zielpositionen ohne eigenen Preis werden zusammengezählt. */
function umnummern(positionen, tabelle) {
	let pos = positionen;
	for (const [alt, nr] of Object.entries(tabelle)) pos = ersetzen(pos, "LABOR", [alt], nr, menge(pos, "LABOR", [alt]));
	return pos;
}
/**
* Stellt Honorar und Labor auf den Abformweg um. Intraoralscan: 0060 → 0065 für beide Kiefer, Gipsmodelle →
* gedruckte Modelle (BEB 0009), Doublieren entfällt, adjustierte harte Schienen → Konstruktion und Fräsen (2960),
* Versand → Versand bei Datenlieferung. Es kommen nur Positionen der Laborliste in den Plan. Weiche und tiefgezogene
* Schienen bleiben und entstehen auf dem gedruckten Modell. Fremdlabor-Festpreise bleiben unberührt. Abdruck: zurück.
*/
function abformungAnwenden(positionen, ziel) {
	let pos = positionen;
	if (ziel === "scan") {
		const abdruck = menge(pos, "GOZ", ["0060"]);
		if (abdruck) pos = ersetzen(pos, "GOZ", ["0060"], "0065", 4 * abdruck);
		pos = ersetzen(pos, "LABOR", LABOR_GIPSMODELLE, "0009", menge(pos, "LABOR", LABOR_GIPSMODELLE));
		pos = pos.filter((p) => !(umstellbar(p) && LABOR_NUR_ABDRUCK.includes(p.nr)));
		pos = umnummern(pos, SCHIENE_GEFRAEST);
		return ersetzen(pos, "LABOR", ["0701"], "0036", menge(pos, "LABOR", ["0701"]));
	}
	const scan = menge(pos, "GOZ", ["0065"]);
	if (scan) pos = ersetzen(pos, "GOZ", ["0065"], "0060", Math.max(1, Math.round(scan / 4)));
	pos = ersetzen(pos, "LABOR", ["0009"], "0002", menge(pos, "LABOR", ["0009"]));
	pos = umnummern(pos, SCHIENE_ABDRUCK);
	return ersetzen(pos, "LABOR", ["0036"], "0701", menge(pos, "LABOR", ["0036"]));
}
//#endregion
//#region src/stammdaten.ts
var leererPatient = () => ({
	anrede: "",
	titel: "",
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
	kassenart: "primaer",
	email: ""
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
/** Praxiskopf vom PlanR-Server (/api/praxisdaten); alle Planer teilen sich diesen Speicher. */
var ZENTRALE_PRAXIS_KEY = "planr.praxis.zentral.v1";
//#endregion
//#region src/arzt.ts
var ARZT_KEY = "planr.arzt.v1";
var ARZT_EREIGNIS = "planr-arzt";
var STEMPEL_BLAU = "#1c3f94";
function arztLesen() {
	try {
		const r = typeof localStorage === "undefined" ? null : JSON.parse(localStorage.getItem("planr.arzt.v1") ?? "null");
		return r && typeof r === "object" && typeof r.name === "string" ? r : null;
	} catch {
		return null;
	}
}
var kennung$1 = (s) => `${s.length}:${s.slice(-48)}`;
/** Dunkle Striche → Stempelblau, Hintergrund (weiß oder transparent) → durchsichtig. */
function blauFaerben(dataUrl) {
	return new Promise((fertig) => {
		if (!dataUrl || typeof document === "undefined") return fertig(dataUrl);
		const bild = new Image();
		bild.onload = () => {
			const c = document.createElement("canvas");
			c.width = bild.naturalWidth;
			c.height = bild.naturalHeight;
			const ctx = c.getContext("2d");
			if (!ctx || !c.width || !c.height) return fertig(dataUrl);
			ctx.drawImage(bild, 0, 0);
			const d = ctx.getImageData(0, 0, c.width, c.height);
			const [r, g, b] = [
				1,
				3,
				5
			].map((i) => parseInt(STEMPEL_BLAU.slice(i, i + 2), 16));
			let [x0, y0, x1, y1] = [
				c.width,
				c.height,
				-1,
				-1
			];
			for (let i = 0; i < d.data.length; i += 4) {
				const hell = (d.data[i] * 299 + d.data[i + 1] * 587 + d.data[i + 2] * 114) / 1e3;
				const roh = d.data[i + 3] * (255 - hell) / 255;
				const deckung = roh < 12 ? 0 : Math.min(255, roh * 2.2);
				d.data[i] = r;
				d.data[i + 1] = g;
				d.data[i + 2] = b;
				d.data[i + 3] = deckung;
				if (deckung) {
					const p = i / 4;
					const [x, y] = [p % c.width, Math.floor(p / c.width)];
					x0 = Math.min(x0, x);
					x1 = Math.max(x1, x);
					y0 = Math.min(y0, y);
					y1 = Math.max(y1, y);
				}
			}
			if (x1 < 0) return fertig("");
			ctx.putImageData(d, 0, 0);
			const rand = 4;
			const [x, y] = [Math.max(0, x0 - rand), Math.max(0, y0 - rand)];
			const zu = document.createElement("canvas");
			zu.width = Math.min(c.width, x1 + rand + 1) - x;
			zu.height = Math.min(c.height, y1 + rand + 1) - y;
			zu.getContext("2d")?.drawImage(c, x, y, zu.width, zu.height, 0, 0, zu.width, zu.height);
			fertig(zu.toDataURL("image/png"));
		};
		bild.onerror = () => fertig("");
		bild.src = dataUrl;
	});
}
/** Stand vom Server übernehmen; die Unterschrift nur bei Änderung neu färben. */
async function arztUebernehmen(roh) {
	if (!roh || typeof roh.name !== "string" || typeof localStorage === "undefined") return;
	const original = typeof roh.signatur === "string" && roh.signatur.startsWith("data:image/") ? roh.signatur : "";
	const alt = arztLesen();
	const quelle = kennung$1(original);
	if (alt && alt.name === roh.name && alt.quelle === quelle) return;
	const neu = {
		name: roh.name,
		signatur: alt?.quelle === quelle ? alt.signatur : await blauFaerben(original),
		quelle
	};
	try {
		localStorage.setItem(ARZT_KEY, JSON.stringify(neu));
	} catch {
		return;
	}
	if (typeof window !== "undefined") window.dispatchEvent(new Event(ARZT_EREIGNIS));
}
//#endregion
//#region src/ablage.ts
/** PlanR-Übersicht; die Sitzung (Cookie) gilt für denselben Host, daher nicht fest 127.0.0.1 */
var hubAdresse = () => typeof location === "undefined" ? "http://127.0.0.1:5189/api/plaene" : location.pathname.startsWith("/planer/") ? `${location.origin}/api/plaene` : location.hostname.endsWith(".pickadoc-tunnel.com") ? "https://planr.pickadoc-tunnel.com/api/plaene" : `http://${location.hostname}:5189/api/plaene`;
/** Praxiskopf vom Server holen; beim ersten neuen Stand einmal neu laden, damit die Planer-Einstellungen ihn übernehmen. */
function praxisAbgleichen() {
	if (typeof fetch !== "function" || typeof localStorage === "undefined" || typeof location === "undefined") return;
	fetch(hubAdresse().replace(/\/plaene$/, "/praxisdaten"), {
		cache: "no-store",
		credentials: "include"
	}).then((r) => r.ok ? r.json() : null).then((d) => {
		arztUebernehmen(d?.arzt);
		if (!d?.praxis || !Object.keys(d.praxis).length) return;
		const neu = JSON.stringify(d.praxis);
		if (localStorage.getItem("planr.praxis.zentral.v1") === neu) return;
		localStorage.setItem(ZENTRALE_PRAXIS_KEY, neu);
		if (sessionStorage.getItem("planr.praxis.zentral.v1")) return;
		sessionStorage.setItem(ZENTRALE_PRAXIS_KEY, "1");
		location.reload();
	}).catch(() => {});
}
praxisAbgleichen();
typeof location === "undefined" || (new URLSearchParams(location.search).get("plan") ?? "").trim().slice(0, 80);
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
//#region src/store.ts
var UKPS_STAND = "bzaek-2026-07";
mk("privat-kb.plan.v1");
mk("privat-kb.einstellungen.v1");
mk("privat-kb.liste.v1");
var STANDARD_EINSTELLUNGEN = {
	praxis: standardPraxis(),
	faktor: 2.3,
	faFaktor: 2.3,
	gueltigMonate: 6,
	naechsteNummer: 1,
	laborName: "",
	laborPreise: {},
	ukpsAnalog: UKPS_BEMESSUNG_STANDARD,
	ukpsStand: UKPS_STAND,
	mwst: 7
};
var reglerAus = (e) => ({
	faktor: e.faktor,
	faFaktor: e.faFaktor,
	laborKlasse: 1
});
function neuerPlan(nummer, einst) {
	return {
		nummer,
		datum: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
		patient: leererPatient(),
		diagnose: "",
		positionen: [],
		regler: reglerAus(einst),
		abformung: "abdruck",
		fremdlabor: { name: einst.laborName },
		bemerkung: ""
	};
}
//#endregion
//#region src/clara/index.ts
/**
* Einstieg für MAS/Clara: Kostenvoranschlag Schiene per Sprache. Der Auftrag kommt schon geordnet an
* (welche Vorlagen, welcher Abformweg) – was der gesprochene Satz bedeutet, entscheidet das Modell, hier wird
* kein Satz zerlegt. Gerechnet wird mit der Engine dieses Planers, eingefügt wird wie beim Klick auf die Vorlage.
* `npm run build:engine` baut daraus MAS-2/backend/src/vendor/privat-kb-engine.mjs.
*/
var ENGINE_STAND = "2026-11-18 11:43";
/** Alles, was der Planer als Vorlage führt – die Auswahl für das Werkzeug. */
var KB_VORLAGEN = VORLAGEN.map((v) => ({
	id: v.id,
	gruppe: v.gruppe,
	titel: v.titel,
	text: v.text
}));
var runden = (x) => Math.round(x * 100) / 100;
var liste = (a) => a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} und ${a[a.length - 1]}`;
var WAHL = "Welche Schiene soll es sein: Knirscherschiene, adjustierte Aufbissschiene, Tiefziehschiene, digitale Schiene oder Unterkieferprotrusionsschiene?";
function kbEntwurf(auftrag = {}, optionen = {}) {
	const ids = [...new Set((auftrag.vorlagen ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
	const gewaehlt = ids.map((id) => VORLAGEN.find((v) => v.id === id));
	if (!ids.length || gewaehlt.some((v) => !v)) return {
		status: "rueckfrage",
		grund: "vorlage",
		frage: WAHL
	};
	const einst = {
		...STANDARD_EINSTELLUNGEN,
		...optionen.einstellungen,
		praxis: {
			...STANDARD_EINSTELLUNGEN.praxis,
			...optionen.einstellungen?.praxis
		},
		laborPreise: {
			...STANDARD_EINSTELLUNGEN.laborPreise,
			...optionen.einstellungen?.laborPreise
		}
	};
	const basis = neuerPlan("", einst);
	let positionen = basis.positionen;
	let abformung = auftrag.abformung === "scan" ? "scan" : "abdruck";
	for (const v of gewaehlt) {
		const neu = vorlageEinfuegen(positionen, v.pos, abformung, einst);
		positionen = neu.positionen;
		abformung = neu.abformung;
	}
	const plan = {
		...basis,
		patient: {
			...basis.patient,
			...optionen.patient
		},
		diagnose: String(auftrag.diagnose ?? "").trim(),
		positionen,
		abformung,
		vorlagen: ids
	};
	const rechnung = rechnen(plan, einst);
	const { regler: _regler, ...ablagePlan } = plan;
	return {
		status: "ok",
		plan,
		ablagePlan,
		rechnung,
		zusammenfassung: {
			titel: gewaehlt.map((v) => v.titel),
			abformung,
			summe: rechnung.gesamt,
			honorar: rechnung.summeHonorar,
			labor: runden(rechnung.summeLabor + rechnung.mwst)
		},
		hinweise: rechnung.warnungen
	};
}
/** "Knirscherschiene weich und Kontrollen, mit Intraoralscan" */
function kbVersorgungSatz(z) {
	return `${liste(z.titel)}${z.abformung === "scan" ? ", mit Intraoralscan" : ""}`;
}
//#endregion
export { ENGINE_STAND, KB_VORLAGEN, euro, kbEntwurf, kbVersorgungSatz };
