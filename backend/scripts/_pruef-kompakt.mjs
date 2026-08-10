/**
 * Passt die Improve-Seite ohne Blaettern auf ein Handy?
 *
 * Anlass: "Die improve Page sollte etwas kompakter sein man muss scrollen das
 * ist doof und sieht nicht nach App aus" (Chef, 10.08.2026). Eine Behauptung
 * wie "jetzt passt es" ist wertlos, wenn sie niemand nachgemessen hat -- also
 * wird jeder Schritt auf drei Geraetegroessen vermessen. Massgeblich ist das
 * KLEINSTE Geraet: Wo ein iPhone SE nicht rollen muss, rollt keines.
 *
 * Kein Teil von `npm test` (braucht Browser + laufenden Server).
 * Aufruf:  node scripts/_pruef-kompakt.mjs
 */
import { chromium } from "file:///F:/pickadoc-live-base/docgendaweb/node_modules/playwright/index.mjs";

const BASIS = process.env.MAS_BASE || "http://127.0.0.1:4000";
const PRAXIS = process.env.MAS_TEST_CLIENT || "MEe4ZQHEzOPzLcexyhdT";

const GERAETE = [
  ["iPhone SE", 375, 667],
  ["iPhone 15", 393, 852],
  ["iPhone Max", 430, 932],
  ["iPad", 834, 1112],
];

const browser = await chromium.launch();
let schlecht = 0;

for (const [name, breite, hoehe] of GERAETE) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") fehler.push(m.text()); });

  await page.goto(`${BASIS}/m/improve.html?client=${PRAXIS}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Gemessen wird zweierlei: ob die SEITE rollt (darf nie) und ob die Buehne
  // ueberlaeuft (soll nicht) -- samt Anzahl der fehlenden Pixel, damit man
  // sieht, wie knapp es ist.
  const messe = () => page.evaluate(() => {
    const b = document.getElementById("buehne");
    return {
      seite: document.documentElement.scrollHeight > window.innerHeight + 1,
      ueber: Math.max(0, b.scrollHeight - b.clientHeight),
    };
  });

  const bild = async (nr) => {
    if (name === "iPhone SE") await page.screenshot({ path: `.run/kompakt-se-${nr}.png` });
  };

  const schritte = [];
  schritte.push(["Was ist passiert", await messe()]);
  await bild(1);
  await page.click("#kacheln > *:nth-child(1)");
  await page.waitForTimeout(400);
  schritte.push(["Wie schlimm", await messe()]);
  await bild(2);
  await page.click('[data-schwere="stoerend"]');
  await page.waitForTimeout(400);
  schritte.push(["Ein Satz", await messe()]);
  await bild(3);

  const teile = schritte.map(([wie, m]) => {
    if (m.seite || m.ueber > 0) schlecht++;
    return `${wie}: ${m.seite ? "SEITE ROLLT" : (m.ueber > 0 ? `${m.ueber}px zu viel` : "passt")}`;
  });
  console.log(`${name.padEnd(11)} ${breite}x${hoehe}  ${teile.join(" | ")}`
    + (fehler.length ? `  FEHLER: ${fehler[0].slice(0, 90)}` : ""));

  await ctx.close();
}

await browser.close();
console.log(schlecht === 0
  ? "\nAlles passt ohne Blaettern."
  : `\n${schlecht} Ansicht(en) muessen noch gerollt werden.`);
process.exit(schlecht === 0 ? 0 : 1);
