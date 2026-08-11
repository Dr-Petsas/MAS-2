// ============================================================================
// NOTIZ IN DEN TERMIN SCHREIBEN (Dr. Petsas, 11.08.2026)
//
// Warum
// -----
// "Merk dir: Frau Meier braucht beim naechsten Mal eine Schiene." Bisher landete
// so ein Satz nur im Praxisgedaechtnis. Der Chef will ihn dort haben, wo beim
// naechsten Mal ohnehin jeder hinschaut: im NOTIZFELD DES TERMINS. Seine
// Begruendung, woertlich: "Wenn du das ins Notizfeld schreibst, hat das immer
// Wiedervorlage-Effekt beim naechsten Mal."
//
// Was hier passiert
// -----------------
// Der naechste kuenftige Termin des Patienten wird gesucht, und die Notiz wird
// an das vorhandene Notizfeld ANGEHAENGT - nie ersetzt. Vorhandene Eintraege
// der Praxis bleiben unangetastet; das ist dieselbe Vorgehensweise, mit der die
// Abwesenheits-Planung schon heute Verschiebe-Hinweise in Termine schreibt.
//
// Kosten
// ------
// Eine Lese-Abfrage nach den Terminen des Patienten und EIN Schreibvorgang, nur
// im Moment des Diktierens. Kein Hintergrundlauf, keine Wiederholung - der
// teure Vorfall vom 03.08.2026 entstand durch eine Dauerschleife, so etwas gibt
// es hier nicht.
// ============================================================================

import admin from "firebase-admin";

import { getPatientAppointments } from "./daySchedule.js";
import { loadBooking } from "./booking.js";

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** "3. September um 9:40 Uhr" — so nennt Clara den Termin in der Antwort. */
export function terminLabel(startMs) {
  const d = new Date(Number(startMs) || 0);
  if (!Number.isFinite(d.getTime()) || !startMs) return "";
  const std = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()}. ${MONATE[d.getMonth()]} um ${std}:${min} Uhr`;
}

/**
 * Notiz an vorhandenen Text anhaengen.
 *
 * Reine Funktion, damit sie ohne Datenbank pruefbar ist. Drei Regeln:
 *   * Vorhandenes bleibt stehen, die Notiz kommt in eine neue Zeile.
 *   * Steht dieselbe Notiz schon da, aendert sich nichts (kein Doppeleintrag,
 *     wenn der Chef sich wiederholt oder das Modell den Aufruf wiederholt).
 *   * Die Herkunft wird kenntlich gemacht, damit im Team niemand raetselt, wer
 *     das geschrieben hat.
 */
export function notizAnhaengen(vorhanden, notiz, { herkunft = "Clara" } = {}) {
  const alt = String(vorhanden || "").trim();
  const neu = String(notiz || "").trim();
  if (!neu) return alt;
  const zeile = herkunft ? `${neu} (${herkunft})` : neu;
  const schonDa = alt
    .split(/\r?\n/)
    .some((z) => z.trim().toLowerCase() === zeile.toLowerCase()
      || z.trim().toLowerCase() === neu.toLowerCase());
  if (schonDa) return alt;
  return alt ? `${alt}\n${zeile}` : zeile;
}

/**
 * Schreibt die Notiz in das Notizfeld des NAECHSTEN Termins des Patienten.
 *
 * Liefert `{ ok, geschrieben, termin, grund }`:
 *   * geschrieben=false mit grund="kein_termin", wenn kein kuenftiger Termin
 *     existiert. Das ist kein Fehler - die Notiz lebt dann im Praxisgedaechtnis
 *     weiter und kommt hoch, sobald ein Termin gebucht wird.
 *   * geschrieben=false mit grund="schon_da", wenn exakt dieselbe Zeile bereits
 *     im Termin steht.
 */
export async function notizInNaechstenTermin(clientId, { patientId, firstName, lastName, notiz }) {
  const cid = String(clientId || "").trim();
  const text = String(notiz || "").trim();
  if (!cid || !text) return { ok: false, geschrieben: false, grund: "unvollstaendig" };

  const termine = await getPatientAppointments(cid, { patientId, firstName, lastName })
    .catch(() => null);
  if (!termine?.ok) return { ok: false, geschrieben: false, grund: "termine_nicht_lesbar" };

  const naechster = termine.next;
  if (!naechster?.id) return { ok: true, geschrieben: false, grund: "kein_termin" };

  const booking = await loadBooking(cid).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, geschrieben: false, grund: "kein_standort" };

  const neuerText = notizAnhaengen(naechster.comments, text);
  if (neuerText === String(naechster.comments || "").trim()) {
    return { ok: true, geschrieben: false, grund: "schon_da", termin: naechster };
  }

  await admin.firestore()
    .collection("clients").doc(cid)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(naechster.id)
    .update({ comments: neuerText });

  return { ok: true, geschrieben: true, termin: naechster, grund: "" };
}
