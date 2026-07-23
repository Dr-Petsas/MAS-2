import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../public/m/lena-01/teeth");
fs.mkdirSync(outDir, { recursive: true });

const configs = {
  18: ["upperMolar", 55, 0.88, 0.82, -1],
  17: ["upperMolar", 63, 1.00, 0.94, -1],
  16: ["upperMolar", 70, 1.10, 1.00, -1],
  15: ["premolar", 44, 0.92, 1.00, -1],
  14: ["upperPremolar1", 48, 1.00, 1.00, -1],
  13: ["canine", 45, 1.00, 1.08, -1],
  12: ["incisor", 40, 0.94, 0.96, -1],
  11: ["incisor", 53, 1.08, 1.00, -1],
  21: ["incisor", 53, 1.08, 1.00, 1],
  22: ["incisor", 40, 0.94, 0.96, 1],
  23: ["canine", 45, 1.00, 1.08, 1],
  24: ["upperPremolar1", 48, 1.00, 1.00, 1],
  25: ["premolar", 44, 0.92, 1.00, 1],
  26: ["upperMolar", 70, 1.10, 1.00, 1],
  27: ["upperMolar", 63, 1.00, 0.94, 1],
  28: ["upperMolar", 55, 0.88, 0.82, 1],
  48: ["lowerMolar2", 57, 0.88, 0.84, -1],
  47: ["lowerMolar2", 64, 1.00, 0.96, -1],
  46: ["lowerMolar1", 72, 1.10, 1.00, -1],
  45: ["premolar", 48, 0.98, 1.02, -1],
  44: ["premolar", 44, 0.92, 1.00, -1],
  43: ["canine", 42, 0.96, 1.12, -1],
  42: ["incisor", 35, 0.88, 0.94, -1],
  41: ["incisor", 32, 0.82, 0.92, -1],
  31: ["incisor", 32, 0.82, 0.92, 1],
  32: ["incisor", 35, 0.88, 0.94, 1],
  33: ["canine", 42, 0.96, 1.12, 1],
  34: ["premolar", 44, 0.92, 1.00, 1],
  35: ["premolar", 48, 0.98, 1.02, 1],
  36: ["lowerMolar1", 72, 1.10, 1.00, 1],
  37: ["lowerMolar2", 64, 1.00, 0.96, 1],
  38: ["lowerMolar2", 57, 0.88, 0.84, 1],
};

const upper = (fdi) => fdi < 30;
const r = (value) => Number(value.toFixed(1));

