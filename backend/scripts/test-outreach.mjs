// ============================================================================
// W-OUTREACH Tests — Katalog-Qualität + Auflösungs-Kaskade + Kompositionen.
// Läuft PUR (ohne Firestore-Zugriffe): resolveOutreach/compose* sind pure
// Funktionen, der Katalog kommt aus src/clara/outreach-catalog.json.
// ============================================================================

import {
  loadOutreachCatalog,
  resolveOutreach,
  composeRecallCallInstruction,
  composeRecallSms,
  buildAutoInviteMessage,
  CALL_INSTRUCTION_LIMIT,
  SMS_LIMIT,
} from "../src/clara/outreachTemplates.js";

let failed = 0;
let passed = 0;

function check(name, cond, detail = "") {
  if (cond) { passed++; return; }
  failed++;
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

const DU_RE = /\b(du|dich|dir|dein\w*)\b/i;

// ---------------------------------------------------------------------------
// 1) Katalog-Qualität (Guards des Build-Scripts nachprüfen)
// ---------------------------------------------------------------------------

const cat = loadOutreachCatalog();
const specialtyKeys = Object.keys(cat.specialties || {});
check("Katalog: >= 20 Fachrichtungen", specialtyKeys.length >= 20, `nur ${specialtyKeys.length}`);

let motiveTotal = 0;
let badField = null;
for (const key of specialtyKeys) {
  for (const m of cat.specialties[key].motives || []) {
    motiveTotal++;
    for (const f of ["what", "purpose", "purposeShort", "consequence"]) {
      const v = m[f] || "";
      if (!v) continue;
      if (/[<>]/.test(v)) badField = badField || `${key}/${m.name}/${f}: HTML`;
      if (/€|\beuro\b/i.test(v)) badField = badField || `${key}/${m.name}/${f}: Preis`;
      if (DU_RE.test(v)) badField = badField || `${key}/${m.name}/${f}: Du-Form (${v.slice(0, 60)})`;
    }
    if ((m.purpose || "").length > 321) badField = badField || `${key}/${m.name}: purpose zu lang`;
    if ((m.purposeShort || "").length > 151) badField = badField || `${key}/${m.name}: purposeShort zu lang`;
    if ((m.consequence || "").length > 221) badField = badField || `${key}/${m.name}: consequence zu lang`;
    if ((m.what || "").length > 261) badField = badField || `${key}/${m.name}: what zu lang`;
  }
}
check("Katalog: >= 500 Besuchsgründe", motiveTotal >= 500, `nur ${motiveTotal}`);
check("Katalog: kein HTML/Preis/Du-Form/Überlänge in Feldern", !badField, badField || "");

// Kern-Motive, die es sicher geben muss:
const zm = cat.specialties["zahnmedizin"]?.motives || [];
check("Katalog: Zahnmedizin enthält PZR", zm.some((m) => /zahnreinigung/i.test(m.name)));
check("Katalog: Zahnmedizin enthält Implantat-Motiv", zm.some((m) => /implantat/i.test(m.name)));
check("Katalog: Gynäkologie enthält Krebsvorsorge", (cat.specialties["gynaekologie"]?.motives || []).some((m) => /krebsvorsorge/i.test(m.name)));

// ---------------------------------------------------------------------------
// 2) Auflösungs-Kaskade
// ---------------------------------------------------------------------------

// exakt (eigene Fachrichtung)
const exact = resolveOutreach({ specialtyKey: "zahnmedizin", visitMotiveName: "PRO Professionelle Zahnreinigung" });
check("Kaskade: exakter Treffer", exact.matchLevel === "exact", exact.matchLevel);
check("Kaskade: exakter Treffer hat purpose", !!exact.texts.purpose);

// exakt über Patientennamen
const exactPat = resolveOutreach({ specialtyKey: "zahnmedizin", visitMotiveName: "Professionelle Zahnreinigung (PZR)" });
check("Kaskade: exakt über nameForPatient", exactPat.matchLevel === "exact", exactPat.matchLevel);

// exakt über Fachrichtungs-Grenze (MedDent-Client, GYN-Motivname)
const cross = resolveOutreach({ specialtyKey: "zahnmedizin", visitMotiveName: "GYN Krebsvorsorge" });
check("Kaskade: exakt über Fachgrenze", cross.matchLevel === "exact", cross.matchLevel);
check("Kaskade: Fachgrenze liefert GYN-Inhalt", /krebs/i.test(cross.texts.purpose), cross.texts.purpose.slice(0, 80));

// fuzzy (Praxis-Name weicht ab: Zusatz + Dauer)
const fuzzy = resolveOutreach({ specialtyKey: "zahnmedizin", visitMotiveName: "Professionelle Zahnreinigung 60 Min." });
check("Kaskade: fuzzy Treffer", fuzzy.matchLevel === "exact" || fuzzy.matchLevel === "fuzzy", fuzzy.matchLevel);
check("Kaskade: fuzzy liefert PZR-Inhalt", /zahn|belä|pzr/i.test(fuzzy.texts.purpose), fuzzy.texts.purpose.slice(0, 80));

// Klasse (kein Katalog-Treffer, aber klarer Termin-Typ)
const cls = resolveOutreach({ specialtyKey: "hausarzt", visitMotiveName: "Jährliche Spezial-Vorsorgeuntersuchung XYZ" });
check("Kaskade: Klassen-Fallback", ["class", "fuzzy"].includes(cls.matchLevel), cls.matchLevel);
check("Kaskade: Klassen-Fallback hat purpose", !!cls.texts.purpose);

// generisch (gar nichts erkennbar)
const gen = resolveOutreach({ specialtyKey: "hausarzt", visitMotiveName: "Sondertermin Alpha Neun" });
check("Kaskade: generischer Fallback", gen.matchLevel === "generic", gen.matchLevel);

// leer -> generisch, nie werfend
const empty = resolveOutreach({ visitMotiveName: "" });
check("Kaskade: leerer Name -> generic", empty.matchLevel === "generic");

// ---------------------------------------------------------------------------
// 3) Anruf-Instruktion
// ---------------------------------------------------------------------------

const baseArgs = {
  practiceName: "Praxis MedDent Bonn",
  patientName: "Helena Brandt",
  date: "2026-07-08",
  timeLabel: "10:30",
  calendarName: "Dr. Petsas",
};

const instr = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "PRO Professionelle Zahnreinigung",
  overdueDays: 210,
  source: "campaign",
});
check("Anruf: Länge <= Limit", instr.length <= CALL_INSTRUCTION_LIMIT, `${instr.length}`);
check("Anruf: Sicherheitsregeln enthalten", instr.includes("keine Diagnosen") && instr.includes("keine Preise") && instr.includes("akzeptierst du freundlich"));
check("Anruf: Opt-out-Regel enthalten", instr.includes("keine Anrufe mehr"));
check("Anruf: Terminangebot enthalten", instr.includes("10:30") && instr.includes("Dr. Petsas"));
check("Anruf: motivspezifischer Anlass", /Zahnreinigung|PZR/i.test(instr));
check("Anruf: Hintergrund (purpose) enthalten", instr.includes("Hintergrund"));
check("Anruf: ehrliche Zeitangabe (Monate)", /etwa 7 Monate zurück/.test(instr), instr.match(/zurück|überfällig/)?.[0] || "fehlt");
check("Anruf: kein Preis", !/€|\beuro\b/i.test(instr));

