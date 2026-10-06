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

const ARTEN = new Set(["termin", "hkp", "hkp_aenderung", "vorgang", "aufgabe", "endgueltig"]);

export function rueckgaengigAn() {
  return !/^(0|false|no|off)$/i.test(String(process.env.MAS_RUECKGAENGIG ?? "1").trim());
}

/** `{ undo: {...} }` zum Einstreuen in eine Werkzeug-Antwort, sonst `{}`. */
export function mitUndo(art, { id = "", label = "", vorher = "", alt = [] } = {}) {
  if (!rueckgaengigAn() || !ARTEN.has(art)) return {};
  const undo = { art, label: String(label || "").trim(), wann: Date.now() };
  if (id) undo.id = String(id);
  if (vorher) undo.vorher = String(vorher);
  if (Array.isArray(alt) && alt.length) undo.alt = alt.map(String);
  return { undo };
}

async function standardDeps() {
  const [{ cancelBookingById }, store, cases] = await Promise.all([
    import("./agentBooking.js"), import("../hkp/store.js"), import("../brain/caseStore.js"),
  ]);
  return {
    terminAbsagen: cancelBookingById,
    hkpLesen: store.hkpLesen,
    hkpAktualisieren: store.hkpAktualisieren,
    statusText: store.STATUS_TEXT,
    vorgangStatus: cases.setStatus,
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
    return { ok: true, undoErledigt: true, message: `Gut, ich habe ${label} wieder verworfen.${altSatz}` };
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
