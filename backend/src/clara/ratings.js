// ============================================================================
// Bewertungen für Clara — liest die Patienten-Bewertungen (Plattform-Collection
// "ratings", erscheint im LiveBot als "Bewertung erhalten") und baut eine
// gesprochene Zusammenfassung MIT Kommentar: schleimig-lustig bei 4-5 Sternen,
// sarkastisch bei 1-2 (Wunsch Dr. Petsas, 12.06.2026).
//
// Abfrageform gespiegelt von docgendaweb/src/services/ratingsService.tsx
// (orderBy sendAt + Bereich + locationId — dafür existiert der Index bereits).
// Gefiltert/sortiert wird in JS: rating > 0 (= wirklich abgegeben), neueste
// zuerst nach ratedAt.
// ============================================================================
import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { relativeDayLabel, todayBerlin } from "./daySchedule.js";
import { reviewQuip } from "./humor.js";

const s = (v) => String(v ?? "").trim();

function tsToMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

function dayOfMs(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms));
}

/** Abgegebene Bewertungen der letzten ``windowDays`` Tage, neueste zuerst. */
export async function recentRatings(clientId, { windowDays = 60 } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, reason: "no_location", ratings: [] };

  const since = new Date(Date.now() - windowDays * 86400000);
  const snap = await admin.firestore().collection("ratings")
    .orderBy("sendAt")
    .where("sendAt", ">=", since)
    .where("locationId", "==", locationId)
    .get();

  const ratings = snap.docs
    .map((d) => {
      const o = d.data();
      return {
        id: d.id,
        rating: Number(o.rating || 0),
        comments: s(o.comments),
        patientName: `${s(o.patientFirstName)} ${s(o.patientLastName)}`.trim(),
        doctorName: s(o.doctorName),
        ratedAtMs: tsToMs(o.ratedAt),
        isPublic: o.public === true,
      };
    })
    .filter((r) => r.rating >= 1 && r.rating <= 5 && r.ratedAtMs > 0)
    .sort((a, b) => b.ratedAtMs - a.ratedAtMs);

  return { ok: true, ratings };
}

function spokenOne(r, { withDay = true } = {}) {
  const stars = r.rating === 1 ? "einem Stern" : `${r.rating} Sternen`;
  const who = r.patientName || "einem Patienten";
  const when = withDay ? `, ${relativeDayLabel(dayOfMs(r.ratedAtMs))},` : "";
  let line = `${who} hat uns${when} mit ${stars} bewertet`;
  if (r.comments) {
    const c = r.comments.length > 220 ? `${r.comments.slice(0, 217)}...` : r.comments;
    line += ` und schreibt: ${c}`;
  }
  return `${line}.`;
}

/**
 * Gesprochene Antwort auf "Gibt es neue Bewertungen?" — die neuesten
 * Bewertungen einzeln, danach Claras Kommentar zur frischesten.
 */
export async function spokenRatings(clientId, { limit = 3, sinceDays = 0 } = {}) {
  const res = await recentRatings(clientId, {});
  if (!res.ok) return "Es ist keine Praxis-Buchungskonfiguration hinterlegt.";

  let list = res.ratings;
  if (sinceDays > 0) {
    const cutoff = Date.now() - sinceDays * 86400000;
    list = list.filter((r) => r.ratedAtMs >= cutoff);
  }
  if (!list.length) {
    return sinceDays > 0
      ? "Es sind keine neuen Bewertungen eingegangen. Ich nehme das mal als 'keine Beschwerden'."
      : "Im Bewertungs-Postfach liegt aktuell nichts. Kein Applaus, aber auch kein Drama.";
  }

  const shown = list.slice(0, Math.max(1, limit));
  const parts = [];
  parts.push(shown.length === 1
    ? "Es gibt eine Bewertung."
    : `Es gibt ${shown.length} Bewertungen, die neueste zuerst.`);
  for (const r of shown) parts.push(spokenOne(r));
  // Claras Kommentar bezieht sich auf die NEUESTE Bewertung — eine Pointe
  // pro Vorlesung reicht, sonst wird aus der Assistentin ein Comedian.
  const newest = shown[0];
  parts.push(reviewQuip(newest.rating, newest.patientName));
  if (list.length > shown.length) {
    parts.push(`${list.length - shown.length} ältere stehen im Dashboard.`);
  }
  return parts.join(" ");
}

/**
 * Kurzer Einzeiler für das Morgen-Briefing: nur Bewertungen seit gestern,
 * mit Kommentar. Leerer String, wenn nichts Neues da ist.
 */
export async function ratingsBriefingLine(clientId) {
  try {
    const res = await recentRatings(clientId, { windowDays: 3 });
    if (!res.ok) return "";
    const today = todayBerlin();
    const fresh = res.ratings.filter((r) => {
      const d = dayOfMs(r.ratedAtMs);
      return d === today || dayOfMs(r.ratedAtMs + 86400000) === today; // heute oder gestern
    });
    if (!fresh.length) return "";
    const newest = fresh[0];
    const lead = fresh.length === 1 ? "Außerdem ist eine neue Bewertung da:" : `Außerdem sind ${fresh.length} neue Bewertungen da, die frischeste:`;
    return ` ${lead} ${spokenOne(newest, { withDay: false })} ${reviewQuip(newest.rating, newest.patientName)}`;
  } catch {
    return ""; // Briefing darf an Bewertungen nie scheitern
  }
}
