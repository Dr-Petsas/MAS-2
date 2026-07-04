import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { getDayAppointments, getPatientAppointments, todayBerlin } from "./daySchedule.js";
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import { masCollection } from "../tenant.js";

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
 *   - explizites Datum: Termin des Patienten an dem Tag,
 *   - sonst der zuletzt BEGONNENE Termin des Patienten (Doku folgt der
 *     Behandlung) — erst wenn es keinen gibt, der nächste kommende.
 *
 * Schreibt NUR in die Termin-Doku (kein Versand, keine Abrechnung). Die
 * strukturierte Karteikarte (treatment/main) baut nach jedem Diktat/Streichen
 * dokuNote.js im Hintergrund (lokales LLM); der Strukturieren-Button der
 * Plattform (Cloud Function structureTreatmentNote) funktioniert unveraendert.
 */

async function resolveLocationId(clientId) {
    const booking = await loadBooking(clientId).catch(() => null);
    return booking?.locationId || null;
}

/** Termin für ein Diktat finden, wenn keine appointmentId mitkam. */
async function resolveAppointmentForPatient(clientId, { patientId, lastName, date } = {}) {
    // 0) Ist ein konkretes Datum genannt (z.B. "Plan für Frau Thrandorf am 25."),
    //    den Termin des Patienten an genau diesem Tag bevorzugen. Bei mehreren
    //    Terminen am Tag: den zuletzt BEGONNENEN (Doku folgt der Behandlung),
    //    sonst den ersten.
    const wunschDatum = String(date || "").trim();
    if (wunschDatum) {
        try {
            const day = await getDayAppointments(clientId, { date: wunschDatum });
            if (day?.ok) {
                const amTag = (day.appointments || [])
                    .filter((a) => !a.isAbsence && a.patientId && (a.patientId === patientId))
                    .sort((a, b) => a.startMs - b.startMs);
                if (amTag.length) {
                    const begonnen = amTag.filter((a) => a.startMs <= Date.now());
                    return (begonnen.length ? begonnen[begonnen.length - 1] : amTag[0]).id;
                }
            }
        } catch { /* fällt unten auf Historie zurück */ }
    }
    // 1) OHNE Datum: der zuletzt BEHANDELTE Termin (04.07.2026). Doku und
    //    Abrechnung entstehen NACH der Behandlung — Ziel ist deshalb der
    //    juengste bereits begonnene Termin (laeuft gerade oder ist vorbei),
    //    egal ob heute oder frueher. Vorher galt stur "heutiger Termin,
    //    fruehester zuerst" — damit landete die Doku bei Doppel-Terminen am
    //    Morgen-Termin und ohne Termin heute auf einem ZUKUENFTIGEN.
    try {
        const hist = await getPatientAppointments(clientId, { patientId, lastName });
        if (hist?.ok) {
            if (hist.last?.id) return hist.last.id; // juengster begonnener (past ist aufsteigend sortiert)
            return hist.next?.id || null; // noch nie behandelt: kommender Termin (z.B. Plan vorab)
        }
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
            // Gestrichene Segmente (struck, § 630f) bleiben in der Kartei sichtbar,
            // werden aber NICHT mehr vorgelesen/als aktuelle Doku gewertet.
            // Sophie-Abrechnungsvermerke (source "sophie") enthalten Euro-Summen —
            // die gehoeren NICHT in gesprochene Briefings (Vorgabe 12.06.2026).
            const segs = dsnap.docs.map((d) => d.data())
                .filter((s) => s && !s.struck && String(s.source || "") !== "sophie" && String(s.text || "").trim());
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
    const planDocs = docs.filter((d) => d.isPlan);   // "Plan erstellt – …"-Vermerke
    const realDocs = docs.filter((d) => !d.isPlan);  // echte Behandlungs-Diktate
    const parts = [];

    // 1) Behandlungsplan: bevorzugt der strukturierte Sophie-Plan; ist keiner
    //    hinterlegt, fällt Clara auf den "Plan erstellt – …"-Vermerk zurück
    //    (Clara-Schnellnotiz). So kann sie auf Nachfrage IMMER sagen, dass und
    //    was geplant ist — auch wenn (noch) kein Sophie-Plan gespeichert wurde.
    if (plans.length) {
        // jüngster Plan (höchstes savedAt, sonst spätestes Termin-Datum)
        const p = [...plans].sort((a, b) => (b.savedAtMs || b.dateMs) - (a.savedAtMs || a.dateMs))[0];
        const titel = p.title ? ` (${p.title})` : "";
        parts.push(`Es gibt einen Behandlungsplan für den ${_germanDate(p.dateMs)}${titel}.`);
    } else if (planDocs.length) {
        const d = planDocs[planDocs.length - 1]; // jüngster Plan-Vermerk
        const detail = d.text.replace(/^plan erstellt\s*[–-]?\s*/i, "").trim();
        parts.push(detail
            ? `Es gibt einen Behandlungsplan vom ${_germanDate(d.dateMs)}: ${detail}.`
            : `Es gibt einen Behandlungsplan vom ${_germanDate(d.dateMs)}.`);
    }

    if (realDocs.length) {
        const d = realDocs[realDocs.length - 1]; // jüngstes dokumentiertes Diktat
        const txt = d.text.length > 220 ? `${d.text.slice(0, 217)}...` : d.text;
        parts.push(`Zuletzt dokumentiert am ${_germanDate(d.dateMs)}: ${txt}`);
    }

    // Nur wenn weder Plan(-Vermerk) noch echte Doku da ist -> Kalender-Historie.
    return parts.length ? parts.join(" ") : null;
}

// Behandlungsdoku im Shared Memory: exakt 45 Tage sichtbar, dann geloescht
// (Vorgabe 04.07.2026) — unabhaengig vom allgemeinen Retention-Regler.
// Durchgesetzt in brain/retention.js ueber das Feld expiresAtMs.
export const DOKU_MEMORY_TAGE = 45;

/**
 * Termin + Besuchsgrund eines Patienten aufloesen OHNE etwas zu speichern
 * (fuer die Doku-Pflicht-Auskunft: "Was ist bei diesem Termin zu dokumentieren?").
 * Gleiche Aufloesung wie beim Diktat: explizite ID > Datum > heute > Historie.
 */
export async function resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date } = {}) {
    const locationId = await resolveLocationId(clientId);
    if (!locationId) return { ok: false, message: "Ich finde den Standort der Praxis nicht." };
    let apptId = String(appointmentId || "").trim();
    if (!apptId) {
        apptId = await resolveAppointmentForPatient(clientId, {
            patientId: String(patientId || "").trim(),
            lastName: String(lastName || "").trim(),
            date: String(date || "").trim(),
        });
    }
    if (!apptId) return { ok: false, message: "Ich konnte keinen passenden Termin finden — für welchen Patienten und welchen Tag?" };
    try {
        const snap = await admin.firestore()
            .collection("clients").doc(clientId)
            .collection("locations").doc(locationId)
            .collection("appointments").doc(apptId).get();
        const ap = snap.exists ? (snap.data() || {}) : {};
        return {
            ok: true,
            appointmentId: apptId,
            locationId,
            motiveName: String(ap?.visitMotive?.name || "").trim(),
            patientName: `${ap?.patient?.firstName || ""} ${ap?.patient?.lastName || ""}`.trim(),
            patientId: String(ap?.patient?.id || "").trim(),
            apptStartMs: _tsToMs(ap?.start),
        };
    } catch (e) {
        return { ok: false, message: `Den Termin konnte ich nicht lesen: ${String(e?.message || e)}` };
    }
}

