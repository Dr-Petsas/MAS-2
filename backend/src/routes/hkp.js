// HKP per Sprache (Chef 05.10.2026): "Clara, erstelle mir einen HKP fuer Herrn
// XY, Teleskopprothese mit Teleskopen auf den OK-Vierern, nach distal ersetzt
// als Cover-Denture." Gerechnet wird mit DERSELBEN Engine wie PlanR
// (src/vendor/hkp-engine.mjs, gebaut aus F:\PlanR\ZE\HKP).
//
// Regeln (Chef):
//  - Clara legt nur Entwuerfe an (Status "wartet auf Freigabe"). FREIGABE NUR
//    IN PLANR per Klick — es gibt bewusst kein Sprach-Tool dafuer.
//  - Positionen aendert Clara nur, solange der HKP auf Freigabe wartet, und nur
//    zweistufig (Vorschau -> ausdrueckliche Bestaetigung).
//  - Vor dem Anlegen Doppelungs-Pruefung je Patient und Kiefer.
//  - Befund: gesprochen > Lena-01 > PVS > Rueckfrage (src/hkp/befundQuelle.js).
//
// /planr/*  : PlanR (Praxis-Schluessel X-PlanR-Key, in auth.js oeffentlich gefuehrt)
// /tools/hkp-* : Clara-Tools (Profil-Gruppe "hkp"); Notaus MAS_HKP_TOOLS=0.
import express from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import * as E from "../vendor/hkp-engine.mjs";
import { assertAppEnabled } from "../entitlements.js";
import { log } from "../log.js";
import { DEFAULT_CLIENT_ID, resolveClientId } from "./_shared.js";
import { resolveSpokenPatientForRead } from "./tools.js";
import { getPatientCandidates, setPatientCandidates } from "../clara/sessions.js";
import { soundsSame } from "../clara/phonetics.js";
import { disambiguationQuestion, merkmalEingrenzen, ordinalPick } from "../clara/patientDisambig.js";
import { fetchPatientsByIds, findInCatalog } from "../clara/patientCatalog.js";
import { jahrgangWahl, vetternFrage, vorleseSatz } from "../hkp/vorlesen.js";
import { mitUndo } from "../clara/rueckgaengig.js";
import {
  AKTIV, KonfliktFehler, STATUS, STATUS_TEXT, hkpAktualisieren, hkpAnlegen, hkpDateiAnhaengen, hkpDateiLesen, hkpFeldSetzen, hkpLesen, hkpListe, kopf,
  praxisLaden, praxisSpeichern,
} from "../hkp/store.js";
import { befundErmitteln, datumDe } from "../hkp/befundQuelle.js";
import { detailSatz, euroSprech, hkpKurz, hkpTitel, liste, nurSummenFrage, summenAntwort, summenSatz, uebersichtSatz, versorgungSatz, zahlWort, zeitraumSatz } from "../hkp/sprech.js";
import { ereignisAus, imZeitraum, zeitraumAus } from "../hkp/zeitraum.js";

const router = express.Router();

const VERSORGUNG_TEXT = {
  teleskopprothese: "Teleskop-HKP", totalprothese: "Totalprothesen-HKP", kronen: "Kronen-HKP", bruecke: "Brücken-HKP",
  implantatkronen: "Implantat-HKP",
};
const VERSORGUNG_NAME = {
  teleskopprothese: "Teleskopprothese", totalprothese: "Totalprothese", kronen: "Kronen", bruecke: "Brücke",
  implantatkronen: "Implantatkronen",
};
const AENDERUNG_GUELTIG_MS = 5 * 60 * 1000;
const PRAXIS_FELDER = ["labor", "praxisPlz", "kzv", "gozFaktor", "mwstLabor", "eigenKasseProzent", "eigenPrivatAufschlag",
  "bemaListe", "gozListe", "belListe", "bebListe", "fzListe"];

const toolsAus = () => String(process.env.MAS_HKP_TOOLS || "").trim() === "0";

// ---------------------------------------------------------------------------
// Gemeinsames
// ---------------------------------------------------------------------------

const zahl = (x) => Math.round((Number(x) || 0) * 100) / 100;
export function summenAus(ergebnis) {
  const s = ergebnis.summen;
  return {
    gesamt: zahl(s.gesamt), festzuschuss: zahl(s.festzuschuss), kassenanteil: zahl(s.kassenanteil),
    eigenanteil: zahl(s.eigenanteil), material: zahl(s.fremdMat + s.eigenMat),
  };
}

const nameNorm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** HKPs eines Patienten: per patientId und — fuer in PlanR angelegte — per Name */
export async function hkpsVonPatient(clientId, patient, { liste: alle } = {}) {
  const pool = alle || await hkpListe(clientId);
  const label = nameNorm(`${patient.firstName || ""} ${patient.lastName || ""}`);
  return pool.filter((h) => (patient.id && h.patient?.id === patient.id) || (label && nameNorm(h.patient?.label) === label));
}

/** Doppelungen: aktive HKPs desselben Patienten fuer denselben Kiefer (ohne Kiefer: alle aktiven) */
export function doppelungen(hkps, kiefer) {
  return hkps.filter((h) => AKTIV.has(h.status) && (!kiefer || !h.kiefer || h.kiefer === kiefer));
}

const ORDINAL = [/\b(erste[nrsm]?|eins|1\.?)\b/, /\b(zweite[nrsm]?|zwei|2\.?)\b/, /\b(dritte[nrsm]?|drei|3\.?)\b/, /\b(vierte[nrsm]?|vier|4\.?)\b/];

/** Welcher HKP ist gemeint? auswahl: "der zweite", "Oberkiefer", "der neueste", "der wartende" */
export function waehleHkp(hkps, auswahl) {
  if (hkps.length <= 1) return hkps[0] || null;
  const a = String(auswahl || "").toLowerCase();
  if (!a) return null;
  const i = ORDINAL.findIndex((re) => re.test(a));
  if (i >= 0 && hkps[i]) return hkps[i];
  if (/neueste|letzte|aktuell|juengste|jüngste/.test(a)) return hkps[0];
  const nachKiefer = /oberkiefer|\bok\b|oben/.test(a) ? "OK" : /unterkiefer|\buk\b|unten/.test(a) ? "UK" : "";
  const nachStatus = /wartet|freigabe|entwurf/.test(a) ? "wartet_auf_freigabe" : /genehmigt/.test(a) ? "genehmigt" : /eingereicht/.test(a) ? "eingereicht" : "";
  const nachArt = HKP_ARTEN.find((re) => re.test(a)) || null;
  const passend = hkps.filter((h) => (!nachKiefer || h.kiefer === nachKiefer) && (!nachStatus || h.status === nachStatus)
    && (!nachArt || nachArt.test(String(h.versorgungText || "").toLowerCase())));
  return nachKiefer || nachStatus || nachArt ? (passend.length === 1 ? passend[0] : null) : null;
}
/** "den Teleskop-HKP", "die Brücke": Versorgungsart waehlt unter mehreren HKPs */
const HKP_ARTEN = [/teleskop/, /totalprothese|\btotal/, /br(?:ü|ue)cke/, /implantat/, /krone/, /modellguss|klammer/, /cover/];

const welcherFrage = (hkps, label) => `Für ${label} gibt es ${hkps.length} HKPs: ${hkps.slice(0, 4).map((h, i) => `${["erstens", "zweitens", "drittens", "viertens"][i]} ${hkpKurz(h)}`).join("; ")}. Welchen meinen Sie?`;

function patientVon(sel) {
  const firstName = String(sel.firstName || "").trim();
  const lastName = String(sel.lastName || "").trim();
  const g = String(sel.gender || sel.patientGender || "").toLowerCase();
  const anrede = g.startsWith("m") ? "Herrn " : g.startsWith("f") || g.startsWith("w") ? "Frau " : "";
  return {
    id: String(sel.id || ""), firstName, lastName, birthDate: String(sel.birthDate || ""),
    label: `${firstName} ${lastName}`.trim() || "der Patient",
    anredeLabel: anrede ? `${anrede}${lastName}` : `${firstName} ${lastName}`.trim(),
  };
}

function planAus(h) {
  try { return E.planNormalisieren(JSON.parse(h.planJson || "{}")); } catch { return null; }
}

const praxisListen = (p) => ({ preislisten: p.preislisten, eigen: p.eigen });

/** Kurzfassung der Annahmen fuer den gesprochenen Satz (Abformung/Material nicht, wenn die Ausfuehrung schon gesagt wurde) */
export function annahmenSatz(hinweise = [], warnungen = [], { ausfuehrungGesagt = false } = {}) {
  const a = [];
  if (hinweise.some((h) => h.startsWith("Bonus nicht bekannt"))) a.push("Bonus sechzig Prozent");
  if (!ausfuehrungGesagt && hinweise.some((h) => h.startsWith("Abformung nicht genannt"))) a.push("konventioneller Abdruck");
  const mat = warnungen.find((w) => w.startsWith("Kronenmaterial nicht gewählt"));
  if (mat && !ausfuehrungGesagt) a.push("Nichtedelmetall als Kronenmaterial");
  return a.length ? ` Angenommen habe ich ${liste(a)} – das können Sie in PlanR anpassen.` : "";
}

// Ausfuehrung klaeren wie eine Helferin, die PlanR bedient (Chef 06.10.2026: "sie sagte NEM, ich wollte
// Zirkonkeramik", kein Scan/Abdruck, kein Eigen-/Fremdlabor, bei Implantaten das System). Gefragt wird
// EINMAL je Patient; was danach noch fehlt, gilt als Standard und steht in der Vorschau.
// Notaus MAS_HKP_AUSFUEHRUNG_FRAGE=0.
const AUSFUEHRUNG_MS = 15 * 60 * 1000;
const ausfuehrungGefragt = new Map();
const ausfuehrungFrageAus = () => process.env.MAS_HKP_AUSFUEHRUNG_FRAGE === "0";
const STANDARD_RE = /\b(?:standard|wie (?:immer|(?:ü|ue)blich|sonst)|egal)\b/i;

