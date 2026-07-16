import { activateBook, setBookPlans } from "./books.js";
import { createSchedule } from "./schedules.js";
import { createJob } from "./jobs.js";
import { nextDueFrom } from "./recurrence.js";
import { log } from "../log.js";

// ============================================================================
// Hygieneplan-Assistent (Julia)
//
// Inspiriert von POST-KI (Produkt-Vorgaben mit Dosierung/Einwirkzeit), aber
// sauber neu für MAS-2. Liefert:
//   • PRODUCT_PRESETS  – vorausgewählte Mittel je Anwendungsbereich (editierbar)
//   • TASK_TEMPLATES   – die wiederkehrenden Hygiene-Jobs (Turnus + QM-Rolle)
//   • buildHygienePlans – die fertigen Plan-Tabellen (Was/Womit/Wie/Wer)
//   • setupHygienePlan  – aktiviert das Buch, legt Pläne ab, erzeugt Schedules
//                          + sofort sichtbare erste Jobs (Julia verteilt sie
//                          automatisch an die Hygiene-Rolle).
// ============================================================================

const HYGIENE_BOOK = "hygiene_plan";
const ROLE_HYGIENE = "hygiene";

// Vorausgewählte Produkte je Bereich. Erstes Element = Default (vorausgefüllt),
// weitere = Alternativen für den Wizard. Dosierung/Einwirkzeit aus der Praxis.
export const PRODUCT_PRESETS = Object.freeze([
  { key: "haendedesinfektionHygienisch", label: "Händedesinfektion (hygienisch)", options: [
    { name: "Sterillium med", dosierung: "3 ml", einwirkzeit: "30 s" },
    { name: "Desderman pure", dosierung: "3 ml", einwirkzeit: "30 s" },
    { name: "Sterillium Virugard", dosierung: "3 ml", einwirkzeit: "30 s" },
  ] },
  { key: "haendedesinfektionChirurgisch", label: "Händedesinfektion (chirurgisch)", options: [
    { name: "Sterillium med", dosierung: "6 ml", einwirkzeit: "1,5 min" },
    { name: "Desderman pure", dosierung: "6 ml", einwirkzeit: "1,5 min" },
  ] },
  { key: "hautschutz", label: "Hautschutz", options: [
    { name: "Stokoderm Protect", dosierung: "—", einwirkzeit: "vor der Arbeit" },
    { name: "Stokolan", dosierung: "—", einwirkzeit: "vor der Arbeit" },
  ] },
  { key: "hautpflege", label: "Hautpflege", options: [
    { name: "Stokoderm Care", dosierung: "—", einwirkzeit: "nach der Arbeit" },
  ] },
  { key: "flaechenDesinfektion", label: "Flächendesinfektion", options: [
    { name: "Kohrsolin FF", dosierung: "2 %", einwirkzeit: "15 min" },
    { name: "Incidin Plus", dosierung: "2 %", einwirkzeit: "15 min" },
    { name: "Meliseptol FF", dosierung: "2 %", einwirkzeit: "15 min" },
  ] },
  { key: "reinigungFussboeden", label: "Fußbodenreinigung", options: [
    { name: "Allzweckreiniger neutral", dosierung: "nach Hersteller", einwirkzeit: "—" },
  ] },
  { key: "absaugDesinfektionDurchsaugen", label: "Absauganlage (durchsaugen)", options: [
    { name: "Kohrsolin FF", dosierung: "2 %", einwirkzeit: "15 min" },
    { name: "Incidin Plus", dosierung: "2 %", einwirkzeit: "15 min" },
  ] },
  { key: "instrumentenDesinfektion", label: "Instrumentendesinfektion", options: [
    { name: "Sekusept forte", dosierung: "2 %", einwirkzeit: "60 min" },
    { name: "Gigasept FF", dosierung: "2 %", einwirkzeit: "60 min" },
  ] },
  { key: "abformungDesinfektion", label: "Abformungen/Werkstücke", options: [
    { name: "Kohrsolin FD werkstoffkompatibel", dosierung: "2 %", einwirkzeit: "5 min" },
    { name: "Gigasept FF", dosierung: "2 %", einwirkzeit: "10 min" },
  ] },
  { key: "praxiswaescheKoch", label: "Praxiswäsche (Kochwäsche)", options: [
    { name: "Vollwaschmittel", dosierung: "nach Hersteller", einwirkzeit: "90 °C" },
  ] },
  { key: "mundNasenSchutz", label: "Mund-Nasen-Schutz", options: [
    { name: "OP-Maske Typ IIR", dosierung: "—", einwirkzeit: "je Patient" },
    { name: "FFP2 Maske", dosierung: "—", einwirkzeit: "je Patient" },
  ] },
  { key: "mundhoehlenantiseptik", label: "Mundhöhlenantiseptik", options: [
    { name: "Chlorhexidin 0,2 %", dosierung: "Spülung", einwirkzeit: "1 min" },
    { name: "Octenidol", dosierung: "Spülung", einwirkzeit: "1 min" },
  ] },
  { key: "handschuheUnsteril", label: "Handschuhe (unsteril)", options: [
    { name: "Nitril Einmalhandschuhe ungepudert", dosierung: "—", einwirkzeit: "—" },
    { name: "Ansell Micro-Touch Nitrile", dosierung: "—", einwirkzeit: "—" },
  ] },
  { key: "handschuheSteril", label: "Handschuhe (steril)", options: [
    { name: "Ansell Gammex sterile", dosierung: "—", einwirkzeit: "—" },
    { name: "Sterile OP-Handschuhe latexfrei", dosierung: "—", einwirkzeit: "—" },
  ] },
  { key: "handschuheReinigung", label: "Handschuhe (chemikalienbeständig)", options: [
    { name: "Reinigungsmittelbeständige Haushaltshandschuhe", dosierung: "—", einwirkzeit: "—" },
  ] },
  { key: "haendewaschung", label: "Händewaschung (Waschlotion)", options: [
    { name: "Flüssigwaschprodukt aus Direktspender", dosierung: "—", einwirkzeit: "—" },
    { name: "Baktolin pure", dosierung: "—", einwirkzeit: "—" },
  ] },
  { key: "schutzbrille", label: "Schutzbrille", options: [
    { name: "Schutzbrille mit Seitenschutz", dosierung: "—", einwirkzeit: "—" },
  ] },
  { key: "absaugRDG", label: "Absaugschläuche (RDG/Tauchbad)", options: [
    { name: "Terralin protect", dosierung: "0,5 %", einwirkzeit: "30 min" },
    { name: "Instrumentendesinfektion nach Herstellerangabe", dosierung: "nach Hersteller", einwirkzeit: "—" },
  ] },
  { key: "praxiswaescheChemothermisch", label: "Praxiswäsche (chemothermisch, VAH)", options: [
    { name: "Schülke Terralin Wäsche", dosierung: "0,5 %", einwirkzeit: "60 °C, 15 min" },
  ] },
]);

