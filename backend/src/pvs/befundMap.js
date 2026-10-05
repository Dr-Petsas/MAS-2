// Lena-01 → FDI-Schema → PVS-Zahngrafik.
// Eine kanonische Mitte, zwei Adapter (Dampsoft / DENS). Der Schreibweg
// (Holen, DENSimport, AppConnect) bleibt getrennt — hier nur die Kuerzel.
//
// HuK/eHKP: dieselben Festzuschuss-Kuerzel wie in Dampsoft `eHKPBefunde.txt`
// und in DENS (HuK → ZE-Plansymbol). Ein Zahn hat hoechstens EIN Primaer-HuK.
// Flaechen und Extra-Grafik (Fuellung, Plaque …) liegen daneben.

export const VENDORS = ["dampsoft", "dens"];

/** Offizielle eHKP-Kuerzel (Dampsoft DS\eHKPBefunde.txt, Stand Installation). */
export const HUK_CODES = [
  "a", "ab", "abw", "aw", "b", "bw", "e", "ew", "f", "ix", "k", "kw",
  "pw", "pkw", "r", "rw", "sb", "sbw", "se", "sew", "sk", "skw", "so",
  "sow", "st", "stw", "t", "t2w", "tw", "ur", "ww", "x", ")(",
];

const SURFACE_TO_CANON = {
  okklusal: "O",
  mesial: "M",
  distal: "D",
  vestibulaer: "V",
  lingual_palatinal: "L",
};

/** Dampsoft zeichnet Bukkal (B), DENS vestibulaer (V). */
const SURFACE_OUT = {
  dampsoft: { O: "O", M: "M", D: "D", V: "B", L: "L" },
  dens: { O: "O", M: "M", D: "D", V: "V", L: "L" },
};

const INCISAL = new Set([13, 12, 11, 21, 22, 23, 33, 32, 31, 41, 42, 43]);

/**
 * Lena-Finding → HuK und/oder Grafik-Kuerzel.
 * huk: string | { dampsoft, dens }
 * graphic: { dampsoft, dens }  — nur wenn das PVS das ausserhalb HuK kennt
 * surfaces: Finding sitzt auf MODVL-Flaechen
 */