function crownPath(type, width, crownScale, mirror) {
  const cx = 60;
  const top = 35;
  const cej = 96;
  const left = cx - width / 2;
  const right = cx + width / 2;
  const neckWidth = width * (type.includes("Molar") ? 0.72 : 0.62);
  const neckL = cx - neckWidth / 2;
  const neckR = cx + neckWidth / 2;
  const skew = mirror * width * 0.025;
  let edge;

  if (type === "incisor") {
    edge =
      `M${r(left)} 40 ` +
      `Q${r(left + width * 0.16)} ${r(top + 1)} ${r(left + width * 0.33)} 39 ` +
      `Q${r(left + width * 0.5)} ${top} ${r(left + width * 0.66)} 39 ` +
      `Q${r(left + width * 0.84)} ${r(top + 1)} ${r(right)} 40`;
  } else if (type === "canine") {
    edge =
      `M${r(left)} 48 ` +
      `Q${r(left + width * 0.25)} 43 ${r(cx + skew)} ${r(top - 7 * crownScale)} ` +
      `Q${r(right - width * 0.22)} 42 ${r(right)} 48`;
  } else if (type === "premolar" || type === "upperPremolar1") {
    edge =
      `M${r(left)} 48 ` +
      `Q${r(left + width * 0.22)} 42 ${r(cx + skew)} ${r(top - 2 * crownScale)} ` +
      `Q${r(right - width * 0.2)} 42 ${r(right)} 48`;
  } else if (type === "upperMolar") {
    const split = cx + mirror * width * 0.04;
    edge =
      `M${r(left)} 50 ` +
      `Q${r(left + width * 0.16)} 37 ${r(left + width * 0.3)} 36 ` +
      `Q${r(left + width * 0.43)} 38 ${r(split)} 48 ` +
      `Q${r(right - width * 0.3)} 34 ${r(right - width * 0.16)} 38 ` +
      `Q${r(right - width * 0.05)} 42 ${r(right)} 50`;
  } else if (type === "lowerMolar1") {
    edge =
      `M${r(left)} 50 ` +
      `Q${r(left + width * 0.1)} 38 ${r(left + width * 0.2)} 37 ` +
      `Q${r(left + width * 0.3)} 39 ${r(left + width * 0.38)} 48 ` +
      `Q${r(left + width * 0.49)} 35 ${r(left + width * 0.59)} 37 ` +
      `Q${r(left + width * 0.7)} 39 ${r(left + width * 0.77)} 48 ` +
      `Q${r(right - width * 0.1)} 38 ${r(right)} 50`;
  } else {
    edge =
      `M${r(left)} 50 ` +
      `Q${r(left + width * 0.18)} 36 ${r(left + width * 0.35)} 37 ` +
      `Q${r(cx)} 39 ${r(left + width * 0.5)} 48 ` +
      `Q${r(right - width * 0.22)} 35 ${r(right - width * 0.08)} 41 ` +
      `Q${r(right - width * 0.02)} 45 ${r(right)} 50`;
  }

  return (
    edge +
    ` C${r(right + 1)} 68 ${r(neckR + 5)} 86 ${r(neckR)} ${cej}` +
    ` Q${cx} 101 ${r(neckL)} ${cej}` +
    ` C${r(neckL - 5)} 86 ${r(left - 1)} 68 ${r(left)} ${type === "incisor" ? 40 : type === "canine" || type.includes("premolar") || type === "upperPremolar1" ? 48 : 50} Z`
  );
}

function singleRoot(cx, width, length, curve = 0) {
  const y = 93;
  const left = cx - width / 2;
  const right = cx + width / 2;
  const apexX = cx + curve;
  const apexY = y + length;
  return (
    `M${r(left)} ${y} ` +
    `C${r(left + curve * 0.18)} ${r(y + length * 0.48)} ${r(apexX - width * 0.25)} ${r(apexY - width * 0.5)} ${r(apexX)} ${r(apexY)} ` +
    `C${r(apexX + width * 0.25)} ${r(apexY - width * 0.5)} ${r(right + curve * 0.18)} ${r(y + length * 0.48)} ${r(right)} ${y} Z`
  );
}

function joinedDoubleRoots(width, length, mirror, close = false) {
  const cx = 60;
  const y = 93;
  const half = width * 0.36;
  const outerL = cx - half;
  const outerR = cx + half;
  const forkY = y + length * 0.32;
  const gap = close ? width * 0.05 : width * 0.09;
  const leftApex = cx - width * (close ? 0.13 : 0.18) + mirror;
  const rightApex = cx + width * (close ? 0.13 : 0.18) + mirror;
  const apexY = y + length;
  return (
    `M${r(outerL)} ${y} ` +
    `C${r(outerL - 1)} ${r(y + length * 0.45)} ${r(leftApex - 6)} ${r(apexY - 12)} ${r(leftApex)} ${r(apexY)} ` +
    `C${r(leftApex + 6)} ${r(apexY - 12)} ${r(cx - gap)} ${r(forkY + 13)} ${cx} ${r(forkY)} ` +
    `C${r(cx + gap)} ${r(forkY + 13)} ${r(rightApex - 6)} ${r(apexY - 12)} ${r(rightApex)} ${r(apexY)} ` +
    `C${r(rightApex + 6)} ${r(apexY - 12)} ${r(outerR + 1)} ${r(y + length * 0.45)} ${r(outerR)} ${y} Z`
  );
}

