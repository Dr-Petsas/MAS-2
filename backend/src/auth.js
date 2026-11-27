import admin from "./firebase.js";
import { timingSafeEqual } from "node:crypto";
import { herkunft, tunnelLehntAb, uebergang } from "./zugang.js";

// Authentication for the MAS-2 HTTP API.
//
// Two trusted callers exist:
//   1. Logged-in platform users (browser) — they carry a Firebase ID token whose
//      custom claims already pin them to a tenant: { clientId, isAdmin, role }.
//      We verify the token with firebase-admin and NEVER trust client-sent
//      identity headers (X-User-*) — those were spoofable.
//   2. Server-to-server callers (voice worker, agent tool webhooks, scheduled
//      jobs) — they present a shared secret in X-Service-Token and act as the
//      practice (admin scope) for an explicitly named clientId.
//
// A small set of routes is public: the phone "connect" page + QR landing run
// outside the authenticated app and are gated by PIN + entitlement instead, and
// /health is liveness only.

const SERVICE_TOKEN = (process.env.MAS_SERVICE_TOKEN || "").trim();

// Enforced by default in production. In dev it stays off unless MAS_REQUIRE_AUTH
// is set, so local tooling keeps working; set MAS_REQUIRE_AUTH=1 to test the
// production behaviour locally.
const AUTH_ENFORCED = (() => {
  const v = (process.env.MAS_REQUIRE_AUTH || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  return process.env.NODE_ENV === "production";
})();

// Von aussen (ueber den Tunnel) nur mit Anmeldung oder Schluessel. Schalter in der .env; aus = wie bisher.
const TUNNEL_NUR_ANGEMELDET = ["1", "true", "yes", "on"].includes(
  (process.env.MAS_TUNNEL_NUR_ANGEMELDET || "").trim().toLowerCase(),
);

function safeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function isPublic(req) {
  if (req.method === "OPTIONS") return true;
  const p = req.path || "";
  if (p === "/health" || p === "/health/ready") return true;
  // PIN-gated phone endpoints, opened on a device that is NOT logged into the
  // platform (e.g. the doctor's car). Protected by PIN + entitlement + throttle.
  if (p === "/clara/session" || p === "/clara/identify") return true;
  // Phone pairing + push (device is not logged in): register is gated by the
  // single-use QR token, refresh by the deviceKey, vapid-key is a public key.
  // register-code = iOS-sicherer Kurzcode (ohne Link/Manifest); unpair = Geraet
  // entkoppelt sich selbst per deviceKey.
  if (p === "/clara/devices/register" || p === "/clara/devices/register-code") return true;
  if (p === "/clara/devices/refresh" || p === "/clara/devices/unpair") return true;
  if (p === "/clara/devices/vapid-key" || p === "/clara/devices/self-test") return true;
  // deviceKey-gesichert (28.07.2026): Muelltonne auf der Telefon-Karte —
  // das gekoppelte Handy nimmt Kandidaten von der Anrufliste.
  if (p === "/clara/devices/recall-remove") return true;
  // deviceKey-gesichert: Lisa-Live-Ansicht + Übernehmen auf Handy/iPad.
  if (p === "/clara/devices/lisa-live" || p === "/clara/devices/lisa-takeover") return true;
  if (p === "/clara/devices/lisa-sms-send") return true;
  // Voice-Worker holt beim Verbinden den Anlass eines proaktiven Clara-Anrufs
  // ab (kurzer, PII-freier Sprechtext; einmalig konsumiert, 2h TTL).
  if (p === "/clara/pending-context") return true;
  // Fernsteuerungs-Chat (Wochenend-Provisorium): von der statischen Handy-Seite
  // aus erreichbar, jede Route prueft selbst REMOTE_CHAT_TOKEN (remoteChat.js).
  if (p.startsWith("/remote/")) return true;
  // Lisas Kalender-Werkzeuge: Aufrufer ist ElevenLabs (Webhook-Tools mitten im
  // Patientengespraech). Jede Route prueft selbst den Secret-Header
  // X-Lisa-Tool-Secret (timing-safe, routes/lisaTools.js).
  if (p.startsWith("/lisa/tools/")) return true;
  // Twilio-Signatur (Lisa-Gesprächsübernahme: Chef-Status, Konferenz, Transkript).
  if (p.startsWith("/lisa/twilio/")) return true;
  // QM-Handy-Portal: die zustaendige Helferin oeffnet den Push-Link ohne Login.
  // Jede Route prueft selbst den signierten Ein-Job-Token (routes/qm.js ->
  // portalGuard, timing-safe). Gibt nur GENAU EINEN Job frei.
  if (p.startsWith("/clara/qm/portal/")) return true;
  // (/clara/<clientId> mit /connect und /status: siehe CLARA_ALLGEMEIN am Ende.)
  // /clara/health (globaler Stack-Health als JSON, keine PII, nebenwirkungsfrei).
  if (p === "/clara/health") return true;
  // Ruf-Name der Assistentin (Phase W-NAME): gekoppelte Geraete (Companion-App,
  // iPad-Konsole) laufen ohne Login und muessen nach einer Umbenennung den
  // neuen Namen ziehen koennen. Nur der Ruf-Name (keine PII), Entitlement wird
  // in der Route selbst geprueft (assertAppEnabled).
  if (p === "/clara/assistant-name") return true;
  // Clara-Umschalter (Handy-Seite /m/cx7.html, nicht eingeloggt): schaltet
  // zwischen Live-Clara und der Testinstanz V6. Keine PII, kein Kalenderzugriff
  // — nur Worker beenden/starten auf diesem Rechner. Der Seitenpfad ist bewusst
  // unauffaellig gewaehlt, weil hier ohne Login umgeschaltet werden kann.
  if (p.startsWith("/clara-switch/")) return true;
  // Dampsoft-VDDS-Knopf auf diesem Rechner: Text holen/ablegen, nur Loopback
  // (die Route selbst lehnt Nicht-Localhost ab).
  // "Nur Loopback" prueft routes/pvs.js an der Adresse der Verbindung. Ueber den Tunnel ist das immer dieser
  // Rechner (cloudflared laeuft hier), und GET /pvs/outbox prueft gar nicht, sobald req.auth gesetzt ist. Von
  // aussen waren Ablage und Karteitext damit ohne Nachweis lesbar. Deshalb eigene Werte statt "offen":
  // die Anmeldung behandelt sie wie "offen", ausser ueber den Tunnel (siehe authMiddleware).
  if (p === "/pvs/pending-chart") return NUR_LOKAL;
  if (p === "/pvs/outbox" && req.method === "GET") return NUR_LOKAL;
  if (p === "/pvs/outbox" && req.method === "POST") return MIT_GERAET;
  if (/^\/pvs\/outbox\/[^/]+\/(collected|undo)$/.test(p) && req.method === "POST") return NUR_LOKAL;
  // STT-Bench (Mikrofon-Vergleich) hinter mas.pickadoc-tunnel.com/stt-bench.
  // Kein Login: die Seite selbst ist der Teststand, Proxy vor Auth in server.js.
  if (p === "/stt-bench" || p.startsWith("/stt-bench/")) return true;
  // Conformer-Live-Test (ehemals stt.pickadoc-tunnel.com) hinter /stt.
  if (p === "/stt" || p.startsWith("/stt/")) return true;
  // Qwen3-TTS auf der 5090 (ClonR-Klon). Proxy steht vor Auth; Cloud Functions
  // haben kein MAS-Token.
  if (p === "/qwen-tts" || p.startsWith("/qwen-tts/")) return true;
  if (p === "/qwen-asr" || p.startsWith("/qwen-asr/")) return true;
  if (p === "/voice-enhance" || p.startsWith("/voice-enhance/")) return true;
  // Weiterleitung zur Auftragsannahme von Lisa V8 (routes/lisaV8Proxy.js). Steht vor der Anmeldung;
  // den Schluessel im Kopf Authorization prueft Lisa selbst, zugelassen sind nur vier Pfade.
  if (p.startsWith("/lisa-v8/")) return true;
  // Termin-Bildbeleg (SVG) fuer Handy-Push und Chat-Vorschau.
  if (/^\/clara\/proof\/[^/]+\/[^/]+\.svg$/.test(p)) return true;
  // Online-Zusage aus Recall-SMS (Patient klickt den SMS-Link, nicht
  // eingeloggt). Der Claim-Token im Pfad ist das Ticket (96 Bit Zufall,
  // ein Kandidat, ein Slot, Ablauf mit Slot-Beginn — routes/zusage.js).
  if (/^\/z\/[^/]+\/[^/]+$/.test(p)) return true;
  // Erlebnis-Demo, interaktiver Weg (pickadoc.ai): Interessenten sollen sich
  // NICHT anmelden muessen — das ist der Sinn der Demo. Die Routen bewachen sich
  // selbst (routes/demo.js + demo/tor.js): Freischaltcode per SMS, danach ein
  // Ticket, und SMS/Anruf gehen ausschliesslich an die damit bestaetigte Nummer.
  // Dazu Kontingent pro Nummer und Tagesobergrenze — die Endpunkte loesen echte
  // Anrufe aus, also darf hier weder Geld verbrannt noch ein Dritter belaestigt
  // werden koennen.
  if (p.startsWith("/demo/")) return true;
  // Behandlungs-Companion (iPad/Handy per QR am Behandlungsstuhl, NICHT
  // eingeloggt): Presence-Heartbeat + geteilter Aufnahme-Zustand. Der QR-Link
  // (clientId+locationId+appointmentId, nicht erratbar) ist das Ticket —
  // gleiches Modell wie die oeffentliche submitTreatmentDictation-Function
  // der Plattform. Routen geben nur den Kontext EINES Termins preis.
  // /treatment/current = Raum→Termin fuer das gekoppelte iPad (deviceKey-gated).
  // /treatment/lena-stt-url GET = oeffentliche wss-Adresse (kein Secret).
  // lena-segment: iPad speichert Finals (deviceKey) ODER Worker (Publish-Token).
  if (
    p === "/treatment/heartbeat" || p === "/treatment/recorder"
    || p === "/treatment/current" || p === "/treatment/lena-segment"
    || p === "/treatment/lena-segment-update" || p === "/treatment/lena-segment-delete"
    || p === "/treatment/structure" || p === "/treatment/billing"
    || p === "/treatment/patient-docs" || p === "/treatment/finalize"
    || p === "/treatment/lena-01-state"
  ) return true;
  // iPad-Zusammenfassung: welcher Schreibweg in den Einstellungen steht
  // (nur der Name, keine Patientendaten).
  if (p === "/pvs/write-path" && req.method === "GET") return true;
  // HKP-Register fuer PlanR (Browser-App ohne Plattform-Login): jede Route
  // prueft selbst den Praxis-Schluessel X-PlanR-Key (routes/hkp.js, timing-safe).
  if (p.startsWith("/planr/")) return true;
  if (p === "/treatment/lena-stt-url" && req.method === "GET") return true;
  // Drei weitere Pfade des gekoppelten iPads: jede Route prueft selbst die Geraetekennung (companionDeviceOk in
  // routes/treatment.js) und antwortet sonst mit 403. Sie fehlten hier; ohne erzwungene Anmeldung fiel das nicht auf.
  // GET /treatment/room-capture-state gehoert NICHT dazu: die Route prueft nur, wenn LENA_STT_PUBLISH_TOKEN gesetzt ist.
  if (req.method === "POST" && (p === "/treatment/room-capture" || p === "/treatment/lena-suggest" || p === "/treatment/lena-consolidate-01")) return true;
  // Meldungen der Plattform zum Kontaktverlauf (Cloud Functions, kein Nutzer-Login): beide Pfade pruefen
  // selbst ihren eigenen Schluessel im Kopf X-Service-Token (brain/kontaktVerlaufZugang.js, timing-safe).
  // Die Auskunft (GET /brain/kontakt-verlauf) gehoert nicht dazu.
  if (req.method === "POST" && (p === "/brain/kontakt-verlauf/sendung" || p === "/brain/kontakt-verlauf/reaktion")) return true;
  // /clara/<clientId> (QR landing HTML), /clara/<clientId>/connect (phone page)
  // und /clara/<clientId>/status (System-Status-Seite, nur Read-only-Health).
  // Das Muster trifft auch jede feste Route mit einem Abschnitt (/clara/team, /clara/directory,
  // /clara/stt-patient-names, /clara/pruefliste, /clara/devices ...). Deshalb ein eigener Wert: die Anmeldung
  // behandelt ihn wie "offen", ausser ueber den Tunnel (claraKoppelseite weiter unten).
  if (/^\/clara\/[^/]+(\/connect|\/status)?$/.test(p)) return CLARA_ALLGEMEIN;
  return false;
}

// Freistellungen, die ueber den Tunnel nicht tragen (isPublic liefert sie statt true):
// CLARA_ALLGEMEIN  das Muster /clara/<ein Abschnitt>, gedacht fuer die Koppelseite
// NUR_LOKAL        Routen, die sich auf "nur dieser Rechner" verlassen
// MIT_GERAET       POST /pvs/outbox: die Route prueft die Geraetekennung, lehnt aber nur bei erzwungener
//                  Anmeldung ab; von aussen ohne Anmeldung verlangt sie das Geraet (req.zugang.geraetNoetig)
const CLARA_ALLGEMEIN = "clara_allgemein";
const NUR_LOKAL = "nur_lokal";
const MIT_GERAET = "mit_geraet";

// Wofuer das allgemeine Muster gedacht ist: die drei Seiten zum Koppeln, GET mit einer Praxiskennung
// (Firestore-Kennung, 20 Buchstaben und Ziffern). Feste Routen heissen nie so.
function claraKoppelseite(req) {
  return req.method === "GET" && /^\/clara\/[A-Za-z0-9]{20}(\/connect|\/status)?$/.test(req.path || "");
}

function tokenAus(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.header("Authorization") || "");
  return (m && m[1]) || (typeof req.query?.t === "string" ? req.query.t : "");
}