export const FINDINGS = {
  zahn_fehlt: { huk: "f", label: "Zahn fehlt" },
  alle_fehlend_ok: { huk: "f", label: "alle fehlend OK", arch: "ok" },
  alle_fehlend_uk: { huk: "f", label: "alle fehlend UK", arch: "uk" },
  zahn_zerstoert: { huk: "x", label: "Zahn zerstört" },
  lueckenschluss: { huk: ")(", label: "Lückenschluss" },
  milchzahn: { graphic: { dampsoft: "mz", dens: "mz" }, label: "Milchzahn" },
  versiegelung: { graphic: { dampsoft: "vs", dens: "vs" }, surfaces: true, label: "Versiegelung" },
  sensibilitaet: { note: true, label: "Sensibilität" },
  perk_plus: { note: true, label: "perk +" },

  plaque: { graphic: { dampsoft: "pl", dens: "pl" }, label: "Plaque" },
  zahnstein: { graphic: { dampsoft: "zst", dens: "zst" }, label: "Zahnstein" },
  konkremente: { graphic: { dampsoft: "ko", dens: "ko" }, label: "Konkremente" },
  verfaerbung: { note: true, label: "Verfärbungen" },

  fuellung: { graphic: { dampsoft: "F", dens: "F" }, surfaces: true, label: "Füllung" },
  insuffizient: { graphic: { dampsoft: "Fi", dens: "Fi" }, surfaces: true, label: "insuffiziente Füllung" },
  karies: { huk: "k", surfaces: true, label: "Karies" },
  wurzelfuellung: { huk: "ww", label: "Wurzelfüllung" },
  i_wurzelfuellung: { huk: "ww", graphic: { dampsoft: "wwi", dens: "wwi" }, label: "insuffiziente Wurzelfüllung" },
  wurzelstift: { huk: "st", label: "Wurzelstift" },
  keildefekt: { graphic: { dampsoft: "kd", dens: "kd" }, surfaces: true, label: "keilförmiger Defekt" },
  schmelzfraktur: { graphic: { dampsoft: "sf", dens: "sf" }, label: "Schmelzfraktur" },

  cap: { note: true, label: "apikale Aufhellung (CAP)" },
  wsr: { note: true, label: "Wurzelspitzenresektion" },
  wurzelrest: { huk: "r", label: "Wurzelrest" },
  fraktur: { huk: "x", label: "frakturierter Zahn" },
  retiniert: { note: true, label: "retinierter Zahn" },
  impaktiert: { note: true, label: "impaktierter Zahn" },
  verlagert: { note: true, label: "verlagert" },
  luxation: { note: true, label: "Zahnluxation" },

  gingivitis: { note: true, label: "Gingivitis" },
  bop: { graphic: { dampsoft: "bop", dens: "bop" }, label: "BOP" },
  furkation: { graphic: { dampsoft: "fu", dens: "fu" }, label: "Furkation" },
  periimplantitis: { note: true, label: "Periimplantitis" },
  lockerung: { graphic: { dampsoft: "lg", dens: "lg" }, label: "Lockerungsgrad" },

  krone: { huk: "kw", label: "Krone" },
  brueckenglied: { huk: "e", label: "Brückenglied" },
  veneer: { graphic: { dampsoft: "ve", dens: "ve" }, label: "Veneer" },
  teilkrone: { huk: "kw", graphic: { dampsoft: "tk", dens: "tk" }, label: "Teilkrone" },
  teleskop: { huk: "tw", label: "Teleskopkrone" },
  ze_insuffizient: { graphic: { dampsoft: "zi", dens: "zi" }, label: "ZE insuffizient" },
  prothesenzahn: { huk: "e", label: "Prothesenzahn" },
  klammer: { graphic: { dampsoft: "kl", dens: "kl" }, label: "Klammer" },
  geschiebe: { graphic: { dampsoft: "gs", dens: "gs" }, label: "Geschiebe" },
  steg: { graphic: { dampsoft: "sg", dens: "sg" }, label: "Steg" },
  goldinlay: { graphic: { dampsoft: "ig", dens: "ig" }, surfaces: true, label: "Goldinlay" },
  keramikinlay: { graphic: { dampsoft: "ik", dens: "ik" }, surfaces: true, label: "Keramikinlay" },
  alle_ersetzt_ok: { huk: "e", label: "alle ersetzt OK", arch: "ok" },
  alle_ersetzt_uk: { huk: "e", label: "alle ersetzt UK", arch: "uk" },
  verblockung: { note: true, label: "Verblockung" },

  implantat: { huk: "ix", label: "Implantat" },
  imp_lockerung: { huk: "ix", graphic: { dampsoft: "ixl", dens: "ixl" }, label: "Lockerung Implantat" },
  imp_fraktur: { huk: "ix", graphic: { dampsoft: "ixf", dens: "ixf" }, label: "Implantatfraktur" },

  abrasion: { note: true, label: "Abrasion" },
  schienung: { note: true, label: "direkte Schienung" },
  kg_knacken: { note: true, label: "KG - Knacken" },
  kg_schmerz: { note: true, label: "KG - Schmerz" },

  brackets: { note: true, label: "brackets" },
  retainer: { note: true, label: "retainer" },
  band: { note: true, label: "band" },
  engstand: { note: true, label: "Engstand" },
  lueckenstand: { note: true, label: "Lückenstand" },
  rotation: { note: true, label: "Rotation" },
  distalbiss: { note: true, label: "Distalbiss" },
  mesialbiss: { note: true, label: "Mesialbiss" },
  kreuzbiss: { note: true, label: "Kreuzbiss" },
  offener_biss: { note: true, label: "offener Biss" },
  tiefbiss: { note: true, label: "Tiefbiss" },
  deckbiss: { note: true, label: "Deckbiss" },
  kieferrelation: { note: true, label: "Kieferrelation" },
  dysgnathie: { note: true, label: "skelettale Dysgnathie" },

  leukoplakie: { note: true, label: "Leukoplakie" },
  erythroplakie: { note: true, label: "Erythroplakie" },
  ulcus: { note: true, label: "Ulcus" },
  aphthen: { note: true, label: "Aphthen" },
  hyperplasie: { note: true, label: "Hyperplasie" },
  fibrom: { note: true, label: "Fibrom" },
  papillom: { note: true, label: "Papillom" },
  abszess: { note: true, label: "Abszess" },
  fistel: { note: true, label: "Fistel" },
  tumorverdacht: { note: true, label: "Tumorverdacht" },
};

