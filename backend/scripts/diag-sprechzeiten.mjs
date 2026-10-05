// Diagnose: Warum ist im Praxis-Kalender eines Behandlers alles ausgegraut?
//   node backend/scripts/diag-sprechzeiten.mjs "dens" "Heckner"
// Rein lesend. Prueft die Kette, die das Frontend (calendarCtrl ->
// availabilityBackgroundEvents) auswertet: availabilitySlots am Kalender,
// openingHours am User, openingHours am Standort und die userId-Verknuepfung.
import "dotenv/config";
import { db } from "../src/firebase.js";

const [clientNeedleRaw, personNeedleRaw] = process.argv.slice(2);
const clientNeedle = (clientNeedleRaw || "dens").toLowerCase();
const personNeedle = (personNeedleRaw || "heckner").toLowerCase();

const WOCHENTAGE = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function zeit(t) {
  if (!t) return "?";
  if (typeof t === "string") return t;
  const h = t.hour ?? t.hours ?? "?";
  const m = t.minute ?? t.minutes ?? 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function zeigeOpeningHours(oh, prefix = "    ") {
  if (!oh) return console.log(`${prefix}(nicht vorhanden)`);
  console.log(`${prefix}enabled: ${JSON.stringify(oh.enabled)}`);
  for (const tag of WOCHENTAGE) {
    const d = oh[tag];
    if (!d) { console.log(`${prefix}${tag}: (fehlt)`); continue; }
    const offen = d.hasOpen ? `${zeit(d.open?.start)}-${zeit(d.open?.end)}` : "zu";
    const pause = d.hasPause ? ` Pause ${zeit(d.pause?.start)}-${zeit(d.pause?.end)}` : "";
    console.log(`${prefix}${tag}: hasOpen=${!!d.hasOpen} ${offen}${pause}`);
  }
}

const clientsSnap = await db.collection("clients").get();
const treffer = clientsSnap.docs.filter((d) => {
  const v = d.data() || {};
  const namen = [v.name, v.companyName, v.title, v.displayName, d.id].filter(Boolean).join(" ").toLowerCase();
  return namen.includes(clientNeedle);
});

console.log(`Mandanten gesamt: ${clientsSnap.size} | Treffer fuer "${clientNeedle}": ${treffer.length}`);
for (const c of treffer) {
  const v = c.data() || {};
  console.log(`  - ${c.id} : ${v.name || v.companyName || "(ohne Namen)"}`);
}
if (!treffer.length) {
  console.log("\nAlle Mandanten:");
  for (const c of clientsSnap.docs) {
    const v = c.data() || {};
    console.log(`  - ${c.id} : ${v.name || v.companyName || "(ohne Namen)"}`);
  }
  process.exit(0);
}

for (const client of treffer) {
  const clientId = client.id;
  console.log(`\n${"=".repeat(78)}\nMANDANT ${clientId} — ${(client.data() || {}).name || ""}`);

  const usersSnap = await db.collection(`clients/${clientId}/users`).get();
  const personen = usersSnap.docs.filter((u) => {
    const v = u.data() || {};
    const namen = [v.firstName, v.lastName, v.displayName, v.name, v.email].filter(Boolean).join(" ").toLowerCase();
    return namen.includes(personNeedle);
  });
  console.log(`Nutzer gesamt: ${usersSnap.size} | Treffer "${personNeedle}": ${personen.length}`);

  for (const u of personen) {
    const v = u.data() || {};
    console.log(`\n-- USER ${u.id} : ${[v.title, v.firstName, v.lastName].filter(Boolean).join(" ")} (${v.email || "ohne Mail"})`);
    console.log(`   locationId: ${JSON.stringify(v.locationId ?? null)} | calendarIds: ${JSON.stringify(v.calendarIds ?? null)}`);
    console.log("   users/{id}.openingHours:");
    zeigeOpeningHours(v.openingHours, "     ");
  }

  const locsSnap = await db.collection(`clients/${clientId}/locations`).get();
  for (const loc of locsSnap.docs) {
    const lv = loc.data() || {};
    console.log(`\n-- STANDORT ${loc.id} : ${lv.name || ""}`);
    console.log("   locations/{id}.openingHours:");
    zeigeOpeningHours(lv.openingHours, "     ");

    const calsSnap = await db.collection(`clients/${clientId}/locations/${loc.id}/calendars`).get();
    console.log(`   Kalender: ${calsSnap.size}`);
    for (const cal of calsSnap.docs) {
      const cv = cal.data() || {};
      const name = [cv.name, cv.title, cv.displayName].filter(Boolean).join(" ");
      const istTreffer = `${name} ${cv.userId || ""}`.toLowerCase().includes(personNeedle)
        || personen.some((p) => p.id === cv.userId);
      const marker = istTreffer ? ">>>" : "   ";
      const slots = Array.isArray(cv.availabilitySlots) ? cv.availabilitySlots : null;
      console.log(`${marker} ${cal.id} | name=${JSON.stringify(name)} | userId=${JSON.stringify(cv.userId ?? null)} `
        + `| license=${JSON.stringify(cv.license ?? null)} | selected=${JSON.stringify(cv.selected ?? null)} `
        + `| availabilitySlots=${slots ? slots.length : JSON.stringify(cv.availabilitySlots ?? null)}`);
      if (!istTreffer) continue;
      console.log("      calendars/{id}.openingHours:");
      zeigeOpeningHours(cv.openingHours, "        ");
      if (slots) {
        for (const [i, s] of slots.entries()) {
          console.log(`      slot[${i}]: ${JSON.stringify(s)}`);
        }
      }
    }
  }
}
process.exit(0);
