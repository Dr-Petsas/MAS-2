// ============================================================================
// Claras Humor — deterministische Spruch-Pools (Wunsch Dr. Petsas, 12.06.2026).
//
// Die Sprüche entstehen HIER im Tool-Ergebnis und werden von Clara wörtlich
// vorgelesen — nicht vom LLM erfunden. So bleibt der Humor halluzinationsfrei
// (das 4B-Modell muss nichts dichten) und testbar. Einsatzorte:
//   - rote Unterschriften-Ampel (Unterlagen nie verschickt — "das darf nicht
//     sein", Clara regt sich hörbar auf)
//   - Bewertungen (schleimig-lustig bei gut, sarkastisch bei schlecht)
//   - Anrufliste (lockerer Schlusskommentar)
// ============================================================================

export function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Rote Ampel: Unterlagen wurden nie verschickt ---------------------------
// Ein Spruch pro Vorlesung (nicht pro Termin), sonst kippt es ins Alberne.
const RED_DOCS_QUIPS = [
  "Schon wieder rot. Passt hier eigentlich keiner auf?",
  "Der Termin ist rot, super! Sucht schon mal das iPad raus.",
  "Mann, Mann, Mann — nichts läuft hier ohne mich. Der Patient muss noch unterschreiben.",
  "Rot. Natürlich rot. Ich sage ja nichts, ich sage nur: rot.",
  "Da leuchtet wieder eine Ampel, und zwar nicht vor Freude.",
  "Ich will ja nicht meckern — aber wenn ich es nicht sage, sagt es ja keiner.",
  "Überraschung: rot! Wer schreibt nachher die Entschuldigung, Sie oder ich?",
  "Wenn ich für jede rote Ampel einen Euro bekäme, bräuchte ich keine Gehaltserhöhung mehr.",
  "Ich habe es kommen sehen. Keiner hört auf mich, aber ich habe es kommen sehen.",
  "Es wäre ja auch zu schön, wenn der Patient einfach vorher unterschreiben könnte.",
  "Die Ampel ist rot. Ich hole schon mal tief Luft und das iPad.",
  "Liebe Anwesende: das ist eine rote Ampel, keine Dekoration. Unterlagen raus, zack zack.",
  "Rot steht uns nicht. Wirklich nicht. Bitte sofort verschicken.",
];

export function redDocsQuip() {
  return pickFrom(RED_DOCS_QUIPS);
}

// --- Bewertungen: gut (4-5 Sterne) — lustig schleimend bis ironisch ---------
// {name} wird durch den Patientennamen ersetzt, wenn vorhanden.
const GOOD_REVIEW_QUIPS = [
  "Das geht runter wie Butter, ne? Endlich mal was Nettes.",
  "Och wie lieb von {name}. Da haben Sie ja gut gearbeitet.",
  "Kriege ich eigentlich eine Gehaltserhöhung, wenn ich gute Nachrichten bringe?",
  "Hätte glatt von mir sein können.",
  "Hmmm. Hmmm. Nö — das ist ja voll der Schleimer. Gefällt mir.",
  "Falls {name} denkt, durch eine positive Bewertung gibt es keine Rechnung: da irrt er sich.",
  "Fünf Sterne! Ich rahme das ein und hänge es virtuell übers Wartezimmer.",
  "Na also, geht doch. Ich tue jetzt einfach so, als wäre das mein Verdienst.",
  "So eine Bewertung am Morgen vertreibt Kummer und Sorgen.",
  "Soll ich das nochmal vorlesen? Einfach, weil ich es kann?",
  "Notiz an mich selbst: {name} beim nächsten Termin besonders charmant begrüßen.",
];

// --- Bewertungen: schlecht (1-2 Sterne) — sarkastisch ------------------------
const BAD_REVIEW_QUIPS = [
  "Hallo? Heulen Sie jetzt etwa nach dieser Bewertung?",
  "Ich habe das vorgelesen. Genießen konnte ich es nicht.",
  "Ein Stern. Wie poetisch. Für die Mühe gebe ich der Bewertung auch genau einen Stern.",
  "Atmen Sie durch. Ich habe schon Schlimmeres vorgelesen. Selten. Aber schon.",
  "Manche Leute bewerten auch das Wetter mit einem Stern.",
  "Ich würde ja zurückbewerten, aber das Feature fehlt mir noch.",
  "Tja. Allen Menschen recht getan ist eine Kunst, die niemand kann — nicht mal wir.",
  "Das tackern wir jetzt nicht über das Wartezimmer.",
];

// --- Bewertungen: mittel (3 Sterne) ------------------------------------------
const MEH_REVIEW_QUIPS = [
  "Drei Sterne. Das ist das 'ganz okay' unter den Bewertungen — weder Blumenstrauß noch Beschwerde.",
  "Drei Sterne sagt: war fein, hat aber niemanden vom Stuhl gerissen. Sportlicher Ansporn, würde ich sagen.",
  "Solide Mitte. Beim nächsten Mal holen wir den vierten Stern, ich spüre das.",
];

export function reviewQuip(rating, patientName = "") {
  const name = String(patientName || "").trim() || "dem Patienten";
  const pool = rating >= 4 ? GOOD_REVIEW_QUIPS : rating <= 2 ? BAD_REVIEW_QUIPS : MEH_REVIEW_QUIPS;
  return pickFrom(pool).replaceAll("{name}", name);
}

// --- Anrufliste: lockerer Schlusskommentar -----------------------------------
// Nur wenn es Anrufe gab; bewusst kurz, damit das Protokoll Protokoll bleibt.
const CALL_LOG_QUIPS = [
  "Telefonieren kann ich übrigens rund um die Uhr. Nur falls das mal jemand würdigen möchte.",
  "Das Telefon stand nicht still — ich übrigens auch nicht.",
  "Alles angenommen, nichts verpasst. Applaus bitte leise, ich arbeite.",
  "Wieder alles weggearbeitet. Ich bin quasi die gute Seele mit Stromanschluss.",
  "Und das alles, ohne einmal die Augen zu verdrehen. Ich habe ja keine.",
  "Falls jemand fragt: ja, ich war wieder die Freundlichkeit in Person.",
];

export function callLogQuip() {
  return pickFrom(CALL_LOG_QUIPS);
}
