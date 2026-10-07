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

const aufsteigend = (zs) => [...(zs || [])].sort((a, b) => Number(a) - Number(b));

export function versorgungSatz(z) {
  if (!z) return "";
  const teile = [];
  const glieder = aufsteigend(z.glieder);
  const impl = aufsteigend(z.implantatkronen);
  if (impl.length) teile.push(`${impl.length === 1 ? "Implantatkrone" : "Implantatkronen"} auf ${liste(impl)}`);
  if (z.teleskope?.length) teile.push(`Teleskope auf ${liste(aufsteigend(z.teleskope))}`);
  if (z.kronen?.length) teile.push(`${glieder.length ? "Brückenanker-Kronen" : "Kronen"} auf ${liste(aufsteigend(z.kronen))}`);
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

export function detailSatz(h, ausfuehrung = "") {
  const teile = [
    `Der ${hkpTitel(h)} für ${h.patient?.label || "den Patienten"} wurde am ${datumDe(h.erstellt)} erstellt${h.erstelltVon === "clara" ? " – von mir per Sprache" : " in PlanR"}.`,
    `Status: ${STATUS_TEXT[h.status] || h.status}.`,
  ];
  const v = versorgungSatz(h.zusammenfassung);
  if (v) teile.push(`Geplant: ${v}.`);
  if (ausfuehrung) teile.push(`Ausführung: ${ausfuehrung}.`);
  // Live 06.10.2026: der vorgelesene Auftrags-Wortlaut machte die Antwort 40 s lang.
  if (h.auftragText && !v) teile.push(`Eingesprochen war: „${String(h.auftragText).trim().replace(/[.!?]+$/, "")}“.`);
  if (h.summen) teile.push(`${summenSatz(h.summen)}.`);
  return teile.join(" ");
}

const SUMMEN_FRAGE = /festzuschuss|eigenanteil|gesamtkosten|kosten|kostet|summe|betrag|preis|teuer|zahlen/i;
const ANDERE_FRAGE = /status|wann|erstellt|angelegt|geplant|befund|lies|vorles|details?|position/i;

/** Fragt der Satz nur nach Betraegen ("Wie hoch ist der Festzuschuss?")? */
export const nurSummenFrage = (frage) => SUMMEN_FRAGE.test(String(frage || "")) && !ANDERE_FRAGE.test(String(frage || ""));

export function summenAntwort(h) {
  if (!h?.summen) return detailSatz(h);
  return `Beim ${hkpTitel(h)} für ${h.patient?.label || "den Patienten"}: ${summenSatz(h.summen)}.`;
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
  // Live 07.10.2026: "Insgesamt ist ein HKP in Bearbeitung" fuer einen freigegebenen
  // HKP ohne Namen -- die Nachfrage "von wem?" beantwortete das Modell aus dem Kopf.
  const rest = aktiv.filter((h) => h.status !== "wartet_auf_freigabe");
  if (!rest.length) return wartetSatz;
  const genannt = rest.slice(0, 4).map((h) => `${h.patient?.label || "unbekannt"}, ${hkpTitel(h)}, ${STATUS_TEXT[h.status] || h.status}`);
  const kopf = rest.length === 1 ? "Außerdem im Register:" : `Außerdem ${zahlWort(rest.length)} weitere im Register${rest.length > 4 ? ", die neuesten" : ""}:`;
  return `${wartetSatz} ${kopf} ${genannt.join("; ")}.`;
}

const ORDNUNG = ["erstens", "zweitens", "drittens", "viertens", "fünftens", "sechstens"];
const VERB = { erstellt: "erstellt", freigegeben: "freigegeben", verworfen: "verworfen" };

/**
 * "Heute wurden zwei HKPs erstellt: erstens der Brücken-HKP im Unterkiefer für
 * Herrn Tzannis, freigegeben; zweitens ..." -- mit Patient, Art und Status.
 * Verworfene Entwuerfe zaehlen bei "erstellt" nur als Nachsatz.
 */
export function zeitraumSatz(treffer, { vorsatz, ereignis = "erstellt" }) {
  const verb = VERB[ereignis] || "erstellt";
  const haupt = ereignis === "erstellt" ? treffer.filter((h) => h.status !== "verworfen") : treffer;
  const verworfen = treffer.length - haupt.length;
  const nachsatz = verworfen
    ? ` Dazu ${verworfen === 1 ? "ein verworfener Entwurf" : `${zahlWort(verworfen)} verworfene Entwürfe`}.`
    : "";
  if (!haupt.length && verworfen) {
    return verworfen === 1
      ? `${vorsatz} wurde ein HKP-Entwurf erstellt, er ist inzwischen verworfen.`
      : `${vorsatz} wurden ${zahlWort(verworfen)} HKP-Entwürfe erstellt, ${verworfen === 2 ? "beide" : "alle"} sind inzwischen verworfen.`;
  }
  if (!haupt.length) return `${vorsatz} wurde kein HKP ${verb}.`;
  const eintrag = (h) => `der ${hkpTitel(h)} für ${h.patient?.label || "einen unbekannten Patienten"}`
    + (ereignis === "erstellt" ? `, ${STATUS_TEXT[h.status] || h.status}` : "");
  if (haupt.length === 1) return `${vorsatz} wurde ein HKP ${verb}: ${eintrag(haupt[0])}.${nachsatz}`;
  const genannt = haupt.slice(0, ORDNUNG.length).map((h, i) => `${ORDNUNG[i]} ${eintrag(h)}`);
  const uebrig = haupt.length - ORDNUNG.length;
  const mehr = uebrig > 0 ? `; und ${uebrig === 1 ? "ein weiterer" : `${zahlWort(uebrig)} weitere`}` : "";
  return `${vorsatz} wurden ${zahlWort(haupt.length)} HKPs ${verb}: ${genannt.join("; ")}${mehr}.${nachsatz}`;
}

export { zahn as zahnText };
