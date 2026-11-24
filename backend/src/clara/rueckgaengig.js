// "Nee, doch nicht" (06.10.2026): Clara nimmt ihre letzte Schreib-Aktion zurueck.
//
// Jedes Clara-Werkzeug, das etwas schreibt, haengt `undo` an seine Antwort.
// Clara haelt den Eintrag in der Gespraechs-Sitzung und schickt ihn mit
// undo_last_action zurueck — so trifft das Rueckgaengig immer die Aktion
// DIESES Gespraechs, auch wenn zwei Clara-Sitzungen derselben Praxis laufen.
// Verschickte SMS/Mails und Lisa-Anrufe sind raus: dafuer gibt es eine
// ehrliche Antwort statt einer Gegenaktion.
//
// Notaus: MAS_RUECKGAENGIG=0 => kein `undo`-Feld, der Endpunkt lehnt ab.

export const RUECKGAENGIG_MS = 15 * 60 * 1000;

const ARTEN = new Set(["termin", "termin_verschoben", "hkp", "hkp_aenderung", "planr_entwurf", "plan_ki", "plan_weg", "vorgang", "aufgabe", "endgueltig"]);

export function rueckgaengigAn() {
  return !/^(0|false|no|off)$/i.test(String(process.env.MAS_RUECKGAENGIG ?? "1").trim());
}

/** `{ undo: {...} }` zum Einstreuen in eine Werkzeug-Antwort, sonst `{}`. */
export function mitUndo(art, { id = "", label = "", vorher = "", alt = [], weitereEntwuerfe = [], weitereHkps = [] } = {}) {
  if (!rueckgaengigAn() || !ARTEN.has(art)) return {};
  const undo = { art, label: String(label || "").trim(), wann: Date.now() };
  if (id) undo.id = String(id);
  if (vorher) undo.vorher = String(vorher);
  if (Array.isArray(alt) && alt.length) undo.alt = alt.map(String);
  if (Array.isArray(weitereEntwuerfe) && weitereEntwuerfe.length) undo.weitereEntwuerfe = weitereEntwuerfe.map(String);
  if (Array.isArray(weitereHkps) && weitereHkps.length) undo.weitereHkps = weitereHkps.map(String);
  return { undo };
}

async function fallMitnehmen(clientId, u, d) {
  for (const id of u.weitereHkps || []) {
    try {
      const h = await d.hkpLesen(clientId, id);
      if (h?.status !== "wartet_auf_freigabe") continue;
      await d.hkpAktualisieren(clientId, h.id, {
        version: h.version, felder: { status: "verworfen" }, wer: "Clara", was: "Fall per Sprache zurückgenommen (\"doch nicht\")",
      });
    } catch { /* der Hauptteil ist verworfen; ein Teil bleibt im Zweifel in PlanR sichtbar */ }
  }
  for (const id of u.weitereEntwuerfe || []) {
    try { await d.entwurfVerwerfen(clientId, id); } catch { /* siehe oben */ }
  }
}

async function standardDeps() {
  const [{ cancelBookingById, moveBookingById }, store, cases, entwuerfe, sprache, hkpRoute] = await Promise.all([
    import("./agentBooking.js"), import("../hkp/store.js"), import("../brain/caseStore.js"), import("../hkp/planrEntwuerfe.js"),
    import("../hkp/planSprache.js"), import("../routes/hkp.js"),
  ]);
  return {
    terminAbsagen: cancelBookingById,
    terminVerschieben: moveBookingById,
    hkpLesen: store.hkpLesen,
    hkpAktualisieren: store.hkpAktualisieren,
    statusText: store.STATUS_TEXT,
    vorgangStatus: cases.setStatus,
    entwurfVerwerfen: entwuerfe.entwurfVerwerfen,
    planAenderungZurueck: (clientId, id) => sprache.planAenderungZurueck(clientId, id, hkpRoute.planSpracheZugang()),
    planWiederholen: (clientId, id) => sprache.planWiederholen(clientId, id, hkpRoute.planSpracheZugang()),
  };
}

const NICHTS = "Ich habe in diesem Gespräch nichts geschrieben, das ich zurücknehmen könnte.";
const gross = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Gegenaktion zu einem `undo`-Eintrag. `undoErledigt` sagt Clara, ob der
 * Eintrag verbraucht ist (Erfolg oder endgueltig) — bei einem Fehlschlag
 * bleibt er stehen, damit ein zweiter Anlauf moeglich ist.
 */
