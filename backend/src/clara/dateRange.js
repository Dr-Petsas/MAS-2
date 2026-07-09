// Deterministischer Parser fuer gesprochene DEUTSCHE Zeitraum-Angaben ->
// { from, to } als ISO-Tage (YYYY-MM-DD). Bewusst OHNE LLM: ein 4B/35B-Modell
// rechnet Quartals-/Monatsgrenzen unzuverlaessig. Clara gibt die gesprochene
// Phrase nur WOERTLICH weiter (Tool-Parameter `range`), die Aufloesung passiert
// hier - eine testbare Quelle der Wahrheit, keine erfundenen Grenzen.
//
// Unterstuetzt: Woche / Monat / Quartal / Jahr (diese[r]/letzte[r]/vorletzte/
// naechste), "letzte|naechste N Tage|Wochen|Monate" und Jahreszeiten
// (Fruehling/Sommer/Herbst/Winter). Einzeltage (heute/morgen/gestern) sind
// KEINE Zeitraeume und werden hier bewusst NICHT behandelt - dafuer bleibt der
// bestehende Ein-Tag-Pfad (`date`) zustaendig.

const NUM_WORDS = {
  ein: 1, eine: 1, einen: 1, einer: 1,
  zwei: 2, drei: 3, vier: 4, fuenf: 5, "fünf": 5, sechs: 6, sieben: 7,
  acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12, "zwölf": 12,
};

function toInt(tok) {
  const t = String(tok || "").trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return NUM_WORDS[t] || null;
}

// --- reine YMD-Arithmetik (UTC-Mittag, damit keine Zeitzonen-Drift) ----------

