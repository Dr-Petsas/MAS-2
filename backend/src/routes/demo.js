import { Router } from "express";
import { log } from "../log.js";
import { listAccounts } from "../mail/accounts.js";
import { sendMail } from "../mail/mailbox.js";
import { lisaSendSms, lisaStartCall } from "../lisa/outbound.js";
import { smsAbsenderAus, absenderSaeubern } from "../lisa/identitaet.js";
import {
  codeSenden, freischalten, ticketPruefen, kontingentNehmen, kontingentStand,
  behandlerVorschlag, DEMO_MANDANT, KONTINGENT,
} from "../demo/tor.js";

// ============================================================================
// Erlebnis-Demo: der interaktive Weg (Chef 18.08.2026).
//
// Diese Routen sind OEFFENTLICH (keine Anmeldung — genau das ist der Sinn: der
// Interessent soll nichts installieren und sich nirgends anmelden muessen).
// Jede Route bewacht sich deshalb selbst; die Riegel sind in demo/tor.js
// beschrieben. Der wichtigste in einem Satz:
//
//   SMS und Anruf gehen ausschliesslich an die per Code bestaetigte Nummer aus
//   dem Ticket — niemals an eine Nummer aus dem Aufruf.
//
// Damit ist die Demo kein Werkzeug, um Dritte zu belaestigen, auch wenn jemand
// die Endpunkte direkt anspricht.
//
// Und der Grund, warum es diese Routen ueberhaupt gibt (Chef woertlich): "lisa
// muss sich von der richtigen praxis unter dem richtigen doktor melden, die sms
// brauchen den praxisnamen als absender." Praxis, Behandler und Absender kommen
// aus dem Lead — dem, was der Besucher selbst eingetragen hat.
// ============================================================================

const router = Router();

const LEAD_MAIL_AN = (process.env.DEMO_LEAD_MAIL || "info@pickadoc.de").trim();

function ip(req) {
  return String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
}

/** Absendername fuer die Praxis des Besuchers (SMS-Standard, 11 Zeichen). */
function absenderFuer(lead) {
  return smsAbsenderAus(lead?.praxis) || absenderSaeubern(lead?.praxis) || "Pickadoc";
}

// --- Schritt 1: Code aufs Handy ---------------------------------------------
router.post("/demo/code", async (req, res) => {
  try {
    const out = await codeSenden({ ...(req.body || {}), ip: ip(req) }, async ({ an, text, absender }) => {
      // Dieser eine Versand kommt von UNS, nicht von der Praxis: Absender
      // "Pickadoc" ist hier richtig — der Besucher erwartet uns, nicht sich selbst.
      const r = await lisaSendSms(DEMO_MANDANT, {
        phone: an, message: text, recipientName: "Demo-Interessent",
        by: "Erlebnis-Demo", absender,
      });
      return { ok: !!r?.ok, error: r?.message };
    });
    if (!out.ok) return res.status(400).json({ ok: false, fehler: out.fehler, klartext: out.klartext });
    res.json({ ok: true, leadId: out.leadId });
  } catch (e) {
    log.warn("demo.code.fehler", { error: String(e?.message || e) });
    res.status(400).json({ ok: false, fehler: "unbekannt", klartext: "Das hat gerade nicht geklappt. Bitte noch einmal." });
  }
});

// --- Schritt 2: Code eingeben, Tor auf --------------------------------------
router.post("/demo/freischalten", async (req, res) => {
  try {
    const out = await freischalten(req.body || {});
    if (!out.ok) return res.status(400).json({ ok: false, fehler: out.fehler, klartext: out.klartext });

    // Meldung an Pickadoc — der eigentliche Zweck des Tors. Fehlschlaege duerfen
    // die Freischaltung NICHT aufhalten: der Besucher steht davor und wartet.
    leadMelden(out.lead).catch((e) => log.warn("demo.lead.mail_fehlgeschlagen", { error: String(e?.message || e) }));

    res.json({
      ok: true,
      ticket: out.ticket,
      praxis: out.lead.praxis,
      behandler: out.lead.behandler || behandlerVorschlag(out.lead),
      absender: absenderFuer(out.lead),
      name: [out.lead.vorname, out.lead.name].filter(Boolean).join(" "),
      kontingent: kontingentStand(out.lead),
    });
  } catch (e) {
    log.warn("demo.freischalten.fehler", { error: String(e?.message || e) });
    res.status(400).json({ ok: false, fehler: "unbekannt", klartext: "Das hat gerade nicht geklappt. Bitte noch einmal." });
  }
});

// --- Stand des Tickets (Neuladen der Seite) ---------------------------------
router.post("/demo/stand", async (req, res) => {
  try {
    const lead = await ticketPruefen(req.body?.ticket);
    if (!lead) return res.status(401).json({ ok: false, fehler: "ticket" });
    res.json({
      ok: true,
      praxis: lead.praxis,
      behandler: lead.behandler || behandlerVorschlag(lead),
      absender: absenderFuer(lead),
      name: [lead.vorname, lead.name].filter(Boolean).join(" "),
      kontingent: kontingentStand(lead),
      grenzen: KONTINGENT,
    });
  } catch (e) {
    res.status(400).json({ ok: false, fehler: String(e?.message || e) });
  }
});

