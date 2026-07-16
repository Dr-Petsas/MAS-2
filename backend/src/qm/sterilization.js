import { activateBook, setBookPlans } from "./books.js";
import { createSchedule } from "./schedules.js";
import { createJob } from "./jobs.js";
import { nextDueFrom } from "./recurrence.js";
import { generateGeraeteJobs } from "./inventory.js";
import { log } from "../log.js";

// ============================================================================
// Instrumentenaufbereitung / Sterilisation (Julia) — Unterplan-Generator.
//
// Analog zu qm/hygiene.js: erzeugt MEHRERE Unterpläne (als Icons links
// aufrufbar) im selben Spalten-Schema (Was/Wie/Womit/Anweisungen/Wer) + die
// wiederkehrenden Prüf-/Freigabe-Jobs. Inhaltlich gegründet auf die
// Wissensbasis (qm-knowledge.json → sterilization_log): Ablaufkette,
// Geräte/Validierung, Prüfungen & Chargenfreigabe.
//
// WICHTIG: Die EINZELNE Chargen-/Freigabedokumentation bleibt im Praxis-/Steri-
// Dokusystem (Dampsoft, MELAG MELAtrace/MELAdoc, DIOS, SegoSoft …). Julia führt
// KEINE Charge doppelt — hier stehen nur Ablauf + wiederkehrende Prüfungen.
// ============================================================================

const STERI_BOOK = "sterilization_log";
const ROLE_HYGIENE = "hygiene";
const ROLE_STERI = "sterilgutassistenz";

const HDRS = ["Was", "Wie", "Womit", "Anweisungen", "Wer"];
const WER_STERI = "Sterilgutassistenz / aufbereitende Beschäftigte";
const WER_HYG = "Hygienebeauftragte/r";

const A = (...items) => items.filter(Boolean).join("\n");
const row = (was, wie, womit, anweisungen, wer) => ({ was, wie, womit, anweisungen, wer });

/**
 * Die Unterplan-Tabellen der Instrumentenaufbereitung.
 * @param {object} opts  optional: { docSystem?: string } — Doku-System nur als Hinweis.
 */
