// Doku-Pflicht-Katalog (Stand 04.07.2026) — WAS ist in diesem Termin
// dokumentationspflichtig? Fachrichtungs-AGNOSTISCH aufgebaut:
//
//   1. DOKU_GERUEST — universelles Dokumentations-Geruest, gilt fuer JEDE
//      Fachrichtung (Orthopaede wie Kardiologe wie Zahnarzt).
//   2. QUERSCHNITT_REGELN — fachuebergreifende Pflichten, die am INHALT des
//      Diktats haengen, nicht am Besuchsgrund. Wichtigster Fall (Vorgabe
//      04.07.2026): Sobald eine Roentgenaufnahme erwaehnt wird ("Roe Zahn 36",
//      "OPG", "DVT"), MUSS die rechtfertigende Indikation dokumentiert sein
//      (Paragraf 83 StrlSchG) — das gilt beim Zahnarzt wie beim Orthopaeden.
//   3. FACH_KATALOGE — austauschbare Fachrichtungs-Kataloge, die pro
//      Besuchsgrund (visitMotive-Name) spezifische Pflichtfelder + Clara-
//      Rueckfragen ergaenzen. Reine DATEN, kein Code pro Fachrichtung.
//      "zahnmedizin" ist der erste gefuellte Katalog (Demo-Client MedDent);
//      orthopaedie/kardiologie liegen als ENTWURF bei, um die Struktur zu
//      beweisen. Langfristig wandern die Kataloge in Firestore
//      (masterCatalogs/{specialtyKey}), wo Besuchsgruende + Pflicht-Dokumente
//      pro Fachrichtung schon heute leben.
//
// EISERNES PRINZIP (Vorgabe 04.07.2026): NIE etwas erfragen, das schon im
// System steht. Quellen je Feld (``quelle``):
//   - "diktat"          — aus dem gesprochenen Text geparst; nur echte
//                          Luecken werden nachgefragt.
//   - "signr_anamnese"  — Anamnese-Risiken kommen aus dem SignR-Anamnesebogen
//                          (anamnese.js-Findings). Wird NIE erfragt. Nach
//                          Unterschrift nur PDF -> ehrlicher Vermerk.
//   - "signr_dokumente" — Aufklaerung/Einwilligung gilt als dokumentiert,
//                          wenn das Pflicht-Dokument des Besuchsgrunds
//                          (visitMotive.documentIds) signiert vorliegt
//                          (pdocuments: status "signed" / pdfCreatedAt).
//   - "termin"          — aus dem Termin selbst (Besuchsgrund = Anlass).
//
// Korrekturrunde 04.07.2026 (Chef): Roentgen inkl. Region + rechtfertigender
// Indikation bei Endo/WSR/Extraktion/Implantation als PFLICHT; Querschnitt-
// Regel fuer jede erwaehnte Aufnahme; Besprechungen brauchen THEMEN;
// PAR-Strecke dokumentiert Mundhygiene-Indizes (API/SBI); Katalog deutlich
// feiner aufgeschluesselt (KFO Aus-/Eingliederung, Schienen-Eingliederung
// KB/SLM, Einschleifen, Indizes, Roentgen-/Foto-Termine, Blutentnahme/PRP).
//
// Ausbau 04.07.2026 (Vorgabe Chef, fachrichtungs-agnostisch):
//   - ARCHETYP_REGELN (dokuBasisKataloge.js) fangen in JEDER Fachrichtung die
//     Besuchsgruende ohne spezielle Regel ab (Beratung, Eingriff, Bildgebung,
//     Labor, Impfung, Wunde, Kontrolle, ...).
//   - BASIS_FACH_KATALOGE liefern Basis-Mappings fuer alle 24 weiteren
//     Master-Katalog-Fachrichtungen (Orthopaedie bis Radiologie).
//   - Das LERN-PROFIL (dokuLernen.js) legt sich als Overlay darueber: pro
//     Praxis koennen Fragen per Stimme unterdrueckt ("frag nicht mehr nach
//     Roentgen bei Zahnreinigung") oder ergaenzt werden — Korrekturen wirken
//     SOFORT im selben Gespraech und bleiben fuer die Zukunft.
//
// Abrechnung (Sophie, GOZ/BEMA) bleibt bewusst AUSSEN VOR — die ist rein
// zahnmedizinisch. Dieses Modul kennt nur Dokumentation.

import { ARCHETYP_REGELN, BASIS_FACH_KATALOGE } from "./dokuBasisKataloge.js";
import { db } from "../firebase.js";
import { masCollection } from "../tenant.js";