function anatomy(type, width) {
  const left = 60 - width / 2;
  const right = 60 + width / 2;
  if (type === "incisor") {
    return `M${r(left + width * 0.25)} 43 Q${r(left + width * 0.28)} 62 ${r(left + width * 0.32)} 76 M${r(right - width * 0.25)} 43 Q${r(right - width * 0.28)} 62 ${r(right - width * 0.32)} 76`;
  }
  if (type === "canine" || type === "premolar" || type === "upperPremolar1") {
    return `M60 38 L60 76 M${r(left + width * 0.22)} 54 Q60 68 ${r(right - width * 0.22)} 54`;
  }
  if (type === "lowerMolar1") {
    return `M${r(left + width * 0.35)} 43 L${r(left + width * 0.35)} 76 M${r(left + width * 0.72)} 43 L${r(left + width * 0.72)} 76 M${r(left + 7)} 63 Q60 72 ${r(right - 7)} 63`;
  }
  return `M60 43 L60 76 M${r(left + 8)} 62 Q60 71 ${r(right - 8)} 62`;
}

function rootMarkup(fdi, type, width, rootScale, mirror) {
  const rootColor = "url(#root)";
  if (type === "upperMolar") {
    const palatal = singleRoot(60, width * 0.28, 118 * rootScale, mirror * 1.5);
    const buccal = joinedDoubleRoots(width, 98 * rootScale, mirror * 1.5, type === "upperMolar" && width < 60);
    return `<path class="root root-behind" d="${palatal}" fill="url(#rootDark)"/><path class="root" d="${buccal}" fill="${rootColor}"/>`;
  }
  if (type === "lowerMolar1" || type === "lowerMolar2" || type === "upperPremolar1") {
    const length = (type === "upperPremolar1" ? 108 : 112) * rootScale;
    return `<path class="root" d="${joinedDoubleRoots(width, length, mirror * 1.5, type === "lowerMolar2")}" fill="${rootColor}"/>`;
  }
  const baseLength = type === "canine" ? 138 : type === "incisor" ? 120 : 116;
  const rootWidth = Math.max(22, width * (type === "incisor" ? 0.54 : 0.58));
  return `<path class="root" d="${singleRoot(60, rootWidth, baseLength * rootScale, mirror * (type === "canine" ? 4 : 2))}" fill="${rootColor}"/>`;
}

function svgFor(fdi, config) {
  const [type, width, crownScale, rootScale, mirror] = config;
  const crown = crownPath(type, width, crownScale, mirror);
  const roots = rootMarkup(fdi, type, width, rootScale, mirror);
  const details = anatomy(type, width);
  const transform = upper(fdi) ? `translate(0 250) scale(1 -1)` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 250" role="img" aria-label="Zahn ${fdi}">
  <defs>
    <linearGradient id="enamel" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#fffdf4"/><stop offset=".52" stop-color="#f0dec1"/><stop offset="1" stop-color="#c79b69"/>
    </linearGradient>
    <linearGradient id="root" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#79513e"/><stop offset=".45" stop-color="#d5a074"/><stop offset="1" stop-color="#704637"/>
    </linearGradient>
    <linearGradient id="rootDark" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#54372c"/><stop offset=".5" stop-color="#a2714f"/><stop offset="1" stop-color="#4c3127"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-20%" width="170%" height="160%">
      <feDropShadow dx="1.5" dy="2.5" stdDeviation="1.7" flood-color="#342016" flood-opacity=".32"/>
    </filter>
  </defs>
  <g${transform ? ` transform="${transform}"` : ""} filter="url(#shadow)">
    <g class="tooth-roots">${roots}</g>
    <path class="tooth-crown" d="${crown}" fill="url(#enamel)" stroke="#5b3f30" stroke-width="1.6" stroke-linejoin="round"/>
    <path class="tooth-anatomy" d="${details}" fill="none" stroke="#7b5a43" stroke-width="1.15" stroke-linecap="round" opacity=".48"/>
    <path class="tooth-highlight" d="M${r(60 - width * 0.28)} 49 C${r(60 - width * 0.34)} 62 ${r(60 - width * 0.31)} 75 ${r(60 - width * 0.26)} 82" fill="none" stroke="#fffdf3" stroke-width="3.2" stroke-linecap="round" opacity=".56"/>
  </g>
</svg>
`;
}

for (const [fdi, config] of Object.entries(configs)) {
  fs.writeFileSync(path.join(outDir, `${fdi}.svg`), svgFor(Number(fdi), config), "utf8");
}

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), teeth: Object.keys(configs).map(Number) }, null, 2),
  "utf8",
);

console.log(`Generated ${Object.keys(configs).length} SVG teeth in ${outDir}`);
