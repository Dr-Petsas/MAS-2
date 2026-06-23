import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { saveProfile, getProfile, computeRequirements, activateBook, deactivateBook, setBookResponsible, bumpBookVersion, getBook, listBooks } from "../src/qm/books.js";
import { appendDocument, validateFields, listDocuments, latestDocument, exportRows } from "../src/qm/documents.js";

// QM-Bücher + append-only Doku gegen einen isolierten Test-Mandanten. Run:
//   node scripts/test-qm-books.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-qm-books";

async function wipe(name) {
  const snap = await masCollection(C, name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
async function cleanup() {
  await wipe("mas_qm_books");
  await wipe("mas_qm_documents");
  await wipe("mas_qm_profile");
}

async function run() {
  await cleanup();

  console.log("=== Profil speichern + Anforderungen berechnen ===");
  await saveProfile(C, { fachrichtung: "zahnmedizin", sector: "zahnarzt", capabilities: { roentgen: true, eigene_sterilisation: true } });
  const prof = await getProfile(C);
  check(prof?.sector === "zahnarzt", "Profil gespeichert");
  const req = await computeRequirements(C);
  check(req.items.some((i) => i.key === "constancy_book" && i.status === "required"), "Engine über gespeichertes Profil: Konstanzprüfung Pflicht");

  console.log("\n=== Buch aktivieren (idempotent) ===");
  const a1 = await activateBook(C, "constancy_book", { responsibleRole: "strahlenschutzbeauftragte" });
  check(a1.ok, "Konstanzprüfungsbuch aktiviert");
  const b1 = await getBook(C, "constancy_book");
  check(b1.active === true && b1.version === 1 && b1.documentCount === 0, "Startzustand: aktiv, v1, 0 Doku");
  await activateBook(C, "constancy_book", { responsibleStaffId: "staff_saghi" });
  const b1b = await getBook(C, "constancy_book");
  check(b1b.version === 1 && b1b.responsibleStaffId === "staff_saghi", "Re-Aktivierung merged, ohne Version zu erhöhen");
  check((await activateBook(C, "gibt_es_nicht")).reason === "unknown_artifact", "unbekanntes Artefakt -> abgelehnt");

  console.log("\n=== Pflichtfeld-Validierung ===");
  const vMiss = validateFields("constancy_book", { geraet: "OPG-1" });
  check(vMiss.ok === false && vMiss.missing.includes("ergebnis"), "fehlendes Pflichtfeld 'ergebnis' erkannt");
  const vBadEnum = validateFields("constancy_book", { geraet: "OPG-1", ergebnis: "vielleicht" });
  check(vBadEnum.ok === false, "ungültiger enum-Wert abgelehnt");
  const vOk = validateFields("constancy_book", { geraet: "OPG-1", ergebnis: "bestanden", pruefwert: "1.4" });
  check(vOk.ok === true && vOk.cleaned.pruefwert === 1.4, "number wird gecastet, enum ok");

  console.log("\n=== Doku anhängen (append-only) verschiebt Zähler ===");
  const dMiss = await appendDocument(C, "constancy_book", { performedBy: "staff_saghi", fields: { geraet: "OPG-1" } });
  check(dMiss.ok === false && dMiss.reason === "missing_required_fields", "Doku ohne Pflichtfelder -> abgelehnt (kein 'erledigt')");
  const d1 = await appendDocument(C, "constancy_book", { deviceRef: "opg-1", performedBy: "staff_saghi", performedByName: "Saghi", fields: { geraet: "OPG-1", ergebnis: "bestanden", pruefwert: 1.4 } });
  check(d1.ok === true && d1.doc.hash.startsWith("sha256:"), "Doku gespeichert mit Integritäts-Hash");
  const b2 = await getBook(C, "constancy_book");
  check(b2.documentCount === 1, "Doku-Zähler im Buch erhöht");

  console.log("\n=== Lesen / neuester Eintrag / Export ===");
  await appendDocument(C, "constancy_book", { deviceRef: "opg-1", performedBy: "staff_saghi", performedByName: "Saghi", fields: { geraet: "OPG-1", ergebnis: "bestanden" } });
  const docs = await listDocuments(C, "constancy_book");
  check(docs.length === 2, "zwei Nachweise gelistet");
  check((docs[0].performedAtMs || 0) >= (docs[1].performedAtMs || 0), "neuester zuerst");
  const last = await latestDocument(C, "constancy_book", { deviceRef: "opg-1" });
  check(!!last && last.deviceRef === "opg-1", "neuester Eintrag für Gerät gefunden");
  const rows = await exportRows(C, "constancy_book", { from: 0, to: Date.now() + 1000 });
  check(rows.length === 2 && rows[0].nachweis.startsWith("sha256:"), "Export-Zeilen enthalten Nachweis-Hash");

  console.log("\n=== Version & Verantwortliche ===");
  const vb = await bumpBookVersion(C, "constancy_book");
  check(vb.ok && vb.version === 2, "Version erhöht");
  await setBookResponsible(C, "constancy_book", { deputyStaffId: "staff_lena" });
  check((await getBook(C, "constancy_book")).deputyStaffId === "staff_lena", "Vertretung gesetzt");

  console.log("\n=== Liste / Deaktivieren ===");
  await activateBook(C, "hygiene_plan", {});
  check((await listBooks(C, { activeOnly: true })).length === 2, "zwei aktive Bücher");
  await deactivateBook(C, "hygiene_plan");
  check((await listBooks(C, { activeOnly: true })).length === 1, "nach Deaktivieren noch ein aktives Buch");
  check((await listBooks(C)).length === 2, "deaktiviertes Buch bleibt erhalten (Daten nicht gelöscht)");

  await cleanup();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALLE CHECKS OK");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error("test crashed:", e); process.exit(1); });
