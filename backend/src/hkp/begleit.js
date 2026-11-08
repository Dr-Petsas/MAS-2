// Begleitleistungen der Musterrechnung (Chef 08.11.2026: "denk an begleitleistungen wie anästhesie röntgen etc").
// Die Engines rechnen die Hauptleistung samt ihren festen Zusätzen. Was eine Behandlung darüber hinaus
// üblicherweise mitbringt, ergänzt diese Tabelle. Nummern und Punktzahlen kommen aus den amtlichen Katalogen,
// nie vom Modell. Begleitleistungen beim Kassenpatienten rechnet die Praxis über die KZV ab; sie stehen
// getrennt von Mehrkosten und Eigenanteil.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "billing-catalog");
const punkteAus = (datei) => new Map(JSON.parse(readFileSync(path.join(KATALOG, datei), "utf8")).positions
  .map((p) => [String(p.code), Number(p.points) || 0]));
const GOZ = punkteAus("goz.json");
const BEMA = punkteAus("bema.json");
const GOZ_PUNKTWERT = 0.0562421;
const GOZ_FAKTOR = 2.3;
// GOÄ Abschnitt O I ist technische Leistung: Regelsatz 1,8 wie in der Kons-Engine.
const GOAE = { "5000": 50, "5004": 400 };
const GOAE_PUNKTWERT = 0.0582873;
const GOAE_FAKTOR = 1.8;
// Articain-Zylinderampulle, derselbe Schätzpreis wie im Materialkatalog der Implantat-Engine.
const ANAESTHETIKUM = 0.55;

export const BEGLEIT_ARTEN = ["anaesthesie", "roentgen", "opg", "vitalitaet", "bmf"];
const SPRECH = {
  anaesthesie: "Anästhesie", anaesthetikum: "Anästhetikum", roentgen: "Röntgen", opg: "OPG",
  vitalitaet: "Vitalitätsprüfung", bmf: "besondere Maßnahmen",
};
const PLASTISCH = new Set(["komposit", "mehrfarben", "aufbau"]);
const ANKER = new Set(["2150", "2160", "2170", "2200", "2210", "2220", "5000", "5010", "5020", "5030", "5040",
  "20a", "20b", "20c", "91a", "91b", "91c", "91d", "91e"]);

