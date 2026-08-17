/**
 * Taugt das kleine lokale Modell fuer die Ansage-Politur?
 *
 * Laesst mehrere echte Ansage-Arten (Tages-Lagebild, E-Mail-Ueberblick,
 * Anrufliste, Wiedervorlage, Team-Ansage) durch freiFormulieren - einmal mit
 * dem starken Modell, einmal mit dem kleinen lokalen - und zeigt Dauer,
 * Annahmequote des Fakten-Waechters und den Wortlaut zum Mitlesen.
 *
 * Aufruf: node backend/scripts/pruef-freisprech-klein.mjs [modell]
 */
import "dotenv/config";
import { freiFormulieren } from "../src/clara/freiSprech.js";

const ANSAGEN = [
    ["Tages-Lagebild", "Sie haben heute elf Termine zwischen 9 Uhr und 19 Uhr, wobei die Zeitspanne von 12 Uhr 5 bis 13 Uhr 15 sowie von 15 Uhr 45 bis 16 Uhr 30 frei ist. Auffaellig sind zwei Neupatienten: Frau Melzer um 9 Uhr 30 zur Kontrolle und Herr Ottmani um 14 Uhr 20 mit Schmerzen im Oberkiefer rechts. Bei Frau Melzer steht ein Anamnese-Hinweis: Penicillin-Allergie. Ausserdem ist um 17 Uhr eine Sperrzeit eingetragen, und Helmut Mustermann kommt um 18 Uhr 40 zur Nachkontrolle nach der Fuellung an Zahn 45."],
    ["E-Mail-Ueberblick", "Heute sind drei E-Mails eingetroffen. Um 1 Uhr 53 kam eine E-Mail von STRATO mit dem Betreff Benachrichtigung ueber eine offene Rechnung. Um 2 Uhr 15 folgte eine weitere Nachricht von STRATO zur Zahlung einer Mahnung. Um 6 Uhr 45 erreichte uns eine E-Mail von Jan Keller, der mitteilt, dass die Laborarbeit fuer Frau Melzer einen Tag spaeter kommt."],
    ["Anrufliste", "Heute waren es fuenf Anrufe. Frau Tzannis hat um 8 Uhr 10 angerufen und moechte ihren Termin am Donnerstag verschieben. Lisa hat Herrn Kasper um 9 Uhr 25 erreicht, er montiert die Leuchtreklame am Montag. Zwei Anrufer haben aufgelegt, bevor jemand abgenommen hat, und um 11 Uhr 40 wollte das Labor Dedental den Zahntechniker sprechen."],
    ["Wiedervorlage", "Auf der Wiedervorlage liegen vier Vorgaenge. Bei Frau Melzer fehlt noch die Einwilligung zur Wurzelbehandlung, Frist ist der 20. August. Herr Ottmani wartet auf den Kostenplan ueber 3 Sitzungen. Die Roentgenkontrolle bei Kind Janova ist seit 12 Tagen offen, und die Abrechnung fuer Zahn 45 bei Helmut Mustermann liegt noch beim Team."],
    ["Team-Ansage", "Morgen sind Frau Schmitz und Frau Yildiz ab 8 Uhr in der Praxis, Dr. Petsas kommt erst um 11 Uhr. Von 13 Uhr bis 14 Uhr ist niemand am Empfang, weil beide Mittagspause haben. Am Freitag fehlt eine Kraft fuer die Spaetschicht ab 16 Uhr 30."],
];

const modellArg = (process.argv[2] || "").trim();
if (modellArg) {
    process.env.MAS_FREISPRECH_BASE_URL = "http://127.0.0.1:11434";
    process.env.MAS_FREISPRECH_MODEL = modellArg;
}
console.log(`Politur-Modell: ${modellArg || "(Standard = starkes Modell)"}\n`);

let ok = 0;
const zeiten = [];
for (const [art, text] of ANSAGEN) {
    const t0 = Date.now();
    let r;
    try {
        r = await freiFormulieren(text, { kontext: `${art} fuer den Chef` });
    } catch (e) {
        r = { ok: false, text: "", warum: String(e?.message || e) };
    }
    const ms = Date.now() - t0;
    zeiten.push(ms);
    if (r.ok) ok += 1;
    console.log(`--- ${art}  (${ms} ms, ${r.ok ? "poliert" : `verworfen: ${r.warum}`})`);
    console.log(`    VORHER : ${text.slice(0, 150)}`);
    console.log(`    NACHHER: ${(r.ok ? r.text : "(deterministisch)").slice(0, 400)}\n`);
}
const median = [...zeiten].sort((a, b) => a - b)[Math.floor(zeiten.length / 2)];
console.log(`Ergebnis: ${ok}/${ANSAGEN.length} poliert, Median ${median} ms, alle [${zeiten.join(", ")}]`);
