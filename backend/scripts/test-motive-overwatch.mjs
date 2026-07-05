import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import {
  erkenneBehandlungen,
  erkenneAusStreckenLabel,
  klassifiziereMotivName,
  entscheideKorrektur,
  findeZielMotiv,
  loadOverwatchConfig,
  sprichSweep,
} from "../src/clara/motiveOverwatch.js";

// Clara Overwatch (05.07.2026): Besuchsgrund-Wächter fuer den Recall.
// Reine Entscheidungslogik (Erkennung, Prioritaetsleiter, Ziel-Motiv) +
// Konfig-Roundtrip gegen einen isolierten Test-Mandanten.
//   node scripts/test-motive-overwatch.mjs

const C = "zzz-mas2-overwatch";
let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

async function cleanup() {
  const snap = await masCollection(C, "mas_config").get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

// Besuchsgruende: ECHTE Namen aus dem visitMotives-Katalog des Demo-Clients
// (dump-visitmotives.mjs, 05.07.2026) — Overwatch muss mit den Praxis-
// Kuerzeln (IMP/KCH/ZE/PRO) und "OP klein/gross" umgehen koennen.
const MOTIVE = [
  { id: "m-imp-bespr", name: "IMP Besprechung", duration: 30 },
  { id: "m-imp-klein", name: "IMP Implantation OP klein", duration: 30 },
  { id: "m-imp-gross", name: "IMP Implantation OP groß", duration: 120 },
  { id: "m-imp-kontrolle", name: "IMP Kontrolluntersuchung", duration: 15 },
  { id: "m-kch-kontrolle", name: "KCH Kontrolluntersuchung", duration: 15 },
  { id: "m-kch-fuellung", name: "KCH Füllung klein", duration: 30 },
  { id: "m-kch-politur", name: "KCH Füllungspolitur", duration: 15 },
  { id: "m-pzr", name: "PRO professionelle Zahnreinigung", duration: 30 },
  { id: "m-endo", name: "KCH Endo klein", duration: 40 },
  { id: "m-ze-eingl", name: "ZE Eingliederung klein", duration: 30 },
];

async function run() {
  await cleanup();

  console.log("=== 1) Erkennung: durchgefuehrte Behandlung vs. Plan/Besprechung ===");
  const implantatDoku = erkenneBehandlungen(
    "Implantat regio 36 inseriert, Primärstabilität gut. Naht mit 5-0. Keine Komplikationen."
  );
  check(implantatDoku[0]?.key === "implantation", "Implantat inseriert -> implantation erkannt");

  const nurBesprochen = erkenneBehandlungen(
    "Implantat regio 36 besprochen, Patient wünscht Bedenkzeit. KVA wird erstellt."
  );
  check(!nurBesprochen.some((e) => e.key === "implantation"), "Implantat nur BESPROCHEN -> keine Implantation");
  check(nurBesprochen.some((e) => e.key === "besprechung"), "Besprechung selbst wird erkannt");

  const geplant = erkenneBehandlungen(
    "Implantation regio 46 ist geplant, Termin wird beim nächsten Mal vereinbart."
  );
  check(!geplant.some((e) => e.key === "implantation"), "Zukunfts-Satz (geplant) -> keine Implantation");

  const endoNichtFuellung = erkenneBehandlungen(
    "Zahn 36 trepaniert, Wurzelkanäle aufbereitet und gefüllt, medikamentöse Einlage."
  );
  check(endoNichtFuellung[0]?.key === "endo", "Wurzelkanäle gefüllt -> endo (nicht Füllung)");
  check(!endoNichtFuellung.some((e) => e.key === "fuellung"), "keine falsche Füllungs-Erkennung im Endo-Satz");

  const befundKeineTat = erkenneBehandlungen(
    "Insuffiziente Füllung an 25 festgestellt, Röntgen zeigt Sekundärkaries."
  );
  check(!befundKeineTat.some((e) => e.key === "fuellung"), "insuffiziente Füllung = Befund, keine Behandlung");

  const mehrere = erkenneBehandlungen(
    "Besprechung der Optionen. Danach Implantat 44 gesetzt und Füllung 25 okklusal gelegt."
  );
  check(mehrere[0]?.key === "implantation", "dominante Behandlung = Implantation (Prioritätsleiter)");
  check(mehrere.some((e) => e.key === "fuellung"), "Sekundärbehandlung (Füllung) bleibt als Metadatum erkannt");

  console.log("\n=== 2) Sophie-Strecken-Label als zweite Quelle ===");
  check(erkenneAusStreckenLabel("Implantatinsertion")?.key === "implantation", "Strecke Implantatinsertion -> implantation");
  check(erkenneAusStreckenLabel("Fuellungstherapie")?.key === "fuellung", "Strecke Fuellungstherapie -> fuellung");
  check(erkenneAusStreckenLabel("") === null, "leeres Label -> null");

  console.log("\n=== 3) Besuchsgrund-Namen klassifizieren (echte Katalognamen) ===");
  check(klassifiziereMotivName("Kons Besprechung")?.key === "besprechung", "Kons Besprechung -> besprechung");
  check(klassifiziereMotivName("IMP Besprechung")?.key === "besprechung", "IMP Besprechung -> besprechung (nie OP-Ziel)");
  check(klassifiziereMotivName("IMP Implantation OP klein")?.key === "implantation", "IMP Implantation OP klein -> implantation");
  check(klassifiziereMotivName("IMP Kontrolluntersuchung")?.key === "kontrolle", "IMP Kontrolluntersuchung -> kontrolle");
  check(klassifiziereMotivName("KCH Füllungspolitur")?.key !== "fuellung", "Füllungspolitur ist KEIN Füllungs-Ziel");
  check(klassifiziereMotivName("ZE Eingliederung klein")?.key === "krone", "ZE Eingliederung -> krone/prothetik");
  check(klassifiziereMotivName("ZE Planerstellung KVA/HKP")?.key === "besprechung", "ZE Planerstellung KVA/HKP -> besprechung");

  console.log("\n=== 4) Korrektur-Politik (Prioritaetsleiter) ===");
  const imp = { key: "implantation", label: "Implantation", prio: 4 };
  const fuel = { key: "fuellung", label: "Fuellung", prio: 2 };
  const bespr = { key: "besprechung", label: "Besprechung", prio: 0 };
  check(entscheideKorrektur([imp], { key: "besprechung", prio: 0 }).aktion === "korrigieren",
    "Kons-Besprechung gebucht + Implantat dokumentiert -> korrigieren (DER Kernfall)");
  check(entscheideKorrektur([imp], { key: "kontrolle", prio: 1 }).aktion === "korrigieren",
    "Kontrolle gebucht + Implantat dokumentiert -> korrigieren");
  check(entscheideKorrektur([fuel], { key: "besprechung", prio: 0 }).aktion === "korrigieren",
    "Besprechung gebucht + Füllung gemacht -> korrigieren");
  check(entscheideKorrektur([fuel], { key: "kontrolle", prio: 1 }).aktion === "hinweisen",
    "Kontrolle gebucht + Füllung nebenbei -> NUR Hinweis (Kontroll-Recall geschützt)");
  check(entscheideKorrektur([bespr], { key: "implantation", prio: 4 }).aktion === "keine",
    "OP gebucht + nur Besprechung erkannt -> nie downgraden");
  check(entscheideKorrektur([imp], { key: "implantation", prio: 4 }).aktion === "keine",
    "Besuchsgrund passt schon -> nichts tun");
  check(entscheideKorrektur([], { key: "kontrolle", prio: 1 }).aktion === "keine",
    "nichts erkannt -> nichts tun");

  console.log("\n=== 5) Ziel-Motiv der Praxis finden ===");
  const ziel30 = findeZielMotiv(MOTIVE, "implantation", { apptDauerMin: 30 });
  check(ziel30?.id === "m-imp-klein", `30-Min-Termin -> Implantation OP klein (Dauer-Nähe), war: ${ziel30?.name}`);
  const ziel120 = findeZielMotiv(MOTIVE, "implantation", { apptDauerMin: 110 });
  check(ziel120?.id === "m-imp-gross", `110-Min-Termin -> Implantation OP groß, war: ${ziel120?.name}`);
  check(findeZielMotiv(MOTIVE, "implantation", {})?.id !== "m-imp-bespr",
    "IMP Besprechung wird nie als OP-Ziel gewählt");
  const zielFuellung = findeZielMotiv(MOTIVE, "fuellung", { apptDauerMin: 15 });
  check(zielFuellung?.id === "m-kch-fuellung", `Füllungs-Ziel ist die Füllung, nie die Politur (war: ${zielFuellung?.name})`);
  const fest = findeZielMotiv(MOTIVE, "implantation", { apptDauerMin: 30, mappingId: "m-imp-gross" });
  check(fest?.id === "m-imp-gross", "explizites Mapping aus mas_config gewinnt");
  check(findeZielMotiv(MOTIVE, "wsr", {}) === null, "keine passende Behandlungsart -> null (kein_ziel-Pfad)");

  console.log("\n=== 6) Konfig-Defaults + Notaus ===");
  const cfg = await loadOverwatchConfig(C);
  check(cfg.enabled === true && cfg.mode === "auto", "Default: aktiviert, Modus auto");
  await masCollection(C, "mas_config").doc("motive_overwatch").set({ enabled: false, mode: "vorschlag", mapping: { implantation: "m-imp-gross" } });
  const cfg2 = await loadOverwatchConfig(C);
  check(cfg2.enabled === false && cfg2.mode === "vorschlag" && cfg2.mapping.implantation === "m-imp-gross",
    "Override aus mas_config/motive_overwatch greift");
  process.env.MAS_MOTIVE_OVERWATCH = "0";
  const cfg3 = await loadOverwatchConfig(C);
  check(cfg3.enabled === false, "Notaus MAS_MOTIVE_OVERWATCH=0 greift");
  delete process.env.MAS_MOTIVE_OVERWATCH;

  console.log("\n=== 7) Gesprochene Zusammenfassung ===");
  const gesprochen = sprichSweep([
    { status: "corrected", patientName: "Herr Meier", from: "Kons Besprechung", to: "IMP Implantat-OP klein" },
    { status: "kein_ziel", patientName: "Frau Krause", from: "01 Kontrolle", to: "" },
  ]);
  check(/umgestellt/.test(gesprochen) && /einen Blick/.test(gesprochen), `Sweep-Ansage nennt beides: ${gesprochen}`);
  check(!/€|Euro/.test(gesprochen), "keine Euro-Angaben (Vorgabe 12.06.2026)");
  check(/nichts umzustellen/.test(sprichSweep([])), "leerer Sweep -> beruhigende Ansage");

  await cleanup();
  console.log(failed === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${failed} CHECK(S) FEHLGESCHLAGEN`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error("Testlauf abgebrochen:", e?.stack || e);
  try { await cleanup(); } catch { /* best effort */ }
  process.exit(1);
});