/** Implantatsystem der Praxis, wenn der Auftrag keins nennt (meddent: medentis ICX) */
export const implantatStandard = (praxis) =>
  String(praxis?.einstellungen?.implantatSystem || process.env.MAS_HKP_IMPLANTATSYSTEM || "medentis-icx");

/** Was zur Ausfuehrung nicht gesagt wurde: werkstoff, abformung, labor, implantatSystem */
export function ausfuehrungFehlt(auftrag, z) {
  const teile = auftrag?.teile?.length ? auftrag.teile : [];
  const gesagt = (k) => [auftrag, ...teile].some((x) => x && x[k] !== undefined && x[k] !== "");
  const festsitzend = [z?.kronen, z?.glieder, z?.implantatkronen, z?.teleskope].some((x) => x?.length);
  const fehlt = [];
  if (festsitzend && !gesagt("werkstoff")) fehlt.push("werkstoff");
  if (festsitzend && !gesagt("abformung")) fehlt.push("abformung");
  if (!gesagt("labor")) fehlt.push("labor");
  if (z?.implantatkronen?.length && !gesagt("implantatSystem")) fehlt.push("implantatSystem");
  return fehlt;
}

export function ausfuehrungFrage(fehlt, { nurTeleskope = false, system = "medentis-icx" } = {}) {
  const teile = [];
  if (fehlt.includes("werkstoff")) {
    teile.push(nurTeleskope ? "Teleskope in Nichtedelmetall oder Gold?" : "Welches Material – Nichtedelmetall, Zirkon, Presskeramik oder Gold?");
  }
  if (fehlt.includes("abformung")) teile.push("Intraoralscan oder konventioneller Abdruck?");
  if (fehlt.includes("labor")) teile.push("Eigenlabor oder Fremdlabor?");
  if (fehlt.includes("implantatSystem")) teile.push(`Implantatsystem wie üblich ${E.systemSprech(system)} oder ein anderes?`);
  return `Noch zur Ausführung: ${teile.join(" ")}`;
}

const ausfuehrungSchluessel = (clientId, patient) => `${clientId}|${patient?.id || patient?.label || ""}`;

export function ausfuehrungSchonGefragt(clientId, patient, jetzt = Date.now()) {
  const at = ausfuehrungGefragt.get(ausfuehrungSchluessel(clientId, patient));
  return at !== undefined && jetzt - at <= AUSFUEHRUNG_MS;
}

function ausfuehrungMerken(clientId, patient, jetzt = Date.now()) {
  for (const [k, at] of ausfuehrungGefragt) if (jetzt - at > AUSFUEHRUNG_MS) ausfuehrungGefragt.delete(k);
  ausfuehrungGefragt.set(ausfuehrungSchluessel(clientId, patient), jetzt);
}

/** Rueckfrage zur Ausfuehrung vor der Vorschau – oder null (alles gesagt, schon gefragt, "wie immer") */
export function ausfuehrungRueckfrage(clientId, patient, auftragText, auftrag, entwurf, system) {
  if (ausfuehrungFrageAus() || STANDARD_RE.test(String(auftragText || ""))) return null;
  const fehlt = ausfuehrungFehlt(auftrag, entwurf.zusammenfassung);
  if (!fehlt.length || ausfuehrungSchonGefragt(clientId, patient)) return null;
  ausfuehrungMerken(clientId, patient);
  const z = entwurf.zusammenfassung;
  const nurTeleskope = z.teleskope.length > 0 && !z.kronen.length && !z.implantatkronen.length;
  return { ok: true, rueckfrage: "ausfuehrung", fehlt, message: ausfuehrungFrage(fehlt, { nurTeleskope, system }) };
}

const ausfuehrungText = (plan) => (plan?.positionen?.length ? E.ausfuehrungSatz(E.ausfuehrungVon(plan)) : "");

// ---------------------------------------------------------------------------
// PlanR (Praxis-Schluessel)
// ---------------------------------------------------------------------------

function schluesselOk(req) {
  const soll = String(process.env.PLANR_HKP_KEY || "").trim();
  const ist = String(req.header("X-PlanR-Key") || "").trim();
  if (!soll || !ist) return false;
  const a = Buffer.from(soll), b = Buffer.from(ist);
  return a.length === b.length && timingSafeEqual(a, b);
}

function planrGuard(req, res, next) {
  if (!String(process.env.PLANR_HKP_KEY || "").trim()) return res.status(503).json({ ok: false, error: "planr_key_fehlt", message: "In MAS ist kein PLANR_HKP_KEY eingerichtet." });
  if (!schluesselOk(req)) return res.status(401).json({ ok: false, error: "schluessel_falsch" });
  req.planrClientId = String(req.query?.clientId || process.env.PLANR_HKP_CLIENT_ID || DEFAULT_CLIENT_ID).trim();
  res.set("Cache-Control", "no-store");
  next();
}

// Lese-Link fuer genau EINEN HKP (SMS an den Chef): ohne Praxis-Schluessel im
// Browser, nur lesend, befristet. Signiert mit PLANR_HKP_KEY.
// Freigabe-Schluessel (zweck "hkp-freigabe"): erlaubt zusaetzlich Regler-Stand
// speichern + freigeben. Geht NUR ueber die Karte an die angemeldete Clara-App,
// nie in eine SMS.
const LINK_TAGE = 14;
const FREIGABE_TAGE = 3;
const signatur = (zweck, id, exp) => createHmac("sha256", String(process.env.PLANR_HKP_KEY || "").trim())
  .update(`${zweck}:${id}:${exp}`).digest("base64url").slice(0, 24);

const standardClient = () => String(process.env.PLANR_HKP_CLIENT_ID || DEFAULT_CLIENT_ID).trim();
const signierteId = (id, clientId) => (clientId && clientId !== standardClient() ? `${clientId}/${id}` : id);

function tokenFuer(zweck, tage, id, clientId, jetztMs) {
  if (!String(process.env.PLANR_HKP_KEY || "").trim() || !id) return "";
  const exp = Math.floor(jetztMs / 1000) + tage * 86400;
  return `${exp}.${signatur(zweck, signierteId(id, clientId), exp)}`;
}

