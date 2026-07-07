// Mini-Zaehler (READ-ONLY): Fortschritt des Mail-Backfills beobachten.
import "dotenv/config";
import admin from "../src/firebase.js";
const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT";
const col = db.collection("clients").doc(cid).collection("mas_mail_messages");
const total = (await col.count().get()).data().count;
for (const [acc, label] of [["5RhejapGKhvOvxIj3AkM", "med-dent"], ["Nqn7pVKBHJQjX023Mo0P", "pickadoc"]]) {
  const n = (await col.where("accountId", "==", acc).count().get()).data().count;
  console.log(`${label}: ${n}`);
}
console.log(`gesamt: ${total}`);
process.exit(0);
