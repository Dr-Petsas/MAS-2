// Diagnose 07.07.2026: Landingpage "KCH Erstuntersuchung / Neupatient" zeigt
// YouTube-Links statt ClonR-Videos. Prueft READ-ONLY, was im Besuchsgrund
// (visitMotives) unter landingPage.videoGroups / externalVideoUrls steht und
// welche ClonR-Videos es fuer die Gruppen tatsaechlich gibt.
// Aufruf: node scripts/diag-landingpage-videos.mjs [suchbegriff]
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT", loc = "VjdvbRQHH8oTId4f0GiX";
const term = (process.argv[2] || "erstuntersuchung").toLowerCase();

const vmCol = db.collection("clients").doc(cid).collection("locations").doc(loc).collection("visitMotives");
const snap = await vmCol.get();

const hits = snap.docs.filter((d) => {
  const o = d.data();
  const name = `${o.name || ""} ${o.nameForPatient || ""}`.toLowerCase();
  return name.includes(term);
});

console.log(`visitMotives gesamt: ${snap.size}, Treffer fuer "${term}": ${hits.length}`);

for (const d of hits) {
  const o = d.data();
  console.log(`\n=== ${d.id}  "${o.name}" (Patient: "${o.nameForPatient || "—"}") ===`);
  for (const key of ["landingPage", "recallLandingPage", "successorLandingPage"]) {
    const lp = o[key];
    if (!lp) { console.log(`  ${key}: — (fehlt)`); continue; }
    console.log(`  ${key}:`);
    console.log(`    headline: ${JSON.stringify(lp.headline || "")}`);
    console.log(`    videoGroupId (alt): ${JSON.stringify(lp.videoGroupId || "")}`);
    const groups = lp.videoGroups || [];
    console.log(`    videoGroups (${groups.length}):`);
    for (const g of groups) console.log(`      calendarId=${g.calendarId}  videoGroupId=${JSON.stringify(g.videoGroupId)}`);
    const ext = lp.externalVideoUrls || [];
    console.log(`    externalVideoUrls (${ext.length}):`);
    for (const e of ext) console.log(`      calendarId=${e.calendarId || "—"}  url=${e.videoUrl}  thumb=${e.videoThumbnailUrl || "—"}`);
  }
}

// ClonR-Videogruppen der Praxis auflisten (was gibt es ueberhaupt?)
const vids = await db.collection("clients").doc(cid).collection("clonRVideos").where("isDeleted", "==", false).get();
const byGroup = new Map();
for (const d of vids.docs) {
  const v = d.data();
  const gid = v.groupId || "(ohne groupId)";
  if (!byGroup.has(gid)) byGroup.set(gid, { name: v.groupName || v.name || "", langs: [], statuses: new Set() });
  const g = byGroup.get(gid);
  g.langs.push(v.language || "?");
  g.statuses.add(v.status || "?");
}
console.log(`\n=== ClonR-Videogruppen (${byGroup.size}) ===`);
for (const [gid, g] of byGroup) {
  console.log(`  ${gid}  name=${JSON.stringify(g.name)}  sprachen=[${g.langs.join(",")}]  status={${[...g.statuses].join(",")}}`);
}

// Kalender der Praxis (fuer die calendarId-Zuordnung)
const cals = await db.collection("clients").doc(cid).collection("locations").doc(loc).collection("calendars").get();
console.log(`\n=== Kalender (${cals.size}) ===`);
for (const d of cals.docs) {
  const c = d.data();
  console.log(`  ${d.id}  name=${JSON.stringify(c.name || "")}  license=${c.license || "—"}  online=${c.allowOnlineAppointments === true}`);
}
process.exit(0);
