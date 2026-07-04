// Basis-Doku-Kataloge fuer ALLE Fachrichtungen (04.07.2026).
//
// Zwei Schichten, beide reine DATEN:
//
//   1. ARCHETYP_REGELN — fachUEBERGREIFENDE Termin-Archetypen (Beratung,
//      Eingriff, Bildgebung, Labor, Impfung, Wunde, Kontrolle ...). Sie fangen
//      in JEDER Fachrichtung die Besuchsgruende ab, fuer die der Fachkatalog
//      keine speziellere Regel hat. Ein Orthopaede ohne eigene Regel fuer
//      "Befundbesprechung MRT" landet damit trotzdem bei einer sinnvollen
//      Gespraechs-Doku (Themen! Entscheidung!) statt im leeren Geruest.
//
//   2. BASIS_FACH_KATALOGE — je Master-Katalog (masterCatalogs/{key}) die
//      fachSPEZIFISCHEN Regeln, verankert an den ECHTEN Besuchsgrund-Namen
//      der Plattform-Kataloge (Dump 04.07.2026). Status "basis_entwurf":
//      klinisch sinnvolle Startwerte, die pro Praxis per Lern-Profil
//      (dokuLernen.js) verfeinert werden — NICHT in Stein gemeisselt.
//
// Aufloesung (dokuPflicht.dokuAnforderungen): Fachkatalog-Regel gewinnt,
// sonst Archetyp, sonst nur das universelle DOKU_GERUEST.