/** Universelles Doku-Geruest — jede vollstaendige Behandlungsdoku deckt das ab. */
export const DOKU_GERUEST = [
  { key: "anlass", label: "Anlass / Grund des Termins", pflicht: true, quelle: "termin", frage: "Was war der Anlass der Behandlung?" },
  { key: "anamnese", label: "Anamnese-Risiken", pflicht: false, quelle: "signr_anamnese", frage: null },
  { key: "befund", label: "Befund", pflicht: true, quelle: "diktat", frage: "Wie war der Befund?" },
  { key: "diagnose", label: "Diagnose / Verdachtsdiagnose", pflicht: true, quelle: "diktat", frage: "Welche Diagnose halten wir fest?" },
  { key: "therapie", label: "Durchgefuehrte Massnahme / Therapie", pflicht: true, quelle: "diktat", frage: "Was genau wurde gemacht?" },
  { key: "aufklaerung", label: "Aufklaerung / Einwilligung", pflicht: "bei_eingriff", quelle: "signr_dokumente", frage: "Ist die Aufklaerung erfolgt und dokumentiert?" },
  { key: "komplikationen", label: "Komplikationen / Besonderheiten", pflicht: true, quelle: "diktat", frage: "Gab es Komplikationen oder Besonderheiten — oder ausdruecklich keine?" },
  { key: "procedere", label: "Procedere / naechste Schritte", pflicht: true, quelle: "diktat", frage: "Wie geht es weiter — Kontrolle, Folgetermin, Verhaltensregeln?" },
];

/**
 * Querschnitts-Regeln — gelten in JEDER Fachrichtung und werden durch den
 * INHALT des Diktats ausgeloest (trigger-Regex auf den gesprochenen Text),
 * unabhaengig vom Besuchsgrund.
 *
 * roentgen_erwaehnt: Paragraf 83 StrlSchG — jede Anwendung ionisierender
 * Strahlung braucht eine dokumentierte rechtfertigende Indikation. Sagt der
 * Chef "Roe Zahn 36" oder "OPG angefertigt", muessen Aufnahmeart+Region,
 * rechtfertigende Indikation und Roentgenbefund in die Doku. Die Felder sind
 * bewusst getrennt, damit die Rueckfragen-Engine NUR die echte Luecke erfragt
 * ("Roe 36" -> Region ist ja schon da, es fehlt die Indikation).
 * Hat die Besuchsgrund-Regel selbst schon ein roentgen-Feld, gewinnen diese
 * feineren Querschnitt-Felder (Engine dedupliziert ueber Key-Praefix "roentgen"/
 * "aufnahme"/"rechtfertigende").
 */
export const QUERSCHNITT_REGELN = [
  {
    id: "roentgen_erwaehnt",
    label: "Roentgen/Bildgebung erwaehnt (StrlSchG)",
    // "roe"/"rö"/"ro" als eigenes Wort (STT schreibt "Rö 36" oft als "Roe 36"),
    // dazu roentgen/röntgen in beiden Schreibweisen.
    trigger: /(^|[^a-zäöüß])r(?:oe|[oö])(?=[^a-zäöüß]|$)|r[oö]e?ntgen|\brtg\b|\bopg\b|\bdvt\b|\bfrs\b|zahnfilm|bissfl[uü]gel|einzelbild|messaufnahme|kontrollaufnahme|orthopantomo|panorama|cbct/i,
    felder: [
      { key: "aufnahme_region", pflicht: true, frage: "Welche Aufnahme (Zahnfilm, OPG, DVT) und welcher Zahn beziehungsweise welche Region?" },
      { key: "rechtfertigende_indikation", pflicht: true, frage: "Wie lautet die rechtfertigende Indikation fuer die Aufnahme?" },
      { key: "roentgenbefund", pflicht: true, frage: "Was zeigt die Aufnahme — wie lautet der Roentgenbefund?" },
    ],
  },
];

/**
 * Fachrichtungs-Kataloge. Pro Regel:
 *   match    — Regex auf den Besuchsgrund-Namen. ERSTE passende Regel gewinnt.
 *              Reihenfolge in PRIORITAETS-STUFEN:
 *                Stufe 0: interne Termine (keine Doku) + Blutentnahme/PRP
 *                Stufe 1: spezifische klinische Aktivitaeten (Fuellung, Endo,
 *                         Extraktion, PAR-Strecke, Praep, Ein-/Ausgliederungen,
 *                         Roentgen-/Foto-Termine, ...)
 *                Stufe 2: generische Termintypen, die Praefixe schlagen muessen
 *                         (Video, Besprechung/Planerstellung, Nahtentfernung)
 *                Stufe 3: Fachbereichs-Fallbacks per Praefix (^KFO, ^KB, ^SLM)
 *                Stufe 4: Kontrolle/Fruehuntersuchung — faengt den Rest ab
 *   eingriff — true => Aufklaerung wird Pflichtfeld (Autofill aus SignR).
 *   umfang   — "voll" | "kurz" | "keine" (Kontrollen brauchen weniger,
 *              interne Termine gar nichts).
 *   felder   — fachspezifische Pflicht-/Empfehlungsfelder MIT Clara-Rueckfrage.
 *              pflicht: true = ohne dieses Feld ist die Doku LUECKENHAFT.
 */
