// READ-ONLY: listet Mail-Konten (Sichtbarkeit/Inhaber) und die Team-Nutzer eines
// Mandanten und gleicht die users-Dokument-ID mit der echten Firebase-Auth-UID
// (per E-Mail) ab. Wichtig: der Postfach-Inhaber-Match im Backend läuft über die
// Auth-UID aus dem Token — stimmt die nicht mit ownerUserId überein, sperrt
// "privat" den Inhaber aus. Schreibt NICHTS.
import "dotenv/config";
import admin from "../src/firebase.js";
const db = admin.firestore();
const cid = process.argv[2] || "MEe4ZQHEzOPzLcexyhdT";

const accSnap = await db.collection("clients").doc(cid).collection("mas_mail_accounts").get();
console.log(`\n=== Mail-Konten (${accSnap.size}) — Mandant ${cid} ===`);
for (const d of accSnap.docs) {
  const a = d.data();
  console.log(`- id=${d.id} | ${a.email} | label=${a.label || ""} | visibility=${a.visibility || (a.ownerUserId ? "private" : "praxis")} | ownerUserId=${a.ownerUserId || "-"} | active=${a.active !== false}`);
}

const userSnap = await db.collection("clients").doc(cid).collection("users").get().catch(() => ({ docs: [], size: 0 }));
console.log(`\n=== Team-Nutzer (${userSnap.size}) — docId vs. Auth-UID ===`);
for (const d of userSnap.docs) {
  const u = d.data();
  const name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  let authUid = "(nicht gefunden)";
  let match = "";
  if (u.email) {
    try {
      const rec = await admin.auth().getUserByEmail(u.email);
      authUid = rec.uid;
      match = rec.uid === d.id ? "  <-- docId == Auth-UID (ok)" : "  <-- ABWEICHUNG: docId != Auth-UID";
    } catch { authUid = "(kein Auth-Konto zu dieser Mail)"; }
  }
  console.log(`- docId=${d.id} | ${name || "(ohne Name)"} | ${u.email || ""} | isAdmin=${!!u.isAdmin}\n    authUid=${authUid}${match}`);
}
process.exit(0);
