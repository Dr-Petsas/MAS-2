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
//  - Befund wird gewaehlt: Praxisprogramm, Lena-01 (nur MAS) oder neu aufgenommen; ein neuer Befund
//    geht erst nach der Befund-Freigabe ins Praxisprogramm (src/hkp/befundQuelle.js).
//
// /planr/*  : PlanR (Praxis-Schluessel X-PlanR-Key, in auth.js oeffentlich gefuehrt)
// /tools/hkp-* : Clara-Tools (Profil-Gruppe "hkp"); Notaus MAS_HKP_TOOLS=0.
import express from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import * as E from "../vendor/hkp-engine.mjs";
import * as P from "../vendor/privat-ze-engine.mjs";
import * as M from "../vendor/mkv-engine.mjs";
import * as K from "../vendor/kons-engine.mjs";
import * as I from "../vendor/impl-engine.mjs";
import { assertAppEnabled, getBilling } from "../entitlements.js";
import { planrAusBilling } from "../hkp/planrBerechtigung.js";
import { claraZugang, rufnameSaeubern } from "../hkp/planrClara.js";
import QRCode from "qrcode";
import { clientRef } from "../tenant.js";
import { createPairingToken } from "../clara/devices.js";
import { normalizeRole } from "../clara/operators.js";
import { DEFAULT_ASSISTANT_NAME, getAssistantName, invalidateAssistantName } from "../shared/rufname.js";
import { log } from "../log.js";
import { DEFAULT_CLIENT_ID, PUBLIC_BASE_URL, logOutboundMail, resolveClientId } from "./_shared.js";
import { sendMail } from "../mail/mailbox.js";
import { chat, strongLlm } from "../mail/llm.js";
import { PROBE_EINORDNEN, einordnungLesen } from "../hkp/probeEinordnen.js";
import { EINRICHTUNG_KI_FORMAT, EINRICHTUNG_KI_SYSTEM, einrichtungKiLesen, einrichtungKiNachricht, lageSaeubern } from "../hkp/einrichtungKi.js";
import { PLAN_KI_SYSTEM, blickSaeubern, planKiLesen, planKiNachricht, planPruefung, tabelleFuer } from "../hkp/planKi.js";
import { wissenSuchen } from "../hkp/wissen.js";
import { kvaEntwurfAblegen } from "../mail/kvaEntwurf.js";
import { listAccounts } from "../mail/accounts.js";
import { resolveSpokenPatientForRead } from "./tools.js";
import { getPatientCandidates, setPatientCandidates } from "../clara/sessions.js";
import { soundsSame } from "../clara/phonetics.js";
import { disambiguationQuestion, merkmalEingrenzen, ordinalPick } from "../clara/patientDisambig.js";
import { fetchPatientsByIds, findInCatalog } from "../clara/patientCatalog.js";
import { planNurPvs, pvsKennungAufloesen, sucheImPvs } from "../hkp/planrPvs.js";
import { praxisRegistrieren, RegistrierungFehler } from "../hkp/planrRegistrierung.js";
import { befundSatz, jahrgangWahl, vetternFrage, vorleseSatz, zahnBefundSatz } from "../hkp/vorlesen.js";
import { befundMerken, entfernenMarken, planartKorrigieren, rueckfrageMerken, zahnListe } from "../hkp/mitdenken.js";
import { reglerSatz, spanneSatz, zielpreisAus } from "../hkp/zielpreis.js";
import { mitUndo } from "../clara/rueckgaengig.js";
import { abrechnungAntwort, antwortVerstehen, befundListe, fachEntscheiden, mundSprechen, nackteNichtEntfernen, planIntent, befundSatz as befundAusAntwort } from "../hkp/antwortVerstehen.js";
import { planPruefen, positionenVon } from "../hkp/ausschluss.js";
import { akteVon, bonusNorm, fallRechnen, protheseGesagt, verbundSatz } from "../hkp/coach.js";
import { praxisKatalog, praxisKatalogNeu } from "../hkp/planrKatalog.js";
import { praxisWissenStand } from "../hkp/praxisWissen.js";
import { praxisStilMerken, praxisStilStand } from "../hkp/praxisStil.js";
import {
  AKTIV, KonfliktFehler, STATUS, STATUS_TEXT, hkpAktualisieren, hkpAnlegen, hkpDateiAnhaengen, hkpDateiLesen, hkpFeldSetzen, hkpLesen, hkpListe, kopf,
  praxisLaden, praxisSpeichern, praxisKatalogeSpeichern,
} from "../hkp/store.js";
import {
  HKP_VORSCHLAG, auftragsKiefer, befundAendernPvs, befundErmitteln, befundInsPvs, befundVerwerfenPvs, befundWerkzeugMitNummer, datumDe, fremdeKuerzel, hkpVorschlag, kieferBefund, lenaFreigeschaltet, neuFrage, planZeilen, pvsBefund, pvsKennung, quelleAntwort, quelleAus, vorgangMelden,
} from "../hkp/befundQuelle.js";
import { detailSatz, euroSprech, hkpKurz, hkpTitel, implSummenSatz, konsSummenSatz, liste, mkvSummenSatz, nurSummenFrage, privatSummenSatz, summenAntwort, summenSatz, uebersichtSatz, versorgungSatz, zahlWort, zeitraumSatz } from "../hkp/sprech.js";
import { MODULE as ENTWURF_MODULE, entwuerfeOffen, entwurfAbgeholt, entwurfAblegen } from "../hkp/planrEntwuerfe.js";
import { ereignisAus, imZeitraum, zeitraumAus } from "../hkp/zeitraum.js";
import { liveAbonnieren, liveAus, liveMelden, livePatient } from "../hkp/live.js";
import { registerFuer, verbundLesen, verbundLoesen, verbundSetzen } from "../hkp/verbund.js";

const router = express.Router();

const VERSORGUNG_TEXT = {
  teleskopprothese: "Teleskop-HKP", totalprothese: "Totalprothesen-HKP", kronen: "Kronen-HKP", bruecke: "Brücken-HKP",
  implantatkronen: "Implantat-HKP", locator: "Locator-HKP", steg: "Steg-HKP", inlay: "Inlay-HKP",
};
const VERSORGUNG_NAME = {
  teleskopprothese: "Teleskopprothese", totalprothese: "Totalprothese", kronen: "Kronen", bruecke: "Brücke",
  implantatkronen: "Implantatkronen", locator: "Locator-Prothese", steg: "Stegprothese", inlay: "Inlay",
};
/** Gesprochener Name. „allon“ ist nur der Schlüssel – Clara sagt All-on-4 oder All-on-6. */
export function versorgungName(t) {
  if (t?.versorgung === "allon") return `All-on-${Number(t.allon) === 6 ? 6 : 4}`;
  if (t?.versorgung === "totalprothese" && t.interim) return "Interimsprothese";
  if (t?.versorgung === "totalprothese" && t.immediat) return "Immediatprothese";
  return VERSORGUNG_NAME[t?.versorgung] || "HKP";
}
export function versorgungTextVon(auftrag) {
  const teile = auftrag?.teile?.length ? auftrag.teile : [auftrag || {}];
  if (teile.length > 1) {
    return `HKP mit ${liste(teile.map((t) => `${versorgungName(t)} im ${t.kiefer === "UK" ? "Unterkiefer" : "Oberkiefer"}`))}`;
  }
  const t = teile[0] || {};
  if (t.versorgung === "allon") return `${versorgungName(t)}-HKP`;
  if (t.versorgung === "totalprothese" && t.interim) return "Interimsprothese";
  if (t.versorgung === "totalprothese" && t.immediat) return "Immediatprothese";
  return VERSORGUNG_TEXT[t.versorgung] || "HKP";
}
const AENDERUNG_GUELTIG_MS = 5 * 60 * 1000;
const PRAXIS_FELDER = ["labor", "praxisPlz", "kzv", "gozFaktor", "mwstLabor", "eigenKasseProzent", "eigenPrivatAufschlag",
  "bemaListe", "gozListe", "belListe", "bebListe", "fzListe", "protheseDigital"];

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
  const akte = akteVon(sel);
  return {
    id: String(sel.id || ""), firstName, lastName, birthDate: String(sel.birthDate || ""),
    ...(sel.quelle === "pvs" ? { pvsNummer: String(sel.id || "") } : {}),
    ...(akte.versicherung ? { versicherung: akte.versicherung, privateInsurance: akte.versicherung === "privat" } : {}),
    ...(akte.bonus ? { bonus: akte.bonus } : {}),
    label: `${firstName} ${lastName}`.trim() || "der Patient",
    anredeLabel: anrede ? `${anrede}${lastName}` : `${firstName} ${lastName}`.trim(),
  };
}

function planAus(h) {
  try { return E.planNormalisieren(JSON.parse(h.planJson || "{}")); } catch { return null; }
}

const praxisListen = (p) => ({ preislisten: p.preislisten, eigen: p.eigen, fremd: p.fremd, katalog: p.katalog });
const alsListe = (x) => (Array.isArray(x) ? x.slice(0, 5000) : []);

// Vorlesen nennt nur die Spanne des Eigenanteils, auf den Wunsch werden die Regler gestellt
// (Chef 10.10.2026). Notaus MAS_HKP_ZIELPREIS=0: Summen wie bisher beim Vorlesen.
const zielpreisAn = () => process.env.MAS_HKP_ZIELPREIS !== "0";

function spanneVon(plan, praxis) {
  if (!zielpreisAn()) return "";
  try {
    const s = E.preisSpanne(plan, praxisListen(praxis));
    return s.max - s.min >= 1 ? spanneSatz(s) : "";
  } catch (e) {
    log.warn?.(`[hkp] Preisspanne: ${e?.message || e}`);
    return "";
  }
}

/** Vorschau mit Reglern auf den Wunsch-Eigenanteil */
function aufZielpreis(vs, ziel, praxis) {
  const z = E.aufZielpreis(vs.r.plan, ziel, praxisListen(praxis));
  const r = { ...vs.r, plan: z.plan, ergebnis: z.ergebnis, zusammenfassung: E.zusammenfassen(z.plan, z.ergebnis), hinweise: [...vs.r.hinweise, ...z.hinweise] };
  log.info?.(`[hkp] Zielpreis ${ziel}: Eigenanteil ${z.eigenanteil.toFixed(2)} (Spanne ${z.min.toFixed(0)}-${z.max.toFixed(0)}) ${JSON.stringify(z.stand)}`);
  return { ...vs, r, summen: summenAus(z.ergebnis), zielpreis: z };
}

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
    teile.push("Teilverblendung, vestibuläre Verblendung oder Vollverblendung?");
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
// Bearbeiten-Schluessel (zweck "hkp-bearbeiten"): nur in der PlanR-Uebersicht (Liste mit
// Praxis-Schluessel), damit der Planer ueber den Tunnel Aenderungen ins Register speichert.
// Nie in SMS oder Clara-Karte.
const BEARBEITEN_TAGE = 1;
export const hkpBearbeitenToken = (id, jetztMs = Date.now(), clientId = "") => tokenFuer("hkp-bearbeiten", BEARBEITEN_TAGE, id, clientId, jetztMs);
export const hkpBearbeitenOk = (id, token, jetztMs = Date.now(), clientId = "") => tokenOk("hkp-bearbeiten", id, token, clientId, jetztMs);

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

// Flip-Seite "Befund" (Chef 15.10.2026): nur das Zahnschema des Patienten, live aus PlanR (Strato), mit Freigabe-Knopf.
// Schluessel nur fuer diesen Patienten, 12 Stunden; geht nur ueber die Karte an die angemeldete Clara-App.
const BEFUND_FLIP_STUNDEN = 12;
const planrServer = () => String(process.env.PLANR_URL || "https://planr.pickadoc.de").trim().replace(/\/+$/, "");

export function befundFlipToken(clientId, nummer, jetztMs = Date.now()) {
  if (!String(process.env.PLANR_HKP_KEY || "").trim() || !clientId || !/^\d{1,9}$/.test(String(nummer || ""))) return "";
  const exp = Math.floor(jetztMs / 1000) + BEFUND_FLIP_STUNDEN * 3600;
  return `${exp}.${signatur("befund-flip", `${clientId}/${nummer}`, exp)}`;
}

/** Karte "Befund": Clara flippt auf das Zahnschema, solange Befund und Planung laufen. Notaus MAS_HKP_BEFUND_KARTE=0. */
/** Praxisprogramm nicht lesbar (z. B. aeltere Bridge): PlanR legt den Befund aus dem Gespraech trotzdem an */
export const ohnePvs = (patient, pvs) => ({
  label: [patient?.lastName, patient?.firstName].filter(Boolean).join(", ") || patient?.label || "",
  geburt: String(patient?.birthDate || "").slice(0, 10), pvs,
  meldung: `Befund aus ${pvs} nicht lesbar – Befund aus dem Gespräch`,
});