/** Ein Primaer-HuK pro Zahn — Reihenfolge = Vorrang in der Zahngrafik. */
const HUK_PRIORITY = [
  "zahn_fehlt", "alle_fehlend_ok", "alle_fehlend_uk",
  "implantat", "imp_lockerung", "imp_fraktur",
  "brueckenglied", "prothesenzahn", "alle_ersetzt_ok", "alle_ersetzt_uk",
  "wurzelrest",
  "zahn_zerstoert", "fraktur",
  "teleskop", "krone", "teilkrone",
  "wurzelstift",
  "wurzelfuellung", "i_wurzelfuellung",
  "karies",
  "lueckenschluss",
];

function vendorOf(v) {
  const id = String(v || "").toLowerCase();
  if (id === "dens") return "dens";
  return "dampsoft";
}

function pickVendorValue(val, vendor) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  return val[vendor] || val.dampsoft || val.dens || "";
}

function surfaceLetters(fdi, canonKeys, vendor) {
  const map = SURFACE_OUT[vendor] || SURFACE_OUT.dampsoft;
  const out = [];
  const seen = new Set();
  (canonKeys || []).forEach((key) => {
    let letter = map[key] || key;
    if (key === "O" && INCISAL.has(Number(fdi))) letter = "I";
    if (!letter || seen.has(letter)) return;
    seen.add(letter);
    out.push(letter);
  });
  return out;
}

function markIds(tooth) {
  const ids = [];
  if (tooth.missing) ids.push("zahn_fehlt");
  const mark = tooth.mark || {};
  Object.keys(mark).forEach((id) => { if (mark[id]) ids.push(id); });
  (tooth.rootMarkers || []).forEach((id) => ids.push(id));
  const surfaces = tooth.surfaces || {};
  Object.keys(surfaces).forEach((surf) => {
    (surfaces[surf] || []).forEach((id) => ids.push(id));
  });
  return [...new Set(ids)];
}

function surfacesForFinding(tooth, findingId) {
  const keys = [];
  const surfaces = tooth.surfaces || {};
  Object.keys(SURFACE_TO_CANON).forEach((surf) => {
    if ((surfaces[surf] || []).includes(findingId)) keys.push(SURFACE_TO_CANON[surf]);
  });
  return keys;
}

export function fromTeethRaw(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return Object.keys(src).map((key) => {
    const fdi = Number(key);
    const t = src[key] || {};
    return {
      fdi,
      missing: !!t.missing,
      mark: t.mark || {},
      surfaces: t.surfaces || {},
      rootMarkers: Array.isArray(t.rootMarkers) ? t.rootMarkers : [],
      pocket: t.pocket || { m: 1, d: 1 },
      ids: markIds({ ...t, missing: !!t.missing }),
    };
  }).filter((t) => t.fdi).sort((a, b) => a.fdi - b.fdi);
}

