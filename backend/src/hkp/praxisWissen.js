// Praxis-Wissen (Chef 05.11.2026): Die Positionen, die der Connector aus dem PVS der Praxis zieht – eigene
// GOZ-/Analogpositionen, Eigenlabor (BEB), Kassen-Eigenlabor (BEL), Leistungsketten – gehören in Claras
// Wissensbasis. Nach jedem PVS-Abgleich (PlanR meldet POST /planr/praxis-wissen, sonst merkt es der
// Katalog-Abruf am neuen Stand) werden die Zeilen ohne Preise je Praxis eingebettet und unter
// data/praxis-wissen/<clientId>.json abgelegt. Unveränderte Zeilen behalten ihren Vektor.
// Notaus: MAS_PRAXIS_WISSEN=0.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anfrageVektor, embedModell, kosinus, kurzHash, nummernZusammen, vektorenFuer } from "./wissen.js";

const ORDNER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "praxis-wissen");
const aus = () => String(process.env.MAS_PRAXIS_WISSEN || "").trim() === "0";
const sauber = (s) => String(s || "").replace(/\s+/g, " ").trim();
const dateiVon = (clientId) => path.join(ORDNER, `${String(clientId).replace(/[^A-Za-z0-9_-]/g, "_")}.json`);

/** Analogposition der Praxis: "analog zu" gesetzt, Nummer mit a-Endung (DS-Win 9040a) oder "analog" im Text. */
export const istAnalog = (g) => Boolean(g?.analogZu) || /^\d{4}a$/i.test(String(g?.nr || "")) || /\banalog\b/i.test(String(g?.text || ""));

/** Zeilen ohne Preise, Punkte und Euro – so stehen sie im Prompt und so werden sie eingebettet. */
export function praxisZeilen(katalog) {
  const k = katalog && typeof katalog === "object" ? katalog : {};
  const zeilen = [];
  // such = nur der Leistungstext: der gleiche Vorspann in jeder Zeile machte die Vektoren einander zu ähnlich
  const add = (art, nr, text) => {
    if (!nr || !text) return;
    const such = text.slice(text.indexOf(":") + 1).replace(/,? BEB$/, "").trim();
    zeilen.push({ id: `${art}|${nr}`, art, nr: String(nr), zeile: text, such: art === "kette" ? `Leistungskette ${such}` : such });
  };
  for (const g of k.goz || []) {
    if (!g?.nr || (!g.eigen && !g.analogZu)) continue;
    const teile = [`${istAnalog(g) ? "Analogposition" : "Eigene GOZ-Position"} dieser Praxis ${g.nr}: ${sauber(g.text)}`];
    if (g.analogZu) teile.push(`analog zu GOZ ${g.analogZu}`);
    if (g.druckNr && g.druckNr !== g.nr) teile.push(`gedruckt als ${g.druckNr}`);
    if (g.kuerzel) teile.push(`Kürzel ${g.kuerzel}`);
    if (g.faktor) teile.push(`Faktor ${String(g.faktor).replace(".", ",")}`);
    add("goz", g.nr, teile.join(", "));
  }
  for (const e of k.eigenlabor || []) {
    if (!e?.nr) continue;
    const teile = [`Eigenlabor-Position dieser Praxis ${e.nr}: ${sauber(e.text)}`];
    if (e.ersetzt && e.ersetzt !== e.nr) teile.push(`statt BEB ${e.ersetzt}`);
    else if (e.ersetzt) teile.push("BEB");
    if (e.werkstoff) teile.push(`Werkstoff ${sauber(e.werkstoff)}`);
    add("beb", e.nr, teile.join(", "));
  }
  for (const b of k.bel || []) {
    if (b?.nr) add("bel", b.nr, `Kassen-Eigenlabor dieser Praxis BEL ${b.nr}: ${sauber(b.text)}`);
  }
  for (const x of k.komplexe || []) {
    if (!x?.kuerzel) continue;
    const pos = (x.positionen || []).map((p) => `${p.ebene} ${p.nr}${p.anzahl > 1 ? ` ×${p.anzahl}` : ""}`).join(", ");
    if (pos) add("kette", x.kuerzel, `Leistungskette ${x.kuerzel} dieser Praxis: ${sauber(x.text)}. ${pos}`);
  }
  return zeilen;
}

const zeilenHash = (zeilen) => crypto.createHash("sha1").update(zeilen.map((z) => z.zeile).join("\n")).digest("hex").slice(0, 16);

const speicher = new Map(); // clientId -> { hash, pvs, stand, eintraege: [{zeile, v}] }
const laeuft = new Map();

