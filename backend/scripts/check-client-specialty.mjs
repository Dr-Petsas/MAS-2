// Fachrichtung eines Mandanten pruefen — spiegelt getClientSpecialty.
//   node backend/scripts/check-client-specialty.mjs [clientId]
//   node backend/scripts/check-client-specialty.mjs [clientId] --set="Dermatologie"
// Default clientId: Blessing (UUJnPzoYPa4yYyzcaGlm). --set schreibt beide Quellen
// (client-Doc.specialty direkt + QM-Profil.fachrichtung via saveProfile, das
// clients/{id}.fachrichtung spiegelt und vorhandene Profilfelder erhaelt).
import "dotenv/config";
import { db } from "../src/firebase.js";
import { getProfile, saveProfile } from "../src/qm/books.js";
import { getClientSpecialty } from "../src/lena/specialty.js";

const args = process.argv.slice(2);
const CLIENT_ID = (args.find((a) => !a.startsWith("--")) || "UUJnPzoYPa4yYyzcaGlm").trim();
const setArg = args.find((a) => a.startsWith("--set="));
const setVal = setArg ? setArg.slice("--set=".length).trim().replace(/^["']|["']$/g, "") : "";

if (setVal) {
  const existing = (await getProfile(CLIENT_ID)) || {};
  await db.doc(`clients/${CLIENT_ID}`).set({ specialty: setVal }, { merge: true });
  await saveProfile(CLIENT_ID, { ...existing, fachrichtung: setVal });
  console.log(`GESETZT fuer ${CLIENT_ID}: specialty/fachrichtung = ${JSON.stringify(setVal)}\n`);
}

const snap = await db.doc(`clients/${CLIENT_ID}`).get();
const d = snap.exists ? (snap.data() || {}) : {};
console.log("clientId:", CLIENT_ID, "| client-Doc existiert:", snap.exists);
console.log("client.specialty   :", JSON.stringify(d.specialty ?? null));
console.log("client.fachrichtung:", JSON.stringify(d.fachrichtung ?? null));
console.log("client.fach        :", JSON.stringify(d.fach ?? null));

let qmFach = null;
try { qmFach = (await getProfile(CLIENT_ID))?.fachrichtung ?? null; } catch (e) { qmFach = `Fehler: ${e?.message || e}`; }
console.log("QM-Profil.fachrichtung:", JSON.stringify(qmFach));

const resolved = await getClientSpecialty(CLIENT_ID);
console.log("--> getClientSpecialty(resolved):", JSON.stringify(resolved), resolved ? "" : "(leer -> Default zahnmedizin)");

const s = String(resolved || "").trim().toLowerCase();
const dental = !s || /zahn|dental|kfo|kiefer|mkg|oralchir|parodont|prophyl/.test(s);
console.log("--> iPad-Einstufung:", dental ? "DENTAL (Schema/01 sichtbar)" : "NICHT-dental (Schema/01 aus, direkt Doku)");
process.exit(0);