function pickHuk(ids, vendor) {
  for (const id of HUK_PRIORITY) {
    if (!ids.includes(id)) continue;
    const spec = FINDINGS[id];
    if (!spec || !spec.huk) continue;
    return { id, huk: pickVendorValue(spec.huk, vendor) };
  }
  return { id: "", huk: "" };
}

export function mapTooth(tooth, vendor) {
  const v = vendorOf(vendor);
  const ids = tooth.ids || markIds(tooth);
  const primary = pickHuk(ids, v);
  const extras = [];
  const notes = [];
  let hukSurfaces = [];
  ids.forEach((id) => {
    if (id === primary.id) {
      const spec = FINDINGS[id] || {};
      if (spec.surfaces) hukSurfaces = surfaceLetters(tooth.fdi, surfacesForFinding(tooth, id), v);
      if (spec.graphic) {
        extras.push({
          kind: "graphic",
          code: pickVendorValue(spec.graphic, v),
          surfaces: spec.surfaces ? hukSurfaces.slice() : [],
          id,
        });
      }
      return;
    }
    const spec = FINDINGS[id];
    if (!spec) {
      notes.push(id);
      return;
    }
    if (spec.note && !spec.huk && !spec.graphic) {
      notes.push(spec.label || id);
      return;
    }
    if (spec.graphic) {
      extras.push({
        kind: "graphic",
        code: pickVendorValue(spec.graphic, v),
        surfaces: spec.surfaces ? surfaceLetters(tooth.fdi, surfacesForFinding(tooth, id), v) : [],
        id,
      });
    } else if (spec.huk && pickVendorValue(spec.huk, v) !== primary.huk) {
      extras.push({ kind: "huk", code: pickVendorValue(spec.huk, v), surfaces: [], id });
    } else if (spec.note) {
      notes.push(spec.label || id);
    }
  });
  const pocket = tooth.pocket || { m: 1, d: 1 };
  const pathoPocket = (Number(pocket.m) || 0) > 1 || (Number(pocket.d) || 0) > 1;
  return {
    fdi: tooth.fdi,
    vendor: v,
    huk: primary.huk,
    hukSurfaces,
    extras,
    notes,
    pocket: pathoPocket ? { m: Number(pocket.m) || 0, d: Number(pocket.d) || 0 } : null,
  };
}

export function mapTeeth(raw, vendor) {
  return fromTeethRaw(raw).map((t) => mapTooth(t, vendor)).filter((t) => (
    t.huk || t.extras.length || t.notes.length || t.pocket
  ));
}

function extraToken(ex) {
  const surf = (ex.surfaces || []).join("");
  return surf ? ex.code + surf : ex.code;
}

export function toothLine(mapped) {
  const bits = [];
  if (mapped.huk) bits.push(mapped.huk + (mapped.hukSurfaces || []).join(""));
  (mapped.extras || []).forEach((ex) => {
    const tok = extraToken(ex);
    if (tok && tok !== mapped.huk) bits.push(tok);
  });
  if (mapped.pocket) bits.push("ST" + mapped.pocket.m + "/" + mapped.pocket.d);
  (mapped.notes || []).forEach((n) => bits.push(n));
  return String(mapped.fdi) + ": " + bits.join(", ");
}

export function toSchemaText(raw, vendor, name) {
  const v = vendorOf(vendor);
  const rows = mapTeeth(raw, v);
  const title = v === "dens" ? "01-SCHEMA DENS" : "01-SCHEMA DAMPSOFT";
  const lines = [title];
  if (name) lines.push("Patient: " + String(name).trim());
  lines.push("");
  if (!rows.length) {
    lines.push("Kein pathologischer Zahnbefund erfasst.");
    return lines.join("\n");
  }
  rows.forEach((row) => lines.push(toothLine(row)));
  return lines.join("\n");
}

export function mapBoth(raw) {
  return {
    dampsoft: mapTeeth(raw, "dampsoft"),
    dens: mapTeeth(raw, "dens"),
  };
}
