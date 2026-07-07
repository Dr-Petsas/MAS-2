// Diagnose 07.07.2026 Teil 2: Wo kommen die YouTube-Links auf der
// KCH-Erstuntersuchungs-Landingpage her? Prueft READ-ONLY:
//  1. Die ClonR-Video-Dokumente der konfigurierten Gruppe (videoUrl echt?)
//  2. Die landingPage.description (eingebettete iframes?)
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT", loc = "VjdvbRQHH8oTId4f0GiX";
const vmId = "Cyy90WyFR1TcUzp8W7ED";
const groupId = "SaW2vppiIH9J5UUIc4tO4e71e73a-b7cc-4fbd-96e3-60b06695b963";

const vm = await db.collection("clients").doc(cid).collection("locations").doc(loc)
  .collection("visitMotives").doc(vmId).get();
const o = vm.data();

for (const key of ["landingPage", "recallLandingPage", "successorLandingPage"]) {
  const lp = o[key];
  if (!lp) continue;
  const desc = String(lp.description || "");
  console.log(`\n=== ${key}.description (${desc.length} Zeichen) ===`);
  console.log(desc.slice(0, 3000));
  const yt = desc.match(/youtu[^"'\s<>]*/gi) || [];
  console.log(`YouTube-Vorkommen in description: ${yt.length}`, yt.slice(0, 5));
}

const vids = await db.collection("clients").doc(cid).collection("clonRVideos")
  .where("isDeleted", "==", false).where("groupId", "==", groupId).get();
console.log(`\n=== ClonR-Videos der Gruppe (${vids.size}) ===`);
for (const d of vids.docs) {
  const v = d.data();
  console.log(`  id=${d.id}`);
  console.log(`    status=${v.status}  language=${v.language}`);
  console.log(`    videoUrl=${v.videoUrl}`);
  console.log(`    thumbnailUrl=${v.thumbnailUrl || "—"}`);
}
process.exit(0);