/**
 * Feste Clara-Route mit einem Abschnitt, ueber den Tunnel: offen wie bisher nur mit gueltigem Dienstschluessel
 * oder gueltiger Anmeldung. Liefert, was die Anfrage mitbrachte.
 */
async function nachweisVonAussen(req) {
  const svc = (req.header("X-Service-Token") || "").trim();
  if (SERVICE_TOKEN && svc && safeEq(svc, SERVICE_TOKEN)) return "schluessel";
  const token = tokenAus(req);
  if (!token) return svc ? "schluessel_unbekannt" : "nichts";
  try {
    await admin.auth().verifyIdToken(token);
    return "anmeldung";
  } catch {
    return "anmeldung_ungueltig";
  }
}

export function authMiddleware() {
  return async function auth(req, res, next) {
    // req.zugang geht nur ins Zugriffsprotokoll (server.js): was die Anfrage mitbrachte.
    const offen = isPublic(req);
    if (offen && offen !== true && herkunft(req) === "tunnel" && !(offen === CLARA_ALLGEMEIN && claraKoppelseite(req))) {
      // Von aussen auf einer Freistellung, die ueber den Tunnel nicht traegt: mit gueltigem Nachweis wie bisher
      // (unveraendert "public"), ohne Nachweis abgelehnt, sobald der Schalter an ist.
      const mit = await nachweisVonAussen(req);
      const belegt = mit === "schluessel" || mit === "anmeldung";
      if (!belegt && offen === MIT_GERAET) {
        req.zugang = { mit, geraetNoetig: TUNNEL_NUR_ANGEMELDET || undefined };
        req.auth = { kind: "public", isAdmin: true, userId: "", clientId: "" };
        return next();
      }
      req.zugang = { mit, wuerde: belegt ? undefined : true };
      if (!belegt && TUNNEL_NUR_ANGEMELDET) {
        req.zugang.abgelehnt = "tunnel";
        return res.status(401).json({
          ok: false,
          error: mit === "anmeldung_ungueltig" ? "invalid_token" : "unauthenticated",
          grund: "anmeldung_noetig",
          klartext: "Von außen geht das nur mit Anmeldung.",
        });
      }
      req.auth = { kind: "public", isAdmin: true, userId: "", clientId: "" };
      return next();
    }
    if (offen) {
      req.auth = { kind: "public", isAdmin: true, userId: "", clientId: "" };
      req.zugang = { mit: "offen" };
      return next();
    }

    // 1) Server-to-server shared secret.
    const svc = (req.header("X-Service-Token") || "").trim();
    if (SERVICE_TOKEN && svc && safeEq(svc, SERVICE_TOKEN)) {
      req.auth = { kind: "service", isAdmin: true, userId: "", clientId: "" };
      req.zugang = { mit: "schluessel" };
      return next();
    }

    // 2) Firebase ID token — from the Authorization header, or a ?t= query param
    //    for browser-loaded <img>/<a> attachment URLs that cannot set headers.
    const hdr = req.header("Authorization") || "";
    const m = /^Bearer\s+(.+)$/i.exec(hdr);
    const token = (m && m[1]) || (typeof req.query?.t === "string" ? req.query.t : "");
    if (token) {
      try {
        const dec = await admin.auth().verifyIdToken(token);
        const role = String(dec.role || "").toLowerCase();
        req.auth = {
          kind: "user",
          uid: dec.uid,
          userId: dec.uid,
          clientId: String(dec.clientId || "").trim(),
          isAdmin: !!dec.isAdmin,
          role,
          superUser: role === "superuser",
          // Anzeige-Identität für Audit-Spuren ("gesendet durch ...", Frist-
          // Dokumentation): wer wirklich gehandelt hat, nicht pauschal "Nadine".
          name: String(dec.name || "").trim(),
          email: String(dec.email || "").trim(),
        };
        req.zugang = { mit: "anmeldung" };
        return next();
      } catch {
        req.zugang = { mit: "anmeldung_ungueltig" };
        if (AUTH_ENFORCED) return res.status(401).json({ error: "invalid_token" });
        // dev (not enforced): fall through to anon below
      }
    }

    // Ohne gueltigen Nachweis. "wuerde" haelt fest, ob die Regel fuer den Tunnel (zugang.js) diese Anfrage
    // ablehnt. Mit MAS_TUNNEL_NUR_ANGEMELDET=1 wird sie abgelehnt: von aussen geht dann nur noch, was sich
    // selbst schuetzt (isPublic), was Anmeldung oder Dienstschluessel mitbringt, und der Uebergang fuer Bianca
    // und Lisa. Aufrufer auf diesem Rechner und im Praxisnetz sind nicht betroffen.
    const ungueltig = req.zugang?.mit === "anmeldung_ungueltig";
    req.zugang = {
      mit: req.zugang?.mit || (svc ? "schluessel_unbekannt" : "nichts"),
      wuerde: tunnelLehntAb(req) || undefined,
      // Von aussen ohne Nachweis nur wegen der Uebergangsliste durchgelassen: wird mitgezaehlt.
      uebergang: (herkunft(req) === "tunnel" && uebergang(req)) || undefined,
    };
    if (req.zugang.wuerde && TUNNEL_NUR_ANGEMELDET) {
      req.zugang.abgelehnt = "tunnel";
      return res.status(401).json({
        ok: false,
        error: ungueltig ? "invalid_token" : "unauthenticated",
        grund: "anmeldung_noetig",
        klartext: "Von außen geht das nur mit Anmeldung.",
      });
    }

    if (AUTH_ENFORCED) return res.status(401).json({ error: "unauthenticated" });

    // Dev transition mode only: act as practice admin so local testing keeps
    // working without a token. Never reached when AUTH_ENFORCED.
    req.auth = { kind: "anon", isAdmin: true, userId: "", clientId: "" };
    return next();
  };
}

export { AUTH_ENFORCED, SERVICE_TOKEN, TUNNEL_NUR_ANGEMELDET };
