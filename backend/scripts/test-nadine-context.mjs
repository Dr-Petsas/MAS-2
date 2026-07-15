import "dotenv/config";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { saveDocument, listDocumentsForCase, getDocument } from "../src/mail/documents.js";
import { assembleContext } from "../src/mail/letterAI.js";

// Integrationstest für Block E + H: Eine hochgeladene Unterlage landet dauerhaft
// im Gehirn, hängt am Vorgang, fließt in den Kontext — und ist strikt
// mandantengetrennt. Nutzt zwei Wegwerf-Mandanten und räumt am Ende auf.
//
// Lauf:  node scripts/test-nadine-context.mjs

const A = "zz-nadinetest-a";
const B = "zz-nadinetest-b";
const STAMP = Date.now();
const FILENAME = `Testbescheid-${STAMP}.txt`;
const MARKER = `AKTENZEICHEN-${STAMP}`;
const TEXT = `Amtsgericht Musterstadt\nGeschäftszeichen: ${MARKER}\nSehr geehrte Damen und Herren, in obiger Sache bitten wir um Stellungnahme bis zum 30.09.2026. Streitwert: 1.250,00 EUR.`;

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { console.error(`  ✗ ${name}`); failures++; }
}

async function wipe(clientId, docId, caseId, eventId) {
  const del = async (colName, id) => { try { await masCollection(clientId, colName).doc(id).delete(); } catch { /* egal */ } };
  if (docId) await del("mas_documents", docId);
  if (eventId) await del("mas_events", eventId);
  if (caseId) await del("mas_cases", caseId);
}

async function main() {
  console.log(`Block E/H Integrationstest (Mandanten ${A} / ${B})`);

  // 1) Unterlage für Mandant A ablegen (Empfänger = Behörde, kein Patient).
  const saved = await saveDocument(A, { text: TEXT, filename: FILENAME, recipient: "Amtsgericht Musterstadt", uploadedBy: "Test" });
  check("saveDocument ok", saved.ok === true);
  check("Vorgang (caseId) angelegt/verknüpft", !!saved.caseId);
  check("Event verknüpft", !!saved.eventId);

  // 2) Wieder abrufbar + am Vorgang.
  const one = await getDocument(A, saved.id);
  check("getDocument findet die Unterlage", one && one.text.includes(MARKER));
  const forCase = await listDocumentsForCase(A, saved.caseId, 10);
  check("listDocumentsForCase liefert sie", forCase.some((d) => d.id === saved.id));

  // 3) Fließt in den Kontext von Mandant A (über den Vorgang).
  const ctxA = await assembleContext(A, { caseId: saved.caseId });
  check("Kontext A enthält die Unterlage (Dateiname)", ctxA.contextText.includes(FILENAME));
  check("Kontext A enthält den Inhalt (Aktenzeichen)", ctxA.contextText.includes(MARKER));
  check("Zähler docs >= 1", (ctxA.counts?.docs || 0) >= 1);

  // 4) Mandanten-Isolation: B sieht NICHTS davon.
  const forCaseB = await listDocumentsForCase(B, saved.caseId, 10);
  check("Mandant B sieht die Unterlage NICHT (Liste leer)", forCaseB.length === 0);
  const ctxB = await assembleContext(B, { caseId: saved.caseId });
  check("Kontext B enthält den Marker NICHT", !ctxB.contextText.includes(MARKER));

  // 5) Idempotenz: erneuter identischer Upload legt keine Dublette an.
  const again = await saveDocument(A, { text: TEXT, filename: FILENAME, recipient: "Amtsgericht Musterstadt", uploadedBy: "Test" });
  check("2. identischer Upload = kein created (idempotent)", again.ok && again.created === false && again.id === saved.id);

  // Aufräumen (best effort).
  await wipe(A, saved.id, saved.caseId, saved.eventId);

  console.log(failures === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${failures} CHECK(S) FEHLGESCHLAGEN`);
  await admin.app().delete().catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FEHLER:", e); process.exit(1); });