export function befundKarte(clientId, nummer, patient) {
  if (process.env.MAS_HKP_BEFUND_KARTE === "0") return null;
  const bt = befundFlipToken(clientId, nummer);
  if (!bt) return null;
  return {
    kind: "befund", url: `${planrServer()}/planer/hkp/?${new URLSearchParams({ befund: String(nummer), bt, c: clientId, ansicht: "mobil" })}`,
    tag: "Befund (01) · live", title: patient?.label || "Befund", subtitle: "Zahnschema",
    footer: "Zahnschema und Freigabe: Karte antippen",
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
    const anker = String(h.zusammenfassung?.ankerGesagt || "");
    const versorgungText = /\ballon\b/i.test(String(h.versorgungText || ""))
      ? String(h.versorgungText).replace(/\ballon\b/gi, /^All-on-[46]$/.test(anker) ? anker : "All-on-4")
      : h.versorgungText;
    res.json({
      ok: true, hkp: versorgungText === h.versorgungText ? h : { ...h, versorgungText },
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

// Planer aus der PlanR-Uebersicht ueber den Tunnel (ohne Praxis-Schluessel im Browser): Plan speichern
// wie in PlanR, Summen rechnet MAS mit den Praxis-Listen. Status bleibt. Notaus MAS_HKP_LINK_SPEICHERN=0.
const LINK_GESPERRT = ["verworfen", "abgerechnet"];
router.put("/planr/hkp-link/:id/plan", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (process.env.MAS_HKP_LINK_SPEICHERN === "0") {
    return res.status(403).json({ ok: false, error: "abgeschaltet", message: "Speichern über den Link ist abgeschaltet – am Praxis-PC speichern." });
  }
  const id = req.params.id;
  const clientId = linkClient(req);
  if (!hkpLinkOk(id, req.header("X-PlanR-Link"), Date.now(), clientId) || !hkpBearbeitenOk(id, req.header("X-PlanR-Bearbeiten"), Date.now(), clientId)) {
    return res.status(401).json({ ok: false, error: "bearbeiten_ungueltig", message: "Der Link ist abgelaufen oder nur zum Ansehen – den HKP in der PlanR-Übersicht neu öffnen." });
  }
  const b = req.body || {};
  if (!b.plan || typeof b.plan !== "object") return res.status(400).json({ ok: false, error: "plan_fehlt" });
  if (b.version === undefined || b.version === null) return res.status(400).json({ ok: false, error: "version_fehlt" });
  try {
    const plan = E.planNormalisieren(b.plan);
    const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [] }));
    const ergebnis = E.rechnen(plan, praxisListen(praxis));
    const felder = { planJson: JSON.stringify(plan), summen: summenAus(ergebnis), zusammenfassung: E.zusammenfassen(plan, ergebnis), offeneAenderung: null };
    const label = `${plan.patient.vorname || ""} ${plan.patient.name || ""}`.trim();
    if (label) Object.assign(felder, { "patient.label": label, "patient.firstName": plan.patient.vorname || "", "patient.lastName": plan.patient.name || "" });
    const h = await hkpAktualisieren(clientId, id, {
      version: b.version, felder, wer: "PlanR", was: "in PlanR bearbeitet (Link)",
      pruefen: (a) => {
        if (!LINK_GESPERRT.includes(a.status)) return;
        const e = new Error("status");
        e.code = "status";
        e.status = a.status;
        throw e;
      },
    });
    log.info?.(`[hkp] ${id} in PlanR über den Link gespeichert`);
    res.json({ ok: true, hkp: kopf(h) });
  } catch (e) {
    if (e instanceof KonfliktFehler) return res.status(409).json({ ok: false, error: "version_konflikt", message: "Der HKP wurde inzwischen geändert – bitte neu laden.", aktuell: e.aktuell });
    if (e?.code === "status") return res.status(409).json({ ok: false, error: "gesperrt", message: `Der HKP ist ${STATUS_TEXT[e.status] || e.status} und wird nicht mehr geändert.` });
    if (e?.code === "nicht_gefunden") return res.status(404).json({ ok: false, error: "nicht_gefunden" });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/planr/live", planrGuard, (req, res) => {
  if (liveAus()) return res.status(404).json({ ok: false, error: "live_aus" });
  liveAbonnieren(req.planrClientId, req, res);
});

// PlanR-Anmeldung: darf diese Pickadoc-Praxis PlanR nutzen (MAS oder PlanR-Abo)?
router.get("/planr/berechtigung", planrGuard, async (req, res) => {
  try {
    res.json({ ok: true, clientId: req.planrClientId, ...planrAusBilling(await getBilling(req.planrClientId)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// PlanR-Buchung (Standalone): Praxis + Admin-Konto anlegen, Abo setzen – Anmeldung sofort möglich
router.post("/planr/registrieren", planrGuard, async (req, res) => {
  try {
    const r = await praxisRegistrieren(req.body || {});
    log.info?.(`[planr] Praxis ${r.clientId} aus PlanR-Buchung angelegt`);
    res.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof RegistrierungFehler) return res.status(e.status).json({ ok: false, error: e.code, message: e.message });
    log.error?.(`[planr] Registrierung fehlgeschlagen: ${e?.message || e}`);
    res.status(500).json({ ok: false, error: "fehler", message: String(e?.message || e) });
  }
});

// Kostenvoranschlag per Mail (PlanR, MAS-Praxis): Empfaenger aus der Pickadoc-Kartei –
// nur bei genau einem Treffer mit passendem Namen (und Geburtsdatum, wenn angegeben).
router.post("/planr/kva/kontakt", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const vorname = String(b.vorname || "").trim().slice(0, 80);
    const name = String(b.name || "").trim().slice(0, 80);
    const geb = /^\d{4}-\d{2}-\d{2}$/.test(String(b.geburtsdatum || "")) ? String(b.geburtsdatum) : "";
    if (!name) return res.json({ ok: true, email: "" });
    const gleich = (a, c) => String(a || "").trim().toLowerCase() === String(c || "").trim().toLowerCase();
    const treffer = await findInCatalog(req.planrClientId, `${vorname} ${name}`.trim(), { limit: 8 });
    const ids = treffer.filter((e) => gleich(e.l, name) && (!vorname || gleich(e.f, vorname))).map((e) => e.i);
    const kandidaten = (ids.length ? await fetchPatientsByIds(req.planrClientId, ids) : [])
      .filter((p) => !geb || !p.birthDate || p.birthDate === geb)
      .filter((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
    res.json({ ok: true, email: kandidaten.length === 1 ? kandidaten[0].email : "", mehrdeutig: kandidaten.length > 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Kostenvoranschlag als PDF ueber das Praxis-Postfach (Nadine) senden; im Gedaechtnis protokolliert.
router.post("/planr/kva/senden", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const to = String(b.to || "").trim();
    const subject = String(b.subject || "").trim().slice(0, 300);
    const text = String(b.text || "").slice(0, 20_000);
    const pdf = b.pdf || {};
    const filename = String(pdf.filename || "Kostenvoranschlag.pdf").replace(/[^\w .()-]/g, "_").slice(0, 120);
    const base64 = String(pdf.base64 || "");
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return res.status(400).json({ ok: false, error: "empfaenger", message: "Bitte eine gültige E-Mail-Adresse eintragen." });
    if (!subject || !text.trim()) return res.status(400).json({ ok: false, error: "leer", message: "Betreff und Text dürfen nicht leer sein." });
    if (!/^[A-Za-z0-9+/=]{100,14000000}$/.test(base64) || !Buffer.from(base64.slice(0, 8), "base64").toString("latin1").startsWith("%PDF")) {
      return res.status(400).json({ ok: false, error: "pdf", message: "Der Kostenvoranschlag als PDF fehlt." });
    }
    const konto = (await listAccounts(req.planrClientId)).find((a) => a.active !== false);
    if (!konto) return res.status(409).json({ ok: false, error: "kein_konto", message: "In MAS ist kein E-Mail-Konto für Nadine eingerichtet." });
    const body = { to: [to], subject, text, attachments: [{ filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`, content: base64 }] };
    const out = await sendMail(req.planrClientId, konto.id, body);
    if (!out.ok) return res.status(502).json({ ok: false, error: out.reason || "senden", message: `Nadine konnte nicht senden (${out.reason || "unbekannt"}).` });
    const wer = String(b.wer || "").trim().slice(0, 80) || "PlanR";
    const brain = await logOutboundMail(req.planrClientId, { storedId: out.storedId, body, by: wer }).catch(() => null);
    log.info?.(`[planr] Kostenvoranschlag an ${to} über ${konto.email || konto.id} gesendet${out.dryRun ? " (Testmodus)" : ""}`);
    res.json({ ok: true, to, von: konto.email || "", dryRun: !!out.dryRun, protokolliert: !!brain?.ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Kostenvoranschlag als neue Mail in Nadine öffnen (statt direkt senden): Entwurf ablegen, PlanR springt zu Nadine.
router.post("/planr/kva/entwurf", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const to = String(b.to || "").trim().slice(0, 200);
    const subject = String(b.subject || "").trim().slice(0, 300);
    const text = String(b.text || "").slice(0, 20_000);
    const pdf = b.pdf || {};
    const filename = String(pdf.filename || "Kostenvoranschlag.pdf").replace(/[^\w .()-]/g, "_").slice(0, 120);
    const base64 = String(pdf.base64 || "");
    if (to && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return res.status(400).json({ ok: false, error: "empfaenger", message: "Die E-Mail-Adresse ist ungültig." });
    if (!/^[A-Za-z0-9+/=]{100,14000000}$/.test(base64) || !Buffer.from(base64.slice(0, 8), "base64").toString("latin1").startsWith("%PDF")) {
      return res.status(400).json({ ok: false, error: "pdf", message: "Der Kostenvoranschlag als PDF fehlt." });
    }
    const attachment = {
      filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
      contentType: "application/pdf",
      size: Math.floor(base64.length * 3 / 4),
      content: base64,
    };
    const id = kvaEntwurfAblegen(req.planrClientId, { to, subject, text, attachment });
    const web = (process.env.PLATFORM_WEB_URL || "https://docgenda.web.app").replace(/\/+$/, "");
    res.json({ ok: true, id, url: `${web}/clara?ki=nadine&entwurf=${id}` });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** Welcher Plan ist diese Datei (HKP, PAR, KB, Implantation ...)? Nur der gelesene Text, nichts wird gespeichert. */
router.post("/planr/probe-einordnen", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const text = String(b.text || "").trim().slice(0, 9000);
    const name = String(b.name || "").trim().slice(0, 160);
    if (!text && !name) return res.json({ ok: false, message: "Kein Text." });
    const { base, model } = strongLlm();
    const antwort = await chat([
      { role: "system", content: PROBE_EINORDNEN },
      { role: "user", content: `Dateiname: ${name || "ohne"}\n\nText:\n${text || "(kein Text gelesen)"}` },
    ], { temperature: 0, maxTokens: 400, model, baseUrl: base, timeoutMs: 40000 });
    const ergebnis = antwort.ok ? einordnungLesen(antwort.text) : null;
    if (!ergebnis) return res.json({ ok: false, message: "Die Datei ließ sich gerade nicht einordnen." });
    res.json({ ok: true, ...ergebnis });
  } catch (e) {
    log.error?.(`[planr] probe-einordnen: ${e?.stack || e}`);
    res.status(500).json({ ok: false, message: "Das Einordnen ist fehlgeschlagen." });
  }
});

/** Hilfe-Zeile im Einrichtungsassistenten: Frage der Praxis samt Lage des Assistenten. Antwort in einfachen Worten, dazu höchstens ein Knopf im Assistenten. Nichts wird gespeichert. */
router.post("/planr/einrichtung-ki", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const text = String(b.text || "").trim().slice(0, 800);
    if (!text) return res.json({ ok: false, message: "Kein Text." });
    const lage = lageSaeubern(b.lage);
    const { base, model } = strongLlm();
    const nachrichten = [
      { role: "system", content: EINRICHTUNG_KI_SYSTEM },
      { role: "user", content: einrichtungKiNachricht({ text, lage, verlauf: b.verlauf }) },
    ];
    const fragen = (extraBody) => chat(nachrichten, { temperature: 0.2, maxTokens: 700, model, baseUrl: base, timeoutMs: 25000, extraBody });
    let antwort = await fragen(EINRICHTUNG_KI_FORMAT);
    let ergebnis = antwort.ok ? einrichtungKiLesen(antwort.text, lage) : null;
    // Zweiter Versuch ohne Formatzwang, falls der Server ihn nicht kennt oder nichts Lesbares kam.
    if (!ergebnis) {
      antwort = await fragen();
      ergebnis = antwort.ok ? einrichtungKiLesen(antwort.text, lage) : null;
    }
    if (!ergebnis) return res.json({ ok: false, message: "Die Hilfe antwortet gerade nicht." });
    res.json({ ok: true, ...ergebnis });
  } catch (e) {
    log.error?.(`[planr] einrichtung-ki: ${e?.stack || e}`);
    res.status(500).json({ ok: false, message: "Die Hilfe antwortet gerade nicht." });
  }
});

/** KI-Zeile im offenen Plan: Frage oder Aenderungswunsch samt ganzem Plan. Antwort und Schritte, der Planer fuehrt aus. Nichts wird gespeichert. */
router.post("/planr/plan-ki", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const text = String(b.text || "").trim().slice(0, 1200);
    const blick = blickSaeubern(b.blick);
    if (!text || !blick.planart) return res.json({ ok: false, message: "Kein Text oder kein Plan." });
    const tabelle = tabelleFuer(text, blick);
    const wissen = await wissenSuchen(text, null).catch(() => "");
    const { base, model } = strongLlm();
    const nachrichten = [
      { role: "system", content: PLAN_KI_SYSTEM },
      { role: "user", content: planKiNachricht({ text, blick, verlauf: b.verlauf, tabelle, wissen, nachlauf: b.nachlauf }) },
    ];
    const beginn = Date.now();
    const frist = Number(process.env.MAS_PLAN_KI_MS || 55000);
    const fragen = (timeoutMs) => chat(nachrichten, { temperature: 0.1, maxTokens: Number(process.env.MAS_PLAN_KI_TOKENS || 2500), model, baseUrl: base, timeoutMs });
    let antwort = await fragen(frist);
    let ergebnis = antwort.ok ? planKiLesen(antwort.text, blick) : null;
    // Kam kein lesbares JSON und ist noch Zeit, ein zweiter Versuch statt einer leeren Antwort.
    const rest = frist - (Date.now() - beginn);
    if (!ergebnis && antwort.ok && rest > 15000) {
      log.warn?.("[planr] plan-ki: Antwort ohne JSON, zweiter Versuch");
      antwort = await fragen(rest);
      ergebnis = antwort.ok ? planKiLesen(antwort.text, blick) : null;
    }
    // Entscheidung der Praxis angekommen, aber kein Schritt dazu: einmal nachhaken statt einer leeren Zusage.
    const ohneSchritt = (e) => e && e.entschieden && !e.schritte.length;
    if (ohneSchritt(ergebnis) && frist - (Date.now() - beginn) > 15000) {
      log.warn?.("[planr] plan-ki: entschieden ohne Schritt, zweiter Versuch");
      nachrichten.push({ role: "assistant", content: antwort.text }, { role: "user", content: 'Du hast "entschieden":true gesetzt, aber "schritte" ist leer. Gib dieselbe Antwort noch einmal als JSON, diesmal mit den Schritten für genau das, was der Arzt entschieden hat. Bringt kein SCHALTER die Position, nimm "weg" mit ihrer id. Hat er entschieden, dass alles bleibt, lass "schritte" leer und sage in "antwort" nur, dass nichts geändert wird.' });
      const zweite = await fragen(frist - (Date.now() - beginn));
      const neu = zweite.ok ? planKiLesen(zweite.text, blick) : null;
      if (neu && neu.entschieden) ergebnis = neu;
    }
    // Aenderung angekuendigt ("aendert":true), aber kein Schritt geliefert und keiner verworfen: einmal nachhaken.
    const angekuendigt = (e) => e && !e.pruefung && !e.entschieden && !e.schritte.length && (e.aendert || e.verworfen.length > 0);
    if (angekuendigt(ergebnis) && frist - (Date.now() - beginn) > 15000) {
      log.warn?.("[planr] plan-ki: Aenderung angekuendigt ohne Schritt, zweiter Versuch");
      nachrichten.push({ role: "assistant", content: antwort.text }, { role: "user", content: 'Du hast eine Änderung angekündigt, aber es ist kein gültiger Schritt angekommen. So ändert sich am Plan nichts (ein Schritt mit einem Feld oder Wert, den ZAHNSCHEMA, SCHALTER oder PLAN nicht kennt, wird verworfen). Gib dieselbe Antwort noch einmal als JSON, diesmal mit den Schritten für genau diese Änderung (für Befund, Planung und Angaben je Zahn der Schritt "zahn" mit den Feldern aus ZAHNSCHEMA). Ist die Änderung nicht möglich, setze "aendert":false und nenne in "antwort" den Grund.' });
      const zweite = await fragen(frist - (Date.now() - beginn));
      const neu = zweite.ok ? planKiLesen(zweite.text, blick) : null;
      if (neu) ergebnis = neu;
    }
    if (!ergebnis) {
      log.warn?.(`[planr] plan-ki ohne brauchbare Antwort (${antwort.ok ? "kein JSON" : antwort.error || "Modell"})`);
      return res.json({ ok: false, message: "Dazu habe ich gerade keine Antwort bekommen. Der Plan ist unveraendert." });
    }
    if (ergebnis.verworfen.length) log.warn?.(`[planr] plan-ki: Schritte verworfen: ${ergebnis.verworfen.join(", ")}`);
    log.info?.(`[planr] plan-ki ${blick.planart} positionen=${blick.positionen.length} schritte=${ergebnis.schritte.length} tabelle=${tabelle.length}`);
    // Hat der Korrekturlauf nur Unzulaessiges vorgeschlagen, gilt die Ankuendigung des Modells nicht.
    const leer = ergebnis.pruefung && !ergebnis.frage && !ergebnis.schritte.length && ergebnis.verworfen.length > 0;
    const antwortText = angekuendigt(ergebnis)
      ? "Das habe ich nicht in einen zulässigen Schritt für diesen Plan umsetzen können. Am Plan ist nichts geändert. Bitte sagen Sie es noch einmal mit Zahn und gewünschter Versorgung."
      : ohneSchritt(ergebnis)
      ? `${ergebnis.antwort} Am Plan ist damit nichts geändert.`
      : leer ? "Dafür habe ich keinen zulässigen Schritt gefunden. Am Plan habe ich nichts geändert." : ergebnis.antwort;
    res.json({ ok: true, antwort: antwortText, schritte: ergebnis.schritte, verworfen: ergebnis.verworfen.length, pruefung: ergebnis.pruefung, ...(ergebnis.frage ? { frage: ergebnis.frage } : {}) });
  } catch (e) {
    log.error?.(`[planr] plan-ki: ${e?.stack || e}`);
    res.status(500).json({ ok: false, message: "Die KI-Zeile ist gerade nicht erreichbar." });
  }
});

/** Pruefmodul der Planer: Ausschluesse zwischen den Positionen eines Plans (nur ebene, nr, zahn). */
router.post("/planr/plan-pruefen", planrGuard, (req, res) => {
  try {
    res.json({ ok: true, meldungen: planPruefung(req.body?.positionen) });
  } catch (e) {
    log.error?.(`[planr] plan-pruefen: ${e?.stack || e}`);
    res.status(500).json({ ok: false, meldungen: [] });
  }
});

router.get("/planr/status", planrGuard, async (req, res) => {
  try {
    const p = await praxisLaden(req.planrClientId);
    const k = p.katalog;
    res.json({
      ok: true, engineStand: E.ENGINE_STAND, clientId: req.planrClientId,
      praxis: {
        aktualisiert: p.aktualisiert, preislisten: p.preislisten.length, eigen: p.eigen.length, fremd: (p.fremd || []).length,
        katalog: k ? { pvs: String(k.pvs || ""), stand: String(k.stand || ""), eigenlabor: (k.eigenlabor || []).length } : null,
      },
    });
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
      hkps: alle.map((h) => (mitLink ? {
        ...kopf(h),
        link: { t: hkpLinkToken(h.id, Date.now(), req.planrClientId), b: hkpBearbeitenToken(h.id, Date.now(), req.planrClientId), ...(c ? { c } : {}) },
      } : kopf(h))),
      engineStand: E.ENGINE_STAND,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Private Sprach-Entwuerfe: die PlanR-Uebersicht holt sie in den Eingang des Planers und meldet sie mit ihrer Nummer abgeholt
router.get("/planr/entwuerfe", planrGuard, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const offen = await entwuerfeOffen(req.planrClientId);
    res.json({
      ok: true,
      entwuerfe: offen.filter((e) => ENTWURF_MODULE.has(e.modul)).map((e) => ({
        id: e.id, modul: e.modul, patient: e.anzeige, betrag: e.betrag, erstellt: e.erstellt, plan: JSON.parse(e.planJson),
        ...(e.fallId ? { fallId: e.fallId, fallTitel: e.fallTitel || "" } : {}),
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/planr/entwuerfe/:id/abgeholt", planrGuard, async (req, res) => {
  try {
    const nummer = String(req.body?.nummer || "").trim();
    if (!nummer || nummer.length > 80) return res.status(400).json({ ok: false, error: "nummer_fehlt" });
    const r = await entwurfAbgeholt(req.planrClientId, req.params.id, nummer);
    res.status(r.ok ? 200 : 409).json(r);
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

// PVS-Export aus der PlanR-Uebersicht: Plan plus Ergebnis, gerechnet mit den Praxis-Listen wie beim Speichern
router.get("/planr/hkp/:id/rechnung", planrGuard, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const h = await hkpLesen(req.planrClientId, req.params.id);
    if (!h) return res.status(404).json({ ok: false, error: "nicht_gefunden" });
    const plan = planAus(h);
    if (!plan) return res.status(422).json({ ok: false, error: "plan_defekt", message: "Der gespeicherte Plan ist nicht lesbar." });
    const praxis = await praxisLaden(req.planrClientId).catch(() => ({ preislisten: [], eigen: [] }));
    res.json({ ok: true, status: h.status, plan, ergebnis: E.rechnen(plan, praxisListen(praxis)) });
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

/** Angemeldeter PlanR-Benutzer für den Verlauf (PlanR schickt Name bzw. E-Mail mit) */
const werVon = (req) => {
  const wer = String(req.body?.wer || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  return wer ? `PlanR · ${wer}` : "PlanR";
};

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
    // Praxisgemeinschaft: PlanR stempelt die DS-Win-Praxis des Angemeldeten, damit andere Praxen den HKP nicht sehen
    const praxis = Number.isInteger(req.body?.praxis) && req.body.praxis >= 1 && req.body.praxis <= 9 ? req.body.praxis : undefined;
    const h = await hkpAnlegen(req.planrClientId, {
      ...(praxis ? { praxis } : {}),
      patient: { id: String(req.body?.patientId || ""), firstName: plan.patient.vorname || "", lastName: plan.patient.name || "", birthDate: plan.patient.geburtsdatum || "", label },
      art: "kasse", status, kiefer, versorgung: "", versorgungText: String(req.body?.versorgungText || "HKP").slice(0, 80),
      auftragText: "", befundQuelle: { art: "planr" }, planJson: JSON.stringify(plan), summen, zusammenfassung,
      hinweise: [], engineStand: E.ENGINE_STAND, erstelltVon: "planr", verlaufText: "in PlanR angelegt",
    }, werVon(req));
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
      version: b.version, felder, wer: werVon(req), was: was.join(", ") || "in PlanR geändert",
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
      preislisten: alsListe(b.preislisten), eigen: alsListe(b.eigen), fremd: alsListe(b.fremd), einstellungen,
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Nach jeder Aenderung in PlanR: nur Eigenlabor-Katalog und Fremdlabor-Liste mit ihren Zuordnungen.
// Eigener Pfad, damit ein PlanR-Stand vor diesem MAS keine Freigabe ohne Preislisten ausloest.
router.post("/planr/praxis/kataloge", planrGuard, async (req, res) => {
  try {
    const b = req.body || {};
    res.json({ ok: true, ...(await praxisKatalogeSpeichern(req.planrClientId, { eigen: alsListe(b.eigen), fremd: alsListe(b.fremd) })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Nach einem PVS-Abgleich in PlanR: Analogpositionen, Eigenlabor, BEL und Leistungsketten der Praxis
// ohne Preise in Claras Wissensbasis schreiben (hkp/praxisWissen.js). GET zeigt den Stand.
router.post("/planr/praxis-wissen", planrGuard, async (req, res) => {
  try {
    const r = await praxisKatalogNeu(req.planrClientId);
    res.json({ ok: Boolean(r.ok), ...r, stand: praxisWissenStand(req.planrClientId) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/planr/praxis-wissen", planrGuard, (req, res) => {
  res.json({ ok: true, stand: praxisWissenStand(req.planrClientId) });
});

// Fallkatalog: deterministische Praxisregeln aus den hochgeladenen Plänen, je Mandant.
router.post("/planr/praxis-stil", planrGuard, (req, res) => {
  try {
    const r = praxisStilMerken(req.planrClientId, req.body?.regeln);
    res.json({ ok: Boolean(r.ok), ...r, stand: praxisStilStand(req.planrClientId) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/planr/praxis-stil", planrGuard, (req, res) => {
  res.json({ ok: true, stand: praxisStilStand(req.planrClientId) });
});

// HKP-Clara fuer PlanR-Standalone (hkp/planrClara.js): Stufe, Ruf-Name, Handy-Kopplung.
// Umbenennen nur fuer Zugang "planr" — MAS-Praxen pflegen den Namen in der Plattform.
async function claraStand(clientId) {
  const billing = await getBilling(clientId);
  return { stufe: planrAusBilling(billing).clara, zugang: claraZugang(billing) };
}

router.get("/planr/clara", planrGuard, async (req, res) => {
  try {
    const { stufe, zugang } = await claraStand(req.planrClientId);
    res.json({ ok: true, stufe, zugang, umbenennbar: zugang === "planr", assistantName: await getAssistantName(req.planrClientId), standardName: DEFAULT_ASSISTANT_NAME });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.put("/planr/clara", planrGuard, async (req, res) => {
  try {
    const { zugang } = await claraStand(req.planrClientId);
    if (zugang !== "planr") return res.status(403).json({ ok: false, error: "nicht_umbenennbar" });
    const r = rufnameSaeubern(req.body?.assistantName);
    if (!r.ok) return res.status(400).json(r);
    await clientRef(req.planrClientId).set({ assistantName: r.name }, { merge: true });
    invalidateAssistantName(req.planrClientId);
    log.info("planr.clara.name", { clientId: req.planrClientId, name: r.name || DEFAULT_ASSISTANT_NAME });
    res.json({ ok: true, assistantName: r.name || DEFAULT_ASSISTANT_NAME });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/planr/clara/kopplung", planrGuard, async (req, res) => {
  try {
    const { zugang } = await claraStand(req.planrClientId);
    if (zugang !== "planr") return res.status(403).json({ ok: false, error: "nicht_gebucht" });
    const name = String(req.body?.name || "").trim().slice(0, 80);
    const nutzer = String(req.body?.nutzer || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
    if (!name || !nutzer) return res.status(400).json({ ok: false, error: "name_fehlt" });
    const t = await createPairingToken(req.planrClientId, { id: `planr_${nutzer}`, name, role: normalizeRole(req.body?.role) }, { createdBy: "planr", deviceType: "phone", apps: ["clara"] });
    const enc = encodeURIComponent;
    const url = `${PUBLIC_BASE_URL}/m/pair.html?c=${enc(req.planrClientId)}&t=${enc(t.token)}`;
    let qrDataUrl = "";
    try { qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 1 }); } catch { qrDataUrl = ""; }
    res.json({ ok: true, url, qrDataUrl, code: t.code, expiresAtMs: t.expiresAtMs });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Praxis-Verbund (PlanR fuehrt, hier der Spiegel fuer Clara/Eva): ?clientId = Gast-Praxis, nie der Standard-Mandant.
const verbundGast = (req, res) => {
  const gast = String(req.query?.clientId || "").trim();
  if (!gast) res.status(400).json({ ok: false, error: "clientId_fehlt", message: "Praxis fehlt." });
  return gast;
};

router.get("/planr/verbund", planrGuard, async (req, res) => {
  try {
    const gast = verbundGast(req, res);
    if (gast) res.json({ ok: true, verbund: await verbundLesen(gast) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/planr/verbund", planrGuard, async (req, res) => {
  try {
    const gast = verbundGast(req, res);
    if (!gast) return;
    const r = await verbundSetzen(gast, { haupt: req.body?.haupt, register: req.body?.register, von: req.body?.von });
    res.status(r.ok ? 200 : r.status).json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.delete("/planr/verbund", planrGuard, async (req, res) => {
  try {
    const gast = verbundGast(req, res);
    if (!gast) return;
    const r = await verbundLoesen(gast);
    res.status(r.ok ? 200 : r.status).json(r);
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
  await registerFuer(clientId);
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

export function nachnameGenau(gesprochen, p) {
  const nach = nameNorm(gesprochen).split(" ").filter((t) => t && !ANREDE.has(t)).pop();
  return !!nach && nach === nameNorm(p?.lastName);
}

async function karteiGenau(clientId, rawName, askWho) {
  const r = await resolveSpokenPatientForRead(clientId, { rawName, hint: "", askWho, plan: true });
  return !r.done && r.sel && nachnameGenau(rawName, r.sel) ? r.sel : null;
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
  // patientVon() traegt keine quelle, nur pvsNummer - daran lief die Vetternsuche fuer Partheni in die Kartei
  if (patient?.quelle === "pvs" || patient?.pvsNummer || planNurPvs()) {
    if (!patient?.firstName && !patient?.lastName) return [];
    const r = await sucheImPvs(clientId, `${patient.firstName} ${patient.lastName}`);
    return (r.alle || r.patients || []).filter((p) => p.id !== patient.id && sindVettern(patient, p));
  }
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
  // Plaene nur aus dem PVS: ein gemerkter Kartei-Treffer (z. B. aus search_patient) wird hier nie gewaehlt
  const gemerkteKandidaten = async () => (await getPatientCandidates(clientId)).filter((p) => !planNurPvs() || p?.quelle === "pvs");
  // Patientennummer bzw. Geburtsdatum aus dem PVS entscheidet vor dem Namen (auch MAS-Praxen mit PlanR-Bridge)
  const kennung = await pvsKennungAufloesen(clientId, body, { mehrfach: (l) => disambiguationQuestion(l, { max: 3 }), plan: true });
  if (kennung?.patient) {
    await setPatientCandidates(clientId, [kennung.patient], kennung.patient);
    return { patient: patientVon(kennung.patient), sel: kennung.patient };
  }
  if (kennung) {
    if (kennung.kandidaten) await setPatientCandidates(clientId, kennung.kandidaten, null);
    return { antwort: { ok: true, message: kennung.message } };
  }
  const offen = vettern ? vetternOffen.get(clientId) : null;
  if (offen && Date.now() - offen.at < VETTERN_MS) {
    // Clara schickt den Satz des Chefs ("Die Erste.") als chef_satz; im name steht weiter der alte Name.
    const satz = String(body?.chef_satz || "").trim() || hint;
    const a = vetterAntwort(offen, `${satz} ${rawName}`, satz);
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
    const gemerkt = await gemerkteKandidaten();
    const passend = bestePassung(rawName, gemerkt);
    if (passend.length === 1) {
      // Live 04.11.2026: "Prodromos Fanelas" (nur im Praxisprogramm) wurde zum gemerkten "Prodromos Varelas".
      // Klingt der Gemerkte nur aehnlich, gewinnt ein Treffer (bei Plaenen aus dem PVS) mit genau diesem Nachnamen.
      const genau = nachnameGenau(rawName, passend[0])
        ? null : await karteiGenau(clientId, rawName, askWho).catch(() => null);
      const wahl = genau || passend[0];
      await setPatientCandidates(clientId, [wahl], wahl);
      return { patient: patientVon(wahl), sel: wahl };
    }
    // Live 05.10.2026 22:45: Nachname ging verloren, "Michael" lieferte 20 Michaels.
    if (gemerkt.length === 1 && process.env.MAS_HKP_VORNAME_ANKER !== "0" && nurVornamePasst(rawName, gemerkt[0])) {
      log.info?.("[hkp] nur Vorname genannt -> gemerkter Patient bleibt");
      return { patient: patientVon(gemerkt[0]), sel: gemerkt[0] };
    }
  }
  if (rawName || hint) {
    const eng = merkmalEingrenzen(`${hint} ${rawName}`, await gemerkteKandidaten());
    if (eng.length === 1) {
      await setPatientCandidates(clientId, eng, eng[0]);
      return { patient: patientVon(eng[0]), sel: eng[0] };
    }
  }
  const r = await resolveSpokenPatientForRead(clientId, { rawName, hint, askWho, plan: true });
  if (!r.done) return { patient: patientVon(r.sel), sel: r.sel };
  const kandidaten = rawName ? await gemerkteKandidaten() : [];
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

// Befundwahl je Patient (Chef 14.10.2026): gewaehlte Quelle, schon genannte Zaehne und der vorgelesene,
// noch nicht freigegebene neue Befund. Ins Praxisprogramm geht nur, was genau so vorgelesen und mit Ja
// freigegeben wurde. Notaus MAS_HKP_BEFUND_SCHREIBEN=0 (keine Freigabe-Frage, nichts wird geschrieben).
const BEFUND_WAHL_MS = 20 * 60 * 1000;
const befundWahl = new Map();
const wahlSchluessel = (clientId, patient) => `${clientId}|${patient?.id || ""}`;
function wahlLesen(clientId, patient) {
  const k = wahlSchluessel(clientId, patient);
  const w = befundWahl.get(k);
  if (w && Date.now() - w.at <= BEFUND_WAHL_MS) return w;
  befundWahl.delete(k);
  return {};
}
const wahlMerken = (clientId, patient, w) => befundWahl.set(wahlSchluessel(clientId, patient), { ...wahlLesen(clientId, patient), ...w, at: Date.now() });
const befundSchreibenAus = () => process.env.MAS_HKP_BEFUND_SCHREIBEN === "0";
const JA_WORT = /^(ja|jawohl|genau|richtig|stimmt|passt|korrekt|freigegeben)\b/i;

// Restzaehne bei Totalprothese/Cover Denture: Die Engine trennt an Kommas, deshalb "17 und 15 werden entfernt".
const ALLE_RAUS = /\balle\b[^.?!]*\b(entfern|extrah|zieh|raus|weg)|\b(entfern|extrah|zieh)\w*\s+(\w+\s+)?alle\b/i;
export const restSatz = (zaehne, art) => `${zaehne.join(" und ")} ${art === "entfernen" ? "werden entfernt" : "bleiben erhalten"}`;
export function restFrage(zaehne) {
  const kiefer = /^[12]/.test(String(zaehne[0])) ? "Oberkiefer" : "Unterkiefer";
  return zaehne.length > 1
    ? `Im ${kiefer} stehen noch ${liste(zaehne)}. Sollen die alle entfernt werden, oder bleiben welche stehen?`
    : `Im ${kiefer} steht noch ${zaehne[0]}. Soll der entfernt werden, oder bleibt er stehen?`;
}
/** Antwort auf die Restzahn-Frage: Zahnangaben gelten woertlich, sonst alle entfernen oder alle erhalten. */
export function restAntwort(satz, zaehne) {
  const t = String(satz || "").trim().toLowerCase();
  if (!t) return "";
  if (/\b[1-4][,.]?\s?[1-8]\b/.test(t) && /entfern|extrah|zieh|raus|weg|bleib|erhalt|behalt|stehen/.test(t)) return String(satz).trim();
  if (/nicht (entfern|zieh|raus|extrah)|bleib|erhalt|behalt|stehen lassen|^\W*nein\b/.test(t)) return restSatz(zaehne, "erhalten");
  if (/entfern|extrah|zieh|raus|weg|^\W*(ja|jawohl|genau|richtig|alle)\b/.test(t)) return restSatz(zaehne, "entfernen");
  return "";
}
function restZusatzMerken(clientId, patient, auftragText, satz) {
  const bisher = wahlLesen(clientId, patient).restZusatz || "";
  const restZusatz = bisher.includes(satz) ? bisher : [bisher, satz].filter(Boolean).join(". ");
  wahlMerken(clientId, patient, { restZusatz });
  return auftragText.includes(satz) ? auftragText : `${auftragText}. ${satz}`;
}

/**
 * Antwort auf die eigene letzte Rueckfrage (Live 04.11.2026): Clara gibt den woertlichen Satz des Chefs als
 * chef_satz mit - auf "Ja", "erstens" oder "alle raus" setzt das Modell das passende Feld oft nicht.
 * Fuellt nur leere Felder; gibt den Auftrag samt gemerkter Restzahn-Entscheidung zurueck.
 * Was der Satz bedeutet, liest das Modell (antwortVerstehen); was daraus folgt, steht hier fest.
 */
const BEFUND_FRAGEN = new Set(["befund_fehlt", "befund_freigabe", "befund_korrektur", "befund_alt", "befund_quelle"]);

async function antwortAufFrage(clientId, patient, b, auftragText) {
  const offen = wahlLesen(clientId, patient);
  const satz = String(b.chef_satz || "").trim();
  // Die 01 steht schon auf dem Handy. Das Modell liest die Änderung aus der Wissensbasis,
  // die Engine schreibt sie. Ohne Modell gilt die Wortregel. Kein zweites Vorlesen.
  let anzeigeRoh = "";
  const entfernFrage = offen.frage === "glied_vorhanden" || offen.frage === "zahn_vorhanden";
  const restFrageOffen = (offen.frage === "restzaehne" || entfernFrage) && offen.frageZaehne?.length;
  const v = satz && offen.frage && offen.frageText
    ? await antwortVerstehen({ frage: offen.frageText, satz, zaehne: offen.frageZaehne || [], bisher: offen.planAuftrag || "", praxis: await praxisKatalog(clientId).catch(() => null) }) : null;
  if (satz && offen.frage && offen.frageText) b._intentGefragt = true;
  if (v) {
    log.info?.(`[hkp] Antwort auf ${offen.frage}: ${v.art}${v.quelle ? ` (${v.quelle})` : ""}${v.angabe ? ` - ${v.angabe}` : ""}${v.sagen ? ` | ${v.sagen}` : ""}`);
    if (v.sagen) b._sagen = v.sagen;
    if (v.art === "gegenfrage") {
      b._gegenfrage = true;
      return auftragText;
    }
    if (offen.frage === "befund_anzeige" && v.befund && !v.plan) {
      const gesagt = befundAusAntwort(v.befund, auftragsKiefer(E.auftragVerstehen([auftragText, offen.planAuftrag, offen.restZusatz].filter(Boolean).join(". "))));
      if (gesagt) b._handyAenderung = gesagt;
    } else if (offen.frage === "befund_anzeige" && !v.plan && !v.befund
      && (v.art === "zustimmung" || (v.art === "ablehnung" && offen.befundZaehneGefragt))) {
      // "Stimmt er so?" – Ja: der Befund auf dem Handy bleibt, weiter zur Planung. Ein Nein auf
      // "Welche Zähne soll ich ändern?" heißt ebenso: nichts zu ändern.
      if (!String(b.befund_quelle || "").trim()) b.befund_quelle = ["pvs", "lena", "neu"].includes(v.quelle) ? v.quelle : "pvs";
      if (b.befund_quelle !== "neu") wahlMerken(clientId, patient, { quelle: b.befund_quelle });
    } else if (offen.frage === "befund_anzeige" && v.art === "ablehnung" && !v.plan && !v.befund) {
      // "Nein" ohne Zähne: einmal nachfragen, welche
      b._handyFragen = true;
    } else if (offen.frage === "befund_anzeige" && v.art === "unklar" && !v.plan && !v.befund) {
      anzeigeRoh = satz;
    }
    if (v.art === "abbruch" || v.art === "neustart") {
      await neuAnfangen(clientId, patient, offen);
      b._neu = v.art;
      return auftragText;
    }
    const ja = v.art === "zustimmung";
    // Live 04.11.2026 21:33: "Im Oberkiefer stehen 13 und 23, alle anderen sind entfernt" landete im Auftrag statt
    // im Befund, MAS las "18 und 28 fehlen". Der verstandene Befund geht als fester Befundsatz in b.befund.
    // Kiefer des Plans samt gemerkter Versorgung ("Oberkiefer-Totalprothese ..." steht nur im restZusatz)
    const mitZusatz = [auftragText, offen.restZusatz].filter(Boolean).join(". ");
    const befundGesagt = v.befund && BEFUND_FRAGEN.has(offen.frage)
      ? befundAusAntwort(v.befund, auftragsKiefer(E.auftragVerstehen(mitZusatz))) : "";
    if (befundGesagt) {
      log.info?.(`[hkp] Befund aus der Antwort: ${befundGesagt}`);
      b.befund = befundGesagt;
      if (offen.frage === "befund_quelle" && !String(b.befund_quelle || "").trim()) b.befund_quelle = "neu";
    }
    if (offen.frage === "befund_quelle" && !String(b.befund_quelle || "").trim()) b.befund_quelle = v.quelle || satz;
    if (offen.frage === "befund_freigabe" && (ja || /^(?:das|der|die) ist (?:richtig|korrekt)\b/i.test(satz))) b.befund_freigegeben = true;
    if (offen.frage === "befund_freigabe" && v.art === "ablehnung" && !befundGesagt) b._befundNein = true;
    if (offen.frage === "befund_freigabe" && v.art === "angabe") b._korrektur = true;
    if (offen.frage === "versorgung" && v.befund) b._befundZuerst = true;
    // "Wir nehmen einen neuen Befund auf" auf "Stimmt der Befund so?": neu diktieren lassen statt dieselbe Frage
    if (["befund_freigabe", "befund_korrektur", "befund_alt"].includes(offen.frage) && v.quelle === "neu" && !befundGesagt) b._befundNeu = true;
    if (offen.frage === "befund_alt" && ja) b.befund_bestaetigt = true;
    const zusaetze = [];
    // „Das sind Implantate, All-on-6“ erklärt die Versorgung. Daraus wird kein Befund
    // und keine Extraktion, sonst fragt Clara die Änderung ein zweites Mal.
    const implantatErklaerung = entfernFrage && /\b(?:all[\s-]*on|allon|orlon|olon|ollon|implantat)/i.test(satz) && !v.entfernen.length;
    if (restFrageOffen && !implantatErklaerung) {
      // "Alle Teleskop" beantwortet die Restzahn-Frage: die Zähne bleiben und werden Teleskope.
      if (/teleskop|doppelkrone|konus/i.test(`${satz} ${v.angabe || ""}`) && !v.entfernen.length) {
        zusaetze.push(restSatz(offen.frageZaehne.map(String), "erhalten"));
        zusaetze.push("Teleskopkronen");
      } else {
        const raus = v.entfernen.length || v.erhalten.length ? v.entfernen : ja ? offen.frageZaehne.map(String) : [];
        if (raus.length) zusaetze.push(restSatz(raus, "entfernen"));
        if (v.erhalten.length) zusaetze.push(restSatz(v.erhalten, "erhalten"));
        if (!raus.length && !v.erhalten.length && v.art === "ablehnung" && offen.frage === "restzaehne") {
          zusaetze.push(restSatz(offen.frageZaehne.map(String), "erhalten"));
        }
      }
    }
    if (v.plan && ["versorgung", "befund_anzeige", "kiefer_fehlt"].includes(offen.frage)) {
      b._planSatz = v.plan;
      log.info?.(`[hkp] Intent: ${v.plan}`);
    } else if (!b._handyAenderung && !b._handyFragen && v.angabe && !befundGesagt && !b._befundNeu && !implantatErklaerung && !(restFrageOffen && zusaetze.length)) zusaetze.push(v.angabe);
    for (const z of zusaetze) if (auftragText && !textNorm(auftragText).includes(textNorm(z))) auftragText = restZusatzMerken(clientId, patient, auftragText, z);
  } else if (satz) {
    if (offen.frage === "befund_anzeige") {
      const zahlen = satz.replace(/\b([1-4])\s*[,.]\s*([1-8])\b/g, "$1$2");
      const stand = /\b(fehl|vorhanden|änder|aender|stehen|steht|gesund|zahnlos)\b/i.test(zahlen);
      const aenderung = stand && (/\b[1-4][1-8]\b/.test(zahlen) || /\balle\b/i.test(zahlen));
      const nurNein = /^(nein|nee|nö|no)\b/i.test(satz) && !aenderung;
      if (aenderung) b._handyAenderung = zahlen;
      else if (nurNein && !offen.befundZaehneGefragt) b._handyFragen = true;
      else if (nurNein || /^(ja|jawohl|genau|stimmt|passt|richtig|so lassen|weiter|planen)\b/i.test(satz)) {
        if (!String(b.befund_quelle || "").trim()) b.befund_quelle = "pvs";
        wahlMerken(clientId, patient, { quelle: b.befund_quelle });
      } else anzeigeRoh = satz;
    }
    // Ohne Modell: nur die eindeutigen Faelle. Ein Satz mit Zahnnummern auf eine Befundfrage ist der Befund.
    const mitZahlen = satz.replace(/\b([1-4])\s*[,.]\s*([1-8])\b/g, "$1$2");
    if (BEFUND_FRAGEN.has(offen.frage) && offen.frage !== "befund_quelle" && !JA_WORT.test(satz) && /\b[1-4][1-8]\b/.test(mitZahlen)) {
      // Live 05.11.2026: Modell zu langsam, der Wortparser las "es fehlen die Zaehne 18, 17, ... 24 bis 28" als
      // "alle vorhanden". Ein diktierter Befund wird nicht geraten - nur ohne Modell (Notaus) gilt die Wortregel.
      if (process.env.MAS_HKP_ANTWORT_LLM === "0") b.befund = mitZahlen;
      else b._befundUnklar = true;
    }
    const befundJa = JA_WORT.test(satz) || /^(?:das|der|die) ist (?:richtig|korrekt)\b/i.test(satz);
    if (offen.frage === "befund_freigabe" && !befundJa) b._korrektur = true;
    if (offen.frage === "befund_quelle" && !String(b.befund_quelle || "").trim()) b.befund_quelle = satz;
    if (offen.frage === "befund_freigabe" && befundJa) b.befund_freigegeben = true;
    if (offen.frage === "befund_alt" && JA_WORT.test(satz)) b.befund_bestaetigt = true;
    if (restFrageOffen) {
      // "Soll ich ihn als zu entfernen planen?" - ein Nein laesst sich nicht planen, dann fragt die Engine weiter.
      const zusatz = entfernFrage && (/\b(?:all[\s-]*on|allon|orlon|olon|ollon|implantat)/i.test(satz) || /^\W*nein\b|nicht (entfern|zieh|raus)/i.test(satz)) ? "" : restAntwort(satz, offen.frageZaehne);
      if (zusatz && auftragText) auftragText = restZusatzMerken(clientId, patient, auftragText, zusatz);
    }
  }
  if (b._handyAenderung || b._handyFragen) {
    const rest = wahlLesen(clientId, patient).restZusatz || "";
    return rest && auftragText && !auftragText.includes(rest) ? `${auftragText}. ${rest}` : auftragText;
  }
  if (anzeigeRoh && !b._planSatz && (wahlLesen(clientId, patient).restZusatz || "") === (offen.restZusatz || "") && auftragText) {
    auftragText = restZusatzMerken(clientId, patient, auftragText, anzeigeRoh);
  }
  // Live 05.11.2026: „voll verblendet, momentan teilverblendet“ kam in der Vorschau an und änderte nichts,
  // weil die Umschreibung des Modells die Verblendart verlor. Der Satz selbst bleibt im Auftrag.
  if (satz && (offen.frage === "vorlesen" || offen.frage === "ausfuehrung") && VOKABEL.test(satz) && auftragText && !textNorm(auftragText).includes(textNorm(satz))) {
    auftragText = restZusatzMerken(clientId, patient, auftragText, satz);
  }
  const rest = wahlLesen(clientId, patient).restZusatz || "";
  return rest && auftragText && !auftragText.includes(rest) ? `${auftragText}. ${rest}` : auftragText;
}

/** Antwort auf die eigene Vorschau: "zustimmung" | "angabe" | ... | "" (keine Vorschau offen). Ohne Modell nur ein klares "Ja ..." */
async function vorschauAntwort(w, satz) {
  if (!satz || w?.frage !== "vorlesen") return "";
  const v = w.frageText ? await antwortVerstehen({ frage: w.frageText, satz }) : null;
  if (v) return v.art;
  return JA_WORT.test(satz) && !/\b(aber|nicht|statt|sondern)\b/i.test(satz) ? "zustimmung" : "";
}

// Neues Gespraech = frischer Vorgang (Live 04.11.2026: Befund-Zwischenstand, Vorschau und Ausfuehrung des
// abgebrochenen Versuchs liefen in den naechsten; 13 und 23 gingen als fehlend nach DS-Win). Clara schickt je
// Gespraech eine Sitzungskennung. Notaus MAS_HKP_SITZUNG=0.
async function sitzungPruefen(clientId, patient, b) {
  const sitzung = String(b.sitzung || "").trim();
  if (!sitzung || process.env.MAS_HKP_SITZUNG === "0") return;
  const alt = wahlLesen(clientId, patient);
  if (alt.sitzung === sitzung) return;
  if (Object.keys(alt).some((k) => k !== "at" && k !== "pvsNummer")) {
    log.info?.(`[hkp] neues Gespraech fuer Patient ${patient.id}: alter Zwischenstand verworfen`);
    await neuAnfangen(clientId, patient, alt);
  }
  wahlMerken(clientId, patient, { sitzung, ...(alt.pvsNummer ? { pvsNummer: alt.pvsNummer } : {}) });
}

/** Angefangenen Vorgang eines Patienten verwerfen: Zwischenstand, Vorschau, Ausfuehrungsfrage, nie freigegebene Zaehne */
async function neuAnfangen(clientId, patient, alt) {
  befundWahl.delete(wahlSchluessel(clientId, patient));
  vorschauOffen.set(clientId, vorschauen(clientId).filter((v) => v.patient?.id !== patient.id));
  ausfuehrungGefragt.delete(ausfuehrungSchluessel(clientId, patient));
  // Clara hatte Zaehne vorgeschlagen, aber nie freigegeben: die rosa Aenderungen in PlanR gelten nicht weiter
  if (alt?.offen && alt.frei !== alt.offen && alt.pvsNummer) await befundVerwerfenPvs(clientId, alt.pvsNummer).catch(() => null);
  if (alt?.sitzung || alt?.pvsNummer) wahlMerken(clientId, patient, { ...(alt.sitzung ? { sitzung: alt.sitzung } : {}), ...(alt.pvsNummer ? { pvsNummer: alt.pvsNummer } : {}) });
}

/**
 * Befund aus dem Praxisprogramm ohne den Vorschlag eines frueheren Gespraechs. neuAnfangen verwirft ihn nur, solange
 * MAS das Gespraech noch kennt (BEFUND_WAHL_MS, nicht ueber einen Neustart) - live 04.11.2026 kam der abgelehnte
 * Standardbefund von 21:33 im naechsten Versuch ungefragt als "gerade geaendert" wieder.
 */
const ohneAltenVorschlag = (wahl) => async (clientId, patient) => {
  const p = await pvsBefund(clientId, patient);
  if (!p?.ok || wahl.offen || !Object.keys(p.offen).length || !hkpVorschlag(p.offenWer)) return p;
  log.info?.(`[hkp] alter Befund-Vorschlag (${p.offenWer}, ${p.stand}) fuer Patient ${p.nummer} verworfen`);
  await befundVerwerfenPvs(clientId, p.nummer).catch(() => null);
  return { ...p, offen: {} };
};

/** Vor dem Schreiben ins Praxisprogramm: neuer Befund ganz, sonst nur die Aenderungen gegenueber dem Praxisprogramm */
export function befundFreigabeSatz(patient, befund) {
  const { neu, pvs } = befund;
  const was = neu.geaendert
    ? `Gegenüber ${pvs.name} ändere ich: ${zahnBefundSatz(neu.geaendert)}.`
    : `Ich habe aufgenommen: ${befundSatz(neu.zaehne, neu.kiefer)}`;
  return `Bitte den Befund für ${patient.anredeLabel} prüfen. ${was} Stimmt der Befund so? Dann übertrage ich ihn nach ${pvs.name}, dort ersetzt er den alten, und plane weiter.`;
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

// Trockenlauf fuer die Ablauf-Probe (%TEMP%\verbund\hkp_nur.mjs): alles echt bis zum Anlegen, dann nur die Ansage.
// Nie im Live-Betrieb setzen. MAS_HKP_TROCKEN=1.
function trockenAngelegt(clientId, patient, was) {
  if (process.env.MAS_HKP_TROCKEN !== "1") return null;
  befundWahl.delete(wahlSchluessel(clientId, patient));
  log.info?.(`[hkp] TROCKENLAUF: ${was} fuer Patient ${patient.id} nicht angelegt`);
  return { ok: true, entwurfId: "trocken", message: `${was} für ${patient.anredeLabel} ist angelegt (Trockenlauf, nichts gespeichert).` };
}

async function entwurfAnlegen(clientId, d) {
  const trocken = trockenAngelegt(clientId, d.patient, d.versorgungText || "Der HKP");
  if (trocken) return trocken;
  const { patient, auftrag, auftragText, befund, r, summen, versorgungText, zusaetzlich, doppelt } = d;
  const h = await hkpAnlegen(clientId, {
    patient, art: "kasse", status: "wartet_auf_freigabe", kiefer: auftrag.kiefer || "", versorgung: auftrag.versorgung || "",
    versorgungText: d.fallTitel ? `${d.fallTitel} · ${versorgungText}` : versorgungText, auftragText,
    fallId: d.fallId || "", fallTitel: d.fallTitel || "",
    auftrag: JSON.parse(JSON.stringify(auftrag)), befundQuelle: befund.quelle,
    befundJson: JSON.stringify(befund.befund), planJson: JSON.stringify(r.plan), summen,
    zusammenfassung: r.zusammenfassung, hinweise: [...befund.hinweise, ...r.hinweise], engineStand: E.ENGINE_STAND,
    erstelltVon: "clara",
    verlaufText: `von Clara per Sprache angelegt${d.vorgelesen ? " (vorgelesen und bestätigt)" : ""}${zusaetzlich && doppelt.length ? " (bewusst zusätzlich zu einem bestehenden HKP)" : ""}`,
  }, "Clara");
  log.info?.(`[hkp] Entwurf ${h.id} angelegt (${versorgungText}, Befund ${befund.quelle?.art}, Patient ${patient.id})`);
  liveMelden(clientId, { phase: "angelegt", patient: livePatient(patient), befund: befund.befund, plan: r.plan, hkpId: h.id, meldung: `${versorgungText} angelegt – wartet auf Ihre Freigabe.` });
  vorgangMelden(clientId, befund.pvs?.nummer, { modul: "hkp", phase: "angelegt", hkpId: h.id, plan: planZeilen(r.plan), meldung: "" });
  await befundDateiAnhaengen(clientId, h, d);
  letzterMerken(clientId, h);
  ausfuehrungGefragt.delete(ausfuehrungSchluessel(clientId, patient));
  const ausfuehrung = d.vorgelesen ? "" : ausfuehrungText(r.plan);
  befundWahl.delete(wahlSchluessel(clientId, patient));
  const quelle = befund.quelle?.art?.includes("lena01") ? ` Befund aus der Lena-Erstuntersuchung vom ${datumDe(befund.quelle.datum)}.`
    : befund.quelle?.art === "pvs" ? ` Befund aus ${befund.quelle.pvs}${befund.quelle.datum ? ` vom ${datumDe(befund.quelle.datum)}` : ""}.` : "";
  const weg = d.alteVerwerfen && doppelt?.length ? await alteVerwerfen(clientId, doppelt, h) : [];
  const wegSatz = weg.length ? ` Der alte ${hkpTitel(weg[0])}${weg.length > 1 ? " und weitere" : ""} ist verworfen.` : "";
  const card = hkpKarte(h, clientId);
  return {
    ok: true, hkpId: h.id, ...(card ? { card } : {}), ...(weg.length ? { verworfen: weg.map((x) => x.id) } : {}),
    ...mitUndo("hkp", { id: h.id, label: `den ${hkpTitel(h)} für ${patient.anredeLabel}`, alt: weg.map((x) => x.id) }),
    message: `Der ${hkpTitel(h)} für ${patient.anredeLabel} ist angelegt und wartet auf Ihre Freigabe in PlanR.${d.vorgelesen ? "" : ` Geplant: ${versorgungSatz(r.zusammenfassung)}.`}${ausfuehrung ? ` Ausführung: ${ausfuehrung}.` : ""}${d.zielpreis ? ` ${reglerSatz(d.zielpreis)}` : ""} ${summenSatz(summen)}.${wegSatz}${quelle}${annahmenSatz(r.hinweise, r.zusammenfassung.warnungen, { ausfuehrungGesagt: true })}`,
  };
}

// Privater Zahnersatz per Sprache (Chef 15.10.2026): gleiche Gespraechsfuehrung wie der HKP, gerechnet mit der
// Engine des Privat-Planers (src/vendor/privat-ze-engine.mjs). Der Entwurf wartet in planrEntwuerfe, bis die
// PlanR-Uebersicht ihn mit eigener Nummer in den Planer holt. Notaus MAS_PRIVAT_ZE=0.
const privatAus = () => String(process.env.MAS_PRIVAT_ZE || "").trim() === "0";
const PRIVAT_TEXT = "Privatplan Zahnersatz";
const PRIVAT_AUS_SATZ = "Einen privaten Zahnersatz-Plan kann ich gerade nicht per Sprache anlegen. Bitte im Planer Zahnersatz privat in PlanR erstellen.";
// "Privatstufe"/"Privatanteil" gehoeren zum Kassen-HKP; "HKP" sagt die Praxis auch zum Privatplan
const PRIVAT_WORT = /\bprivat(?!stufe|anteil)|kostenvoranschlag/i;
const KASSE_WORT = /\bkasse|gesetzlich/i;
export const privatGesagt = (t) => PRIVAT_WORT.test(t) && !KASSE_WORT.test(t);
export const kasseGesagt = (t) => KASSE_WORT.test(t) || (/\bhkp\b|heil- ?und kostenplan/i.test(t) && !PRIVAT_WORT.test(t));

async function privatAnlegen(clientId, d) {
  const trocken = trockenAngelegt(clientId, d.patient, "Der Privatplan");
  if (trocken) return trocken;
  const { patient, auftragText, befund, r, summen } = d;
  const e = await entwurfAblegen(clientId, {
    modul: "privat-kv",
    patient: { id: patient.id, label: patient.anredeLabel || "", name: patient.lastName || "", vorname: patient.firstName || "", geburtsdatum: patient.birthDate || "" },
    anzeige: d.anzeige || [patient.firstName, patient.lastName].filter(Boolean).join(" "), betrag: summen.gesamt, planJson: JSON.stringify(r.plan),
    auftragText, befundQuelle: befund.quelle || null, hinweise: [...(befund.hinweise || []), ...r.hinweise], engineStand: P.ENGINE_STAND,
    fallId: d.fallId || "", fallTitel: d.fallTitel || "",
  });
  log.info?.(`[hkp] Privat-Entwurf ${e.id} abgelegt (Befund ${befund.quelle?.art}, Patient ${patient.id})`);
  vorgangMelden(clientId, befund.pvs?.nummer, { modul: "privat-kv", phase: "angelegt", plan: planZeilen(r.plan), meldung: "" });
  befundWahl.delete(wahlSchluessel(clientId, patient));
  const quelle = befund.quelle?.art?.includes("lena01") ? ` Befund aus der Lena-Erstuntersuchung vom ${datumDe(befund.quelle.datum)}.`
    : befund.quelle?.art === "pvs" ? ` Befund aus ${befund.quelle.pvs}${befund.quelle.datum ? ` vom ${datumDe(befund.quelle.datum)}` : ""}.` : "";
  return {
    ok: true, entwurfId: e.id,
    ...mitUndo("planr_entwurf", { id: e.id, label: `den Privatplan Zahnersatz für ${patient.anredeLabel}` }),
    message: `Der Privatplan Zahnersatz für ${patient.anredeLabel} ist angelegt. Er steht in PlanR im Planer Zahnersatz privat als Entwurf; gerechnet wird dort mit Ihren Praxispreisen.`
      + `${d.vorgelesen ? "" : ` Geplant: ${versorgungSatz(r.zusammenfassung)}.`} Vorläufig ${privatSummenSatz(summen)}.${quelle}${annahmenSatz(r.hinweise, r.hinweise)}`,
  };
}

// Fuellungs-MKV, private Kons und Implantologie per Sprache (Chef 15.10.2026): Engines der Planer (src/vendor/mkv-engine.mjs,
// kons-engine.mjs, impl-engine.mjs). Den Befund lesen sie nur zur Pruefung aus dem Praxisprogramm (keine Quellen-Frage);
// der Entwurf wartet wie der private Zahnersatz in planrEntwuerfe und kommt ohne Regler an, damit der Planer mit den
// Einstellungen der Praxis rechnet. Notaus MAS_MKV=0, MAS_KONS=0 bzw. MAS_IMPL=0.
const MKV_WORT = /mehrkosten|\bm\.? ?k\.? ?v\b/i;
const FUELLUNG_WORT = /f(?:ü|ue)llung|komposit|kunststoff|inlay|einlagef|goldh(?:ä|ae)mmer|\baufbau/i;
const ZE_WORT = /krone|br(?:ü|ue)cke|prothese|teleskop|implantat|zahnersatz|\bhkp\b|heil- ?und kostenplan|suprakonstruktion|all[\s-]*on|locator|druckknopf|kugelkopf|novaloc|equator|table[\s-]?top|\bonlay\b|galvano/i;
const KONS_WORT = /f(?:ü|ue)llung|komposit|kunststoff|inlay|einlagef|goldh(?:ä|ae)mmer|\baufbau|wurzel|\bwkb\b|\bendo|revision|(?:ü|ue)berkapp|pulpotomie|versiegel|infiltration|\bicon\b|veneer|bleach|bleich|\bkons\b|konservier/i;
const KONS_PRIVAT_WORT = /privat|kosten\s?voranschlag|\bkons\b|konservier|\bgoz\b/i;
export const mkvGesagt = (t) => MKV_WORT.test(t) || (FUELLUNG_WORT.test(t) && !ZE_WORT.test(t));
export const konsGesagt = (t) => !MKV_WORT.test(t) && !ZE_WORT.test(t) && KONS_WORT.test(t) && KONS_PRIVAT_WORT.test(t);
// Implantat ohne Prothetik-Wort ist die Chirurgie; "Implantatkrone", "Brücke auf Implantaten" bleiben Zahnersatz
const IMPL_WORT = /implantat(?!\w*(?:kron|getragen|br(?:ü|ue)cke|prothes|versorg|suprakon|abutment))|implantation|implantolog|sinuslift|sinusboden|knochenaufbau|augmentation/i;
const PROTHETIK_WORT = /krone|br(?:ü|ue)cke|prothese|teleskop|\bsteg\b|zahnersatz|abutment|suprakonstruktion|\bhkp\b|heil- ?und kostenplan|all[\s-]*on|locator|druckknopf|kugelkopf|novaloc|equator|table[\s-]?top|\bonlay\b|galvano|teilkrone/i;
export const implGesagt = (t) => IMPL_WORT.test(t) && !PROTHETIK_WORT.test(t) && !MKV_WORT.test(t);
// Live 05.11.2026: das Modell kürzt „verschraubte vollanatomische Zirkonkrone“ auf „Krone“.
// Der Originalsatz hängt am Werkzeug und wird angehängt, wenn diese Wörter darin fehlen.
const VOKABEL = /teil\s*verblend|voll\s*verblend|vollverblend|vestibul|verschraub|zementier|abutment|locator|locater|druckknopf|kugel(?:kopf|anker)|novaloc|equator|implantatsteg|\bsteg\b|all[\s-]*on|inlay|onlay|table[\s-]?top|teilkrone|galvano|vollanatom|monolith|zirkonteleskop|prim(?:ä|ae)r\s*teleskop|suprakonstruktion|matrize|patrize|geri?st\w*.{0,20}verblend/i;
export function vokabelSichern(auftrag, satz) {
  const s = String(satz || "").trim();
  if (!s || !VOKABEL.test(s)) return auftrag;
  if (auftrag && textNorm(auftrag).includes(textNorm(s))) return auftrag;
  return auftrag ? `${auftrag}. ${s}` : s;
}

const engineAus = (name) => String(process.env[name] || "").trim() === "0";
const patientFuerEngine = (patient) => ({ name: patient.lastName || "", vorname: patient.firstName || "", geburtsdatum: patient.birthDate || "" });
const SPRACH_PLAENE = {
  mkv: {
    modul: "kons-mkv", text: "Füllungs-Mehrkostenvereinbarung", planer: "Füllungs-MKV", art: "die", akk: "die",
    aus: () => engineAus("MAS_MKV"),
    ausSatz: "Eine Füllungs-Mehrkostenvereinbarung kann ich gerade nicht per Sprache anlegen. Bitte im Planer Füllungs-MKV in PlanR erstellen.",
    voll: FUELLUNG_WORT, extra: MKV_WORT,
    kuerzel: { komposit: "K", mehrfarben: "M", inlay: "I", goldhaemmer: "G", aufbau: "A" },
    entwurf: (text, befund, patient, praxis) => M.mkvEntwurf(text, befund, {
      patient: patientFuerEngine(patient),
      praxis: { plz: String(praxis?.einstellungen?.praxisPlz || ""), kzvNr: String(praxis?.einstellungen?.kzv || "") },
    }),
    versorgung: (z) => M.mkvVersorgungSatz(z),
    summen: (z) => ({ mehrkosten: zahl(z.mehrkosten), kassenanteil: zahl(z.kassenanteil), privat: zahl(z.privat), privat7: zahl(z.privat7) }),
    summenSatz: mkvSummenSatz, betrag: (s) => s.mehrkosten, hinweise: () => [],
    nachsatz: "die Mehrkosten rechnet der Planer dort nach Ihrem Praxismodell",
    stand: () => M.ENGINE_STAND,
  },
  kons: {
    modul: "privat-kons", text: "Kostenvoranschlag Kons", planer: "Privat-Kons", art: "der", akk: "den",
    aus: () => engineAus("MAS_KONS"),
    ausSatz: "Einen Kostenvoranschlag Kons kann ich gerade nicht per Sprache anlegen. Bitte im Planer Privat-Kons in PlanR erstellen.",
    voll: KONS_WORT, extra: KONS_PRIVAT_WORT,
    kuerzel: { komposit: "F", inlay: "I", goldhaemmer: "G", endo: "W", revision: "R", vital: "U", versiegelung: "V", aufbau: "A", infiltration: "K", veneer: "D", bleaching: "B" },
    entwurf: (text, befund, patient) => K.konsEntwurf(text, befund, { patient: patientFuerEngine(patient) }),
    versorgung: (z) => K.konsVersorgungSatz(z),
    summen: (z) => ({ summe: zahl(z.summe), vereinbarung: z.vereinbarung }),
    summenSatz: konsSummenSatz, betrag: (s) => s.summe,
    hinweise: (r) => (r.zusammenfassung.vereinbarung !== "pkv" ? [`Vereinbarung: ${K.VEREINBARUNG_TEXT[r.zusammenfassung.vereinbarung]}.`] : []),
    nachsatz: "Faktor und Zusatzleistungen rechnet der Planer dort nach Ihren Einstellungen",
    stand: () => K.ENGINE_STAND,
  },
  impl: {
    modul: "privat-impl", text: "Kostenvoranschlag Implantologie", planer: "Implantologie", art: "der", akk: "den",
    aus: () => engineAus("MAS_IMPL"),
    ausSatz: "Einen Kostenvoranschlag Implantologie kann ich gerade nicht per Sprache anlegen. Bitte im Implantologie-Planer in PlanR erstellen.",
    voll: IMPL_WORT, extra: /kosten\s?voranschlag|privat/i,
    tp: (l) => String(l.TP || ""),
    entwurf: (text, befund, patient, praxis) => I.implEntwurf(text, befund, { patient: patientFuerEngine(patient), implantatSystem: implantatStandard(praxis) }),
    versorgung: (z) => I.implVersorgungSatz(z),
    summen: (z) => ({ summe: zahl(z.summe), honorar: zahl(z.honorar), materialLabor: zahl(z.materialLabor) }),
    summenSatz: implSummenSatz, betrag: (s) => s.summe, hinweise: () => [],
    nachsatz: "Faktoren, Material und Zusatzleistungen rechnet der Planer dort nach Ihren Einstellungen",
    stand: () => I.ENGINE_STAND,
  },
};
const grossAnfang = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sprachPlanZeilen = (cfg, plan) => Object.fromEntries(Object.entries(plan?.zaehne || {})
  .map(([z, l]) => [z, { TP: cfg.tp ? cfg.tp(l) : `${cfg.kuerzel[l.therapie] || ""}${l.flaechen || l.kanaele || ""}`, R: "" }]));

/** Welche Sprach-Planart der Kons-Familie meint der Auftrag? planart des Werkzeugs vor dem Wortlaut. */
function sprachPlanAus(b, auftragText) {
  const art = String(b.planart || "").trim().toLowerCase();
  if (SPRACH_PLAENE[art]) return art;
  const t = auftragText;
  if (implGesagt(t)) return "impl";
  if (!MKV_WORT.test(t) && !ZE_WORT.test(t) && KONS_WORT.test(t) && (wahr(b.privat) || KONS_PRIVAT_WORT.test(t))) return "kons";
  if (!wahr(b.privat) && mkvGesagt(t)) return "mkv";
  return null;
}

/** Rechnen und vorlesen bzw. zurueckfragen; d: { sprachPlan, patient, auftragText, befundZaehne, praxis, namenGesagt, pvsNr, befundQuelle } */
/** Ausschluss-Tabelle auf jedem gerechneten Plan: Treffer werden mit Fundstelle vorgelesen, die Tabelle gewinnt */
function ausschlussHinweise(r, patient) {
  const treffer = planPruefen(positionenVon(r));
  if (treffer.length) log.warn?.(`[hkp] Ausschluss im Plan fuer ${patient?.id || "?"}: ${treffer.map((e) => `${e.k} ${e.a}/${e.b} (${e.bei})`).join(", ")}`);
  return treffer.slice(0, 2).map((e) => e.hinweis);
}

function sprachPlanRechnen(clientId, d) {
  const cfg = SPRACH_PLAENE[d.sprachPlan];
  const r = cfg.entwurf(d.auftragText, d.befundZaehne || {}, d.patient, d.praxis);
  if (r.status !== "ok") {
    wahlMerken(clientId, d.patient, { planart: d.sprachPlan, teilAuftrag: d.auftragText, teilKonflikt: r.zahn || "", teilGrund: r.grund });
    return { ok: true, rueckfrage: r.grund, message: r.frage };
  }
  const z = r.zusammenfassung;
  const summen = cfg.summen(z);
  const hinweise = [...ausschlussHinweise(r, d.patient), ...cfg.hinweise(r), ...r.hinweise,
    ...(d.befundQuelle ? [] : ["Einen Befund aus dem Praxisprogramm hatte ich nicht, die Zähne habe ich deshalb nicht geprüft."])];
  // vollstaendig vorgelesen: ein neuer Auftrag beginnt von vorn (Korrekturen laufen ueber hkp-ausfuehrung-aendern)
  wahlMerken(clientId, d.patient, { planart: d.sprachPlan, teilAuftrag: "", teilKonflikt: "", teilGrund: "" });
  vorgangMelden(clientId, d.pvsNr, { modul: cfg.modul, phase: "planung", plan: sprachPlanZeilen(cfg, r.plan), meldung: "" });
  vorschauMerken(clientId, { ...d, r, summen, hinweise, versorgungText: cfg.text, at: Date.now() });
  return {
    ok: true, rueckfrage: "vorlesen",
    message: vorleseSatz({
      patient: d.patient, versorgungText: cfg.text, versorgung: cfg.versorgung(z), summen: cfg.summenSatz(summen),
      hinweis: hinweise.slice(0, 3).join(" "), befundFreigegeben: true,
    }),
  };
}

const ZAHN_IM_TEXT = /(?<!\d)[1-4]\s?[,.]?\s?[1-8](?!\d)/g;
const ANZAHL_WORT = /\b(?:ein|eine|einen|zwei|drei|vier|f(?:ü|ue)nf|[1-5])\b/i;
const EINHEIT = {
  kanaele: [/kan(?:a|ä|ae)l/i, " Kanäle"],
  flaechen: [/fl(?:ä|ae)ch|\b[modblpvi]{2,5}\b|okklusal|mesial|distal|bukkal|lingual|palatinal|inzisal/i, " Flächen"],
};
/**
 * Antwort auf eine Rueckfrage: eine Teilantwort ("beide mod", "47", "drei") ergaenzt den bisherigen Auftrag, beim
 * Befund-Konflikt ersetzt der genannte Zahn den unmoeglichen. Ein vollstaendiger neuer Auftrag (Leistung und Zahn)
 * oder einer, der den alten schon enthaelt, gilt allein.
 */
export function sprachFolgeText(w, auftragText, sprachPlan = "mkv") {
  const cfg = SPRACH_PLAENE[sprachPlan];
  const vorher = String(w?.teilAuftrag || "").replace(/[\s.]+$/, "");
  if (!vorher || textNorm(auftragText).includes(textNorm(vorher))) return auftragText;
  if (w.teilGrund === "aufbau_oder_fuellung" && !(String(auftragText).match(ZAHN_IM_TEXT) || []).length) return `${vorher}. Gewählt: ${auftragText}`;
  const einheit = EINHEIT[w.teilGrund];
  if (einheit && !einheit[0].test(auftragText) && ANZAHL_WORT.test(auftragText)) auftragText = `${String(auftragText).replace(/[\s.!]+$/, "")}${einheit[1]}`;
  const zaehne = String(auftragText).match(ZAHN_IM_TEXT) || [];
  if (zaehne.length && (cfg.voll.test(auftragText) || cfg.extra.test(auftragText))) return auftragText;
  const konflikt = String(w.teilKonflikt || "");
  if (konflikt && zaehne.length === 1) {
    const neu = zaehne[0].replace(/\D/g, "");
    const ersetzt = vorher.replace(new RegExp(`(?<!\\d)${konflikt[0]}\\s?[,.]?\\s?${konflikt[1]}(?!\\d)`, "g"), neu);
    const rest = String(auftragText).replace(ZAHN_IM_TEXT, "").replace(/\b(den|der|die|zahn|meine ich|ich meine|natürlich|sorry|nein)\b/gi, "").replace(/[\s.,]+/g, " ").trim();
    return rest ? `${ersetzt}. ${neu} ${rest}` : ersetzt;
  }
  return `${vorher}. ${auftragText}`;
}

async function sprachPlanZweig(clientId, sprachPlan, b, patient, auftragText) {
  const cfg = SPRACH_PLAENE[sprachPlan];
  const w = wahlLesen(clientId, patient);
  const text = sprachFolgeText(w, auftragText, sprachPlan);
  const pb = await Promise.race([pvsBefund(clientId, patient).catch(() => null), new Promise((r) => setTimeout(r, 12000, null))]);
  const pvsNr = pb?.ok ? String(pb.nummer || "") : String(w.pvsNummer || "");
  if (pvsNr && w.pvsNummer !== pvsNr) wahlMerken(clientId, patient, { pvsNummer: pvsNr });
  if (pvsNr) vorgangMelden(clientId, pvsNr, { modul: cfg.modul, phase: "befund", auftrag: text });
  const praxis = await praxisLaden(clientId).catch(() => ({ einstellungen: {} }));
  const x = sprachPlanRechnen(clientId, {
    sprachPlan, patient, auftragText: text, befundZaehne: pb?.ok ? { ...pb.befund, ...pb.offen } : {}, praxis: { einstellungen: praxis?.einstellungen || {} },
    namenGesagt: [String(b.name || "").trim()], pvsNr, befundQuelle: pb?.ok ? { art: "pvs", pvs: pb.pvs, datum: pb.datum } : null,
  });
  return pvsNr ? { ...x, card: befundKarte(clientId, pvsNr, patient) } : x;
}

async function sprachPlanAnlegen(clientId, d) {
  const trocken = trockenAngelegt(clientId, d.patient, "Der Plan");
  if (trocken) return trocken;
  const cfg = SPRACH_PLAENE[d.sprachPlan];
  const { patient, auftragText, r, summen } = d;
  const e = await entwurfAblegen(clientId, {
    modul: cfg.modul,
    patient: { id: patient.id, label: patient.anredeLabel || "", name: patient.lastName || "", vorname: patient.firstName || "", geburtsdatum: patient.birthDate || "" },
    anzeige: d.anzeige || [patient.firstName, patient.lastName].filter(Boolean).join(" "), betrag: cfg.betrag(summen), planJson: JSON.stringify(r.ablagePlan),
    auftragText, befundQuelle: d.befundQuelle || null, hinweise: d.hinweise || r.hinweise, engineStand: cfg.stand(),
    fallId: d.fallId || "", fallTitel: d.fallTitel || "",
  });
  log.info?.(`[hkp] ${cfg.modul}-Entwurf ${e.id} abgelegt (Patient ${patient.id})`);
  vorgangMelden(clientId, d.pvsNr, { modul: cfg.modul, phase: "angelegt", plan: sprachPlanZeilen(cfg, r.plan), meldung: "" });
  befundWahl.delete(wahlSchluessel(clientId, patient));
  return {
    ok: true, entwurfId: e.id,
    ...mitUndo("planr_entwurf", { id: e.id, label: `${cfg.akk} ${cfg.text} für ${patient.anredeLabel}` }),
    message: `${grossAnfang(cfg.art)} ${cfg.text} für ${patient.anredeLabel} ist angelegt. ${cfg.art === "die" ? "Sie" : "Er"} steht in PlanR im Planer ${cfg.planer} als Entwurf; `
      + `${cfg.nachsatz}. Vorläufig ${cfg.summenSatz(summen)}.`,
  };
}

// ---------------------------------------------------------------------------
// Fachgespraech Zahnersatz (Chef 05.11.2026: "freies LLM-Gespraech mit Knowledgebase, kein starres Regex mehr").
// Kein Ablauf aus festen Rueckfragen: in jedem Zug entscheidet das Abrechnungsmodell (fachEntscheiden), was passiert
// und was es sagt; hier wird nur ausgefuehrt und geprueft. Nach DS-Win geht ein Befund nur, nachdem das Modell die
// geaenderten Zaehne vorgelesen und gefragt hat. Rechnen und das Vorlesen der Summen bleiben bei der Engine.
// Notaus MAS_HKP_FACH=0: der bisherige Ablauf.
// ---------------------------------------------------------------------------
const fachAn = () => process.env.MAS_HKP_FACH !== "0";
const FACH_RUNDEN = 3;
const FACH_STILL = "Das habe ich gerade nicht verarbeiten können. Sagen Sie es mir bitte noch einmal?";
const zahnKiefer = (z) => (/^[12]/.test(z) ? "OK" : "UK");
const sortiertJson = (o) => JSON.stringify(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)));
const nurIn = (befund, kiefer) => Object.fromEntries(Object.entries(befund).filter(([z]) => kiefer.includes(zahnKiefer(z))));
const nenntAlle = (text, zaehne) => zaehne.every((z) => new RegExp(`(^|\\D)${z}(\\D|$)`).test(text));

async function fachPvsLaden(clientId, patient, w) {
  const pb = await Promise.race([ohneAltenVorschlag(w)(clientId, patient).catch(() => null), new Promise((r) => setTimeout(r, 10000, null))]);
  if (pb?.ok) return { ok: true, name: pb.pvs, datum: pb.datum ? datumDe(pb.datum) : "", nummer: pb.nummer, befund: pb.befund || {}, offen: pb.offen || {} };
  return { ok: false, name: pb?.pvs || "", meldung: pb?.meldung || "", befund: {}, offen: {} };
}

/** Plan rechnen wie im festen Ablauf. -> { vorschau, doppelt } | { fertig } | { rueck: Rueckmeldung fuer das Modell } */
async function fachRechnen(clientId, patient, b, st, p, { privat, sagen, nurVorschau = false }) {
  const auftrag = E.auftragVerstehen(st.plan);
  const befundMap = p.ok ? { ...p.befund, ...st.offen } : kieferBefund(st.offen, auftragsKiefer(auftrag));
  const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [], einstellungen: {} }));
  const system = implantatStandard(praxis);
  const patientDaten = { name: patient.lastName, vorname: patient.firstName, geburtsdatum: patient.birthDate };
  const akte = akteVon(patient);
  const gesagt = protheseGesagt(st.plan);
  const alsPrivat = gesagt ? gesagt === "privat" : akte.versicherung ? akte.versicherung === "privat" : privat;
  const bonus = auftrag.bonus || bonusNorm(b.bonus) || akte.bonus;
  if (!alsPrivat && !bonus) {
    return { rueck: "Welcher Bonus steht in der Akte: ohne Bonus, fünf Jahre oder zehn Jahre?", frage: "Welcher Bonus steht in der Akte: ohne Bonus, fünf Jahre oder zehn Jahre?" };
  }
  const ausAkte = !gesagt && akte.versicherung && alsPrivat !== privat
    ? (alsPrivat ? "Laut Akte privat versichert. " : "Laut Akte gesetzlich versichert. ")
    : "";
  const r = alsPrivat
    ? P.privatZeEntwurf(st.plan, befundMap, { patient: patientDaten, implantatSystem: system })
    : E.hkpEntwurf(st.plan, befundMap, {
      patient: patientDaten, einstellungen: praxis.einstellungen, implantatSystem: system, bonus, haertefall: bonus === "100", lueckenFragen: nurVorschau,
    }, praxisListen(praxis));
  if (r.status !== "ok") {
    const frage = r.grund === "restzaehne" && r.zaehne?.length ? restFrage(r.zaehne) : r.frage || "";
    return { rueck: `Die Engine kann "${st.plan}" mit diesem Befund nicht rechnen: ${frage || r.grund}`, frage, grund: r.grund, zaehne: r.zaehne, vorschlag: r.vorschlag };
  }
  const frage = alsPrivat ? null : ausfuehrungRueckfrage(clientId, patient, st.plan, auftrag, r, system);
  if (frage) return { rueck: `Vor dem Rechnen fehlt die Ausführung (einmal fragen, sonst gilt der Praxis-Standard): ${frage.message}`, frage: frage.message };
  const jetzt = new Date().toISOString();
  const name = p.name || "";
  const befund = {
    ok: true, befund: befundMap, quelleWahl: p.ok ? "pvs" : "neu", hinweise: name ? fremdeKuerzel(befundMap, name) : [],
    ...(p.ok ? { pvs: { name, nummer: p.nummer } } : {}),
    quelle: st.uebertragen ? { art: "gesprochen+pvs", pvs: name, datum: jetzt, uebertragen: st.uebertragen }
      : Object.keys(st.offen).length || !p.ok ? { art: p.ok ? "gesprochen+pvs" : "gesprochen", pvs: name, datum: jetzt }
        : { art: "pvs", pvs: name, datum: p.datum },
  };
  if (!alsPrivat) liveMelden(clientId, { phase: "plan", plan: r.plan, meldung: "" });
  if (p.nummer) vorgangMelden(clientId, p.nummer, { modul: alsPrivat ? "privat-kv" : "hkp", phase: "planung", plan: planZeilen(r.plan), meldung: "" });
  const z = r.zusammenfassung;
  const summen = alsPrivat ? { gesamt: zahl(z.gesamt), honorar: zahl(z.honorar), labor: zahl(z.labor), material: zahl(z.material) } : summenAus(r.ergebnis);
  const versorgungText = alsPrivat ? PRIVAT_TEXT : versorgungTextVon(auftrag);
  const alteWeg = wahr(b.alte_verwerfen);
  const doppelt = alsPrivat ? [] : doppelungen(await hkpsVonPatient(clientId, patient), auftrag.kiefer);
  const daten = { patient, auftrag, auftragText: st.plan, befund, befundDiktat: "", r, summen, versorgungText, zusaetzlich: wahr(b.zusaetzlich) || alteWeg, doppelt, alteVerwerfen: alteWeg, privat: alsPrivat };
  const vorweg = `${ausAkte}${sagen && !sagen.includes("?") ? `${sagen} ` : ""}`;
  if (vorlesenAus() && !nurVorschau) {
    const e = await (privat ? privatAnlegen : entwurfAnlegen)(clientId, daten);
    return { fertig: e.message ? { ...e, message: `${vorweg}${e.message}` } : e };
  }
  vorschauMerken(clientId, { ...daten, namenGesagt: [String(b.name || "").trim()], at: Date.now() });
  const vorschau = vorleseSatz({
    patient, versorgungText, kiefer: geplanteKiefer(auftrag, z), zaehne: r.plan.zaehne, versorgung: versorgungSatz(z),
    ausfuehrung: alsPrivat ? "" : ausfuehrungText(r.plan), summen: alsPrivat ? privatSummenSatz(summen) : summenSatz(summen),
    spanne: alsPrivat ? "" : spanneVon(r.plan, praxis),
    doppelt: doppelt.length ? doppelungHinweis(doppelt, alteWeg) : "", befundFreigegeben: !!st.uebertragen,
    hinweis: ausschlussHinweise(r, patient).join(" "),
  });
  return { vorschau: `${vorweg}${vorschau}`, doppelt };
}

/** Ein Zug im Fachgespraech. -> Antwort fuer Clara ({ message, rueckfrage, stimme, card }) */
async function fachZug(clientId, patient, b, { privat }) {
  // Clara wartet 30 s auf das Werkzeug: PVS-Lesen, Modellrunden und Rechnen teilen sich eine Frist
  const frist = Date.now() + Number(process.env.MAS_HKP_FACH_FRIST_MS || 26000);
  const w = wahlLesen(clientId, patient);
  const st = { verlauf: [], offen: {}, plan: "", rueck: "", vorgelegt: "", uebertragen: "", ...(w.fach || {}) };
  const satz = String(b.chef_satz || b.auftrag || "").trim();
  let p = st.p;
  if (!p) {
    p = await fachPvsLaden(clientId, patient, w);
    st.offen = { ...p.offen };
  }
  const pvsNr = p.nummer || (p.name ? pvsKennung(patient).patient || "" : "");
  if (!w.fach && pvsNr) vorgangMelden(clientId, pvsNr, { modul: privat ? "privat-kv" : "hkp", phase: "befund", auftrag: satz, ...(p.ok ? {} : ohnePvs(patient, p.name)) });
  const card = pvsNr ? befundKarte(clientId, pvsNr, patient) : null;
  const praxisKat = await praxisKatalog(clientId).catch(() => null);
  const kuerzel = Object.keys(E.BEFUND_KUERZEL || {});
  const wer = await getAssistantName(clientId).catch(() => DEFAULT_ASSISTANT_NAME);

  let rueck = st.rueck || "";
  let sagen = "";
  let ergebnis = null;
  let engineFrage = "";
  let fehlerOffen = false;
  for (let runde = 0; runde < FACH_RUNDEN && !ergebnis; runde++) {
    const rest = frist - Date.now() - 1500;
    if (rest < 4000) break;
    const d = await fachEntscheiden({
      satz, rueck, praxis: praxisKat, kuerzel, verlauf: st.verlauf, timeoutMs: Math.min(rest, Number(process.env.MAS_HKP_FACH_MS || 20000)),
      stand: {
        patient: patient.anredeLabel || patient.label, privat, pvs: p.name, datum: p.datum, meldung: p.meldung,
        pvsBefund: p.befund, offen: st.offen, uebertragen: st.uebertragen, plan: st.plan,
      },
    });
    if (!d) break;
    const geschuetzt = nackteNichtEntfernen(d, { ...p.befund, ...st.offen }, satz);
    d.befund = geschuetzt.befund;
    d.plan = geschuetzt.plan;
    d.sagen = geschuetzt.sagen;
    if (geschuetzt.rechnen) d.rechnen = true;
    if (d.rechnen && !String(d.plan || "").trim() && !st.plan) {
      const a = E.auftragVerstehen(satz);
      const teile = a.teile?.length ? a.teile : [a];
      if (teile.every((t) => t.versorgung)) d.plan = satz;
    }
    log.info?.(`[hkp] fach ${runde + 1}: ${JSON.stringify({ befund: d.befund, plan: d.plan, rechnen: d.rechnen, uebertragen: d.uebertragen, abbrechen: d.abbrechen })} | ${d.sagen}`);
    sagen = d.sagen;
    rueck = "";
    if (d.abbrechen) {
      befundWahl.delete(wahlSchluessel(clientId, patient));
      vorschauOffen.set(clientId, vorschauen(clientId).filter((v) => v.patient?.id !== patient.id));
      return { ok: true, abgebrochen: true, stimme: "modell", message: sagen || `Gut, für ${patient.anredeLabel} lege ich nichts an.` };
    }
    const fehler = [];
    const erledigt = [];
    const aenderung = Object.fromEntries(Object.entries(d.befund).filter(([z, c]) => String(st.offen[z] ?? p.befund[z] ?? "") !== c));
    if (Object.keys(aenderung).length) {
      for (const [z, c] of Object.entries(aenderung)) {
        if (p.ok && String(p.befund[z] ?? "") === c) delete st.offen[z];
        else st.offen[z] = c;
      }
      st.vorgelegt = "";
      vorschauOffen.set(clientId, vorschauen(clientId).filter((v) => v.patient?.id !== patient.id));
      if (p.ok && pvsNr) befundAendernPvs(clientId, pvsNr, aenderung, `${wer}${HKP_VORSCHLAG}`).catch(() => null);
      liveMelden(clientId, { phase: "befund", befund: { ...p.befund, ...st.offen }, plan: null, meldung: "" });
    }
    if (d.plan && d.plan !== st.plan) {
      const a = E.auftragVerstehen(d.plan);
      if ((a.teile?.length ? a.teile : [a]).every((t) => t.versorgung)) {
        st.plan = d.plan;
        vorschauOffen.set(clientId, vorschauen(clientId).filter((v) => v.patient?.id !== patient.id));
      } else fehler.push(`Den Plansatz "${d.plan}" versteht die Engine nicht; nimm eine der Formen aus der Anleitung.`);
    }
    if (d.uebertragen) {
      const zs = Object.keys(st.offen);
      if (!zs.length) erledigt.push("Es gibt keine geänderten Zähne zum Übertragen.");
      else if (!p.ok) fehler.push(`Übertragen geht nicht: ${p.meldung || "kein Praxisprogramm angebunden"}. Sag ihm das.`);
      else if (st.vorgelegt !== sortiertJson(st.offen)) fehler.push(`Nicht übertragen: Lies ihm zuerst die geänderten Zähne vor (${befundListe(st.offen)}) und frag, ob sie nach ${p.name} sollen.`);
      else {
        const kiefer = ["OK", "UK"].filter((k) => zs.some((z) => zahnKiefer(z) === k));
        const ziel = await befundInsPvs(clientId, patient, { kiefer, zaehne: nurIn({ ...p.befund, ...st.offen }, kiefer), nummer: p.nummer });
        log.info?.(`[hkp] fach: Befund ${ziel.ok ? `nach ${ziel.pvs || p.name} uebertragen (${zs.join(", ")})` : `nicht uebertragen: ${ziel.meldung}`}, Patient ${patient.id}`);
        if (ziel.ok) {
          p = { ...p, befund: { ...p.befund, ...st.offen } };
          st.uebertragen = ziel.pvs || p.name;
          st.offen = {};
          st.vorgelegt = "";
          erledigt.push(`Der Befund steht jetzt in ${st.uebertragen}.`);
        } else fehler.push(`Übertragen hat nicht geklappt: ${ziel.meldung}`);
      }
    }
    if (d.rechnen && !fehler.length) {
      if (!st.plan) fehler.push("Rechnen geht noch nicht: es gibt keinen Plan.");
      else {
        const r = await fachRechnen(clientId, patient, b, st, p, { privat, sagen });
        if (r.rueck) { fehler.push(r.rueck); engineFrage = r.frage || engineFrage; }
        else ergebnis = r;
      }
    }
    if (ergebnis) break;
    rueck = [...erledigt, ...fehler].join(" ");
    // Erledigtes kann das Modell im naechsten Zug erwaehnen; nur ein Fehler braucht sofort eine neue Entscheidung
    fehlerOffen = fehler.length > 0;
    if (!fehlerOffen) break;
  }
  // Konnte das Modell auf einen Fehler nicht mehr antworten, spricht die Rueckfrage der Engine (nie ein Satz,
  // der von einem Schritt ausgeht, der gar nicht geklappt hat)
  if (fehlerOffen) sagen = engineFrage;

  if (ergebnis?.fertig) {
    befundWahl.delete(wahlSchluessel(clientId, patient));
    return { ...ergebnis.fertig, stimme: "daten", ...(card ? { card } : {}) };
  }
  const antwort = ergebnis?.vorschau
    ? { ok: true, rueckfrage: "vorlesen", message: ergebnis.vorschau, stimme: "daten", ...(ergebnis.doppelt?.length ? { doppelung: ergebnis.doppelt.map((h) => h.id) } : {}) }
    : { ok: true, rueckfrage: "gespraech", message: sagen || FACH_STILL, stimme: sagen && !fehlerOffen ? "modell" : "daten" };
  st.p = p;
  st.rueck = ergebnis ? "" : rueck;
  const zs = Object.keys(st.offen);
  if (zs.length && antwort.message.includes("?") && nenntAlle(antwort.message, zs)) st.vorgelegt = sortiertJson(st.offen);
  st.verlauf = [...st.verlauf, { wer: "Zahnarzt", text: satz }, { wer: "Du", text: antwort.message }].slice(-14);
  wahlMerken(clientId, patient, { fach: st, frage: antwort.rueckfrage, frageZaehne: [], frageText: antwort.message.slice(0, 800), planAuftrag: st.plan });
  liveMelden(clientId, { meldung: antwort.message });
  return card ? { ...antwort, card } : antwort;
}

/**
 * Befund und Planung: jede Antwort spricht das Abrechnungsmodell mit Wissensbasis in eigenen Worten (Chef 05.11.2026:
 * "freies LLM-Gespraech"). Die Engine hat vorher entschieden und geschrieben; message.fakten bleibt ihr Wortlaut.
 * Ohne Modell, bei Zeitablauf oder verlorenen Zahlen gilt der Text der Engine.
 */
function mundVorschalten(res, clientId, satzVon, einordnungVon) {
  const senden = res.json.bind(res);
  res.json = (x) => {
    if (!x || typeof x !== "object" || !x.message || x.stimme || res.statusCode >= 400) return senden(x);
    const { _fakten, ...raus } = x;
    const fakten = String(_fakten || x.message);
    (async () => {
      const praxis = await praxisKatalog(clientId).catch(() => null);
      const m = await mundSprechen({ satz: satzVon(), fakten, einordnung: einordnungVon(), praxis });
      if (m) log.info?.(`[hkp] mund: ${m}`);
      return m ? { ...raus, message: m, fakten, stimme: "modell" } : { ...raus, fakten, stimme: "daten" };
    })().catch(() => ({ ...raus, fakten, stimme: "daten" })).then(senden);
    return res;
  };
}

router.post("/tools/hkp-create-draft", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    mundVorschalten(res, clientId, () => String(b.chef_satz || b.auftrag || ""), () => String(b._sagen || ""));
    let auftragText = String(b.auftrag || "").trim();
    let privat = wahr(b.privat) || privatGesagt(auftragText);
    let sp = sprachPlanAus(b, auftragText);
    if (sp) privat = false;
    if (privat && privatAus()) return res.json({ ok: true, message: PRIVAT_AUS_SATZ });
    if (sp && SPRACH_PLAENE[sp].aus()) return res.json({ ok: true, message: SPRACH_PLAENE[sp].ausSatz });
    const ziel = zielpreisAn() && !privat && !sp ? zielpreisAus(b.zielpreis) : null;
    const gleicheSitzung = (v) => !String(b.sitzung || "").trim() || process.env.MAS_HKP_SITZUNG === "0"
      || wahlLesen(clientId, v.patient).sitzung === String(b.sitzung).trim();
    // Ja auf die eigene Vorschau, auch wenn Clara bestaetigt nicht setzt oder den Auftrag umschreibt (Demo 04.11.2026)
    const offeneVs = String(b.chef_satz || "").trim() && !ziel ? vorschauFinden(vorschauen(clientId), { name: b.name }) : null;
    const vsArt = offeneVs && gleicheSitzung(offeneVs) ? await vorschauAntwort(wahlLesen(clientId, offeneVs.patient), String(b.chef_satz).trim()) : "";
    const offenBejaht = vsArt === "zustimmung";
    if (offenBejaht) b.bestaetigt = true;
    // Kein klares Ja zur Vorschau: nichts anlegen; eine Angabe ergaenzt den Auftrag (antwortAufFrage)
    if (vsArt && vsArt !== "zustimmung") b.bestaetigt = false;
    let vs = wahr(b.bestaetigt) || ziel ? vorschauFinden(vorschauen(clientId), b) : null;
    if (vs && !gleicheSitzung(vs)) vs = null;
    if (!vs && offenBejaht) vs = offeneVs;
    if (vs?.sprachPlan) {
      vorschauWeg(clientId, vs);
      vetterWahl.delete(clientId);
      return res.json(await sprachPlanAnlegen(clientId, vs));
    }
    if (vs?.privat) {
      vorschauWeg(clientId, vs);
      vetterWahl.delete(clientId);
      return res.json(await privatAnlegen(clientId, { ...vs, vorgelesen: true }));
    }
    if (vs) {
      vorschauWeg(clientId, vs);
      vetterWahl.delete(clientId);
      const praxis = ziel ? await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [], einstellungen: {} })) : null;
      return res.json(await entwurfAnlegen(clientId, {
        ...(ziel ? aufZielpreis(vs, ziel, praxis) : vs), vorgelesen: true, zusaetzlich: true, alteVerwerfen: vs.alteVerwerfen || wahr(b.alte_verwerfen),
      }));
    }
    const p = await patientAufloesen(clientId, b, `Für welchen Patienten soll ich ${privat ? "den Privatplan" : sp ? `${SPRACH_PLAENE[sp].akk} ${SPRACH_PLAENE[sp].text}` : "den HKP"} erstellen?`, { vettern: true });
    if (p.antwort) return res.json(p.antwort);
    const patient = p.patient;
    await sitzungPruefen(clientId, patient, b);
    // Zahnersatz laeuft als Fachgespraech: das Modell versteht den Satz selbst, keine Zuordnung zur letzten Frage
    const fachLauf = wahlLesen(clientId, patient);
    const fachModus = fachAn() && !sp && (!!fachLauf.fach || !SPRACH_PLAENE[fachLauf.planart]);
    if (!fachModus) auftragText = await antwortAufFrage(clientId, patient, b, auftragText);
    // Die Planart steht oft erst in der Antwort auf die Befundfrage („privater Kons“, „UKPS“).
    privat = wahr(b.privat) || privatGesagt(auftragText);
    sp = sprachPlanAus(b, auftragText);
    if (b._neu === "abbruch") {
      return res.json({ ok: true, abgebrochen: true, message: `Gut, den angefangenen Plan für ${patient.anredeLabel} lasse ich fallen – angelegt ist nichts.` });
    }
    if (b._befundNein) {
      // "Nein, der Befund stimmt nicht." - denselben Befund noch einmal vorzulesen hilft nicht (live 04.11.2026)
      const message = "Was stimmt am Befund nicht? Sagen Sie mir bitte die Zähne, die anders sind – zum Beispiel: 13 und 23 stehen, alle anderen fehlen.";
      wahlMerken(clientId, patient, { frage: "befund_korrektur", frageZaehne: [], frageText: message });
      return res.json({ ok: true, rueckfrage: "befund_korrektur", message });
    }
    if (b._befundUnklar) {
      // Die offene Befundfrage bleibt gemerkt: die Wiederholung versteht das Modell wieder als Antwort darauf.
      return res.json({
        ok: true, rueckfrage: wahlLesen(clientId, patient).frage || "befund_fehlt",
        message: "Den Befund habe ich gerade nicht sicher verstanden. Können Sie ihn mir bitte noch einmal sagen?",
      });
    }
    if (b._gegenfrage) {
      const offen = wahlLesen(clientId, patient);
      const message = b._sagen || "Was möchten Sie dazu wissen?";
      wahlMerken(clientId, patient, { frage: offen.frage || "versorgung", frageZaehne: offen.frageZaehne || [], frageText: message });
      return res.json({ ok: true, rueckfrage: offen.frage || "versorgung", message });
    }
    if (b._befundNeu) {
      // Ganz neuer Befund: der vorgelesene gilt nicht mehr, nicht genannte Zaehne nimmt die Aufnahme als vorhanden
      const message = neuFrage(auftragsKiefer(E.auftragVerstehen(auftragText || "")), wahlLesen(clientId, patient).pvsName, "Gut. ");
      wahlMerken(clientId, patient, {
        quelle: "neu", neuGefragt: false, gesagt: {}, genannt: {}, text: "", frage: "befund_fehlt", frageZaehne: [], frageText: message,
      });
      return res.json({ ok: true, rueckfrage: "befund_fehlt", message });
    }
    // Folgezuege (Befundquelle, Ausfuehrung, Flaechen, Kanaele) kommen oft ohne privat=true bzw. planart: der laufende
    // Privatplan, die laufende MKV oder Kons gilt weiter, bis der Chef ausdruecklich eine andere Planart nennt.
    const lauf = wahlLesen(clientId, patient);
    const laufPlan = SPRACH_PLAENE[lauf.planart] ? lauf.planart : null;
    const nurFuellungswort = sp === "mkv" && !MKV_WORT.test(auftragText) && String(b.planart || "").trim().toLowerCase() !== "mkv";
    const zeLaeuft = lauf.privat || (!laufPlan && !!(lauf.quelle || lauf.text))
      || vorschauen(clientId).some((v) => v.patient?.id === patient.id && !v.sprachPlan);
    if (nurFuellungswort && zeLaeuft) sp = null;
    const laufWeiter = laufPlan === "impl" ? !PROTHETIK_WORT.test(auftragText) && !MKV_WORT.test(auftragText) && !konsGesagt(auftragText)
      : laufPlan === "kons" ? !ZE_WORT.test(auftragText) && !MKV_WORT.test(auftragText)
      : laufPlan === "mkv" ? !privat && !kasseGesagt(auftragText) && !privatGesagt(auftragText) && !ZE_WORT.test(auftragText) : false;
    if (!sp && laufWeiter) sp = laufPlan;
    if (sp) privat = false;
    if (!privat && !sp && !kasseGesagt(auftragText) && lauf.privat) privat = true;
    if (privat && privatAus()) return res.json({ ok: true, message: PRIVAT_AUS_SATZ });
    if (sp && SPRACH_PLAENE[sp].aus()) return res.json({ ok: true, message: SPRACH_PLAENE[sp].ausSatz });
    if (privat || lauf.privat) wahlMerken(clientId, patient, { privat });
    if (sp || laufPlan) wahlMerken(clientId, patient, { planart: sp || "", ...(sp !== laufPlan ? { teilAuftrag: "", teilKonflikt: "" } : {}) });
    const modul = privat ? "privat-kv" : sp ? SPRACH_PLAENE[sp].modul : "hkp";
    const gewaehlt = p.gewaehlt || vetterSchonGewaehlt(vetterWahl.get(clientId), p.sel || patient);
    const vettern = vetternAus() || gewaehlt ? [] : await namensvettern(clientId, patient).catch(() => []);
    if (vettern.length) {
      const kandidaten = [p.sel || patient, ...vettern];
      vetternOffen.set(clientId, { kandidaten, at: Date.now() });
      await setPatientCandidates(clientId, kandidaten, null);
      log.warn?.(`[hkp] Namensvetter zu ${patient.id}: ${vettern.map((v) => v.id).join(", ")} - Rueckfrage`);
      return res.json({ ok: true, rueckfrage: "namensvetter", message: vetternFrage(kandidaten) });
    }
    liveMelden(clientId, { patient: livePatient(patient), auftragText, meldung: "" });
    if (fachModus && !sp) return res.json(await fachZug(clientId, patient, b, { privat }));
    let vorab = "";
    let flipKarte = null;
    const raus = (x) => {
      const sagen = String(b._sagen || "").trim();
      const gate = x?.rueckfrage || "";
      const passt = (sagen.includes("?") && (
        (gate === "befund_quelle" && /befund|praxis|kartei|diktier|aufnehmen|ds-win/i.test(sagen))
        || (gate === "restzaehne" && /zahn|entfern|stehen|bleib|teleskop/i.test(sagen))
        || (gate === "befund_fehlt" && /zahn|befund|fehl|vorhanden/i.test(sagen))
      ));
      const modellFragt = sagen.includes("?") && ["befund_quelle", "befund_freigabe", "befund_korrektur", "restzaehne", "befund_fehlt"].includes(gate);
      if (sagen && !/steht jetzt|ist angelegt/.test(String(x?.message || "")) && (gate === "befund_anzeige" || gate === "versorgung" || gate === "kiefer_fehlt" || passt || modellFragt)) {
      if (x?.message) x = { ...x, _fakten: x.message };
        x = { ...x, message: sagen };
      } else if (sagen && !sagen.includes("?") && ["befund_quelle", "restzaehne", "befund_fehlt", "versorgung", "befund_freigabe"].includes(gate) && x?.message) {
        x = { ...x, message: `${sagen} ${x.message}` };
      }
      wahlMerken(clientId, patient, { frage: x?.rueckfrage || "", frageZaehne: x?.zaehne || [], frageText: String(x?.message || "").slice(0, 800) });
      if (vorab && x?.message) x = { ...x, message: `${vorab}${x.message}` };
      if (flipKarte && !x?.card) x = { ...x, card: flipKarte };
      liveMelden(clientId, { meldung: String(x?.message || "") });
      return res.json(x);
    };
    // Befund zuerst (live 15.10.2026: "Welche Versorgung ...?" kam ohne Zahnschema, PlanR ohne Eintrag): steht der
    // Patient, zeigen schon die Rueckfragen den Befund aus dem Praxisprogramm. Ein langsames Praxisprogramm haelt sie nicht auf.
    const befundVorab = async (altenVorschlagWeg) => {
      let nr = wahlLesen(clientId, patient).pvsNummer || "";
      let ohne = null;
      const lesen = altenVorschlagWeg ? ohneAltenVorschlag(wahlLesen(clientId, patient)) : pvsBefund;
      if (!nr || altenVorschlagWeg) {
        const pb = await Promise.race([lesen(clientId, patient).catch(() => null), new Promise((r) => setTimeout(r, 12000, null))]);
        nr = pb?.ok ? String(pb.nummer || nr) : nr;
        if (nr) wahlMerken(clientId, patient, { pvsNummer: nr });
        else if (pb?.pvs) [nr, ohne] = [pvsKennung(patient).patient || "", ohnePvs(patient, pb.pvs)];
      }
      if (!nr) return;
      vorgangMelden(clientId, nr, { modul, phase: "befund", auftrag: auftragText, ...ohne });
      flipKarte = befundKarte(clientId, nr, patient);
    };
    const handyAenderung = async () => {
      const nr = wahlLesen(clientId, patient).pvsNummer || "";
      const zaehne = E.befundVerstehen(b._handyAenderung);
      if (nr && Object.keys(zaehne).length) {
        const wer = await getAssistantName(clientId).catch(() => DEFAULT_ASSISTANT_NAME);
        await befundAendernPvs(clientId, nr, zaehne, wer).catch(() => null);
      }
      wahlMerken(clientId, patient, { befundZaehneGefragt: !Object.keys(zaehne).length });
      return raus({
        ok: true, rueckfrage: "befund_anzeige",
        message: Object.keys(zaehne).length
          ? `Auf dem Handy steht jetzt: ${zahnBefundSatz(zaehne)}. Stimmt der Befund so?`
          : `Welche Zähne soll ich bei ${patient.anredeLabel} auf dem Handy ändern?`,
      });
    };
    // Jede Planart (HKP, Privat, Kons, MKV, Implantologie, KB): erst die 01 aufs Handy, dann die Frage
    // nach Änderungen, und erst danach der Plan. Einmal je Gespräch.
    const gezeigt = wahlLesen(clientId, patient);
    if (!gezeigt.befundGezeigt) {
      await befundVorab(true);
      wahlMerken(clientId, patient, { befundGezeigt: true, befundZaehneGefragt: false, planAuftrag: auftragText });
      return raus({
        ok: true, rueckfrage: "befund_anzeige",
        message: `Der Befund von ${patient.anredeLabel} steht auf dem Handy. Stimmt er so?`,
      });
    }
    if (b._handyAenderung) return handyAenderung();
    if (b._handyFragen) {
      wahlMerken(clientId, patient, { befundZaehneGefragt: true });
      return raus({
        ok: true, rueckfrage: "befund_anzeige",
        message: `Welche Zähne soll ich bei ${patient.anredeLabel} auf dem Handy ändern?`,
      });
    }
    if (!auftragText && b.chef_satz && gezeigt.planAuftrag) auftragText = gezeigt.planAuftrag;
    // Live 05.11.2026: „All-on-6 …“ war der Plan, die naechste Antwort nur „diesen Befund aus DS-Win“.
    // Clara schickt diesen Satz als neuen Auftrag. Die Maschine sah keine Versorgung, fragte danach,
    // und vergass die schon gewaehlte Quelle. Befund und Versorgung im Wechsel, ohne dass geplant wurde.
    const teileVon = (text) => {
      const a = E.auftragVerstehen(String(text || ""));
      return a.teile?.length ? a.teile : [a];
    };
    const versorgungDa = (text) => teileVon(text).some((t) => t.versorgung);
    const artVon = (text) => {
      const teile = teileVon(text);
      return {
        art: teile.map((t) => `${t.versorgung || ""}:${t.allon || ""}`).join("|"),
        kiefer: [...new Set(teile.map((t) => t.kiefer).filter(Boolean))].sort().join("|"),
      };
    };
    // Zahngetragene Versorgung behaelt die genannten Zaehne. All-on, Total, Locator und Steg nicht.
    const zaehneHalten = (alt, neu) => {
      const teile = teileVon(neu);
      if (teile.some((t) => ["allon", "totalprothese", "locator", "steg"].includes(t.versorgung))) return neu;
      const neuText = String(neu).replace(/\b([1-4])\s*[,.]\s*([1-8])\b/g, "$1$2");
      if (/\b[1-4][1-8]\b/.test(neuText)) return neu;
      const altText = String(alt || "").replace(/\b([1-4])\s*[,.]\s*([1-8])\b/g, "$1$2");
      const zs = [...new Set([...altText.matchAll(/\b[1-4][1-8]\b/g)].map((m) => m[0]))];
      return zs.length ? `${neu}, Zähne ${zs.join(", ")}` : neu;
    };
    const planAnders = (alt, neu) => {
      const a = artVon(alt);
      const n = artVon(neu);
      if (!n.art.replace(/[|:]/g, "")) return false;
      return a.art !== n.art || (!!n.kiefer && a.kiefer !== n.kiefer);
    };
    // Das Modell liest jede Planung gegen die Wissensbasis. Die Engine bekommt den Satz
    // nur, wenn die Art sich aendert. Stimmt die Art, bleiben Zaehne und Material im Original.
    if (b._planSatz && versorgungDa(b._planSatz)) auftragText = zaehneHalten(auftragText, b._planSatz);
    else if (!sp && !b._intentGefragt && process.env.MAS_HKP_INTENT !== "0") {
      const satz = String(b.chef_satz || "").trim() || String(auftragText || "").trim();
      const nurQuelle = !!(quelleAntwort(satz) || quelleAus(satz)) && !/prothese|br[uü]cke|krone|implantat|teleskop|steg|locator|inlay|festsitz|herausnehm/i.test(satz);
      const kurz = /^(ja|nein|nee|nö|ok|okay|passt|genau|richtig)\b/i.test(satz);
      if (satz && !kurz && !nurQuelle) {
        const intent = await planIntent({ satz, bisher: gezeigt.planAuftrag || "", frage: gezeigt.frageText || "", praxis: await praxisKatalog(clientId).catch(() => null) });
        if (intent && versorgungDa(intent) && planAnders(auftragText, intent)) {
          log.info?.(`[hkp] Intent aus dem Gespraech: ${intent}`);
          auftragText = zaehneHalten(auftragText, intent);
        }
      }
    }
    if (!sp && auftragText && !versorgungDa(auftragText) && versorgungDa(gezeigt.planAuftrag)) {
      if (!String(b.befund_quelle || "").trim()) {
        const q = quelleAntwort(auftragText) || quelleAus(auftragText);
        if (q) b.befund_quelle = q;
      }
      log.info?.(`[hkp] Antwort ohne Versorgung, der gemerkte Plan bleibt`);
      const rest = wahlLesen(clientId, patient).restZusatz || "";
      auftragText = gezeigt.planAuftrag;
      if (rest && !auftragText.includes(rest)) auftragText = `${auftragText}. ${rest}`;
    }
    // Ohne Aufzaehlung (Chef 07.10.2026: "das nervt"). Clara erkennt die Rueckfrage
    // am Kern "Was soll ich fuer ... planen" (Diktat-Fenster, offener Auftrag).
    if (!auftragText) {
      await befundVorab();
      return raus({ ok: true, message: `Gut, ich bin bereit. Was soll ich für ${patient.anredeLabel} planen?` });
    }
    if (sp) return raus(await sprachPlanZweig(clientId, sp, b, patient, auftragText));

    const auftrag = E.auftragVerstehen(auftragText);
    const vergessen = vergessenerKiefer(auftragText, auftrag);
    if (vergessen) {
      log.warn?.(`[hkp] Kiefer-Waechter: ${vergessen} genannt, aber nicht geplant – nichts angelegt`);
      const name = vergessen === "OK" ? "Oberkiefer" : "Unterkiefer";
      return raus({
        ok: true, rueckfrage: "kiefer_fehlt",
        message: `Ich habe noch nichts angelegt: Sie haben auch den ${name} genannt, aber ich habe dafür keine Versorgung verstanden. Was soll ich im ${name} planen?`,
      });
    }
    if (!(auftrag.teile?.length ? auftrag.teile : [auftrag]).every((t) => t.versorgung)) {
      const q = quelleAntwort(b.befund_quelle);
      if (q) wahlMerken(clientId, patient, { quelle: q });
      await befundVorab();
      return raus({
        ok: true, rueckfrage: "versorgung",
        message: `Welche Versorgung soll ich für ${patient.anredeLabel} planen?`,
      });
    }
    if (auftragText !== gezeigt.planAuftrag) wahlMerken(clientId, patient, { planAuftrag: auftragText });
    const alteWeg = wahr(b.alte_verwerfen);
    const zusaetzlich = wahr(b.zusaetzlich) || alteWeg;
    const doppelt = privat ? [] : doppelungen(await hkpsVonPatient(clientId, patient), auftrag.kiefer);
    // Mit Vorlesen steht die Doppelung als Hinweis in der Vorschau – eine Frage weniger.
    if (doppelt.length && !zusaetzlich && vorlesenAus()) {
      return raus({
        ok: true, doppelung: doppelt.map((h) => h.id),
        message: `Für ${patient.anredeLabel} gibt es schon ${doppelt.length === 1 ? "einen" : doppelt.length} ${hkpKurz(doppelt[0])}${doppelt.length > 1 ? " und weitere" : ""}. Soll ich trotzdem einen weiteren HKP anlegen?`,
      });
    }

    // Befund steckt oft im Auftrag selbst ("... die Sechser und Siebener fehlen"); "aus Dampsoft" im
    // Befund-Feld ist die Antwort auf die Quellen-Frage, "ja, stimmt" die Freigabe.
    const wahl = wahlLesen(clientId, patient);
    const befundText = String(b.befund || "").trim();
    const ohneZaehne = befundText && !Object.keys(E.befundVerstehen(befundText, auftrag.kiefer)).length;
    const textQuelle = ohneZaehne ? quelleAus(befundText) : "";
    const gesprochen = ohneZaehne ? "" : befundText;
    const text = wahl.text && gesprochen && wahl.text.includes(gesprochen) ? wahl.text : [wahl.text, gesprochen].filter(Boolean).join(", ");
    const ausAuftrag = E.befundAusAuftrag(auftragText);
    const befund = await befundErmitteln(clientId, patient, {
      gesprochen, ausAuftrag, kiefer: auftrag.kiefer, kieferListe: auftragsKiefer(auftrag),
      quelle: quelleAntwort(b.befund_quelle) || textQuelle || wahl.quelle || "",
      bestaetigt: wahr(b.befund_bestaetigt), lenaErlaubt: await lenaFreigeschaltet(clientId),
      bisher: wahl.gesagt, abgeleitetVorher: wahl.abgeleitet, genanntVorher: wahl.genannt,
      pvsName: wahl.pvsName, neuGefragt: !!wahl.neuGefragt, pvs: ohneAltenVorschlag(wahl),
      pfeiler: (auftrag.teile?.length ? auftrag.teile : [auftrag]).flatMap((t) => t.pfeiler || []).map(String),
      ohneBefundOk: (auftrag.teile?.length ? auftrag.teile : [auftrag]).every((t) => t.versorgung === "totalprothese" || t.versorgung === "allon"),
    });
    const befundDiktat = text || ausAuftrag;
    const stand = { gesagt: befund.gesagt, abgeleitet: befund.abgeleitet, genannt: befund.genannt, text };
    // Vom Befund zum Plan: PlanR fuehrt den Vorgang (Planliste), das Handy zeigt das Zahnschema live
    const gelesenNr = befund.pvs?.nummer || befund.pvsNummer || wahl.pvsNummer || "";
    if (gelesenNr && wahl.pvsNummer !== gelesenNr) wahlMerken(clientId, patient, { pvsNummer: gelesenNr });
    const pvsName = befund.pvs?.name || befund.pvsName || "";
    const ohne = !gelesenNr && pvsName ? ohnePvs(patient, pvsName) : null;
    const pvsNr = gelesenNr || (ohne ? pvsKennung(patient).patient || "" : "");
    if (pvsNr) {
      vorgangMelden(clientId, pvsNr, { modul, phase: "befund", auftrag: auftragText, ...ohne });
      flipKarte = befundKarte(clientId, pvsNr, patient);
    }
    if (!befund.ok) {
      wahlMerken(clientId, patient, {
        quelle: befund.grund === "befund_fehlt" ? "neu" : befund.grund === "befund_alt" ? "lena" : "",
        neuGefragt: befund.grund === "befund_fehlt", pvsName: befund.pvsName, ...stand,
      });
      return raus({ ok: true, rueckfrage: befund.grund, message: befund.frage });
    }
    let befundFrei = false;
    if (befund.neu && !befundSchreibenAus()) {
      const zaehne = JSON.stringify(befund.neu.zaehne);
      const ja = wahr(b.befund_freigegeben) || wahr(b.bestaetigt) || wahr(b.befund_bestaetigt) || (ohneZaehne && JA_WORT.test(befundText));
      const merken = { quelle: befund.quelleWahl, ...stand, pvsName: befund.pvs.name, offen: zaehne };
      if (wahl.frei === zaehne) {
        befundFrei = true;
        if (wahl.uebertragen) befund.quelle = { ...befund.quelle, uebertragen: wahl.uebertragen };
      } else if (!(ja && wahl.offen === zaehne)) {
        if (b._korrektur && wahl.offen === zaehne) {
          // Live 05.11.2026: dieselbe Freigabe-Frage noch einmal vorlesen war eine Schleife
          return raus({
            ok: true, rueckfrage: "befund_korrektur",
            message: "Das hat am vorgelesenen Befund nichts geändert. Welche Zähne sind anders? Zum Beispiel: 13 und 23 stehen, alle anderen im Oberkiefer fehlen.",
          });
        }
        wahlMerken(clientId, patient, merken);
        vorschauOffen.set(clientId, vorschauen(clientId).filter((v) => v.patient?.id !== patient.id));
        liveMelden(clientId, { phase: "befund", befund: befund.befund, plan: null, meldung: "" });
        // Gesagte Aenderungen stehen sofort rosa im Zahnschema (Handy, PlanR) und lassen sich dort auch freigeben
        if (pvsNr && wahl.offen !== zaehne) {
          const wer = await getAssistantName(clientId).catch(() => DEFAULT_ASSISTANT_NAME);
          befundAendernPvs(clientId, pvsNr, befund.neu.zaehne, `${wer}${HKP_VORSCHLAG}`).catch(() => null);
        }
        return raus({ ok: true, rueckfrage: "befund_freigabe", message: befundFreigabeSatz(patient, befund) });
      } else {
        const w = await befundInsPvs(clientId, patient, { kiefer: befund.neu.kiefer, zaehne: befund.neu.zaehne, nummer: befund.pvs.nummer });
        const name = w.pvs || befund.pvs.name;
        log.info?.(`[hkp] Befund ${w.ok ? `nach ${name} uebertragen (${w.geschrieben.length} Zaehne)` : `nicht nach ${name} uebertragen`}, Patient ${patient.id}`);
        if (w.ok) befund.quelle = { ...befund.quelle, uebertragen: name };
        wahlMerken(clientId, patient, { ...merken, pvsName: name, frei: zaehne, uebertragen: w.ok ? name : "" });
        vorab = w.ok
          ? `Der Befund ist in ${name} als geänderter Befund gespeichert, ohne Null-Eins und ohne Abrechnung. `
          : `Achtung: Den Befund konnte ich nicht nach ${name} übertragen – ${w.meldung} Er steht nur im HKP. `;
        befundFrei = true;
      }
    } else if (befund.quelleWahl) {
      wahlMerken(clientId, patient, { quelle: befund.quelleWahl, ...stand });
    }
    liveMelden(clientId, { phase: "befund", befund: befund.befund, plan: null, meldung: "" });

    const praxis = await praxisLaden(clientId).catch(() => ({ preislisten: [], eigen: [], einstellungen: {} }));
    const system = implantatStandard(praxis);
    const patientDaten = { name: patient.lastName, vorname: patient.firstName, geburtsdatum: patient.birthDate };
    const rechnen = () => (privat
      ? P.privatZeEntwurf(auftragText, befund.befund, { patient: patientDaten, implantatSystem: system })
      : E.hkpEntwurf(auftragText, befund.befund, { patient: patientDaten, einstellungen: praxis.einstellungen, implantatSystem: system }, praxisListen(praxis)));
    let r = rechnen();
    if (r.status !== "ok" && r.grund === "restzaehne" && r.zaehne?.length && ALLE_RAUS.test(auftragText)) {
      auftragText = restZusatzMerken(clientId, patient, auftragText, restSatz(r.zaehne, "entfernen"));
      r = rechnen();
    }
    if (r.status !== "ok" && r.grund === "restzaehne" && r.zaehne?.length) {
      return raus({ ok: true, rueckfrage: r.grund, zaehne: r.zaehne, message: restFrage(r.zaehne) });
    }
    if (r.status !== "ok") return raus({ ok: true, rueckfrage: r.grund, zaehne: r.zaehne, message: r.frage });
    if (!privat) liveMelden(clientId, { phase: "plan", plan: r.plan, meldung: "" });
    vorgangMelden(clientId, pvsNr, { modul, phase: "planung", plan: planZeilen(r.plan), meldung: befund.quelle?.uebertragen || !befund.neu ? "" : vorab.trim() });
    const frage = privat ? null : ausfuehrungRueckfrage(clientId, patient, auftragText, auftrag, r, system);
    if (frage) return raus(frage);

    const z = r.zusammenfassung;
    const summen = privat ? { gesamt: zahl(z.gesamt), honorar: zahl(z.honorar), labor: zahl(z.labor), material: zahl(z.material) } : summenAus(r.ergebnis);
    const versorgungText = privat ? PRIVAT_TEXT : versorgungTextVon(auftrag);
    const daten = { patient, auftrag, auftragText, befund, befundDiktat, r, summen, versorgungText, zusaetzlich, doppelt, alteVerwerfen: alteWeg, privat };
    if (vorlesenAus()) {
      vetterWahl.delete(clientId);
      const e = await (privat ? privatAnlegen : entwurfAnlegen)(clientId, daten);
      return res.json(vorab && e.message ? { ...e, message: `${vorab}${e.message}` } : e);
    }
    vorschauMerken(clientId, { ...daten, namenGesagt: [String(b.name || "").trim()], at: Date.now() });
    return raus({
      ok: true, rueckfrage: "vorlesen", ...(doppelt.length ? { doppelung: doppelt.map((h) => h.id) } : {}),
      message: vorleseSatz({
        patient, versorgungText, kiefer: geplanteKiefer(auftrag, z), zaehne: r.plan.zaehne, versorgung: versorgungSatz(z),
        ausfuehrung: privat ? "" : ausfuehrungText(r.plan), summen: privat ? privatSummenSatz(summen) : summenSatz(summen),
        spanne: privat ? "" : spanneVon(r.plan, praxis),
        doppelt: doppelt.length ? doppelungHinweis(doppelt, alteWeg) : "", befundFreigegeben: befundFrei,
      }),
    });
  } catch (e) {
    log.error?.(`[hkp] create-draft: ${e?.stack || e}`);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Befund (01) eines Patienten vorlesen, Zaehne aendern, nach dem Ja ins Praxisprogramm uebernehmen (Chef 15.10.2026).
// Der aktuelle Befund liegt in PlanR und steht dort live auf der Befundseite und im Planer.
router.post("/tools/hkp-befund", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const p = await patientAufloesen(clientId, b, "Von welchem Patienten soll ich den Befund nehmen?");
    mundVorschalten(res, clientId, () => String(b.aenderung || b.chef_satz || b.auftrag || ""), () => "");
    if (p.antwort) return res.json(p.antwort);
    const { nummer, pvsOhne, ...r } = await befundWerkzeugMitNummer(clientId, p.patient, {
      aenderung: String(b.aenderung || "").trim(), uebernehmen: wahr(b.uebernehmen), verwerfen: wahr(b.verwerfen),
      wer: await getAssistantName(clientId).catch(() => DEFAULT_ASSISTANT_NAME),
    });
    log.info?.(`[hkp] befund ${b.verwerfen ? "verwerfen" : b.uebernehmen ? "uebernehmen" : b.aenderung ? "aendern" : "lesen"}: Patient ${p.patient.id}${r.uebertragen === false ? " (nicht uebertragen)" : ""}`);
    // Der Befund steht: Eintrag in der PlanR-Liste (noch nichts geplant) und Zahnschema auf dem Handy –
    // ist das Praxisprogramm nicht lesbar, ein leeres Zahnschema zum Eintragen
    const nr = nummer || (pvsOhne ? pvsKennung(p.patient).patient || "" : "");
    if (nr) vorgangMelden(clientId, nr, { phase: "befund", ...(nummer ? {} : ohnePvs(p.patient, pvsOhne)) });
    const card = nr ? befundKarte(clientId, nr, p.patient) : null;
    if (card && !nummer) r.message = `${r.message} Das Zahnschema zeige ich Ihnen trotzdem, dort können Sie die Zähne eintragen.`;
    return res.json(card ? { ...r, card } : r);
  } catch (e) {
    log.error?.(`[hkp] befund: ${e?.stack || e}`);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Abrechnungsfragen ("Geht die 9040 neben der 9050?") nur aus der Wissensbasis (Chef 05.11.2026: Clara hat
// vorher frei geantwortet). Die Antwort wird woertlich gesprochen.
router.post("/tools/abrechnung-frage", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const frage = String(b.chef_satz || b.frage || "").trim();
    if (!frage) return res.json({ ok: true, message: "Wie lautet Ihre Abrechnungsfrage?" });
    const praxis = await praxisKatalog(clientId).catch(() => null);
    const fachbegriffe = String(b.fachbegriffe || "").trim();
    const a = await abrechnungAntwort({ frage, praxis, fachbegriffe });
    log.info?.(`[hkp] abrechnung-frage (${a.quelle}): ${frage} -> ${a.message}`);
    res.json({ ok: true, message: a.message, quelle: a.quelle, stimme: a.quelle === "modell" ? "modell" : "daten" });
  } catch (e) {
    log.error?.(`[hkp] abrechnung-frage: ${e?.stack || e}`);
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
          message: `${vs.sprachPlan ? grossAnfang(SPRACH_PLAENE[vs.sprachPlan].art) : "Der"} ${vs.versorgungText || "HKP"} für ${vs.patient.anredeLabel} ist noch nicht angelegt. Voraussichtlich ${vs.sprachPlan ? SPRACH_PLAENE[vs.sprachPlan].summenSatz(vs.summen) : vs.privat ? privatSummenSatz(vs.summen) : summenSatz(vs.summen)}. Soll ich den Entwurf so anlegen?`,
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
  const a = E.ausfuehrungIn(text);
  const nurMaterial = !/(?<!\d)[1-4][1-8](?!\d)/.test(text)
    && (a.werkstoff || a.abformung || a.labor || a.verblendung || a.implantatSystem || Number.isInteger(a.privatStufe));
  const ziel = vs.fall
    ? (vs.teile || []).find((t) => t.planart === "kasse" || t.planart === "privat")
    : vs.r?.plan ? vs : null;
  const plan = vs.fall ? ziel?.r?.plan : vs.r?.plan;
  if (nurMaterial && plan && ziel?.planart !== "privat" && !vs.privat) {
    const e = E.ausfuehrungAendern(plan, a, praxisListen(praxis));
    if (e.ok) {
      const summen = summenAus(e.ergebnis);
      if (vs.fall) {
        ziel.r = { ...ziel.r, plan: e.plan, ergebnis: e.ergebnis, zusammenfassung: e.nachher };
        ziel.summen = summen;
        vorschauMerken(clientId, { ...vs, at: Date.now() });
      } else {
        vorschauMerken(clientId, {
          ...vs, r: { ...vs.r, plan: e.plan, ergebnis: e.ergebnis, zusammenfassung: e.nachher }, summen, at: Date.now(),
        });
      }
      return { ok: true, geaendert: true, message: `Am offenen Plan geändert: ${e.beschreibung}. Der übrige Plan bleibt.` };
    }
    if (vs.fall) return { ok: true, message: e.meldung };
  }
  const auftragText = `${String(vs.auftragText || vs.teile?.map((t) => t.versorgung).filter(Boolean).join(". ") || "").replace(/[\s.]+$/, "")}. ${text}`.trim();
  if (vs.sprachPlan) {
    vorschauWeg(clientId, vs);
    return sprachPlanRechnen(clientId, { ...vs, auftragText });
  }
  const auftrag = E.auftragVerstehen(auftragText);
  const r = vs.privat
    ? P.privatZeEntwurf(auftragText, vs.befund.befund, { patient: vs.r.plan.patient, implantatSystem: implantatStandard(praxis) })
    : E.hkpEntwurf(auftragText, vs.befund.befund, {
      patient: vs.r.plan.patient, einstellungen: praxis.einstellungen, implantatSystem: implantatStandard(praxis),
    }, praxisListen(praxis));
  if (r.status !== "ok") return { ok: true, rueckfrage: r.grund, message: r.frage };
  const z = r.zusammenfassung;
  const summen = vs.privat ? { gesamt: zahl(z.gesamt), honorar: zahl(z.honorar), labor: zahl(z.labor), material: zahl(z.material) } : summenAus(r.ergebnis);
  vorschauWeg(clientId, vs);
  vorschauMerken(clientId, { ...vs, auftrag, auftragText, r, summen, at: Date.now() });
  return {
    ok: true, rueckfrage: "vorlesen",
    message: vorleseSatz({
      patient: vs.patient, versorgungText: vs.versorgungText, kiefer: geplanteKiefer(auftrag, z), zaehne: r.plan.zaehne, versorgung: versorgungSatz(z),
      ausfuehrung: vs.privat ? "" : ausfuehrungText(r.plan), summen: vs.privat ? privatSummenSatz(summen) : summenSatz(summen),
      spanne: vs.privat ? "" : spanneVon(r.plan, praxis),
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

// ---------------------------------------------------------------------------
// Schlanke Planungswerkzeuge (W-PLANR-FREI, Chef 06.11.2026): Clara fuehrt das Gespraech und versteht den Chef selbst.
// Diese Werkzeuge haben keine Wortregeln und keinen Gespraechszustand: die Planart sagt Clara, gerechnet wird auf dem
// Befund vom Handy (Praxisprogramm samt offener Aenderungen aus hkp-befund). Angelegt wird nur mit freigabe=true.
// ---------------------------------------------------------------------------
export const PLANARTEN = ["kasse", "privat", "impl", "kons", "mkv"];
const PLANART_FRAGE = "Welche Planart: Kassen-HKP, privater Zahnersatz, Implantologie, private Kons oder Füllungs-MKV?";

router.post("/tools/plan-rechnen", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const planart = String(b.planart || "").trim().toLowerCase();
    let versorgung = String(b.versorgung || b.auftrag || "").trim();
    if (!PLANARTEN.includes(planart)) return res.json({ ok: false, fehlt: "planart", message: PLANART_FRAGE });
    if (!versorgung) return res.json({ ok: false, fehlt: "versorgung", message: "Welche Versorgung soll ich rechnen?" });
    if (planart === "privat" && privatAus()) return res.json({ ok: false, message: PRIVAT_AUS_SATZ });
    if (SPRACH_PLAENE[planart]?.aus()) return res.json({ ok: false, message: SPRACH_PLAENE[planart].ausSatz });
    const p = await patientAufloesen(clientId, b, "Für welchen Patienten soll ich den Plan rechnen?");
    if (p.antwort) return res.json(p.antwort);
    const patient = p.patient;
    const pb = await Promise.race([pvsBefund(clientId, patient).catch(() => null), new Promise((r) => setTimeout(r, 12000, null))]);
    const pvsNr = pb?.ok ? String(pb.nummer || "") : "";
    // "Die kommen raus" auf die Rueckfrage der Engine (Anruf 06.11.2026 08:38): Clara gibt nur die Zaehne,
    // MAS markiert sie im Befund auf dem Handy und rechnet darauf. Ohne Praxisprogramm stehen sie im Auftrag.
    const entfernen = zahnListe(b.entfernen);
    const erhalten = zahnListe(b.erhalten).filter((z) => !entfernen.includes(z));
    let markiert = "";
    if (entfernen.length) {
      const marken = pb?.ok && pvsNr ? entfernenMarken({ ...(pb.befund || {}), ...(pb.offen || {}) }, entfernen) : {};
      const a = Object.keys(marken).length
        ? await Promise.race([
          befundAendernPvs(clientId, pvsNr, marken, await getAssistantName(clientId).catch(() => DEFAULT_ASSISTANT_NAME)).catch(() => null),
          new Promise((r) => setTimeout(r, 15000, null)),
        ])
        : null;
      if (a?.ok) {
        pb.offen = { ...(pb.offen || {}), ...marken };
        markiert = `Auf dem Handy steht jetzt: ${zahnBefundSatz(marken)}. `;
      } else if (Object.keys(marken).length || !(pb?.ok && pvsNr)) {
        versorgung = `${versorgung.replace(/[.\s]+$/, "")}, nach Entfernung der Zähne ${entfernen.join(", ")}`;
      }
    }
    if (erhalten.length) versorgung = `${versorgung.replace(/[.\s]+$/, "")}, die Zähne ${erhalten.join(", ")} bleiben`;
    const card = pvsNr ? befundKarte(clientId, pvsNr, patient) : null;
    const mitKarte = (x) => (card && !x.card ? { ...x, card } : x);
    const stand = pb?.ok ? { ...(pb.befund || {}), ...(pb.offen || {}) } : null;
    const mitMerken = (x, extra = "") => {
      const merken = [stand ? befundMerken(stand) : "", extra].filter(Boolean).join("\n");
      const y = markiert && x.message ? { ...x, message: markiert + x.message } : x;
      return merken ? { ...y, merken } : y;
    };
    const praxisFuerFall = await praxisLaden(clientId).catch(() => ({ einstellungen: {} }));
    if (verbundSatz(versorgung)) {
      const x = fallRechnen({ versorgung, bonus: b.bonus }, {
        muster: false, befund: stand || {},
        patientDaten: patientFuerEngine(patient), patientLabel: patient.anredeLabel || "",
        akte: akteVon(patient), einstellungen: praxisFuerFall.einstellungen || {}, listen: praxisListen(praxisFuerFall),
        implantatSystem: implantatStandard(praxisFuerFall),
        praxisPlz: String(praxisFuerFall?.einstellungen?.praxisPlz || ""), kzvNr: String(praxisFuerFall?.einstellungen?.kzv || ""),
      });
      if (x.status !== "ok") return res.json(mitMerken(mitKarte({ ok: true, rueckfrage: "engine", message: x.frage })));
      vorschauMerken(clientId, {
        fall: true, muster: false, patient, teile: x.teile, fallTitel: x.fallTitel,
        befundPaket: { befund: stand || {}, quelle: pb?.ok ? { art: "pvs", pvs: pb.pvs, datum: pb.datum } : null, hinweise: [], pvs: pvsNr ? { nummer: pvsNr } : null },
        befundQuelle: pb?.ok ? { art: "pvs", pvs: pb.pvs, datum: pb.datum } : null, pvsNr,
        namenGesagt: [String(b.name || "").trim()], at: Date.now(),
      });
      return res.json(mitMerken(mitKarte({ ok: true, rueckfrage: "freigabe", message: x.message, cards: [x.card, card].filter(Boolean) })));
    }
    if (!/(?<!\d)[1-4][1-8](?!\d)/.test(versorgung)) {
      const a = E.ausfuehrungIn(versorgung);
      if (a.werkstoff || a.abformung || a.labor || a.verblendung || a.implantatSystem) {
        const vs = vorschauFuerAenderung(clientId, b);
        if (vs) return res.json(vorschauKorrigieren(clientId, vs, versorgung, praxisFuerFall));
      }
    }
    // eine neue Rechnung ersetzt die alte Vorschau dieses Patienten
    for (const v of vorschauen(clientId).filter((v) => v.patient?.id === patient.id)) vorschauWeg(clientId, v);
    let art = planart;
    if (stand) {
      const korrektur = planartKorrigieren(art, versorgung, stand);
      if (korrektur?.antwort) {
        const merken = [befundMerken(stand), korrektur.hinweis].filter(Boolean).join("\n");
        return res.json(mitKarte(merken ? { ...korrektur.antwort, merken } : korrektur.antwort));
      }
      if (korrektur?.planart && korrektur.planart !== art) {
        log.info?.(`[hkp] plan-rechnen ${art} -> ${korrektur.planart}: Versorgung auf vorhandenen Implantaten`);
        art = korrektur.planart;
        if (art === "privat" && privatAus()) return res.json({ ok: false, message: PRIVAT_AUS_SATZ });
        if (SPRACH_PLAENE[art]?.aus()) return res.json({ ok: false, message: SPRACH_PLAENE[art].ausSatz });
      }
    }
    log.info?.(`[hkp] plan-rechnen ${art}: Patient ${patient.id}: ${versorgung}${markiert ? ` | entfernt markiert: ${entfernen.join(", ")}` : ""}`);
    if (SPRACH_PLAENE[art]) {
      const offen = pb?.ok ? pb.offen || {} : {};
      const praxis = await praxisLaden(clientId).catch(() => ({ einstellungen: {} }));
      const x = sprachPlanRechnen(clientId, {
        sprachPlan: art, patient, auftragText: versorgung, befundZaehne: pb?.ok ? { ...pb.befund, ...offen } : {},
        praxis: { einstellungen: praxis?.einstellungen || {} }, namenGesagt: [String(b.name || "").trim()], pvsNr,
        befundQuelle: pb?.ok ? (Object.keys(offen).length ? { art: "gesprochen+pvs", pvs: pb.pvs, datum: new Date().toISOString() } : { art: "pvs", pvs: pb.pvs, datum: pb.datum }) : null,
      });
      return res.json(mitMerken(mitKarte(x.rueckfrage === "vorlesen" ? { ...x, rueckfrage: "freigabe" } : x)));
    }
    const pz = pb?.ok
      ? { ok: true, name: pb.pvs, datum: pb.datum ? datumDe(pb.datum) : "", nummer: pb.nummer, befund: pb.befund || {}, offen: pb.offen || {} }
      : { ok: false, name: pb?.pvs || "", befund: {}, offen: {} };
    const r = await fachRechnen(clientId, patient, b, { plan: versorgung, offen: { ...pz.offen }, uebertragen: "" }, pz,
      { privat: art === "privat", sagen: "", nurVorschau: true });
    if (r.rueck) return res.json(mitMerken(mitKarte({ ok: true, rueckfrage: "engine", message: r.frage || r.rueck }), rueckfrageMerken(r.grund, r.zaehne, r.vorschlag)));
    return res.json(mitMerken(mitKarte({ ok: true, rueckfrage: "freigabe", message: r.vorschau, ...(r.doppelt?.length ? { doppelt: r.doppelt.map((h) => h.id) } : {}) })));
  } catch (e) {
    log.error?.(`[hkp] plan-rechnen: ${e?.stack || e}`);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

const ORT = { impl: "die Implantation im Planer Implantologie", kasse: "die Prothese als HKP", privat: "die Prothese im Planer Zahnersatz privat", kons: "die Kons im Planer Kons privat", mkv: "die Mehrkosten im Planer Füllung" };

async function fallAnlegen(clientId, vs) {
  const { patient } = vs;
  const fallId = randomUUID();
  const name = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || patient.anredeLabel || "";
  const entwuerfe = [];
  const hkps = [];
  const befund = vs.befundPaket || { befund: {}, hinweise: [], quelle: vs.befundQuelle || null };
  for (const t of vs.teile || []) {
    const anzeige = `Fall ${vs.fallTitel} · ${name} · ${t.kurz}`.slice(0, 160);
    const gemeinsam = { anzeige, fallId, fallTitel: vs.fallTitel, patient, vorgelesen: true, hinweise: t.hinweise || [], pvsNr: vs.pvsNr, befundQuelle: vs.befundQuelle };
    if (t.sprachPlan) {
      const a = await sprachPlanAnlegen(clientId, { ...gemeinsam, sprachPlan: t.sprachPlan, auftragText: t.versorgung, r: t.r, summen: t.summen });
      if (a.entwurfId && a.entwurfId !== "trocken") entwuerfe.push(a.entwurfId);
    } else if (t.privat) {
      const a = await privatAnlegen(clientId, { ...gemeinsam, auftragText: t.versorgung, befund, r: t.r, summen: t.summen });
      if (a.entwurfId && a.entwurfId !== "trocken") entwuerfe.push(a.entwurfId);
    } else {
      const auftrag = E.auftragVerstehen(t.versorgung);
      if (auftrag?.status && auftrag.status !== "ok" && auftrag.frage) return { ok: true, rueckfrage: "engine", message: auftrag.frage };
      const a = await entwurfAnlegen(clientId, {
        ...gemeinsam, auftrag, auftragText: t.versorgung, versorgungText: t.titel, befund, r: t.r, summen: t.summen,
        zusaetzlich: true, doppelt: [],
      });
      if (a.hkpId && a.hkpId !== "trocken") hkps.push(a.hkpId);
    }
  }
  const orte = (vs.teile || []).map((t) => ORT[t.planart] || t.kurz);
  const liste = orte.length > 1 ? `${orte.slice(0, -1).join(", ")} und ${orte.at(-1)}` : orte[0] || "";
  const message = `Der Fall ist angelegt und wartet auf Ihre Freigabe in PlanR: ${liste}. Die Entwürfe gehören zum selben Fall.`;
  const primaerHkp = hkps[0] || "";
  const primaerEntwurf = entwuerfe[0] || "";
  return {
    ok: true,
    fallId, hkpId: primaerHkp, entwurfId: primaerEntwurf,
    message,
    ...mitUndo(primaerHkp ? "hkp" : "planr_entwurf", {
      id: primaerHkp || primaerEntwurf,
      label: `den Fall ${vs.fallTitel} für ${patient.anredeLabel}`,
      weitereHkps: hkps.filter((id) => id !== primaerHkp),
      weitereEntwuerfe: entwuerfe.filter((id) => id !== (primaerHkp ? "" : primaerEntwurf)),
    }),
  };
}

router.post("/tools/fall-rechnen", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const hatName = String(b.name || b.patient_nummer || b.geburtsdatum || "").trim();
    const muster = wahr(b.muster) || !hatName;
    let patient = null;
    let befundMap = {};
    let befundQuelle = null;
    let pvsNr = "";
    let befundCard = null;
    if (!muster) {
      const p = await patientAufloesen(clientId, b, "Für welchen Patienten soll ich die Rechnung rechnen?");
      if (p.antwort) return res.json(p.antwort);
      patient = p.patient;
      const pb = await Promise.race([pvsBefund(clientId, patient).catch(() => null), new Promise((r) => setTimeout(r, 12000, null))]);
      if (pb?.ok) {
        const offen = pb.offen || {};
        befundMap = { ...pb.befund, ...offen };
        pvsNr = String(pb.nummer || "");
        befundQuelle = Object.keys(offen).length
          ? { art: "gesprochen+pvs", pvs: pb.pvs, datum: new Date().toISOString() }
          : { art: "pvs", pvs: pb.pvs, datum: pb.datum };
        if (pvsNr) befundCard = befundKarte(clientId, pvsNr, patient);
      }
    }
    const praxis = await praxisLaden(clientId).catch(() => ({ einstellungen: {} }));
    const x = fallRechnen(b, {
      muster, befund: befundMap,
      anzeige: String(b.anzeige || "").trim().toLowerCase() === "text" ? "text" : "",
      patientDaten: patient ? patientFuerEngine(patient) : {},
      patientLabel: patient?.anredeLabel || "",
      akte: akteVon(patient || {}),
      einstellungen: praxis.einstellungen || {},
      listen: praxisListen(praxis),
      implantatSystem: implantatStandard(praxis),
      praxisPlz: String(praxis?.einstellungen?.praxisPlz || ""),
      kzvNr: String(praxis?.einstellungen?.kzv || ""),
    });
    if (x.status !== "ok") {
      return res.json({ ok: true, rueckfrage: "engine", message: x.frage, ...(x.karte ? { card: x.karte } : {}), ...(befundCard ? { cards: [befundCard] } : {}) });
    }
    const wer = patient || { id: `muster:${clientId}`, anredeLabel: "die Musterrechnung", label: "Musterrechnung" };
    for (const v of vorschauen(clientId).filter((v) => v.patient?.id === wer.id)) vorschauWeg(clientId, v);
    vorschauMerken(clientId, {
      fall: true, muster, patient: wer, teile: x.teile, fallTitel: x.fallTitel,
      befundPaket: { befund: befundMap, quelle: befundQuelle, hinweise: [], pvs: pvsNr ? { nummer: pvsNr } : null },
      befundQuelle, pvsNr, namenGesagt: [String(b.name || "").trim()], at: Date.now(),
    });
    const cards = [x.card, befundCard].filter(Boolean);
    log.info?.(`[hkp] fall-rechnen ${muster ? "muster" : patient.id}: ${x.fallTitel}`);
    return res.json({ ok: true, rueckfrage: muster ? "muster" : "freigabe", message: x.message, cards });
  } catch (e) {
    log.error?.(`[hkp] fall-rechnen: ${e?.stack || e}`);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.post("/tools/plan-ablegen", async (req, res) => {
  try {
    const clientId = await claraVorspann(req, res);
    if (!clientId) return;
    const b = req.body || {};
    const namenlos = !String(b.name || b.patient_nummer || b.geburtsdatum || "").trim();
    if (namenlos) {
      const muster = vorschauen(clientId).find((v) => v.muster && v.fall);
      if (muster) {
        return res.json({
          ok: false,
          message: "Das ist eine Musterrechnung, ich lege nichts an. Nennen Sie den Patienten, dann rechne ich auf seinem Befund und lege beide Entwürfe an.",
        });
      }
    }
    const p = await patientAufloesen(clientId, b, "Für welchen Patienten soll ich den Plan ablegen?");
    if (p.antwort) return res.json(p.antwort);
    const patient = p.patient;
    const vs = vorschauen(clientId).find((v) => v.patient?.id === patient.id);
    if (!vs) return res.json({ ok: false, message: `Für ${patient.anredeLabel} habe ich noch keinen gerechneten Plan. Ich rechne ihn zuerst.` });
    if (!wahr(b.freigabe)) return res.json({ ok: false, rueckfrage: "freigabe", message: "Soll ich den Plan so anlegen?" });
    vorschauWeg(clientId, vs);
    log.info?.(`[hkp] plan-ablegen: Patient ${patient.id} (${vs.fall ? "fall" : vs.sprachPlan || (vs.privat ? "privat" : "kasse")})`);
    if (vs.fall) return res.json(await fallAnlegen(clientId, vs));
    if (vs.sprachPlan) return res.json(await sprachPlanAnlegen(clientId, vs));
    if (vs.privat) return res.json(await privatAnlegen(clientId, { ...vs, vorgelesen: true }));
    return res.json(await entwurfAnlegen(clientId, { ...vs, vorgelesen: true, zusaetzlich: true, alteVerwerfen: wahr(b.alte_verwerfen) }));
  } catch (e) {
    log.error?.(`[hkp] plan-ablegen: ${e?.stack || e}`);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

export default router;
