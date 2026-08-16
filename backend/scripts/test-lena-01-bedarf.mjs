/**
 * Gegenprobe Bedarf-Mapping (KONS + ZE). Rein lokal, ohne Server.
 */
import { readFileSync } from "fs";
import vm from "vm";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../public/m/lena-01/lena-01-bedarf.js"), "utf8");
const ctx = { console };
vm.runInNewContext(src, ctx);
const B = ctx.Lena01Bedarf;
if (!B) {
  console.error("Lena01Bedarf fehlt");
  process.exit(1);
}

function empty() {
  return { missing: false, mark: {}, surfaces: {}, rootMarkers: [], pocket: { m: 1, d: 1 } };
}
function pack(map) {
  const teeth = {};
  [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
    31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48].forEach((f) => {
    teeth[f] = empty();
  });
  Object.keys(map).forEach((k) => { teeth[k] = Object.assign(empty(), map[k]); });
  return teeth;
}

let fail = 0;
function ok(name, cond) {
  if (cond) console.log("  ok  " + name);
  else { console.log("  FAIL " + name); fail += 1; }
}

console.log("KONS");
{
  const t = pack({
    16: { surfaces: { okklusal: ["karies"] } },
    26: { surfaces: { mesial: ["insuffizient"] } },
    36: { rootMarkers: ["i_wurzelfuellung"] },
    21: { mark: { cap: true } },
    46: { rootMarkers: ["wurzelfuellung"], mark: { cap: true } },
    14: { surfaces: { okklusal: ["fuellung"], mesial: ["fuellung"], distal: ["karies"] } },
  });
  const ids = B.propose(t).map((x) => x.id);
  ok("Karies 16 → Füllung", ids.includes("fu-16"));
  ok("insuffizient 26 → erneuern", ids.includes("fu-ern-26"));
  ok("insuff. WF 36 → Revision + WSR + EX", ids.includes("rev-36") && ids.includes("rev-wsr-36") && ids.includes("ext-endo-36"));
  ok("CAP 21 ohne WF → WK", ids.includes("wk-21"));
  ok("CAP 46 mit WF → Revision-Varianten, nicht neue WK", ids.includes("rev-46") && !ids.includes("wk-46"));
  ok("3 Flächen 14 → Krone und Füllung als 2. Vorschlag", ids.includes("kr-14") && ids.includes("fu-alt-14"));
}
{
  const t = pack({ 11: { rootMarkers: ["wurzelfuellung"] } });
  const ids = B.propose(t).map((x) => x.id);
  ok("WF Front 11 → Füllung, keine Krone", ids.includes("fu-wf-11") && !ids.includes("kr-11"));
}
{
  const t = pack({ 36: { rootMarkers: ["wurzelfuellung"] } });
  const ids = B.propose(t).map((x) => x.id);
  ok("WF Seitenzahn 36 → Krone plus Füllung", ids.includes("kr-36") && ids.includes("fu-alt-36"));
}

console.log("ZE Lücken");
{
  const t = pack({ 15: { missing: true } });
  const items = B.propose(t);
  const ids = items.map((x) => x.id);
  ok("15 fehlt → Implantat 15", ids.includes("imp-15"));
  ok("15 fehlt → Brücke", ids.includes("br-15"));
  const br = items.find((x) => x.id === "br-15");
  ok("Brücke nennt Pfeiler 14 und 16", br && /14/.test(br.title) && /16/.test(br.title));
  ok("kein Bedarf für allein fehlende 8er", B.propose(pack({ 18: { missing: true } })).filter((x) => x.fach === "IMP" || x.fach === "ZE").length === 0);
}
{
  const t = pack({ 46: { missing: true }, 47: { missing: true }, 48: { missing: true } });
  const items = B.propose(t);
  ok("Freiend 46/47 (8er zählt nicht) → 2 Implantate", items.filter((x) => x.id.startsWith("imp-")).length === 2);
  const br = items.find((x) => x.id === "br-46-47");
  ok("Freiend-Brücke hat mindestens 2 Pfeiler mesial", br && /44|45/.test(br.title + br.hint));
  ok("Hinweis Freiend", br && /Freiend/.test(br.hint));
}
{
  const t = pack({ 15: { missing: true, mark: { brueckenglied: true } } });
  ok("schon Brückenglied → keine neue Lücke", B.gaps(t).length === 0);
}

console.log("weitere Fächer");
{
  const t = pack({
    16: { pocket: { m: 6, d: 5 } },
    11: { mark: { plaque: true } },
    38: { mark: { retiniert: true } },
  });
  const ids = B.propose(t).map((x) => x.id);
  ok("Tasche >3 → PAR", ids.includes("par-strecke"));
  ok("Plaque → PZR", ids.includes("pzr"));
  ok("retiniert 38 → Osteotomie", ids.includes("ost-38"));
}

if (fail) {
  console.error("\n" + fail + " Fehler");
  process.exit(1);
}
console.log("\nalle Gegenproben grün");
