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
    { name: "Nitril Einmalhandschuhe ungepudert", dosierung: "—", einwirkzeit: "je Patient" },
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
 * Die fertigen Hygieneplan-Tabellen (Was / Womit / Wie / Wer) — auf einen Blick.
 * Werte kommen aus der gewählten Produktliste.
 */
export function buildHygienePlans(products = {}) {
  const womit = (key) => instructionFor(products, key) || "siehe Praxisstandard";
  const row = (was, key, wie, wer = "Hygienebeauftragte") => ({ was, womit: key ? womit(key) : "—", wie, wer });
  return [
    { key: "haendehygiene", title: "1. Händehygiene & Hautschutz", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Hygienische Händedesinfektion", "haendedesinfektionHygienisch", "Vor/nach Patientenkontakt, Hände vollständig benetzen", "alle"),
      row("Chirurgische Händedesinfektion", "haendedesinfektionChirurgisch", "Vor operativen Eingriffen", "Behandler/Assistenz"),
      row("Hautschutz", "hautschutz", "Vor Arbeitsbeginn auftragen", "alle"),
      row("Hautpflege", "hautpflege", "Nach Arbeitsende auftragen", "alle"),
    ] },
    { key: "flaechen", title: "2. Flächendesinfektion & Reinigung", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Behandlungsflächen", "flaechenDesinfektion", "Nach jedem Patienten wischdesinfizieren", "Assistenz"),
      row("Fußböden", "reinigungFussboeden", "Täglich nach Praxisschluss", "Reinigung"),
    ] },
    { key: "instrumente", title: "3. Instrumentenaufbereitung", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Vordesinfektion/Reinigung", "instrumentenDesinfektion", "Einlegen gemäß Konzentration/EWZ, dann RDG/Sterilisation", "Aufbereitung"),
    ] },
    { key: "absaug", title: "4. Absauganlage & wasserführende Systeme", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Absauganlage durchsaugen", "absaugDesinfektionDurchsaugen", "Täglich nach Behandlungsende", "Assistenz"),
      row("Wasserführende Systeme spülen", null, "Morgens vor erster Behandlung 2 min spülen", "Assistenz"),
    ] },
    { key: "abformung", title: "5. Abformungen & zahntechnische Werkstücke", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Abformungen desinfizieren", "abformungDesinfektion", "Vor Versand ins Labor", "Assistenz"),
    ] },
    { key: "waesche", title: "6. Praxiswäsche", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Berufskleidung/Tücher", "praxiswaescheKoch", "Waschgang gemäß Vorgabe", "Reinigung"),
    ] },
    { key: "psa", title: "7. Persönliche Schutzausrüstung (PSA)", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Mund-Nasen-Schutz", "mundNasenSchutz", "Je Patient wechseln", "alle"),
      row("Handschuhe", "handschuheUnsteril", "Je Patient wechseln", "alle"),
    ] },
    { key: "mundantisept", title: "8. Mundhöhlenantiseptik / Patientenvorbereitung", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Präoperative Mundspülung", "mundhoehlenantiseptik", "Vor Eingriff spülen lassen", "Assistenz"),
    ] },
    { key: "abfall", title: "9. Abfallentsorgung", headers: ["Was", "Womit", "Wie", "Wer"], rows: [
      row("Spitze/scharfe Gegenstände", null, "In durchstichsicheren Behälter", "alle"),
      row("Kontaminierter Abfall", null, "Getrennt sammeln & entsorgen (AS 18 01 04)", "Assistenz"),
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