export const FACH_KATALOGE = {
  zahnmedizin: {
    label: "Zahnmedizin",
    status: "entwurf_zur_korrektur_v2",
    regeln: [
      // ================= Stufe 0: intern / Labor =================
      // Blutentnahme + PRP/PRGF sind PATIENTEN-Termine (Einwilligung!),
      // muessen also VOR der internen MLAB-Regel stehen.
      {
        id: "blutentnahme_prp", label: "Blutentnahme / PRP-PRGF-Herstellung",
        match: /blutentnahme|prp|prgf/i,
        eingriff: true, umfang: "kurz",
        felder: [
          { key: "indikation", pflicht: true, frage: "Wofuer — welche Indikation (z. B. PRP zur OP, Laborwerte)?" },
          { key: "entnahme", pflicht: true, frage: "Entnahme problemlos — Menge/Roehrchen?" },
        ],
      },
      {
        id: "intern", label: "Interner Termin / Labor",
        match: /^dlab|^mlab|handwerker|fortbildung|teambe|vertreter|telebot|clonr|videotest/i,
        eingriff: false, umfang: "keine", felder: [],
      },
      // ================= Stufe 1: spezifische klinische Aktivitaeten =========
      // ---- Notfall / akute Beschwerden --------------------------------------
      {
        id: "notfall", label: "Notfall / akute Beschwerden",
        match: /notfall|akute beschwerden|schmerz/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "lokalisation", pflicht: true, frage: "Welcher Zahn beziehungsweise welche Region?" },
          { key: "schmerzcharakter", pflicht: true, frage: "Seit wann und welcher Schmerzcharakter?" },
          { key: "sofortmassnahme", pflicht: true, frage: "Welche Sofortmassnahme wurde getroffen?" },
          { key: "roentgen", pflicht: false, frage: "Roentgen angefertigt — welche Aufnahme, welche Region, mit welcher rechtfertigenden Indikation?" },
        ],
      },
      // ---- Erstuntersuchung / Neupatient -------------------------------------
      {
        id: "erstuntersuchung", label: "Erstuntersuchung / Neupatient",
        match: /erstuntersuchung|neupatient/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "befundstatus", pflicht: true, frage: "Ist der komplette Zahnstatus erhoben (01-Befund)?" },
          { key: "roentgen", pflicht: false, frage: "Roentgen angefertigt — welche Aufnahme und mit welcher rechtfertigenden Indikation?" },
          { key: "mundhygiene", pflicht: false, frage: "Wie ist der Mundhygienestatus?" },
        ],
      },
      // ---- Fuellungspolitur VOR Fuellung (Teilstring!) ------------------------
      {
        id: "fuellungspolitur", label: "Fuellungspolitur",
        match: /fuellungspolitur|füllungspolitur/i,
        eingriff: false, umfang: "kurz",
        felder: [{ key: "zahn", pflicht: true, frage: "Welcher Zahn wurde poliert?" }],
      },
      // ---- Stiftaufbau (VOR Fuellung: "Stiftaufbau (fuer Fuellung)") ----------
      {
        id: "stiftaufbau", label: "Stiftaufbau",
        match: /stiftaufbau/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zahn", pflicht: true, frage: "Welcher Zahn (FDI)?" },
          { key: "stiftart", pflicht: true, frage: "Welcher Stift — konfektioniert oder gegossen?" },
        ],
      },
      // ---- Fuellung -----------------------------------------------------------
      {
        id: "fuellung", label: "Fuellung",
        match: /fuellung|füllung/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zahn", pflicht: true, frage: "Welcher Zahn (FDI)?" },
          { key: "flaechen", pflicht: true, frage: "Welche Flaechen (z. B. mesial-okklusal-distal)?" },
          { key: "material", pflicht: true, frage: "Welches Material — Composite oder Kassenfuellung?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie — Infiltration, Leitung oder keine?" },
          { key: "kofferdam", pflicht: false, frage: "Kofferdam gelegt?" },
        ],
      },
      // ---- Endodontie ----------------------------------------------------------
      {
        id: "endo", label: "Wurzelkanalbehandlung",
        match: /endo|wurzelkanal|vitalexstirpation|trepanation/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zahn", pflicht: true, frage: "Welcher Zahn (FDI)?" },
          { key: "kanaele", pflicht: true, frage: "Wie viele Kanaele wurden aufbereitet?" },
          { key: "arbeitsschritt", pflicht: true, frage: "Welcher Schritt — Aufbereitung, medikamentoese Einlage oder Wurzelfuellung?" },
          { key: "roentgen", pflicht: true, frage: "Welche Aufnahmen (Messaufnahme/Kontrollbild), welche Region — und mit welcher rechtfertigenden Indikation?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "kofferdam", pflicht: false, frage: "Kofferdam gelegt?" },
        ],
      },
      // ---- Extraktion / Osteotomie ---------------------------------------------
      {
        id: "extraktion", label: "Extraktion / Osteotomie",
        match: /extraktion|osteotomie/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zahn", pflicht: true, frage: "Welcher Zahn (FDI)?" },
          { key: "grund", pflicht: true, frage: "Was war die Indikation fuer die Entfernung?" },
          { key: "roentgen", pflicht: true, frage: "Roentgenbild vorhanden — welche Aufnahme, welche Region, mit welcher rechtfertigenden Indikation?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "verlauf", pflicht: true, frage: "Verlief die Entfernung normal oder operativ (Osteotomie)?" },
          { key: "blutstillung", pflicht: true, frage: "Blutstillung erreicht?" },
          { key: "naht", pflicht: false, frage: "Wurde genaeht — und womit?" },
          { key: "verhaltensregeln", pflicht: true, frage: "Verhaltensregeln nach dem Eingriff mitgegeben?" },
        ],
      },
      // ---- Wurzelspitzenresektion ----------------------------------------------
      {
        id: "wsr", label: "Wurzelspitzenresektion",
        match: /wsr|wurzelspitze/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zahn", pflicht: true, frage: "Welcher Zahn (FDI)?" },
          { key: "roentgen", pflicht: true, frage: "Roentgen prae-/postoperativ — welche Aufnahme, welche Region, mit welcher rechtfertigenden Indikation?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "wurzelfuellung_retro", pflicht: false, frage: "Retrograde Wurzelfuellung gelegt — womit?" },
          { key: "naht", pflicht: true, frage: "Wurde genaeht?" },
        ],
      },
      // ---- Mukogingivalchirurgie -------------------------------------------------
      {
        id: "mukogingival", label: "Mukogingivalchirurgie",
        match: /mukogingival/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "region", pflicht: true, frage: "Welche Region?" },
          { key: "technik", pflicht: true, frage: "Welche OP-Technik (z. B. Transplantat, Verschiebelappen)?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "naht", pflicht: true, frage: "Wurde genaeht?" },
        ],
      },
      // ---- Implantologie -----------------------------------------------------------
      {
        id: "implantation", label: "Implantation",
        match: /implantation|implantat op/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "regio", pflicht: true, frage: "Welche Regio(nen)?" },
          { key: "anzahl", pflicht: true, frage: "Wie viele Implantate?" },
          { key: "system", pflicht: true, frage: "Welches Implantatsystem und welche Dimension?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "augmentation", pflicht: true, frage: "Wurde augmentiert — und womit?" },
          { key: "primaerstabilitaet", pflicht: true, frage: "Primaerstabilitaet erreicht?" },
          { key: "naht", pflicht: true, frage: "Wurde genaeht?" },
          { key: "roentgen", pflicht: true, frage: "Roentgen-Lagekontrolle — welche Aufnahme und mit welcher rechtfertigenden Indikation?" },
        ],
      },
      {
        id: "augmentation", label: "Augmentation (eigenstaendig)",
        match: /augmentation/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "regio", pflicht: true, frage: "Welche Regio?" },
          { key: "material", pflicht: true, frage: "Welches Aufbaumaterial — Eigenknochen, Ersatzmaterial oder beides?" },
          { key: "membran", pflicht: true, frage: "Welche Membran beziehungsweise Barriere?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "naht", pflicht: true, frage: "Wurde genaeht?" },
        ],
      },
      {
        id: "freilegung", label: "Implantat-Freilegung",
        match: /freilegung/i,
        eingriff: true, umfang: "kurz",
        felder: [
          { key: "regio", pflicht: true, frage: "Welche Regio?" },
          { key: "gingivaformer", pflicht: false, frage: "Gingivaformer eingesetzt?" },
          { key: "naht", pflicht: false, frage: "Wurde genaeht?" },
        ],
      },
      // ---- PAR-Strecke -----------------------------------------------------------
      // Aufklaerungs-/Therapiegespraech + MHU VOR der generischen Besprechung.
      {
        id: "par_aufklaerung", label: "PAR Aufklaerungs-/Therapiegespraech + MHU",
        match: /aufkl[aä]rungs.*gespr|therapiegespr/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "themen", pflicht: true, frage: "Welche Themen wurden besprochen (Diagnose, Therapieablauf, Risiken, Kosten)?" },
          { key: "mhu", pflicht: true, frage: "Mundhygieneunterweisung durchgefuehrt — welche Instruktionen?" },
          { key: "entscheidung", pflicht: true, frage: "Wie hat sich der Patient entschieden?" },
        ],
      },
      {
        id: "par_ait", label: "PAR antiinfektioese Therapie (AIT)",
        match: /antiinfekti/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "region", pflicht: true, frage: "Welche Kieferhaelfte(n) beziehungsweise welcher Umfang?" },
          { key: "sondierungstiefen", pflicht: true, frage: "Sondierungstiefen und Blutung (BOP) dokumentiert?" },
          { key: "indizes", pflicht: true, frage: "Mundhygiene-Indizes (API/SBI) erhoben — welche Werte?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
        ],
      },
      {
        id: "par_beva", label: "PAR Befundevaluation (BEVa/BEVb)",
        match: /befundevaluation|beva|bevb/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "sondierungstiefen", pflicht: true, frage: "Sondierungstiefen und Blutung (BOP) erhoben?" },
          { key: "indizes", pflicht: true, frage: "Mundhygiene-Indizes (API/SBI) erhoben — welche Werte?" },
          { key: "bewertung", pflicht: true, frage: "Wie ist die Bewertung im Vergleich zum Ausgangsbefund?" },
        ],
      },
      {
        id: "par_upt", label: "PAR UPT / unterstuetzende Therapie",
        match: /upt/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "umfang", pflicht: true, frage: "Welcher Umfang — welche Zaehne/Regionen?" },
          { key: "indizes", pflicht: true, frage: "Mundhygiene-Indizes (API/SBI) erhoben — welche Werte?" },
          { key: "mundhygiene", pflicht: true, frage: "Wie sind Mundhygiene und Mitarbeit?" },
        ],
      },
      {
        id: "par_leitkeim", label: "PAR Leitkeimbestimmung / Marker",
        match: /leitkeim|marker/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "entnahmestellen", pflicht: true, frage: "An welchen Stellen wurde die Probe entnommen?" },
        ],
      },
      {
        id: "par_einschleifen", label: "Einschleifen (Okklusionskorrektur)",
        match: /einschleifen/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "zaehne", pflicht: true, frage: "Welche Zaehne wurden eingeschliffen?" },
          { key: "okklusion", pflicht: true, frage: "Okklusionsbefund vorher/nachher?" },
        ],
      },
      {
        id: "schienung", label: "Schienung (direkt)",
        match: /schienung/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zaehne", pflicht: true, frage: "Welche Zaehne wurden geschient?" },
          { key: "material", pflicht: false, frage: "Mit welchem Material?" },
        ],
      },
      // ---- Prophylaxe --------------------------------------------------------------
      // Achtung Reihenfolge: "PRO (PAR GRAD A UPT 1) professionelle Zahnreinigung"
      // faellt bewusst in par_upt (PAR-Nachsorge-Doku), NICHT in pzr.
      {
        id: "pzr", label: "Professionelle Zahnreinigung",
        match: /zahnreinigung|pzr/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "umfang", pflicht: true, frage: "Wie viele Zaehne beziehungsweise welcher Umfang?" },
          { key: "fluoridierung", pflicht: false, frage: "Fluoridierung am Ende?" },
          { key: "mundhygiene", pflicht: false, frage: "Auffaelligkeiten bei der Mundhygiene?" },
        ],
      },
      {
        id: "indizes", label: "Indizes (API/SBI)",
        match: /indizes|\bapi\b|\bsbi\b/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "werte", pflicht: true, frage: "Welche Werte — API und SBI (in Prozent)?" },
          { key: "konsequenz", pflicht: false, frage: "Welche Konsequenz — Remotivation, Instruktion?" },
        ],
      },
      {
        id: "prophylaxe_einzel", label: "Fluoridierung / Versiegelung",
        match: /fluoridierung|versiegelung/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "zaehne", pflicht: true, frage: "Welche Zaehne?" },
          { key: "mittel", pflicht: false, frage: "Welches Praeparat beziehungsweise Material?" },
        ],
      },
      {
        id: "bleaching", label: "Zahnaufhellung",
        match: /zahnaufhellung|bleaching/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "kiefer", pflicht: true, frage: "Welcher Kiefer beziehungsweise welche Zaehne?" },
          { key: "ausgangsfarbe", pflicht: false, frage: "Ausgangs- und Zielfarbe festgehalten?" },
        ],
      },
      // ---- Zahnersatz ----------------------------------------------------------------
      {
        id: "ze_praep", label: "Praeparation (Zahnersatz)",
        match: /pr[aä]e?p/i,
        eingriff: true, umfang: "voll",
        felder: [
          { key: "zaehne", pflicht: true, frage: "Welche Zaehne wurden praepariert?" },
          { key: "versorgung", pflicht: true, frage: "Fuer welche Versorgung — Krone, Bruecke, Teilkrone?" },
          { key: "anaesthesie", pflicht: true, frage: "Mit welcher Anaesthesie?" },
          { key: "abformung", pflicht: true, frage: "Abformung oder Scan erfolgt?" },
          { key: "provisorium", pflicht: true, frage: "Provisorium eingegliedert?" },
          { key: "farbe", pflicht: false, frage: "Zahnfarbe bestimmt?" },
        ],
      },
      {
        id: "anprobe", label: "Anprobe (Zahnersatz)",
        match: /anprobe/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "versorgung", pflicht: true, frage: "Was wurde anprobiert?" },
          { key: "passung", pflicht: true, frage: "Wie sind Passung, Okklusion und Aesthetik — was wird geaendert?" },
        ],
      },
      // ---- Ein-/Ausgliederungen: erst die spezifischen (KFO/KB/SLM), dann ZE ----
      {
        id: "kfo_ausgliederung", label: "KFO Ausgliederung (Debonding)",
        match: /ausgliederung/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "apparatur", pflicht: true, frage: "Was wurde entfernt (Brackets, Baender, Apparatur)?" },
          { key: "zahnflaechen", pflicht: true, frage: "Zustand der Zahnflaechen — Entkalkungen oder Schmelzschaeden?" },
          { key: "retention", pflicht: true, frage: "Wie ist die Retention geplant — Retainer oder Schiene?" },
        ],
      },
      {
        id: "kfo_eingliederung", label: "KFO Ein-/Wiedereingliederung (Apparatur)",
        match: /^kfo\s.*eingliederung/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "apparatur", pflicht: true, frage: "Welche Apparatur wurde eingegliedert?" },
          { key: "sitz", pflicht: true, frage: "Sitz und Passung geprueft?" },
          { key: "instruktion", pflicht: true, frage: "Instruktion zu Pflege und Handhabung erfolgt?" },
        ],
      },
      {
        id: "kb_eingliederung", label: "KB Schienen-Eingliederung (CMD)",
        match: /^kb\s.*eingliederung/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "schienenart", pflicht: true, frage: "Welche Schiene wurde eingegliedert?" },
          { key: "sitz", pflicht: true, frage: "Sitz und Okklusion eingestellt?" },
          { key: "tragehinweise", pflicht: true, frage: "Tragehinweise mitgegeben (wann, wie lange)?" },
        ],
      },
      {
        id: "slm_eingliederung", label: "SLM Protrusionsschienen-Eingliederung",
        match: /^slm\s.*eingliederung/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "sitz", pflicht: true, frage: "Sitz und Halt der Schiene geprueft?" },
          { key: "protrusion", pflicht: true, frage: "Welche Protrusionsstufe eingestellt?" },
          { key: "tragehinweise", pflicht: true, frage: "Tragehinweise und Wirkungskontrolle besprochen?" },
        ],
      },
      {
        id: "eingliederung", label: "Eingliederung / Wiedereingliederung (ZE)",
        match: /eingliederung/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "versorgung", pflicht: true, frage: "Was wurde eingegliedert?" },
          { key: "sitz", pflicht: true, frage: "Sitz, Okklusion und Approximalkontakte geprueft?" },
          { key: "befestigung", pflicht: false, frage: "Womit befestigt (Zement/adhaesiv)?" },
        ],
      },
      {
        id: "abformung", label: "Abformung / Scan / Bissnahme / Registrat",
        match: /abformung|scan|bissnahme|registrat/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "bereich", pflicht: true, frage: "Welcher Kiefer beziehungsweise welche Region?" },
          { key: "zweck", pflicht: true, frage: "Wofuer — welche Versorgung?" },
        ],
      },
      {
        id: "provisorium", label: "Provisorium",
        match: /provisorium/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "zaehne", pflicht: true, frage: "Welche Zaehne?" },
        ],
      },
      {
        id: "reparatur", label: "Reparatur / Korrektur / Unterfuetterung",
        match: /reparatur|korrektur|unterfuetterung|unterfütterung/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "objekt", pflicht: true, frage: "Was wurde repariert beziehungsweise korrigiert?" },
          { key: "massnahme", pflicht: true, frage: "Was genau wurde gemacht?" },
        ],
      },
      // ---- Roentgen-/Foto-Termine (eigenstaendige Besuchsgruende) ----------------
      {
        id: "roentgen_termin", label: "Roentgen (eigener Termin)",
        match: /r[oö]e?ntgen/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "aufnahme_region", pflicht: true, frage: "Welche Aufnahme (Zahnfilm, OPG, DVT, FRS) und welche Region?" },
          { key: "rechtfertigende_indikation", pflicht: true, frage: "Wie lautet die rechtfertigende Indikation?" },
          { key: "roentgenbefund", pflicht: true, frage: "Was zeigt die Aufnahme — wie lautet der Roentgenbefund?" },
        ],
      },
      {
        id: "fotografie", label: "Fotostatus",
        match: /fotografie|fotostatus/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "aufnahmen", pflicht: true, frage: "Welche Aufnahmen — intraoral/extraoral, welche Region?" },
        ],
      },
      // ---- CMD-Funktionsanalyse (vor ^kb-Fallback) --------------------------------
      {
        id: "cmd_funktionsanalyse", label: "Klinische Funktionsanalyse (CMD)",
        match: /funktionsanalyse/i,
        eingriff: false, umfang: "voll",
        felder: [
          { key: "gelenkbefund", pflicht: true, frage: "Befund Kiefergelenk und Muskulatur?" },
          { key: "bewegungsumfang", pflicht: true, frage: "Mundoeffnung und Bewegungsumfang — Einschraenkungen oder Deviation?" },
          { key: "okklusion", pflicht: true, frage: "Okklusionsbefund?" },
        ],
      },
      // ================= Stufe 2: generische Typen VOR den Praefix-Fallbacks ====
      {
        id: "video", label: "Videosprechstunde",
        match: /^vid|videosprechstunde/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "themen", pflicht: true, frage: "Welche Themen wurden besprochen?" },
          { key: "ergebnis", pflicht: true, frage: "Was ist das Ergebnis — und was wurde vereinbart?" },
        ],
      },
      {
        id: "besprechung", label: "Besprechung / Planerstellung / KVA-HKP",
        match: /besprechung|planerstellung|kva|hkp/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "themen", pflicht: true, frage: "Welche Themen wurden besprochen (Befund, Optionen, Risiken, Kosten)?" },
          { key: "entscheidung", pflicht: true, frage: "Wie hat sich der Patient entschieden — und was wurde vereinbart?" },
          { key: "unterlagen", pflicht: false, frage: "Wurden Unterlagen erstellt oder mitgegeben (KVA, HKP, Plan)?" },
        ],
      },
      {
        id: "nahtentfernung", label: "Nahtentfernung / Wundkontrolle",
        match: /nahtentfernung/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "wundverhaeltnisse", pflicht: true, frage: "Wie sind die Wundverhaeltnisse?" },
        ],
      },
      // ================= Stufe 3: Fachbereichs-Fallbacks per Praefix ============
      {
        id: "kfo", label: "Kieferorthopaedie (laufende Behandlung)",
        match: /^kfo/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "apparatur", pflicht: true, frage: "Welche Apparatur — und was wurde gemacht (Aktivierung, Umbau, Kontrolle)?" },
          { key: "mitarbeit", pflicht: true, frage: "Wie sind Mitarbeit und Mundhygiene?" },
        ],
      },
      {
        id: "kb_cmd", label: "Kieferbruch / CMD (Schiene & Co.)",
        match: /^kb /i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "massnahme", pflicht: true, frage: "Was wurde gemacht (Schiene, Registrat, Kontrolle)?" },
          { key: "befund", pflicht: true, frage: "Aktueller Befund beziehungsweise Beschwerdebild?" },
        ],
      },
      {
        id: "slm", label: "Schlafmedizin (Protrusionsschiene)",
        match: /^slm/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "massnahme", pflicht: true, frage: "Was wurde gemacht (Kontrolle, Protrusionseinstellung)?" },
          { key: "wirkung", pflicht: true, frage: "Rueckmeldung des Patienten zur Wirkung (Schnarchen/Schlaf)?" },
        ],
      },
      // ================= Stufe 4: Kontrolle als Auffangnetz ======================
      {
        id: "kontrolle", label: "Kontroll-/Fruehuntersuchung",
        match: /kontrolluntersuchung|fruehuntersuchung|frühuntersuchung|kontrolle/i,
        eingriff: false, umfang: "kurz",
        felder: [
          { key: "befund", pflicht: true, frage: "Was ist der Befund — auch wenn ohne Befund?" },
        ],
      },
    ],
  },

  // Basis-Kataloge aller weiteren Fachrichtungen (Orthopaedie, Kardiologie,
  // Hausarzt, ... 24 Master-Kataloge) aus dokuBasisKataloge.js. Gleiche
  // Struktur, Status "basis_entwurf" — pro Praxis per Lern-Profil verfeinerbar.
  ...BASIS_FACH_KATALOGE,
};