/** Fachuebergreifende Archetypen. Reihenfolge = Prioritaet (erste gewinnt). */
export const ARCHETYP_REGELN = [
  // ---- interne / nicht patientenbezogene Termine -------------------------
  {
    id: "a_intern", label: "Interner Termin",
    match: /handwerker|fortbildung|teambe|vertreter|telebot|clonr|videotest|^dlab|^mlab (?!blutentnahme|prp)/i,
    eingriff: false, umfang: "keine", felder: [],
  },
  // ---- Notfall / Akut -----------------------------------------------------
  {
    id: "a_notfall", label: "Notfall / Akutvorstellung",
    match: /notfall|akut|krise|unfall/i,
    eingriff: false, umfang: "voll",
    felder: [
      { key: "beschwerden", pflicht: true, frage: "Welche Beschwerden, seit wann?" },
      { key: "sofortmassnahme", pflicht: true, frage: "Welche Sofortmassnahme wurde getroffen?" },
    ],
  },
  // ---- Impfung (rechtlich: Impfstoff + Chargennummer!) ---------------------
  {
    id: "a_impfung", label: "Impfung",
    match: /impfung(?!spass)|impfen/i,
    eingriff: true, umfang: "kurz",
    felder: [
      { key: "impfstoff", pflicht: true, frage: "Welcher Impfstoff?" },
      { key: "charge", pflicht: true, frage: "Welche Chargennummer?" },
      { key: "injektionsort", pflicht: true, frage: "Wohin geimpft (z. B. M. deltoideus links)?" },
      { key: "vertraeglichkeit", pflicht: false, frage: "Sofortreaktion beobachtet?" },
    ],
  },
  // ---- Beratung / Besprechung / Aufklaerung (VOR Eingriff: "OP-Aufklaerung",
  //      "Beratung Vollnarkose" sind GESPRAECHE, keine Eingriffe!) -----------
  {
    id: "a_gespraech", label: "Beratung / Besprechung / Aufklaerung",
    match: /beratung|besprechung|aufklaerung|aufklärung|zweitmeinung|konsil|sprechstunde|planung|planbesprechung|gespraech|gespräch|schulung|coaching|vorbesprechung|nachgespraech|nachgespräch|tumorboard/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "themen", pflicht: true, frage: "Welche Themen wurden besprochen (Befund, Optionen, Risiken, Kosten)?" },
      { key: "entscheidung", pflicht: true, frage: "Was ist das Ergebnis — wie hat sich der Patient entschieden?" },
      { key: "unterlagen", pflicht: false, frage: "Unterlagen erstellt oder mitgegeben?" },
    ],
  },
  // ---- Attest / Bescheinigung / Gutachten ----------------------------------
  {
    id: "a_attest", label: "Attest / Bescheinigung / Gutachten",
    match: /attest|bescheinigung|arbeitsunfaehig|arbeitsunfähig|gutachten|bericht-termin|tauglichkeit/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "art", pflicht: true, frage: "Welches Attest beziehungsweise welche Bescheinigung — und was wurde bescheinigt?" },
      { key: "grundlage", pflicht: true, frage: "Auf welcher Befund-Grundlage?" },
    ],
  },
  // ---- Rezept / Verordnung --------------------------------------------------
  {
    id: "a_rezept", label: "Rezept / Verordnung / Medikamentenplan",
    match: /rezept|verordnung|medikamentenplan|verlaengerung|verlängerung/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "praeparat", pflicht: true, frage: "Welche Praeparate mit welcher Dosierung?" },
      { key: "kontrolle", pflicht: false, frage: "Wann ist die naechste Kontrolle faellig?" },
    ],
  },
  // ---- DMP ------------------------------------------------------------------
  {
    id: "a_dmp", label: "DMP-Termin",
    match: /\bdmp\b/i,
    eingriff: false, umfang: "voll",
    felder: [
      { key: "parameter", pflicht: true, frage: "Welche DMP-Parameter wurden erhoben (z. B. RR, HbA1c, Fusstatus)?" },
      { key: "zielvereinbarung", pflicht: true, frage: "Welche Zielvereinbarung beziehungsweise Schulung?" },
    ],
  },
  // ---- Endoskopie -------------------------------------------------------------
  {
    id: "a_endoskopie", label: "Endoskopie",
    match: /koloskopie|gastroskopie|spiegelung|endoskopie|bronchoskopie|zystoskopie|proktoskopie|rektoskopie/i,
    eingriff: true, umfang: "voll",
    felder: [
      { key: "sedierung", pflicht: true, frage: "Mit welcher Sedierung — und wie vertragen?" },
      { key: "reichweite", pflicht: true, frage: "Bis wohin eingesehen (z. B. terminales Ileum erreicht)?" },
      { key: "befunde", pflicht: true, frage: "Welche Befunde — Polypen, Laesionen, Biopsien?" },
      { key: "histologie", pflicht: false, frage: "Material zur Histologie eingesandt?" },
    ],
  },
  // ---- Bildgebung (Sono/MRT/CT/Roentgen/Mammo/DXA/OCT) ------------------------
  // Rechtfertigende Indikation bei ionisierender Strahlung erzwingt zusaetzlich
  // die Querschnitt-Regel (dokuPflicht.QUERSCHNITT_REGELN).
  {
    id: "a_bildgebung", label: "Bildgebung",
    match: /sono|ultraschall|duplex|doppler|\bmrt\b|\bct\b|roentgen|röntgen|mammograph|\bdxa\b|\boct\b|szintigraph|angiograph/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "region", pflicht: true, frage: "Welche Region wurde untersucht?" },
      { key: "indikation", pflicht: true, frage: "Mit welcher Indikation beziehungsweise Fragestellung?" },
      { key: "befund", pflicht: true, frage: "Wie lautet der Befund?" },
    ],
  },
  // ---- Funktionsdiagnostik ------------------------------------------------------
  {
    id: "a_funktionsdiagnostik", label: "Funktionsdiagnostik",
    match: /\bekg\b|ergometrie|belastungs|lungenfunktion|spirometrie|bodyplethysmo|\beeg\b|\bemg\b|\bnlg\b|polygraph|uroflow|urodynamik|audiometrie|hoertest|hörtest|sehtest|gesichtsfeld|stroboskop|restharn|kapillarmikroskop|hirnleistung|atemtest|langzeit-/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "untersuchung", pflicht: true, frage: "Welche Untersuchung mit welcher Fragestellung?" },
      { key: "ergebnis", pflicht: true, frage: "Wie ist das Ergebnis beziehungsweise der Messwert?" },
    ],
  },
  // ---- Labor / Probenentnahme -----------------------------------------------
  {
    id: "a_labor", label: "Labor / Probenentnahme",
    match: /labor|blutabnahme|blutentnahme|abstrich|kultur|spermiogramm|testtermin|-test\b|test\b|screening|tumormarker|\bpsa\b/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "material", pflicht: true, frage: "Welches Material beziehungsweise welche Parameter?" },
      { key: "anlass", pflicht: false, frage: "Mit welcher Fragestellung?" },
    ],
  },
  // ---- Injektion / Infiltration / Punktion -------------------------------------
  {
    id: "a_injektion", label: "Injektion / Infiltration / Punktion",
    match: /injektion|infiltration|punktion|botox|hyaluron|eigenblut|\bprp\b|mesotherapie|blockade/i,
    eingriff: true, umfang: "voll",
    felder: [
      { key: "praeparat", pflicht: true, frage: "Welches Praeparat und welche Dosis beziehungsweise Menge?" },
      { key: "injektionsort", pflicht: true, frage: "Wohin (Region, Seite)?" },
      { key: "sterilitaet", pflicht: true, frage: "Sterile Kautelen eingehalten?" },
      { key: "vertraeglichkeit", pflicht: false, frage: "Sofortreaktion beziehungsweise Vertraeglichkeit?" },
    ],
  },
  // ---- Infusion / Systemtherapie -------------------------------------------------
  {
    id: "a_infusion", label: "Infusion / Systemtherapie",
    match: /infusion|chemotherapie|antikoerpertherapie|antikörpertherapie|immuntherapie|bisphosphonat|biologika/i,
    eingriff: true, umfang: "voll",
    felder: [
      { key: "schema", pflicht: true, frage: "Welches Schema/Praeparat, welcher Zyklus, welche Dosis?" },
      { key: "labor_vor_gabe", pflicht: true, frage: "Labor vor Gabe geprueft und freigegeben?" },
      { key: "vertraeglichkeit", pflicht: true, frage: "Wie war die Vertraeglichkeit — Nebenwirkungen?" },
    ],
  },
  // ---- OP / Eingriff / Exzision / Biopsie (NACH Gespraech + Injektion!) ---------
  {
    id: "a_eingriff", label: "Operation / kleiner Eingriff",
    match: /\bop\b|operation|exzision|entfernung|biopsie|konisation|vasektomie|anlage\b|straffung|liposuktion|laserbehandlung|kryo|verödung|veroedung|sklerosierung|stosswellen|\beswl\b/i,
    eingriff: true, umfang: "voll",
    felder: [
      { key: "eingriff", pflicht: true, frage: "Welcher Eingriff genau — was wurde gemacht?" },
      { key: "lokalisation", pflicht: true, frage: "Welche Lokalisation (Region, Seite)?" },
      { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
      { key: "verlauf", pflicht: true, frage: "Wie war der Verlauf — Blutstillung, Naht?" },
      { key: "histologie", pflicht: false, frage: "Material zur Histologie eingesandt?" },
      { key: "nachsorge", pflicht: true, frage: "Welche Verhaltensregeln beziehungsweise Nachsorge?" },
    ],
  },
  // ---- Wunde / Verband / Faeden ---------------------------------------------------
  {
    id: "a_wunde", label: "Wundkontrolle / Verband / Faeden",
    match: /wundkontrolle|wundversorgung|wunde|verbandwechsel|verbandswechsel|verband\b|faeden|fäden|fadenzug|nahtentfernung/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "wundstatus", pflicht: true, frage: "Wie sind die Wundverhaeltnisse?" },
      { key: "massnahme", pflicht: true, frage: "Was wurde gemacht (Verband, Faeden, Spuelung)?" },
    ],
  },
  // ---- Vorsorge / Check-up / U-Untersuchungen --------------------------------------
  {
    id: "a_vorsorge", label: "Vorsorge / Check-up",
    match: /vorsorge|check-?up|frueherkennung|früherkennung|praevention|prävention|krebsvorsorge|\bu\d{1,2}\b|\bj[12]\b|impfpass/i,
    eingriff: false, umfang: "voll",
    felder: [
      { key: "umfang", pflicht: true, frage: "Was wurde untersucht (Umfang der Vorsorge)?" },
      { key: "befund", pflicht: true, frage: "Wie ist der Befund — Auffaelligkeiten?" },
      { key: "empfehlung", pflicht: true, frage: "Welche Empfehlung beziehungsweise nächster Vorsorge-Schritt?" },
    ],
  },
  // ---- Erstvorstellung ----------------------------------------------------------------
  {
    id: "a_erstvorstellung", label: "Erstvorstellung / Erstuntersuchung",
    match: /erstvorstellung|erstberatung|ersttermin|erstgespraech|erstgespräch|neupatient|erstuntersuchung|erstabklaerung|erstabklärung|aufnahme\b/i,
    eingriff: false, umfang: "voll",
    felder: [
      { key: "aktuelle_anamnese", pflicht: true, frage: "Aktuelle Beschwerden und Vorgeschichte erhoben?" },
      { key: "untersuchungsbefund", pflicht: true, frage: "Wie ist der Untersuchungsbefund?" },
    ],
  },
  // ---- Therapie-Sitzung (Physik./Verfahren) ----------------------------------------------
  {
    id: "a_therapiesitzung", label: "Therapie-Sitzung",
    match: /sitzung|akupunktur|hyposensibilisierung|tabakentwoehnung|tabakentwöhnung|microneedling|peeling|therapie-?termin/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "verfahren", pflicht: true, frage: "Welches Verfahren, welche Sitzungsnummer?" },
      { key: "verlauf", pflicht: true, frage: "Wie war der Verlauf — Reaktion des Patienten?" },
    ],
  },
  // ---- Videosprechstunde ---------------------------------------------------------------
  {
    id: "a_video", label: "Videosprechstunde",
    match: /^vid\b|video/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "themen", pflicht: true, frage: "Welche Themen wurden besprochen?" },
      { key: "ergebnis", pflicht: true, frage: "Was ist das Ergebnis — und was wurde vereinbart?" },
    ],
  },
  // ---- Kontrolle / Verlauf --------------------------------------------------------------
  {
    id: "a_kontrolle", label: "Kontrolle / Verlauf / Nachsorge",
    match: /kontroll|verlauf|nachsorge|monitoring|abschluss/i,
    eingriff: false, umfang: "kurz",
    felder: [
      { key: "befund", pflicht: true, frage: "Wie ist der aktuelle Befund beziehungsweise Status?" },
      { key: "veraenderung", pflicht: true, frage: "Was hat sich gegenueber dem Vorbefund geaendert?" },
    ],
  },
  // ---- Konsultation (LETZTES Netz: jeder verbleibende Patienten-Termin) -------------------
  // Symptom-Sprechstunden ("Heiserkeit", "Hexenschuss", "Harnwegsinfekt", ...)
  // und alles, was keine speziellere Regel trifft: volle Konsultations-Doku.
  // Das universelle Geruest (Befund/Diagnose/Therapie/Komplikationen/Procedere)
  // haengt bei umfang "voll" automatisch dran.
  {
    id: "a_konsultation", label: "Konsultation / Symptom-Abklaerung",
    match: /./,
    eingriff: false, umfang: "voll",
    felder: [
      { key: "symptome", pflicht: true, frage: "Welche Beschwerden, seit wann — oder ausdruecklich beschwerdefrei?" },
    ],
  },
];

