// Behandlungsart einer abgerechneten Leistung aus ihrer Gebuehrennummer (Chef 27.11.2026): nicht aus dem Text.
// Die Texte im Leistungsverzeichnis nennen die Behandlung oft nicht beim Namen ("mehr als dreiflaechig",
// "Entfernen eines tieffrakturierten Zahnes"); die Nummer ist eindeutig.
//
// Drei Faelle je Zeile:
//   - Hauptleistung mit Behandlungsart (Fuellung, Extraktion, ...): zaehlt fuer den Abgleich und den gesprochenen Grund.
//   - Begleitleistung (Betaeubung, Roentgen, Vitalitaetspruefung): wird uebergangen.
//   - alles andere: keine Art. Es wird nichts geraten.
// Die Untersuchung (BEMA 01, GOZ 0010) wird uebergangen, wenn am selben Tag eine andere Hauptleistung steht.
//
// `kind` und `nr` kommen aus PlanR (/api/intern/pvs/leistungen): "bema" oder "goz", Nummer wie im
// Leistungsverzeichnis der Praxis ("01", "13d", "Ä925a", "2100mk").
const s = (v) => String(v ?? "").trim();

export const UNTERSUCHUNG = "untersuchung";
const BEGLEIT = { begleit: true, art: null };
const OHNE = { begleit: false, art: null };
const art = (a) => ({ begleit: false, art: a });
const zwischen = (n, von, bis) => n >= von && n <= bis;

// BEMA: Zahl vor dem Buchstaben ("13d" ist 13 mit d).
function bema(nr) {
  if (nr.startsWith("ä")) {
    const n = Number.parseInt(nr.slice(1), 10);
    return n === 925 || n === 928 || n === 934 || n === 935 ? BEGLEIT : OHNE; // Roentgen
  }
  if (["atg", "mhu", "ait", "aita", "aitb", "bev", "beva", "bevb", "cpt", "cpta", "cptb"].includes(nr)) return art("parodontitis");
  if (nr.startsWith("upt") && nr.length <= 4) return art("parodontitis");
  if (["p200", "p201", "p202", "p203"].includes(nr)) return art("parodontitis");
  if (nr.length === 2 && nr[0] === "k" && nr[1] >= "1" && nr[1] <= "9") return art("schiene");
  if (nr === "ip5") return art("versiegelung");
  if (["fu", "fu1", "fu1a", "fu1b", "fu1c", "fu2"].includes(nr)) return art(UNTERSUCHUNG);
  let ziffern = "";
  for (const z of nr) { if (z >= "0" && z <= "9") ziffern += z; else break; }
  if (!ziffern) return OHNE;
  const n = Number(ziffern);
  const zusatz = nr.slice(ziffern.length);
  if (zusatz.length > 1) return OHNE;
  if (n === 40 || n === 41 || n === 8) return BEGLEIT; // Betaeubung, Vitalitaetspruefung
  if (n === 1 && (zusatz === "" || zusatz === "k")) return art(UNTERSUCHUNG);
  if (n === 13) return art("fuellung");
  if ([27, 28, 29, 31, 32, 34, 35, 54].includes(n)) return art("wurzelbehandlung"); // 54: Wurzelspitzenresektion
  if ([43, 44, 45, 48].includes(n) || (n === 47 && zusatz === "a")) return art("extraktion");
  if ([18, 19, 20, 21, 22, 24].includes(n) || zwischen(n, 89, 104)) return art("zahnersatz");
  if (n === 108 || n === 111) return art("parodontitis");
  return OHNE;
}

// GOZ: die vier Ziffern am Anfang ("2100mk" ist 2100). Mit Ä davor: GOÄ.
function goz(nr) {
  if (nr.startsWith("ä")) {
    const n = Number.parseInt(nr.slice(1), 10);
    return zwischen(n, 5000, 5370) ? BEGLEIT : OHNE; // Roentgen
  }
  if (nr.length < 4 || [...nr.slice(0, 4)].some((z) => z < "0" || z > "9")) return OHNE;
  const n = Number(nr.slice(0, 4));
  if (n === 70 || n === 80 || n === 90 || n === 100) return BEGLEIT; // Vitalitaetspruefung, Betaeubung
  if (n === 10) return art(UNTERSUCHUNG);
  if (n === 1040) return art("zahnreinigung");
  if (n === 2000) return art("versiegelung");
  if (zwischen(n, 2050, 2120)) return art("fuellung");
  if (zwischen(n, 2200, 2220) || zwischen(n, 5000, 5340)) return art("zahnersatz");
  if (zwischen(n, 2350, 2440) || n === 3110 || n === 3120) return art("wurzelbehandlung");
  if (zwischen(n, 3000, 3045)) return art("extraktion");
  if (zwischen(n, 4070, 4150)) return art("parodontitis");
  if (zwischen(n, 7000, 7100)) return art("schiene");
  if (zwischen(n, 9000, 9170)) return art("implantat");
  return OHNE;
}

/** Pure: { art, begleit } einer Leistungszeile. art ist null, wenn die Nummer keiner Behandlungsart zugeordnet ist. */
export function leistungsart(kind, nr) {
  const k = s(kind).toLowerCase();
  const n = s(nr).toLowerCase().split(" ").join("");
  if (!n) return OHNE;
  if (k === "bema") return bema(n);
  if (k === "goz") return goz(n);
  return OHNE;
}

/**
 * Pure: die Hauptleistungen eines Behandlungstages. `arten`: ihre Behandlungsarten. `texte`: was genannt wird,
 * ohne Doppelte: die Hauptleistungen; gibt es keine, alles ausser Begleitleistungen; gibt es auch das nicht, alles.
 */
export function hauptleistungen(zeilen) {
  const alle = (Array.isArray(zeilen) ? zeilen : []).map((e) => ({ ...leistungsart(e?.kind, e?.nr), text: s(e?.text) }));
  let haupt = alle.filter((z) => z.art);
  if (haupt.some((z) => z.art !== UNTERSUCHUNG)) haupt = haupt.filter((z) => z.art !== UNTERSUCHUNG);
  const ohneBegleit = alle.filter((z) => !z.begleit);
  const genannt = haupt.length ? haupt : ohneBegleit.length ? ohneBegleit : alle;
  const texte = [];
  for (const z of genannt) if (z.text && !texte.some((t) => t.toLowerCase() === z.text.toLowerCase())) texte.push(z.text);
  return { arten: new Set(haupt.map((z) => z.art)), texte };
}