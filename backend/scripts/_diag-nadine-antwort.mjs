// Diagnose: Wie gut antwortet Nadine auf eine WEITERGELEITETE Mail?
// Schickt genau das, was das Frontend heute schickt (MailReplyChat), an
// /mail/letter/ai-draft und zeigt Laenge + Text der Antwort.
//
// Aufruf: node scripts/_diag-nadine-antwort.mjs
const BASE = process.env.MAS_BASE || "http://127.0.0.1:4000";

// Realistische Weiterleitung: oben die kurze Notiz, unten das eigentliche
// Anliegen im Zitat. Genau der Fall, den der Chef bemaengelt.
const WEITERLEITUNG = `Betreff: WG: Kostenvoranschlag Implantat - Rueckfrage Erstattung
Von: Praxis Dr. Petsas <info@praxis-petsas.de>

Guten Morgen,

koennen Sie sich bitte darum kuemmern? Die Patientin wartet seit zwei Wochen.

Viele Gruesse
Team

-----Urspruengliche Nachricht-----
Von: Sabine Grothe <s.grothe@web.de>
Gesendet: Montag, 11. August 2026 09:14
An: info@praxis-petsas.de
Betreff: Kostenvoranschlag Implantat - Rueckfrage Erstattung

Sehr geehrte Damen und Herren,

meine Krankenkasse (Barmer, Versichertennummer A123456789) hat mir mitgeteilt,
dass sie den eingereichten Heil- und Kostenplan vom 28.07.2026 ueber 2.340,00 EUR
nur teilweise bezuschusst. Sie verlangt eine ergaenzende Begruendung, warum in
Regio 36 ein Implantat statt einer Bruecke geplant ist.

Koennen Sie mir bitte eine solche Begruendung ausstellen und direkt an die Kasse
schicken? Die Kasse hat mir eine Frist bis zum 05.09.2026 gesetzt.

Ausserdem wuerde ich gerne wissen, ob ich den Eigenanteil in Raten zahlen kann.

Mit freundlichen Gruessen
Sabine Grothe
Telefon 0221 4455667`;

async function draft(label, payload) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/mail/letter/ai-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  const body = String(j.body || "");
  console.log(`\n${"=".repeat(72)}\n${label}`);
  console.log(`${"=".repeat(72)}`);
  console.log(`HTTP ${r.status} | Modell ${j.model || "?"} | fallback=${j.fallback} | ${Date.now() - t0} ms`);
  console.log(`Betreff: ${j.subject || "(keiner)"}`);
  console.log(`Laenge: ${body.length} Zeichen, ${body.split(/\n\s*\n/).length} Absaetze, ${body.split(/\s+/).filter(Boolean).length} Woerter`);
  console.log(`Kontext: ${JSON.stringify(j.contextUsed?.counts || {})} sourceIncluded=${j.contextUsed?.sourceIncluded}`);
  console.log(`${"-".repeat(72)}`);
  console.log(body);
  return body;
}

// Fall A: exakt der heutige Frontend-Aufruf.
await draft("A) Wie es HEUTE laeuft (Weiterleitung, Absender = eigene Praxis)", {
  recipient: "Praxis Dr. Petsas <info@praxis-petsas.de>",
  patientName: "Praxis Dr. Petsas",
  sourceText: WEITERLEITUNG,
  direction: "Höfliche, professionelle Antwort auf diese eingegangene E-Mail formulieren.",
  tone: "freundlich, verbindlich",
});

// Fall B: nur die 200-Zeichen-Vorschau — so sieht es bei einer reinen
// HTML-Mail aus, weil das Frontend htmlBody NICHT mitschickt.
await draft("B) HTML-Mail: Frontend schickt nur die 200-Zeichen-Vorschau", {
  recipient: "Sabine Grothe <s.grothe@web.de>",
  patientName: "Sabine Grothe",
  sourceText: "Betreff: Kostenvoranschlag Implantat - Rueckfrage Erstattung\nVon: Sabine Grothe <s.grothe@web.de>\n\nSehr geehrte Damen und Herren, meine Krankenkasse (Barmer, Versichertennummer A123456789) hat mir mitgeteilt, dass sie den eingereichten Heil- und Kostenplan vom 28.07.20",
  direction: "Höfliche, professionelle Antwort auf diese eingegangene E-Mail formulieren.",
  tone: "freundlich, verbindlich",
});
