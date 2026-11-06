// Abrechnungscoach (Chef 06.11.2026): "Wie rechne ich XY ab?" ergibt eine komplette Rechnung.
// Mehrere Teile (Implantation und die spätere Prothese) sind EIN Fall. Beträge stehen nur auf der
// Karte fürs Handy und in PlanR, nie im gesprochenen Satz. Ohne Patient ist es eine Musterrechnung.
import * as E from "../vendor/hkp-engine.mjs";
import * as P from "../vendor/privat-ze-engine.mjs";
import * as I from "../vendor/impl-engine.mjs";
import * as M from "../vendor/mkv-engine.mjs";
import * as K from "../vendor/kons-engine.mjs";
import { planPruefen } from "./ausschluss.js";

const ARTEN = new Set(["kasse", "privat", "impl", "kons", "mkv"]);
const zahl = (x) => Math.round((Number(x) || 0) * 100) / 100;
const euro = (n) => `${(Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const zeilenKurz = (t) => {
  const s = String(t || "").trim();
  if (s.length <= 36) return s;
  return s.slice(0, 36).replace(/\s\S*$/, "") || s.slice(0, 36);
};
const PROTHESE = /all[\s-]*on|prothetik|suprakonstruktion|implantatgetragen/i;
const CHIRURGIE = /implantat|sinus|augmentation|knochenaufbau/i;

/** "regio 2, 4, 6 auf beiden Quadranten" im Oberkiefer → 12, 14, 16, 22, 24, 26. */
export function regioZaehne(text) {
  const roh = String(text || "");
  const k = roh.toLowerCase();
  const m = k.match(/regio\s+([1-8](?:\s*(?:,|und)\s*[1-8])*)/);
  if (!m) return [];
  const nums = [...m[1].matchAll(/[1-8]/g)].map((x) => x[0]);
  if (!nums.length) return [];
  const ok = /\boberkiefer\b|\bok\b/.test(k) || !/\bunterkiefer\b|\buk\b/.test(k);
  const uk = /\bunterkiefer\b|\buk\b/.test(k);
  // "rechts und links" nur als Paar. "Sinuslift rechts und internem … links" ist keine Seitenangabe der Region.
  const beide = /beiden?\s+quadranten|beiden?\s+seiten|rechts\s+und\s+links|links\s+und\s+rechts/.test(k);
  const rechtsWort = /\brechts\b/.test(k);
  const linksWort = /\blinks\b/.test(k);
  const quads = [];
  const seite = (rechts, links) => {
    if (beide) quads.push(rechts, links);
    else if (rechtsWort && !linksWort) quads.push(rechts);
    else if (linksWort && !rechtsWort) quads.push(links);
  };
  if (ok) seite("1", "2");
  if (uk) seite("4", "3");
  return [...new Set(quads.flatMap((q) => nums.map((n) => q + n)))];
}

const fdiSchonDa = (t) => /(?<!\d)[1-4][1-8](?!\d)/.test(t);

/** Engine-Text: fehlende Zahnnummern aus "regio …" ergänzen. Strukturierte Angaben überschreiben nichts Gesagtes. */
export function versorgungFuerEngine(teil) {
  let t = String(teil?.versorgung || teil?.text || "").trim();
  const extra = [];
  const zaehne = Array.isArray(teil?.zaehne) ? teil.zaehne.map(String).filter((z) => /^[1-4][1-8]$/.test(z)) : [];
  if (!fdiSchonDa(t)) {
    const liste = zaehne.length ? zaehne : regioZaehne(t);
    if (liste.length) {
      t = t.replace(/regio\s+[1-8](?:\s*(?:,|und)\s*[1-8])*/i, " ").replace(/\s{2,}/g, " ").trim();
      extra.push(`an ${liste.join(", ")}`);
    }
  }
  const sinus = teil?.sinus && typeof teil.sinus === "object" ? teil.sinus : null;
  if (sinus?.rechts && !/sinus\w*\s+rechts|rechts\s+\w*sinus/i.test(t)) {
    extra.push(`${sinus.rechts === "intern" ? "interner" : "externer"} Sinuslift rechts`);
  }
  if (sinus?.links && !/sinus\w*\s+links|links\s+\w*sinus/i.test(t)) {
    extra.push(`${sinus.links === "intern" ? "interner" : "externer"} Sinuslift links`);
  }
  return extra.length ? `${t}${t ? ", " : ""}${extra.join(", ")}` : t;
}

export function protheseArt(text, angegeben) {
  const a = String(angegeben || "").trim().toLowerCase();
  if (a === "kasse" || a === "privat") return a;
  const t = String(text || "");
  if (/\bprivat/.test(t) && !/\bkasse|gesetzlich/.test(t)) return "privat";
  if (/\bkasse|gesetzlich|\bhkp\b|festzuschuss/.test(t)) return "kasse";
  return "";
}

function protheseSatz(text) {
  const n = String(text).match(/all[\s-]*on[\s-]*(4|vier|four|6|sechs|six)/i);
  const sechs = !n || /6|sechs|six/.test(n[1]);
  const uk = /\buk\b|unterkiefer/i.test(text) && !/\bok\b|oberkiefer/i.test(text);
  return `All-on-${sechs ? 6 : 4} ${uk ? "Unterkiefer" : "Oberkiefer"}`;
}

function artAus(teil, text) {
  const a = String(teil?.planart || "").trim().toLowerCase();
  if (ARTEN.has(a)) return a;
  if (CHIRURGIE.test(text) && !(PROTHESE.test(text) && !/implantat(?!\w*(?:kron|getragen|br|prothes))/i.test(text))) return "impl";
  if (PROTHESE.test(text)) return protheseArt(text, teil?.prothese);
  return a;
}

/** Ein Satz oder eine Teile-Liste wird zu den Engine-Aufträgen. Fehlende Kasse/Privat-Angabe bleibt eine Frage. */
export function teileAufloesen(body) {
  const roh = typeof body?.teile === "string" && body.teile.trim().startsWith("[")
    ? (() => { try { return JSON.parse(body.teile); } catch { return null; } })()
    : body?.teile;
  let teile = [];
  if (Array.isArray(roh) && roh.length) {
    teile = roh.map((t) => {
      const versorgung = versorgungFuerEngine(t);
      return { planart: artAus(t, versorgung), versorgung };
    }).filter((t) => t.versorgung);
  } else {
    const text = String(body?.versorgung || body?.auftrag || "").trim();
    if (!text) return { teile: [], frage: "Was soll ich rechnen?" };
    const chirurgie = CHIRURGIE.test(text);
    const prothese = PROTHESE.test(text);
    if (chirurgie && prothese) {
      teile = [
        { planart: "impl", versorgung: versorgungFuerEngine({ versorgung: text, zaehne: body?.zaehne, sinus: body?.sinus }) },
        { planart: protheseArt(text, body?.prothese), versorgung: protheseSatz(text) },
      ];
    } else {
      const versorgung = versorgungFuerEngine({ versorgung: text, zaehne: body?.zaehne, sinus: body?.sinus });
      const planart = artAus({ planart: body?.planart, prothese: body?.prothese }, versorgung);
      teile = [{ planart, versorgung }];
    }
  }
  if (teile.some((t) => !t.planart && PROTHESE.test(t.versorgung))) {
    return { teile, frage: "Für die Prothese: über die Kasse mit Festzuschuss, oder privat?" };
  }
  if (teile.some((t) => !ARTEN.has(t.planart))) {
    return { teile, frage: "Welche Planart: Kassen-HKP, privater Zahnersatz, Implantologie, private Kons oder Füllungs-MKV?" };
  }
  return { teile, frage: "" };
}

function zeilenAus(r) {
  const rech = r?.rechnung;
  const kalk = r?.kalkulation;
  const roh = [
    ...(rech ? [...(rech.honorarGoz || []), ...(rech.honorarGoae || []), ...(rech.material || []), ...(rech.labor || [])] : []),
    ...(kalk ? [...(kalk.honorar || []), ...(kalk.material || []), ...(kalk.labor || [])] : []),
    ...(r?.ergebnis?.positionen || []),
  ];
  return roh.filter((p) => p && p.nr).map((p) => ({
    ebene: String(p.ebene || ""),
    nr: String(p.nr),
    zahn: String(p.zahn || ""),
    text: String(p.text || p.bezeichnung || "").replace(/\s+/g, " ").slice(0, 90),
    anzahl: Number(p.anzahl) || 1,
    betrag: zahl(p.betrag ?? (p.preis != null ? Number(p.preis) * (Number(p.anzahl) || 1) : 0)),
  }));
}

function gruppen(zeilen) {
  const map = new Map();
  for (const z of zeilen) {
    const key = `${z.ebene}|${z.nr}`;
    const g = map.get(key) || { ...z, anzahl: 0, betrag: 0 };
    g.anzahl += z.anzahl;
    g.betrag = zahl(g.betrag + z.betrag);
    map.set(key, g);
  }
  return [...map.values()];
}

function summenVon(planart, r) {
  const z = r.zusammenfassung || {};
  if (planart === "impl") return { summe: zahl(z.summe), honorar: zahl(z.honorar), materialLabor: zahl(z.materialLabor) };
  if (planart === "kons") return { summe: zahl(z.summe) };
  if (planart === "mkv") return { mehrkosten: zahl(z.mehrkosten), kassenanteil: zahl(z.kassenanteil) };
  if (planart === "privat") return { gesamt: zahl(z.gesamt), honorar: zahl(z.honorar), labor: zahl(z.labor), material: zahl(z.material) };
  const s = r.ergebnis?.summen || {};
  return {
    gesamt: zahl(s.gesamt), festzuschuss: zahl(s.festzuschuss), kassenanteil: zahl(s.kassenanteil),
    eigenanteil: zahl(s.eigenanteil),
  };
}

function summeZeilen(planart, summen) {
  if (planart === "impl" || planart === "kons") return [`Gesamt ${euro(summen.summe)}`];
  if (planart === "mkv") return [`Mehrkosten ${euro(summen.mehrkosten)}`, `Kasse ${euro(summen.kassenanteil)}`];
  if (planart === "privat") return [`Gesamt ${euro(summen.gesamt)}`];
  return [`Gesamt ${euro(summen.gesamt)}`, `Festzuschuss ${euro(summen.festzuschuss)}`, `Eigenanteil ${euro(summen.eigenanteil)}`];
}

function titelVon(planart, r) {
  if (planart === "impl") return I.implVersorgungSatz(r.zusammenfassung);
  const z = r.zusammenfassung || {};
  if (z.ankerGesagt) return String(z.ankerGesagt);
  if (planart === "privat") return "Privater Zahnersatz";
  if (planart === "kons") return "Kostenvoranschlag Kons";
  if (planart === "mkv") return "Füllungs-Mehrkosten";
  return "Kassenplan";
}

const KURZ = { impl: "Implantation", kasse: "Kassenplan", privat: "Privatplan", kons: "Kons", mkv: "Mehrkosten" };

function rechnenTeil(teil, ctx) {
  const befund = ctx.befund || {};
  const patient = ctx.patientDaten || {};
  const system = ctx.implantatSystem || "";
  if (teil.planart === "impl") return I.implEntwurf(teil.versorgung, befund, { patient, implantatSystem: system });
  if (teil.planart === "kons") return K.konsEntwurf(teil.versorgung, befund, { patient });
  if (teil.planart === "mkv") return M.mkvEntwurf(teil.versorgung, befund, { patient, praxis: { plz: ctx.praxisPlz || "", kzvNr: ctx.kzvNr || "" } });
  if (teil.planart === "privat") return P.privatZeEntwurf(teil.versorgung, befund, { patient, implantatSystem: system });
  return E.hkpEntwurf(teil.versorgung, befund, { patient, einstellungen: ctx.einstellungen || {}, implantatSystem: system }, ctx.listen || {});
}

const VORRANG = new Set(["9010", "9040", "9050", "9000", "9100", "9110", "9120", "5000", "5040", "5070"]);

function karteGruppen(zeilen) {
  const g = gruppen(zeilen);
  const material = g.filter((z) => z.ebene === "MAT");
  const labor = g.filter((z) => z.ebene === "BEL" || z.ebene === "BEB");
  const honorar = g.filter((z) => z.ebene !== "MAT" && z.ebene !== "BEL" && z.ebene !== "BEB");
  const geordnet = [...honorar.filter((z) => VORRANG.has(z.nr)), ...honorar.filter((z) => !VORRANG.has(z.nr))].slice(0, 8);
  if (material.length) {
    geordnet.push({ ebene: "Material", nr: "", anzahl: material.length, betrag: zahl(material.reduce((s, z) => s + z.betrag, 0)) });
  }
  if (labor.length) {
    geordnet.push({ ebene: "Labor", nr: "", anzahl: labor.length, betrag: zahl(labor.reduce((s, z) => s + z.betrag, 0)) });
  }
  return geordnet;
}

function karteBauen(teile, { muster, label, fallTitel }) {
  const items = [];
  for (const t of teile) {
    for (const g of karteGruppen(t.zeilen)) {
      const geld = g.betrag ? ` · ${euro(g.betrag)}` : "";
      const nr = g.nr ? ` ${g.nr}` : "";
      const name = g.text ? ` ${zeilenKurz(g.text)}` : "";
      items.push({ icon: "list", level: "info", text: `${t.kurz} · ${g.ebene}${nr}${name} · ${g.anzahl}×${geld}` });
    }
    for (const s of summeZeilen(t.planart, t.summen)) {
      items.push({ icon: "euro", level: "ok", text: `${t.kurz} · ${s}` });
    }
  }
  return {
    kind: "hkp",
    tag: muster ? "Musterrechnung" : "Rechnung",
    title: label || (muster ? "Musterrechnung" : "Rechnung"),
    subtitle: fallTitel,
    heading: "Positionen und Beträge",
    items: items.slice(0, 24),
    footer: muster ? "Musterrechnung, nichts gespeichert. Beträge nur hier." : "Beträge nur hier. Anlegen erst nach Ihrem Ja.",
  };
}

/**
 * Rechnet jeden Teil. Rückfrage der Engine oder fehlende Planart kommt vor der Karte.
 * `teile` der Antwort trägt das Engine-Ergebnis fürs spätere Ablegen.
 */
export function fallRechnen(body, ctx = {}) {
  const auf = teileAufloesen(body || {});
  if (auf.frage) return { status: "rueckfrage", frage: auf.frage };
  const fertig = [];
  for (const teil of auf.teile) {
    const r = rechnenTeil(teil, ctx);
    if (r.status !== "ok") {
      return {
        status: "rueckfrage",
        frage: r.frage || "Dazu fehlt mir noch eine Angabe.",
        grund: r.grund || "",
        teil: teil.planart,
        karte: fertig.length ? karteBauen(fertig, { muster: ctx.muster, label: ctx.patientLabel, fallTitel: fallTitel(fertig) }) : null,
      };
    }
    const zeilen = zeilenAus(r);
    fertig.push({
      planart: teil.planart,
      sprachPlan: ["impl", "kons", "mkv"].includes(teil.planart) ? teil.planart : "",
      privat: teil.planart === "privat",
      versorgung: teil.versorgung,
      kurz: KURZ[teil.planart] || teil.planart,
      titel: titelVon(teil.planart, r),
      zeilen, summen: summenVon(teil.planart, r),
      hinweise: [...(r.hinweise || [])].filter((h) => !/€|euro/i.test(h)).slice(0, 4),
      r,
    });
  }
  const titel = fallTitel(fertig);
  const pruefung = planPruefen(fertig.flatMap((t) => t.zeilen));
  const hinweis = [...fertig.flatMap((t) => t.hinweise), ...pruefung.slice(0, 2).map((e) => e.hinweis)].slice(0, 3);
  const teilSatz = (t) => t.planart === "impl" ? `die Implantation: ${t.titel}`
    : t.planart === "kasse" ? `die Prothese über die Kasse: ${t.titel}`
      : t.planart === "privat" ? `die Prothese privat: ${t.titel}`
        : t.titel;
  const namen = fertig.map((t, i) => `${["Erstens", "Zweitens", "Drittens"][i] || "Außerdem"} ${teilSatz(t)}.`);
  const satz = fertig.length === 1
    ? `Die Rechnung: ${fertig[0].titel}.`
    : `Die Rechnung hat ${fertig.length === 2 ? "zwei Teile" : `${fertig.length} Teile`}. ${namen.join(" ")}`;
  const schluss = ctx.muster
    ? "Das ist eine Musterrechnung, ich speichere nichts. Alle Positionen und Beträge stehen auf dem Handy."
    : "Alle Positionen und Beträge stehen auf dem Handy. Soll ich den Entwurf so anlegen?";
  const message = [satz, ...hinweis, schluss].filter(Boolean).join(" ");
  return {
    status: "ok",
    message,
    card: karteBauen(fertig, { muster: ctx.muster, label: ctx.patientLabel, fallTitel: titel }),
    fallTitel: titel,
    teile: fertig,
  };
}

function fallTitel(teile) {
  const prothese = teile.find((t) => /All-on-/.test(t.titel));
  if (prothese && teile.some((t) => t.planart === "impl")) return `${prothese.titel} mit Implantation`;
  return teile.map((t) => t.kurz).join(" und ");
}
