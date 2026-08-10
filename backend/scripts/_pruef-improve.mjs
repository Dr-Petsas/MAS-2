/**
 * Durchlauf der Improve-Seite mit einem echten Browser.
 *
 * Zweck: ehrlich feststellen, was die Seite HEUTE kann — nicht was im
 * Quelltext steht. Geklickt wird wie ein Kunde: Art waehlen, Schwere waehlen,
 * melden, Ergebnis lesen. Fehler in der Browser-Konsole werden mitgeschrieben,
 * denn die sieht sonst niemand.
 *
 * Kein Teil von `npm test` (braucht Browser + laufenden Server).
 * Aufruf:  node scripts/_pruef-improve.mjs
 */
import { chromium } from "file:///F:/pickadoc-live-base/docgendaweb/node_modules/playwright/index.mjs";

const BASIS = process.env.MAS_BASE || "http://127.0.0.1:4000";
const PRAXIS = process.env.MAS_TEST_CLIENT || "MEe4ZQHEzOPzLcexyhdT";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();

const konsole = [];
page.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
page.on("pageerror", (e) => konsole.push("Absturz: " + e.message));

await page.goto(`${BASIS}/m/improve.html?client=${PRAXIS}&von=Pr%C3%BCflauf`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

console.log("1) Schritt 1 — Auswahl der Problemart");
const kacheln = await page.$$eval("#kacheln > *", (els) => els.map((e) => e.textContent.trim().split("\n")[0]));
console.log(`   ${kacheln.length} Kacheln: ${kacheln.join(" | ")}`);

console.log("\n2) Anhang (letztes Gespraech)");
console.log("   " + (await page.textContent("#anhang").catch(() => "—")).trim());

// Eine Art ohne Hoerprobe waehlen, damit der Durchlauf ohne Mikrofon klappt.
console.log("\n3) Durchklicken: 'Nichts passiert' -> stoerend -> melden");
const ziel = await page.$$eval("#kacheln > *", (els) =>
  els.findIndex((e) => /Nichts passiert/i.test(e.textContent)));
await page.$$(" #kacheln > *").then((els) => els[ziel >= 0 ? ziel : 0].click());
await page.waitForTimeout(400);
console.log("   Schritt 2 sichtbar: " + !(await page.getAttribute("#s2", "class")).includes("versteckt"));
await page.click('[data-schwere="stoerend"]');
await page.waitForTimeout(300);
console.log("   Schritt 3 sichtbar: " + !(await page.getAttribute("#s3", "class")).includes("versteckt"));

await page.fill("#text", "Prueflauf der Improve-Seite - bitte ignorieren.");
await page.click("#senden");
await page.waitForTimeout(6000);

console.log("\n4) Ergebnis — der angezeigte Lauf");
const schritte = await page.$$eval("#ergebnis .schritt, #ergebnis [class*='schritt']", (els) =>
  els.map((e) => e.textContent.replace(/\s+/g, " ").trim().slice(0, 150)));
if (!schritte.length) {
  const roh = (await page.textContent("#ergebnis")).replace(/\s+/g, " ").trim();
  console.log("   (keine Einzelschritte gefunden) Rohtext: " + roh.slice(0, 400));
} else {
  schritte.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
}

const fehlertext = (await page.textContent("#fehler").catch(() => "")).trim();
if (fehlertext) console.log("\n   FEHLERFELD: " + fehlertext);

console.log("\n5) Nachweis der Loesung — Knopf druecken und warten");
const knopf = await page.$("#ergebnis button:has-text('Jetzt nachprüfen')");
if (!knopf) {
  console.log("   KEIN Nachweis-Knopf vorhanden");
} else {
  await knopf.click();
  await page.waitForSelector(".vurteil", { timeout: 60000 }).catch(() => {});
  const zeilen = await page.$$eval(".vergleich", (els) =>
    els.map((e) => e.textContent.replace(/\s+/g, " ").trim().slice(0, 120)));
  zeilen.forEach((z) => console.log("   " + z));
  console.log("   URTEIL: " + (await page.textContent(".vurteil").catch(() => "—")).trim());
}

console.log("\n6) Verlauf — eigener Knopf, eigener Bildschirm");
const vKnopf = await page.$("#verlaufKnopf:not(.versteckt)");
if (!vKnopf) console.log("   KEIN Verlaufs-Knopf sichtbar");
else {
  console.log("   Knopf: " + (await page.textContent("#verlaufKnopf")).replace(/\s+/g, " ").trim());
  await vKnopf.click();
  await page.waitForTimeout(1200);
  // Melden und Nachschauen duerfen sich nie denselben Bildschirm teilen.
  const meldeteilSichtbar = await page.$eval("#s1", (e) => e.style.display !== "none");
  console.log("   Meldeteil ausgeblendet: " + !meldeteilSichtbar);
  console.log("   " + ((await page.textContent("#verlaufSub")) || "").trim());
  const leer = await page.$(".mleer");
  if (leer) console.log("   Leerzustand: " + (await leer.textContent()).replace(/\s+/g, " ").trim());
  const eintraege = await page.$$eval(".meldung", (els) => els.map((e) => ({
    kopf: (e.querySelector(".mtitel") || {}).textContent || "",
    // Genau das ist das Bild: vier Halte, davon so viele hell, wie erreicht sind.
    halte: Array.from(e.querySelectorAll(".halt")).map((h) =>
      ((h.querySelector(".hname") || {}).textContent || "")
      + (h.className.includes("an") ? " [erreicht]" : h.className.includes("laeuft") ? " [laeuft]" : " [offen]")),
    vergleich: Array.from(e.querySelectorAll(".gseite")).map((g) => g.textContent.replace(/\s+/g, " ").trim()),
  })));
  eintraege.slice(0, 4).forEach((e) => {
    console.log("   • " + e.kopf + ": " + e.halte.join(" > "));
    if (e.vergleich.length) console.log("     Bild: " + e.vergleich.join("  ->  "));
  });
  const bilder = eintraege.filter((e) => e.vergleich.length).length;
  console.log("   Eintraege gesamt: " + eintraege.length + ", davon mit Vorher/Nachher-Bild: " + bilder);
}

console.log("\n7) Browser-Konsole");
console.log(konsole.length ? konsole.map((k) => "   " + k.slice(0, 200)).join("\n") : "   keine Fehler");

await browser.close();