function ymd(y, m, d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}`;
}

function parts(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return { y, m, d };
}

function daysInMonth(y, m) {
  // m: 1-12. Tag 0 des Folgemonats = letzter Tag von m.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(dateStr, n) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function addMonths(dateStr, n) {
  const { y, m, d } = parts(dateStr);
  let total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return ymd(ny, nm, nd);
}

// 0 = Montag ... 6 = Sonntag
function weekdayMon0(dateStr) {
  const wd = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0=So..6=Sa
  return (wd + 6) % 7;
}

function mondayOf(dateStr) {
  return addDays(dateStr, -weekdayMon0(dateStr));
}

function monthRange(y, m) {
  return { from: ymd(y, m, 1), to: ymd(y, m, daysInMonth(y, m)) };
}

function quarterRange(y, qIndex0) {
  // qIndex0: 0..3. Ueberlaeufe auf Vor-/Folgejahr abfangen.
  let yy = y;
  let q = qIndex0;
  if (q < 0) { q += 4; yy -= 1; }
  if (q > 3) { q -= 4; yy += 1; }
  const startMonth = q * 3 + 1;
  const endMonth = startMonth + 2;
  return { from: ymd(yy, startMonth, 1), to: ymd(yy, endMonth, daysInMonth(yy, endMonth)) };
}

// Jahreszeiten (meteorologisch): auf das laufende Kalenderjahr bezogen.
function seasonRange(y, key) {
  switch (key) {
    case "fruehling":
    case "fruehjahr":
      return { from: ymd(y, 3, 1), to: ymd(y, 5, 31) };
    case "sommer":
      return { from: ymd(y, 6, 1), to: ymd(y, 8, 31) };
    case "herbst":
      return { from: ymd(y, 9, 1), to: ymd(y, 11, 30) };
    case "winter":
      // Dez laeuft ins Folgejahr (Dez-Feb).
      return { from: ymd(y, 12, 1), to: ymd(y + 1, 2, daysInMonth(y + 1, 2)) };
    default:
      return null;
  }
}

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

/**
 * Loest eine gesprochene Zeitraum-Angabe in { from, to, label } auf.
 * @param {string} phrase gesprochene Angabe ("letzte Woche", "naechsten Monat", "im Sommer", ...)
 * @param {string} today  Bezugstag als ISO (YYYY-MM-DD), i.d.R. todayBerlin()
 * @returns {{from:string,to:string,label:string}|null} null, wenn kein Zeitraum erkannt wurde
 */
export function resolveDateRange(phrase, today) {
  const t = norm(phrase);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return null;
  const { y, m } = parts(today);

  // 1) "letzte|naechste N Tage|Wochen|Monate" (rollierendes Fenster ab heute).
  const nUnit = t.match(
    /\b(letzte[nr]?|vergangene[nr]?|n(?:ä|ae)chste[nr]?|kommende[nr]?)\s+(\d+|ein|eine|einen|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf)\s+(tage[n]?|wochen|monate[n]?)\b/,
  );
  if (nUnit) {
    const back = /^(letzte|vergangene)/.test(nUnit[1]);
    const n = toInt(nUnit[2]);
    const unit = nUnit[3];
    if (n && n > 0) {
      if (/tage/.test(unit)) {
        return back
          ? { from: addDays(today, -(n - 1)), to: today, label: `letzte ${n} Tage` }
          : { from: today, to: addDays(today, n - 1), label: `nächste ${n} Tage` };
      }
      if (/wochen/.test(unit)) {
        return back
          ? { from: addDays(today, -(n * 7 - 1)), to: today, label: `letzte ${n} Wochen` }
          : { from: today, to: addDays(today, n * 7 - 1), label: `nächste ${n} Wochen` };
      }
      // Monate: rollierendes Monatsfenster ab heute.
      return back
        ? { from: addDays(addMonths(today, -n), 1), to: today, label: `letzte ${n} Monate` }
        : { from: today, to: addMonths(today, n), label: `nächste ${n} Monate` };
    }
  }

  // 2) Woche.
  if (/\bvorletzte[nr]?\s+woche\b/.test(t)) {
    const mon = addDays(mondayOf(today), -14);
    return { from: mon, to: addDays(mon, 6), label: "vorletzte Woche" };
  }
  if (/\b(letzte[nr]?|vergangene[nr]?|vorige[nr]?)\s+woche\b/.test(t)) {
    const mon = addDays(mondayOf(today), -7);
    return { from: mon, to: addDays(mon, 6), label: "letzte Woche" };
  }
  if (/\b(n(?:ä|ae)chste[nr]?|kommende[nr]?)\s+woche\b/.test(t)) {
    const mon = addDays(mondayOf(today), 7);
    return { from: mon, to: addDays(mon, 6), label: "nächste Woche" };
  }
  if (/\b(diese[nr]?|dieser|laufende[nr]?)\s+woche\b/.test(t)) {
    const mon = mondayOf(today);
    return { from: mon, to: addDays(mon, 6), label: "diese Woche" };
  }

  // 3) Monat.
  if (/\b(letzte[nrs]?|vergangene[nrs]?|vorige[nrs]?)\s+monat\b/.test(t)) {
    const r = monthRange(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
    return { ...r, label: "letzter Monat" };
  }
  if (/\b(n(?:ä|ae)chste[nrs]?|kommende[nrs]?)\s+monat\b/.test(t)) {
    const r = monthRange(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
    return { ...r, label: "nächster Monat" };
  }
  if (/\b(diese[nrs]?|dieser|laufende[nrs]?)\s+monat\b/.test(t)) {
    return { ...monthRange(y, m), label: "dieser Monat" };
  }

  // 4) Quartal.
  const curQ = Math.floor((m - 1) / 3); // 0..3
  if (/\b(letzte[nrs]?|vergangene[nrs]?)\s+quartal\b/.test(t)) {
    return { ...quarterRange(y, curQ - 1), label: "letztes Quartal" };
  }
  if (/\b(n(?:ä|ae)chste[nrs]?|kommende[nrs]?)\s+quartal\b/.test(t)) {
    return { ...quarterRange(y, curQ + 1), label: "nächstes Quartal" };
  }
  if (/\b(diese[nrs]?|dieser|laufende[nrs]?)\s+quartal\b/.test(t)) {
    return { ...quarterRange(y, curQ), label: "dieses Quartal" };
  }

  // 5) Jahr.
  if (/\b(letzte[nrs]?|vergangene[nrs]?|vorige[nrs]?)\s+jahr\b/.test(t)) {
    return { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31), label: "letztes Jahr" };
  }
  if (/\b(n(?:ä|ae)chste[nrs]?|kommende[nrs]?)\s+jahr\b/.test(t)) {
    return { from: ymd(y + 1, 1, 1), to: ymd(y + 1, 12, 31), label: "nächstes Jahr" };
  }
  if (/\b(diese[nrs]?|dieser|laufende[nrs]?)\s+jahr\b/.test(t)) {
    return { from: ymd(y, 1, 1), to: ymd(y, 12, 31), label: "dieses Jahr" };
  }

  // 6) Jahreszeit ("im Sommer", "nächsten Winter" -> laufendes Kalenderjahr).
  const season = t.match(/\b(fr(?:ü|ue)hling|fr(?:ü|ue)hjahr|sommer|herbst|winter)\b/);
  if (season) {
    const key = season[1].replace("ü", "ue");
    const r = seasonRange(y, key.startsWith("fruehj") ? "fruehjahr" : (key.startsWith("frueh") ? "fruehling" : key));
    if (r) return { ...r, label: season[1] };
  }

  return null;
}