// Recall-Quelle: andere (ehrliche) Formulierung
const instrRecall = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "GYN Krebsvorsorge",
  overdueDays: 95,
  source: "recall",
});
check("Anruf: Recall-Quelle sagt überfällig", /überfällig/.test(instrRecall));

// Kampagnen-Override gewinnt gegen Katalogtexte, Regeln bleiben
const instrCamp = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "PRO Professionelle Zahnreinigung",
  campaignPrompt: "Bitte besonders auf das neue Prophylaxe-Programm hinweisen und Frau Brandt herzlich grüßen.",
});
check("Anruf: Kampagnen-Vorgabe übernommen", instrCamp.includes("Prophylaxe-Programm"));
check("Anruf: Regeln trotz Kampagnen-Vorgabe", instrCamp.includes("keine Diagnosen"));

// Monster-Kampagnen-Prompt wird gekappt, Regeln + Angebot bleiben vollständig
const instrLong = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "PRO Professionelle Zahnreinigung",
  campaignPrompt: "Sehr wichtig! ".repeat(300),
});
check("Anruf: Überlänge gekappt", instrLong.length <= CALL_INSTRUCTION_LIMIT, `${instrLong.length}`);
check("Anruf: Regeln überleben Kappung", instrLong.includes("keine Diagnosen") && instrLong.includes("bedanke dich freundlich"));
check("Anruf: Angebot überlebt Kappung", instrLong.includes("10:30"));