export function buildSterilizationPlans(opts = {}) {
  const docSystem = String(opts.docSystem || "").trim();
  const freigabeHinweis = docSystem
    ? `Chargenfreigabe/-doku im System „${docSystem}" (nicht doppelt in Julia führen).`
    : "Chargenfreigabe/-doku im Praxis-/Steri-Dokusystem (nicht doppelt in Julia führen).";

  return [
    { key: "ablaufkette", title: "1. Aufbereitungs-Ablaufkette", headers: HDRS, rows: [
      row("Benutzte Instrumente sammeln/vorbehandeln", "Trocken bzw. in Vorreinigungslösung sammeln, grobe Verschmutzung entfernen", "Vorreinigungs-/Desinfektionslösung, durchstichsichere Transportbehälter",
        A("unmittelbar nach Gebrauch", "PSA tragen (Handschuhe, ggf. Schutzbrille)", "kein Antrocknen von Blut/Sekret"), WER_STERI),
      row("Reinigung & Desinfektion", "Maschinell im RDG (bevorzugt); manuell/Ultraschall nur wenn nötig", "RDG mit validiertem Programm; Ultraschallbad + Reiniger nach Herstellerangabe",
        A("RDG-Programm nach Instrumententyp wählen", "Beladung ohne Schattenbildung", "Turbinen/Winkelstücke: Innenreinigung/Pflege beachten"), WER_STERI),
      row("Sichtprüfung, Pflege & Funktionskontrolle", "Auf Sauberkeit, Unversehrtheit und Funktion prüfen; ölen wo vorgeschrieben", "Lupe/Lichtlupe, Instrumentenöl (dampfsterilisierbar)",
        A("verschmutzte Instrumente zurück in die Reinigung", "defekte Instrumente aussortieren", "Gelenke/Scharniere prüfen"), WER_STERI),
      row("Verpackung & Kennzeichnung", "Einschweißen in Klarsicht-Sterilgutverpackung; Kennzeichnung", "Validiertes Siegelgerät, Sterilgutverpackung, Indikator (Behandlungsindikator)",
        A("Siegelnaht prüfen (dicht, ohne Falten)", "Kennzeichnung: Inhalt, Sterilisierdatum, Verfalldatum, Charge", "Sterilgutklasse beachten"), WER_STERI),
      row("Sterilisation", "Dampfsterilisation im validierten Autoklav (i. d. R. Klasse B, 134 °C)", "Validierter Autoklav; Chargen-/Prozessindikatoren",
        A("Beladung nach Herstellerangabe", "Programm nach Instrument/Verpackung", "Chargendokumentation im Steri-Dokusystem"), WER_STERI),
      row("Freigabe & Kennzeichnung der Charge", "Prozessparameter + Indikator prüfen, Charge dokumentiert freigeben", "Chargenprotokoll, Indikatorauswertung",
        A("Freigabe nur bei korrektem Prozessverlauf", freigabeHinweis, "bei Abweichung: Charge sperren, nicht verwenden"), WER_HYG),
      row("Lagerung", "Sterilgut sauber, trocken, staubgeschützt lagern", "Sterilgut-Vorratsschrank/-schublade",
        A("Lagerdauer/Verfalldatum beachten (First-in-first-out)", "beschädigte/feuchte Verpackung = unsteril", "vor Gebrauch Unversehrtheit prüfen"), WER_STERI),
    ] },
    { key: "geraete", title: "2. Geräte, Wartung & Validierung", headers: HDRS, rows: [
      row("Autoklav (Dampfsterilisator, Klasse B)", "Validierung/Revalidierung + Wartung", "Fachfirma / Prüfdienst",
        A("Erst-/Revalidierung nach MPBetreibV", "Intervall i. d. R. jährlich", "Wartung nach Herstellerangabe"), WER_HYG),
      row("RDG (Reinigungs-/Desinfektionsgerät)", "Validierung + Wartung", "Fachfirma / Prüfdienst",
        A("Leistungsqualifikation regelmäßig", "Intervall i. d. R. jährlich", "Dosierung/Programme dokumentieren"), WER_HYG),
      row("Siegelgerät", "Regelmäßige Siegelnaht-/Funktionsprüfung", "Siegelnahtprüfung (z. B. Tintentest), jährliche Prüfung",
        A("Temperatur/Anpressdruck nach Herstellerangabe", "Siegelnahtprüfung dokumentieren"), WER_STERI),
      row("Wasserqualität (VE-Wasser)", "Speisewasser/Leitfähigkeit prüfen", "VE-/demineralisiertes Wasser nach Autoklav-Vorgabe",
        A("nach Herstellerangabe prüfen", "Anlage/Patronen warten"), WER_HYG),
    ] },
    { key: "pruefungen", title: "3. Wiederkehrende Prüfungen & Chargenfreigabe", headers: HDRS, rows: [
      row("Tagesroutine Autoklav", "Vakuum-/Dampfdurchdringungstest (Bowie-Dick) vor erster Charge", "Bowie-Dick-Testpaket, Vakuumtestprogramm",
        A("arbeitstäglich vor Betriebsbeginn", "Ergebnis dokumentieren", "bei Fehlschlag: Gerät nicht freigeben"), WER_STERI),
      row("Chargenfreigabe", "Jede Charge anhand Prozessparameter + Indikator freigeben", "Chargenprotokoll im Steri-Dokusystem",
        A("je Charge", freigabeHinweis), WER_HYG),
      row("Sterilgutlager prüfen", "Verpackung, Lagerdauer, Sauberkeit kontrollieren", "Sichtprüfung",
        A("monatlich", "abgelaufenes/verletztes Sterilgut aussortieren + neu aufbereiten"), WER_STERI),
      row("Dichtungen prüfen", "Tür-/Staubschutzdichtungen an Autoklav & Steri-Schublade prüfen", "Sichtprüfung, ggf. Ersatz",
        A("vierteljährlich"), WER_HYG),
      row("Aufbereitungs-SOP prüfen & aktualisieren", "Ablauf/Standards gegen aktuellen Stand (RKI/DGSV) abgleichen", "SOP-Dokument, aktuelle Empfehlungen",
        A("jährlich", "Team über Änderungen unterweisen"), WER_HYG),
    ] },
  ];
}

