#!/usr/bin/env node
/**
 * Haengt HKPs, die vor der Befund-Datei angelegt wurden, ihre Befund-Datei (KZBV-Kuerzel) an –
 * gebaut aus dem gespeicherten Plan, genau wie beim Anlegen durch Clara.
 *
 *   node scripts/hkp-befund-nachtragen.mjs              # nur anzeigen
 *   node scripts/hkp-befund-nachtragen.mjs --schreiben  # anhaengen
 *   --client <id>  Mandant (Standard: PLANR_HKP_CLIENT_ID bzw. DEFAULT_CLIENT_ID)
 */
import "dotenv/config";
import * as E from "../src/vendor/hkp-engine.mjs";
import { DEFAULT_CLIENT_ID } from "../src/routes/_shared.js";
import { befundDateiBauen } from "../src/routes/hkp.js";
import { hkpDateiAnhaengen, hkpListe } from "../src/hkp/store.js";

const args = process.argv.slice(2);
const schreiben = args.includes("--schreiben");
const ci = args.indexOf("--client");
const clientId = String((ci >= 0 && args[ci + 1]) || process.env.PLANR_HKP_CLIENT_ID || DEFAULT_CLIENT_ID).trim();

const alle = await hkpListe(clientId, { limit: 1000 });
let neu = 0;
for (const h of alle) {
  if (h.status === "verworfen" || (h.dateien || []).some((d) => d.art === "befund")) continue;
  let plan;
  try {
    plan = JSON.parse(h.planJson || "null");
  } catch {
    plan = null;
  }
  if (!plan?.zaehne) {
    console.log(`${h.id}: kein Plan gespeichert – uebersprungen`);
    continue;
  }
  const quelle = h.befundQuelle?.art ? h.befundQuelle : { art: h.erstelltVon === "clara" ? "auftrag" : "planr" };
  const datei = befundDateiBauen(h.id, {
    befund: { quelle },
    befundDiktat: E.befundAusAuftrag(String(h.auftragText || "")),
    auftrag: h.auftrag || { kiefer: h.kiefer },
    r: { plan },
  });
  if (!datei) {
    console.log(`${h.id}: Befund-Datei abgeschaltet (MAS_HKP_BEFUND_DATEI=0)`);
    continue;
  }
  const inhalt = JSON.parse(datei.inhalt);
  console.log(`${h.id}: ${datei.name} – Quelle ${inhalt.quelle.art}, ${inhalt.zaehne.length} Zaehne mit Befund${schreiben ? "" : " (nur Anzeige)"}`);
  if (schreiben) await hkpDateiAnhaengen(clientId, h.id, datei);
  neu++;
}
console.log(`${neu} HKP${neu === 1 ? "" : "s"} ${schreiben ? "nachgetragen" : "wuerden nachgetragen"}.`);
process.exit(0);
