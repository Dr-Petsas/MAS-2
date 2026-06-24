import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { getDayAppointments, getPatientAppointments, todayBerlin } from "./daySchedule.js";
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";

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
async function resolveAppointmentForPatient(clientId, { patientId, lastName, date } = {}) {
    // 0) Ist ein konkretes Datum genannt (z.B. "Plan für Frau Thrandorf am 25."),
    //    den Termin des Patienten an genau diesem Tag bevorzugen.
    const wunschDatum = String(date || "").trim();
    if (wunschDatum) {
        try {
            const day = await getDayAppointments(clientId, { date: wunschDatum });
            if (day?.ok) {
                const amTag = (day.appointments || [])
                    .filter((a) => !a.isAbsence && a.patientId && (a.patientId === patientId))
                    .sort((a, b) => a.startMs - b.startMs);
                if (amTag.length) return amTag[0].id;
            }
        } catch { /* fällt unten auf heute/Historie zurück */ }
    }
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

// --- LESEN: bestehende Pläne + dokumentierte Behandlungen (24.06.2026) -------
// Clara soll auf Nachfrage (z.B. beim Patienten-Briefing) sagen können, welcher
// Behandlungsplan hinterlegt ist und was bei vorangegangenen Terminen tatsächlich
// DOKUMENTIERT wurde — nicht nur die Terminart. Quellen (read-only):
//   - Plan:  appointments/{id}.sophiePlan  (vom Sophie-Plan-Button / Clara-Vermerk)
//   - Doku:  appointments/{id}/dictations/* (Lena/Clara-Diktate, "Plan erstellt"-Vermerke)
const _BERLIN = "Europe/Berlin";

function _tsToMs(ts) {
    if (!ts) return 0;
    if (typeof ts === "number") return ts;
    if (typeof ts?.toMillis === "function") return ts.toMillis();
    if (ts?._seconds) return ts._seconds * 1000;
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function _germanDate(ms) {
    if (!ms) return "";
    return new Intl.DateTimeFormat("de-DE", { timeZone: _BERLIN, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));
}

/**
 * Liest bestehende Pläne + dokumentierte Behandlungen eines Patienten aus den
 * jüngsten Terminen (nächster + bis zu vier vergangene). Pure-read, keine Writes.
 * @returns {Promise<{ok:boolean, plans:Array, docs:Array}>}
 */
export async function readPatientTreatmentDocs(clientId, { patientId, lastName, firstName } = {}) {
    const locationId = await resolveLocationId(clientId);
    if (!locationId) return { ok: false, plans: [], docs: [] };
    const hist = await getPatientAppointments(clientId, {
        patientId: String(patientId || "").trim(),
        lastName: String(lastName || "").trim(),
        firstName: String(firstName || "").trim(),
    });
    if (!hist?.ok) return { ok: false, plans: [], docs: [] };

    // Kandidaten: nächster Termin (Plan liegt oft auf einem künftigen Termin) +
    // die jüngsten vergangenen Termine (neueste zuerst). Auf wenige begrenzen,
    // damit die gesprochene Antwort kurz bleibt und wenige Reads anfallen.
    const candidates = [];
    if (hist.next) candidates.push(hist.next);
    candidates.push(...(hist.past || []).slice(-4).reverse());

    const apptCol = admin.firestore()
        .collection("clients").doc(clientId)
        .collection("locations").doc(locationId)
        .collection("appointments");

    const plans = [];
    const docs = [];
    for (const a of candidates) {
        const apptId = a?.id;
        if (!apptId) continue;
        const dateMs = a.startMs || 0;
        try {
            const snap = await apptCol.doc(apptId).get();
            const sp = snap.exists ? snap.data()?.sophiePlan : null;
            if (sp && typeof sp === "object") {
                plans.push({
                    appointmentId: apptId,
                    dateMs,
                    title: String(sp.terminGrund || sp.title || a.visitMotive || "").trim(),
                    savedAtMs: _tsToMs(sp.savedAt),
                });
            }
        } catch { /* Plan optional */ }
        try {
            const dsnap = await apptCol.doc(apptId).collection("dictations").get();
            const segs = dsnap.docs.map((d) => d.data()).filter((s) => s && String(s.text || "").trim());
            segs.sort((x, y) => _tsToMs(x.createdAt) - _tsToMs(y.createdAt));
            for (const s of segs) {
                const text = String(s.text).trim();
                docs.push({ appointmentId: apptId, dateMs, text, isPlan: /^plan erstellt/i.test(text), source: s.source || "" });
            }
        } catch { /* Doku optional */ }
    }
    return { ok: true, plans, docs };
}

/**
 * Gesprochene, KURZE Zusammenfassung: bestehender Plan + zuletzt dokumentierte
 * Behandlung. Bewusst knapp gehalten (Vorfall 24.06.: lange, nicht unterbrechbare
 * Antworten vermeiden). Liefert null, wenn weder Plan noch Doku vorhanden ist.
 */
export function buildSpokenPatientDocs(data, { who = "der Patient" } = {}) {
    if (!data?.ok) return null;
    const plans = Array.isArray(data.plans) ? data.plans : [];
    const docs = Array.isArray(data.docs) ? data.docs : [];
    const parts = [];

    if (plans.length) {
        // jüngster Plan (höchstes savedAt, sonst spätestes Termin-Datum)
        const p = [...plans].sort((a, b) => (b.savedAtMs || b.dateMs) - (a.savedAtMs || a.dateMs))[0];
        const titel = p.title ? ` (${p.title})` : "";
        parts.push(`Es gibt einen Behandlungsplan für den ${_germanDate(p.dateMs)}${titel}.`);
    }

    const realDocs = docs.filter((d) => !d.isPlan);
    if (realDocs.length) {
        const d = realDocs[realDocs.length - 1]; // jüngstes dokumentiertes Diktat
        const txt = d.text.length > 220 ? `${d.text.slice(0, 217)}...` : d.text;
        parts.push(`Zuletzt dokumentiert am ${_germanDate(d.dateMs)}: ${txt}`);
    } else if (!plans.length) {
        return null; // weder Plan noch echte Doku -> Aufrufer nutzt Kalender-Historie
    }
    return parts.join(" ");
}

/**
 * Speichert ein Dokumentationsdiktat als Segment unter dem Termin.
 * @returns {Promise<{ok:boolean, message:string, appointmentId?:string, dictationId?:string}>}
 */
export async function saveTreatmentDictation(clientId, { text, appointmentId, patientId, lastName, lang = "de-DE", date } = {}) {
    const body = String(text || "").trim();
    if (!body) return { ok: false, message: "Es war kein Diktattext da, den ich dokumentieren könnte." };

    const locationId = await resolveLocationId(clientId);
    if (!locationId) return { ok: false, message: "Ich finde den Standort der Praxis nicht — kann das Diktat nicht ablegen." };

    let apptId = String(appointmentId || "").trim();
    if (!apptId) {
        apptId = await resolveAppointmentForPatient(clientId, { patientId: String(patientId || "").trim(), lastName: String(lastName || "").trim(), date: String(date || "").trim() });
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

        // Zusätzlich ins geteilte Gedächtnis schreiben — Lena dokumentiert sichtbar
        // für alle (wie Lisa, Bianca, Nadine). So liest die Behandlungsdoku auch in
        // der Cockpit-/Patienten-Timeline mit. Best-effort, der Diktat-Eintrag oben
        // ist die führende Quelle.
        try {
            let subjId = String(patientId || "").trim();
            let subjName = String(lastName || "").trim();
            if (!subjId) {
                const apptSnap = await admin.firestore()
                    .collection("clients").doc(clientId)
                    .collection("locations").doc(locationId)
                    .collection("appointments").doc(apptId).get();
                const ap = apptSnap.exists ? (apptSnap.data() || {}) : {};
                subjId = String(ap?.patient?.id || "").trim();
                if (!subjName) subjName = `${ap?.patient?.firstName || ""} ${ap?.patient?.lastName || ""}`.trim();
            }
            const kurz = body.length > 420 ? body.slice(0, 417) + "..." : body;
            await appendEvent(clientId, {
                id: `lena-doc:${apptId}:${doc.id}`,
                channel: CHANNELS.LENA_DOC,
                type: EVENT_TYPES.NOTE,
                direction: DIRECTIONS.INTERNAL,
                counterparty: { kind: "system", name: "Lena", ref: null },
                subject: subjId
                    ? { patientId: subjId, name: subjName, matchStatus: "matched", matchMethod: "name" }
                    : { name: subjName, matchStatus: "unmatched" },
                status: "none",
                summary: `Behandlungsdokumentation (Lena): ${kurz}`,
                payloadRef: { kind: "dictation", id: doc.id },
                extractor: "lena@treatment-dictation",
                tags: ["lena", "dokumentation", "behandlung"],
            });
        } catch (memErr) {
            console.warn("saveTreatmentDictation: brain-event failed:", memErr?.message || memErr);
        }

        return { ok: true, appointmentId: apptId, dictationId: doc.id, message: "Habe ich zur Behandlungsdokumentation gespeichert." };
    } catch (e) {
        return { ok: false, message: `Das Diktat konnte ich nicht speichern: ${String(e?.message || e)}` };
    }
}