const PRESET_BY_KEY = Object.fromEntries(PRODUCT_PRESETS.map((p) => [p.key, p]));

/** Default-Produktauswahl (für den Wizard vorausgefüllt). */
export function defaultProductSelection() {
  const out = {};
  for (const p of PRODUCT_PRESETS) out[p.key] = { ...p.options[0] };
  return out;
}

// Wiederkehrende Hygiene-Jobs. cycle ∈ recurrence.js. productKey verlinkt das
// Mittel, damit Anweisung (Dosierung/Einwirkzeit) automatisch eingesetzt wird.
export const TASK_TEMPLATES = Object.freeze([
  { id: "flaechen_behandlung", title: "Flächendesinfektion Behandlungsplätze", cycle: "daily", productKey: "flaechenDesinfektion" },
  { id: "absaugung", title: "Absauganlage durchsaugen & desinfizieren", cycle: "daily", productKey: "absaugDesinfektionDurchsaugen" },
  { id: "boden", title: "Fußböden Behandlungsräume reinigen", cycle: "daily", productKey: "reinigungFussboeden" },
  { id: "instrumente", title: "Instrumentenaufbereitung dokumentieren", cycle: "daily", productKey: "instrumentenDesinfektion" },
  { id: "haende_check", title: "Spender Händedesinfektion/Seife prüfen & auffüllen", cycle: "weekly", productKey: "haendedesinfektionHygienisch" },
  { id: "wasser_spuelen", title: "Wasserführende Systeme spülen", cycle: "weekly", productKey: null },
  { id: "flaechen_vorrat", title: "Ansatzlösung Flächendesinfektion frisch ansetzen", cycle: "weekly", productKey: "flaechenDesinfektion" },
  { id: "psa_check", title: "PSA-Bestand prüfen (Masken, Handschuhe, Schutzbrille)", cycle: "monthly", productKey: "mundNasenSchutz" },
  { id: "hautschutzplan", title: "Hautschutzplan-Kontrolle", cycle: "monthly", productKey: "hautschutz" },
  { id: "begehung", title: "Hygiene-Begehung & Hygieneplan aktualisieren", cycle: "yearly", productKey: null },
  { id: "schulung", title: "Hygiene-Unterweisung Team (Lesebestätigung)", cycle: "yearly", productKey: null },
]);

