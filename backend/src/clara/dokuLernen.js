import { randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { dokuAnforderungen, QUERSCHNITT_REGELN } from "./dokuPflicht.js";

// ============================================================================
// Doku-LERN-Profil (04.07.2026) — so wird das System mit der Zeit wirklich
// schlau, OHNE dass die Basis-Kataloge angefasst werden:
//
//   Basis-Katalog (dokuPflicht/dokuBasisKataloge, Fachrichtungs-Daten)
//     + Lern-Profil der Praxis (dieses Modul, Firestore)
//     = EFFEKTIVE Doku-Anforderungen fuer genau diese Praxis.
//
// Das Lern-Profil kann pro Regel (= Besuchsgrund-Gruppe):
//   - Fragen UNTERDRUECKEN  ("Frag nicht mehr nach Roentgen bei Zahnreinigung")
//   - Fragen ERGAENZEN      ("Frag bei Fuellung kuenftig auch nach der Farbe")
//   - Anpassungen AUFHEBEN  ("Frag doch wieder nach ...")
//
// Korrekturen kommen per STIMME (Clara-Tool set_doku_rule -> /tools/doku-regel),
// werden mit Original-Wortlaut + Zeitpunkt als Audit-Trail gespeichert und
// wirken SOFORT: der In-Prozess-Cache wird beim Schreiben invalidiert, der
// naechste Doku-Check im selben Gespraech nutzt schon das neue Profil.
//
// Dazu BEOBACHTUNGEN: Der Doku-Check zaehlt, welche Informationen der Chef
// beim Diktieren regelmaessig NENNT, obwohl der Katalog sie nicht kennt
// (z. B. immer die Zahnfarbe bei Fuellungen). Ab BEOBACHTUNG_SCHWELLE schlaegt
// Clara EINMAL vor, daraus eine feste Rueckfrage zu machen — Chef sagt ja/nein,
// beides wird gemerkt (kein Dauer-Nerven). So waechst die Fragenliste aus dem
// GESPROCHENEN, aber immer mit menschlicher Freigabe.
//
// Speicher: clients/{clientId}/mas_doku_lernprofil/{specialtyKey}
// (mas_*-Praefix = MAS-eigene Collection, Tenant-isoliert wie mas_events).
// ============================================================================

const COLLECTION = "mas_doku_lernprofil";
export const BEOBACHTUNG_SCHWELLE = 3;

// In-Prozess-Cache: ein Doku-Check pro Diktat soll keinen Extra-Read kosten.
// Kurz-TTL reicht; Schreibpfade invalidieren sofort (gleicher Prozess =>
// Korrektur wirkt im selben Gespraech).
const cache = new Map(); // `${clientId}:${specialtyKey}` -> { at, data }
const CACHE_TTL_MS = 30000;

function docRef(clientId, specialtyKey) {
  return masCollection(clientId, COLLECTION).doc(String(specialtyKey || "unbekannt"));
}

function leeresProfil(specialtyKey) {
  return { specialtyKey, anpassungen: [], beobachtungen: {}, vorschlaege: {} };
}

export async function getLernProfil(clientId, specialtyKey) {
  const key = `${clientId}:${specialtyKey}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  let data = leeresProfil(specialtyKey);
  try {
    const snap = await docRef(clientId, specialtyKey).get();
    if (snap.exists) {
      const d = snap.data() || {};
      data = {
        specialtyKey,
        anpassungen: Array.isArray(d.anpassungen) ? d.anpassungen : [],
        beobachtungen: d.beobachtungen && typeof d.beobachtungen === "object" ? d.beobachtungen : {},
        vorschlaege: d.vorschlaege && typeof d.vorschlaege === "object" ? d.vorschlaege : {},
      };
    }
  } catch { /* Profil ist Komfort — nie den Doku-Fluss blockieren */ }
  cache.set(key, { at: Date.now(), data });
  return data;
}

function invalidate(clientId, specialtyKey) {
  cache.delete(`${clientId}:${specialtyKey}`);
}

/** Umlaut-/Schreibweisen-tolerante Normalisierung fuer Feld-Matching. */
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Slug fuer gelernte Feld-Keys ("Zahnfarbe bestimmt?" -> "zahnfarbe_bestimmt"). */
function slug(s) {
  return norm(s).replace(/\s+/g, "_").slice(0, 40) || "feld";
}

// Begriffs-Gruppen: sagt der Chef "Roentgen", meint er ALLE Roentgen-Felder
// (Aufnahme+Region, rechtfertigende Indikation, Roentgenbefund) — nicht nur
// das eine Feld, dessen Key zufaellig passt.
const FELD_GRUPPEN = [
  { erkennt: /roentgen|rontgen|röntgen|opg|dvt|aufnahme|bildgebung/i, keys: ["roentgen", "aufnahme_region", "rechtfertigende_indikation", "roentgenbefund"] },
  { erkennt: /anaesthesie|anasthesie|anästhesie|betaeubung|betäubung|spritze/i, keys: ["anaesthesie"] },
];

/**
 * Findet in einer Feldliste ALLE Felder, die der gesprochene Begriff meint —
 * ueber Key, Fragetext (Substring, umlaut-tolerant) oder Begriffs-Gruppe.
 * "Roentgenbilder" trifft so die komplette Roentgen-Gruppe.
 */
function findeFelder(felder, begriff) {
  const b = norm(begriff);
  if (!b) return [];
  const treffer = new Map();
  const gruppe = FELD_GRUPPEN.find((g) => g.erkennt.test(begriff));
  for (const f of felder) {
    const k = norm(f.key);
    const q = norm(f.frage || "");
    const passt = k === b || k.includes(b) || b.includes(k) || q.includes(b)
      || (gruppe && gruppe.keys.includes(f.key));
    if (passt && !treffer.has(f.key)) treffer.set(f.key, f);
  }
  // Gruppen-Keys auch dann unterdruecken, wenn sie in der aktuellen Feldliste
  // (noch) nicht auftauchen — z. B. Querschnitt-Felder, die erst ein spaeteres
  // Diktat ausloest.
  if (gruppe) {
    for (const k of gruppe.keys) {
      if (!treffer.has(k)) treffer.set(k, { key: k, frage: "" });
    }
  }
  return [...treffer.values()];
}

/**
 * Regel-Kontext fuer einen gesprochenen Besuchsgrund aufloesen.
 * Liefert { regelId, regelLabel, basisFelder } — regelId "__geruest__",
 * wenn kein Katalog/Archetyp passt (Anpassung gilt dann fuers Geruest).
 */
export function regelKontext(specialtyKey, besuchsgrund) {
  const a = dokuAnforderungen(specialtyKey, besuchsgrund);
  const querFelder = QUERSCHNITT_REGELN.flatMap((q) => q.felder);
  return {
    regelId: a.regel?.id || "__geruest__",
    regelLabel: a.regel?.label || "allgemeine Dokumentation",
    basisFelder: [...(a.regel?.felder || []), ...querFelder, ...a.geruest.filter((g) => g.frage)],
    anforderungen: a,
  };
}

/**
 * Eine Lern-Anpassung anwenden (per Stimme diktiert).
 *
 * @param {string} clientId
 * @param {string} specialtyKey
 * @param {{ aktion:"frag_nicht_mehr"|"frag_auch"|"frag_wieder",
 *           besuchsgrund:string, feld:string, frage?:string,
 *           pflicht?:boolean, original?:string, by?:string }} p
 * @returns {Promise<{ok:boolean, message:string, regelId?:string}>}
 */
export async function applyAnpassung(clientId, specialtyKey, p = {}) {
  const aktion = String(p.aktion || "").trim();
  const besuchsgrund = String(p.besuchsgrund || "").trim();
  const feldWort = String(p.feld || "").trim();
  if (!aktion || !feldWort) {
    return { ok: false, message: "Mir fehlt, WAS ich kuenftig anders abfragen soll (welches Feld, welche Aktion)." };
  }

  const ktx = regelKontext(specialtyKey, besuchsgrund);
  const profil = await getLernProfil(clientId, specialtyKey);
  const anpassungen = [...profil.anpassungen];
  const vorschlaege = { ...profil.vorschlaege };

  const scope = ktx.regelId;
  const scopeLabel = besuchsgrund || ktx.regelLabel;

  if (aktion === "frag_nicht_mehr") {
    // Ziel-Felder bestimmen: Basisfelder ODER bereits gelernte Ergaenzungen —
    // "Roentgen" trifft die ganze Roentgen-Gruppe (Region/Indikation/Befund).
    const gelernte = anpassungen
      .filter((x) => x.art === "ergaenzen" && x.regelId === scope)
      .map((x) => ({ key: x.feldKey, frage: x.frage }));
    const ziele = findeFelder([...ktx.basisFelder, ...gelernte], feldWort);
    const feldKeys = ziele.length ? ziele.map((z) => z.key) : [slug(feldWort)];

    for (const feldKey of feldKeys) {
      // Falls es eine gelernte Ergaenzung war: die einfach wieder entfernen —
      // sauberer, als sie zusaetzlich zu unterdruecken.
      const ergIdx = anpassungen.findIndex((x) => x.art === "ergaenzen" && x.regelId === scope && x.feldKey === feldKey);
      if (ergIdx >= 0) anpassungen.splice(ergIdx, 1);

      if (!anpassungen.some((x) => x.art === "unterdruecken" && x.regelId === scope && x.feldKey === feldKey)) {
        anpassungen.push({
          id: randomUUID(), art: "unterdruecken", regelId: scope, regelLabel: ktx.regelLabel,
          besuchsgrund, feldKey, feldWort,
          quelle: "voice", original: String(p.original || "").slice(0, 300),
          by: String(p.by || "chef"), ts: Date.now(),
        });
      }
      // Auto-Vorschlaege zu diesem Feld nie wieder bringen.
      vorschlaege[`${scope}:${feldKey}`] = { status: "abgelehnt", ts: Date.now() };
    }

    await speichern(clientId, specialtyKey, { anpassungen, vorschlaege });
    return {
      ok: true, regelId: scope,
      message: `Verstanden — ich frage bei ${scopeLabel} nicht mehr nach ${feldWort}. Gilt ab sofort, auch für künftige Termine.`,
    };
  }

  if (aktion === "frag_auch") {
    const frage = String(p.frage || "").trim() || `${feldWort}?`;
    const feldKey = slug(feldWort);
    // Eine fruehere Unterdrueckung desselben Felds aufheben.
    const suppIdx = anpassungen.findIndex((x) => x.art === "unterdruecken" && x.regelId === scope
      && (x.feldKey === feldKey || norm(x.feldWort || "") === norm(feldWort)));
    if (suppIdx >= 0) anpassungen.splice(suppIdx, 1);

    const schon = anpassungen.find((x) => x.art === "ergaenzen" && x.regelId === scope && x.feldKey === feldKey);
    if (schon) {
      schon.frage = frage;
      schon.pflicht = p.pflicht !== false;
    } else {
      anpassungen.push({
        id: randomUUID(), art: "ergaenzen", regelId: scope, regelLabel: ktx.regelLabel,
        besuchsgrund, feldKey, frage, pflicht: p.pflicht !== false,
        quelle: "voice", original: String(p.original || "").slice(0, 300),
        by: String(p.by || "chef"), ts: Date.now(),
      });
    }
    vorschlaege[`${scope}:${feldKey}`] = { status: "angenommen", ts: Date.now() };

    await speichern(clientId, specialtyKey, { anpassungen, vorschlaege });
    return {
      ok: true, regelId: scope,
      message: `Gemerkt — bei ${scopeLabel} frage ich kuenftig auch: ${frage}`,
    };
  }

  if (aktion === "frag_wieder") {
    const vorher = anpassungen.length;
    const b = norm(feldWort);
    const gruppe = FELD_GRUPPEN.find((g) => g.erkennt.test(feldWort));
    const rest = anpassungen.filter((x) => !(x.art === "unterdruecken" && x.regelId === scope
      && (norm(x.feldKey).includes(b) || b.includes(norm(x.feldKey)) || norm(x.feldWort || "").includes(b)
        || (gruppe && gruppe.keys.includes(x.feldKey)))));
    if (rest.length === vorher) {
      return { ok: true, regelId: scope, message: `Da war bei ${scopeLabel} nichts unterdrueckt — ich frage ohnehin danach.` };
    }
    await speichern(clientId, specialtyKey, { anpassungen: rest, vorschlaege });
    return { ok: true, regelId: scope, message: `In Ordnung — ich frage bei ${scopeLabel} wieder nach ${feldWort}.` };
  }

  return { ok: false, message: `Unbekannte Aktion "${aktion}" — ich kenne: frag_nicht_mehr, frag_auch, frag_wieder.` };
}

async function speichern(clientId, specialtyKey, patch) {
  await docRef(clientId, specialtyKey).set({
    specialtyKey,
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  invalidate(clientId, specialtyKey);
}

/**
 * EFFEKTIVE Doku-Anforderungen = Basis-Katalog +/− Lern-Profil.
 * Liefert zusaetzlich die pro Regel unterdrueckten Keys (auch fuer die
 * Querschnitt-Felder relevant) und die gelernten Zusatzfelder.
 */
export async function effektiveAnforderungen(clientId, specialtyKey, motiveName) {
  const basis = dokuAnforderungen(specialtyKey, motiveName);
  const profil = await getLernProfil(clientId, specialtyKey);
  const regelId = basis.regel?.id || "__geruest__";

  const unterdrueckt = new Set(
    profil.anpassungen
      .filter((x) => x.art === "unterdruecken" && x.regelId === regelId)
      .map((x) => x.feldKey),
  );
  const gelernt = profil.anpassungen
    .filter((x) => x.art === "ergaenzen" && x.regelId === regelId)
    .map((x) => ({ key: x.feldKey, pflicht: x.pflicht !== false, frage: x.frage, gelernt: true }));

  const basisFelder = (basis.regel?.felder || []).filter((f) => !unterdrueckt.has(f.key));
  const felder = [...basisFelder];
  for (const g of gelernt) {
    if (!felder.some((f) => f.key === g.key)) felder.push(g);
  }

  return { ...basis, regelId, felder, unterdrueckt, gelernt, profil };
}

/**
 * Beobachtungen zaehlen: Info-Arten, die der Chef beim Diktieren nennt, die
 * aber KEIN Katalogfeld sind. Ab BEOBACHTUNG_SCHWELLE gibt es (einmalig) einen
 * Vorschlag, daraus eine feste Rueckfrage zu machen.
 *
 * @returns {Promise<{vorschlag:null|{feldKey:string, anzahl:number}}>}
 */
export async function notiereBeobachtungen(clientId, specialtyKey, regelId, zusatzKeys = []) {
  const keys = [...new Set((zusatzKeys || []).map(slug).filter(Boolean))].slice(0, 6);
  if (!keys.length) return { vorschlag: null };
  try {
    const profil = await getLernProfil(clientId, specialtyKey);
    const beobachtungen = { ...profil.beobachtungen };
    const vorschlaege = { ...profil.vorschlaege };
    const proRegel = { ...(beobachtungen[regelId] || {}) };
    let vorschlag = null;
    for (const k of keys) {
      proRegel[k] = (Number(proRegel[k]) || 0) + 1;
      const vKey = `${regelId}:${k}`;
      const status = vorschlaege[vKey]?.status || "offen";
      if (!vorschlag && status === "offen" && proRegel[k] >= BEOBACHTUNG_SCHWELLE) {
        vorschlag = { feldKey: k, anzahl: proRegel[k] };
        vorschlaege[vKey] = { status: "vorgeschlagen", ts: Date.now() };
      }
    }
    beobachtungen[regelId] = proRegel;
    await speichern(clientId, specialtyKey, { beobachtungen, vorschlaege });
    return { vorschlag };
  } catch {
    return { vorschlag: null };
  }
}
