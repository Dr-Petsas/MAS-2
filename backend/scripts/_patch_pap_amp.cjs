const fs = require("fs");
const p = "F:/MAS-2/backend/public/m/lena-01/perio.js";
let c = fs.readFileSync(p, "utf8");
const a =
  "      const xm = Math.round((L.x1 + R.x0) / 2);\n" +
  "      const HALF = 9, AMP = 5.6;\n" +
  "      const xa = Math.max(0, xm - HALF), xb = Math.min(CW - 1, xm + HALF);";
const b =
  "      const xm = Math.round((L.x1 + R.x0) / 2);\n" +
  "      const flankLoss = Math.max(\n" +
  '        edgeLossPx(L.fdi, "R"),\n' +
  '        edgeLossPx(R.fdi, "L"));\n' +
  "      const HALF = 9, AMP = 5.6 * papillaAmpScale(flankLoss);\n" +
  "      const xa = Math.max(0, xm - HALF), xb = Math.min(CW - 1, xm + HALF);";
if (!c.includes(a)) {
  console.error("block A missing");
  process.exit(1);
}
c = c.replace(a, b);
const a2 = "        if (papMask) papMask[x] = Math.max(papMask[x] || 0, prof);";
const b2 = "        if (papMask && AMP > 0.4) papMask[x] = Math.max(papMask[x] || 0, prof);";
const idx = c.indexOf(a2);
if (idx < 0) {
  console.error("papMask line missing");
  process.exit(1);
}
// Only the artificial-papilla block still has the unguarded line
c = c.slice(0, idx) + b2 + c.slice(idx + a2.length);
fs.writeFileSync(p, c);
console.log("OK");
