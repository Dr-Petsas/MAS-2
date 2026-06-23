import { resolveRequirements, evalWhen, defaultProfileFor, allArtifactsWithStatus } from "../src/qm/requirements.js";
import { listArtifacts, listRules, getArtifact, listFachrichtungen } from "../src/qm/catalog.js";

// QM-Anforderungs-Engine: rein, ohne Firestore. Prüft die when-Grammatik und
// dass Fachrichtungs-Profile die richtigen Bücher/Pläne ergeben. Run:
//   node scripts/test-qm-requirements.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}
function keys(items) {
  return new Set(items.map((i) => i.key));
}
function statusOf(items, key) {
  return items.find((i) => i.key === key)?.status || null;
}

console.log("=== Katalog-Integrität ===");
const arts = listArtifacts();
check(arts.length >= 15, `mindestens 15 Artefakte (${arts.length})`);
check(new Set(arts.map((a) => a.key)).size === arts.length, "Artefakt-Keys eindeutig");
for (const r of listRules()) {
  check(!!getArtifact(r.artifactKey), `Regel verweist auf existierendes Artefakt: ${r.artifactKey}`);
}
check(listFachrichtungen().length >= 10, "mindestens 10 Fachrichtungen");

console.log("\n=== when-Grammatik ===");
const zaProfile = { sector: "zahnarzt", capabilities: { roentgen: true, eigene_sterilisation: true } };
check(evalWhen({ sector: ["arzt", "zahnarzt"] }, zaProfile) === true, "sector-Match");
check(evalWhen({ sector: ["arzt"] }, zaProfile) === false, "sector-Mismatch");
check(evalWhen({ capability: "roentgen", eq: true }, zaProfile) === true, "capability eq true");
check(evalWhen({ capability: "labor_eigen", eq: true }, zaProfile) === false, "fehlende capability -> false");
check(evalWhen({ any: [{ capability: "labor_eigen", eq: true }, { capability: "roentgen", eq: true }] }, zaProfile) === true, "any-Verknüpfung");
check(evalWhen({ all: [{ capability: "roentgen", eq: true }, { capability: "labor_eigen", eq: true }] }, zaProfile) === false, "all-Verknüpfung");
check(evalWhen(undefined, zaProfile) === true, "fehlendes when -> matcht");

console.log("\n=== Zahnarzt (Röntgen + eigene Sterilisation) ===");
const za = resolveRequirements(defaultProfileFor("zahnmedizin"));
const zk = za.items;
check(statusOf(zk, "hygiene_plan") === "required", "Hygieneplan Pflicht");
check(statusOf(zk, "sterilization_log") === "required", "Sterilisationsbuch Pflicht (eigene Sterilisation)");
check(statusOf(zk, "constancy_book") === "required", "Konstanzprüfung Pflicht (Röntgen)");
check(statusOf(zk, "qm_handbook") === "required", "QM-Handbuch Pflicht");
check(!keys(zk).has("biohazard_register"), "kein Biostoffverzeichnis ohne Labor/infektiös");
check(!keys(zk).has("temperature_log"), "keine Temperaturliste ohne Kühlschrank");
check(za.items.find((i) => i.key === "constancy_book").reasons.length > 0, "Begründung vorhanden (auditierbar)");

console.log("\n=== Hausarzt (kein Röntgen, Impfkühlschrank) ===");
const ha = resolveRequirements(defaultProfileFor("allgemeinmedizin")).items;
check(statusOf(ha, "hygiene_plan") === "required", "Hygieneplan Pflicht");
check(statusOf(ha, "temperature_log") === "required", "Temperaturliste Pflicht (Impfkühlschrank)");
check(!keys(ha).has("constancy_book"), "keine Konstanzprüfung ohne Röntgen");
check(!keys(ha).has("sterilization_log"), "kein Sterilisationsbuch ohne eigene Aufbereitung");

console.log("\n=== Radiologie (Röntgen, keine Sterilisation) ===");
const rad = resolveRequirements(defaultProfileFor("radiologie")).items;
check(statusOf(rad, "constancy_book") === "required", "Konstanzprüfung Pflicht");
check(statusOf(rad, "radiation_protection_training") === "required", "Strahlenschutz-Fortbildung Pflicht");
check(!keys(rad).has("sterilization_log"), "kein Sterilisationsbuch");

console.log("\n=== Upgrade-Effekt: Praxis schafft Autoklav an ===");
const before = resolveRequirements({ sector: "arzt", capabilities: {} }).items;
const after = resolveRequirements({ sector: "arzt", capabilities: { eigene_sterilisation: true } }).items;
check(!keys(before).has("sterilization_log"), "vorher kein Sterilisationsbuch");
check(keys(after).has("sterilization_log"), "nach Autoklav -> Sterilisationsbuch erscheint");

console.log("\n=== Katalog-Vollansicht ===");
const full = allArtifactsWithStatus(defaultProfileFor("zahnmedizin"));
check(full.length === arts.length, "Vollansicht enthält alle Artefakte");
check(full.some((i) => i.status === "optional"), "nicht zutreffende Artefakte sind 'optional'");

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALLE CHECKS OK");
process.exit(failed ? 1 : 0);
