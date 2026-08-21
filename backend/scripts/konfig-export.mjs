// W-STABIL-7 "Konfig ins Tag" (28.07.2026): Wirksamer Zustand AUSSERHALB von
// Git wird hier als Snapshot ins Repo exportiert, damit ein Release nicht nur
// aus Code-Tags besteht, sondern auch die gelebte Konfiguration versioniert:
//
//   1. ElevenLabs-Agenten (Lisa, optional Bianca): Prompt, erste Ansage,
//      Stimme, LLM, Tool-NAMEN — der Prompt lebt NUR in der ElevenLabs-
//      Konsole; eine Aenderung dort war bisher fuer Git unsichtbar.
//   2. Firestore-Settings (global): settings/lenaStt, settings/sophieKatalog
//      — als Inhalt + Hash. Tunnel-Hosts (trycloudflare/ngrok) werden
//      normalisiert, sonst wird der Morgenlauf nach jedem Stack-Start ROT.
//   3. Env-Schluessel-NAMEN (nie Werte!) aus backend/.env und
//      F:\Clara-Voice\.env — die Pflichtliste, gegen die Health-Ping und
//      Clara-Start pruefen.
//
// Vergleich ist KANONISCH (src/clara/konfigSnapshot.js): nur Verhaltensfelder.
// ElevenLabs-Schema-Zuwachs und ephemere Tunnel zaehlen nicht als Drift.
//
// SECRETS: der kanonische Agent speichert nur Tool-Namen und normalisierte
// URL-Pfade, nie Header/Keys. Env-Snapshots speichern nur Schluessel-NAMEN.
//
// Aufruf:   node scripts/konfig-export.mjs          (schreibt + zeigt Drift)
//           node scripts/konfig-export.mjs --check  (nur vergleichen, Exit 1 bei Drift)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  canonicalElevenAgent, canonicalFirestoreDoc,
} from "../src/clara/konfigSnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, "..");
const SNAP_DIR = path.join(BACKEND, "config-snapshots");
const CLARA_ROOT = "F:\\Clara-Voice";
dotenv.config({ path: path.join(BACKEND, ".env") });

const CHECK_ONLY = process.argv.includes("--check");

// --- Helfer -----------------------------------------------------------------

/** Stabil serialisieren (Schluessel sortiert), damit Hashes vergleichbar sind. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sha = (obj) => crypto.createHash("sha256").update(stableStringify(obj)).digest("hex").slice(0, 16);

function envKeysOf(file) {
  if (!fs.existsSync(file)) return [];
  const keys = new Set();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m && !line.trim().startsWith("#")) keys.add(m[1]);
  }
  return [...keys].sort();
}

function writeSnapshot(name, data) {
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const file = path.join(SNAP_DIR, name);
  const next = JSON.stringify(data, null, 2) + "\n";
  const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const changed = prev !== next;
  if (!CHECK_ONLY && changed) fs.writeFileSync(file, next, "utf8");
  return { file: name, changed, existedBefore: prev !== null };
}

// --- Quellen ----------------------------------------------------------------

async function elevenAgent(agentId, label) {
  const key = (process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key || !agentId) return null;
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { "xi-api-key": key },
  });
  if (!r.ok) throw new Error(`ElevenLabs ${label}: HTTP ${r.status}`);
  const raw = await r.json();
  const kept = canonicalElevenAgent(raw);
  return { label, hash: sha(kept), config: kept };
}

async function firestoreSettings() {
  const { default: admin } = await import("../src/firebase.js");
  const out = {};
  for (const docName of ["lenaStt", "sophieKatalog"]) {
    const snap = await admin.firestore().collection("settings").doc(docName).get();
    const data = snap.exists ? canonicalFirestoreDoc(snap.data()) : null;
    out[docName] = { exists: snap.exists, hash: data ? sha(data) : null, data };
  }
  return out;
}

// --- Hauptlauf ----------------------------------------------------------------

const ergebnisse = [];
let drift = false;

function melde(r, quelle) {
  ergebnisse.push({ quelle, ...r });
  if (r.changed) drift = true;
  const status = r.changed ? (r.existedBefore ? "GEAENDERT" : "NEU") : "unveraendert";
  console.log(`  [${status}] ${r.file}`);
}

console.log(CHECK_ONLY ? "Konfig-Abgleich (nur pruefen):" : "Konfig-Export:");

// 1) ElevenLabs-Agenten
for (const [envName, label] of [["LISA_AGENT_ID", "lisa"], ["BIANCA_AGENT_ID", "bianca"]]) {
  const id = (process.env[envName] || "").trim();
  if (!id) { console.log(`  [uebersprungen] ${label}: ${envName} nicht gesetzt`); continue; }
  try {
    const agent = await elevenAgent(id, label);
    melde(writeSnapshot(`elevenlabs-agent-${label}.json`, agent), `elevenlabs-${label}`);
  } catch (e) {
    console.error(`  [FEHLER] ${label}: ${e.message}`);
    process.exitCode = 1;
  }
}

// 2) Firestore-Settings (global)
try {
  const settings = await firestoreSettings();
  melde(writeSnapshot("firestore-settings.json", settings), "firestore");
} catch (e) {
  console.error(`  [FEHLER] Firestore: ${e.message}`);
  process.exitCode = 1;
}

// 3) Env-Schluessel-Namen (nie Werte)
melde(writeSnapshot("env-keys-mas.json", {
  hinweis: "Nur Schluessel-NAMEN aus backend/.env - nie Werte. Health-Ping prueft Vollstaendigkeit.",
  keys: envKeysOf(path.join(BACKEND, ".env")),
}), "env-mas");
melde(writeSnapshot("env-keys-clara.json", {
  hinweis: "Nur Schluessel-NAMEN aus F:\\Clara-Voice\\.env - nie Werte. start-clara.ps1 prueft Pflichtschluessel.",
  keys: envKeysOf(path.join(CLARA_ROOT, ".env")),
}), "env-clara");

console.log("");
if (CHECK_ONLY) {
  console.log(drift ? "DRIFT: wirksame Konfig weicht vom Snapshot ab - konfig-export.mjs laufen lassen + committen." : "Kein Drift: wirksame Konfig entspricht dem Snapshot.");
  if (drift) process.exitCode = 1;
} else {
  console.log(drift ? "Snapshots aktualisiert - bitte committen (Teil des Release-Stands)." : "Alles unveraendert - nichts zu committen.");
}
process.exit(process.exitCode || 0);
