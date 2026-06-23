import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { getDayAppointments, getPatientAppointments, todayBerlin } from "./daySchedule.js";

/**
 * Dokumentationsdiktat (Clara → Lena)
 * ===========================================================================
 * Clara als Diktiergerät: Der/die Behandelnde spricht, Clara reicht den Text
 * an die Termindokumentation weiter. Gespeichert wird als Diktat-Segment unter
 * dem Termin — DIESELBE Stelle, die die Lena-Seite und der Termintab live
 * mitlesen:
 *   clients/{clientId}/locations/{locationId}/appointments/{appointmentId}/dictations/{id}
 *   { text, source: "clara", lang, createdAt }
 *
 * So erscheint diktierter Text sofort in Lena + im Termintab (datiert).
 *
 * Termin-Auflösung:
 *   - explizite appointmentId gewinnt,
 *   - sonst über patientId: heutiger Termin des Patienten, sonst nächster/letzter.
 *
 * Schreibt NUR in die Termin-Doku (kein Versand, keine Abrechnung). Strukturieren
 * in eine Karteikarte macht weiterhin die bestehende Cloud Function
 * (structureTreatmentNote) — hier landen die Roh-Segmente.
 */

async function resolveLocationId(clientId) {
    const booking = await loadBooking(clientId).catch(() => null);
    return booking?.locationId || null;
}

/** Termin für ein Diktat finden, wenn keine appointmentId mitkam. */
async function resolveAppointmentForPatient(clientId, { patientId, lastName }) {
    // 1) Heutiger Termin des Patienten (häufigster Fall bei Behandlung am Stuhl).
    try {
        const day = await getDayAppointments(clientId, { date: todayBerlin() });
        if (day?.ok) {
            const heute = (day.appointments || [])
                .filter((a) => !a.isAbsence && a.patientId && (a.patientId === patientId))
                .sort((a, b) => a.startMs - b.startMs);
            if (heute.length) return heute[0].id;
        }
    } catch { /* weiter mit Historie */ }
    // 2) Sonst nächster, sonst letzter Termin des Patienten.
    try {
        const hist = await getPatientAppointments(clientId, { patientId, lastName });
        if (hist?.ok) return hist.next?.id || hist.last?.id || null;
    } catch { /* nichts gefunden */ }
    return null;
}

/**
 * Speichert ein Dokumentationsdiktat als Segment unter dem Termin.
 * @returns {Promise<{ok:boolean, message:string, appointmentId?:string, dictationId?:string}>}
 */
export async function saveTreatmentDictation(clientId, { text, appointmentId, patientId, lastName, lang = "de-DE" } = {}) {
    const body = String(text || "").trim();
    if (!body) return { ok: false, message: "Es war kein Diktattext da, den ich dokumentieren könnte." };

    const locationId = await resolveLocationId(clientId);
    if (!locationId) return { ok: false, message: "Ich finde den Standort der Praxis nicht — kann das Diktat nicht ablegen." };

    let apptId = String(appointmentId || "").trim();
    if (!apptId) {
        apptId = await resolveAppointmentForPatient(clientId, { patientId: String(patientId || "").trim(), lastName: String(lastName || "").trim() });
    }
    if (!apptId) {
        return { ok: false, message: "Zu welchem Termin soll ich das dokumentieren? Ich konnte keinen passenden Termin finden." };
    }

    try {
        const ref = admin.firestore()
            .collection("clients").doc(clientId)
            .collection("locations").doc(locationId)
            .collection("appointments").doc(apptId)
            .collection("dictations");
        const doc = await ref.add({
            text: body,
            source: "clara",
            lang,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { ok: true, appointmentId: apptId, dictationId: doc.id, message: "Habe ich zur Behandlungsdokumentation gespeichert." };
    } catch (e) {
        return { ok: false, message: `Das Diktat konnte ich nicht speichern: ${String(e?.message || e)}` };
    }
}