const LEAD_DAYS = { daily: 0, weekly: 1, monthly: 3, quarterly: 7, yearly: 14, fiveYearly: 30 };

function chosenProduct(products, key) {
  if (!key) return null;
  const sel = products && products[key];
  if (sel && sel.name) return sel;
  const preset = PRESET_BY_KEY[key];
  return preset ? preset.options[0] : null;
}

function instructionFor(products, key) {
  const p = chosenProduct(products, key);
  if (!p) return "";
  const bits = [p.name];
  if (p.dosierung && p.dosierung !== "—") bits.push(p.dosierung);
  if (p.einwirkzeit && p.einwirkzeit !== "—") bits.push(`EWZ ${p.einwirkzeit}`);
  return bits.join(" · ");
}

/**
 * Die fertigen Hygieneplan-Tabellen im LZK-Muster-Schema:
 *   WAS · WIE · WOMIT · ANWEISUNGEN · WER
 * (Die Zeitpunkte/Bedingungen stehen als Liste in ANWEISUNGEN.)
 * Die WOMIT-Spalte übernimmt die in der Praxis gewählten Produkte.
 */
const HYGIENE_HEADERS = ["Was", "Wie", "Womit", "Anweisungen", "Wer"];
const WER_ALLE = "alle Beschäftigten";
const WER_BEREICH = "alle Beschäftigten im Untersuchungs-, Behandlungs- und Wartungsbereich";
const WER_UB = "alle Beschäftigten im Untersuchungs- und Behandlungsbereich";
const WER_LABOR = "Beschäftigte im Untersuchungs-, Behandlungs- oder Wartungsbereich, ggf. Labor";

