// Diagnose 14.08.: Chef-Nummer auf der Lisa-Karte — steckt ein Relikt in der DB?
import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { loadBooking } from "../src/clara/booking.js";
import { searchPatient } from "../src/clara/agentBooking.js";
import admin from "../src/firebase.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";

console.log("=== 1) Testlabor / Livetest-Fenster (mas_config/test_redirect) ===");
const tr = await masCollection(clientId, "mas_config").doc("test_redirect").get();
if (!tr.exists) {
  console.log("kein test_redirect-Dokument");
} else {
  const d = tr.data() || {};
  const until = Number(d.liveUntilMs) || 0;
  console.log({
    enabled: d.enabled,
    phone: d.phone || d.mobilePhoneNumber || "",
    name: d.name || "",
    liveUntilMs: until,
    liveUntilIso: until ? new Date(until).toISOString() : "",
    fensterAktiv: !!until && Date.now() < until,
    updatedAt: d.updatedAt || "",
  });
}

console.log("\n=== 2) voice_state (gemerkter Kontakt / pendingLisaCall) ===");
const vs = await masCollection(clientId, "mas_config").doc("voice_state").get();
if (!vs.exists) {
  console.log("kein voice_state");
} else {
  const d = vs.data() || {};
  const brief = (p) => p ? {
    name: `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.name || "",
    id: p.id || null,
    mobile: p.mobilePhoneNumber || p.mobile || "",
    phone: p.phoneNumber || p.phone || "",
    external: !!p.external,
  } : null;
  console.log("selectedPatient:", JSON.stringify(brief(d.selectedPatient)));
  console.log("patientCandidates:", JSON.stringify((d.patientCandidates || []).map(brief)));
  console.log("pendingLisaCall:", JSON.stringify(d.pendingLisaCall || null));
  console.log("lastContext.patient:", JSON.stringify(brief(d.lastContext?.patient)));
}

console.log("\n=== 3) Haila El Otmani im Patientenstamm ===");
try {
  const r = await searchPatient(clientId, "El Otmani");
  for (const p of (r.patients || [])) {
    console.log("Treffer:", JSON.stringify({
      id: p.id,
      name: `${p.firstName || ""} ${p.lastName || ""}`.trim(),
      birthDate: p.birthDate || "",
      mobil_suche: p.mobilePhoneNumber || "",
    }));
    const booking = await loadBooking(clientId).catch(() => null);
    if (booking?.locationId && p.id) {
      const doc = await admin.firestore()
        .collection("clients").doc(clientId)
        .collection("locations").doc(booking.locationId)
        .collection("patients").doc(String(p.id)).get();
      const pd = doc.exists ? doc.data() : null;
      console.log("  Patientendokument:", JSON.stringify({
        mobilePhoneNumber: pd?.mobilePhoneNumber || "",
        phoneNumber: pd?.phoneNumber || "",
        email: pd?.email || "",
      }));
    }
  }
} catch (e) {
  console.log("Suche fehlgeschlagen:", String(e?.message || e));
}

console.log("\n=== 4) Letzte 6 Lisa-Auftraege (was wurde wirklich gewaehlt?) ===");
const tasks = await masCollection(clientId, "mas_lisa_tasks")
  .orderBy("createdAt", "desc").limit(6).get();
for (const doc of tasks.docs) {
  const t = doc.data() || {};
  console.log(JSON.stringify({
    id: doc.id,
    createdAt: t.createdAt || "",
    kind: t.kind || t.type || "",
    contactName: t.contactName || t.recipientName || "",
    phone: t.phone || t.to || "",
    status: t.status || "",
  }));
}
process.exit(0);