// --- SMS aus der Sandbox: Absender ist die Praxis des Besuchers -------------
router.post("/demo/sms", async (req, res) => {
  try {
    const lead = await ticketPruefen(req.body?.ticket);
    if (!lead) return res.status(401).json({ ok: false, fehler: "ticket", klartext: "Bitte die Demo neu freischalten." });

    const nehmen = await kontingentNehmen(lead, "sms");
    if (!nehmen.ok) return res.status(429).json({ ok: false, fehler: nehmen.fehler, klartext: nehmen.klartext });

    const absender = absenderFuer(lead);
    const text = String(req.body?.text || "").trim().slice(0, 400)
      || `Guten Tag, hier ist ${lead.praxis}. Ihr Termin am Dienstag um 14:00 Uhr ist bestätigt. Bis dahin!`;

    const r = await lisaSendSms(DEMO_MANDANT, {
      phone: lead.handy,          // NUR die bestaetigte Nummer
      message: text,
      recipientName: lead.name,
      by: "Erlebnis-Demo",
      absender,
    });
    if (!r?.ok) return res.status(502).json({ ok: false, fehler: "versand", klartext: "Die SMS ging nicht raus. Kontingent ist dir erhalten." });

    res.json({ ok: true, absender, text, kontingent: { ...kontingentStand(lead), sms: nehmen.rest } });
  } catch (e) {
    log.warn("demo.sms.fehler", { error: String(e?.message || e) });
    res.status(400).json({ ok: false, fehler: "unbekannt" });
  }
});

// --- Lisa ruft an: richtige Praxis, richtiger Behandler ---------------------
router.post("/demo/anruf", async (req, res) => {
  try {
    const lead = await ticketPruefen(req.body?.ticket);
    if (!lead) return res.status(401).json({ ok: false, fehler: "ticket", klartext: "Bitte die Demo neu freischalten." });

    const nehmen = await kontingentNehmen(lead, "anruf");
    if (!nehmen.ok) return res.status(429).json({ ok: false, fehler: nehmen.fehler, klartext: nehmen.klartext });

    const behandler = lead.behandler || behandlerVorschlag(lead);
    const anlass = String(req.body?.auftrag || "").trim().slice(0, 600);
    const auftrag = anlass || [
      `Rufe ${[lead.vorname, lead.name].filter(Boolean).join(" ")} an und erinnere freundlich an die`,
      `Kontrolle, die laut Erinnerungssystem fällig ist. Biete an, gleich einen Termin`,
      `zu finden. Wenn die Person fragt, worum es geht: es ist eine Vorführung von`,
      `Pickadoc, die sie selbst gestartet hat.`,
    ].join(" ");

    const r = await lisaStartCall(DEMO_MANDANT, {
      phone: lead.handy,          // NUR die bestaetigte Nummer
      instruction: auftrag,
      contactName: [lead.vorname, lead.name].filter(Boolean).join(" ") || lead.name,
      by: "Erlebnis-Demo",
      // Die Identitaet ist der ganze Punkt: Lisa meldet sich als DIESE Praxis
      // unter DIESEM Behandler — nicht als die Praxis aus ihrem Agenten-Prompt.
      identitaet: { praxisName: lead.praxis, behandler },
      // Der Besucher hat den Anruf gerade selbst ausgeloest und wartet darauf.
      sofort: true,
    });
    if (!r?.ok) {
      return res.status(502).json({ ok: false, fehler: "anruf", klartext: r?.message || "Der Anruf ließ sich nicht starten." });
    }

    res.json({
      ok: true, praxis: lead.praxis, behandler, auftrag,
      kontingent: { ...kontingentStand(lead), anrufe: nehmen.rest },
    });
  } catch (e) {
    log.warn("demo.anruf.fehler", { error: String(e?.message || e) });
    res.status(400).json({ ok: false, fehler: "unbekannt" });
  }
});

/** Lead-Meldung an Pickadoc (Nadine-Postfach). */
async function leadMelden(lead) {
  const konten = await listAccounts(DEMO_MANDANT).catch(() => []);
  const konto = konten.find((k) => k.id) || null;
  if (!konto) {
    log.warn("demo.lead.kein_mailkonto", { leadId: lead?.id });
    return;
  }
  const zeilen = [
    `Name:      ${[lead.vorname, lead.name].filter(Boolean).join(" ")}`,
    `Praxis:    ${lead.praxis}`,
    `Behandler: ${lead.behandler || "-"}`,
    `Website:   ${lead.website || "-"}`,
    `E-Mail:    ${lead.email}`,
    `Handy:     ${lead.handy}   (per SMS-Code bestätigt)`,
    "",
    "Diese Person hat die Erlebnis-Demo interaktiv freigeschaltet — sie hat also",
    "nicht nur zugeschaut, sondern selbst angefasst. Lisa meldet sich in der Demo",
    `unter "${lead.praxis}", SMS gehen mit dem Absender "${smsAbsenderAus(lead.praxis) || "Pickadoc"}" raus.`,
  ];
  await sendMail(DEMO_MANDANT, konto.id, {
    to: [LEAD_MAIL_AN],
    subject: `Demo freigeschaltet: ${lead.praxis} (${[lead.vorname, lead.name].filter(Boolean).join(" ")})`,
    text: zeilen.join("\n"),
  });
  log.info("demo.lead.gemeldet", { leadId: lead?.id, an: LEAD_MAIL_AN });
}

export default router;