// ============================================================================
// Fachrichtung des Clients — DATENGETRIEBEN (Masterplan Phase 7, 04.07.2026).
// Aufloesung (erster Treffer gewinnt), Ergebnis 10 Minuten im Prozess-Cache:
//   1. MAS-Override:   mas_config/doku.specialtyKey  (expliziter Knopf pro
//      Mandant, z. B. fuer Mischpraxen oder Migrationsfaelle).
//   2. Plattform-Daten: clients/{id}/locations/{loc}/specialities —
//      specialtyKey aus dem Onboarding-Katalog (z. B. "hausarzt",
//      "kardiologie"). Kleinste cardinality zuerst (= Haupt-Fachrichtung);
//      genommen wird der erste Key, fuer den ein Fachkatalog existiert.
//      Zahn-Heuristik fuer Altbestaende ohne specialtyKey (Namens-Marker).
//   3. Fallback "zahnmedizin" (bisheriges Verhalten, Demo-Client MedDent).
// Bewusst NIE werfend: Doku-Pruefung muss auch bei Firestore-Schluckauf
// weiterlaufen (dann eben mit dem letzten bekannten/Default-Katalog).
// ============================================================================

const _DENTAL_NAME_MARKERS = [
  "zahn", "kfo", "kieferortho", "parodont", "prophylaxe", "dental",
  "implantolog", "endodont", "prothetik", "oralchirurgie", "mkg",
];

