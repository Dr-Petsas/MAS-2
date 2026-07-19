/**
 * Lena 01 · Befund-Tabs + Legenden (Konzept struktur01, Design Studio-Warm).
 * Kanonische Listen, Icon-Zeichnung, Tab-Sichtbarkeit.
 */
(function (global) {
  "use strict";

  const TABS = [
    { id: "general", label: "Allgemein", title: "Allgemeine orale Befunde" },
    { id: "Pro", label: "Pro", title: "Prophylaxe" },
    { id: "Kons", label: "Kons", title: "Konservierende Befunde" },
    { id: "Chir", label: "Chir", title: "Chirurgische Befunde" },
    { id: "ZE", label: "ZE", title: "Zahnersatz" },
    { id: "Par", label: "Par", title: "Parodontale Befunde" },
    { id: "KB", label: "KB", title: "Kiefer- und Funktionsbefunde" },
    { id: "IMP", label: "IMP", title: "Implantologie" },
    { id: "KFO", label: "KFO", title: "Kieferorthopädische Befunde" },
    { id: "Schleimhaeute", label: "Schleimhäute", title: "Schleimhaut" },
  ];

  /** @type {Record<string, {id:string,label:string,icon:string,arch?:string}[]>} */
  const LEGENDS = {
    general: [
      { id: "zahn_fehlt", label: "Zahn fehlt", icon: "tooth-missing" },
      { id: "zahn_zerstoert", label: "Zahn zerstört", icon: "tooth-destroyed" },
      { id: "lueckenschluss", label: "Lückenschluss", icon: "space-closure" },
      { id: "milchzahn", label: "Milchzahn", icon: "primary-tooth" },
      { id: "versiegelung", label: "Versiegelung", icon: "sealant" },
      { id: "sensibilitaet", label: "Sensibilität", icon: "sensitivity" },
      { id: "perk_plus", label: "perk +", icon: "perk-plus" },
      { id: "alle_fehlend_ok", label: "alle fehlend OK", icon: "all-missing", arch: "ok" },
      { id: "alle_fehlend_uk", label: "alle fehlend UK", icon: "all-missing", arch: "uk" },
    ],
    Pro: [
      { id: "plaque", label: "Plaque", icon: "plaque" },
      { id: "zahnstein", label: "Zahnstein", icon: "calculus" },
      { id: "konkremente", label: "Konkremente", icon: "concrements" },
      { id: "verfaerbung", label: "Verfärbungen", icon: "discoloration" },
    ],
    Kons: [
      { id: "fuellung", label: "Füllung", icon: "filling" },
      { id: "insuffizient", label: "insuffiziente Füllung", icon: "insufficient-filling" },
      { id: "karies", label: "Karies", icon: "caries" },
      { id: "wurzelfuellung", label: "Wurzelfüllung", icon: "root-filling" },
      { id: "i_wurzelfuellung", label: "insuffiziente Wurzelfüllung", icon: "root-insufficient" },
      { id: "wurzelstift", label: "Wurzelstift", icon: "root-post" },
      { id: "keildefekt", label: "keilförmiger Defekt", icon: "wedge-defect" },
      { id: "schmelzfraktur", label: "Schmelzfraktur", icon: "enamel-fracture" },
    ],
    Chir: [
      { id: "cap", label: "apikale Aufhellung (CAP)", icon: "apical-lesion" },
      { id: "wsr", label: "Wurzelspitzenresektion", icon: "apicoectomy" },
      { id: "wurzelrest", label: "Wurzelrest", icon: "root-rest" },
      { id: "fraktur", label: "frakturierter Zahn", icon: "tooth-fracture" },
      { id: "retiniert", label: "retinierter Zahn", icon: "tooth-retained" },
      { id: "impaktiert", label: "impaktierter Zahn", icon: "tooth-impacted" },
      { id: "verlagert", label: "verlagert", icon: "tooth-displaced" },
      { id: "luxation", label: "Zahnluxation", icon: "luxation" },
    ],
    Par: [
      { id: "gingivitis", label: "Gingivitis", icon: "inflammation" },
      { id: "bop", label: "Blutung auf Sondieren (BOP)", icon: "bop" },
      { id: "furkation", label: "Furkationsbefall", icon: "furcation" },
      { id: "periimplantitis", label: "Periimplantitis", icon: "periimplantitis" },
      { id: "lockerung", label: "Lockerungsgrad", icon: "mobility" },
    ],
    ZE: [
      { id: "krone", label: "Krone", icon: "crown" },
      { id: "brueckenglied", label: "Brückenglied", icon: "pontic" },
      { id: "veneer", label: "Veneer", icon: "partial-crown" },
      { id: "teilkrone", label: "Teilkrone", icon: "partial-crown" },
      { id: "teleskop", label: "Teleskopkrone", icon: "telescopic-crown" },
      { id: "ze_insuffizient", label: "insuffizient", icon: "insufficient" },
      { id: "prothesenzahn", label: "Prothesenzahn", icon: "tooth-replaced" },
      { id: "klammer", label: "Klammer", icon: "clasp" },
      { id: "geschiebe", label: "Geschiebe", icon: "attachment" },
      { id: "steg", label: "Steg", icon: "bar" },
      { id: "goldinlay", label: "Goldinlay", icon: "gold-inlay" },
      { id: "keramikinlay", label: "Keramikinlay", icon: "ceramic-inlay" },
      { id: "alle_ersetzt_ok", label: "alle ersetzt OK", icon: "tooth-replaced", arch: "ok" },
      { id: "alle_ersetzt_uk", label: "alle ersetzt UK", icon: "tooth-replaced", arch: "uk" },
      { id: "verblockung", label: "Verblockung", icon: "splint" },
    ],
    IMP: [
      { id: "implantat", label: "Implantat", icon: "implant" },
      { id: "imp_lockerung", label: "Lockerung Implantat", icon: "implant-loosening" },
      { id: "imp_fraktur", label: "Implantatfraktur", icon: "implant-fracture" },
    ],
    KB: [
      { id: "abrasion", label: "Abrasion", icon: "abrasion" },
      { id: "schienung", label: "direkte Schienung", icon: "direct-splint" },
      { id: "kg_knacken", label: "KG - Knacken", icon: "tmj" },
      { id: "kg_schmerz", label: "KG - Schmerz", icon: "tmj" },
    ],
    KFO: [
      { id: "brackets", label: "brackets", icon: "brackets" },
      { id: "retainer", label: "retainer", icon: "retainer" },
      { id: "band", label: "band", icon: "band" },
      { id: "engstand", label: "Engstand", icon: "crowding" },
      { id: "lueckenstand", label: "Lückenstand", icon: "spacing" },
      { id: "rotation", label: "Rotation", icon: "rotation" },
      { id: "distalbiss", label: "Distalbiss", icon: "bite" },
      { id: "mesialbiss", label: "Mesialbiss", icon: "bite" },
      { id: "kreuzbiss", label: "Kreuzbiss", icon: "bite" },
      { id: "offener_biss", label: "offener Biss", icon: "bite" },
      { id: "tiefbiss", label: "Tiefbiss", icon: "bite" },
      { id: "deckbiss", label: "Deckbiss", icon: "bite" },
      { id: "kieferrelation", label: "Kieferrelation", icon: "jaw-relation" },
      { id: "dysgnathie", label: "skelettale Dysgnathie", icon: "jaw-relation" },
    ],
    Schleimhaeute: [
      { id: "leukoplakie", label: "Leukoplakie", icon: "mucosa-lesion" },
      { id: "erythroplakie", label: "Erythroplakie", icon: "mucosa-lesion" },
      { id: "ulcus", label: "Ulcus", icon: "mucosa-lesion" },
      { id: "aphthen", label: "Aphthen", icon: "mucosa-lesion" },
      { id: "hyperplasie", label: "Hyperplasie", icon: "soft-tissue" },
      { id: "fibrom", label: "Fibrom", icon: "soft-tissue" },
      { id: "papillom", label: "Papillom", icon: "soft-tissue" },
      { id: "abszess", label: "Abszess", icon: "abscess" },
      { id: "fistel", label: "Fistel", icon: "fistula" },
      { id: "tumorverdacht", label: "Tumorverdacht", icon: "alert" },
    ],
  };

  /** Welche Overlay-Gruppe ein Finding auf dem Schema steuert (Tab-Sichtbarkeit). */
  const FINDING_TAB = {};
  Object.keys(LEGENDS).forEach((tab) => {
    LEGENDS[tab].forEach((it) => { FINDING_TAB[it.id] = tab; });
  });

  const ICON_TOOTH =
    "M20 10 C27 5 37 5 44 10 C50 14 52 21 50 29 C48 38 44 47 39 53 " +
    "C35 57 29 57 25 53 C20 47 16 38 14 29 C12 21 14 14 20 10 Z";

  function toothBase(uid) {
    return `<defs>
      <linearGradient id="${uid}-c" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fffdf4"/><stop offset=".55" stop-color="#efd9b8"/>
        <stop offset="1" stop-color="#c99a68"/></linearGradient>
      <linearGradient id="${uid}-cw" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#f7f4ee"/>
        <stop offset="1" stop-color="#e8dcc8"/></linearGradient>
    </defs>
    <path d="${ICON_TOOTH}" fill="url(#${uid}-c)" stroke="rgba(62,36,22,.65)" stroke-width="1.6"/>
    <ellipse cx="26" cy="20" rx="7" ry="10" fill="rgba(255,255,255,.45)" transform="rotate(-18 26 20)"/>`;
  }

  function iconSvg(kind) {
    const uid = "lg-" + kind.replace(/[^a-z0-9]+/gi, "");
    const base = toothBase(uid);
    const parts = {
      plaque: `${base}
        <path d="M14 30 C20 26 26 34 32 30 S44 26 50 31 L50 40 C43 45 36 41 30 44 S18 44 14 39 Z"
          fill="rgba(20,95,220,.55)" stroke="rgba(15,80,200,.85)" stroke-width="1.2"/>`,
      calculus: `${base}
        <path d="M12 32 C18 28 24 35 30 31 S44 28 52 33 L51 43 C44 50 36 44 30 48 S18 48 13 41 Z"
          fill="#ffe24a" stroke="rgba(210,160,30,.85)" stroke-width="1.3"/>`,
      concrements: `${base}
        <path d="M13 38 C18 35 24 40 30 37 S44 35 51 39 L50 44 C44 48 36 44 30 46 S18 48 13 43 Z"
          fill="#1c120a" stroke="rgba(10,6,2,.85)" stroke-width="1.1"/>
        <path d="M14 34 C20 30 28 36 34 32 S46 30 50 35" fill="none" stroke="rgba(200,40,55,.55)" stroke-width="3" stroke-linecap="round"/>`,
      discoloration: `${base}
        <circle cx="16" cy="28" r="1.6" fill="rgba(70,38,14,.7)"/><circle cx="48" cy="29" r="1.5" fill="rgba(70,38,14,.7)"/>
        <circle cx="22" cy="31" r=".8" fill="rgba(255,220,160,.75)"/><circle cx="42" cy="32" r=".75" fill="rgba(255,220,160,.75)"/>`,
      crown: `
        <defs>
          <linearGradient id="${uid}-pw" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f7f4ee"/>
            <stop offset="1" stop-color="#e8e2d8"/></linearGradient>
        </defs>
        <path d="${ICON_TOOTH}" fill="url(#${uid}-pw)" stroke="rgba(170,195,220,.75)" stroke-width="1.6"/>
        <ellipse cx="26" cy="20" rx="8" ry="11" fill="rgba(255,255,255,.85)" transform="rotate(-16 26 20)"/>`,
      implant: `
        <path d="M22 18 L42 18 L44 22 L40 50 L24 50 L20 22 Z" fill="#e2e8f0" stroke="#64748b" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M30 20 L31.5 48 L35.5 48 L34 20 Z" fill="#f8fafc" opacity=".95"/>
        <ellipse cx="32" cy="22" rx="10" ry="3.2" fill="none" stroke="#64748b" stroke-width="1.5"/>
        <ellipse cx="32" cy="30" rx="11.5" ry="3.6" fill="none" stroke="#64748b" stroke-width="1.7"/>
        <ellipse cx="32" cy="38" rx="12" ry="3.8" fill="none" stroke="#64748b" stroke-width="2"/>
        <ellipse cx="32" cy="46" rx="11" ry="3.2" fill="none" stroke="#64748b" stroke-width="1.5"/>
        <ellipse cx="32" cy="16" rx="6" ry="2.4" fill="#f8fafc" stroke="#64748b" stroke-width="1.2"/>`,
      filling: `${base}<rect x="24" y="22" width="16" height="12" rx="3" fill="#7eb6f0" stroke="#3b6fa8" stroke-width="1.2"/>`,
      caries: `${base}<ellipse cx="34" cy="28" rx="7" ry="5" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.2"/>`,
      "insufficient-filling": `${base}<rect x="24" y="22" width="16" height="12" rx="3" fill="#7eb6f0" stroke="#dc2626" stroke-width="2.2"/>`,
      insufficient: `${base}<path d="M22 24 L42 40 M42 24 L22 40" stroke="#e07a30" stroke-width="2.4" stroke-linecap="round"/>`,
      "root-filling": `${base}<path d="M26 38 C27 47 30 56 32 56 C34 56 37 47 38 38 C36 40 28 40 26 38 Z" fill="#5b8fd4" stroke="#3b6fa8" stroke-width="1"/>`,
      "root-insufficient": `${base}<path d="M26 38 C26.6 43 28 48 29 50 L35 50 C36 48 37.4 43 38 38 C36 40 28 40 26 38 Z" fill="#c45a4a" stroke="#a04838" stroke-width="1"/>`,
      "root-post": `${base}<path d="M26 38 C27 47 30 56 32 56 C34 56 37 47 38 38 C36 40 28 40 26 38 Z" fill="#5b8fd4" stroke="#3b6fa8" stroke-width="1"/>
        <path d="M31 48 L29.5 26 L34.5 26 L33 48 Z" fill="#b8c0c8" stroke="#6a7078" stroke-width="1"/>`,
      "wedge-defect": `${base}<ellipse cx="32" cy="40" rx="9" ry="3.6" fill="#70563c" stroke="#3f2f20" stroke-width="1.2"/>`,
      "enamel-fracture": `${base}<path d="M28 14 L36 22 L30 26 Z" fill="none" stroke="#c45a4a" stroke-width="1.8"/>`,
      "apical-lesion": `${base}<circle cx="32" cy="52" r="5" fill="rgba(196,90,74,.55)" stroke="#a04838" stroke-width="1.2"/>`,
      apicoectomy: `${base}<path d="M26 48 H38" stroke="#6b7fd4" stroke-width="2.2" stroke-linecap="round"/><path d="M32 34 V48" stroke="#c9a07a" stroke-width="2"/>`,
      "root-rest": `${base}<path d="M22 38 C28 50 36 50 42 38" fill="#c9a07a" stroke="#8a6a48" stroke-width="1.2"/>`,
      "tooth-fracture": `${base}<path d="M24 16 L40 40" stroke="#c45a4a" stroke-width="2.2"/><path d="M36 18 L28 36" stroke="#c45a4a" stroke-width="1.6"/>`,
      "tooth-retained": `${base}<path d="M20 44 H44" stroke="#6b7fd4" stroke-width="2"/><path d="${ICON_TOOTH}" fill="url(#${uid}-c)" opacity=".45" transform="translate(0,6)"/>`,
      "tooth-impacted": `${base}<path d="${ICON_TOOTH}" fill="url(#${uid}-c)" opacity=".5" transform="rotate(25 32 32)"/><circle cx="32" cy="32" r="14" fill="none" stroke="#6b7fd4" stroke-width="1.5" stroke-dasharray="3 2"/>`,
      "tooth-displaced": `${base}<path d="M18 30 H46" stroke="#6b7fd4" stroke-width="1.5" marker-end="url(#${uid}-a)"/>
        <defs><marker id="${uid}-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#6b7fd4"/></marker></defs>`,
      luxation: `${base}<path d="M32 12 V22 M28 16 L32 12 L36 16" stroke="#d4a024" stroke-width="2" fill="none"/>`,
      inflammation: `${base}<path d="M14 34 C22 28 28 38 34 32 S46 30 50 36 L50 42 C42 48 34 44 28 46 S18 48 14 42 Z" fill="rgba(200,48,58,.5)"/>`,
      bop: `${base}<circle cx="24" cy="30" r="2.2" fill="#c45a4a"/><circle cx="38" cy="34" r="1.8" fill="#c45a4a"/><circle cx="32" cy="26" r="1.4" fill="#e07060"/>`,
      furcation: `${base}<path d="M24 40 L32 48 L40 40" fill="none" stroke="#d4a024" stroke-width="2.2"/>`,
      periimplantitis: `${base}<circle cx="32" cy="40" r="8" fill="none" stroke="#9aa3ad" stroke-width="1.6"/>
        <circle cx="32" cy="40" r="4" fill="rgba(196,90,74,.55)"/>`,
      mobility: `${base}<text x="32" y="36" text-anchor="middle" font-size="16" font-family="Georgia,serif" fill="#d4a024" font-weight="700">II</text>`,
      pontic: `
        <defs>
          <linearGradient id="${uid}-pp" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#f5f2ec"/>
            <stop offset="1" stop-color="#e6e0d6"/></linearGradient>
        </defs>
        <path d="${ICON_TOOTH}" fill="url(#${uid}-pp)" stroke="rgba(170,195,220,.8)" stroke-width="1.6"/>
        <ellipse cx="26" cy="20" rx="7" ry="10" fill="rgba(255,255,255,.8)" transform="rotate(-14 26 20)"/>
        <text x="32" y="38" text-anchor="middle" font-size="12" font-weight="700" fill="rgba(140,160,185,.7)" font-family="Georgia,serif">B</text>`,
      "partial-crown": `${base}<path d="M18 18 C28 12 40 12 46 20 L44 34 C36 28 28 28 20 34 Z" fill="url(#${uid}-cw)" stroke="rgba(160,150,130,.6)" stroke-width="1.2"/>`,
      "telescopic-crown": `${base}<path d="${ICON_TOOTH}" fill="url(#${uid}-cw)" stroke="#b8a070" stroke-width="2"/>
        <path d="${ICON_TOOTH}" fill="none" stroke="#8a7848" stroke-width="1" transform="scale(.86) translate(5.2 5)"/>`,
      "tooth-replaced": `${base}<path d="${ICON_TOOTH}" fill="rgba(240,230,220,.7)" stroke="#c090a0" stroke-width="1.4"/>
        <text x="32" y="34" text-anchor="middle" font-size="11" fill="#a06070">P</text>`,
      clasp: `${base}<path d="M14 28 C8 36 12 48 22 50" fill="none" stroke="#c090a0" stroke-width="2.2"/>`,
      attachment: `${base}<rect x="40" y="24" width="8" height="14" rx="1.5" fill="#6b7fd4"/>`,
      bar: `${base}<rect x="16" y="36" width="32" height="4" rx="1.5" fill="#c090a0"/>`,
      "gold-inlay": `${base}<rect x="24" y="22" width="16" height="12" rx="3" fill="#e8c040" stroke="#b89020" stroke-width="1.2"/>`,
      "ceramic-inlay": `${base}<rect x="24" y="22" width="16" height="12" rx="3" fill="#e8d8c8" stroke="#b08968" stroke-width="1.2"/>`,
      splint: `${base}<path d="M14 30 H50 M14 36 H50" stroke="#c090a0" stroke-width="2"/>`,
      "direct-splint": `${base}<path d="M14 32 H50" stroke="#c090a0" stroke-width="3" stroke-linecap="round"/>`,
      "implant-loosening": `
        <path d="M22 22 L42 22 L44 26 L40 52 L24 52 L20 26 Z" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3 2"/>
        <g transform="translate(0 -6)">
          <path d="M22 22 L42 22 L44 26 L40 52 L24 52 L20 26 Z" fill="#e2e8f0" stroke="#64748b" stroke-width="1.4"/>
          <ellipse cx="32" cy="30" rx="11" ry="3.2" fill="none" stroke="#64748b" stroke-width="1.5"/>
          <ellipse cx="32" cy="40" rx="11.5" ry="3.4" fill="none" stroke="#64748b" stroke-width="1.7"/>
        </g>`,
      "implant-fracture": `
        <path d="M22 18 L42 18 L44 22 L40 50 L24 50 L20 22 Z" fill="#e2e8f0" stroke="#b91c1c" stroke-width="1.5"/>
        <ellipse cx="32" cy="28" rx="11" ry="3.2" fill="none" stroke="#64748b" stroke-width="1.4"/>
        <ellipse cx="32" cy="38" rx="11.5" ry="3.4" fill="none" stroke="#64748b" stroke-width="1.6"/>
        <path d="M20 34 l 6 3 5 -2 6 3.5 5 -2.5 6 3" fill="none" stroke="#b91c1c" stroke-width="2.2" stroke-linecap="round"/>`,
      abrasion: `${base}<path d="M20 18 C28 14 40 14 46 20 L42 24 C36 18 28 18 22 24 Z" fill="#c8c2b8"/>`,
      tmj: `${base}<circle cx="32" cy="32" r="12" fill="none" stroke="#d4a024" stroke-width="1.6"/>
        <path d="M26 30 Q32 38 38 30" fill="none" stroke="#d4a024" stroke-width="1.8"/>`,
      brackets: `${base}<rect x="22" y="26" width="6" height="8" rx="1" fill="#e8eef5" stroke="#6b8ab0"/>
        <rect x="36" y="26" width="6" height="8" rx="1" fill="#e8eef5" stroke="#6b8ab0"/>
        <path d="M28 30 H36" stroke="#c090a0" stroke-width="1.4"/>`,
      retainer: `${base}<path d="M18 34 H46" stroke="#5a9ec0" stroke-width="2" stroke-linecap="round"/>`,
      band: `${base}<ellipse cx="32" cy="30" rx="14" ry="8" fill="none" stroke="#8a9099" stroke-width="2.4"/>`,
      crowding: `${base}<path d="M18 28 L26 36 L34 28 L42 36 L50 28" fill="none" stroke="#c090a0" stroke-width="1.8"/>`,
      spacing: `${base}<path d="M20 32 H28 M36 32 H44" stroke="#c090a0" stroke-width="2.2" stroke-linecap="round"/>`,
      rotation: `${base}<path d="M32 18 A12 12 0 1 1 22 40" fill="none" stroke="#6b7fd4" stroke-width="1.8"/>
        <path d="M20 36 L22 42 L26 38" fill="none" stroke="#6b7fd4" stroke-width="1.6"/>`,
      bite: `${base}<path d="M16 28 H48 M20 36 H44" stroke="#d4a024" stroke-width="2"/>`,
      "jaw-relation": `${base}<path d="M16 24 H48 M16 40 H48" stroke="#8a9099" stroke-width="1.5"/>
        <path d="M32 20 V44" stroke="#6b7fd4" stroke-width="1.8"/>`,
      "mucosa-lesion": `${base}<ellipse cx="32" cy="34" rx="10" ry="6" fill="rgba(220,180,190,.55)" stroke="#c090a0"/>`,
      "soft-tissue": `${base}<ellipse cx="32" cy="34" rx="9" ry="7" fill="rgba(230,200,180,.5)" stroke="#b08070"/>`,
      abscess: `${base}<circle cx="38" cy="42" r="6" fill="rgba(196,90,74,.6)" stroke="#a04838"/>`,
      fistula: `${base}<path d="M38 30 Q48 36 42 48" fill="none" stroke="#c45a4a" stroke-width="2"/>`,
      alert: `${base}<path d="M32 16 L42 42 H22 Z" fill="#d4a024" stroke="#a07818" stroke-width="1.2"/>
        <circle cx="32" cy="36" r="1.4" fill="#1a1208"/><rect x="31" y="24" width="2" height="8" fill="#1a1208"/>`,
      "tooth-missing": `<path d="${ICON_TOOTH}" fill="none" stroke="rgba(140,140,150,.55)" stroke-width="1.6" stroke-dasharray="4 3"/>
        <path d="M22 22 L42 42 M42 22 L22 42" stroke="rgba(140,140,150,.7)" stroke-width="1.8"/>`,
      "tooth-destroyed": `${base}<path d="M20 20 L44 44 M44 20 L20 44" stroke="#c45a4a" stroke-width="2.4"/>`,
      "space-closure": `${base}<text x="32" y="40" text-anchor="middle" font-size="26"
          font-family="Georgia,serif" font-weight="700" fill="#8a99a9">)(</text>`,
      "primary-tooth": `${base}<text x="32" y="36" text-anchor="middle" font-size="14" fill="#d4a024" font-family="Georgia,serif">mz</text>`,
      sealant: `${base}<rect x="26" y="20" width="12" height="8" rx="2" fill="#ffffff" stroke="#94a3b8" stroke-width="1.2"/>`,
      sensitivity: `${base}<path d="M26 24 h12 M32 18 v12" stroke="#22a04a" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M26 42 h12" stroke="#c43a30" stroke-width="3.4" stroke-linecap="round"/>`,
      "perk-plus": `${base}<path d="M32 18 L44 40 H20 Z" fill="#d43a2f" stroke="#8f1d14" stroke-width="1.4" stroke-linejoin="round"/>
        <rect x="30.8" y="24" width="2.4" height="9" rx="1.2" fill="#fff"/><circle cx="32" cy="36.4" r="1.6" fill="#fff"/>`,
      "all-missing": `<path d="${ICON_TOOTH}" fill="none" stroke="rgba(140,140,150,.4)" stroke-width="1.4" transform="translate(-8,0)"/>
        <path d="${ICON_TOOTH}" fill="none" stroke="rgba(140,140,150,.4)" stroke-width="1.4"/>
        <path d="${ICON_TOOTH}" fill="none" stroke="rgba(140,140,150,.4)" stroke-width="1.4" transform="translate(8,0)"/>`,
    };
    const body = parts[kind] || `${base}<circle cx="32" cy="32" r="8" fill="rgba(180,180,190,.35)"/>`;
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
  }

  function itemsForTab(tabId) {
    return LEGENDS[tabId] || [];
  }

  function tabOfFinding(id) {
    return FINDING_TAB[id] || null;
  }

  /** struktur01-Runtime: Chart zeigt oft alles; hier waehlbar. Default: nur aktiver Tab. */
  function isFindingVisible(findingId, activeTab) {
    if (!activeTab || activeTab === "all") return true;
    const t = FINDING_TAB[findingId];
    if (!t) return true;
    // Implantate auch unter ZE sichtbar (wie struktur01-Gate)
    if (findingId === "implantat" || findingId === "imp_lockerung" || findingId === "imp_fraktur") {
      return activeTab === "IMP" || activeTab === "ZE";
    }
    return t === activeTab;
  }

  global.PerioLegend = {
    TABS,
    LEGENDS,
    FINDING_TAB,
    itemsForTab,
    tabOfFinding,
    isFindingVisible,
    iconSvg,
  };
})(typeof window !== "undefined" ? window : globalThis);