const zahl = (x) => Math.round((Number(x) || 0) * 100) / 100;
const liste = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs.at(-1)}`);
const fdi = (z) => /^[1-4][1-8]$/.test(z);
const ukSeite = (zahn) => (zahn[0] === "3" || zahn[0] === "4") && Number(zahn[1]) >= 4;
function regionVon(zahn) {
  const ok = zahn[0] === "1" || zahn[0] === "2";
  if (Number(zahn[1]) <= 3) return ok ? "OK-F" : "UK-F";
  return `${ok ? "OK" : "UK"}-${zahn[0] === "1" || zahn[0] === "4" ? "R" : "L"}`;
}

/** "keine", "vitalitaet, opg", "-roentgen" oder "ohne roentgen": was dazukommt und was wegfällt. */
export function begleitWahl(text) {
  const wahl = { keine: false, plus: new Set(), minus: new Set() };
  const worte = String(text || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .split(/[\s,;]+/).filter(Boolean);
  let ohne = false;
  for (const wort of worte) {
    if (wort === "keine") { wahl.keine = true; continue; }
    if (wort === "ohne") { ohne = true; continue; }
    const weg = ohne || /^(?:-|ohne[_-])/.test(wort);
    const art = wort.replace(/^(?:-|ohne[_-])/, "");
    if (BEGLEIT_ARTEN.includes(art)) (weg ? wahl.minus : wahl.plus).add(art);
    ohne = false;
  }
  return wahl;
}

function goz(nr, anzahl, text, art) {
  const einzel = zahl((GOZ.get(nr) || 0) * GOZ_PUNKTWERT * GOZ_FAKTOR);
  return { ebene: "GOZ", nr, zahn: "", text, anzahl, betrag: zahl(einzel * anzahl), begleit: art };
}
function goae(nr, anzahl, text, art) {
  const einzel = zahl(GOAE[nr] * GOAE_PUNKTWERT * GOAE_FAKTOR);
  return { ebene: "GOAE", nr: `Ä${nr}`, zahn: "", text, anzahl, betrag: zahl(einzel * anzahl), begleit: art };
}
function bema(nr, anzahl, text, art, punktwert) {
  const einzel = zahl((BEMA.get(nr) || 0) * punktwert);
  return { ebene: "BEMA", nr, zahn: "", text: `${text} (Kasse)`, anzahl, betrag: zahl(einzel * anzahl), begleit: art, kzv: true };
}

const hat = (zeilen, ebene, nr) => zeilen.some((z) => z.ebene === ebene && z.nr.replace(/^Ä/, "") === nr);
const injektionen = (zeilen) => zeilen.filter((z) => z.ebene === "GOZ" && (z.nr === "0090" || z.nr === "0100"))
  .reduce((s, z) => s + z.anzahl, 0);
const mitAnaesthetikum = (zeilen) => zeilen.some((z) => z.ebene === "MAT" && /articain|an(?:ä|ae)sthetik/i.test(`${z.nr} ${z.text}`));

/** Infiltration je Zahn; im Unterkiefer-Seitenzahnbereich eine Leitungsanästhesie je Seite. */
function anaesthesieVon(zaehne) {
  return {
    infiltration: zaehne.filter((z) => !ukSeite(z)).length,
    leitung: new Set(zaehne.filter(ukSeite).map(regionVon)).size,
  };
}

/** BEMA Ä925a bis Ä925d nach der Zahl der Aufnahmen, eine je Kieferhälfte oder Frontbereich. */
const roentgenBema = (aufnahmen) => (aufnahmen <= 2 ? "Ä925a" : aufnahmen <= 5 ? "Ä925b" : aufnahmen <= 8 ? "Ä925c" : "Ä925d");

/** Behandelte Zähne des Teils: bei Kons und Mehrkosten je Zahn mit Therapie, beim Zahnersatz die eigenen Pfeiler. */
function zaehneDes(teil, ohne) {
  const rech = teil.r?.rechnung;
  if (teil.planart === "kons" || teil.planart === "mkv") {
    return (rech?.zaehne || []).filter((z) => !z.ausgeschlossen && fdi(String(z.zahn || ""))).map((z) => ({
      zahn: String(z.zahn),
      therapie: String(z.therapie || teil.r?.plan?.zaehne?.[z.zahn]?.therapie || ""),
    }));
  }
  if (teil.planart === "privat" || teil.planart === "kasse") {
    const pfeiler = new Set(teil.zeilen.filter((z) => ANKER.has(z.nr) && fdi(z.zahn) && !ohne.has(z.zahn)).map((z) => z.zahn));
    return [...pfeiler].map((zahn) => ({ zahn, therapie: "pfeiler" }));
  }
  return [];
}

/**
 * Begleitleistungen eines gerechneten Teils, die die Engine nicht schon führt.
 * ohne: Zähne ohne eigenen Zahn (fehlend, ersetzt, Implantat). punktwert: KCH-Punktwert, als Funktion.
 */
export function begleitleistungen(teil, { ohne = new Set(), wahl = begleitWahl(""), punktwert = () => 0 } = {}) {
  if (wahl.keine || teil.planart === "impl") return [];
  const behandelt = zaehneDes(teil, ohne);
  if (!behandelt.length) return [];
  const zeilen = teil.zeilen;
  const neu = [];
  const will = (art, ueblich) => !wahl.minus.has(art) && (ueblich || wahl.plus.has(art));
  const opg = will("opg", false);
  const roentgen = will("roentgen", !opg);
  const zaehne = behandelt.map((z) => z.zahn);
  const regionen = new Set(zaehne.map(regionVon)).size;
  const privatAnaesthesie = (zs) => {
    if (injektionen(zeilen)) return;
    const a = anaesthesieVon(zs);
    if (a.infiltration) neu.push(goz("0090", a.infiltration, "Intraorale Infiltrationsanästhesie", "anaesthesie"));
    if (a.leitung) neu.push(goz("0100", a.leitung, "Intraorale Leitungsanästhesie", "anaesthesie"));
  };

  if (teil.planart === "kons" || teil.planart === "privat") {
    const ze = teil.planart === "privat";
    if (will("anaesthesie", ze)) privatAnaesthesie(zaehne);
    if (roentgen && !hat(zeilen, "GOAE", "5000")) neu.push(goae("5000", regionen, "Röntgen Zähne, je Projektion", "roentgen"));
    if (opg && !hat(zeilen, "GOAE", "5004")) neu.push(goae("5004", 1, "Panoramaschichtaufnahme (OPG)", "opg"));
    if (will("vitalitaet", ze) && !hat(zeilen, "GOZ", "0070")) neu.push(goz("0070", 1, "Vitalitätsprüfung", "vitalitaet"));
  } else {
    const pw = punktwert();
    const plastisch = teil.planart === "mkv" ? zaehne.filter((z, i) => PLASTISCH.has(behandelt[i].therapie)) : zaehne;
    const privatZaehne = teil.planart === "mkv" ? zaehne.filter((z) => !plastisch.includes(z)) : [];
    if (pw > 0) {
      if (plastisch.length && will("anaesthesie", true)) {
        const a = anaesthesieVon(plastisch);
        if (a.infiltration) neu.push(bema("40", a.infiltration, "Infiltrationsanästhesie", "anaesthesie", pw));
        if (a.leitung) neu.push(bema("41a", a.leitung, "Leitungsanästhesie", "anaesthesie", pw));
      }
      if (teil.planart === "mkv" && plastisch.length && will("bmf", true) && !hat(zeilen, "GOZ", "2030") && !hat(zeilen, "GOZ", "2040")) {
        neu.push(bema("12", new Set(plastisch.map(regionVon)).size, "Besondere Maßnahmen", "bmf", pw));
      }
      if (roentgen) neu.push(bema(roentgenBema(regionen), 1, "Röntgen Zähne", "roentgen", pw));
      if (opg) neu.push(bema("Ä935d", 1, "OPG", "opg", pw));
      if (will("vitalitaet", teil.planart === "kasse")) neu.push(bema("8", 1, "Vitalitätsprüfung", "vitalitaet", pw));
    }
    if (privatZaehne.length && will("anaesthesie", true)) privatAnaesthesie(privatZaehne);
  }

  const spritzen = injektionen([...zeilen, ...neu]);
  if (spritzen && !mitAnaesthetikum(zeilen)) {
    neu.push({ ebene: "MAT", nr: "Mat.", zahn: "", text: "Anästhetikum (Articain), je Ampulle", anzahl: spritzen,
      betrag: zahl(ANAESTHETIKUM * spritzen), begleit: "anaesthetikum" });
  }
  return neu;
}

/** Ein Satz ohne Beträge: welche Begleitleistungen mitgerechnet sind und welche über die Kasse laufen. */
export function begleitSatz(teile) {
  const alle = teile.flatMap((t) => t.zeilen);
  const namen = (kzv) => {
    const arten = new Set(alle.filter((z) => z.begleit && !!z.kzv === kzv).map((z) => z.begleit));
    const samt = arten.has("anaesthesie") && arten.delete("anaesthetikum");
    return [...arten].map((a) => (a === "anaesthesie" && samt ? "Anästhesie samt Anästhetikum" : SPRECH[a])).filter(Boolean);
  };
  const privat = namen(false);
  const kasse = namen(true);
  const saetze = [];
  if (privat.length) saetze.push(`Dazu stehen die üblichen Begleitleistungen drin: ${liste(privat)}.`);
  if (kasse.length) saetze.push(`Über die Kasse rechnen Sie ${privat.length ? "außerdem" : "dazu"} ab: ${liste(kasse)}.`);
  return saetze.join(" ");
}
