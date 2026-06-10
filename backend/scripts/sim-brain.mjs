import "dotenv/config";
import admin from "../src/firebase.js";
import { extractFromTranscript, extractPatientName } from "../src/brain/extractor.js";
import { nameKeyOf } from "../src/brain/events.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { linkEventToCase, listCases } from "../src/brain/caseStore.js";
import { deriveTopic } from "../src/brain/cases.js";

// ============================================================================
// Brain simulation: run 120+ realistic German "calls" (NO real calls/SMS)
// through the full pipeline (extract -> identity -> event -> case threading),
// then score quality and inspect the resulting tickets. Goal: prove "no
// duplicate cases" and "the AI understands what was said", and surface
// concrete learnings. Runs against an isolated test tenant, cleaned up after.
// ============================================================================

const TEST_CLIENT = "zzz-mas2-sim";
const db = admin.firestore();
const BASE_TS = Date.UTC(2026, 5, 9, 6, 0, 0);

// --- offline patient directory (mirrors masSearchPatients token-AND logic) ---
const DIRECTORY = [
  ["Anna", "Ackermann"], ["Peter", "Mayer"], ["Julia", "Schmidt"],
  ["Klaus", "Müller"], ["Sabine", "Müller"], ["Thomas", "Fischer"],
  ["Lisa", "Weber"], ["Martin", "Koch"], ["Petra", "Wagner"], ["Stefan", "Becker"],
].map(([first, last]) => ({ id: `p_${nameKeyOf(last + " " + first).replace(/\s/g, "_")}`, first, last }));

function resolveLocal(spoken) {
  const key = nameKeyOf(spoken);
  if (!key) return { patientId: null, name: spoken, matchStatus: "unmatched" };
  const toks = key.split(" ");
  const hits = DIRECTORY.filter((p) => {
    const full = nameKeyOf(`${p.first} ${p.last}`).split(" ");
    return toks.every((t) => full.includes(t));
  });
  if (hits.length === 1) return { patientId: hits[0].id, name: `${hits[0].first} ${hits[0].last}`, matchStatus: "matched" };
  if (hits.length > 1) return { patientId: null, name: spoken, matchStatus: "ambiguous" };
  return { patientId: null, name: spoken, matchStatus: "unmatched" };
}

// --- name self-intro phrasings (mix umlauts + ASCII transliteration) ---
const INTROS = [
  (n) => `Guten Tag, mein Name ist ${n}.`,
  (n) => `Hallo, hier spricht ${n}.`,
  (n) => `Ich heiße ${n}, guten Tag.`,
];
const introFor = (n, i) => INTROS[i % INTROS.length](n);