// Generisches Motiv: Instruktion bleibt ehrlich ohne erfundene Details
const instrGen = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "Sondertermin Alpha Neun",
  overdueDays: 0,
});
check("Anruf: generisch ohne Hintergrund-Block", !instrGen.includes("Hintergrund"));
check("Anruf: generisch nennt Anlass + Regeln", instrGen.includes("Sondertermin Alpha Neun") && instrGen.includes("keine Diagnosen"));

// ---------------------------------------------------------------------------
// 3b) Kontroll-Fokus (Chef 28.07.2026: Live-Anruf bot "Zahnersatz
//     eingliedern" an statt der KONTROLLE des eingegliederten Zahnersatzes).
//     Recall zu einer zurueckliegenden Behandlung = immer Kontroll-Einladung.
// ---------------------------------------------------------------------------

const instrZe = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "ZE Eingliederung Krone",
  overdueDays: 800,
  source: "recall",
});
check("Kontrolle ZE: Qualitätssicherung + kontrollieren", /Qualitätssicherung/.test(instrZe) && /kontrollieren/.test(instrZe), instrZe.slice(0, 200));
check("Kontrolle ZE: Verbot neue Behandlung (KONTROLLTERMIN)", instrZe.includes("KONTROLLTERMIN") && instrZe.includes("eingliedern lassen"));
check("Kontrolle ZE: nicht 'wieder fällig: Eingliederung'", !/wieder fällig[^.]*Eingliederung/.test(instrZe));
check("Kontrolle ZE: Zeitbezug Jahre (über 2 Jahren)", /über 2 Jahren/.test(instrZe), instrZe.match(/über [^ ]+ Jahren?/)?.[0] || "fehlt");
check("Kontrolle ZE: Länge <= Limit", instrZe.length <= CALL_INSTRUCTION_LIMIT, `${instrZe.length}`);

const instrFuellung = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "KCH Füllung zweiflächig",
  overdueDays: 400,
  source: "recall",
});
check("Kontrolle Füllung: dicht und intakt", /Füllung zu kontrollieren|dicht und intakt/.test(instrFuellung), instrFuellung.slice(0, 200));
check("Kontrolle Füllung: Verbot enthalten", instrFuellung.includes("KONTROLLTERMIN"));

const instrPa = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "PAR Nachsorge UPT",
  overdueDays: 200,
  source: "recall",
});
check("Kontrolle PA: Zustand des Zahnfleisches", /Zustand des Zahnfleisches überprüfen/.test(instrPa), instrPa.slice(0, 200));

const instrImpl = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "IMPL Implantatversorgung",
  overdueDays: 500,
  source: "recall",
});
check("Kontrolle Implantat: begutachten + Entzündung/Knochenabbau", /begutachten/.test(instrImpl) && /Entzündung mit Knochenabbau/.test(instrImpl), instrImpl.slice(0, 200));

