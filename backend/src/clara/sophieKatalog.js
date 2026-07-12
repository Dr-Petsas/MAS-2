// Server-Spiegel des Sophie-Konzept-Katalogs (W-LENA-7d+, 12.07.2026).
//
// Der Konzept-Katalog (klinische Bausteine + Abkuerzungs-Glossar) ist die EINE
// Quelle der Wahrheit im Frontend. Damit Clara am Telefon/Headset eine
// gesprochene Behandlung ("Fuellung an 35") OHNE geoeffnetes Frontend
// serverseitig in ein strukturiertes Sophie-Label wandeln kann, spiegeln wir den
// Katalog hierher: jeder /clara/billing-intake-Aufruf (Sophie im Browser) schickt
// den Katalog mit -> wir legen ihn global unter settings/sophieKatalog ab. Clara
// laedt ihn von dort. So bleibt das Frontend die Quelle der Wahrheit OHNE
// Doppelpflege; der Server haelt nur eine Kopie, die sich bei jeder Sophie-
// Nutzung selbst auffrischt.

import admin from "../firebase.js";

const DOC = () => admin.firestore().collection("settings").doc("sophieKatalog");

let _mem = null;        // { konzepte, glossar }
let _memAtMs = 0;
let _lastSig = "";      // Schreib-Guard: nur bei Aenderung nach Firestore
const _TTL_MS = 60000;  // 1 min In-Memory (Katalog aendert sich selten)

function _valid(k) {
  return !!(k && Array.isArray(k.konzepte) && k.konzepte.length > 0);
}

function _sig(k) {
  return `${k.konzepte.length}:${String(k.glossar || "").length}`;
}

/**
 * Katalog aus einem billing-intake-Request spiegeln (best-effort, non-blocking).
 * Schreibt nur nach Firestore, wenn sich der Katalog gegenueber dem letzten Spiegel
 * geaendert hat (spart Writes bei jeder Sophie-Erkennung).
 */
export async function cacheSophieKatalog(katalog) {
  if (!_valid(katalog)) return;
  const payload = {
    konzepte: katalog.konzepte,
    glossar: typeof katalog.glossar === "string" ? katalog.glossar : "",
  };
  _mem = payload;
  _memAtMs = Date.now();
  const sig = _sig(payload);
  if (sig === _lastSig) return;
  _lastSig = sig;
  try {
    await DOC().set({ ...payload, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: false });
  } catch { /* Cache ist Komfort — In-Memory reicht fuer diese Instanz */ }
}

/**
 * Gespiegelten Katalog laden (In-Memory-Cache, sonst Firestore).
 * null, wenn noch nie gespiegelt (dann nie eine Sophie-Erkennung im Browser gelaufen).
 */
export async function loadSophieKatalog() {
  if (_mem && Date.now() - _memAtMs < _TTL_MS) return _mem;
  try {
    const snap = await DOC().get();
    if (snap.exists) {
      const d = snap.data() || {};
      if (_valid(d)) {
        _mem = { konzepte: d.konzepte, glossar: typeof d.glossar === "string" ? d.glossar : "" };
        _memAtMs = Date.now();
        return _mem;
      }
    }
  } catch { /* faellt auf In-Memory (falls vorhanden) zurueck */ }
  return _mem || null;
}

/** Map konzeptId -> { label, fachbereich } fuer die sprechbare Kurzform. */
export function konzeptLabelIndex(katalog) {
  const idx = new Map();
  for (const k of (katalog?.konzepte || [])) {
    if (k?.id) idx.set(k.id, { label: k.label || k.id, fachbereich: k.fachbereich || "" });
  }
  return idx;
}