// --- scenarios: ground-truth labels + phrasings ---
const S = (id, topic, signals, texts, extra = {}) => ({ id, topic, signals, texts, ...extra });
const SCENARIOS = [
  S("callback", "callback", ["callbackRequested"], [
    "Bitte rufen Sie mich zurück.",
    "Ich hätte gern einen Rückruf.",
    "Koennen Sie mich bitte zurueckrufen?",
    "Melden Sie sich bitte bei mir.",
  ]),
  S("billing", "billing", ["billingQuestion"], [
    "Ich habe eine Frage zu meiner Rechnung.",
    "Wann bekomme ich den Kostenvoranschlag?",
    "Was kostet die professionelle Zahnreinigung?",
    "Es geht um meinen Heil- und Kostenplan.",
  ]),
  S("appt_book", "appointment", ["appointmentRequest"], [
    "Ich brauche einen Termin.",
    "Ich moechte einen Termin vereinbaren.",
    "Ich möchte einen Kontrolltermin ausmachen.",
  ]),
  S("appt_move", "appointment", ["appointmentRequest"], [
    "Ich muss meinen Termin verschieben.",
    "Kann ich meinen Termin umbuchen?",
    "Bitte meinen Termin auf nächste Woche verlegen.",
  ]),
  S("appt_cancel", "appointment", ["appointmentRequest"], [
    "Ich muss meinen Termin leider absagen.",
    "Bitte sagen Sie meinen Termin morgen ab.",
  ]),
  S("pain", "complaint", ["painPersists"], [
    "Mein Zahn tut weh.",
    "Ich habe seit Tagen starke Schmerzen.",
    "Es pocht und ist entzündet.",
    "Der Zahn tut immer noch weh.",
  ]),
  S("repeat_pain", "complaint", ["repeatVisitStated", "painPersists"], [
    "Ich bin jetzt zum fünften Mal hier und es tut immer noch weh.",
    "Ich war schon dreimal da und der Schmerz bleibt.",
  ]),
  S("repeat", "complaint", ["repeatVisitStated"], [
    "Schon wieder dasselbe Problem mit der Füllung.",
    "Ich bin zum dritten Mal deswegen hier.",
  ]),
  S("complaint", "complaint", ["complaintStated"], [
    "Das ist eine Frechheit, ich bin sehr unzufrieden.",
    "Ich möchte mich beschweren.",
    "Das ist eine Zumutung, ich warte seit einer Stunde.",
    "Das ist ja wohl unverschämt!",
  ]),
  S("document", "document", ["documentRelated"], [
    "Ich brauche eine Krankschreibung.",
    "Können Sie mir ein Attest ausstellen?",
    "Ich benötige meine Unterlagen.",
    "Bitte eine Überweisung zum Kieferchirurgen.",
    "Ich brauche ein neues Rezept.",
  ]),
  S("needs_human", "other", ["needsHuman"], [
    "Ich möchte mit einem echten Menschen sprechen.",
    "Verbinden Sie mich bitte mit einem Mitarbeiter.",
  ]),
  S("mixed", "billing", ["billingQuestion", "callbackRequested"], [
    "Ich habe eine Frage zur Rechnung, bitte rufen Sie mich zurück.",
  ]),
];

// scenarios that are tricky on purpose (documented recall gaps, not over-fit)
const HARD = [
  S("appt_hard", "appointment", ["appointmentRequest"], [
    "Haben Sie diese Woche noch etwas frei?",
    "Ich würde gerne vorbeikommen, wann passt es?",
  ], { hard: true }),
];

const SMALLTALK = [
  "Hallo, schönen guten Tag.",
  "Ich wollte nur Danke sagen für die gute Behandlung.",
  "Frohe Feiertage wünsche ich Ihnen.",
  "Entschuldigung, ich habe mich verwählt.",
  "Test, können Sie mich hören?",
];

// --- build the corpus ---
const items = [];
let seq = 0;
function add(o) { items.push({ sourceId: `sim-${String(++seq).padStart(3, "0")}`, ts: BASE_TS + seq * 60000, ...o }); }

