// Fachrichtung eines Mandanten aufloesen (Chef 24.07.2026).
// ---------------------------------------------------------------------------
// Eine einzige Quelle fuer "welche Fachrichtung hat diese Praxis" — damit Lena
// (lena-suggest) und lena_stt (Nachkorrektur) dieselbe Antwort bekommen.
//
// Reihenfolge:
//   1. clients/{id}.specialty | .fachrichtung | .fach   (kanonisch, gespiegelt)
//   2. QM-Praxisprofil (mas_qm_profile/current).fachrichtung  (Onboarding-Kopplung)
// Leer -> Aufrufer nutzt den Default (zahnmedizin).

import admin from "../firebase.js";
import { getProfile } from "../qm/books.js";

export async function getClientSpecialty(clientId) {
  const cid = String(clientId || "").trim();
  if (!cid) return "";
  try {
    const snap = await admin.firestore().collection("clients").doc(cid).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    const s = String(d.specialty || d.fachrichtung || d.fach || "").trim();
    if (s) return s.slice(0, 60);
  } catch { /* weiter mit QM-Fallback */ }
  try {
    const p = await getProfile(cid);
    if (p?.fachrichtung) return String(p.fachrichtung).trim().slice(0, 60);
  } catch { /* keine QM-Daten */ }
  return "";
}
