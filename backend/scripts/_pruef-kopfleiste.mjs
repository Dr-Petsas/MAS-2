/**
 * Sichtpruefung der Kopfleisten von Handy- und iPad-App.
 *
 * Anlass (10.08.2026): Der neue Knopf "Clara verbessern" lag auf dem Handy
 * genau auf dem Tour-Knopf — beide waren einzeln an dieselbe Ecke geheftet.
 * Ein Blick in den Quelltext haette das nicht gezeigt; deshalb wird hier mit
 * einem echten Browser bei mehreren Bildschirmbreiten NACHGEMESSEN, ob sich
 * irgendwelche Kopfzeilen-Elemente ueberlappen.
 *
 * Kein Teil von `npm test`: braucht einen laufenden Server und einen Browser.
 * Aufruf:  node scripts/_pruef-kopfleiste.mjs
 */
import { chromium } from "file:///F:/pickadoc-live-base/docgendaweb/node_modules/playwright/index.mjs";

const BASIS = process.env.MAS_BASE || "http://127.0.0.1:4000";
const BREITEN = [320, 360, 390, 430, 768, 1024];

const PRAXIS = process.env.MAS_TEST_CLIENT || "MEe4ZQHEzOPzLcexyhdT";

// Beide Apps schicken ein ungekoppeltes Geraet zur Kopplungsseite. Fuer die
// Messung wird deshalb eine Kopplung vorgetaeuscht — sonst pruefte man die
// Kopplungsseite statt der Kopfleiste (genau das ist beim ersten Anlauf
// passiert, und die Pruefung meldete faelschlich "in Ordnung").
const SEITEN = [
  {
    pfad: `/m/call.html?c=${PRAXIS}`, was: "Handy-App",
    auswahl: ".brand a, .brand img, .brand .word",
    speicher: { "clara.device.v1": { clientId: PRAXIS, deviceId: "pruef", deviceKey: "pruef", operatorName: "Prüflauf" } },
  },
  {
    pfad: `/m/ipad-app.html?c=${PRAXIS}`, was: "iPad-App",
    auswahl: "header > *",
    speicher: { "pickadoc.ipad.v1": { clientId: PRAXIS, deviceId: "pruef", deviceKey: "pruef", operatorName: "Prüflauf" } },
  },
];

function ueberlappt(a, b) {
  // Zwei Rechtecke ueberlappen nur, wenn sie sich in BEIDEN Achsen schneiden.
  // Ein Pixel Toleranz gegen Rundungen im Layout.
  return a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1
      && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
}

const browser = await chromium.launch();
let fehler = 0;

for (const seite of SEITEN) {
  for (const breite of BREITEN) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 780 } });
    const page = await ctx.newPage();
    try {
      await page.addInitScript((eintraege) => {
        for (const [k, v] of Object.entries(eintraege)) localStorage.setItem(k, JSON.stringify(v));
      }, seite.speicher || {});
      await page.goto(BASIS + seite.pfad, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(900);
      // Ehrlichkeit der Messung: Wurden wir weggeleitet, ist nichts geprueft.
      if (!page.url().includes(seite.pfad.split("?")[0])) {
        fehler++;
        console.log(`  NICHT GEPRUEFT ${seite.was} bei ${breite}px: weitergeleitet nach ${page.url()}`);
        await ctx.close();
        continue;
      }
      const kaesten = await page.$$eval(seite.auswahl, (els) =>
        els.filter((e) => e.offsetParent !== null || e.getBoundingClientRect().width > 0)
          .map((e) => {
            const r = e.getBoundingClientRect();
            return {
              name: (e.id || e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 24),
              x: r.x, y: r.y, w: r.width, h: r.height,
            };
          })
          .filter((k) => k.w > 0 && k.h > 0));

      const treffer = [];
      for (let i = 0; i < kaesten.length; i++) {
        for (let j = i + 1; j < kaesten.length; j++) {
          if (ueberlappt(kaesten[i], kaesten[j])) treffer.push(`${kaesten[i].name} / ${kaesten[j].name}`);
        }
      }
      if (!kaesten.length) {
        fehler++;
        console.log(`  NICHT GEPRUEFT ${seite.was} bei ${breite}px: keine Kopfzeilen-Elemente gefunden`);
      } else if (treffer.length) {
        fehler++;
        console.log(`  UEBERLAPPUNG  ${seite.was} bei ${breite}px: ${treffer.join(", ")}`);
      } else {
        console.log(`  ok            ${seite.was} bei ${breite}px (${kaesten.length} Elemente)`);
      }
    } catch (e) {
      fehler++;
      console.log(`  FEHLER        ${seite.was} bei ${breite}px: ${String(e?.message || e).split("\n")[0]}`);
    }
    await ctx.close();
  }
}

await browser.close();
console.log(fehler ? `\nERGEBNIS: ${fehler} Beanstandung(en)` : "\nERGEBNIS: keine Ueberlappung");
process.exit(fehler ? 1 : 0);