function tokenOk(zweck, id, token, clientId, jetztMs) {
  const [expRoh, sig] = String(token || "").split(".");
  const exp = Number(expRoh);
  if (!id || !sig || !Number.isFinite(exp) || exp * 1000 < jetztMs) return false;
  if (!String(process.env.PLANR_HKP_KEY || "").trim()) return false;
  const a = Buffer.from(signatur(zweck, signierteId(id, clientId), exp)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const hkpLinkToken = (id, jetztMs = Date.now(), clientId = "") => tokenFuer("hkp-link", LINK_TAGE, id, clientId, jetztMs);
export const hkpLinkOk = (id, token, jetztMs = Date.now(), clientId = "") => tokenOk("hkp-link", id, token, clientId, jetztMs);
export const hkpFreigabeToken = (id, jetztMs = Date.now(), clientId = "") => tokenFuer("hkp-freigabe", FREIGABE_TAGE, id, clientId, jetztMs);
export const hkpFreigabeOk = (id, token, jetztMs = Date.now(), clientId = "") => tokenOk("hkp-freigabe", id, token, clientId, jetztMs);

const planrBasis = () => String(process.env.PLANR_PUBLIC_URL || "https://hkp.pickadoc-tunnel.com").replace(/\/+$/, "");
const clientParam = (clientId) => (clientId && clientId !== standardClient() ? `&c=${encodeURIComponent(clientId)}` : "");

export function hkpLink(id, clientId = "") {
  const t = hkpLinkToken(id, Date.now(), clientId);
  return t ? `${planrBasis()}/?hkp=${encodeURIComponent(id)}&t=${t}${clientParam(clientId)}` : "";
}

/** Handy-Ansicht mit Reglern und Freigabe-Knopf (nur fuer die Karte in der Clara-App) */
export function hkpMobilLink(id, clientId = "") {
  const t = hkpLinkToken(id, Date.now(), clientId);
  const f = hkpFreigabeToken(id, Date.now(), clientId);
  return t && f ? `${planrBasis()}/?hkp=${encodeURIComponent(id)}&t=${t}&f=${f}${clientParam(clientId)}&ansicht=mobil` : "";
}

/** Karte fuers Handy: Clara flippt nach dem Anlegen/Vorlesen auf die Regler-Ansicht. Notaus MAS_HKP_KARTE=0. */
export function hkpKarte(h, clientId = "") {
  if (process.env.MAS_HKP_KARTE === "0" || !h?.id) return null;
  const url = hkpMobilLink(h.id, clientId);
  if (!url) return null;
  const s = h.summen || {};
  const euro = (x) => `${(Number(x) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const wartet = h.status === "wartet_auf_freigabe";
  return {
    kind: "hkp", hkpId: h.id, url, status: h.status,
    tag: `HKP · ${STATUS_TEXT[h.status] || h.status}`,
    title: h.patient?.label || "HKP",
    subtitle: hkpTitel(h),
    heading: "Kosten",
    items: [
      { icon: "euro", level: "info", text: `Gesamt ${euro(s.gesamt)}` },
      { icon: "check", level: "ok", text: `Festzuschuss ${euro(s.kassenanteil ?? s.festzuschuss)}` },
      { icon: "person", level: "warn", text: `Eigenanteil ${euro(s.eigenanteil)}` },
    ],
    footer: wartet ? "Regler und Freigabe: Karte antippen" : "Regler ansehen: Karte antippen",
  };
}

function linkClient(req) {
  const c = String(req.query?.c || "").trim();
  return /^[\w-]{1,80}$/.test(c) ? c : standardClient();
}

router.get("/planr/hkp-link/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const clientId = linkClient(req);
  if (!hkpLinkOk(req.params.id, req.header("X-PlanR-Link") || req.query?.t, Date.now(), clientId)) {
    return res.status(401).json({ ok: false, error: "link_ungueltig", message: "Der Link ist abgelaufen oder ungültig." });
  }
  try {
    const h = await hkpLesen(clientId, req.params.id);
    if (!h) return res.status(404).json({ ok: false, error: "nicht_gefunden" });
    const plan = planAus(h);
    const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [] }));
    res.json({
      ok: true, hkp: h,
      listen: plan ? E.listenFuer(plan, praxisListen(praxis)) : null,
      freigabe: hkpFreigabeOk(req.params.id, req.header("X-PlanR-Freigabe"), Date.now(), clientId),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Freigabe vom Handy (Regler-Stand + Status). Gerechnet wird hier neu mit den
// Praxis-Listen; Patient bleibt der des gespeicherten Plans.
router.put("/planr/hkp-link/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const id = req.params.id;
  const clientId = linkClient(req);
  if (!hkpLinkOk(id, req.header("X-PlanR-Link"), Date.now(), clientId) || !hkpFreigabeOk(id, req.header("X-PlanR-Freigabe"), Date.now(), clientId)) {
    return res.status(401).json({ ok: false, error: "freigabe_ungueltig", message: "Freigeben geht nur aus der Clara-App heraus – der Link ist abgelaufen oder nur zum Ansehen." });
  }
  const b = req.body || {};
  if (b.status !== "freigegeben") return res.status(400).json({ ok: false, error: "nur_freigabe" });
  if (b.version === undefined || b.version === null) return res.status(400).json({ ok: false, error: "version_fehlt" });
  try {
    const felder = { status: "freigegeben", freigegeben: new Date().toISOString(), offeneAenderung: null };
    const was = [];
    if (b.plan) {
      const alt = await hkpLesen(clientId, id);
      if (!alt) return res.status(404).json({ ok: false, error: "nicht_gefunden" });
      const plan = E.planNormalisieren(b.plan);
      const vorher = planAus(alt);
      if (vorher) plan.patient = vorher.patient;
      const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [] }));
      const ergebnis = E.rechnen(plan, praxisListen(praxis));
      Object.assign(felder, { planJson: JSON.stringify(plan), summen: summenAus(ergebnis), zusammenfassung: E.zusammenfassen(plan, ergebnis) });
      was.push("Regler auf dem Handy angepasst");
    }
    was.push("auf dem Handy freigegeben");
    const h = await hkpAktualisieren(clientId, id, {
      version: b.version, felder, wer: "Handy", was: was.join(", "),
      pruefen: (a) => {
        if (a.status === "wartet_auf_freigabe") return;
        const e = new Error("status");
        e.code = "status";
        e.status = a.status;
        throw e;
      },
    });
    log.info?.(`[hkp] ${id} auf dem Handy freigegeben${b.plan ? " (mit Regler-Stand)" : ""}`);
    res.json({ ok: true, hkp: kopf(h) });
  } catch (e) {
    if (e instanceof KonfliktFehler) return res.status(409).json({ ok: false, error: "version_konflikt", message: "Der HKP wurde inzwischen geändert – bitte neu laden.", aktuell: e.aktuell });
    if (e?.code === "status") return res.status(409).json({ ok: false, error: "nicht_wartend", message: `Der HKP ist schon ${STATUS_TEXT[e.status] || e.status}.` });
    if (e?.code === "nicht_gefunden") return res.status(404).json({ ok: false, error: "nicht_gefunden" });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/planr/status", planrGuard, async (req, res) => {
  try {
    const p = await praxisLaden(req.planrClientId);
    res.json({ ok: true, engineStand: E.ENGINE_STAND, clientId: req.planrClientId, praxis: { aktualisiert: p.aktualisiert, preislisten: p.preislisten.length, eigen: p.eigen.length } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/planr/hkp", planrGuard, async (req, res) => {
  try {
    const alle = await hkpListe(req.planrClientId);
    // ?link=1 (PlanR-Uebersicht): Lese-Link je HKP, damit der Planer ihn auch ueber den Tunnel ohne Schluessel oeffnet
    const mitLink = req.query?.link === "1";
    const c = req.planrClientId !== standardClient() ? req.planrClientId : undefined;
    res.json({
      ok: true,
      hkps: alle.map((h) => (mitLink ? { ...kopf(h), link: { t: hkpLinkToken(h.id, Date.now(), req.planrClientId), ...(c ? { c } : {}) } } : kopf(h))),
      engineStand: E.ENGINE_STAND,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/planr/hkp/:id", planrGuard, async (req, res) => {
  try {
    const h = await hkpLesen(req.planrClientId, req.params.id);
    if (!h) return res.status(404).json({ ok: false, error: "nicht_gefunden" });
    res.json({ ok: true, hkp: h });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/planr/hkp/:id/datei/:dateiId", planrGuard, async (req, res) => {
  try {
    const d = await hkpDateiLesen(req.planrClientId, req.params.id, req.params.dateiId);
    if (!d) return res.status(404).json({ ok: false, error: "nicht_gefunden", message: "Die Datei gibt es an diesem HKP nicht." });
    res.json({ ok: true, datei: { name: d.name, typ: d.typ, inhalt: d.inhalt } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

function ausPlanR(body) {
  const plan = E.planNormalisieren(body.plan || {});
  const ergebnis = E.rechnen(plan, {});
  const z = E.zusammenfassen(plan, ergebnis);
  return { plan, summen: body.summen || summenAus(ergebnis), zusammenfassung: body.zusammenfassung || z };
}

router.post("/planr/hkp", planrGuard, async (req, res) => {
  try {
    const { plan, summen, zusammenfassung } = ausPlanR(req.body || {});
    const label = `${plan.patient.vorname || ""} ${plan.patient.name || ""}`.trim();
    if (!label) return res.status(400).json({ ok: false, error: "patient_fehlt", message: "Bitte zuerst Name und Vorname des Patienten eintragen." });
    const status = STATUS.includes(req.body?.status) ? req.body.status : "wartet_auf_freigabe";
    const kiefer = ["OK", "UK"].includes(req.body?.kiefer) ? req.body.kiefer : "";
    const h = await hkpAnlegen(req.planrClientId, {
      patient: { id: String(req.body?.patientId || ""), firstName: plan.patient.vorname || "", lastName: plan.patient.name || "", birthDate: plan.patient.geburtsdatum || "", label },
      art: "kasse", status, kiefer, versorgung: "", versorgungText: String(req.body?.versorgungText || "HKP").slice(0, 80),
      auftragText: "", befundQuelle: { art: "planr" }, planJson: JSON.stringify(plan), summen, zusammenfassung,
      hinweise: [], engineStand: E.ENGINE_STAND, erstelltVon: "planr", verlaufText: "in PlanR angelegt",
    }, "PlanR");
    res.json({ ok: true, hkp: kopf(h) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.put("/planr/hkp/:id", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const felder = {};
    const was = [];
    if (b.plan) {
      const { plan, summen, zusammenfassung } = ausPlanR(b);
      Object.assign(felder, { planJson: JSON.stringify(plan), summen, zusammenfassung, offeneAenderung: null });
      const label = `${plan.patient.vorname || ""} ${plan.patient.name || ""}`.trim();
      if (label) Object.assign(felder, { "patient.label": label, "patient.firstName": plan.patient.vorname || "", "patient.lastName": plan.patient.name || "" });
      was.push("in PlanR bearbeitet");
    }
    if (b.status) {
      if (!STATUS.includes(b.status)) return res.status(400).json({ ok: false, error: "status_unbekannt" });
      felder.status = b.status;
      if (b.status === "freigegeben") felder.freigegeben = new Date().toISOString();
      was.push(`Status: ${STATUS_TEXT[b.status]}`);
    }
    if (typeof b.versorgungText === "string" && b.versorgungText.trim()) felder.versorgungText = b.versorgungText.trim().slice(0, 80);
    if (["OK", "UK", ""].includes(b.kiefer)) felder.kiefer = b.kiefer;
    if (!Object.keys(felder).length) return res.status(400).json({ ok: false, error: "nichts_zu_tun" });
    const h = await hkpAktualisieren(req.planrClientId, req.params.id, {
      version: b.version, felder, wer: "PlanR", was: was.join(", ") || "in PlanR geändert",
    });
    res.json({ ok: true, hkp: kopf(h) });
  } catch (e) {
    if (e instanceof KonfliktFehler) return res.status(409).json({ ok: false, error: "version_konflikt", aktuell: e.aktuell });
    if (e?.code === "nicht_gefunden") return res.status(404).json({ ok: false, error: "nicht_gefunden" });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/planr/praxis", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const einstellungen = Object.fromEntries(Object.entries(b.einstellungen || {}).filter(([k]) => PRAXIS_FELDER.includes(k)));
    const r = await praxisSpeichern(req.planrClientId, {
      preislisten: Array.isArray(b.preislisten) ? b.preislisten : [], eigen: Array.isArray(b.eigen) ? b.eigen : [], einstellungen,
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ---------------------------------------------------------------------------
// Clara-Tools
// ---------------------------------------------------------------------------

async function claraVorspann(req, res) {
  const clientId = resolveClientId(req);
  if (toolsAus()) {
    res.json({ ok: false, message: "Die HKP-Funktion ist gerade abgeschaltet. Bitte den HKP in PlanR anlegen." });
    return null;
  }
  if (!(await assertAppEnabled(clientId, "clara"))) {
    res.status(403).json({ error: "clara_not_entitled", clientId });
    return null;
  }
  return clientId;
}

const wahr = (v) => v === true || ["true", "1", "ja", "yes"].includes(String(v || "").trim().toLowerCase());

function abstand(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let vorher = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, vorher + (a[i - 1] === b[j - 1] ? 0 : 1));
      vorher = tmp;
    }
  }
  return d[b.length];
}

const ANREDE = new Set(["herr", "herrn", "frau", "patient", "patientin", "patienten", "den", "die", "der", "dem", "einen", "eine", "fuer"]);

/** Nur der Vorname des gerade gemerkten Patienten ("Patienten Michael" nach "Michael Petzas") */
export function nurVornamePasst(gesprochen, p) {
  const sp = nameNorm(gesprochen).split(" ").filter((t) => t && !ANREDE.has(t));
  const vor = nameNorm(p?.firstName);
  return sp.length === 1 && !!vor && (sp[0] === vor || soundsSame(sp[0], vor));
}

/** Passt ein gesprochener Name (STT: "Petzers") zum Patienten ("Michael Petzas")? 0 = nein, 1 = Nachname, 2 = Vor- und Nachname */
export function namePasst(gesprochen, p) {
  const sp = nameNorm(gesprochen).split(" ").filter((t) => t && !ANREDE.has(t));
  const nach = nameNorm(p?.lastName), vor = nameNorm(p?.firstName);
  if (!sp.length || !nach) return 0;
  const n = sp[sp.length - 1];
  const nachOk = soundsSame(n, nach) || abstand(n, nach) <= (nach.length >= 5 ? 2 : 1);
  if (!nachOk) return 0;
  if (sp.length < 2) return 1;
  const v = sp[0];
  return v === vor || soundsSame(v, vor) ? 2 : 0;
}

export function bestePassung(gesprochen, kandidaten) {
  const bewertet = kandidaten.map((c) => ({ c, s: namePasst(gesprochen, c) })).filter((x) => x.s > 0);
  const top = Math.max(0, ...bewertet.map((x) => x.s));
  const beste = bewertet.filter((x) => x.s === top).map((x) => x.c);
  if (beste.length < 2) return beste;
  const nach = nameNorm(gesprochen).split(" ").filter((t) => t && !ANREDE.has(t)).pop();
  const genau = beste.filter((c) => nameNorm(c.lastName) === nach);
  return genau.length ? genau : beste;
}

// Gleich klingende Kartei-Eintraege (Petsas/Petzas) sind per Sprache nicht
// unterscheidbar: vor einer HKP-Anlage wird mit Jahrgang nachgefragt.
const VETTERN_MS = 10 * 60 * 1000;
const vetternOffen = new Map();
/** Getroffene Wahl gilt fuer die Folgeschritte desselben Auftrags (Doppelung, Befund, Korrektur) */
const vetterWahl = new Map();
const vetternAus = () => process.env.MAS_HKP_NAMENSVETTER === "0";

export function vetterSchonGewaehlt(wahl, patient, jetzt = Date.now()) {
  return !!wahl && !!patient?.id && jetzt - wahl.at < VETTERN_MS && String(wahl.id) === String(patient.id);
}

/** Vornamen einer Person in zwei Schreibweisen (Kyriakos/Kiriakos, Christina/Kristina) */
export function vornameGleich(v1, v2) {
  if (v1 === v2) return true;
  if (!v1 || !v2) return false;
  if (vornameStreng()) {
    // Koelner Phonetik allein ist fuer Vornamen zu grob: Kiriakos und Georgios
    // haben denselben Code (Anruf 06.10.2026 17:22, Tzannis/Zannas).
    const d = abstand(v1, v2);
    return d <= 1 || (d <= 2 && soundsSame(v1, v2));
  }
  return soundsSame(v1, v2);
}
const vornameStreng = () => process.env.MAS_HKP_VETTER_VORNAME !== "0";

/** Gleich klingende andere Patienten (gleicher Vorname, Nachname klingt gleich oder 1 Buchstabe Abstand) */
export function sindVettern(p, q) {
  if (!p?.lastName || !q?.lastName || String(p.id || "") === String(q.id || "")) return false;
  const v1 = nameNorm(p.firstName), v2 = nameNorm(q.firstName);
  const n1 = nameNorm(p.lastName), n2 = nameNorm(q.lastName);
  const vorOk = vornameGleich(v1, v2);
  return !!vorOk && (n1 === n2 || soundsSame(n1, n2) || abstand(n1, n2) <= 1);
}

async function namensvettern(clientId, patient) {
  const treffer = await findInCatalog(clientId, `${patient.firstName} ${patient.lastName}`, { limit: 8 });
  const ids = treffer.filter((e) => sindVettern(patient, { id: e.i, firstName: e.f, lastName: e.l })).map((e) => e.i);
  return ids.length ? fetchPatientsByIds(clientId, ids) : [];
}

/** Antwort auf die Namensvetter-Rueckfrage: { wahl } | { erneut } | null (anderer Name) */
export function vetterAntwort(offen, text, antwort = text) {
  const t = String(text || "").trim();
  // "eins"/"zwei" waehlen nur als Kurzantwort; im Satz sind es Zahnnummern oder Mengen ("zwei Kronen").
  const ord = String(antwort || "").trim().split(/\s+/).length <= 3 ? t : t.replace(/\b(?:eins|zwei|drei)\b/gi, " ");
  const wahl = ordinalPick(ord.toLowerCase(), offen.kandidaten) || jahrgangWahl(t, offen.kandidaten);
  if (wahl) return { wahl };
  // Live 06.10.2026: "Petsas." auf Petzas/Petsas – die genaue Schreibweise der Antwort entscheidet
  // (nicht der Name aus dem Auftrag; vorgelesen wird danach mit Geburtsdatum).
  const woerter = new Set(nameNorm(antwort).split(" ").filter(Boolean));
  const genau = offen.kandidaten.filter((p) => woerter.has(nameNorm(p.lastName)));
  if (genau.length === 1) return { wahl: genau[0] };
  if (!t || offen.kandidaten.some((p) => namePasst(t, p) > 0)) return { erneut: offen.kandidaten };
  return null;
}

async function patientAufloesen(clientId, body, askWho, { vettern = false } = {}) {
  const rawName = String(body?.name || "").trim();
  const hint = String(body?.hint || "").trim();
  const offen = vettern ? vetternOffen.get(clientId) : null;
  if (offen && Date.now() - offen.at < VETTERN_MS) {
    const a = vetterAntwort(offen, `${hint} ${rawName}`, hint);
    if (a?.wahl) {
      vetternOffen.delete(clientId);
      vetterWahl.set(clientId, { id: a.wahl.id, at: Date.now() });
      await setPatientCandidates(clientId, [a.wahl], a.wahl);
      return { patient: patientVon(a.wahl), sel: a.wahl, gewaehlt: true };
    }
    if (a?.erneut) return { antwort: { ok: true, rueckfrage: "namensvetter", message: vetternFrage(a.erneut, { erneut: true }) } };
  }
  if (vettern) vetternOffen.delete(clientId);
  // Gerade per search_patient bestimmt ("Michael Petzas ist eindeutig gemerkt")?
  // Dann gewinnt der gemerkte Patient, wenn der gesprochene Name aehnlich klingt
  // (Gespraech 05.10.2026: "Petzers" lieferte sonst 21 Kandidaten).
  if (rawName && !hint) {
    const gemerkt = await getPatientCandidates(clientId);
    const passend = bestePassung(rawName, gemerkt);
    if (passend.length === 1) {
      await setPatientCandidates(clientId, passend, passend[0]);
      return { patient: patientVon(passend[0]), sel: passend[0] };
    }
    // Live 05.10.2026 22:45: Nachname ging verloren, "Michael" lieferte 20 Michaels.
    if (gemerkt.length === 1 && process.env.MAS_HKP_VORNAME_ANKER !== "0" && nurVornamePasst(rawName, gemerkt[0])) {
      log.info?.("[hkp] nur Vorname genannt -> gemerkter Patient bleibt");
      return { patient: patientVon(gemerkt[0]), sel: gemerkt[0] };
    }
  }
  if (rawName || hint) {
    const eng = merkmalEingrenzen(`${hint} ${rawName}`, await getPatientCandidates(clientId));
    if (eng.length === 1) {
      await setPatientCandidates(clientId, eng, eng[0]);
      return { patient: patientVon(eng[0]), sel: eng[0] };
    }
  }
  const r = await resolveSpokenPatientForRead(clientId, { rawName, hint, askWho });
  if (!r.done) return { patient: patientVon(r.sel), sel: r.sel };
  const kandidaten = rawName ? await getPatientCandidates(clientId) : [];
  if (kandidaten.length > 1) {
    const passend = bestePassung(rawName, kandidaten);
    if (passend.length === 1) {
      await setPatientCandidates(clientId, passend, passend[0]);
      return { patient: patientVon(passend[0]), sel: passend[0] };
    }
    const auswahl = passend.length > 1 ? passend : kandidaten;
    await setPatientCandidates(clientId, auswahl, null);
    if (vettern && !vetternAus() && auswahl.length <= 5 && auswahl.every((x, i) => !i || sindVettern(auswahl[0], x))) {
      vetternOffen.set(clientId, { kandidaten: auswahl, at: Date.now() });
      return { antwort: { ok: true, rueckfrage: "namensvetter", message: vetternFrage(auswahl) } };
    }
    return { antwort: { ok: true, message: disambiguationQuestion(auswahl, { max: 3 }) } };
  }
  return { antwort: r.payload };
}

/**
 * Ist jedes Wort des gesagten Namens der Anfang von Vor- oder Nachname? ("Nektarios Papa" ->
 * Nektarios Papagrigoriou). Live 09.10.2026: so gefragt, fand die Kartei 21 Patienten.
 */
export function teilNamePasst(name, patient) {
  const falten = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const namen = [patient?.firstName, patient?.lastName].map(falten).filter(Boolean);
  const woerter = String(name || "").split(/[\s-]+/).map(falten).filter(Boolean);
  return !!woerter.length && woerter.every((w) => w.length >= 3 && namen.some((n) => n.startsWith(w)));
}

/** HKP eines Patienten bestimmen (mit Rueckfrage bei mehreren) */
async function hkpAufloesen(clientId, body, askWho) {
  const name = String(body?.name || "").trim();
  if (!String(body?.hint || "").trim() && !String(body?.auswahl || "").trim()) {
    const l = letzterHkp.get(clientId);
    const h = l && Date.now() - l.at < LETZTER_MS ? await hkpLesen(clientId, l.id).catch(() => null) : null;
    if (h && (!name || teilNamePasst(name, h.patient))) {
      letzterMerken(clientId, h);
      return { patient: { ...h.patient, anredeLabel: h.patient?.anredeLabel || h.patient?.label }, hkp: h };
    }
  }
  const p = await patientAufloesen(clientId, body, askWho);
  if (p.antwort) return p;
  const hkps = await hkpsVonPatient(clientId, p.patient);
  if (!hkps.length) return { antwort: { ok: true, message: `Für ${p.patient.anredeLabel} gibt es noch keinen HKP.` } };
  const h = waehleHkp(hkps, body?.auswahl || body?.hint);
  if (!h) return { antwort: { ok: true, message: welcherFrage(hkps, p.patient.anredeLabel), hkpAuswahl: hkps.map((x) => x.id) } };
  letzterMerken(clientId, h);
  return { patient: p.patient, hkp: h };
}

// Kiefer-Waechter (Live 05.10.2026: "totale OK- und totale UK-Prothese" -> nur OK angelegt,
// Clara sagte "fuer beide Kiefer"). Genannter, aber ungeplanter Kiefer => nichts anlegen.
// Ausnahme: der Kiefer steht nur mit einem Befund im Satz ("unten bleibt alles").
// Notaus MAS_HKP_KIEFER_CHECK=0.
export function vergessenerKiefer(text, auftrag) {
  if (process.env.MAS_HKP_KIEFER_CHECK === "0") return "";
  const t = String(text || "").toLowerCase();
  const beide = /\bbeide[nr]?\s+kiefer|\bober-?\s+und\s+unter|\bok\s+und\s+uk\b|\boben\s+und\s+unten\b|\bunten\s+und\s+oben\b/.test(t);
  const genannt = {
    OK: beide || /ober\s*-?\s*k\S*f+er|\bok\b|\boben\b/.test(t),
    UK: beide || /unter\s*-?\s*k\S*f+er|\buk\b|\bunten\b/.test(t),
  };
  const geplant = new Set((auftrag?.teile?.length ? auftrag.teile : [auftrag]).map((x) => x?.kiefer).filter(Boolean));
  if (!geplant.size) return "";
  if (/bleib|erhalt|vorhanden|nichts|\bkein|gesund|intakt|so lassen/.test(t)) return "";
  return ["OK", "UK"].find((k) => genannt[k] && !geplant.has(k)) || "";
}

// Angelegt wird nur, was vorgelesen und mit Ja bestaetigt wurde.
const VORSCHAU_MS = 10 * 60 * 1000;
// Je Praxis mehrere offene Vorschauen (eine je Patient): der Chef plant mehrere HKPs nebeneinander.
const VORSCHAU_MAX = 6;
const vorschauOffen = new Map();

function vorschauen(clientId, jetzt = Date.now()) {
  const alle = (vorschauOffen.get(clientId) || []).filter((v) => jetzt - v.at <= VORSCHAU_MS);
  vorschauOffen.set(clientId, alle);
  return alle;
}

function vorschauMerken(clientId, v) {
  const alle = vorschauen(clientId);
  const vorher = alle.find((x) => x.patient?.id === v.patient?.id);
  const namen = [...new Set([...(vorher?.namenGesagt || []), ...(v.namenGesagt || [])].filter(Boolean))].slice(-4);
  const rest = alle.filter((x) => x !== vorher);
  vorschauOffen.set(clientId, [{ ...v, namenGesagt: namen }, ...rest].slice(0, VORSCHAU_MAX));
}

const vorschauWeg = (clientId, v) => vorschauOffen.set(clientId, vorschauen(clientId).filter((x) => x !== v));

/** Die Vorschau, die ein Aufruf meint: passender Auftrag, bei Namen nur dessen Patient; sonst die neueste */
export function vorschauFinden(liste, b, jetzt = Date.now()) {
  return (liste || []).find((v) => vorschauPasst(v, b, jetzt)) || null;
}
const vorlesenAus = () => process.env.MAS_HKP_VORLESEN === "0";
const textNorm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");

export function doppelungHinweis(doppelt, verwerfen = false) {
  const wartend = doppelt.filter((h) => h.status === "wartet_auf_freigabe");
  const kurz = `${doppelt.length === 1 ? "einen" : zahlWort(doppelt.length)} ${hkpKurz(doppelt[0])}${doppelt.length > 1 ? " und weitere" : ""}`;
  if (verwerfen && wartend.length) return `Den bestehenden ${hkpTitel(wartend[0])}${wartend.length > 1 ? " und die weiteren wartenden" : ""} verwerfe ich dabei.`;
  return `Achtung, es gibt schon ${kurz}. Der bleibt bestehen${wartend.length ? " – außer Sie sagen: alten verwerfen" : ""}.`;
}

/** Was die Engine aus einem Auftrag versteht – ohne den Wortlaut */
function auftragKern(text) {
  const a = E.auftragVerstehen(String(text || ""));
  const kern = (x) => ({
    versorgung: x.versorgung || "", kiefer: x.kiefer || "", pfeiler: [...(x.pfeiler || [])].sort(), glieder: [...(x.glieder || [])].sort(),
    entfernen: [...(x.entfernen || [])].sort(), erhalten: [...(x.erhalten || [])].sort(), coverDenture: !!x.coverDenture,
    mitAchtern: !!x.mitAchtern, werkstoff: x.werkstoff || "", abformung: x.abformung || "", bonus: x.bonus || "", haertefall: !!x.haertefall,
    labor: x.labor || "", implantatSystem: x.implantatSystem || "", privatStufe: x.privatStufe ?? "",
  });
  const teile = a.teile?.length ? a.teile : [a];
  return JSON.stringify({ teile: teile.map(kern), befund: E.befundVerstehen(E.befundAusAuftrag(String(text || "")), a.kiefer) });
}

/** Gilt ein bestaetigt=true-Aufruf der offenen Vorschau (gleicher Patient, kein neuer Auftragsinhalt)? */
export function vorschauPasst(vs, b, jetzt = Date.now()) {
  if (!vs || jetzt - vs.at > VORSCHAU_MS) return false;
  const name = String(b?.name || "").trim();
  // Live 09.10.2026 (Petsas): gehoert "Petzers" – die Vorschau kam unter diesem Namen, das Ja auch.
  const gesagt = (vs.namenGesagt || []).some((n) => textNorm(n) === textNorm(name));
  if (name && !gesagt && namePasst(name, vs.patient) === 0 && !nurVornamePasst(name, vs.patient)) return false;
  const auftrag = textNorm(b?.auftrag);
  if (!auftrag || textNorm(vs.auftragText).includes(auftrag)) return true;
  // Live 06.10.2026: Ja kam mit dem STT-Wortlaut ("Oberkäfertotalprothese"), vorgelesen war die Umschreibung
  try {
    return auftragKern(b.auftrag) === auftragKern(vs.auftragText);
  } catch {
    return false;
  }
}

function geplanteKiefer(auftrag, zusammenfassung) {
  const k = new Set((auftrag?.teile?.length ? auftrag.teile : [auftrag]).map((t) => t?.kiefer).filter(Boolean));
  if (!k.size) {
    for (const z of [...(zusammenfassung?.teleskope || []), ...(zusammenfassung?.kronen || []), ...(zusammenfassung?.ersetzt || [])]) {
      k.add(/^[12]/.test(String(z)) ? "OK" : "UK");
    }
  }
  return ["OK", "UK"].filter((x) => k.has(x));
}

// Folgefragen ohne Namen ("Was sind die Summen?") meinen den HKP, ueber den gerade gesprochen wurde.
const LETZTER_MS = 15 * 60 * 1000;
const letzterHkp = new Map();
const letzterMerken = (clientId, h) => h?.id && letzterHkp.set(clientId, { id: h.id, at: Date.now() });

/** Doppelte, noch nicht freigegebene HKPs verwerfen – freigegebene bleiben unberuehrt */
async function alteVerwerfen(clientId, doppelt, neu) {
  const weg = [];
  for (const h of doppelt.filter((x) => x.status === "wartet_auf_freigabe")) {
    try {
      await hkpAktualisieren(clientId, h.id, {
        version: h.version, felder: { status: "verworfen" }, wer: "Clara",
        was: `per Sprache verworfen, ersetzt durch ${hkpTitel(neu)} (${neu.id})`,
      });
      weg.push(h);
    } catch (e) {
      log.warn?.(`[hkp] verwerfen ${h.id}: ${e?.message || e}`);
    }
  }
  return weg;
}

// Befund jedes Clara-HKP als eigene Datei, KZBV-Befundkuerzel (Chef 09.10.2026): diktiert,
// aus Lena-01, beides oder aus dem Auftrag (Totalprothese: Kiefer zahnlos). Inhalt ist
// immer die Befundzeile des Plans. Notaus MAS_HKP_BEFUND_DATEI=0.
export function befundDateiBauen(hkpId, { befund, befundDiktat, auftrag, r }) {
  if (process.env.MAS_HKP_BEFUND_DATEI === "0" || !r?.plan) return null;
  const art = String(befund?.quelle?.art || "auftrag");
  const diktat = art.startsWith("gesprochen") ? String(befundDiktat || "").trim() : "";
  const datei = E.befundDatei(r.plan, {
    hkpId, diktat, diktiert: Object.keys(E.befundVerstehen(diktat, auftrag?.kiefer)), quelle: { ...befund?.quelle, art },
  });
  return { id: "befund", name: E.befundDateiName(datei), art: "befund", typ: "application/json", inhalt: JSON.stringify(datei, null, 2) };
}

async function befundDateiAnhaengen(clientId, h, d) {
  try {
    const datei = befundDateiBauen(h.id, d);
    if (!datei) return null;
    const meta = await hkpDateiAnhaengen(clientId, h.id, datei);
    log.info?.(`[hkp] ${h.id}: Befund-Datei ${meta.name} angehaengt`);
    return meta;
  } catch (e) {
    log.warn?.(`[hkp] ${h.id}: Befund-Datei nicht angehaengt: ${e?.message || e}`);
    return null;
  }
}

async function entwurfAnlegen(clientId, d) {
  const { patient, auftrag, auftragText, befund, r, summen, versorgungText, zusaetzlich, doppelt } = d;
  const h = await hkpAnlegen(clientId, {
    patient, art: "kasse", status: "wartet_auf_freigabe", kiefer: auftrag.kiefer || "", versorgung: auftrag.versorgung || "",
    versorgungText, auftragText, auftrag: JSON.parse(JSON.stringify(auftrag)), befundQuelle: befund.quelle,
    befundJson: JSON.stringify(befund.befund), planJson: JSON.stringify(r.plan), summen,
    zusammenfassung: r.zusammenfassung, hinweise: [...befund.hinweise, ...r.hinweise], engineStand: E.ENGINE_STAND,
    erstelltVon: "clara",
    verlaufText: `von Clara per Sprache angelegt${d.vorgelesen ? " (vorgelesen und bestätigt)" : ""}${zusaetzlich && doppelt.length ? " (bewusst zusätzlich zu einem bestehenden HKP)" : ""}`,
  }, "Clara");
  log.info?.(`[hkp] Entwurf ${h.id} angelegt (${versorgungText}, Befund ${befund.quelle?.art}, Patient ${patient.id})`);
  await befundDateiAnhaengen(clientId, h, d);
  letzterMerken(clientId, h);
  ausfuehrungGefragt.delete(ausfuehrungSchluessel(clientId, patient));
  const ausfuehrung = d.vorgelesen ? "" : ausfuehrungText(r.plan);
  const quelle = befund.quelle?.art?.includes("lena01") ? ` Befund aus der Lena-Erstuntersuchung vom ${datumDe(befund.quelle.datum)}.` : "";
  const weg = d.alteVerwerfen && doppelt?.length ? await alteVerwerfen(clientId, doppelt, h) : [];
  const wegSatz = weg.length ? ` Der alte ${hkpTitel(weg[0])}${weg.length > 1 ? " und weitere" : ""} ist verworfen.` : "";
  const card = hkpKarte(h, clientId);
  return {
    ok: true, hkpId: h.id, ...(card ? { card } : {}), ...(weg.length ? { verworfen: weg.map((x) => x.id) } : {}),
    ...mitUndo("hkp", { id: h.id, label: `den ${hkpTitel(h)} für ${patient.anredeLabel}`, alt: weg.map((x) => x.id) }),
    message: `Der ${hkpTitel(h)} für ${patient.anredeLabel} ist angelegt und wartet auf Ihre Freigabe in PlanR.${d.vorgelesen ? "" : ` Geplant: ${versorgungSatz(r.zusammenfassung)}.`}${ausfuehrung ? ` Ausführung: ${ausfuehrung}.` : ""} ${summenSatz(summen)}.${wegSatz}${quelle}${annahmenSatz(r.hinweise, r.zusammenfassung.warnungen, { ausfuehrungGesagt: true })}`,
  };
}

router.post("/tools/hkp-create-draft", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const auftragText = String(b.auftrag || "").trim();
    const vs = wahr(b.bestaetigt) ? vorschauFinden(vorschauen(clientId), b) : null;
    if (vs) {
      vorschauWeg(clientId, vs);
      vetterWahl.delete(clientId);
      return res.json(await entwurfAnlegen(clientId, {
        ...vs, vorgelesen: true, zusaetzlich: true, alteVerwerfen: vs.alteVerwerfen || wahr(b.alte_verwerfen),
      }));
    }
    const p = await patientAufloesen(clientId, b, "Für welchen Patienten soll ich den HKP erstellen?", { vettern: true });
    if (p.antwort) return res.json(p.antwort);
    const patient = p.patient;
    const gewaehlt = p.gewaehlt || vetterSchonGewaehlt(vetterWahl.get(clientId), p.sel || patient);
    const vettern = vetternAus() || gewaehlt ? [] : await namensvettern(clientId, patient).catch(() => []);
    if (vettern.length) {
      const kandidaten = [p.sel || patient, ...vettern];
      vetternOffen.set(clientId, { kandidaten, at: Date.now() });
      await setPatientCandidates(clientId, kandidaten, null);
      log.warn?.(`[hkp] Namensvetter zu ${patient.id}: ${vettern.map((v) => v.id).join(", ")} - Rueckfrage`);
      return res.json({ ok: true, rueckfrage: "namensvetter", message: vetternFrage(kandidaten) });
    }
    // Ohne Aufzaehlung (Chef 07.10.2026: "das nervt"). Clara erkennt die Rueckfrage
    // am Kern "Was soll ich fuer ... planen" (Diktat-Fenster, offener Auftrag).
    if (!auftragText) return res.json({ ok: true, message: `Gut, ich bin bereit. Was soll ich für ${patient.anredeLabel} planen?` });

    const auftrag = E.auftragVerstehen(auftragText);
    const vergessen = vergessenerKiefer(auftragText, auftrag);
    if (vergessen) {
      log.warn?.(`[hkp] Kiefer-Waechter: ${vergessen} genannt, aber nicht geplant – nichts angelegt`);
      const name = vergessen === "OK" ? "Oberkiefer" : "Unterkiefer";
      return res.json({
        ok: true, rueckfrage: "kiefer_fehlt",
        message: `Ich habe noch nichts angelegt: Sie haben auch den ${name} genannt, aber ich habe dafür keine Versorgung verstanden. Was soll ich im ${name} planen?`,
      });
    }
    if (!(auftrag.teile?.length ? auftrag.teile : [auftrag]).every((t) => t.versorgung)) {
      return res.json({
        ok: true, rueckfrage: "versorgung",
        message: `Welche Versorgung soll ich für ${patient.anredeLabel} planen?`,
      });
    }
    const alteWeg = wahr(b.alte_verwerfen);
    const zusaetzlich = wahr(b.zusaetzlich) || alteWeg;
    const doppelt = doppelungen(await hkpsVonPatient(clientId, patient), auftrag.kiefer);
    // Mit Vorlesen steht die Doppelung als Hinweis in der Vorschau – eine Frage weniger.
    if (doppelt.length && !zusaetzlich && vorlesenAus()) {
      return res.json({
        ok: true, doppelung: doppelt.map((h) => h.id),
        message: `Für ${patient.anredeLabel} gibt es schon ${doppelt.length === 1 ? "einen" : doppelt.length} ${hkpKurz(doppelt[0])}${doppelt.length > 1 ? " und weitere" : ""}. Soll ich trotzdem einen weiteren HKP anlegen?`,
      });
    }

    // Befund steckt oft im Auftrag selbst ("... die Sechser und Siebener fehlen").
    const befundDiktat = String(b.befund || "").trim() || E.befundAusAuftrag(auftragText);
    const befund = await befundErmitteln(clientId, patient, {
      gesprochen: befundDiktat,
      kiefer: auftrag.kiefer, bestaetigt: wahr(b.befund_bestaetigt),
      ohneBefundOk: (auftrag.teile?.length ? auftrag.teile : [auftrag]).every((t) => t.versorgung === "totalprothese"),
    });
    if (!befund.ok) return res.json({ ok: true, rueckfrage: befund.grund, message: befund.frage });

    const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [], einstellungen: {} }));
    const system = implantatStandard(praxis);
    const r = E.hkpEntwurf(auftragText, befund.befund, {
      patient: { name: patient.lastName, vorname: patient.firstName, geburtsdatum: patient.birthDate },
      einstellungen: praxis.einstellungen, implantatSystem: system,
    }, praxisListen(praxis));
    if (r.status !== "ok") return res.json({ ok: true, rueckfrage: r.grund, message: r.frage });
    const frage = ausfuehrungRueckfrage(clientId, patient, auftragText, auftrag, r, system);
    if (frage) return res.json(frage);

    const summen = summenAus(r.ergebnis);
    const versorgungText = auftrag.teile?.length > 1
      ? `HKP mit ${liste(auftrag.teile.map((t) => `${VERSORGUNG_NAME[t.versorgung] || t.versorgung} im ${t.kiefer === "OK" ? "Oberkiefer" : "Unterkiefer"}`))}`
      : VERSORGUNG_TEXT[auftrag.versorgung] || "HKP";
    const daten = { patient, auftrag, auftragText, befund, befundDiktat, r, summen, versorgungText, zusaetzlich, doppelt, alteVerwerfen: alteWeg };
    if (vorlesenAus()) {
      vetterWahl.delete(clientId);
      return res.json(await entwurfAnlegen(clientId, daten));
    }
    vorschauMerken(clientId, { ...daten, namenGesagt: [String(b.name || "").trim()], at: Date.now() });
    return res.json({
      ok: true, rueckfrage: "vorlesen", ...(doppelt.length ? { doppelung: doppelt.map((h) => h.id) } : {}),
      message: vorleseSatz({
        patient, versorgungText, kiefer: geplanteKiefer(auftrag, r.zusammenfassung), zaehne: r.plan.zaehne,
        versorgung: versorgungSatz(r.zusammenfassung), ausfuehrung: ausfuehrungText(r.plan), summen: summenSatz(summen),
        doppelt: doppelt.length ? doppelungHinweis(doppelt, alteWeg) : "",
      }),
    });
  } catch (e) {
    log.error?.(`[hkp] create-draft: ${e?.stack || e}`);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.post("/tools/hkp-overview", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const alle = await hkpListe(clientId);
    // "Welche HKPs haben wir heute geschrieben?" (live 07.10.2026: nur Zaehlung, kein
    // Patient). Notaus MAS_HKP_ZEITRAUM=0.
    const frage = process.env.MAS_HKP_ZEITRAUM === "0" ? "" : String(b.frage || "").trim();
    const zr = frage ? zeitraumAus(frage) : null;
    const ereignis = zr ? ereignisAus(frage) : null;
    const imZr = (liste) => {
      const treffer = imZeitraum(liste, zr, ereignis);
      if (treffer.length === 1) letzterMerken(clientId, treffer[0]);
      return res.json({
        ok: true, anzahl: treffer.length, zeitraum: { von: zr.von, bis: zr.bis, ereignis },
        message: zeitraumSatz(treffer, { vorsatz: zr.vorsatz, ereignis }),
      });
    };
    if (String(b.name || "").trim()) {
      const p = await patientAufloesen(clientId, b, "Für welchen Patienten?");
      if (p.antwort) return res.json(p.antwort);
      const eigene = await hkpsVonPatient(clientId, p.patient, { liste: alle });
      if (zr && ereignis) return imZr(eigene);
      if (eigene.length === 1) letzterMerken(clientId, eigene[0]);
      return res.json({ ok: true, anzahl: eigene.length, message: uebersichtSatz(eigene, { patientLabel: p.patient.anredeLabel }) });
    }
    if (zr && ereignis) return imZr(alle);
    const warten = alle.filter((h) => h.status === "wartet_auf_freigabe").length;
    return res.json({ ok: true, wartenAufFreigabe: warten, message: uebersichtSatz(alle) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

/**
 * Meint die Lesefrage den noch nicht angelegten Entwurf? Nein, wenn eine andere
 * Versorgungsart verlangt ist ("den Teleskop-HKP" bei Brücken-Vorschau) oder seit
 * der Vorschau ein echter HKP besprochen wurde. Notaus MAS_HKP_VORSCHAU_VORRANG=0.
 */
export function vorschauGemeint(vs, auswahl, letzter) {
  if (process.env.MAS_HKP_VORSCHAU_VORRANG === "0") return true;
  const art = HKP_ARTEN.find((re) => re.test(String(auswahl || "").toLowerCase()));
  if (art && !art.test(String(vs?.versorgungText || "").toLowerCase())) return false;
  return !(letzter?.at > (vs?.at || 0));
}

router.post("/tools/hkp-details", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!String(b.hint || "").trim()) {
      const vs = vorschauen(clientId).find((v) => !name || namePasst(name, v.patient) > 0 || nurVornamePasst(name, v.patient));
      if (vs && vorschauGemeint(vs, b.auswahl, letzterHkp.get(clientId))) {
        return res.json({
          ok: true, rueckfrage: "vorlesen",
          message: `Der ${vs.versorgungText || "HKP"} für ${vs.patient.anredeLabel} ist noch nicht angelegt. Voraussichtlich ${summenSatz(vs.summen)}. Soll ich den Entwurf so anlegen?`,
        });
      }
    }
    const r = await hkpAufloesen(clientId, b, "Zu welchem Patienten soll ich den HKP vorlesen?");
    if (r.antwort) return res.json(r.antwort);
    letzterMerken(clientId, r.hkp);
    const card = hkpKarte(r.hkp, clientId);
    const h = { ...r.hkp, patient: { ...r.hkp.patient, label: r.patient.anredeLabel } };
    return res.json({ ok: true, hkpId: r.hkp.id, ...(card ? { card } : {}), message: nurSummenFrage(b.frage) ? summenAntwort(h) : detailSatz(h, ausfuehrungText(planAus(r.hkp))) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

function positionLesen(b) {
  const roh = String(b.position || "").trim();
  const ebeneRoh = String(b.ebene || "").trim().toUpperCase();
  const p = E.positionVerstehen(`${ebeneRoh} ${roh}`);
  if (!p) return null;
  const ebene = ["BEMA", "GOZ", "BEL", "BEB"].includes(p.ebene) ? p.ebene : undefined;
  return { ebene, nr: p.nr };
}

const posText = (p) => `${p.ebene ? `${p.ebene} ` : ""}${p.nr}`;

router.post("/tools/hkp-position-check", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const pos = positionLesen(req.body || {});
    if (!pos) return res.json({ ok: true, message: "Welche Position meinen Sie – bitte mit Nummer, zum Beispiel BEL zwölf null null." });
    const r = await hkpAufloesen(clientId, req.body, "In welchem HKP soll ich nachsehen – für welchen Patienten?");
    if (r.antwort) return res.json(r.antwort);
    const plan = planAus(r.hkp);
    if (!plan) return res.json({ ok: false, message: "Den Plan dieses HKP kann ich nicht lesen. Bitte in PlanR öffnen." });
    const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [] }));
    const listen = E.listenFuer(plan, praxisListen(praxis));
    const ergebnis = E.berechnen(plan, listen);
    const pr = E.positionPruefen(ergebnis, listen, pos);
    if (pr.enthalten) {
      const ebenen = [...new Set(pr.treffer.map((t) => t.ebene))];
      const zaehne = [...new Set(pr.treffer.map((t) => t.zahn).filter(Boolean))];
      const summe = pr.treffer.reduce((s, t) => s + t.betrag, 0);
      return res.json({
        ok: true, enthalten: true,
        message: `Ja, ${ebenen.join(" und ")} ${pr.nr} ist enthalten${zaehne.length ? ` – bei ${liste(zaehne)}` : ""}, ${pr.treffer.length === 1 ? "" : `${pr.treffer.length}-mal, `}zusammen ${euroSprech(summe)}. Leistung: ${pr.treffer[0].bezeichnung}.`,
      });
    }
    if (!pr.katalog.length) return res.json({ ok: true, enthalten: false, message: `${posText(pos)} finde ich in keiner Preisliste. Meinen Sie eine andere Nummer?` });
    const k = pr.katalog.map((x) => `${x.ebene} ${pos.nr}: ${x.text}`).join("; ");
    return res.json({ ok: true, enthalten: false, message: `Nein, ${posText(pos)} ist in diesem HKP nicht enthalten. Laut Liste: ${k}. Soll ich sie hinzufügen?` });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

const AKTIONEN = { entfernen: "entfernen", streichen: "entfernen", loeschen: "entfernen", hinzufuegen: "hinzufuegen", ergaenzen: "hinzufuegen", anzahl: "anzahl", faktor: "faktor" };

router.post("/tools/hkp-position-change", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const r = await hkpAufloesen(clientId, b, "In welchem HKP soll ich etwas ändern – für welchen Patienten?");
    if (r.antwort) return res.json(r.antwort);
    const h = r.hkp;
    if (h.status !== "wartet_auf_freigabe") {
      return res.json({ ok: false, message: `Der ${hkpTitel(h)} ist ${STATUS_TEXT[h.status]} – ändern kann ich nur HKPs, die auf Freigabe warten. Für Änderungen bitte einen Änderungs-HKP in PlanR anlegen.` });
    }
    const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [] }));

    if (wahr(b.bestaetigt)) {
      const offen = h.offeneAenderung;
      if (offen?.art === "ausfuehrung") {
        const plan = planAus(h);
        if (!plan) return res.json({ ok: false, message: "Den Plan dieses HKP kann ich nicht lesen. Bitte in PlanR öffnen." });
        return res.json(await ausfuehrungBestaetigen(clientId, h, plan, praxis, b.aenderung_id));
      }
      if (!offen || Date.parse(offen.ablauf) < Date.now()) return res.json({ ok: false, message: "Ich habe keine offene Änderung mehr dazu. Bitte sagen Sie mir die Änderung noch einmal." });
      if (b.aenderung_id && b.aenderung_id !== offen.id) return res.json({ ok: false, message: "Die Änderung passt nicht mehr zum Vorschlag. Bitte noch einmal von vorn." });
      if (Number(offen.version) !== Number(h.version)) return res.json({ ok: false, message: "Der HKP wurde inzwischen in PlanR geändert. Bitte sagen Sie mir die Änderung noch einmal." });
      const plan = planAus(h);
      if (!plan) return res.json({ ok: false, message: "Den Plan dieses HKP kann ich nicht lesen. Bitte in PlanR öffnen." });
      const e = E.positionAendern(plan, offen.aenderung, praxisListen(praxis));
      if (!e.ok) return res.json({ ok: false, message: e.meldung });
      const summen = summenAus(e.ergebnis);
      await hkpAktualisieren(clientId, h.id, {
        version: h.version,
        felder: { planJson: JSON.stringify(e.plan), summen, zusammenfassung: e.nachher, offeneAenderung: null },
        wer: "Clara", was: `per Sprache: ${e.beschreibung}`,
      });
      return res.json({ ok: true, geaendert: true, ...mitUndo("hkp_aenderung", { id: h.id }), message: `Erledigt: ${e.beschreibung}. Eigenanteil jetzt ${euroSprech(summen.eigenanteil)}, Gesamtkosten ${euroSprech(summen.gesamt)}.${e.warnungen.length ? ` Hinweis: ${e.warnungen[0]}` : ""}` });
    }

    const aktion = AKTIONEN[String(b.aktion || "").toLowerCase().replace(/ä/g, "ae").replace(/ü/g, "ue").replace(/ö/g, "oe")];
    if (!aktion) return res.json({ ok: true, message: "Soll ich die Position entfernen, hinzufügen, die Anzahl oder den Faktor ändern?" });
    const pos = positionLesen(b);
    if (!pos?.ebene) return res.json({ ok: true, message: `Welche Position genau – BEMA, GOZ, BEL oder BEB, und welche Nummer?` });
    const aenderung = {
      aktion, ebene: pos.ebene, nr: pos.nr, zahn: String(b.zahn || "").trim(),
      ...(b.anzahl !== undefined && b.anzahl !== "" ? { anzahl: Number(b.anzahl) } : {}),
      ...(b.faktor !== undefined && b.faktor !== "" ? { faktor: Number(String(b.faktor).replace(",", ".")) } : {}),
    };
    const plan = planAus(h);
    if (!plan) return res.json({ ok: false, message: "Den Plan dieses HKP kann ich nicht lesen. Bitte in PlanR öffnen." });
    const e = E.positionAendern(plan, aenderung, praxisListen(praxis));
    if (!e.ok) return res.json({ ok: true, message: e.meldung });
    const id = randomUUID().slice(0, 8);
    await hkpFeldSetzen(clientId, h.id, {
      offeneAenderung: { id, aenderung, version: h.version, ablauf: new Date(Date.now() + AENDERUNG_GUELTIG_MS).toISOString() },
    });
    return res.json({
      ok: true, needsConfirm: true, aenderungId: id,
      message: `Ich würde ${e.beschreibung}. Der Eigenanteil wäre dann ${euroSprech(e.nachher.eigenanteil)} statt ${euroSprech(e.vorher.eigenanteil)}.${e.warnungen.length ? ` ${e.warnungen[0]}` : ""} Soll ich das so ändern?`,
    });
  } catch (e) {
    if (e instanceof KonfliktFehler) return res.json({ ok: false, message: "Der HKP wurde gerade in PlanR geändert. Bitte noch einmal versuchen." });
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Ausfuehrung aendern (Material, Abformung, Labor, Implantatsystem, Eigenlabor-Stufe) – wie die Helferin
// in PlanR: Vorschlag mit neuen Summen, geaendert erst auf Ja. Gerechnet wird auf dem gespeicherten Plan,
// manuelle Positionen bleiben. Eine noch nicht angelegte Vorschau wird stattdessen neu vorgelesen.
const kurzeWarnung = (ws) => ws.find((w) => w.length <= 120) || "";

async function ausfuehrungBestaetigen(clientId, h, plan, praxis, aenderungId) {
  const offen = h.offeneAenderung;
  if (!offen || offen.art !== "ausfuehrung" || Date.parse(offen.ablauf) < Date.now()) {
    return { ok: false, message: "Ich habe keine offene Änderung mehr dazu. Bitte sagen Sie mir die Änderung noch einmal." };
  }
  if (aenderungId && aenderungId !== offen.id) return { ok: false, message: "Die Änderung passt nicht mehr zum Vorschlag. Bitte noch einmal von vorn." };
  if (Number(offen.version) !== Number(h.version)) return { ok: false, message: "Der HKP wurde inzwischen in PlanR geändert. Bitte sagen Sie mir die Änderung noch einmal." };
  const e = E.ausfuehrungAendern(plan, offen.ausfuehrung || {}, praxisListen(praxis));
  if (!e.ok) return { ok: false, message: e.meldung };
  const summen = summenAus(e.ergebnis);
  const neu = await hkpAktualisieren(clientId, h.id, {
    version: h.version,
    felder: { planJson: JSON.stringify(e.plan), summen, zusammenfassung: e.nachher, offeneAenderung: null },
    wer: "Clara", was: `per Sprache: Ausführung ${e.beschreibung}`,
  });
  log.info?.(`[hkp] ${h.id} Ausfuehrung geaendert: ${e.beschreibung}`);
  const card = hkpKarte(neu || h, clientId);
  return {
    ok: true, geaendert: true, ...(card ? { card } : {}), ...mitUndo("hkp_aenderung", { id: h.id }),
    message: `Erledigt: ${e.beschreibung}. Gesamtkosten jetzt ${euroSprech(summen.gesamt)}, Eigenanteil ${euroSprech(summen.eigenanteil)}.`,
  };
}

/** Offene Vorschau, die eine Ausfuehrungs-Aenderung meint – neuer als der zuletzt besprochene HKP */
function vorschauFuerAenderung(clientId, b) {
  const name = String(b?.name || "").trim();
  const liste = vorschauen(clientId);
  const vs = name ? liste.find((v) => namePasst(name, v.patient) > 0 || nurVornamePasst(name, v.patient)) : liste[0];
  if (!vs) return null;
  const l = letzterHkp.get(clientId);
  return !name && l && l.at > vs.at ? null : vs;
}

function vorschauKorrigieren(clientId, vs, text, praxis) {
  const auftragText = `${String(vs.auftragText || "").replace(/[\s.]+$/, "")}. ${text}`.trim();
  const auftrag = E.auftragVerstehen(auftragText);
  const r = E.hkpEntwurf(auftragText, vs.befund.befund, {
    patient: vs.r.plan.patient, einstellungen: praxis.einstellungen, implantatSystem: implantatStandard(praxis),
  }, praxisListen(praxis));
  if (r.status !== "ok") return { ok: true, rueckfrage: r.grund, message: r.frage };
  const summen = summenAus(r.ergebnis);
  vorschauWeg(clientId, vs);
  vorschauMerken(clientId, { ...vs, auftrag, auftragText, r, summen, at: Date.now() });
  return {
    ok: true, rueckfrage: "vorlesen",
    message: vorleseSatz({
      patient: vs.patient, versorgungText: vs.versorgungText, kiefer: geplanteKiefer(auftrag, r.zusammenfassung), zaehne: r.plan.zaehne,
      versorgung: versorgungSatz(r.zusammenfassung), ausfuehrung: ausfuehrungText(r.plan), summen: summenSatz(summen),
      doppelt: vs.doppelt?.length ? doppelungHinweis(vs.doppelt, vs.alteVerwerfen) : "",
    }),
  };
}

router.post("/tools/hkp-ausfuehrung-aendern", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const text = String(b.aenderung || "").trim();
    const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [], einstellungen: {} }));
    if (!wahr(b.bestaetigt)) {
      const vs = vorschauFuerAenderung(clientId, b);
      if (vs) return res.json(vorschauKorrigieren(clientId, vs, text, praxis));
    }
    const r = await hkpAufloesen(clientId, b, "In welchem HKP soll ich die Ausführung ändern – für welchen Patienten?");
    if (r.antwort) return res.json(r.antwort);
    const h = r.hkp;
    if (h.status !== "wartet_auf_freigabe") {
      return res.json({ ok: false, message: `Der ${hkpTitel(h)} ist ${STATUS_TEXT[h.status]} – ändern kann ich nur HKPs, die auf Freigabe warten. Für Änderungen bitte einen Änderungs-HKP in PlanR anlegen.` });
    }
    const plan = planAus(h);
    if (!plan) return res.json({ ok: false, message: "Den Plan dieses HKP kann ich nicht lesen. Bitte in PlanR öffnen." });
    if (wahr(b.bestaetigt)) return res.json(await ausfuehrungBestaetigen(clientId, h, plan, praxis, b.aenderung_id));

    const a = E.ausfuehrungIn(text);
    const e = E.ausfuehrungAendern(plan, a, praxisListen(praxis));
    if (!e.ok) return res.json({ ok: true, message: e.meldung });
    const id = randomUUID().slice(0, 8);
    await hkpFeldSetzen(clientId, h.id, {
      offeneAenderung: { id, art: "ausfuehrung", ausfuehrung: a, version: h.version, ablauf: new Date(Date.now() + AENDERUNG_GUELTIG_MS).toISOString() },
    });
    const warnung = kurzeWarnung(e.warnungen);
    return res.json({
      ok: true, needsConfirm: true, aenderungId: id,
      message: `Beim ${hkpTitel(h)} für ${r.patient.anredeLabel} würde ich ändern: ${e.beschreibung}. Gesamtkosten dann ${euroSprech(e.nachher.gesamt)} statt ${euroSprech(e.vorher.gesamt)}, Eigenanteil ${euroSprech(e.nachher.eigenanteil)}.${warnung ? ` ${warnung}` : ""} Soll ich die Ausführung so ändern?`,
    });
  } catch (e) {
    if (e instanceof KonfliktFehler) return res.json({ ok: false, message: "Der HKP wurde gerade in PlanR geändert. Bitte noch einmal versuchen." });
    log.error?.(`[hkp] ausfuehrung-aendern: ${e?.stack || e}`);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

export default router;