/**
 * Alle Diktat-Segmente eines Termins lesen (aelteste zuerst). Gestrichene
 * Segmente (struck, § 630f BGB) werden mitgeliefert und vom Aufrufer je nach
 * Zweck gefiltert — fuer Doku-Check/Karteikarte zaehlen nur AKTIVE Segmente.
 */
export async function readAppointmentSegments(clientId, locationId, appointmentId) {
    const snap = await admin.firestore()
        .collection("clients").doc(clientId)
        .collection("locations").doc(locationId)
        .collection("appointments").doc(appointmentId)
        .collection("dictations").get();
    const segs = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((s) => String(s.text || "").trim());
    segs.sort((a, b) => _tsToMs(a.createdAt) - _tsToMs(b.createdAt));
    return segs;
}

/**
 * Aktive KLINISCHE Segment-Texte zu EINEM Pruef-/Struktur-Text vereinen.
 * Ausgeschlossen: gestrichene Segmente (struck, § 630f), Sophie-Abrechnungs-
 * vermerke (source "sophie" — Euro-Summen gehoeren nicht in Karteikarte oder
 * Doku-Check) und "Plan erstellt"-Marker (kein klinischer Inhalt).
 */
export function combineActiveSegments(segs) {
    return (segs || [])
        .filter((s) => !s.struck)
        .filter((s) => String(s.source || "") !== "sophie")
        .filter((s) => !/^plan erstellt/i.test(String(s.text || "").trim()))
        .map((s) => String(s.text || "").trim())
        .filter(Boolean)
        .join("\n");
}