// 1) actionable scenarios across patients, with deliberate repeats (threading).
const speakers = DIRECTORY.map((p) => `${p.first} ${p.last}`);
let pIdx = 0;
for (const sc of SCENARIOS) {
  sc.texts.forEach((text, ti) => {
    for (let k = 0; k < 3; k++) {
      const speaker = speakers[pIdx % speakers.length];
      pIdx++;
      add({ name: speaker, scenario: sc, text, intro: ti + k });
    }
  });
}
// repeats: same patient + same scenario twice more (must thread to ONE case)
for (const sc of ["callback", "billing", "repeat_pain"]) {
  const scen = SCENARIOS.find((x) => x.id === sc);
  const speaker = "Anna Ackermann"; // matched patient
  add({ name: speaker, scenario: scen, text: scen.texts[0], intro: 0, repeatGroup: `rep-${sc}` });
  add({ name: speaker, scenario: scen, text: scen.texts[0], intro: 1, repeatGroup: `rep-${sc}` });
}
// 2) ambiguous (two "Müller") repeated -> must still be ONE case per topic by nameKey
add({ name: "Müller", scenario: SCENARIOS.find((x) => x.id === "billing"), text: "Frage zu meiner Rechnung.", intro: 0, ambiguous: true });
add({ name: "Müller", scenario: SCENARIOS.find((x) => x.id === "billing"), text: "Nochmal wegen der Rechnung.", intro: 1, ambiguous: true });
// 3) unmatched-but-named, repeated -> ONE case by nameKey
add({ name: "Gisela Sturm", scenario: SCENARIOS.find((x) => x.id === "callback"), text: "Bitte rufen Sie mich zurück.", intro: 0, unmatchedNamed: true });
add({ name: "Gisela Sturm", scenario: SCENARIOS.find((x) => x.id === "callback"), text: "Ich warte noch auf den Rueckruf.", intro: 1, unmatchedNamed: true });
// 4) anonymous (no name) -> each is its own case (cannot thread)
add({ name: "", scenario: SCENARIOS.find((x) => x.id === "document"), text: "Ich brauche ein Attest.", anonymous: true });
add({ name: "", scenario: SCENARIOS.find((x) => x.id === "complaint"), text: "Ich will mich beschweren.", anonymous: true });
// 5) hard recall cases
for (const sc of HARD) sc.texts.forEach((text, ti) => add({ name: speakers[(pIdx++) % speakers.length], scenario: sc, text, intro: ti }));
// 6) angry hangup (abortedEarly via end_reason)
add({ name: "Thomas Fischer", scenario: S("abort", "complaint", ["complaintStated", "abortedEarly"], [""]), text: "Das ist eine Frechheit!", intro: 0, endReason: "hangup" });
// 7) colleague calls (KNOWN GAP: subject is the patient, not the caller) - reported separately
add({ name: null, scenario: S("colleague", "callback", ["callbackRequested"], [""]), text: "Hier ist die Praxis Dr. König. Es geht um Ihren Patienten Herrn Mayer, bitte rufen Sie zurück.", colleague: true, counterpartyKind: "colleague" });
add({ name: null, scenario: S("colleague", "callback", ["callbackRequested"], [""]), text: "Guten Tag, Dr. Lang vom Labor. Wegen der Patientin Frau Weber, melden Sie sich bitte.", colleague: true, counterpartyKind: "colleague" });
// 8) smalltalk (named + anonymous) -> NO case, NO signals
SMALLTALK.forEach((text, i) => add({ name: i % 2 ? speakers[i % speakers.length] : "", scenario: S("smalltalk", "other", [], [text]), text, smalltalk: true }));

// --- run the pipeline ---
async function cleanup() {
  for (const c of ["mas_events", "mas_cases"]) {
    const snap = await db.collection("clients").doc(TEST_CLIENT).collection(c).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
  }
}

await cleanup();
console.log(`=== Brain-Simulation: ${items.length} Fälle (ohne Anrufe/SMS) ===\n`);

const results = [];
for (const it of items) {
  const transcript = {
    turns: [
      { role: "user", text: `${it.name ? introFor(it.name, it.intro || 0) + " " : ""}${it.text}` },
    ],
    end_reason: it.endReason || "completed",
  };
  const extracted = await extractFromTranscript(transcript);
  const spokenName = extractPatientName(transcript);
  const resolved = it.colleague ? { patientId: null, name: "", matchStatus: "unmatched" } : resolveLocal(spokenName);

  const { event, created } = await appendEvent(TEST_CLIENT, {
    id: "evt_" + it.sourceId,
    channel: it.counterpartyKind === "colleague" ? "bianca_call" : "bianca_call",
    counterparty: { kind: it.counterpartyKind || "patient" },
    subject: { patientId: resolved.patientId, name: resolved.name || spokenName, matchStatus: resolved.matchStatus },
    summary: extracted.summary,
    signals: extracted.signals,
    confidence: extracted.confidence,
    ts: it.ts,
  });
  let caseId = null;
  if (created && event.status === "open") {
    const link = await linkEventToCase(TEST_CLIENT, event);
    caseId = link.caseId;
  }
  results.push({ it, extracted, spokenName, resolved, status: event.status, created, caseId });
}

