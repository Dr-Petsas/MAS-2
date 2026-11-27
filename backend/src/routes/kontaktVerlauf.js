// Kontaktverlauf: was aus jedem Kontaktversuch aus Luecke fuellen, Kampagne und Recall geworden ist
// (Kontakt, Termin, Einhaltung). Ein Eintrag je Versuch im Praxisgedaechtnis, eine Auskunft fuer die
// Clara-Seite und den Monitor des Campaigners. Vertrag: internal/kontakt-verlauf-schnittstelle.md.
import express from "express";
import { assertAppEnabled } from "../entitlements.js";
import { auskunft, speichereReaktion, speichereSendung } from "../brain/kontaktVerlauf.js";
import { nurMitSchluessel } from "../brain/kontaktVerlaufZugang.js";
import { resolveClientId } from "./_shared.js";

const router = express.Router();

function annahme(speichern) {
  return async (req, res) => {
    try {
      const clientId = resolveClientId(req);
      if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
      const out = await speichern(clientId, req.body || {});
      if (!out.ok) return res.status(400).json(out);
      res.status(out.neu && !out.trocken ? 201 : 200).json({ clientId, ...out });
    } catch (e) {
      res.status(400).json({ ok: false, grund: "fehler", klartext: String(e?.message || e) });
    }
  };
}

// Beide Meldepfade nehmen nur mit dem eigenen Schluessel an (kontaktVerlaufZugang.js), auch im Trockenlauf.

// Die Plattform meldet jede SMS und E-Mail aus Luecke fuellen und Kampagne.
router.post("/brain/kontakt-verlauf/sendung", nurMitSchluessel, annahme(speichereSendung));

// Die Plattform meldet eine Reaktion: Link geoeffnet, Antwort, Buchung ueber die Buchungsseite.
router.post("/brain/kontakt-verlauf/reaktion", nurMitSchluessel, annahme(speichereReaktion));

// Eintraege und Zahlen (kontaktiert, erreicht, Termin, eingehalten), je Quelle getrennt.
router.get("/brain/kontakt-verlauf", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json(await auskunft(clientId, req.query || {}));
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

export default router;