export function buildHygienePlans(products = {}) {
  // WOMIT-Zelle aus gewähltem Produkt: „Label: Produktname" + Dosierung/EWZ.
  const womit = (label, key, extra = []) => {
    const p = chosenProduct(products, key) || {};
    const lines = [];
    if (label && p.name) lines.push(`${label}: ${p.name}`);
    else if (p.name) lines.push(p.name);
    else if (label) lines.push(label);
    if (p.dosierung && p.dosierung !== "—") lines.push(`Dosierung: ${p.dosierung}`);
    if (p.einwirkzeit && p.einwirkzeit !== "—") lines.push(`Einwirkzeit: ${p.einwirkzeit}`);
    for (const e of extra) if (e) lines.push(e);
    return lines.join("\n") || "siehe Praxisstandard";
  };
  const A = (...items) => items.filter(Boolean).join("\n"); // ANWEISUNGEN als Liste
  const row = (was, wie, womitStr, anweisungen, wer) => ({ was, wie, womit: womitStr, anweisungen, wer });

  return [
    { key: "haendehygiene", title: "1. Händehygiene", headers: HYGIENE_HEADERS, rows: [
      row("Hände", "Waschen (Reinigen)", womit("", "haendewaschung", ["Trocknen mit Handtuch zum Einmalgebrauch"]),
        A("vor Arbeitsbeginn", "bei sichtbarer Verschmutzung", "nach Arbeitsende"), WER_ALLE),
      row("Hände", "Schützen", womit("Hautschutzprodukt", "hautschutz"),
        A("vor Arbeitsbeginn", "vor längerem Tragen von Handschuhen", "bei Bedarf"), WER_ALLE),
      row("Hände", "Desinfizieren – hygienische Händedesinfektion", womit("Händedesinfektionsmittel (VAH)", "haendedesinfektionHygienisch"),
        A("vor Arbeitsvorbereitung", "vor und nach jeder Behandlung bzw. jedem Kontakt", "bei Unterbrechung", "nach Arbeitsplatzwartung", "nach Toilettenbesuch", "vor/nach Handschuhen"), WER_BEREICH),
      row("Hände", "Desinfizieren – chirurgische Händedesinfektion", womit("Präparat", "haendedesinfektionChirurgisch"),
        A("vor invasiven/chirurgischen Eingriffen (z. B. mit Wundverschluss)", "vor Eingriffen bei Personen mit erhöhtem Infektionsrisiko", "Nach Behandlung: Handschuhe ablegen, hygienische Händedesinfektion"), WER_BEREICH),
      row("Hände", "Pflegen", womit("Hautpflegeprodukt", "hautpflege"),
        A("bei Bedarf", "nach Arbeitsende"), WER_ALLE),
    ] },
    { key: "psa", title: "2. Persönliche Schutzausrüstung", headers: HYGIENE_HEADERS, rows: [
      row("Handschuhe", "nach hygienischer Händedesinfektion auf trockene Haut", womit("Unsterile, ungepuderte medizinische Einmalhandschuhe", "handschuheUnsteril"),
        A("immer bei Kontakt mit Blut/Körperflüssigkeiten/infektiösen Substanzen", "Wechsel nach jedem Patienten/Klienten bzw. nach jeder Behandlung"), WER_BEREICH),
      row("Handschuhe", "nach chirurgischer Händedesinfektion", womit("Sterile, ungepuderte Einmalhandschuhe", "handschuheSteril"),
        A("vor chirurgischen/invasiven Eingriffen (z. B. mit Wundverschluss)", "vor Eingriffen bei Personen mit erhöhtem Infektionsrisiko"), WER_BEREICH),
      row("Handschuhe", "vor Desinfektions-, Reinigungs-, Entsorgungsarbeiten", womit("Reinigungsmittelbeständige Handschuhe", "handschuheReinigung"),
        A("wenn Hände mit schädigenden Stoffen in Kontakt kommen können"), "alle Beschäftigten im Wartungsbereich"),
      row("Mund-Nasen-Schutz", "—", womit("Mund-Nasen-Schutz", "mundNasenSchutz"),
        A("bei Verspritzen/Versprühen erregerhaltigen Materials", "bei Kontamination oder Durchfeuchtung wechseln"), WER_BEREICH),
      row("Schutzbrille", "—", womit("Brille, möglichst mit Seitenschutz", "schutzbrille"),
        A("nach Kontamination mit desinfektionsmittelgetränktem Tuch abwischen"), "—"),
      row("Schutzkleidung", "—", "z. B. flüssigkeitsdichte Kittel/Schürzen, Haarschutz",
        A("nur in besonderen Risikosituationen"), "—"),
    ] },
    { key: "flaechen", title: "3. Flächen und Einrichtungsgegenstände", headers: HYGIENE_HEADERS, rows: [
      row("Patienten-/klientennahe Oberflächen (z. B. Griffe, Schränke, Stuhl, Geräte)", "Reinigung und Desinfektion durch Wischen mit getränktem Tuch", womit("Flächendesinfektionsmittel (VAH)", "flaechenDesinfektion"),
        A("nach jeder Behandlung bzw. jedem Kontakt"), WER_BEREICH),
      row("Sichtbar mit Blut/Sekreten kontaminierte Flächen", "Aufnahme mit desinfektionsmittelgetränktem Einmaltuch, danach Wischdesinfektion", womit("Flächendesinfektionsmittel", "flaechenDesinfektion"),
        A("sofort"), WER_BEREICH),
      row("Schwierig zu reinigende Flächen (z. B. Geräte mit Kontakt)", "Barrieremaßnahmen: Abdecken mit Abdeckmaterialien", "Abdeckmaterial unsteril/steril nach Bedarf",
        A("nach Behandlung Materialien entsorgen bzw. aufbereiten"), "—"),
      row("Fußböden", "Feuchtreinigung", womit("Reinigungsmittel ohne Desinfektionszusatz", "reinigungFussboeden"),
        A("am Ende des Arbeitstages"), "Reinigungspersonal"),
    ] },
    { key: "abformung", title: "4. Abformungen und werkstoffliche Hilfsmittel", headers: HYGIENE_HEADERS, rows: [
      row("Abformungen / kontaminierte Hilfsmittel", "Reinigen durch vorsichtiges Abspülen\nSprüh- oder Tauchdesinfektion", womit("Desinfektionsmittel (VAH Fläche/Instrument)", "abformungDesinfektion"),
        A("unmittelbar nach Entnahme", "im Anschluss an Abspülen"), WER_LABOR),
      row("Werkstücke (z. B. Prothesen, Bissnahmen)", "Reinigen durch Abspülen\nTauchdesinfektion (ggf. mit Ultraschall)", womit("Desinfektionsmittel", "abformungDesinfektion"),
        A("vor Abgabe/Versand", "nach Rückgabe"), WER_LABOR),
    ] },
    { key: "wasser", title: "5. Wasserführende Systeme", headers: HYGIENE_HEADERS, rows: [
      row("Entnahmestellen für Kühl- und Spülwasser", "Alle Entnahmestellen 2 Min. spülen", "Wasser",
        A("zu Beginn des Arbeitstages"), WER_UB),
      row("Benutzte Entnahmestellen", "20 Sekunden spülen", "Wasser",
        A("nach jedem Patienten/Klienten", "am Ende des Arbeitstages"), WER_UB),
      row("Dauerentkeimung/Intensiventkeimung", "sofern vorhanden", "Desinfektionsanlage / Desinfektionsmittel nach Herstellerangaben",
        A("Herstellerangaben beachten, Kontrolle Betriebsparameter"), "—"),
      row("Externe Spül-/Kühlsysteme", "Spülen/Kühlen mit steriler Lösung", "Sterile Lösung",
        A("z. B. bei invasiven/chirurgischen Eingriffen", "bei Personen mit erhöhtem Infektionsrisiko"), "—"),
    ] },
    { key: "absaug", title: "6. Absauganlage (falls vorhanden)", headers: HYGIENE_HEADERS, rows: [
      row("Innenflächen inkl. Absaugschläuche", "Durchsaugen: Gemisch aus Luft und Reinigungs-/Desinfektionsmittel", womit("Reinigungs-/Desinfektionsmittel", "absaugDesinfektionDurchsaugen"),
        A("möglichst nach jeder Behandlung mit Absaugung", "mindestens am Ende des Arbeitstages"), WER_UB),
      row("Außenflächen festsitzender Absaugschläuche", "Wischdesinfektion (ggf. Sprühdesinfektion)", womit("Flächendesinfektionsmittel", "flaechenDesinfektion"),
        A("nach jedem Patienten/Klienten"), WER_UB),
      row("Abnehmbare Absaugschläuche mit Saughandstücken", "Reinigung bzw. Desinfektion im RDG oder Tauchverfahren", womit("RDG oder Instrumentendesinfektionsmittel", "absaugRDG"),
        A("nach Bedarf"), "—"),
      row("Spülbecken (z. B. Mundspülbecken)", "Reinigung und Wischdesinfektion außen und innen", womit("Flächendesinfektionsmittel", "flaechenDesinfektion"),
        A("nach jedem Patienten/Klienten"), "—"),
      row("Filter", "Filterwechsel bzw. -reinigung nach Herstellerangaben", "Handschuhe benutzen",
        A("nach Bedarf"), "—"),
      row("Auffangbehälter / Abscheider (falls vorhanden)", "Wechsel/Entleerung, Entsorgung nach Herstellerangaben", "Handschuhe benutzen, kontaminierte Teile nicht berühren",
        A("nach Bedarf"), "—"),
    ] },
    { key: "waesche", title: "7. Praxis- bzw. Einrichtungswäsche", headers: HYGIENE_HEADERS, rows: [
      row("Textilien (Arbeits-/Schutzkleidung)", "Sammeln", "Ausreichend dichte Behälter/Säcke, getrennt nach Waschprogramm",
        "—", WER_ALLE),
      row("Textilien für Kochwaschgang", "Thermisches Waschverfahren (Kochwaschgang)", womit("Handelsübliches Waschmittel", "praxiswaescheKoch", ["Temperatur: 90 °C"]),
        A("Textile Schutzteile nach jedem Gebrauch wechseln", "Kleidung mind. 2× wöchentlich wechseln"), WER_ALLE),
      row("Textilien nicht für Kochwaschgang geeignet", "Chemothermisches Waschverfahren mit mikrobizidem Waschmittel (VAH)", womit("Mikrobizides Waschmittel", "praxiswaescheChemothermisch"),
        A("Wie oben; aufbereitete Wäsche kontaminationsgeschützt lagern"), WER_ALLE),
    ] },
    { key: "abfall", title: "8. Abfallentsorgung", headers: HYGIENE_HEADERS, rows: [
      row("Hausmüllähnliche Abfälle", "Sammeln getrennt nach Abfallarten", "Entsorgung mit Siedlungsabfall / Wertstofftonnen",
        A("nach Abfallaufkommen"), "alle Beschäftigten, Reinigungspersonal"),
      row("Spitze/scharfe/zerbrechliche Gegenstände (Sharps)", "Sammeln in durchstich- und bruchsicheren Behältnissen", "Entsorgung sicher umschlossen mit Hausmüll (Ausnahmen: Abfallwirtschaftssatzung)",
        A("nach Abfallaufkommen"), "—"),
      row("Mit Blut/Sekreten kontaminierte trockene Abfälle", "Sammeln in feuchtigkeitsbeständigen Abfallsäcken", "Entsorgung sicher umschlossen mit Hausmüll",
        A("nach Abfallaufkommen"), "—"),
      row("Sonderabfälle (z. B. Röntgenchemikalien)", "Sammeln in geeigneten Behältnissen", "Abgabe gegen Entsorgungsnachweis an Fachbetrieb",
        A("nach Abfallaufkommen"), "—"),
      row("Gefahrstoffhaltige Abfälle (z. B. quecksilberhaltig)", "Sammeln in dicht verschließbaren Behältnissen", "Abgabe gegen Entsorgungsnachweis an Fachbetrieb",
        A("nach Abfallaufkommen"), "—"),
    ] },
    { key: "mundantisept", title: "9. Mund-/Schleimhautantiseptik (falls angewendet)", headers: HYGIENE_HEADERS, rows: [
      row("Schleimhäute (z. B. Mundhöhle)", "Präparategetränkte Tupfer oder Besprühen/Spülen", womit("Präparat", "mundhoehlenantiseptik"),
        A("z. B. vor Behandlung bei erhöhtem Infektionsrisiko", "vor invasiven/chirurgischen Eingriffen", "als Ergänzung bei eingeschränkter Reinigungsmöglichkeit"), "Patienten/Klienten"),
    ] },
  ];
}