const instrKb = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "KB Aufbissschiene",
  overdueDays: 300,
  source: "recall",
});
check("Kontrolle Schiene: Sitz und Zustand", /Sitz und Zustand der Schiene/.test(instrKb), instrKb.slice(0, 200));

// Beratungs-/Vorsorge-/Prophylaxe-Motive behalten den Katalog-Weg
const instrBeratung = composeRecallCallInstruction({
  ...baseArgs,
  visitMotiveName: "Implantat-Beratung",
  overdueDays: 100,
  source: "recall",
});
check("Beratung: KEIN Kontroll-Fokus (kein Bestand zu prüfen)", !instrBeratung.includes("KONTROLLTERMIN"), instrBeratung.slice(0, 160));
check("Krebsvorsorge: Katalog-Weg bleibt (überfällig-Phrase)", /überfällig/.test(instrRecall));

const smsZe = composeRecallSms({
  practiceName: "Praxis MedDent Bonn",
  practicePhone: "0228 555 123",
  patientName: "Helena Brandt",
  date: "2026-07-08",
  timeLabel: "10:30",
  visitMotiveName: "ZE Eingliederung Krone",
});
check("SMS ZE: Kontrolle Ihres Zahnersatzes", smsZe.includes("Kontrolle Ihres Zahnersatzes"), smsZe);
check("SMS ZE: Länge <= Limit", smsZe.length <= SMS_LIMIT, `${smsZe.length}`);

const autoZe = buildAutoInviteMessage({ visitMotiveName: "ZE Eingliederung" });
check("Auto-Botschaft ZE: Kontrolle statt Eingliederung", autoZe.includes("Kontrolle Ihres Zahnersatzes") && !/fällig: ZE Eingliederung/.test(autoZe), autoZe);

// ---------------------------------------------------------------------------
// 4) SMS
// ---------------------------------------------------------------------------

const sms = composeRecallSms({
  practiceName: "Praxis MedDent Bonn",
  practicePhone: "0228 555 123",
  patientName: "Helena Brandt",
  date: "2026-07-08",
  timeLabel: "10:30",
  visitMotiveName: "PRO Professionelle Zahnreinigung",
});
check("SMS: Länge <= Limit", sms.length <= SMS_LIMIT, `${sms.length}`);
check("SMS: nennt Motiv", /Zahnreinigung|PZR/i.test(sms));
check("SMS: nennt Praxisnummer", sms.includes("0228 555 123"));
check("SMS: Sie-Form (keine Du-Form)", !DU_RE.test(sms), sms);
check("SMS: kein Preis", !/€|\beuro\b/i.test(sms));

// Genus-Falle: Motiv mit sächlichem/neutralem Namen bleibt grammatisch sauber
const sms2 = composeRecallSms({
  practiceName: "Hausarztpraxis Sonne",
  practicePhone: "030 111 222",
  patientName: "Jonas Kupper",
  date: "2026-07-09",
  timeLabel: "08:15",
  visitMotiveName: "Check-up 35",
});
check("SMS: Doppelpunkt-Form fürs Motiv", sms2.includes("wieder ein Termin fällig"), sms2);
check("SMS: Länge 2 <= Limit", sms2.length <= SMS_LIMIT, `${sms2.length}`);

// ---------------------------------------------------------------------------
// 5) Auto-Botschaft fürs gezielte Einbestellen
// ---------------------------------------------------------------------------

const auto = buildAutoInviteMessage({ visitMotiveName: "PRO Professionelle Zahnreinigung" });
check("Auto-Botschaft: vorhanden", !!auto);
check("Auto-Botschaft: nennt Thema", /Zahnreinigung|PZR/i.test(auto));
check("Auto-Botschaft: kurz genug fürs Invite-Budget", auto.length <= 400, `${auto.length}`);
check("Auto-Botschaft: leer ohne Motiv", buildAutoInviteMessage({ visitMotiveName: "" }) === "");

// ---------------------------------------------------------------------------

console.log(`\n${passed} Checks bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed ? 1 : 0);
