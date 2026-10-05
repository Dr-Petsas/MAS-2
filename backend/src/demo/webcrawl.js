import { log } from "../log.js";

// ============================================================================
// Leichter Hintergrund-Crawl der Praxis-Webseite (Erlebnis-Demo, 19.08.2026).
//
// Zweck: Sobald der Besucher den Wegwerf-Demo-Account freischaltet, holen wir
// IM HINTERGRUND ein paar Eckdaten seiner Webseite (Titel, Beschreibung, etwas
// Text, sichtbare E-Mail/Telefon) und legen sie am Lead ab. Klickt er spaeter
// auf "14 Tage kostenlos testen", ist der Onboarder damit vorbefuellt — ohne
// dass der Besucher warten musste.
//
// BEWUSST abhaengigkeitsfrei (kein cheerio/puppeteer): Node-fetch + Regex,
// harte Zeit-/Groessengrenzen. Der Crawl ist reine Kuer — er darf NIE eine
// Freischaltung verzoegern oder brechen (fire-and-forget, alles gefangen).
// Nur oeffentliche Startseite, ein einziger GET, keine Unterseiten-Jagd.
// ============================================================================

const ZEIT_MS = 8000;
const MAX_BYTES = 600 * 1024; // 600 KB reichen fuer eine Startseite
const TEXT_CAP = 2000;

function text(v) {
  return (v == null ? "" : String(v)).trim();
}

/** Website auf eine holbare URL bringen (Protokoll ergaenzen). */
function urlHaltbar(roh) {
  let s = text(roh);
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function ausschnitt(s, n) {
  const t = text(s).replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
}

/** Einen benannten <meta ...>-Inhalt herausziehen (name= oder property=). */
function metaInhalt(html, schluessel) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${schluessel}["'][^>]*>`,
    "i",
  );
  const tag = (html.match(re) || [])[0];
  if (!tag) return "";
  const inhalt = tag.match(/content=["']([^"']*)["']/i);
  return inhalt ? text(inhalt[1]) : "";
}

/** Sichtbaren Text grob aus dem HTML schaelen (Script/Style raus, Tags weg). */
function sichtbarerText(html) {
  return text(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&[a-z]+;/gi, " "),
  );
}

function eindeutig(liste, max) {
  return Array.from(new Set(liste)).slice(0, max);
}

/**
 * Startseite holen und Eckdaten extrahieren. Wirft NIE — gibt bei jedem
 * Problem ein Objekt mit status "fehler"/"leer" zurueck.
 */
export async function seiteHolen(website) {
  const url = urlHaltbar(website);
  if (!url) return { status: "fehler", grund: "keine_url" };

  const ac = new AbortController();
  const uhr = setTimeout(() => ac.abort(), ZEIT_MS);
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": "PickadocDemoCrawler/1.0 (+https://pickadoc.de)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return { status: "fehler", grund: `http_${resp.status}`, quelle: url };

    const ct = String(resp.headers.get("content-type") || "");
    if (ct && !/text\/html|xhtml/i.test(ct)) {
      return { status: "leer", grund: "kein_html", quelle: url };
    }

    // Groesse deckeln: nur die ersten MAX_BYTES lesen.
    const puffer = await resp.arrayBuffer();
    const roh = Buffer.from(puffer).subarray(0, MAX_BYTES).toString("utf8");

    const titelTag = (roh.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
    const titel = text(titelTag) || metaInhalt(roh, "og:title");
    const beschreibung =
      metaInhalt(roh, "description") || metaInhalt(roh, "og:description");
    const sicht = sichtbarerText(roh);

    const emails = eindeutig(
      (roh.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map((e) =>
        e.toLowerCase(),
      ),
      5,
    );
    const telefone = eindeutig(
      (sicht.match(/(?:\+49|0)[\d\s/().-]{6,18}\d/g) || []).map((t) =>
        t.replace(/\s+/g, " ").trim(),
      ),
      5,
    );

    return {
      status: titel || beschreibung || sicht ? "ok" : "leer",
      quelle: url,
      titel: ausschnitt(titel, 160),
      beschreibung: ausschnitt(beschreibung, 320),
      text: ausschnitt(sicht, TEXT_CAP),
      emails,
      telefone,
    };
  } catch (e) {
    return { status: "fehler", grund: e?.name === "AbortError" ? "timeout" : "netz", quelle: url };
  } finally {
    clearTimeout(uhr);
  }
}

/**
 * Fire-and-forget: Startseite crawlen und das Ergebnis am Lead ablegen.
 * Bewusst OHNE await beim Aufrufer — der Crawl laeuft im Hintergrund und darf
 * die Freischaltung nie bremsen. ``leadRef`` ist die Firestore-DocumentReference.
 */
export async function crawlHintergrund(leadRef, website) {
  try {
    if (!leadRef || !text(website)) return;
    const erg = await seiteHolen(website);
    await leadRef.set(
      {
        crawl: { ...erg, holendAm: Date.now() },
        crawlStatus: erg.status,
        crawlAm: Date.now(),
      },
      { merge: true },
    );
    log.info("demo.crawl.fertig", {
      leadId: leadRef.id,
      status: erg.status,
      titel: (erg.titel || "").slice(0, 40),
    });
  } catch (e) {
    // Ein fehlgeschlagener Crawl ist kein Fehler der Demo — nur ein leeres
    // Vorbefuellen spaeter. Leise wegloggen, niemals werfen.
    try {
      log.warn("demo.crawl.fehler", { leadId: leadRef?.id, fehler: String(e?.message || e) });
    } catch {
      /* egal */
    }
  }
}
