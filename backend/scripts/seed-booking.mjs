import "dotenv/config";
import { readFileSync } from "node:fs";
import admin from "../src/firebase.js";

// Seed clients/{clientId}/mas_config/booking from a voice profile.json booking
// block (camelCase keys MAS-2 expects). Idempotent (merge). Additive: only ever
// writes the MAS-owned mas_config collection.

const clientId = process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const profilePath =
  process.argv[3] || "../../voice/profiles/clara_meddent/profile.json";

const profile = JSON.parse(readFileSync(new URL(profilePath, import.meta.url), "utf8"));
const b = profile.booking || {};

const booking = {
  clientId: b.client_id || clientId,
  clientName: b.client_name || null,
  locationId: b.location_id || null,
  locationName: b.location_name || null,
  source: "mas-2-clara",
  cfBaseUrl: process.env.PICKADOC_CF_BASE_URL || null,
  defaultCalendarId: b.default_calendar_id || null,
  calendars: (b.calendars || []).map((c) => ({ id: c.id, name: c.name })),
  visitMotives: (b.visit_motives || []).map((v) => ({
    id: v.id,
    name: v.name,
    duration: v.duration || null,
  })),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

await admin
  .firestore()
  .collection("clients")
  .doc(clientId)
  .collection("mas_config")
  .doc("booking")
  .set(booking, { merge: true });

console.log(`[seed] wrote clients/${clientId}/mas_config/booking`);
console.log(`[seed] calendars: ${booking.calendars.map((c) => c.name).join(", ")}`);
console.log(`[seed] visitMotives: ${booking.visitMotives.length}`);
process.exit(0);
