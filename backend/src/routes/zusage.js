// Oeffentliche Online-Zusage-Seite fuer Recall-SMS (Chef 28.07.2026):
// Patient bekommt per SMS einen Link /z/<clientId>/<token>, sieht das
// Terminangebot und sagt mit EINEM Tipp zu oder ab. Die erste Zusage bucht
// den Slot fest (slotClaim.acceptClaim, Transaktion — erste gewinnt), alle
// spaeteren sehen "schon vergeben".
//
// Sicherheit: Der Token IST das Ticket (96 Bit Zufall, ein Kandidat, ein
// Slot, Ablauf mit Slot-Beginn) — gleiches Modell wie die QR-Landing- und
// Companion-Seiten. Die Seite zeigt nur, was schon in der SMS stand
// (Name, Praxis, Anlass, Terminzeit). Kein Login, keine Patientenakte.

import express from "express";
import { loadClaim, acceptClaim, declineClaim } from "../clara/slotClaim.js";
import { masCollection } from "../tenant.js";
import { CASE_STATUS } from "../brain/cases.js";
import { log } from "../log.js";

const router = express.Router();
// Die Antwort kommt als klassisches HTML-Formular (kein JS noetig).
router.use("/z", express.urlencoded({ extended: false }));

const TZ = "Europe/Berlin";

