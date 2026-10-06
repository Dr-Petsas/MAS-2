// Gesprochene Saetze zu HKPs. Claras Sprachschicht wandelt Zahlen nur bis 999
// und Datumsangaben selbst um — Eurobetraege werden deshalb HIER ausgeschrieben.
import { STATUS_TEXT, AKTIV } from "./store.js";
import { datumDe } from "./befundQuelle.js";

const EINER = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf",
  "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const ZEHNER = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];

/** 0 … 999 999 als deutsches Zahlwort ("ein" vor hundert/tausend, "eins" allein) */
export function zahlWort(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n < 20) return EINER[n];
  if (n < 100) {
    const e = n % 10, z = Math.floor(n / 10);
    return e ? `${e === 1 ? "ein" : EINER[e]}und${ZEHNER[z]}` : ZEHNER[z];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return `${h === 1 ? "ein" : EINER[h]}hundert${r ? zahlWort(r) : ""}`;
  }
  const t = Math.floor(n / 1000), r = n % 1000;
  return `${t === 1 ? "ein" : zahlWort(t).replace(/eins$/, "ein")}tausend${r ? zahlWort(r) : ""}`;
}

export function euroSprech(betrag) {
  const cent = Math.round((Number(betrag) || 0) * 100);
  const e = Math.floor(cent / 100), c = cent % 100;
  const euro = `${e === 1 ? "ein" : zahlWort(e)} Euro`;
  return c ? `${euro} ${zahlWort(c)}` : euro;
}

export const liste = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs[xs.length - 1]}`);
const zahn = (zs) => (zs.length === 1 ? `Zahn ${zs[0]}` : `den Zähnen ${liste(zs)}`);

export function versorgungSatz(z) {
  if (!z) return "";
  const teile = [];
  const glieder = z.glieder || [];
  if (z.teleskope?.length) teile.push(`Teleskope auf ${liste(z.teleskope)}`);
  if (z.kronen?.length) teile.push(`${glieder.length ? "Brückenanker-Kronen" : "Kronen"} auf ${liste(z.kronen)}`);
  if (glieder.length) teile.push(`${glieder.length === 1 ? "Brückenglied" : "Brückenglieder"} ${liste(glieder)}`);
  const ersetzt = (z.ersetzt || []).filter((x) => !glieder.includes(x));
  if (ersetzt.length) teile.push(`${ersetzt.length === 1 ? "ein ersetzter Zahn" : `${ersetzt.length} ersetzte Zähne`}`);
  return teile.join(", ");
}

export function summenSatz(s) {
  if (!s) return "";
  return `Gesamtkosten ${euroSprech(s.gesamt)}, Festzuschuss ${euroSprech(s.festzuschuss)}, Eigenanteil ${euroSprech(s.eigenanteil)}`;
}

export const hkpTitel = (h) => `${h.versorgungText || "HKP"}${h.kiefer ? ` im ${h.kiefer === "OK" ? "Oberkiefer" : "Unterkiefer"}` : ""}`;

/** Kurzbeschreibung eines HKP fuer Listen und Doppelungs-Rueckfragen */
export function hkpKurz(h) {
  return `${hkpTitel(h)} vom ${datumDe(h.erstellt)}, ${STATUS_TEXT[h.status] || h.status}`;
}

export function detailSatz(h) {
  const teile = [
    `Der ${hkpTitel(h)} für ${h.patient?.label || "den Patienten"} wurde am ${datumDe(h.erstellt)} erstellt${h.erstelltVon === "clara" ? " – von mir per Sprache" : " in PlanR"}.`,
    `Status: ${STATUS_TEXT[h.status] || h.status}.`,
  ];
  const v = versorgungSatz(h.zusammenfassung);
  if (v) teile.push(`Geplant: ${v}.`);
  if (h.auftragText) teile.push(`Eingesprochen war: „${String(h.auftragText).trim().replace(/[.!?]+$/, "")}“.`);
  if (h.summen) teile.push(`${summenSatz(h.summen)}.`);
  return teile.join(" ");
}

export function uebersichtSatz(alle, { patientLabel } = {}) {
  const warten = alle.filter((h) => h.status === "wartet_auf_freigabe");
  const aktiv = alle.filter((h) => AKTIV.has(h.status));
  if (patientLabel) {
    if (!alle.length) return `Für ${patientLabel} gibt es noch keinen HKP.`;
    const kopf = alle.length === 1 ? `Für ${patientLabel} gibt es einen HKP:` : `Für ${patientLabel} gibt es ${zahlWort(alle.length).replace(/^eins$/, "einen")} HKPs:`;
    return `${kopf} ${alle.slice(0, 4).map((h, i) => `${alle.length > 1 ? `${["erstens", "zweitens", "drittens", "viertens"][i]} ` : ""}${hkpKurz(h)}`).join("; ")}.`;
  }
  if (!alle.length) return "Es sind noch keine HKPs im Register.";
  const wartetSatz = warten.length === 0
    ? "Kein HKP wartet auf Freigabe."
    : warten.length === 1
      ? `Ein HKP wartet auf Freigabe: ${warten[0].patient?.label || ""}, ${hkpTitel(warten[0])}.`
      : `${zahlWort(warten.length).replace(/^eins$/, "ein")} HKPs warten auf Freigabe: ${liste(warten.slice(0, 5).map((h) => h.patient?.label || "unbekannt"))}${warten.length > 5 ? " und weitere" : ""}.`;
  return `${wartetSatz} Insgesamt ${aktiv.length === 1 ? "ist ein HKP" : `sind ${zahlWort(aktiv.length).replace(/^eins$/, "ein")} HKPs`} in Bearbeitung.`;
}

export { zahn as zahnText };