// idempotency probe: re-ingest one event with the same id, expect created=false
const probe = results.find((r) => r.created && r.caseId);
let idempotentOk = true;
if (probe) {
  const again = await appendEvent(TEST_CLIENT, {
    id: "evt_" + probe.it.sourceId,
    channel: "bianca_call",
    counterparty: { kind: "patient" },
    subject: { patientId: probe.resolved.patientId, name: probe.resolved.name, matchStatus: probe.resolved.matchStatus },
    summary: probe.extracted.summary, signals: probe.extracted.signals, confidence: probe.extracted.confidence, ts: probe.it.ts,
  });
  idempotentOk = again.created === false;
}

// ---------------- scoring ----------------
const SCOREABLE_FLAGS = ["callbackRequested", "appointmentRequest", "billingQuestion", "complaintStated", "repeatVisitStated", "painPersists", "documentRelated", "needsHuman", "abortedEarly"];
const conf = Object.fromEntries(SCOREABLE_FLAGS.map((f) => [f, { tp: 0, fp: 0, fn: 0 }]));
let topicHit = 0, topicTotal = 0;
let nameHit = 0, nameTotal = 0; const nameMisses = [];
let idHit = 0, idTotal = 0; const idMisses = [];
let stFalsePos = 0; const stViolations = [];
const recallGaps = [];

for (const r of results) {
  const { it, extracted, spokenName, resolved, caseId } = r;
  const exp = new Set(it.scenario.signals);
  if (!it.smalltalk && !it.colleague) {
    for (const f of SCOREABLE_FLAGS) {
      const e = exp.has(f), g = !!extracted.signals[f];
      if (e && g) conf[f].tp++; else if (!e && g) conf[f].fp++; else if (e && !g) { conf[f].fn++; if (it.scenario.hard) recallGaps.push({ text: it.text, missed: f }); else recallGaps.push({ text: it.text, missed: f }); }
    }
    // topic (only when a case-worthy signal is expected)
    if (it.scenario.signals.length) { topicTotal++; if (deriveTopic(extracted.signals) === it.scenario.topic) topicHit++; }
    // name extraction
    if (it.name) { nameTotal++; if (nameKeyOf(spokenName) === nameKeyOf(it.name)) nameHit++; else nameMisses.push({ said: it.name, got: spokenName }); }
    // identity vs ideal
    if (it.name) {
      idTotal++;
      const ideal = resolveLocal(it.name).matchStatus;
      if (resolved.matchStatus === ideal) idHit++; else idMisses.push({ name: it.name, ideal, got: resolved.matchStatus, extracted: spokenName });
    }
  }
  if (it.smalltalk) {
    if (Object.keys(extracted.signals).filter((k) => k !== "sentiment").length > 0 || caseId) { stFalsePos++; stViolations.push({ text: it.text, signals: extracted.signals, caseId }); }
  }
}

// duplicate detection: group by IDEAL identity + topic; >1 distinct caseId = dup
const groups = new Map();
for (const r of results) {
  const { it, caseId } = r;
  if (!caseId || it.smalltalk || it.colleague || it.anonymous) continue;
  const ideal = resolveLocal(it.name);
  const idKey = ideal.patientId || (it.name ? "name:" + nameKeyOf(it.name) : "anon:" + it.sourceId);
  const key = `${idKey}::${it.scenario.topic}`;
  if (!groups.has(key)) groups.set(key, new Set());
  groups.get(key).add(caseId);
}
const duplicates = [...groups.entries()].filter(([, set]) => set.size > 1);

const cases = await listCases(TEST_CLIENT, { limit: 300 });

