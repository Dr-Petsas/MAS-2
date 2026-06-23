import { getDayAppointments, getPatientAppointments, todayBerlin } from "./daySchedule.js";

/**
 * "Nächste 2 Patienten"-Briefing
 * ===========================================================================
 * Ergänzung zum Tages-Lagebild: Clara nennt pro anstehendem Patienten
 *   1) was für ein Termin das ist (visitMotive),
 *   2) was geplant ist (Termin-Notiz/comments, falls vorhanden),
 *   3) — am wichtigsten — was beim LETZTEN Termin war (Behandlungsart + Notiz).
 *
 * Datenquelle = Plattform-Kalender (read-only, admin SDK), exakt wie das
 * Tages-Lagebild. WICHTIG: Eine echte „geplante Behandlung" pro Termin
 * (treatmentSteps/Lena-Doku) liest MAS-2 noch NICHT — hier kommt heute nur
 * `visitMotive` + `comments` + die letzte Termin-Notiz. Sobald Lena-Doku in
 * Firestore liegt, kann der „letzte Termin"-Teil aus der Karteikarte gespeist
 * werden (TODO unten markiert).
 *
 * Reine Lesefunktion. Keine Schreibvorgänge, keine Vertragsänderung.
 */

function hhmm(ms) {
    if (!ms) return "";
    try {
        return new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    } catch {
        return "";
    }
}

function kurz(s, max = 160) {
    const t = String(s || "").trim();
    if (!t) return "";
    return t.length > max ? `${t.slice(0, max - 3)}...` : t;
}

/**
 * Baut den gesprochenen Text für die nächsten N Patienten (Default 2).
 * @returns {Promise<{ok:boolean, message:string, count?:number}>}
 */
export async function buildNextPatientsBriefing(clientId, { date, calendarId, count = 2, nowMs = Date.now() } = {}) {
    const day = await getDayAppointments(clientId, { date: date || todayBerlin(), calendarId });
    if (!day?.ok) return { ok: false, message: "Den Kalender kann ich gerade nicht lesen." };

    const anstehend = (day.appointments || [])
        .filter((a) => !a.isAbsence && a.patientId && a.startMs >= nowMs)
        .sort((a, b) => a.startMs - b.startMs)
        .slice(0, Math.max(1, count));

    if (!anstehend.length) {
        return { ok: true, message: "Für heute stehen keine weiteren Patienten mehr an.", count: 0 };
    }

    const teile = [];
    for (let i = 0; i < anstehend.length; i++) {
        const a = anstehend[i];
        const who = a.patientName || a.patientLastName || "der nächste Patient";
        const fuehrung = i === 0 ? "Als Nächstes" : "Danach";
        const zeit = hhmm(a.startMs);

        let s = `${fuehrung}${zeit ? ` um ${zeit}` : ""}: ${who}`;
        s += a.visitMotive ? ` — ${a.visitMotive}` : " — Termin";
        if (a.newPatient) s += ", Neupatient";
        if (a.comments) s += `. Geplant: ${kurz(a.comments)}`;

        // Vorgeschichte — vor allem der LETZTE Termin (laut Chef das Wichtigste).
        try {
            const hist = await getPatientAppointments(clientId, { patientId: a.patientId, lastName: a.patientLastName });
            if (hist?.ok && hist.last) {
                // TODO(Lena-Doku): sobald treatment/main bzw. dictations pro Termin
                // in Firestore stehen, hier die Karteikarte des letzten Termins lesen
                // statt nur visitMotive + comments.
                const lastMotive = hist.last.visitMotive || "ein Termin";
                const lastNote = hist.last.comments ? `, Notiz: ${kurz(hist.last.comments, 120)}` : "";
                s += `. Beim letzten Mal: ${lastMotive}${lastNote}`;
            } else {
                s += ". Kein früherer Termin bekannt";
            }
        } catch {
            /* Historie ist best-effort und darf das Briefing nie blockieren */
        }
        teile.push(`${s}.`);
    }

    const kopf = anstehend.length === 1 ? "Der nächste Patient" : `Die nächsten ${anstehend.length} Patienten`;
    return { ok: true, message: `${kopf}: ${teile.join(" ")}`, count: anstehend.length };
}
