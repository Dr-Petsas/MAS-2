// Legt die Composite-Indexe fuer den Mail-Posteingang an (additiv, idempotent):
//   mas_mail_messages: folder ASC + date DESC
//   mas_mail_messages: accountId ASC + folder ASC + date DESC
// Noetig fuer listMessages mit orderBy("date","desc") — siehe Vorfall 06.07.2026
// (AERA-Flut machte neue Mails im Posteingang unsichtbar). Nutzt die Firestore-
// Admin-REST-API mit dem Service-Account-Token; loescht NIE bestehende Indexe.
// Aufruf: node scripts/setup-mail-indexes.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import admin from "../src/firebase.js";

const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
const projectId = credPath ? JSON.parse(readFileSync(credPath, "utf8")).project_id : admin.app().options.projectId;
if (!projectId) { console.error("Projekt-ID nicht ermittelbar."); process.exit(1); }

const token = (await admin.app().options.credential.getAccessToken()).access_token;
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/mas_mail_messages/indexes`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const WANTED = [
  {
    name: "folder+date",
    fields: [
      { fieldPath: "folder", order: "ASCENDING" },
      { fieldPath: "date", order: "DESCENDING" },
    ],
  },
  {
    name: "accountId+folder+date",
    fields: [
      { fieldPath: "accountId", order: "ASCENDING" },
      { fieldPath: "folder", order: "ASCENDING" },
      { fieldPath: "date", order: "DESCENDING" },
    ],
  },
];

const sig = (fields) => fields.map((f) => `${f.fieldPath}:${f.order}`).join(",");

// Bestehende Indexe lesen (fuer Idempotenz)
const listRes = await fetch(base, { headers });
if (!listRes.ok) { console.error("Index-Liste fehlgeschlagen:", listRes.status, await listRes.text()); process.exit(1); }
const existing = ((await listRes.json()).indexes || []).map((ix) => ({
  name: ix.name, state: ix.state,
  sig: sig((ix.fields || []).filter((f) => f.fieldPath !== "__name__")),
}));
console.log(`Projekt ${projectId}: ${existing.length} bestehende Indexe auf mas_mail_messages.`);

const created = [];
for (const w of WANTED) {
  const have = existing.find((e) => e.sig === sig(w.fields));
  if (have) { console.log(`- ${w.name}: existiert bereits (${have.state}).`); continue; }
  const res = await fetch(base, {
    method: "POST", headers,
    body: JSON.stringify({ queryScope: "COLLECTION", fields: w.fields }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`- ${w.name}: Anlage fehlgeschlagen:`, res.status, JSON.stringify(body).slice(0, 300)); continue; }
  console.log(`- ${w.name}: Anlage gestartet (${body.name || "operation"}).`);
  created.push(w);
}

// Warten bis READY (Polling ueber die Index-Liste)
if (created.length) {
  process.stdout.write("Warte auf Index-Aufbau ");
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(base, { headers });
    const idx = ((await res.json()).indexes || []);
    const states = created.map((w) => idx.find((ix) => sig((ix.fields || []).filter((f) => f.fieldPath !== "__name__")) === sig(w.fields))?.state || "PENDING");
    if (states.every((s) => s === "READY")) { console.log("\nAlle Indexe READY."); process.exit(0); }
    process.stdout.write(".");
  }
  console.log("\nZeitlimit — Status spaeter pruefen (Code hat Fallback, nichts bricht).");
} else {
  console.log("Nichts zu tun.");
}
process.exit(0);