// ---------------- report ----------------
function pct(a, b) { return b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`; }
function prf(c) {
  const p = c.tp + c.fp === 0 ? 1 : c.tp / (c.tp + c.fp);
  const r = c.tp + c.fn === 0 ? 1 : c.tp / (c.tp + c.fn);
  const f1 = p + r === 0 ? 0 : (2 * p * r) / (p + r);
  return { p, r, f1 };
}

console.log("--- Signal-Erkennung (Precision/Recall/F1) ---");
let microTp = 0, microFp = 0, microFn = 0;
for (const f of SCOREABLE_FLAGS) {
  const c = conf[f]; microTp += c.tp; microFp += c.fp; microFn += c.fn;
  if (c.tp + c.fp + c.fn === 0) continue;
  const { p, r, f1 } = prf(c);
  console.log(`  ${f.padEnd(20)} P=${(p * 100).toFixed(0)}%  R=${(r * 100).toFixed(0)}%  F1=${(f1 * 100).toFixed(0)}%  (tp=${c.tp} fp=${c.fp} fn=${c.fn})`);
}
const microP = microTp / (microTp + microFp || 1), microR = microTp / (microTp + microFn || 1);
console.log(`  ----\n  MICRO               P=${(microP * 100).toFixed(1)}%  R=${(microR * 100).toFixed(1)}%`);

console.log("\n--- Topic / Identität / Name ---");
console.log(`  Topic-Genauigkeit:        ${pct(topicHit, topicTotal)} (${topicHit}/${topicTotal})`);
console.log(`  Namens-Extraktion:        ${pct(nameHit, nameTotal)} (${nameHit}/${nameTotal})`);
console.log(`  Identitäts-Status:        ${pct(idHit, idTotal)} (${idHit}/${idTotal})`);

console.log("\n--- Doppelungen / Idempotenz / Smalltalk ---");
console.log(`  Vorgänge gesamt:          ${cases.length}`);
console.log(`  Doppelte Vorgänge:        ${duplicates.length}  ${duplicates.length === 0 ? "✓ keine" : "✗"}`);
console.log(`  Idempotenz (Re-Ingest):   ${idempotentOk ? "✓ kein Duplikat" : "✗ Duplikat!"}`);
console.log(`  Smalltalk-Fehlalarme:     ${stFalsePos}  ${stFalsePos === 0 ? "✓" : "✗"}`);

console.log("\n--- Beispiel-Tickets (Vorgänge) ---");
for (const c of cases.slice(0, 14)) {
  const last = (c.updates || []).filter((u) => u.kind === "contact").slice(-1)[0];
  console.log(`  [${c.topic}] ${c.subject?.name || "(anonym)"} · Kontakte=${c.contactCount} · ${c.subject?.matchStatus}`);
  if (last) console.log(`      "${(last.text || "").slice(0, 90)}"`);
}

console.log("\n=== LEARNINGS ===");
if (recallGaps.length) {
  console.log(`• ${recallGaps.length} verpasste Signale (Recall-Lücken), z.B.:`);
  for (const g of recallGaps.slice(0, 6)) console.log(`    [${g.missed}] „${g.text}"`);
}
if (nameMisses.length) {
  console.log(`• ${nameMisses.length} Namens-Fehlextraktionen, z.B.:`);
  for (const m of nameMisses.slice(0, 5)) console.log(`    gesagt „${m.said}" -> erkannt „${m.got}"`);
}
if (idMisses.length) {
  console.log(`• ${idMisses.length} Identitäts-Abweichungen, z.B.:`);
  for (const m of idMisses.slice(0, 5)) console.log(`    „${m.name}" erwartet ${m.ideal}, bekam ${m.got} (Name erkannt: „${m.extracted}")`);
}
if (duplicates.length) {
  console.log(`• ${duplicates.length} DOPPELTE Vorgänge:`);
  for (const [k, set] of duplicates.slice(0, 6)) console.log(`    ${k} -> ${[...set].join(", ")}`);
}
if (stViolations.length) {
  console.log(`• Smalltalk falsch als Anliegen gewertet:`);
  for (const v of stViolations) console.log(`    „${v.text}" -> ${JSON.stringify(v.signals)}`);
}
console.log("• Bekannte Grenze (separat): Kollegen-Anrufe — Betreff ist der genannte PATIENT, nicht der Anrufer.");
const coll = results.filter((r) => r.it.colleague);
for (const r of coll) console.log(`    Kollege: erkannt Name „${r.spokenName}" (sollte Patient sein), Signale ${JSON.stringify(r.extracted.signals)}`);

await cleanup();
console.log("\n(cleanup done)");

const hardFail = duplicates.length > 0 || !idempotentOk || stFalsePos > 0;
process.exit(hardFail ? 1 : 0);