function _dentalByName(name) {
  const n = String(name || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
  return _DENTAL_NAME_MARKERS.some((m) => n.includes(m));
}

const _SPECIALTY_CACHE = new Map(); // clientId -> { key, ts }
const _SPECIALTY_TTL_MS = 10 * 60 * 1000;

async function _resolveSpecialtyKey(clientId) {
  // 1) Expliziter MAS-Override.
  try {
    const cfg = await masCollection(clientId, "mas_config").doc("doku").get();
    const k = String(cfg.exists ? cfg.data()?.specialtyKey || "" : "").trim().toLowerCase();
    if (k && FACH_KATALOGE[k]) return k;
  } catch { /* weiter mit Plattform-Daten */ }

  // 2) Plattform-Provisionierung: Specialities des Buchungs-Standorts.
  try {
    const booking = await masCollection(clientId, "mas_config").doc("booking").get();
    const locationId = booking.exists ? String(booking.data()?.locationId || "").trim() : "";
    if (locationId) {
      const snap = await db.collection("clients").doc(clientId)
        .collection("locations").doc(locationId)
        .collection("specialities").get();
      const specs = snap.docs
        .map((d) => d.data() || {})
        .sort((a, b) => (a.cardinality ?? 999) - (b.cardinality ?? 999));
      for (const s of specs) {
        const k = String(s.specialtyKey || "").trim().toLowerCase();
        if (k && FACH_KATALOGE[k]) return k;
      }
      // Altbestand ohne specialtyKey: Zahn-Heuristik ueber die Namen.
      if (specs.some((s) => _dentalByName(s.name))) return "zahnmedizin";
    }
  } catch { /* Fallback unten */ }

  // 3) Bisheriges Verhalten.
  return "zahnmedizin";
}

/** Fachrichtung des Clients (async, gecacht). Liefert immer einen Key, fuer
 *  den ein Katalog existiert — nie werfend. */
export async function specialtyKeyForClient(clientId) {
  const id = String(clientId || "").trim();
  if (!id) return "zahnmedizin";
  const hit = _SPECIALTY_CACHE.get(id);
  if (hit && Date.now() - hit.ts < _SPECIALTY_TTL_MS) return hit.key;
  const key = await _resolveSpecialtyKey(id);
  _SPECIALTY_CACHE.set(id, { key, ts: Date.now() });
  return key;
}

/** Cache-Invalidierung (z. B. nach Aenderung von mas_config/doku). */
export function invalidateSpecialtyCache(clientId) {
  if (clientId) _SPECIALTY_CACHE.delete(String(clientId).trim());
  else _SPECIALTY_CACHE.clear();
}

function normName(s) {
  return String(s || "").trim();
}

/**
 * Liefert die Doku-Anforderungen fuer einen Besuchsgrund:
 *   { geruest, regel, quelle, dokuPflichtig, umfang }
 * Aufloesung: Fachkatalog-Regel gewinnt, sonst fachuebergreifender Archetyp,
 * sonst nur universelles Geruest ("voll"). So bekommt JEDE Fachrichtung —
 * auch eine ganz ohne eigenen Katalog — sinnvolle Doku-Anforderungen.
 */
export function dokuAnforderungen(specialtyKey, motiveName) {
  const kat = FACH_KATALOGE[String(specialtyKey || "").trim()] || null;
  const name = normName(motiveName);
  let regel = null;
  let quelle = "geruest";
  if (kat && name) {
    for (const r of kat.regeln) {
      if (r.match.test(name)) { regel = r; quelle = "fachkatalog"; break; }
    }
  }
  if (!regel && name) {
    for (const r of ARCHETYP_REGELN) {
      if (r.match.test(name)) { regel = r; quelle = "archetyp"; break; }
    }
  }
  const umfang = regel?.umfang || "voll";
  return {
    geruest: DOKU_GERUEST,
    regel,
    quelle,
    dokuPflichtig: umfang !== "keine",
    umfang,
  };
}

/**
 * Querschnitts-Treffer fuer einen Diktat-Text: Liste der Querschnitt-Regeln,
 * deren trigger im gesprochenen Text anschlaegt (z. B. "Roe 36" -> Roentgen-
 * Pflichtfelder inkl. rechtfertigender Indikation). Fachrichtungs-unabhaengig.
 */
export function querschnittTreffer(diktatText) {
  const t = String(diktatText || "");
  if (!t.trim()) return [];
  return QUERSCHNITT_REGELN.filter((q) => q.trigger.test(t));
}