// Wiederkehrende Jobs (aus qm-knowledge.json → sterilization_log.erzeugtJobs).
export const TASK_TEMPLATES = Object.freeze([
  { id: "steri_sop_review", title: "Aufbereitungs-SOP prüfen & aktualisieren", cycle: "yearly", role: ROLE_HYGIENE, leadDays: 30 },
  { id: "steri_tagesroutine", title: "Tagesroutine Autoklav (Vakuum-/Bowie-Dick-Test)", cycle: "workday", role: ROLE_STERI, leadDays: 0 },
  { id: "steri_dichtungen", title: "Tür-/Staubschutzdichtungen Autoklav & Steri-Schublade prüfen", cycle: "quarterly", role: ROLE_HYGIENE, leadDays: 7 },
  { id: "steri_lager", title: "Sterilgutlager/Vorratsschrank prüfen (Verpackung, Lagerdauer, Sauberkeit)", cycle: "monthly", role: ROLE_STERI, leadDays: 3 },
  { id: "steri_wasser", title: "Wasserqualität (VE-Wasser) prüfen", cycle: "monthly", role: ROLE_HYGIENE, leadDays: 3 },
]);

/**
 * Richtet die Instrumentenaufbereitung ein: Buch aktivieren, Unterpläne ablegen,
 * wiederkehrende Schedules + erste Jobs erzeugen.
 * @param {object} opts  { taskIds?, docSystem?, responsibleStaffId?, deputyStaffId? }
 */
export async function setupSterilizationPlan(clientId, opts = {}) {
  const wantIds = Array.isArray(opts.taskIds) && opts.taskIds.length ? new Set(opts.taskIds.map(String)) : null;
  const templates = wantIds ? TASK_TEMPLATES.filter((t) => wantIds.has(t.id)) : TASK_TEMPLATES;

  const act = await activateBook(clientId, STERI_BOOK, {
    responsibleRole: ROLE_HYGIENE,
    responsibleStaffId: opts.responsibleStaffId || "",
    deputyStaffId: opts.deputyStaffId || "",
  });
  if (!act.ok) return act;

  const plans = buildSterilizationPlans({ docSystem: opts.docSystem });
  await setBookPlans(clientId, STERI_BOOK, plans, { products: opts.docSystem ? { docSystem: opts.docSystem } : null });

  const nowIso = new Date().toISOString();
  const jobs = [];
  let schedules = 0;
  for (const t of templates) {
    const sched = await createSchedule(clientId, {
      bookKey: STERI_BOOK,
      title: t.title,
      cycle: t.cycle,
      mode: "fixed",
      leadDays: t.leadDays,
      assignedRole: t.role,
      firstDueAt: nextDueFrom(t.cycle, nowIso),
    });
    if (sched.ok) schedules++;

    const job = await createJob(clientId, {
      bookKey: STERI_BOOK,
      title: t.title,
      scheduledFor: nowIso,
      dueAt: nowIso,
      leadDays: t.leadDays,
      assignedRole: t.role,
      recurrenceId: sched.ok ? sched.schedule.id : "",
      recurrenceMode: "fixed",
      cycle: t.cycle,
      createdBy: "julia",
    });
    if (job.ok) jobs.push(job.job);
  }

  // Aus dem Geraete-Inventar (Aufbereitung) die geraetebezogenen Validierungs-/
  // Pruef-Jobs ableiten (Autoklav, RDG, DAC, US-Bad, Siegelgeraet …), abhaengig
  // vom hinterlegten letzten Validierungsdatum. Idempotent.
  let deviceJobs = 0, deviceOverdue = 0;
  try {
    const g = await generateGeraeteJobs(clientId, { praxisId: opts.praxisId, gruppen: ["aufbereitung"] });
    if (g.ok) { deviceJobs = g.created; deviceOverdue = g.overdue; }
  } catch (e) { log.warn("qm.sterilization_devicejobs_fail", { clientId, error: String(e?.message || e) }); }

  log.info("qm.sterilization_setup", { clientId, plans: plans.length, schedules, jobs: jobs.length, deviceJobs, deviceOverdue });
  return { ok: true, bookKey: STERI_BOOK, planCount: plans.length, scheduleCount: schedules, jobCount: jobs.length + deviceJobs, deviceJobCount: deviceJobs, deviceOverdue, jobs };
}
