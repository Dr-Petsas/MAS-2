// Praxis-Verbund aus PlanR (30.10.2026): eine Gast-Praxis nutzt HKP-Register, Praxis-Standard und Sprach-Entwuerfe
// einer Haupt-Praxis mit – so schreiben Clara (MAS) und die HKP-Assistentin des PlanR-Standalone in dieselbe Ablage.
// Fuehrend ist PlanR (zugaenge.json); hier liegt der Spiegel clients/{gast}.planrVerbund = { haupt, register, seit, von }.
// Keine Ketten: die Haupt-Praxis ist nirgends Gast, ein Gast hat keine Gaeste. Notaus MAS_PLANR_VERBUND=0.
import admin from "../firebase.js";
import { log } from "../log.js";

const CACHE_MS = 60_000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const cache = new Map();

const aus = () => process.env.MAS_PLANR_VERBUND === "0";
const clients = () => admin.firestore().collection("clients");

let laden = async (clientId) => {
  const d = await clients().doc(clientId).get();
  return d.exists ? d.data() || {} : null;
};
let gaesteSuchen = async (clientId) => {
  const s = await clients().where("planrVerbund.haupt", "==", clientId).limit(5).get();
  return s.docs.map((d) => d.id);
};

export function _setVerbundLaden(fn, gaeste) {
  laden = fn;
  if (gaeste) gaesteSuchen = gaeste;
  cache.clear();
}

function verbundAus(daten) {
  const v = daten?.planrVerbund;
  return v && typeof v === "object" && ID_RE.test(String(v.register || "")) ? v : null;
}

/** HKP-Register dieser Praxis: im Verbund das der Haupt-Praxis, sonst sie selbst. Wirft nie. */
export async function registerFuer(clientId) {
  const id = String(clientId || "").trim();
  if (!id || aus()) return id;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.register;
  try {
    const v = verbundAus(await laden(id));
    const register = v ? String(v.register) : id;
    cache.set(id, { at: Date.now(), register });
    return register;
  } catch (e) {
    log.warn?.(`[planr-verbund] ${id}: ${e?.message || e}`);
    return hit?.register || id;
  }
}

/** Ohne Firestore-Zugriff (z. B. Live-Ansicht, synchron): zuletzt bekanntes Register, sonst die Praxis selbst */
export function registerBekannt(clientId) {
  const id = String(clientId || "").trim();
  if (!id || aus()) return id;
  return cache.get(id)?.register || id;
}

export async function verbundLesen(clientId) {
  return verbundAus(await laden(clientId));
}

const name = (d, id) => String(d?.name || id).slice(0, 120);

/** Gast an Haupt koppeln. Liefert { ok, hauptName, gastName } oder { ok: false, status, message }. */
export async function verbundSetzen(gast, { haupt, register, von = "" }) {
  const g = String(gast || "").trim(), h = String(haupt || "").trim(), r = String(register || h).trim();
  if (!ID_RE.test(g) || !ID_RE.test(h) || !ID_RE.test(r)) return { ok: false, status: 400, message: "Praxis unbekannt." };
  if (g === h) return { ok: false, status: 409, message: "Eine Praxis kann nicht mit sich selbst gekoppelt werden." };
  const [gd, hd] = await Promise.all([laden(g), laden(h)]);
  if (!hd) return { ok: false, status: 404, message: "Die Haupt-Praxis ist in MAS nicht bekannt." };
  if (verbundAus(hd)) return { ok: false, status: 409, message: "Die andere Praxis ist selbst an eine dritte gekoppelt." };
  const alt = verbundAus(gd);
  if (alt && alt.haupt !== h) return { ok: false, status: 409, message: "Ihre Praxis ist schon mit einer anderen gekoppelt. Bitte zuerst entkoppeln." };
  if ((await gaesteSuchen(g)).length) return { ok: false, status: 409, message: "An Ihre Praxis sind schon andere gekoppelt." };
  await clients().doc(g).set({ planrVerbund: { haupt: h, register: r, seit: new Date().toISOString(), von: String(von).slice(0, 200) } }, { merge: true });
  cache.delete(g);
  log.info?.("planr.verbund.gekoppelt", { gast: g, haupt: h, register: r });
  return { ok: true, hauptName: name(hd, h), gastName: name(gd, g) };
}

export async function verbundLoesen(gast) {
  const g = String(gast || "").trim();
  if (!ID_RE.test(g)) return { ok: false, status: 400, message: "Praxis unbekannt." };
  try {
    await clients().doc(g).update({ planrVerbund: admin.firestore.FieldValue.delete() });
  } catch (e) {
    if (e?.code !== 5) throw e;
  }
  cache.delete(g);
  log.info?.("planr.verbund.geloest", { gast: g });
  return { ok: true };
}