function esc(v) {
  return String(v == null ? "" : v)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function dateDe(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(d);
}

function page({ title, body, praxis }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
         background: #f2f6f9; color: #16323f; }
  .wrap { max-width: 430px; margin: 0 auto; padding: 20px 16px 40px; }
  .brand { font-size: 15px; color: #4d6a77; margin: 10px 2px 14px; }
  .card { background: #fff; border-radius: 16px; padding: 22px 20px;
          box-shadow: 0 2px 14px rgba(22, 50, 63, .08); }
  h1 { font-size: 21px; margin: 0 0 10px; }
  p { line-height: 1.5; margin: 10px 0; }
  .slot { background: #eef6f3; border-radius: 12px; padding: 14px 16px;
          margin: 16px 0; font-size: 17px; }
  .slot b { display: block; font-size: 19px; margin-bottom: 2px; }
  .muted { color: #5c7683; font-size: 14px; }
  form { margin: 18px 0 0; }
  button { display: block; width: 100%; border: 0; border-radius: 12px;
           padding: 15px; font-size: 17px; font-weight: 600; cursor: pointer; }
  .ja { background: #1d7a55; color: #fff; }
  .nein { background: #eef1f3; color: #435862; margin-top: 10px; font-weight: 500; }
  .ok { color: #1d7a55; }
  .warn { color: #a05215; }
  .tel { display: inline-block; margin-top: 6px; font-weight: 600; color: #16323f; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">${esc(praxis || "Ihre Praxis")}</div>
  <div class="card">${body}</div>
</div>
</body>
</html>`;
}

function telZeile(claim) {
  const tel = String(claim?.practicePhone || "").trim();
  if (!tel) return "";
  return `<p class="muted">Fragen? Rufen Sie uns gern an:<br>
    <a class="tel" href="tel:${esc(tel.replace(/[^+\d]/g, ""))}">${esc(tel)}</a></p>`;
}

function slotBlock(claim) {
  const anlass = claim.topicLabel || claim.visitMotiveName;
  return `<div class="slot">
    <b>${esc(dateDe(claim.date))}</b>
    um ${esc(claim.timeLabel)} Uhr${claim.calendarName ? ` &middot; ${esc(claim.calendarName)}` : ""}
    ${anlass ? `<div class="muted">Anlass: ${esc(anlass)}</div>` : ""}
  </div>`;
}

function render(state, claim) {
  const praxis = claim?.practiceName || "";
  if (state === "unknown" || !claim) {
    return page({
      title: "Link nicht gefunden", praxis,
      body: `<h1>Dieser Link ist nicht mehr gültig.</h1>
        <p>Bitte rufen Sie Ihre Praxis an, wenn Sie einen Termin vereinbaren möchten.</p>`,
    });
  }
  const anrede = claim.patientName ? `Guten Tag, ${esc(claim.patientName)}.` : "Guten Tag.";
  if (state === "open") {
    return page({
      title: "Terminangebot", praxis,
      body: `<h1>Ihr Terminangebot</h1>
        <p>${anrede} Bei uns ist kurzfristig ein Termin frei geworden:</p>
        ${slotBlock(claim)}
        <p class="muted">Der Termin wird nach dem Prinzip &bdquo;wer zuerst zusagt&ldquo; vergeben.</p>
        <form method="post">
          <button class="ja" name="a" value="ja" type="submit">Termin verbindlich zusagen</button>
          <button class="nein" name="a" value="nein" type="submit">Passt leider nicht</button>
        </form>
        ${telZeile(claim)}`,
    });
  }
  if (state === "booked") {
    return page({
      title: "Termin bestätigt", praxis,
      body: `<h1 class="ok">Ihr Termin ist fest eingetragen.</h1>
        <p>${anrede} Vielen Dank für Ihre Zusage — wir haben den Termin für Sie reserviert:</p>
        ${slotBlock(claim)}
        <p class="muted">Bitte kommen Sie ein paar Minuten früher. Falls doch etwas dazwischenkommt, rufen Sie uns bitte an.</p>
        ${telZeile(claim)}`,
    });
  }
  if (state === "declined") {
    return page({
      title: "Absage vermerkt", praxis,
      body: `<h1>Alles klar, danke für die Rückmeldung.</h1>
        <p>${anrede} Wir haben vermerkt, dass der Termin nicht passt — Sie müssen nichts weiter tun.</p>
        <p class="muted">Wenn Sie doch möchten und der Termin noch frei ist, können Sie unten erneut zusagen — oder Sie rufen uns einfach an.</p>
        <form method="post">
          <button class="ja" name="a" value="ja" type="submit">Doch zusagen, falls noch frei</button>
        </form>
        ${telZeile(claim)}`,
    });
  }
  if (state === "gone") {
    return page({
      title: "Termin bereits vergeben", praxis,
      body: `<h1 class="warn">Dieser Termin ist leider schon vergeben.</h1>
        <p>${anrede} Da war jemand schneller — der angebotene Termin ist inzwischen belegt.</p>
        <p>Rufen Sie uns gern an, dann finden wir zusammen einen anderen Termin für Sie.</p>
        ${telZeile(claim)}`,
    });
  }
  if (state === "expired") {
    return page({
      title: "Angebot abgelaufen", praxis,
      body: `<h1 class="warn">Dieses Angebot ist abgelaufen.</h1>
        <p>${anrede} Der angebotene Termin liegt inzwischen in der Vergangenheit.</p>
        <p>Rufen Sie uns gern an, dann finden wir einen neuen Termin für Sie.</p>
        ${telZeile(claim)}`,
    });
  }
  // failed: Zusage kam an, Buchung klappte technisch nicht — ehrlich sagen.
  return page({
    title: "Zusage angekommen", praxis,
    body: `<h1 class="warn">Ihre Zusage ist angekommen — wir melden uns.</h1>
      <p>${anrede} Beim automatischen Eintragen gab es gerade ein technisches Problem.
      Unser Team wurde informiert und ruft Sie zurück, um den Termin fest zu machen.</p>
      ${slotBlock(claim)}
      ${telZeile(claim)}`,
  });
}

/** Seiten-Zustand aus dem gespeicherten Claim ableiten (fuer GET). */
async function stateForGet(clientId, claim) {
  if (!claim) return "unknown";
  if (claim.status === "booked" || claim.status === "booking") return "booked";
  if (claim.status === "gone") return "gone";
  if (claim.status === "failed") return "failed";
  const declined = claim.status === "declined";
  if (Date.now() > (claim.expMs || 0)) return declined ? "declined" : "expired";
  // Slot inzwischen anderweitig vergeben? (z. B. Telefon-Zusage eines anderen
  // Kandidaten) — lieber VOR dem Klick "vergeben" zeigen als danach.
  try {
    const snap = await masCollection(clientId, "mas_cases").doc(claim.caseId).get();
    if (snap.exists) {
      const c = snap.data();
      const other = c.callList?.slotClaim?.token && c.callList.slotClaim.token !== claim.token;
      const key = String(claim.slotIso || "").slice(0, 16);
      const bookedElsewhere = (c.callList?.candidates || []).some(
        (x) => x.contact?.outcome === "booked" &&
          (!x.contact.bookedSlotIso || String(x.contact.bookedSlotIso).slice(0, 16) === key)
      );
      if (other || bookedElsewhere || c.status === CASE_STATUS.RESOLVED) return "gone";
    }
  } catch { /* Anzeige-Check darf die Seite nie brechen */ }
  return declined ? "declined" : "open";
}

router.get("/z/:clientId/:token", async (req, res) => {
  try {
    const clientId = String(req.params.clientId || "").trim();
    const claim = await loadClaim(clientId, req.params.token);
    const state = await stateForGet(clientId, claim);
    res.status(claim ? 200 : 404).type("html").send(render(state, claim));
  } catch (e) {
    log.warn("zusage.get_failed", { error: String(e?.message || e) });
    res.status(500).type("html").send(render("unknown", null));
  }
});

router.post("/z/:clientId/:token", async (req, res) => {
  try {
    const clientId = String(req.params.clientId || "").trim();
    const antwort = String(req.body?.a || "").trim().toLowerCase();
    const out = antwort === "nein"
      ? await declineClaim(clientId, req.params.token)
      : await acceptClaim(clientId, req.params.token);
    // Ergebnis direkt rendern (kein Redirect noetig — der Zustand ist
    // persistiert, ein Reload landet ueber GET auf derselben Seite).
    res.status(200).type("html").send(render(out.state, out.claim));
  } catch (e) {
    log.warn("zusage.post_failed", { error: String(e?.message || e) });
    res.status(500).type("html").send(render("failed", null));
  }
});

export default router;
