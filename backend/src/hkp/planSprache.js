// Die KI-Zeile der Planer per Sprache (Chef 18.11.2026): Clara erledigt an einem bestehenden Plan dasselbe wie
// die KI-Zeile im offenen Planer – Fragen zur Abrechnung, ändern, erweitern, kürzen, löschen. Gerechnet wird mit
// dem Dienst der Planer selbst (src/vendor/plan-ki-engine.mjs, gebaut aus PlanR: Start, npm run build:sprache),
// gefragt wird dasselbe Modell (planKiZug). Pläne der Planer liegen in PlanR (/api/intern/plan…), der Kassen-HKP
// im MAS-Register. Was der Satz bedeutet, entscheidet das Modell; hier wird kein Satz zerlegt.
// Notaus: MAS_PLAN_SPRACHE=0.
import { randomUUID } from "node:crypto";
import { log } from "../log.js";
import { euroSprech, liste } from "./sprech.js";

const basis = () => String(process.env.PLANR_URL || "https://planr.pickadoc.de").trim().replace(/\/+$/, "");
const schluessel = () => String(process.env.PLANR_HKP_KEY || "").trim();
export const planSpracheAn = () => String(process.env.MAS_PLAN_SPRACHE || "").trim() !== "0";

const MERK_MS = 15 * 60 * 1000;
const wahr = (v) => v === true || ["true", "1", "ja", "yes"].includes(String(v || "").trim().toLowerCase());
const datumDe = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}.${d.getMonth() + 1}.`; };

let holen = (...a) => fetch(...a);
let engine = null;
let zug = null;
/** Nur für Tests: Netz, Engine und Modell austauschen. */
export function _setzen({ holen: h, engine: e, zug: z } = {}) {
  holen = h || ((...a) => fetch(...a));
  engine = e || null;
  zug = z || null;
  letzter.clear(); verlaeufe.clear(); merker.clear(); offenLoeschen.clear();
}
const S = async () => engine || (engine = await import("../vendor/plan-ki-engine.mjs"));
const fragen = async (b) => (zug || (zug = (await import("./planKiZug.js")).planKiZug))(b);

async function planr(clientId, pfad, { query = {}, body = null, ms = 8000 } = {}) {
  if (!schluessel()) return { ok: false, status: 0, meldung: "PlanR ist nicht angebunden." };
  try {
    const url = `${basis()}${pfad}?${new URLSearchParams({ clientId, ...query })}`;
    const r = await holen(url, {
      method: body ? "POST" : "GET",
      headers: { "X-PlanR-Key": schluessel(), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(ms),
    });
    const d = await r.json().catch(() => ({}));
    return { ...d, ok: r.ok && d?.ok !== false, status: r.status };
  } catch {
    return { ok: false, status: 0, meldung: "PlanR ist gerade nicht erreichbar." };
  }
}

// --- Gedächtnis des Gesprächs (je Praxis): zuletzt besprochener Plan, Verlauf je Plan, Stände fürs Rückgängig ---
const letzter = new Map();
const verlaeufe = new Map();
const merker = new Map();
const offenLoeschen = new Map();
const kennung = (z) => `${z.modul}|${z.nummer}`;

function verlaufVon(clientId, z) {
  const v = verlaeufe.get(`${clientId}|${kennung(z)}`);
  return v && Date.now() - v.at < MERK_MS ? v.zuege : [];
}
function verlaufMerken(clientId, z, text, antwort) {
  const zuege = [...verlaufVon(clientId, z), { wer: "ich", text }, { wer: "clara", text: antwort }].slice(-6);
  verlaeufe.set(`${clientId}|${kennung(z)}`, { at: Date.now(), zuege });
}

/** Alle Pläne der Praxis als Ziele: { modul, nummer, patient, betrag, status, geaendert, hkp? } */
async function ziele(clientId, d) {
  const [p, hkps] = await Promise.all([
    planr(clientId, "/api/intern/plaene"),
    d.hkpListe ? d.hkpListe(clientId).catch(() => []) : [],
  ]);
  const aus = (p.ok && Array.isArray(p.plaene) ? p.plaene : []).map((k) => ({
    modul: String(k.modul), nummer: String(k.nummer), patient: String(k.patient || ""), betrag: Number(k.betrag) || 0,
    status: String(k.status || ""), geaendert: String(k.geaendert || ""), inhalt: k.inhalt !== false,
  }));
  for (const h of hkps) {
    if (h.status === "verworfen" || !h.planJson) continue;
    aus.push({
      modul: "hkp", nummer: String(h.id), patient: `${h.patient?.firstName || ""} ${h.patient?.lastName || ""}`.trim(),
      betrag: Number(h.summen?.eigenanteil) || 0, status: h.status, geaendert: String(h.aktualisiert || h.erstellt || ""), inhalt: true, hkp: h,
    });
  }
  return { liste: aus.sort((a, b) => b.geaendert.localeCompare(a.geaendert)), planrOk: p.ok, meldung: p.meldung };
}

const alsPatient = (name) => {
  const t = String(name || "").trim().split(/\s+/);
  return { lastName: t.pop() || "", firstName: t.join(" ") };
};

function planSatz(z, namen) {
  const wann = datumDe(z.geaendert);
  return `${namen[z.modul] || z.modul}${z.modul === "hkp" ? "" : ` ${z.nummer}`}${wann ? ` vom ${wann}` : ""}`;
}

/** Welcher Plan ist gemeint? Name, Planart und Nummer grenzen ein; sonst der zuletzt besprochene. */
async function waehlen(clientId, b, d, namen) {
  const { liste: alle, planrOk, meldung } = await ziele(clientId, d);
  const name = String(b.name || "").trim();
  const art = String(b.planart || "").trim().toLowerCase();
  const nummer = String(b.nummer || "").trim();
  let kand = alle;
  if (name) {
    kand = kand.filter((z) => d.namePasst(name, alsPatient(z.patient)) > 0);
    if (!kand.length) {
      return { antwort: { ok: true, message: `${planrOk ? "" : `${meldung || "PlanR ist gerade nicht erreichbar."} `}Für ${name} finde ich keinen Plan. Sagen Sie mir bitte den Namen noch einmal, oder soll ich einen Plan anlegen?` } };
    }
  }
  if (art && namen[art]) {
    const nach = kand.filter((z) => z.modul === art);
    if (nach.length || name) kand = nach;
  }
  if (nummer) {
    const ziff = nummer.replace(/\D/g, "");
    const nach = kand.filter((z) => z.nummer === nummer || (ziff && z.nummer.replace(/\D/g, "").endsWith(ziff)));
    if (nach.length) kand = nach;
  }
  if (!name && !nummer) {
    const l = letzter.get(clientId);
    const gemerkt = l && Date.now() - l.at < MERK_MS ? kand.find((z) => kennung(z) === l.kennung) : null;
    if (gemerkt) return { ziel: gemerkt };
    return { antwort: { ok: true, message: "Um welchen Plan geht es – für welchen Patienten?" } };
  }
  if (!kand.length) return { antwort: { ok: true, message: `Einen solchen Plan finde ich${name ? ` für ${name}` : ""} nicht.` } };
  if (kand.length > 1) {
    const personen = [...new Set(kand.map((z) => z.patient))];
    if (personen.length > 1) return { antwort: { ok: true, message: `Dazu finde ich Pläne für ${liste(personen.slice(0, 4))}. Wen meinen Sie?` } };
    const zeigen = kand.slice(0, 4).map((z) => planSatz(z, namen));
    return { antwort: { ok: true, message: `Für ${kand[0].patient} gibt es ${liste(zeigen)}. Welchen Plan meinen Sie?` } };
  }
  return { ziel: kand[0] };
}

/** Plan samt Einstellungen und Stand holen. */
async function laden(clientId, z, d) {
  if (z.modul === "hkp") {
    const h = (await d.hkpLesen(clientId, z.nummer)) || z.hkp;
    const plan = h ? d.planAus(h) : null;
    if (!plan) return { fehler: "Den Plan dieses HKP kann ich nicht lesen. Bitte in PlanR öffnen." };
    const praxis = await d.praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [] }));
    return { plan, einst: d.praxisListen(praxis), stand: h.version, gesperrt: h.status !== "wartet_auf_freigabe", hkp: h };
  }
  const r = await planr(clientId, "/api/intern/plan", { query: { modul: z.modul, nummer: z.nummer } });
  if (!r.ok || !r.plan) return { fehler: r.meldung || "Den Plan kann ich gerade nicht aus PlanR lesen." };
  return { plan: r.plan, einst: r.einst || undefined, stand: r.stand, gesperrt: r.karte?.status === "freigegeben", karte: Number(r.karte?.betrag) };
}

/**
 * Rechnet Clara denselben Betrag, der in PlanR am Plan steht? Die Preise und Faktoren der Praxis liegen im Browser
 * des Planers und kommen von dort zu PlanR. Fehlen sie oder sind sie seit dem letzten Speichern geändert, weicht
 * die Summe ab – dann sagt Clara das dazu, statt still eine andere Zahl zu nennen oder zu speichern.
 */
function abgleich(s, z, g) {
  if (z.modul === "hkp" || !Number.isFinite(g.karte)) return { gleich: true };
  let gerechnet;
  try { gerechnet = Number(s.bewerten(z.modul, g.plan, g.einst).betrag); } catch { return { gleich: true }; }
  if (!Number.isFinite(gerechnet) || Math.abs(gerechnet - g.karte) < 0.015) return { gleich: true };
  return { gleich: false, ohnePreise: !g.einst, karte: g.karte, gerechnet };
}

/** Geänderten Plan zurückschreiben; liefert den neuen Stand. */
async function schreiben(clientId, z, plan, basisStand, d, { betrag, pvs, was }) {
  if (z.modul === "hkp") {
    const ergebnis = d.E.rechnen(plan, (await laden(clientId, z, d)).einst);
    const neu = await d.hkpAktualisieren(clientId, z.nummer, {
      version: basisStand,
      felder: { planJson: JSON.stringify(plan), summen: d.summenAus(ergebnis), zusammenfassung: d.E.zusammenfassen(plan, ergebnis), offeneAenderung: null },
      wer: "Clara", was,
    });
    return { ok: true, stand: neu?.version ?? Number(basisStand) + 1, summen: d.summenAus(ergebnis) };
  }
  const r = await planr(clientId, "/api/intern/plan", { body: { modul: z.modul, nummer: z.nummer, plan, betrag, ...(pvs ? { pvs } : {}), basis: basisStand }, ms: 15000 });
  if (!r.ok) return { ok: false, meldung: r.veraltet ? "Der Plan wurde gerade in PlanR geändert. Bitte sagen Sie es noch einmal." : r.meldung || "Speichern in PlanR hat nicht geklappt. Der Plan ist unverändert." };
  return { ok: true, stand: r.stand };
}

const summeSatz = (z, betrag, summen) => (z.modul === "hkp" && summen
  ? `Eigenanteil jetzt ${euroSprech(summen.eigenanteil)}, Gesamtkosten ${euroSprech(summen.gesamt)}.`
  : `Der Plan liegt jetzt bei ${euroSprech(betrag)}.`);

/**
 * Ein Werkzeug-Aufruf. b = { name, planart, nummer, text, loeschen, bestaetigt }.
 * d = Zugänge des Registers (hkpListe, hkpLesen, hkpAktualisieren, praxisLaden, praxisListen, planAus, summenAus, E, namePasst, mitUndo).
 */
export async function planSprache(clientId, b = {}, d = {}) {
  const s = await S();
  const namen = s.MODULE_NAMEN;
  const w = await waehlen(clientId, b, d, namen);
  if (w.antwort) return w.antwort;
  const z = w.ziel;
  letzter.set(clientId, { kennung: kennung(z), at: Date.now() });
  const titel = `${planSatz(z, namen)} für ${z.patient}`;
  const undo = (art, id, label) => (d.mitUndo ? d.mitUndo(art, { id, label }) : {});

  if (wahr(b.loeschen)) {
    const offen = offenLoeschen.get(clientId);
    if (!wahr(b.bestaetigt) || !offen || offen.kennung !== kennung(z) || Date.now() - offen.at > 5 * 60 * 1000) {
      if (z.status === "freigegeben" || (z.modul === "hkp" && z.status !== "wartet_auf_freigabe")) {
        return { ok: true, message: `Der ${titel} ist schon freigegeben. Löschen kann ich ihn per Sprache nicht – das geht nur in PlanR.` };
      }
      offenLoeschen.set(clientId, { kennung: kennung(z), at: Date.now() });
      return { ok: true, needsConfirm: true, message: `Soll ich den ${titel} über ${euroSprech(z.betrag)} wirklich löschen?` };
    }
    offenLoeschen.delete(clientId);
    if (z.modul === "hkp") {
      const h = await d.hkpLesen(clientId, z.nummer);
      if (!h || h.status !== "wartet_auf_freigabe") return { ok: false, message: "Diesen HKP kann ich nicht mehr löschen. Bitte in PlanR prüfen." };
      await d.hkpAktualisieren(clientId, h.id, { version: h.version, felder: { status: "verworfen" }, wer: "Clara", was: "per Sprache gelöscht" });
    } else {
      const r = await planr(clientId, "/api/intern/plan/loeschen", { body: { modul: z.modul, nummer: z.nummer } });
      if (!r.ok) return { ok: false, message: r.meldung || "Löschen hat in PlanR nicht geklappt. Der Plan ist noch da." };
    }
    log.info?.(`[plan-sprache] ${kennung(z)} gelöscht`);
    return { ok: true, geloescht: true, ...undo("plan_weg", kennung(z), `den ${titel}`), message: `Erledigt: Der ${titel} ist gelöscht.` };
  }

  const text = String(b.text || "").trim();
  if (!text) return { ok: true, message: `Was soll ich am ${titel} tun oder nachsehen?` };
  if (!z.inhalt) return { ok: true, message: `Den Inhalt vom ${titel} kennt PlanR noch nicht. Bitte den Plan einmal im Planer öffnen, dann kann ich daran arbeiten.` };
  const g = await laden(clientId, z, d);
  if (g.fehler) return { ok: true, message: g.fehler };
  let l;
  try {
    l = await s.lauf({ modul: z.modul, plan: g.plan, einst: g.einst, gesperrt: g.gesperrt, text, verlauf: verlaufVon(clientId, z), fragen });
  } catch (err) {
    log.warn?.(`[plan-sprache] ${kennung(z)} nicht lesbar: ${String(err?.message || err).slice(0, 200)}`);
    return { ok: true, plan: kennung(z), message: `Den ${titel} kann ich gerade nicht auswerten. Bitte in PlanR öffnen. Geändert habe ich nichts.` };
  }
  const gesagt = String(l.text || "").trim() || "Dazu habe ich gerade keine Antwort.";
  verlaufMerken(clientId, z, text, gesagt);
  const a = abgleich(s, z, g);
  if (!a.gleich) log.info?.(`[plan-sprache] ${kennung(z)} Summe weicht ab: PlanR ${a.karte}, gerechnet ${a.gerechnet}${a.ohnePreise ? " (ohne Praxispreise)" : ""}`);
  if (!l.geaendert) {
    const hinweis = a.gleich ? "" : a.ohnePreise
      ? ` Achtung: In PlanR steht der Plan mit ${euroSprech(a.karte)}. Die Preise der Praxis für diesen Planer liegen mir noch nicht vor, meine Beträge können deshalb abweichen.`
      : ` Achtung: In PlanR steht der Plan noch mit ${euroSprech(a.karte)}; mit den heutigen Preisen der Praxis sind es ${euroSprech(a.gerechnet)}.`;
    return { ok: true, plan: kennung(z), message: `${gesagt}${hinweis}` };
  }
  if (!a.gleich && a.ohnePreise) {
    return { ok: true, plan: kennung(z), message: `Ändern kann ich den ${titel} per Sprache noch nicht: Die Preise der Praxis für diesen Planer liegen mir nicht vor, die Summe würde danach nicht stimmen. Bitte den Planer einmal in PlanR öffnen, dann geht es. Geändert habe ich nichts.` };
  }

  const e = await schreiben(clientId, z, l.plan, g.stand, d, { betrag: l.betrag, pvs: l.pvs, was: `per Sprache: ${l.getan.join("; ").slice(0, 300)}` });
  if (!e.ok) return { ok: false, message: e.meldung };
  const id = randomUUID().slice(0, 12);
  merker.set(id, { clientId, ziel: { modul: z.modul, nummer: z.nummer }, plan: g.plan, stand: e.stand, at: Date.now() });
  for (const [k, m] of merker) if (Date.now() - m.at > 2 * MERK_MS) merker.delete(k);
  log.info?.(`[plan-sprache] ${kennung(z)} geändert: ${l.getan.length} Schritte`);
  return { ok: true, geaendert: true, plan: kennung(z), ...undo("plan_ki", id, `die Änderung am ${titel}`), message: `Erledigt. ${gesagt} ${summeSatz(z, l.betrag, e.summen)}${a.gleich ? "" : ` Vorher stand er in PlanR mit ${euroSprech(a.karte)}; gerechnet ist jetzt mit den heutigen Preisen der Praxis.`}` };
}

/** Rückgängig einer Änderung: den Plan von vorher zurückschreiben – nur wenn seitdem niemand sonst geändert hat. */
export async function planAenderungZurueck(clientId, id, d) {
  const m = merker.get(String(id));
  if (!m || m.clientId !== clientId) return { ok: false, grund: "fehlt" };
  const s = await S();
  const { betrag, pvs } = s.bewerten(m.ziel.modul, m.plan, (await laden(clientId, m.ziel, d)).einst);
  const e = await schreiben(clientId, m.ziel, m.plan, m.stand, d, { betrag, pvs, was: "per Sprache zurückgenommen (\"doch nicht\")" }).catch(() => ({ ok: false }));
  if (!e.ok) return { ok: false, grund: "veraltet" };
  merker.delete(String(id));
  verlaeufe.delete(`${clientId}|${kennung(m.ziel)}`);
  return { ok: true };
}

/** Rückgängig eines Löschens. */
export async function planWiederholen(clientId, id, d) {
  const [modul, ...rest] = String(id).split("|");
  const nummer = rest.join("|");
  if (modul === "hkp") {
    const h = await d.hkpLesen(clientId, nummer);
    if (!h || h.status !== "verworfen") return { ok: false };
    await d.hkpAktualisieren(clientId, h.id, { version: h.version, felder: { status: "wartet_auf_freigabe" }, wer: "Clara", was: "Löschen per Sprache zurückgenommen" });
    return { ok: true };
  }
  const r = await planr(clientId, "/api/intern/plan/zurueck", { body: { modul, nummer } });
  return { ok: r.ok };
}