function lesen(clientId) {
  if (speicher.has(clientId)) return speicher.get(clientId);
  let s = null;
  try {
    const d = JSON.parse(fs.readFileSync(dateiVon(clientId), "utf8"));
    if (d.modell === embedModell()) {
      s = {
        hash: d.hash, pvs: d.pvs, stand: d.stand, gebaut: d.gebaut, anzahl: d.anzahl || {},
        eintraege: d.eintraege.map((e) => {
          const b = Buffer.from(e.v || "", "base64");
          return { ...e, v: b.length ? new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) : null };
        }),
      };
    }
  } catch { /* noch nichts abgelegt */ }
  speicher.set(clientId, s);
  return s;
}

/** Stand des Praxis-Wissens: { pvs, stand, gebaut, anzahl, eingebettet } oder null. */
export function praxisWissenStand(clientId) {
  const s = lesen(clientId);
  return s && { pvs: s.pvs, stand: s.stand, gebaut: s.gebaut, anzahl: s.anzahl, eingebettet: s.eintraege.filter((e) => e.v).length };
}

/**
 * Katalog der Praxis in ihr Wissen schreiben. Gleicher Inhalt = nichts zu tun. Wirft nie.
 * -> { ok, neu: bool, zeilen, eingebettet }
 */
export function praxisWissenAbgleichen(clientId, katalog) {
  if (aus() || !clientId || !katalog) return Promise.resolve({ ok: false, neu: false, zeilen: 0, eingebettet: 0 });
  if (laeuft.has(clientId)) return laeuft.get(clientId);
  const p = (async () => {
    const zeilen = praxisZeilen(katalog);
    const hash = zeilenHash(zeilen);
    const alt = lesen(clientId);
    if (alt && alt.hash === hash && alt.eintraege.every((e) => e.v && e.such)) {
      return { ok: true, neu: false, zeilen: zeilen.length, eingebettet: alt.eintraege.length };
    }
    const vorher = new Map((alt?.eintraege || []).filter((e) => e.v && e.such).map((e) => [kurzHash(e.such), e.v]));
    const eintraege = zeilen.map((z) => ({ ...z, v: vorher.get(kurzHash(z.such)) || null }));
    const offen = eintraege.filter((e) => !e.v);
    for (let i = 0; i < offen.length; i += 32) {
      const stueck = offen.slice(i, i + 32);
      const v = await vektorenFuer(stueck.map((e) => e.such));
      if (!v) break; // Ollama aus: die Wortsuche trägt weiter, beim nächsten Abgleich wird nachgeholt
      stueck.forEach((e, j) => { e.v = v[j]; });
    }
    const anzahl = {};
    for (const z of zeilen) anzahl[z.art] = (anzahl[z.art] || 0) + 1;
    anzahl.analog = (katalog.goz || []).filter((g) => (g.eigen || g.analogZu) && istAnalog(g)).length;
    const s = { hash, pvs: katalog.pvs || "", stand: katalog.stand || "", gebaut: new Date().toISOString(), anzahl, eintraege };
    fs.mkdirSync(ORDNER, { recursive: true });
    const datei = dateiVon(clientId);
    fs.writeFileSync(`${datei}.tmp`, JSON.stringify({
      modell: embedModell(), hash, pvs: s.pvs, stand: s.stand, gebaut: s.gebaut, anzahl,
      eintraege: eintraege.map((e) => ({ id: e.id, art: e.art, nr: e.nr, zeile: e.zeile, such: e.such, v: e.v ? Buffer.from(e.v.buffer, e.v.byteOffset, e.v.byteLength).toString("base64") : "" })),
    }));
    fs.renameSync(`${datei}.tmp`, datei);
    speicher.set(clientId, s);
    return { ok: true, neu: true, zeilen: zeilen.length, eingebettet: eintraege.filter((e) => e.v).length };
  })().catch((e) => ({ ok: false, neu: false, zeilen: 0, eingebettet: 0, fehler: String(e?.message || e) }))
    .finally(() => laeuft.delete(clientId));
  laeuft.set(clientId, p);
  return p;
}

/** Praxiszeilen, die der Bedeutung nach zur Frage passen (beste zuerst). [] ohne Ollama oder ohne Abgleich. */
export async function praxisWissenSuchen(clientId, satz, max = 8) {
  if (aus() || !clientId) return [];
  const s = lesen(clientId);
  const mit = s?.eintraege.filter((e) => e.v) || [];
  if (!mit.length) return [];
  const q = await anfrageVektor(nummernZusammen(satz));
  if (!q || q.length !== mit[0].v.length) return [];
  // Kurze Leistungstexte liegen eng beieinander: nur, was nah am besten Treffer liegt und eine Mindestnähe hat
  const rang = mit.map((e) => ({ zeile: e.zeile, art: e.art, sim: kosinus(q, e.v) })).sort((a, b) => b.sim - a.sim);
  const best = rang[0]?.sim || 0;
  const min = Math.max(Number(process.env.MAS_PRAXIS_WISSEN_MIN || 0.42), best - 0.08);
  return rang.filter((e) => e.sim >= min).slice(0, max);
}

/** Nur für Tests. */
export function _praxisWissenLeeren() { speicher.clear(); laeuft.clear(); }