export async function zuruecknehmen(clientId, undo, deps) {
  const u = undo && typeof undo === "object" ? undo : null;
  if (!u || !ARTEN.has(u.art)) return { ok: false, undoErledigt: true, message: NICHTS };
  const label = String(u.label || "").trim() || "das";
  const wann = Number(u.wann);
  if (!Number.isFinite(wann) || Date.now() - wann > RUECKGAENGIG_MS) {
    return { ok: false, undoErledigt: true, message: `Das ist zu lange her — ${label} nehme ich per Sprache nicht mehr zurück. Bitte in der Plattform ändern.` };
  }
  if (u.art === "endgueltig") {
    return { ok: true, undoErledigt: true, endgueltig: true, message: `Zurückholen kann ich ${label} nicht mehr — das ist schon raus.` };
  }
  if (u.art === "hkp_aenderung") {
    return { ok: true, undoErledigt: true, message: "Die Änderung steht schon im HKP. Sagen Sie mir die Gegenänderung, dann schlage ich sie Ihnen vor." };
  }
  const d = deps || (await standardDeps());
  const by = "Clara";

  if (u.art === "termin") {
    const r = await d.terminAbsagen(clientId, u.id);
    if (!r?.ok) return { ok: false, undoErledigt: false, message: `Absagen konnte ich ${label} gerade nicht. Bitte im Kalender prüfen.` };
    return { ok: true, undoErledigt: true, message: `Gut, ich habe ${label} wieder abgesagt.` };
  }

  if (u.art === "termin_verschoben") {
    // `vorher` ist der alte Beginn: der Termin wandert dorthin zurueck.
    const r = u.vorher ? await d.terminVerschieben(clientId, u.id, u.vorher) : null;
    if (!r?.ok) return { ok: false, undoErledigt: false, message: `Zurückverschieben konnte ich ${label} gerade nicht. Bitte im Kalender prüfen.` };
    return { ok: true, undoErledigt: true, message: `Gut, ${label} steht wieder auf dem alten Platz.` };
  }

  if (u.art === "hkp") {
    const h = await d.hkpLesen(clientId, u.id);
    if (!h) return { ok: false, undoErledigt: true, message: `${gross(label)} finde ich nicht mehr im Register.` };
    if (h.status !== "wartet_auf_freigabe") {
      return { ok: false, undoErledigt: true, message: `Der HKP ist schon ${d.statusText?.[h.status] || h.status} — zurücknehmen geht nur noch in PlanR.` };
    }
    await d.hkpAktualisieren(clientId, h.id, {
      version: h.version, felder: { status: "verworfen" }, wer: by, was: "per Sprache zurückgenommen (\"doch nicht\")",
    });
    let wieder = 0;
    for (const altId of u.alt || []) {
      try {
        const a = await d.hkpLesen(clientId, altId);
        if (a?.status !== "verworfen") continue;
        await d.hkpAktualisieren(clientId, a.id, {
          version: a.version, felder: { status: "wartet_auf_freigabe" }, wer: by,
          was: `wiederhergestellt, weil ${h.id} per Sprache zurückgenommen wurde`,
        });
        wieder += 1;
      } catch { /* der neue Entwurf ist verworfen; ein alter bleibt im Zweifel verworfen und in PlanR sichtbar */ }
    }
    const altSatz = wieder ? ` Der vorige HKP wartet wieder auf Ihre Freigabe.` : "";
    await fallMitnehmen(clientId, u, d);
    return { ok: true, undoErledigt: true, message: `Gut, ich habe ${label} wieder verworfen.${altSatz}` };
  }

  if (u.art === "planr_entwurf") {
    const r = await d.entwurfVerwerfen(clientId, u.id);
    if (r.ok) {
      await fallMitnehmen(clientId, u, d);
      return { ok: true, undoErledigt: true, message: `Gut, ich habe ${label} wieder verworfen.` };
    }
    if (r.grund === "abgeholt") {
      return { ok: false, undoErledigt: true, message: `${gross(label)} liegt schon als Entwurf${r.nummer ? ` ${r.nummer}` : ""} in PlanR – bitte dort löschen.` };
    }
    return { ok: false, undoErledigt: true, message: r.grund === "fehlt" ? `${gross(label)} finde ich nicht mehr.` : `${gross(label)} ist schon verworfen.` };
  }

  if (u.art === "plan_ki") {
    const r = await d.planAenderungZurueck(clientId, u.id);
    if (r.ok) return { ok: true, undoErledigt: true, message: `Gut, ich habe ${label} zurückgenommen. Der Plan ist wieder wie vorher.` };
    return { ok: false, undoErledigt: true, message: r.grund === "veraltet"
      ? "Der Plan wurde seitdem noch einmal geändert. Sagen Sie mir die Gegenänderung, dann setze ich sie um."
      : "Den Stand von vorher habe ich nicht mehr. Sagen Sie mir die Gegenänderung, dann setze ich sie um." };
  }

  if (u.art === "plan_weg") {
    const r = await d.planWiederholen(clientId, u.id);
    if (r.ok) return { ok: true, undoErledigt: true, message: `Gut, ich habe ${label} zurückgeholt.` };
    return { ok: false, undoErledigt: false, message: `Zurückholen konnte ich ${label} gerade nicht. Bitte in PlanR im Papierkorb nachsehen.` };
  }

  if (u.art === "vorgang" || u.art === "aufgabe") {
    const ziel = u.art === "vorgang" ? (u.vorher || "open") : "closed";
    const note = u.art === "vorgang" ? "per Sprache wieder geöffnet (\"doch nicht\")" : "per Sprache zurückgenommen (\"doch nicht\")";
    const r = await d.vorgangStatus(clientId, u.id, ziel, { by, note });
    if (!r?.ok) return { ok: false, undoErledigt: r?.reason === "not_found", message: `Zurücknehmen konnte ich ${label} gerade nicht.` };
    return { ok: true, undoErledigt: true, message: `Gut, ich habe ${label} wieder ${u.art === "vorgang" ? "geöffnet" : "gestrichen"}.` };
  }
  return { ok: false, undoErledigt: true, message: NICHTS };
}