/**
 * Speichert ein Dokumentationsdiktat als Segment unter dem Termin.
 * Liefert zusaetzlich Besuchsgrund + Patient des Termins sowie den KUMULIERTEN
 * Text aller aktiven Segmente (combinedText) zurueck — der Doku-Check prueft
 * den GANZEN Termin, nicht nur das neue Segment. Sonst wuerde Clara nach der
 * Antwort auf eine Rueckfrage wieder nach Dingen aus dem ersten Diktat fragen.
 * @returns {Promise<{ok:boolean, message:string, appointmentId?:string, dictationId?:string, motiveName?:string, patientName?:string, combinedText?:string, locationId?:string}>}
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
        const apptRef = admin.firestore()
            .collection("clients").doc(clientId)
            .collection("locations").doc(locationId)
            .collection("appointments").doc(apptId);

        // Termin einmal lesen: Besuchsgrund (fuer den Doku-Check) + Patient
        // (fuer das Shared-Memory-Subject, falls nicht mitgegeben) + Startzeit
        // (damit die Bestaetigung das Ziel-Datum NENNT, wenn es nicht heute ist).
        let motiveName = "";
        let patientName = "";
        let apptPatientId = "";
        let apptStartMs = 0;
        try {
            const apptSnap = await apptRef.get();
            const ap = apptSnap.exists ? (apptSnap.data() || {}) : {};
            motiveName = String(ap?.visitMotive?.name || "").trim();
            apptPatientId = String(ap?.patient?.id || "").trim();
            patientName = `${ap?.patient?.firstName || ""} ${ap?.patient?.lastName || ""}`.trim();
            apptStartMs = _tsToMs(ap?.start);
        } catch { /* Metadaten sind Komfort */ }

        const doc = await apptRef.collection("dictations").add({
            text: body,
            source: "clara",
            lang,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Kumulierter Text aller aktiven Segmente (inkl. dem eben gespeicherten)
        // fuer den Doku-Check. Best-effort: schlaegt das Lesen fehl, prueft der
        // Check eben nur das neue Segment.
        let combinedText = body;
        try {
            const segs = await readAppointmentSegments(clientId, locationId, apptId);
            const combined = combineActiveSegments(segs);
            if (combined) combinedText = combined;
        } catch { /* Kombinieren ist Komfort */ }

        // Zusätzlich ins geteilte Gedächtnis schreiben — Lena dokumentiert sichtbar
        // für alle (wie Lisa, Bianca, Nadine). So liest die Behandlungsdoku auch in
        // der Cockpit-/Patienten-Timeline mit. Best-effort, der Diktat-Eintrag oben
        // ist die führende Quelle. Verfaellt nach exakt 45 Tagen (expiresAtMs).
        try {
            const subjId = String(patientId || "").trim() || apptPatientId;
            const subjName = String(lastName || "").trim() || patientName;
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
                expiresAtMs: Date.now() + DOKU_MEMORY_TAGE * 86400000,
            });
        } catch (memErr) {
            console.warn("saveTreatmentDictation: brain-event failed:", memErr?.message || memErr);
        }

        // Ziel-Termin transparent machen: Ist das Ziel NICHT der heutige Tag,
        // sagt Clara das Datum dazu — der Chef merkt sofort, wenn die Doku auf
        // einem anderen Termin landet, statt es erst im Termintab zu entdecken.
        let message = "Habe ich zur Behandlungsdokumentation gespeichert.";
        if (apptStartMs) {
            const zielTag = new Intl.DateTimeFormat("en-CA", { timeZone: _BERLIN, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(apptStartMs));
            if (zielTag !== todayBerlin()) {
                const wochentag = new Intl.DateTimeFormat("de-DE", { timeZone: _BERLIN, weekday: "long" }).format(new Date(apptStartMs));
                message = `Habe ich zur Behandlungsdokumentation gespeichert — zum Termin vom ${wochentag}, ${_germanDate(apptStartMs)}.`;
            }
        }

        return { ok: true, appointmentId: apptId, dictationId: doc.id, motiveName, patientName, combinedText, locationId, apptStartMs, message };
    } catch (e) {
        return { ok: false, message: `Das Diktat konnte ich nicht speichern: ${String(e?.message || e)}` };
    }
}

// --- STREICHEN statt Loeschen (04.07.2026) ----------------------------------
// § 630f Abs. 1 BGB: Eintragungen in der Patientenakte duerfen nur so
// berichtigt werden, dass der urspruengliche Inhalt erkennbar bleibt — wie in
// der Papier-Kartei: durchstreichen, nicht radieren. "Loesch das letzte
// Diktat" setzt deshalb struck=true (Frontend rendert durchgestrichen),
// loescht NICHTS. Nur die Shared-Memory-Kopie (Arbeitsgedaechtnis, 45 Tage)
// wird entfernt, damit Briefings den gestrichenen Text nicht mehr vorlesen.

