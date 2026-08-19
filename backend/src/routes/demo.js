import { Router } from "express";
import { log } from "../log.js";
import { listAccounts } from "../mail/accounts.js";
import { sendMail } from "../mail/mailbox.js";
import { lisaSendSms, lisaStartCall } from "../lisa/outbound.js";
import { smsAbsenderAus, absenderSaeubern } from "../lisa/identitaet.js";
import {
  codeSenden, freischalten, ticketPruefen, kontingentNehmen, kontingentStand,
  behandlerVorschlag, uebergabeSpeichern, uebergabeHolen, petsasDevOeffnen,
  DEMO_MANDANT, KONTINGENT,
} from "../demo/tor.js";
import { geheimStimmt } from "../demo/wegwerfKonto.js";
import { standHolen, sitzungAnlegen, terminAnlegen, freieSlots } from "../demo/sandkalender.js";
import { demoClaraSession } from "../demo/claraToken.js";

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
const ONBOARDER_URL = (process.env.DEMO_ONBOARDER_URL || "https://pickadoc.ai/onboarder/index.html").trim();

function ip(req) {
  return String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
}

/** Absendername fuer die Praxis des Besuchers (SMS-Standard, 11 Zeichen). */
function absenderFuer(lead) {
  return absenderSaeubern(lead?.absender) || smsAbsenderAus(lead?.praxis) || absenderSaeubern(lead?.praxis) || "Pickadoc";
}

