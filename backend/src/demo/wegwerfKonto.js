import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import admin, { db } from "../firebase.js";
import { log } from "../log.js";

// ============================================================================
// Wegwerf-Konto fuer die Live-Demo (Chef 19.08.2026).
//
// Wer in den Livemodus mit eigenen Daten wechselt, bekommt ein echtes
// Praxis-Konto (clients/{id}), damit Clara wie in einer Praxis laeuft.
// Das Konto ist als Demo markiert und erscheint in der Superuser-Kundenliste.
// Am Ende wird es verworfen — den Onboarder fassen wir deshalb nicht an.
//
// Striktes Verbot: bestehende Kunden-Konten (ohne isDemoAccount) werden
// niemals ueberschrieben. Nur IDs mit dem Vorspann "wegwerf-".
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const VORLAGE = "demo-seeblick";
export const PETSAS_ID = "wegwerf-petsas";
const SECRET_DATEI = "F:\\MAS-2\\.run\\demo-dev-secret.txt";

export function slugify(rein) {
  return String(rein || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "praxis";
}

export function clientIdFuer(lead) {
  const slug = slugify(lead?.praxis || lead?.name || "praxis");
  const kurz = String(lead?.id || crypto.randomBytes(4).toString("hex")).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return `wegwerf-${slug}-${kurz}`.slice(0, 60);
}

export function devGeheimLesen() {
  const env = String(process.env.DEMO_DEV_SECRET || "").trim();
  if (env) return env;
  try {
    if (existsSync(SECRET_DATEI)) return readFileSync(SECRET_DATEI, "utf8").trim();
  } catch { /* Datei fehlt: dann kein Dev-Zugang */ }
  return "";
}

export function geheimStimmt(rein) {
  const soll = devGeheimLesen();
  const ist = String(rein || "").trim();
  if (!soll || !ist || soll.length !== ist.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(soll), Buffer.from(ist));
  } catch {
    return false;
  }
}

function locIdFuer(clientId) {
  return `${clientId}-loc`.slice(0, 60);
}

async function billingVonVorlage(locId) {
  let vorlage = {};
  try {
    const snap = await db.collection("clients").doc(VORLAGE).collection("settings").doc("billing").get();
    if (snap.exists) vorlage = snap.data() || {};
  } catch { /* Vorlage fehlt: dann Minimal-Freigabe */ }
  const crewAlt = (vorlage.subscriptions && vorlage.subscriptions.crew) || {};
  return {
    schemaVersion: vorlage.schemaVersion || "2.0",
    source: "live-demo-wegwerf",
    useEntitlements: true,
    appOverrides: Object.assign({}, vorlage.appOverrides || {}),
    masModules: Object.assign({}, vorlage.masModules || {}, {
      supervisor: true,
      doku: true,
    }),
    subscriptions: Object.assign({}, vorlage.subscriptions || {}, {
      crew: {
        tier: crewAlt.tier === "telefon" ? "premium" : (crewAlt.tier || "premium"),
        bianca: crewAlt.bianca !== false,
        lisa: crewAlt.lisa !== false,
      },
    }),
    locationPackages: {
      [locId]: {
        frontdesk: { enabled: true },
        mas: { enabled: true },
        selfcheckin: { enabled: false, stationCount: 0 },
      },
    },
    updatedAt: new Date().toISOString(),
    demoFreigabenHinweis: "Wegwerf-Konto Live-Demo: Clara + Lena an.",
  };
}

/**
 * Legt ein Demo-Konto an oder gibt das vorhandene zurueck.
 * @param {object} lead
 * @param {{ dauerhaft?: boolean, clientId?: string, note?: string }} opt
 */
export async function wegwerfKontoAnlegen(lead, opt = {}) {
  const dauerhaft = opt.dauerhaft === true;
  const id = dauerhaft ? PETSAS_ID : (opt.clientId || lead?.clientId || clientIdFuer(lead));
  if (!id.startsWith("wegwerf-")) {
    return { ok: false, fehler: "id", klartext: "Wegwerf-Konten brauchen den Vorspann wegwerf-." };
  }

  const ref = db.collection("clients").doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    const d = snap.data() || {};
    if (d.isDemoAccount !== true) {
      log.warn("demo.wegwerf.kollision", { clientId: id });
      return { ok: false, fehler: "kollision", klartext: "Diese Praxis-ID gehoert einem echten Kunden. Abbruch." };
    }
    return { ok: true, clientId: id, schonDa: true };
  }

  const praxis = String(lead?.praxis || lead?.name || "Demo-Praxis").trim() || "Demo-Praxis";
  const name = dauerhaft ? "Praxis Dr. Petsas · Dev" : praxis;
  const locId = locIdFuer(id);
  const jetzt = new Date();
  const note = opt.note || (dauerhaft
    ? "Entwickler-Konto Petsas — nicht mit den Wegwerf-Konten der Interessenten loeschen."
    : "Wegwerf-Konto Live-Demo. Nach der Vorfuehrung verwerfen.");

  await ref.set({
    name,
    street: "",
    city: "",
    postalCode: "",
    state: "",
    country: "de",
    phoneNumber: lead?.handy || "",
    homepage: lead?.website || "",
    isEnabled: true,
    isDemoAccount: true,
    demoNote: note,
    demoCreatedAt: jetzt,
    isDeleted: false,
    createdAt: jetzt,
    features: {
      hasRecaller: true,
      hasSmsCockpit: true,
      hasStaffRostering: true,
      hasVacationScheduler: true,
      hasToDo: true,
      hasDashboard: true,
    },
    medicalSpecialties: ["dentist"],
    userIds: [],
    locations: [{
      id: locId,
      name,
      isEnabled: true,
    }],
    source: "live-demo-wegwerf",
    updatedAt: FieldValue.serverTimestamp(),
  });

  await ref.collection("locations").doc(locId).set({
    id: locId,
    name,
    isEnabled: true,
    createdAt: jetzt,
  }, { merge: true });

  await ref.collection("settings").doc("billing").set(await billingVonVorlage(locId), { merge: true });

  log.info("demo.wegwerf.angelegt", { clientId: id, praxis: name, dauerhaft });
  return { ok: true, clientId: id, schonDa: false };
}
