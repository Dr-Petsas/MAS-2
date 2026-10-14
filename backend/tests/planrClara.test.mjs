// HKP-Clara fuer PlanR-Standalone (12.10.2026): Zugang, Werkzeug-Sperre, Sitzungsprofil, Ruf-Name.
// Start: node backend/tests/planrClara.test.mjs  (ohne Firestore, Billing wird untergeschoben)
import assert from "node:assert/strict";
const P = await import("../src/hkp/planrClara.js");

let ok = 0;
async function t(name, fn) { await fn(); ok += 1; console.log("  ok -", name); }

const BILLING = {
  meddent: null,
  mas: { subscriptions: { crew: { tier: "premium" }, planr: { enabled: true, sprachsteuerung: true } } },
  planrSprache: { subscriptions: { planr: { enabled: true, sprachsteuerung: true } } },
  planrOhne: { subscriptions: { planr: { enabled: true } } },
};
P._setBillingLaden(async (id) => {
  if (id === "kaputt") throw new Error("firestore weg");
  return BILLING[id] ?? null;
});

function aufruf(mw, pfad, clientId) {
  return new Promise((resolve) => {
    const req = { path: pfad, query: { clientId } };
    const res = { json: (body) => resolve({ gesperrt: true, body }) };
    mw(req, res, () => resolve({ gesperrt: false }));
  });
}
const mw = P.planrClaraSperre((req) => req.query.clientId);

await t("Zugang je Buchung", () => {
  assert.equal(P.claraZugang(null), "unberuehrt");
  assert.equal(P.claraZugang(BILLING.mas), "unberuehrt");
  assert.equal(P.claraZugang(BILLING.planrSprache), "planr");
  assert.equal(P.claraZugang(BILLING.planrOhne), "gesperrt");
});

await t("MAS und Praxen ohne Billing: nichts gesperrt", async () => {
  for (const id of ["meddent", "mas", "unbekannt"]) {
    for (const pfad of ["/tools/send-sms", "/tools/day-briefing", "/clara/team/ask", "/tools/hkp-overview"]) {
      assert.equal((await aufruf(mw, pfad, id)).gesperrt, false, `${id} ${pfad}`);
    }
  }
});

await t("PlanR mit Sprachsteuerung: nur Suche, HKP, Rueckgaengig", async () => {
  for (const pfad of ["/tools/search-patient", "/tools/hkp-create-draft", "/tools/hkp-overview", "/tools/hkp-position-change", "/tools/undo-last"]) {
    assert.equal((await aufruf(mw, pfad, "planrSprache")).gesperrt, false, pfad);
  }
  for (const pfad of ["/tools/send-sms", "/tools/day-briefing", "/tools/find-slots", "/tools/compose-email", "/clara/team/ask", "/tools/search-patient-x"]) {
    const r = await aufruf(mw, pfad, "planrSprache");
    assert.equal(r.gesperrt, true, pfad);
    assert.equal(r.body.message, P.SPERRSATZ);
    assert.equal(r.body.ok, false);
  }
  assert.equal((await aufruf(mw, "/planr/hkp", "planrSprache")).gesperrt, false, "PlanR-Routen nie betroffen");
});

await t("PlanR ohne Sprachsteuerung: alle Werkzeuge zu", async () => {
  const r = await aufruf(mw, "/tools/hkp-overview", "planrOhne");
  assert.equal(r.gesperrt, true);
  assert.equal(r.body.message, P.NICHT_GEBUCHT);
});

await t("Sperrsatz nennt keinen Namen (Ruf-Name frei waehlbar)", () => {
  assert.doesNotMatch(P.SPERRSATZ, /Clara/);
  assert.match(P.SPERRSATZ, /Pickadoc MAS/);
});

await t("Sitzung: Profil erzwungen bzw. gesperrt", async () => {
  assert.deepEqual(await P.sitzungsProfil("meddent", "clara_meddent"), { profileId: "clara_meddent" });
  assert.deepEqual(await P.sitzungsProfil("mas", "clara_praxis2"), { profileId: "clara_praxis2" });
  assert.equal((await P.sitzungsProfil("planrSprache", "clara_meddent")).profileId, "clara_planr");
  assert.equal((await P.sitzungsProfil("planrOhne", "clara_meddent")).gesperrt, true);
});

await t("Billing-Fehler: offen (nie einen MAS-Kunden aussperren)", async () => {
  assert.equal(await P.claraZugangFuer("kaputt"), "unberuehrt");
  assert.equal((await aufruf(mw, "/tools/send-sms", "kaputt")).gesperrt, false);
});

await t("Notaus MAS_PLANR_SPERRE=0", async () => {
  process.env.MAS_PLANR_SPERRE = "0";
  try {
    assert.equal((await aufruf(mw, "/tools/send-sms", "planrSprache")).gesperrt, false);
    assert.deepEqual(await P.sitzungsProfil("planrSprache", "clara_meddent"), { profileId: "clara_meddent" });
  } finally {
    delete process.env.MAS_PLANR_SPERRE;
  }
});

await t("Ruf-Name: ein Wort, 3-20 Buchstaben", () => {
  assert.deepEqual(P.rufnameSaeubern("  mia "), { ok: true, name: "Mia" });
  assert.deepEqual(P.rufnameSaeubern("Anna-Lena"), { ok: true, name: "Anna-Lena" });
  assert.deepEqual(P.rufnameSaeubern("Jürgen"), { ok: true, name: "Jürgen" });
  assert.deepEqual(P.rufnameSaeubern(""), { ok: true, name: "" });
  assert.deepEqual(P.rufnameSaeubern("EVA"), { ok: true, name: "Eva" });
  assert.deepEqual(P.rufnameSaeubern("ANNA-LENA"), { ok: true, name: "Anna-Lena" });
  assert.deepEqual(P.rufnameSaeubern("McKenzie"), { ok: true, name: "McKenzie" });
  for (const schlecht of ["Al", "Frau Holle", "R2D2", "<script>", "x".repeat(21)]) {
    assert.equal(P.rufnameSaeubern(schlecht).ok, false, schlecht);
  }
});

P._setBillingLaden(null);
console.log(`planrClara: ${ok} Pruefungen gruen`);
