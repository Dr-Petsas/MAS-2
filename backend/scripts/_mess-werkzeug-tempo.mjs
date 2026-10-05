// Messung 17.08.2026 (Chef: "etwas schneller waere cool, aber nicht zu Lasten
// der Qualitaet"). Misst die REINE Werkzeugzeit der haeufigsten Clara-Tools:
// jeder Endpunkt dreimal, erster Lauf kalt. Nur lesende Aufrufe.
const BASIS = "http://127.0.0.1:4000";
const cid = "MEe4ZQHEzOPzLcexyhdT";
const heute = new Date().toISOString().slice(0, 10);

const faelle = [
  ["day_briefing", "/tools/day-briefing", { date: heute }],
  ["next_patients_briefing", "/tools/next-patients-briefing", { count: 2 }],
  ["list_day_appointments", "/tools/day-appointments", { date: heute }],
  ["morning_briefing", "/tools/morning-briefing", {}],
  ["comms_digest", "/tools/comms-digest", {}],
  ["call_log", "/tools/call-log", {}],
  ["gap_briefing", "/tools/gap-briefing", {}],
  ["ask_nadine", "/tools/nadine-briefing", {}],
  ["search_patient", "/tools/search-patient", { name: "Mustermann" }],
  ["find_contact", "/tools/find-contact", { name: "Mustermann" }],
  ["patient_timeline", "/tools/patient-timeline", { name: "Mustermann" }],
];

const zeile = (n, w) => String(n).padEnd(w);

async function einmal(pfad, body) {
  const t0 = process.hrtime.bigint();
  let zeichen = 0, fehler = "";
  try {
    const r = await fetch(`${BASIS}${pfad}?clientId=${cid}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    zeichen = txt.length;
    if (!r.ok) fehler = `HTTP ${r.status}`;
  } catch (e) {
    fehler = String(e?.message || e);
  }
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, zeichen, fehler };
}

console.log(`${zeile("Werkzeug", 26)}${zeile("kalt ms", 10)}${zeile("warm ms", 10)}${zeile("warm2 ms", 10)}${zeile("Zeichen", 9)}Hinweis`);
for (const [name, pfad, body] of faelle) {
  const a = await einmal(pfad, body);
  const b = await einmal(pfad, body);
  const c = await einmal(pfad, body);
  console.log(
    zeile(name, 26) +
    zeile(a.ms.toFixed(0), 10) +
    zeile(b.ms.toFixed(0), 10) +
    zeile(c.ms.toFixed(0), 10) +
    zeile(a.zeichen, 9) +
    (a.fehler || b.fehler || ""));
}
process.exit(0);