/**
 * Fachspezifische BASIS-Kataloge fuer die 24 Nicht-Zahn-Fachrichtungen
 * (zahnmedizin lebt detailliert in dokuPflicht.js). Nur die klinisch
 * DISTINKTIVEN Besuchsgruende — alles Generische faengt der Archetyp.
 * Status: basis_entwurf — Startwerte, per Lern-Profil je Praxis verfeinerbar.
 */
export const BASIS_FACH_KATALOGE = {
  anaesthesiologie: {
    label: "Anaesthesiologie", status: "basis_entwurf",
    regeln: [
      {
        id: "praemedikation", label: "Praemedikation / Narkosevorbereitung",
        match: /praemedikation|prämedikation/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "asa", pflicht: true, frage: "Welche ASA-Klasse?" },
          { key: "verfahren", pflicht: true, frage: "Welches Anaesthesie-Verfahren ist geplant?" },
          { key: "nuechternheit", pflicht: true, frage: "Nuechternheitsgebot und Medikamenten-Pause besprochen?" },
          { key: "freigabe", pflicht: true, frage: "Freigabe erteilt — oder was fehlt noch?" },
        ],
      },
      {
        id: "schmerztherapie", label: "Schmerztherapie / Schmerz-Injektion",
        match: /schmerz-injektion|schmerzkatheter|pca/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "verfahren", pflicht: true, frage: "Welches Verfahren beziehungsweise welcher Katheter?" },
          { key: "medikament", pflicht: true, frage: "Welches Medikament, welche Dosis?" },
          { key: "wirkung", pflicht: true, frage: "Wie ist die Schmerzreduktion (NRS vorher/nachher)?" },
        ],
      },
    ],
  },
  augenheilkunde: {
    label: "Augenheilkunde", status: "basis_entwurf",
    regeln: [
      {
        id: "visus_tensio", label: "Augenuntersuchung (Visus/Tensio)",
        match: /glaukom|katarakt|amd|netzhaut|sehtest|brillenwert|verschwommen|blitze|floater|trockenes auge|fremdkoerper|fremdkörper|lidrand|bildschirm|augencheck|tropfen/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "visus", pflicht: true, frage: "Visus rechts und links?" },
          { key: "tensio", pflicht: true, frage: "Augeninnendruck beidseits?" },
          { key: "fundus", pflicht: false, frage: "Fundusbefund?" },
        ],
      },
      {
        id: "laser_auge", label: "Laserbehandlung Auge",
        match: /laser/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "auge", pflicht: true, frage: "Welches Auge?" },
          { key: "verfahren", pflicht: true, frage: "Welches Laser-Verfahren, welche Parameter?" },
        ],
      },
    ],
  },
  chirurgie: {
    label: "Allgemein- und Viszeralchirurgie", status: "basis_entwurf",
    regeln: [
      {
        id: "hautweichteil_op", label: "Haut-/Weichteil-Eingriff",
        match: /lipom|atherom|gruetzbeutel|grützbeutel|nagelbett|zehennagel|hautveraenderung|hautveränderung/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "lokalisation", pflicht: true, frage: "Welche Lokalisation (Region, Seite)?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "histologie", pflicht: true, frage: "Praeparat zur Histologie eingesandt?" },
          { key: "naht", pflicht: true, frage: "Wundverschluss — womit genaeht?" },
        ],
      },
    ],
  },
  dermatologie: {
    label: "Dermatologie", status: "basis_entwurf",
    regeln: [
      {
        id: "hautkrebsvorsorge", label: "Hautkrebsvorsorge / Dermatoskopie",
        match: /hautkrebsvorsorge|hautvorsorge|dermatoskopie|muttermal/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "umfang", pflicht: true, frage: "Ganzkoerper-Inspektion inklusive Kopfhaut und Schleimhaeute?" },
          { key: "auffaellige_laesionen", pflicht: true, frage: "Auffaellige Laesionen — Lokalisation und Einschaetzung?" },
          { key: "procedere_laesion", pflicht: false, frage: "Exzision, Foto-Verlaufskontrolle oder unauffaellig?" },
        ],
      },
      {
        id: "exzision_derma", label: "Exzision / Shave",
        match: /exzision|shave|warzenbehandlung/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "lokalisation", pflicht: true, frage: "Welche Lokalisation?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "histologie", pflicht: true, frage: "Praeparat zur Histologie eingesandt?" },
        ],
      },
      {
        id: "allergietest_derma", label: "Allergietest (Prick/Epikutan)",
        match: /pricktest|epikutantest|allergie pricktest/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "testreihe", pflicht: true, frage: "Welche Testreihe beziehungsweise Allergene?" },
          { key: "ablesung", pflicht: true, frage: "Ablesung — welche Reaktionen?" },
        ],
      },
    ],
  },
  "diabetologie-endokrinologie": {
    label: "Diabetologie / Endokrinologie", status: "basis_entwurf",
    regeln: [
      {
        id: "diabetes_verlauf", label: "Diabetes-Verlauf / CGM",
        match: /diabetes|cgm|insulin|hba1c/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "hba1c", pflicht: true, frage: "Aktueller HbA1c beziehungsweise Glukoseverlauf?" },
          { key: "hypoglykaemien", pflicht: true, frage: "Hypoglykaemien seit dem letzten Termin?" },
          { key: "therapieanpassung", pflicht: true, frage: "Therapie angepasst — was genau?" },
        ],
      },
      {
        id: "schilddruesen_punktion", label: "Schilddruesen-Punktion",
        match: /punktion/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "knoten", pflicht: true, frage: "Welcher Knoten (Seite, Lage, Groesse)?" },
          { key: "zytologie", pflicht: true, frage: "Material zur Zytologie eingesandt?" },
        ],
      },
      {
        id: "ogtt", label: "Oraler Glukosetoleranztest",
        match: /glukosetoleranz|ogtt/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "werte", pflicht: true, frage: "Werte nuechtern, nach einer und nach zwei Stunden?" },
        ],
      },
    ],
  },
  gastroenterologie: {
    label: "Gastroenterologie", status: "basis_entwurf",
    regeln: [
      // Endoskopien deckt der Archetyp a_endoskopie ab (Sedierung, Reichweite,
      // Befunde, Histo). Hier nur das Fachspezifische darueber hinaus.
      {
        id: "ced_verlauf", label: "CED-Verlauf / Biologika",
        match: /ced|colitis|crohn|biologika/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "aktivitaet", pflicht: true, frage: "Krankheitsaktivitaet (Stuhlfrequenz, Blut, Schmerzen)?" },
          { key: "calprotectin_labor", pflicht: false, frage: "Calprotectin beziehungsweise Labor?" },
          { key: "therapie", pflicht: true, frage: "Therapie fortgefuehrt oder angepasst?" },
        ],
      },
    ],
  },
  gefaessmedizin: {
    label: "Gefaessmedizin", status: "basis_entwurf",
    regeln: [
      {
        id: "duplex_gefaess", label: "Duplex / Doppler Gefaesse",
        match: /duplex|doppler|abi-messung/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "gefaessregion", pflicht: true, frage: "Welche Gefaessregion, welche Seite?" },
          { key: "stenose_reflux", pflicht: true, frage: "Stenosegrad beziehungsweise Reflux — wie ist der Befund?" },
        ],
      },
      {
        id: "sklerosierung", label: "Sklerosierung / Veroedung",
        match: /sklerosierung|schaumsklero|veroedung|verödung/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "mittel", pflicht: true, frage: "Welches Mittel in welcher Konzentration?" },
          { key: "region", pflicht: true, frage: "Welche Venen/Region, welche Seite?" },
          { key: "kompression", pflicht: true, frage: "Kompression angelegt — und wie lange tragen?" },
        ],
      },
      {
        id: "thrombose_akut", label: "Akute Thrombose (TVT)",
        match: /thrombose.*akut|tvt/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "lokalisation", pflicht: true, frage: "Welche Etage/Seite ist betroffen?" },
          { key: "antikoagulation", pflicht: true, frage: "Welche Antikoagulation wurde begonnen (Praeparat, Dosis)?" },
        ],
      },
    ],
  },
  gynaekologie: {
    label: "Gynaekologie", status: "basis_entwurf",
    regeln: [
      {
        id: "gyn_vorsorge", label: "Krebsvorsorge / Abstrich",
        match: /krebsvorsorge|pap|hpv-abstrich/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "abstrich", pflicht: true, frage: "PAP/HPV-Abstrich entnommen?" },
          { key: "tastbefund", pflicht: true, frage: "Tastbefund Brust und Genitale?" },
        ],
      },
      {
        id: "schwangerschaft", label: "Schwangerschafts-Vorsorge",
        match: /schwangerschaft|ctg|ersttrimester/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "ssw", pflicht: true, frage: "Welche Schwangerschaftswoche?" },
          { key: "vitalzeichen_kind", pflicht: true, frage: "Herzaktion/Kindsbewegungen — Befund?" },
          { key: "mutter_werte", pflicht: true, frage: "RR, Gewicht, Urin der Mutter?" },
        ],
      },
      {
        id: "spirale", label: "Spirale einsetzen / kontrollieren",
        match: /spirale/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "typ", pflicht: true, frage: "Welche Spirale (Typ)?" },
          { key: "lagekontrolle", pflicht: true, frage: "Sonographische Lagekontrolle unauffaellig?" },
        ],
      },
      {
        id: "kolposkopie", label: "Kolposkopie / Konisation",
        match: /kolposkopie|konisation/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "befund", pflicht: true, frage: "Kolposkopischer Befund (Essig-/Jodprobe)?" },
          { key: "biopsie", pflicht: true, frage: "Biopsien entnommen — von wo?" },
        ],
      },
    ],
  },
  hausarzt: {
    label: "Allgemeinmedizin / Hausarzt", status: "basis_entwurf",
    regeln: [
      {
        id: "checkup", label: "Gesundheits-Check-up",
        match: /check-?up|praeventionscheck|präventionscheck/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "status", pflicht: true, frage: "Koerperlicher Status inklusive RR und Auskultation?" },
          { key: "labor", pflicht: true, frage: "Labor abgenommen beziehungsweise besprochen?" },
          { key: "impfstatus", pflicht: true, frage: "Impfstatus geprueft?" },
          { key: "beratung", pflicht: true, frage: "Welche Praeventionsberatung (Bewegung, Ernaehrung, Rauchen)?" },
        ],
      },
      {
        id: "au", label: "Arbeitsunfaehigkeit",
        match: /arbeitsunfaehig|arbeitsunfähig/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "diagnose", pflicht: true, frage: "Welche Diagnose begruendet die AU?" },
          { key: "dauer", pflicht: true, frage: "AU von wann bis wann?" },
        ],
      },
      {
        id: "infekt", label: "Akuter Infekt",
        match: /atemwegsinfekt|magen-darm|fieberabklaerung|fieberabklärung|harnwegsbeschwerden/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "symptome", pflicht: true, frage: "Symptome und Dauer?" },
          { key: "befund", pflicht: true, frage: "Untersuchungsbefund (Auskultation, Rachen, Abdomen)?" },
          { key: "therapie", pflicht: true, frage: "Therapie und AU — was wurde verordnet?" },
        ],
      },
    ],
  },
  hno: {
    label: "HNO-Heilkunde", status: "basis_entwurf",
    regeln: [
      {
        id: "hoertest", label: "Hoertest / Audiometrie",
        match: /hoertest|hörtest|hoergeraete|hörgeräte/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "audiogramm", pflicht: true, frage: "Audiogramm-Ergebnis beidseits?" },
        ],
      },
      {
        id: "ohrenschmalz", label: "Ohrreinigung / Cerumen",
        match: /ohrenschmalz|cerumen/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "seite", pflicht: true, frage: "Welche Seite — und Trommelfell danach reizlos?" },
        ],
      },
      {
        id: "hoersturz", label: "Ploetzliche Hoerminderung / Hoersturz",
        match: /hoerminderung|hörminderung|hoersturz|hörsturz/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "beginn", pflicht: true, frage: "Seit wann, einseitig oder beidseitig, mit Tinnitus/Schwindel?" },
          { key: "audiogramm", pflicht: true, frage: "Tonaudiogramm-Befund?" },
          { key: "therapie", pflicht: true, frage: "Therapie begonnen (z. B. Kortison) — welches Schema?" },
        ],
      },
    ],
  },
  "innere-medizin": {
    label: "Innere Medizin", status: "basis_entwurf",
    regeln: [
      {
        id: "hypertonie", label: "Hypertonie-Verlauf",
        match: /hypertonie|blutdruck/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "rr_werte", pflicht: true, frage: "Aktuelle Blutdruckwerte (Praxis/Heimmessung)?" },
          { key: "medikation", pflicht: true, frage: "Medikation weiter oder angepasst?" },
        ],
      },
    ],
  },
  kardiologie: {
    label: "Kardiologie", status: "basis_entwurf",
    regeln: [
      {
        id: "ergometrie", label: "Belastungs-EKG (Ergometrie)",
        match: /ergometrie|belastungs-ekg/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "indikation", pflicht: true, frage: "Was war die Indikation?" },
          { key: "maximallast", pflicht: true, frage: "Bis zu welcher Last — und warum abgebrochen?" },
          { key: "befund", pflicht: true, frage: "EKG- und Blutdruckverhalten unter Belastung?" },
        ],
      },
      {
        id: "echo", label: "Echokardiographie",
        match: /echo/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "ef", pflicht: true, frage: "Wie ist die Pumpfunktion (EF)?" },
          { key: "klappen", pflicht: true, frage: "Klappenbefund?" },
        ],
      },
      {
        id: "device_kontrolle", label: "Schrittmacher/ICD-Kontrolle",
        match: /schrittmacher|icd|aggregat/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "batterie", pflicht: true, frage: "Batteriestatus und Restlaufzeit?" },
          { key: "sondenwerte", pflicht: true, frage: "Sondenwerte (Reizschwelle, Wahrnehmung, Impedanz) in Ordnung?" },
          { key: "ereignisse", pflicht: true, frage: "Episoden/Ereignisse im Speicher?" },
          { key: "umprogrammierung", pflicht: false, frage: "Wurde umprogrammiert — was?" },
        ],
      },
      {
        id: "langzeit", label: "Langzeit-EKG / Langzeit-RR",
        match: /langzeit/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "geraet", pflicht: true, frage: "Angelegt oder ausgewertet — und mit welchem Ergebnis?" },
        ],
      },
    ],
  },
  kieferorthopaedie: {
    label: "Kieferorthopaedie", status: "basis_entwurf",
    regeln: [
      {
        id: "aligner", label: "Aligner-Behandlung",
        match: /aligner/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "schiene", pflicht: true, frage: "Welche Schienennummer, wie ist die Passung?" },
          { key: "tragezeit", pflicht: true, frage: "Tragezeit eingehalten?" },
          { key: "attachments", pflicht: false, frage: "Attachments/IPR gemacht?" },
        ],
      },
      {
        id: "bogen_bracket", label: "Bogenwechsel / Bracket / Draht",
        match: /bogenwechsel|bracket|multiband|draht/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "massnahme", pflicht: true, frage: "Was wurde gemacht (Bogen, Bracket geklebt/repositioniert)?" },
          { key: "mundhygiene", pflicht: true, frage: "Mundhygiene um die Brackets in Ordnung?" },
        ],
      },
      {
        id: "retainer", label: "Retainer",
        match: /retainer/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "massnahme", pflicht: true, frage: "Retainer eingesetzt, repariert oder kontrolliert — Befund?" },
        ],
      },
      {
        id: "kfo_apparatur", label: "Herausnehmbare Apparatur",
        match: /spange|plattenapparatur|aktivator/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "massnahme", pflicht: true, frage: "Was wurde gemacht (eingesetzt, nachgestellt, repariert)?" },
          { key: "mitarbeit", pflicht: true, frage: "Wie ist die Mitarbeit (Tragezeit)?" },
        ],
      },
      {
        id: "kfo_unterlagen", label: "KFO Unterlagen (Scan/Abformung/Foto)",
        match: /fotostatus|intraoralscan|abformung|abdruck/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "unterlagen", pflicht: true, frage: "Welche Unterlagen wurden erstellt (Scan, Abformung, Fotos) — und wofuer?" },
        ],
      },
      {
        id: "kfo_roentgen", label: "Roentgenanalyse (KFO)",
        match: /roentgen|röntgen/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "aufnahme_region", pflicht: true, frage: "Welche Aufnahme (OPG, FRS)?" },
          { key: "rechtfertigende_indikation", pflicht: true, frage: "Wie lautet die rechtfertigende Indikation?" },
          { key: "auswertung", pflicht: true, frage: "Wie ist die Auswertung (z. B. Durchbruch, Wurzeln, FRS-Werte)?" },
        ],
      },
    ],
  },
  "kinder-jugendmedizin": {
    label: "Kinder- und Jugendmedizin", status: "basis_entwurf",
    regeln: [
      {
        id: "u_untersuchung", label: "U-/J-Vorsorgeuntersuchung",
        match: /\bu\d{1,2}\b|u2-u6|\bj[12]\b/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "entwicklung", pflicht: true, frage: "Entwicklungsstand altersgerecht (Motorik, Sprache, Sozialverhalten)?" },
          { key: "perzentilen", pflicht: true, frage: "Gewicht/Laenge/Kopfumfang — Perzentilen?" },
          { key: "impfstatus", pflicht: true, frage: "Impfstatus geprueft — Impfung faellig?" },
          { key: "beratung", pflicht: true, frage: "Elternberatung — welche Themen?" },
        ],
      },
      {
        id: "akut_kind", label: "Akut krankes Kind",
        match: /fieber|husten|bronchitis|ohrenschmerzen|bauchschmerzen|hautausschlag/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "symptome", pflicht: true, frage: "Symptome, seit wann, Trinkverhalten/Allgemeinzustand?" },
          { key: "befund", pflicht: true, frage: "Untersuchungsbefund?" },
          { key: "therapie_wiedervorstellung", pflicht: true, frage: "Therapie und wann Wiedervorstellung?" },
        ],
      },
    ],
  },
  neurologie: {
    label: "Neurologie", status: "basis_entwurf",
    regeln: [
      {
        id: "lumbalpunktion", label: "Lumbalpunktion",
        match: /lumbalpunktion/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "verlauf", pflicht: true, frage: "Punktion problemlos — Liquor-Aspekt?" },
          { key: "proben", pflicht: true, frage: "Welche Proben/Untersuchungen angefordert?" },
          { key: "nachsorge", pflicht: true, frage: "Liegezeit und Verhaltensregeln besprochen?" },
        ],
      },
      {
        id: "botox_migraene", label: "Botox/Antikoerper Migraene",
        match: /botox|antikoerper|antikörper/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "schema", pflicht: true, frage: "Welches Schema, welche Einheiten/Dosis?" },
          { key: "wirkung", pflicht: true, frage: "Wie war die Wirkung seit der letzten Gabe (Kopfschmerztage)?" },
        ],
      },
      {
        id: "neuro_verlauf", label: "Neurologischer Verlauf (MS/Parkinson/Epilepsie/Demenz)",
        match: /ms-|parkinson|epilepsie|demenz/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "status", pflicht: true, frage: "Neurologischer Status — was hat sich veraendert?" },
          { key: "ereignisse", pflicht: true, frage: "Ereignisse seit dem letzten Termin (Anfaelle, Schuebe, Stuerze)?" },
          { key: "medikation", pflicht: true, frage: "Medikation weiter oder angepasst?" },
        ],
      },
    ],
  },
  onkologie: {
    label: "Onkologie", status: "basis_entwurf",
    regeln: [
      {
        id: "systemtherapie", label: "Systemtherapie-Sitzung",
        match: /chemotherapie|antikoerpertherapie|antikörpertherapie|immuntherapie|bisphosphonat/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "protokoll", pflicht: true, frage: "Welches Protokoll, welcher Zyklus/Tag?" },
          { key: "labor_freigabe", pflicht: true, frage: "Labor geprueft und Gabe freigegeben?" },
          { key: "dosis", pflicht: true, frage: "Volle Dosis oder reduziert — warum?" },
          { key: "vertraeglichkeit", pflicht: true, frage: "Vertraeglichkeit/Nebenwirkungen (CTCAE)?" },
        ],
      },
      {
        id: "port", label: "Port (Anlage/Spuelung)",
        match: /port/i,
        eingriff: true, umfang: "kurz",
        felder: [
          { key: "funktion", pflicht: true, frage: "Port funktionstuechtig (Aspiration/Injektion problemlos)?" },
        ],
      },
      {
        id: "nachsorge_onk", label: "Tumornachsorge",
        match: /nachsorge/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "status", pflicht: true, frage: "Klinischer Status — Rezidivhinweise?" },
          { key: "bildgebung_labor", pflicht: true, frage: "Welche Bildgebung/Marker — Ergebnis?" },
          { key: "naechste_nachsorge", pflicht: true, frage: "Wann ist die naechste Nachsorge?" },
        ],
      },
    ],
  },
  "oralchirurgie-mkg": {
    label: "Oralchirurgie / MKG", status: "basis_entwurf",
    regeln: [
      {
        id: "weisheitszahn_op", label: "Weisheitszahn-OP / operative Zahnentfernung",
        match: /weisheitszahn-op|zahnentfernung|abgebrochener zahn/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zaehne", pflicht: true, frage: "Welche Zaehne (FDI)?" },
          { key: "roentgen", pflicht: true, frage: "Roentgen vorhanden — Aufnahme, Region, rechtfertigende Indikation?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "verlauf", pflicht: true, frage: "Verlauf — Osteotomie noetig, Naht gelegt?" },
          { key: "verhaltensregeln", pflicht: true, frage: "Verhaltensregeln mitgegeben?" },
        ],
      },
      {
        id: "mkg_implantation", label: "Implantation / Augmentation (MKG)",
        match: /implantation|augmentation|sinuslift|knochenaufbau/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "regio", pflicht: true, frage: "Welche Regio(nen)?" },
          { key: "system_material", pflicht: true, frage: "Welches System beziehungsweise Aufbaumaterial?" },
          { key: "primaerstabilitaet", pflicht: true, frage: "Primaerstabilitaet erreicht?" },
          { key: "roentgen", pflicht: true, frage: "Roentgen-Lagekontrolle mit rechtfertigender Indikation?" },
        ],
      },
      {
        id: "biopsie_mund", label: "Biopsie Mundschleimhaut",
        match: /biopsie|schleimhautveraenderung|schleimhautveränderung/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "lokalisation", pflicht: true, frage: "Welche Lokalisation?" },
          { key: "histologie", pflicht: true, frage: "Material zur Histologie eingesandt?" },
        ],
      },
      {
        id: "wsr_mkg", label: "Wurzelspitzenresektion (MKG)",
        match: /wurzelspitzenresektion|wsr/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zahn", pflicht: true, frage: "Welcher Zahn (FDI)?" },
          { key: "roentgen", pflicht: true, frage: "Roentgen prae-/postoperativ mit rechtfertigender Indikation?" },
          { key: "naht", pflicht: true, frage: "Wurde genaeht?" },
        ],
      },
    ],
  },
  orthopaedie: {
    label: "Orthopaedie", status: "basis_entwurf",
    regeln: [
      {
        id: "gelenk_injektion", label: "Gelenk-Injektion / Infiltration",
        match: /injektion|infiltration/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "medikament", pflicht: true, frage: "Welches Medikament und welche Dosis?" },
          { key: "gelenk", pflicht: true, frage: "Welches Gelenk, welche Seite?" },
          { key: "sterilitaet", pflicht: true, frage: "Sterile Kautelen eingehalten?" },
        ],
      },
      {
        id: "trauma_check", label: "Akutes Trauma / Distorsion",
        match: /trauma|distorsion|sportverletzung/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "unfallhergang", pflicht: true, frage: "Wie war der Unfallhergang, wann?" },
          { key: "befund", pflicht: true, frage: "Befund — Schwellung, Stabilitaet, DMS?" },
          { key: "bildgebung", pflicht: true, frage: "Bildgebung noetig/erfolgt — mit welcher Indikation?" },
          { key: "versorgung", pflicht: true, frage: "Wie versorgt (Orthese, Tape, Entlastung)?" },
        ],
      },
      {
        id: "verband_orthese", label: "Gips / Verband / Orthese",
        match: /gips|orthese/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "versorgung", pflicht: true, frage: "Welche Versorgung wurde angelegt?" },
          { key: "dms", pflicht: true, frage: "Durchblutung, Motorik, Sensibilitaet geprueft?" },
        ],
      },
    ],
  },
  "plastische-chirurgie": {
    label: "Plastische & Aesthetische Chirurgie", status: "basis_entwurf",
    regeln: [
      {
        id: "botox_filler", label: "Botox / Filler / Mesotherapie",
        match: /botox|hyaluron|filler|mesotherapie|prp eigenblut/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "praeparat", pflicht: true, frage: "Welches Praeparat, wie viele Einheiten/ml?" },
          { key: "regionen", pflicht: true, frage: "Welche Regionen wurden behandelt?" },
          { key: "aufklaerung_foto", pflicht: true, frage: "Aufklaerung dokumentiert und Fotodokumentation gemacht?" },
        ],
      },
    ],
  },
  pneumologie: {
    label: "Pneumologie", status: "basis_entwurf",
    regeln: [
      {
        id: "lufu", label: "Lungenfunktion / Spirometrie",
        match: /lungenfunktion|spirometrie|bodyplethysmo|bronchospasmolyse/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "werte", pflicht: true, frage: "FEV1 und Tiffeneau — wie sind die Werte?" },
          { key: "reversibilitaet", pflicht: false, frage: "Reversibilitaet getestet — Ergebnis?" },
        ],
      },
      {
        id: "schlafdiagnostik", label: "Schlafapnoe-Diagnostik",
        match: /polygraph|schlafapnoe|cpap/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "ergebnis", pflicht: true, frage: "AHI beziehungsweise Befund — und welche Konsequenz?" },
        ],
      },
      {
        id: "asthma_copd", label: "Asthma/COPD-Verlauf",
        match: /asthma|copd|exazerbation/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "symptomkontrolle", pflicht: true, frage: "Symptomkontrolle (Anfaelle, Notfallspray, Nachtsymptome)?" },
          { key: "inhalation", pflicht: true, frage: "Inhalationstechnik geprueft, Therapie angepasst?" },
        ],
      },
    ],
  },
  "psychiatrie-psychotherapie": {
    label: "Psychiatrie & Psychotherapie", status: "basis_entwurf",
    regeln: [
      {
        id: "psych_sitzung", label: "Therapie-Sitzung (Einzel/Gruppe/Probatorik/EMDR)",
        match: /therapie-sitzung|einzel-therapie|gruppentherapie|probatorik|emdr|doppelstunde/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "verfahren", pflicht: true, frage: "Welches Verfahren, welche Sitzungsnummer?" },
          { key: "themen", pflicht: true, frage: "Zentrale Themen der Sitzung (kurz)?" },
          { key: "befinden", pflicht: true, frage: "Aktuelles Befinden — bei Krisenzeichen: Suizidalitaet exploriert?" },
        ],
      },
      {
        id: "psych_medikation", label: "Medikamenten-Verlauf (Psychopharmaka)",
        match: /antidepressiva|stimmungsstabilisator|schlafmedikation|medikament/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "praeparat_dosis", pflicht: true, frage: "Welches Praeparat, welche Dosis?" },
          { key: "wirkung_nebenwirkung", pflicht: true, frage: "Wirkung und Nebenwirkungen?" },
          { key: "labor_kontrolle", pflicht: false, frage: "Laborkontrolle faellig (Spiegel, Blutbild)?" },
        ],
      },
      {
        id: "krise", label: "Krisensprechstunde",
        match: /krise|akute beratung/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "anlass", pflicht: true, frage: "Was ist der Anlass der Krise?" },
          { key: "suizidalitaet", pflicht: true, frage: "Suizidalitaet exploriert — Ergebnis und Absprachen?" },
          { key: "sicherheitsplan", pflicht: true, frage: "Welcher Sicherheitsplan beziehungsweise naechster Schritt?" },
        ],
      },
    ],
  },
  radiologie: {
    label: "Radiologie", status: "basis_entwurf",
    regeln: [
      {
        id: "ct_mrt", label: "CT / MRT",
        match: /\bct-|\bmrt-|\bct\b|\bmrt\b/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "region", pflicht: true, frage: "Welche Region?" },
          { key: "rechtfertigende_indikation", pflicht: true, frage: "Wie lautet die (rechtfertigende) Indikation?" },
          { key: "kontrastmittel", pflicht: true, frage: "Kontrastmittel gegeben — Kreatinin/Aufklaerung geprueft?" },
          { key: "befund", pflicht: true, frage: "Wie lautet der Befund?" },
        ],
      },
      {
        id: "roentgen_rad", label: "Roentgen (Radiologie)",
        match: /roentgen|röntgen/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "aufnahme_region", pflicht: true, frage: "Welche Aufnahme, welche Region?" },
          { key: "rechtfertigende_indikation", pflicht: true, frage: "Wie lautet die rechtfertigende Indikation?" },
          { key: "befund", pflicht: true, frage: "Wie lautet der Befund?" },
        ],
      },
      {
        id: "biopsie_rad", label: "CT-gesteuerte Biopsie",
        match: /biopsie/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "ziel", pflicht: true, frage: "Welche Zielregion?" },
          { key: "verlauf", pflicht: true, frage: "Verlauf und Komplikationen (Pneumothorax ausgeschlossen)?" },
          { key: "histologie", pflicht: true, frage: "Material zur Histologie eingesandt?" },
        ],
      },
    ],
  },
  rheumatologie: {
    label: "Rheumatologie", status: "basis_entwurf",
    regeln: [
      {
        id: "gelenkpunktion", label: "Gelenk-Punktion / Kortison-Infiltration",
        match: /punktion|infiltration|hyaluron-injektion/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "gelenk", pflicht: true, frage: "Welches Gelenk, welche Seite?" },
          { key: "punktat_praeparat", pflicht: true, frage: "Punktat-Befund beziehungsweise welches Praeparat instilliert?" },
          { key: "sterilitaet", pflicht: true, frage: "Sterile Kautelen eingehalten?" },
        ],
      },
      {
        id: "basistherapie", label: "Basistherapie-Verlauf (MTX/Biologika/JAK)",
        match: /methotrexat|biologika|jak-inhibitor/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "aktivitaet", pflicht: true, frage: "Krankheitsaktivitaet (Gelenkstatus, Morgensteifigkeit)?" },
          { key: "labor", pflicht: true, frage: "Sicherheitslabor in Ordnung?" },
          { key: "therapie", pflicht: true, frage: "Therapie weiter oder angepasst?" },
        ],
      },
    ],
  },
  urologie: {
    label: "Urologie", status: "basis_entwurf",
    regeln: [
      {
        id: "vasektomie", label: "Vasektomie",
        match: /vasektomie(?!-beratung)/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "verlauf", pflicht: true, frage: "Verlauf beidseits problemlos?" },
          { key: "histologie", pflicht: true, frage: "Praeparate zur Histologie eingesandt?" },
          { key: "nachsorge", pflicht: true, frage: "Spermiogramm-Kontrolle vereinbart?" },
        ],
      },
      {
        id: "prostata_vorsorge", label: "Prostata-Vorsorge / PSA",
        match: /prostatavorsorge|krebsvorsorge|psa/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "tastbefund", pflicht: true, frage: "Digital-rektaler Tastbefund?" },
          { key: "psa_wert", pflicht: true, frage: "PSA-Wert und Verlauf?" },
        ],
      },
      {
        id: "stein", label: "Nierenstein / ESWL",
        match: /nierenstein|stein|eswl/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "lokalisation", pflicht: true, frage: "Wo sitzt der Stein, wie gross?" },
          { key: "therapie", pflicht: true, frage: "Therapie — konservativ, ESWL, OP-Indikation?" },
        ],
      },
    ],
  },
};