/**
 * Setzt den Hygieneplan in wenigen Schritten auf:
 *   1. Buch aktivieren (Verantwortung = Hygiene-Rolle)
 *   2. fertige Pläne (mit Produkten) am Buch ablegen
 *   3. je gewählter Aufgabe einen wiederkehrenden Schedule + einen sofort
 *      sichtbaren ersten Job anlegen — Julia verteilt automatisch an Hygiene.
 *
 * @param {object} opts
 *   products: { [key]: {name,dosierung,einwirkzeit} } (sonst Defaults)
 *   taskIds:  Liste der gewünschten TASK_TEMPLATES.id (sonst alle)
 *   responsibleStaffId/deputyStaffId: optionale feste Zuständige
 */
export async function setupHygienePlan(clientId, opts = {}) {
  const products = (opts.products && typeof opts.products === "object") ? opts.products : defaultProductSelection();
  const wantIds = Array.isArray(opts.taskIds) && opts.taskIds.length ? new Set(opts.taskIds.map(String)) : null;
  const templates = wantIds ? TASK_TEMPLATES.filter((t) => wantIds.has(t.id)) : TASK_TEMPLATES;

  const act = await activateBook(clientId, HYGIENE_BOOK, {
    responsibleRole: ROLE_HYGIENE,
    responsibleStaffId: opts.responsibleStaffId || "",
    deputyStaffId: opts.deputyStaffId || "",
  });
  if (!act.ok) return act;

  const plans = buildHygienePlans(products);
  await setBookPlans(clientId, HYGIENE_BOOK, plans, { products });

  const nowIso = new Date().toISOString();
  const jobs = [];
  let schedules = 0;
  for (const t of templates) {
    const leadDays = LEAD_DAYS[t.cycle] ?? 0;
    const purpose = t.productKey ? instructionFor(products, t.productKey) : "";

    // wiederkehrende Vorlage
    const sched = await createSchedule(clientId, {
      bookKey: HYGIENE_BOOK,
      title: t.title,
      cycle: t.cycle,
      mode: "fixed",
      leadDays,
      assignedRole: ROLE_HYGIENE,
      firstDueAt: nextDueFrom(t.cycle, nowIso),
    });
    if (sched.ok) schedules++;

    // sofort sichtbarer erster Job (Julia weist automatisch zu)
    const job = await createJob(clientId, {
      bookKey: HYGIENE_BOOK,
      title: t.title,
      purpose,
      scheduledFor: nowIso,
      dueAt: nowIso,
      leadDays,
      assignedRole: ROLE_HYGIENE,
      recurrenceId: sched.ok ? sched.schedule.id : "",
      recurrenceMode: "fixed",
      cycle: t.cycle,
      createdBy: "julia",
    });
    if (job.ok) jobs.push(job.job);
  }

  log.info("qm.hygiene_setup", { clientId, plans: plans.length, schedules, jobs: jobs.length });
  return { ok: true, bookKey: HYGIENE_BOOK, planCount: plans.length, scheduleCount: schedules, jobCount: jobs.length, jobs };
}
