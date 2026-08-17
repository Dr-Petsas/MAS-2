/**
 * Wartezeit der gesprochenen Clara-Werkzeuge am laufenden Backend messen.
 *
 * Ruft die Endpunkte wie Clara auf (nur lesende bzw. harmlose) und zeigt die
 * Dauer je Aufruf - zwei Durchgaenge, damit man den Politur-Cache sieht.
 *
 * Aufruf: node backend/scripts/mess-endpunkte.mjs [durchgaenge]
 */
import "dotenv/config";

const BASIS = process.env.MESS_BASIS || "http://127.0.0.1:4000";
const CLIENT = process.env.MESS_CLIENT || process.env.MAS_DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const DURCHGAENGE = Number(process.argv[2] || 2);

const ENDPUNKTE = [
    ["day-briefing", {}],
    ["comms-digest", {}],
    ["call-log", {}],
    ["day-appointments", {}],
    ["wiedervorlage", {}],
    ["asap-queue", {}],
    ["nadine-briefing", {}],
];

async function ruf(pfad, body) {
    const t0 = Date.now();
    try {
        const r = await fetch(`${BASIS}/tools/${pfad}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Client-Id": CLIENT },
            body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        return { ms: Date.now() - t0, status: r.status, text: String(j.message || j.error || "").slice(0, 90) };
    } catch (e) {
        return { ms: Date.now() - t0, status: 0, text: String(e?.message || e).slice(0, 90) };
    }
}

console.log(`Backend: ${BASIS}   Mandant: ${CLIENT}\n`);
const messwerte = new Map();
for (let d = 1; d <= DURCHGAENGE; d += 1) {
    console.log(`--- Durchgang ${d}`);
    for (const [pfad, body] of ENDPUNKTE) {
        const r = await ruf(pfad, body);
        if (!messwerte.has(pfad)) messwerte.set(pfad, []);
        messwerte.get(pfad).push(r.ms);
        console.log(`  ${pfad.padEnd(20)} ${String(r.ms).padStart(6)} ms  [${r.status}] ${r.text}`);
    }
    console.log("");
}

console.log("=== Zusammenfassung (ms je Durchgang) ===");
for (const [pfad, ms] of [...messwerte.entries()].sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]))) {
    console.log(`${pfad.padEnd(20)} ${ms.map((m) => String(m).padStart(6)).join("  ")}`);
}
