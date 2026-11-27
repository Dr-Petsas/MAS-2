// Rueckrufer-Kontext fuer Bianca: keine Regieanweisung, neuester Anruf zuerst.
// Reine Funktionen, ohne Datenbank.
import test from "node:test";
import assert from "node:assert/strict";
import { kontextZeile, openCallerHits } from "../src/bianca/callerContext.js";
import { itemAus, ohneRegie } from "../src/brain/lisaAnrufe.js";
import { rahmeAuftrag } from "../src/lisa/outbound.js";
import { identitaetsRahmen } from "../src/lisa/identitaet.js";

const NUMMER = "+491776004600";
const TAG = 24 * 3_600_000;
const JETZT = Date.UTC(2026, 10, 27, 0, 40);

// Wortlaut eines Berichts der alten Lisa (Medical Center, 24.11.2026): der Auftrag samt angehaengter, abgeschnittener Anweisung.
const ALT = "Lisa hat Michael Petsas angerufen: Herr Petsas, Ihr Zahnersatz ist aus dem Labor. Sie können ihn ab morgen abholen. "
  + "[Regieanweisung, NICHT vorlesen und NICHT erwaehnen: Dieser Anruf hat nichts mit Terminen zu tun. S.";

function eintrag(id, ts, summary) {
  return { id, ts, status: "open", channel: "lisa_call", extractor: "telefonki@v1", summary, counterparty: { name: "Michael Petsas", ref: NUMMER } };
}

test("Regieanweisung steht weder im Text fuer Bianca noch in der Liste", () => {
  const e = eintrag("telefonki:lisa_outbound:alt", JETZT - 3 * TAG, ALT);
  const zeile = kontextZeile(e);
  assert.ok(zeile.includes("Ihr Zahnersatz ist aus dem Labor. Sie können ihn ab morgen abholen."), zeile);
  assert.ok(!zeile.includes("Regieanweisung") && !zeile.includes("NICHT vorlesen") && !zeile.includes("["), zeile);
  assert.ok(zeile.endsWith("(noch offen)"), zeile);
  const item = itemAus(e);
  assert.equal(item.grund, "Lisa hat Michael Petsas angerufen: Herr Petsas, Ihr Zahnersatz ist aus dem Labor. Sie können ihn ab morgen abholen.");
});

test("alles, was MAS an einen Auftrag haengt, faellt weg; anderer Text bleibt", () => {
  const nachricht = "Ihr Zahnersatz ist da.";
  assert.equal(ohneRegie(rahmeAuftrag(nachricht)), nachricht);
  const mitIdentitaet = nachricht + identitaetsRahmen({ praxisName: "Zahnarztpraxis Beispiel", behandler: "Dr. Beispiel" });
  assert.notEqual(mitIdentitaet, nachricht, "die Probe traegt wirklich einen Rahmen");
  assert.equal(ohneRegie(mitIdentitaet), nachricht);
  assert.equal(ohneRegie("Bitte um Rückruf [dringend] wegen der Rechnung."), "Bitte um Rückruf [dringend] wegen der Rechnung.");
  assert.equal(ohneRegie(""), "");
  assert.equal(ohneRegie(null), "");
});

test("der neueste Anruf der Praxis steht zuerst", () => {
  const events = [
    eintrag("mitte", JETZT - 2 * TAG, "Mitte"),
    eintrag("alt", JETZT - 3 * TAG, "Alt"),
    eintrag("neu", JETZT - 1_000, "Neu"),
  ];
  assert.deepEqual(openCallerHits(events, NUMMER).map((e) => e.id), ["neu", "mitte", "alt"]);
});