// --- Schritt 1: Konto anlegen, Token per E-Mail -----------------------------
router.post("/demo/code", async (req, res) => {
  try {
    const out = await codeSenden({ ...(req.body || {}), ip: ip(req) }, async ({ an, text }) => {
      try {
        const r = await lisaSendSms(DEMO_MANDANT, {
          phone: an,
          message: text,
          recipientName: "Demo",
          by: "demo-tor",
          absender: "Pickadoc",
        });
        return { ok: !!r?.ok, error: r?.message || "" };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
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

    // Wegwerf-Sandbox-Kalender fuer diese Sitzung anlegen (leer). Die sid ist die
    // harmlose Lead-Id — sie kann nur den Demo-Kalender lesen/schreiben, nie SMS
    // oder Anrufe ausloesen. Fehler halten die Freischaltung nicht auf.
    const sid = out.lead.id;
    sitzungAnlegen(sid, {
      praxis: out.lead.praxis,
      behandler: out.lead.behandler || behandlerVorschlag(out.lead),
    }).catch((e) => log.warn("demo.kalender.anlegen_fehlgeschlagen", { error: String(e?.message || e) }));

    res.json({
      ok: true,
      ticket: out.ticket,
      sid,
      clientId: out.lead.clientId || "",
      praxis: out.lead.praxis,
      website: out.lead.website || "",
      email: out.lead.email || "",
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
      sid: lead.id,
      clientId: lead.clientId || "",
      praxis: lead.praxis,
      website: lead.website || "",
      email: lead.email || "",
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

// --- Entwickler-Direktlink (nur Petsas, geheimes Kennwort) ------------------
router.post("/demo/dev", async (req, res) => {
  try {
    if (!geheimStimmt(req.body?.geheim)) {
      return res.status(401).json({ ok: false, fehler: "geheim", klartext: "Dieser Entwickler-Link gilt nicht." });
    }
    const out = await petsasDevOeffnen();
    if (!out.ok) return res.status(400).json({ ok: false, fehler: out.fehler, klartext: out.klartext });
    const sid = out.lead.id;
    sitzungAnlegen(sid, {
      praxis: out.lead.praxis,
      behandler: out.lead.behandler,
    }).catch(() => {});
    res.json({
      ok: true,
      ticket: out.ticket,
      sid,
      clientId: out.lead.clientId || "",
      praxis: out.lead.praxis,
      website: out.lead.website || "",
      email: out.lead.email || "",
      behandler: out.lead.behandler,
      absender: absenderFuer(out.lead),
      name: [out.lead.vorname, out.lead.name].filter(Boolean).join(" "),
      kontingent: kontingentStand(out.lead),
    });
  } catch (e) {
    log.warn("demo.dev.fehler", { error: String(e?.message || e) });
    res.status(400).json({ ok: false, fehler: "unbekannt", klartext: "Der Entwickler-Zugang hat gerade nicht geklappt." });
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

// --- Uebergabe Handy -> Praxis-PC: Zwischenstand sichern, Link per E-Mail ----
//
// Der Zahnarzt erlebt Film und Live-Demo am Handy. Die Einrichtung (Onboarder)
// gehoert an den Praxis-PC. Dieser Endpunkt sichert den Zwischenstand am Lead
// und mailt einen Wiederaufnahme-Link — am PC geoeffnet, geht es nahtlos
// weiter. Der Link traegt die Homepage mit, damit der Onboarder auch ohne
// MAS-Zugriff sofort vorausgefuellt startet.
router.post("/demo/uebergabe", async (req, res) => {
  try {
    const out = await uebergabeSpeichern(req.body || {});
    if (!out.ok) return res.status(400).json({ ok: false, fehler: out.fehler, klartext: out.klartext });

    const lead = out.lead;
    const link = ONBOARDER_URL
      + (ONBOARDER_URL.includes("?") ? "&" : "?")
      + "mode=wizard&resume=" + out.token
      + (lead.website ? "&ws=" + encodeURIComponent(lead.website) : "");

    // Der Versand darf die Antwort nicht aufhalten und nicht kippen: der
    // Besucher steht davor. Fehler werden geloggt, nicht durchgereicht.
    await uebergabeMailen(lead, link).catch((e) =>
      log.warn("demo.uebergabe.mail_fehlgeschlagen", { error: String(e?.message || e) }));

    res.json({ ok: true });
  } catch (e) {
    log.warn("demo.uebergabe.fehler", { error: String(e?.message || e) });
    res.status(400).json({ ok: false, fehler: "unbekannt", klartext: "Das hat gerade nicht geklappt. Bitte noch einmal." });
  }
});

// Wiederaufnahme-Stand am Praxis-PC abholen (fuer eine spaetere Onboarder-MAS-
// Anbindung; die Homepage im Link genuegt heute schon fuer den nahtlosen Start).
router.get("/demo/uebergabe", async (req, res) => {
  try {
    const stand = await uebergabeHolen(req.query?.token);
    if (!stand) return res.status(404).json({ ok: false, fehler: "token" });
    res.json({ ok: true, ...stand });
  } catch (e) {
    res.status(400).json({ ok: false, fehler: String(e?.message || e) });
  }
});

/** Wiederaufnahme-Link an die E-Mail des Besuchers. */
async function uebergabeMailen(lead, link) {
  const konten = await listAccounts(DEMO_MANDANT).catch(() => []);
  const konto = konten.find((k) => k.id) || null;
  if (!konto) {
    log.warn("demo.uebergabe.kein_mailkonto", { leadId: lead?.id });
    return;
  }
  const name = [lead.vorname, lead.name].filter(Boolean).join(" ") || lead.praxis || "";
  const zeilen = [
    name ? `Hallo ${name},` : "Hallo,",
    "",
    "hier ist Ihr Link, um die Pickadoc-Einrichtung am Praxis-Rechner fortzusetzen.",
    "Bitte öffnen Sie ihn auf dem großen Bildschirm in Ihrer Praxis — dort greift",
    "die Einrichtung in Kalender, Telefon und Kartei ein.",
    "",
    link,
    "",
    "Ihre bisherigen Angaben sind gespeichert; es geht nahtlos weiter.",
    "Der Link gilt eine Woche.",
  ];
  await sendMail(DEMO_MANDANT, konto.id, {
    to: [lead.email],
    subject: "Ihre Pickadoc-Einrichtung am Praxis-PC fortsetzen",
    text: zeilen.join("\n"),
  });
  log.info("demo.uebergabe.gemailt", { leadId: lead?.id, an: lead.email });
}

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
    `SMS-Abs.:  ${absenderFuer(lead)}`,
    `E-Mail:    ${lead.email}`,
    `Handy:     ${lead.handy}   (per E-Mail-Token bestätigt)`,
    `Beruf:     medizinisch, nur fiktive Patientendaten`,
    "",
    "Diese Person hat die Erlebnis-Demo interaktiv freigeschaltet — sie hat also",
    "nicht nur zugeschaut, sondern selbst angefasst. Lisa meldet sich in der Demo",
    `unter "${lead.praxis}", SMS gehen mit dem Absender "${absenderFuer(lead)}" raus.`,
  ];
  await sendMail(DEMO_MANDANT, konto.id, {
    to: [LEAD_MAIL_AN],
    subject: `Demo freigeschaltet: ${lead.praxis} (${[lead.vorname, lead.name].filter(Boolean).join(" ")})`,
    text: zeilen.join("\n"),
  });
  log.info("demo.lead.gemeldet", { leadId: lead?.id, an: LEAD_MAIL_AN });
}

// ============================================================================
// Sandbox-Kalender + reduzierte Demo-Tools (Chef 19.08.2026).
//
// DemoClara (die eigenstaendige Demo-Sprach-Kopie) bekommt bewusst NUR diese
// wenigen Werkzeuge an die Hand — sie zeigen/schreiben ausschliesslich den
// Wegwerf-Sandbox-Kalender dieser Sitzung, nie eine echte Praxis. Die "sid"
// ist die harmlose Lead-Id (kann keine SMS/Anrufe ausloesen), sie kommt aus
// dem LiveKit-Raumnamen bzw. dem Aufruf.
// ============================================================================

function sidAus(req) {
  const b = req.body || {};
  const q = req.query || {};
  const s = String(b.sid || b.clientId || q.sid || q.clientId || "").trim();
  // Firestore-Doc-Ids sind kurz und alphanumerisch — begrenzt Missbrauch.
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : "";
}

// Lokales LiveKit-Token fuer DemoClara (Browser -> lokaler SFU, NIE die Cloud
// der Telefon-Clara). Bewusst im Demo-Router, nicht im Clara-Router.
router.post("/demo/clara-session", async (req, res) => {
  try {
    let clientId = "";
    if (req.body?.ticket) {
      const lead = await ticketPruefen(req.body.ticket);
      if (lead) clientId = lead.clientId || "";
    }
    const s = await demoClaraSession({ pipeline: req.body?.pipeline, clientId });
    res.json({ ok: true, ...s });
  } catch (e) {
    log.warn("demo.clara-session.fehler", { error: String(e?.message || e) });
    res.status(400).json({ ok: false, fehler: "unbekannt", klartext: "Die Demo-Sprachsitzung ließ sich nicht starten." });
  }
});

// Voller Kalender fuer die Anzeige in der Demo (Frontend rendert die Liste).
router.post("/demo/kalender", async (req, res) => {
  try {
    const lead = await ticketPruefen(req.body?.ticket);
    if (!lead) return res.status(401).json({ ok: false, fehler: "ticket" });
    const stand = await standHolen(lead.id);
    res.json({ ok: true, ...stand });
  } catch (e) {
    res.status(400).json({ ok: false, fehler: String(e?.message || e) });
  }
});

// Tages-Ueberblick fuer DemoClara: leer oder Liste.
router.post("/demo/tools/tag-liste", async (req, res) => {
  try {
    const sid = sidAus(req);
    if (!sid) return res.json({ ok: false, spoken: "Die Demo-Sitzung ist nicht mehr aktiv." });
    const datum = String(req.body?.datum || req.query?.datum || "").trim();
    const stand = await standHolen(sid);
    const tag = datum ? stand.termine.filter((t) => t.datum === datum) : stand.termine;
    let spoken;
    if (!tag.length) {
      spoken = datum
        ? `Am ${datum} sind noch keine Termine eingetragen.`
        : "Der Kalender ist noch leer — es gibt noch keine Termine.";
    } else {
      const zeilen = tag
        .sort((a, b) => (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit))
        .map((t) => `${t.uhrzeit} ${t.patient}${t.grund ? " (" + t.grund + ")" : ""}`);
      spoken = `${tag.length} Termin${tag.length === 1 ? "" : "e"}: ${zeilen.join("; ")}.`;
    }
    res.json({ ok: true, spoken, termine: tag });
  } catch (e) {
    res.status(200).json({ ok: false, spoken: "Der Kalender ließ sich gerade nicht lesen." });
    log.warn("demo.tools.tag.fehler", { error: String(e?.message || e) });
  }
});

// Freie Zeiten fuer DemoClara.
router.post("/demo/tools/slots", async (req, res) => {
  try {
    const sid = sidAus(req);
    if (!sid) return res.json({ ok: false, spoken: "Die Demo-Sitzung ist nicht mehr aktiv." });
    const datum = String(req.body?.datum || req.query?.datum || "").trim();
    const stand = await standHolen(sid);
    const slots = freieSlots(datum, stand.termine);
    const spoken = slots.length
      ? `Am ${datum} sind frei: ${slots.slice(0, 8).join(", ")}.`
      : `Am ${datum} ist nichts frei — vielleicht ein Wochenende oder außerhalb der Sprechzeit.`;
    res.json({ ok: true, spoken, slots });
  } catch (e) {
    res.status(200).json({ ok: false, spoken: "Die freien Zeiten ließen sich gerade nicht ermitteln." });
    log.warn("demo.tools.slots.fehler", { error: String(e?.message || e) });
  }
});

// Termin im Sandbox-Kalender anlegen (DemoClara) — schreibt NIE eine echte Praxis.
router.post("/demo/tools/buchen", async (req, res) => {
  try {
    const sid = sidAus(req);
    if (!sid) return res.json({ ok: false, spoken: "Die Demo-Sitzung ist nicht mehr aktiv." });
    const b = req.body || {};
    const out = await terminAnlegen(sid, {
      patient: b.patient || b.patientName,
      datum: b.datum,
      uhrzeit: b.uhrzeit || b.zeit,
      grund: b.grund || b.visitMotiveName,
      behandler: b.behandler || b.doctorName,
      dauer: b.dauer,
    });
    if (!out.ok) return res.json({ ok: false, spoken: out.klartext || "Das hat gerade nicht geklappt." });
    res.json({ ok: true, spoken: out.spoken, termin: out.termin });
  } catch (e) {
    res.status(200).json({ ok: false, spoken: "Der Termin ließ sich gerade nicht eintragen." });
    log.warn("demo.tools.buchen.fehler", { error: String(e?.message || e) });
  }
});

export default router;