/**
 * Streicht ein Diktat-Segment eines Termins. Ziel-Auswahl:
 *   - dictationId: exakt dieses Segment,
 *   - textHint:    juengstes aktives Segment, dessen Text den Hinweis enthaelt,
 *   - sonst:       das juengste aktive Segment des Termins ("das letzte Diktat").
 * @returns {Promise<{ok:boolean, message:string, appointmentId?:string, dictationId?:string, struckText?:string, motiveName?:string, locationId?:string, combinedText?:string}>}
 */
export async function strikeTreatmentDictation(clientId, { appointmentId, patientId, lastName, date, dictationId, textHint, reason } = {}) {
    const locationId = await resolveLocationId(clientId);
    if (!locationId) return { ok: false, message: "Ich finde den Standort der Praxis nicht." };

    let apptId = String(appointmentId || "").trim();
    if (!apptId) {
        apptId = await resolveAppointmentForPatient(clientId, { patientId: String(patientId || "").trim(), lastName: String(lastName || "").trim(), date: String(date || "").trim() });
    }
    if (!apptId) return { ok: false, message: "Zu welchem Termin gehoert das Diktat? Ich konnte keinen passenden Termin finden." };

    let segs;
    try {
        segs = await readAppointmentSegments(clientId, locationId, apptId);
    } catch (e) {
        return { ok: false, message: `Die Dokumentation konnte ich nicht lesen: ${String(e?.message || e)}` };
    }
    const aktiv = segs.filter((s) => !s.struck);
    if (!aktiv.length) return { ok: false, message: "An diesem Termin ist keine aktive Dokumentation, die ich streichen koennte." };

    let ziel = null;
    const wunschId = String(dictationId || "").trim();
    const hint = String(textHint || "").trim().toLowerCase();
    if (wunschId) {
        ziel = aktiv.find((s) => s.id === wunschId) || null;
        if (!ziel) return { ok: false, message: "Dieses Diktat finde ich nicht (oder es ist schon gestrichen)." };
    } else if (hint) {
        // juengstes zuerst durchsuchen — "das mit dem Roentgen" meint das letzte
        for (let i = aktiv.length - 1; i >= 0; i--) {
            if (String(aktiv[i].text || "").toLowerCase().includes(hint)) { ziel = aktiv[i]; break; }
        }
        if (!ziel) return { ok: false, message: `Ich finde keinen Doku-Eintrag mit "${textHint}" an diesem Termin.` };
    } else {
        ziel = aktiv[aktiv.length - 1];
    }

    try {
        await admin.firestore()
            .collection("clients").doc(clientId)
            .collection("locations").doc(locationId)
            .collection("appointments").doc(apptId)
            .collection("dictations").doc(ziel.id)
            .set({
                struck: true,
                struckAt: admin.firestore.FieldValue.serverTimestamp(),
                struckBy: "clara",
                struckReason: String(reason || "").slice(0, 200) || "per Diktat gestrichen",
            }, { merge: true });
    } catch (e) {
        return { ok: false, message: `Streichen hat nicht geklappt: ${String(e?.message || e)}` };
    }

    // Shared-Memory-Kopie entfernen (Arbeitsgedaechtnis soll den gestrichenen
    // Text nicht mehr hergeben; die Kartei behaelt ihn durchgestrichen).
    try {
        await masCollection(clientId, "mas_events").doc(`lena-doc:${apptId}:${ziel.id}`).delete();
    } catch { /* best-effort */ }

    // Metadaten + kumulierten Rest-Text fuer Karteikarten-Refresh liefern.
    let motiveName = "";
    try {
        const info = await resolveAppointmentInfo(clientId, { appointmentId: apptId });
        motiveName = info.motiveName || "";
    } catch { /* Komfort */ }
    const rest = combineActiveSegments(segs.filter((s) => s.id !== ziel.id));
    const kurz = String(ziel.text || "").slice(0, 80);

    return {
        ok: true,
        appointmentId: apptId,
        dictationId: ziel.id,
        struckText: ziel.text || "",
        motiveName,
        locationId,
        combinedText: rest,
        message: `Gestrichen: "${kurz}${(ziel.text || "").length > 80 ? "..." : ""}" — bleibt durchgestrichen in der Kartei sichtbar, wie es das Patientenrechtegesetz verlangt.`,
    };
}
