import { getDayAppointments, getPatientAppointments, todayBerlin, relativeDayLabel, dayOfMs } from "./daySchedule.js";
import { getPatientAnamnese, bogenStand } from "./anamnese.js";
import { vary, clinicalHints } from "./speech.js";
import { listActiveCasesByPatientIds } from "../brain/caseStore.js";
import { TOPIC_LABELS } from "../brain/cases.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { kartePatient } from "./karten.js";
// Entkoppelt (23.07.2026): Clara zieht das gewichtete Besuchs-Briefing ueber die
// neutrale Bruecke, NICHT mehr direkt aus Lena. Ist Lena nicht geladen, kommt ein
// leeres Briefing zurueck — Clara laeuft unbeschadet weiter.
import { loadWeightedVisitBriefing } from "../shared/lenaBridge.js";

/**
 * "Nächste 2 Patienten"-Briefing
 * ===========================================================================
 * Ergänzung zum Tages-Lagebild: Clara nennt pro anstehendem Patienten
 *   1) was für ein Termin das ist (visitMotive),
 *   2) was geplant ist (Termin-Notiz/comments, falls vorhanden),
 *   3) — am wichtigsten — was beim LETZTEN Termin war (gewichtete Lena-
 *      Template-Fakten, max. 2 Stichpunkte; Fallback Kalender).
 *
 * W-LENA-8d: Keine Romane — nur hoechstgewichtete Keys (Therapie / Plan /
 * Komplikation / offen). SignR-Anamnese bleibt separat (kompakteAnamnese).
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

// Anamnese-Warnung in EINEM Satz: nur die klinisch relevanten Kategorien
// (Allergie, Medikamente, Vorerkrankung, Schwangerschaft ...) als Stichpunkte,
// plus — wenn ableitbar — ein klinischer Rueckschluss fuer den Behandler
// (z. B. Bluthochdruck -> adrenalinfreie Betaeubung erwaegen). Die Lead-ins
// kommen aus >=10er-Pools (speech.js/vary, Anti-Wiederholung) — Fakten setzen
// wir ein, die Variation kann nichts erfinden. Kein Humor bei Warnungen.
function kompakteAnamnese(ana) {
    if (!ana?.ok) return "";
    if (ana.findings?.length) {
        const byCat = new Map();
        for (const f of ana.findings) {
            if (!byCat.has(f.category)) byCat.set(f.category, []);
            const t = f.text && f.text !== "ja" ? f.text : "";
            if (t) byCat.get(f.category).push(t);
        }
        const parts = [];
        for (const [cat, texts] of byCat) {
            parts.push(texts.length ? `${cat}: ${[...new Set(texts)].join(", ")}` : cat);
        }
        if (parts.length) {
            const lead = vary("headsup.analead", [
                "Achtung, wichtig aus der Anamnese",
                "Aus der Anamnese unbedingt beachten",
                "Wichtig vorab aus der Anamnese",
                "Aufgepasst, die Anamnese zeigt",
                "Der Anamnesebogen meldet",
                "Vor der Behandlung kurz wichtig",
                "Aus dem Bogen bitte mitnehmen",
                "Die Kartei hat hier eine Markierung",
                "Bitte auf dem Schirm haben",
                "Ein Blick in die Anamnese lohnt sich",
                "Dazu gehört diese Vorgeschichte",
            ]);
            let msg = `${lead} — ${parts.join("; ")}`;
            // Aus dem signierten PDF rekonstruiert: Stand ehrlich dazusagen,
            // ein alter Bogen kann ueberholt sein.
            if (ana.ausPdf && ana.bogenMs) msg += ` (unterschriebener Bogen vom ${bogenStand(ana.bogenMs)})`;
            const hints = clinicalHints(ana.findings);
            if (hints.length) {
                const hlead = vary("headsup.hintlead", [
                    "Mein Hinweis",
                    "Denk dran",
                    "Praktisch heißt das",
                    "Für die Behandlung bedeutet das",
                    "Daraus folgt",
                    "Kleiner Merker von mir",
                    "Konkret heißt das",
                    "Mein Tipp dazu",
                    "Zur Sicherheit",
                    "Was das für heute heißt",
                ]);
                msg += `. ${hlead}: ${hints.join("; ")}`;
            }
            return msg;
        }
    }
    if (ana.signedOnly) return "Die Anamnese liegt unterschrieben nur als PDF vor und kann nicht automatisch gelesen werden";
    return "";
}

// Lead-ins fuer den "letzter Besuch"-Teil (vor einem Doppelpunkt nutzbar).
const LETZTES_MAL_LEADS = [
    "Beim letzten Mal",
    "Zuletzt",
    "Beim letzten Besuch",
    "Das letzte Mal",
    "Beim vorigen Termin",
    "Der letzte Eintrag",
    "In der Kartei steht zuletzt",
    "Zur Vorgeschichte",
    "Der letzte Besuch",
    "Vorher war",
    "Letzter Kontakt",
    "Aus dem letzten Termin",
    "Was zuletzt lag",
    "In der Historie",
    "Beim letzten Mal im Stuhl",
];

function lastContactText(c) {
    const updates = Array.isArray(c?.updates) ? c.updates : [];
    const last = [...updates].reverse().find((u) => u.kind === "contact") || updates[updates.length - 1];
    return String(last?.text || "");
}

// Prozedurale Auto-Vorgaenge (Claras calendarWatch legt zu JEDEM Termin einen
// "Neuer Termin"-/"Dokumenten-Ampel"-Vorgang an) sind System-Buchhaltung und
// gehoeren NICHT ins Patienten-Heads-up. Nur inhaltliche Anliegen (Rechnung,
// Beschwerde, Rueckruf ...) sind hier gemeint. Erkennung ueber den Vorgangstext.
function istProzedural(c) {
    if (!c) return true;
    if (c.topic === "appointment") return true;
    if (/^\s*(Neuer Termin|Termin verschoben|Termin abgesagt|Dokumenten-Ampel)/i.test(lastContactText(c))) return true;
    return false;
}

// Offener Vorgang aus dem Praxisgedaechtnis (Nadine-Mail, Anruf, Factoring ...).
// Inhaltliche Themen (Beschwerde/Rechnung/Rueckruf) gehen vor; E-Mail-Adressen
// werden gegen den Namen getauscht (lesen sich gesprochen schlecht).
function fallHinweis(cases, who) {
    const PRIO = { complaint: 4, billing: 4, callback: 3, document: 2, other: 1 };
    const c = (cases || [])
        .filter((x) => !istProzedural(x))
        .sort((a, b) => (PRIO[b.topic] || 0) - (PRIO[a.topic] || 0))[0];
    if (!c) return "";
    let snippet = lastContactText(c)
        .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, who)
        .replace(/\s+/g, " ")
        .trim();
    if (snippet.length > 220) snippet = `${snippet.slice(0, 217)}...`;
    const thema = c.topic ? ` zum Thema ${TOPIC_LABELS[c.topic] || c.topic}` : "";
    return snippet ? `Offener Vorgang${thema}: ${snippet}` : `Es gibt einen offenen Vorgang${thema}`;
}

/**
 * Baut den gesprochenen Text für die nächsten N Patienten (Default 2).
 * @returns {Promise<{ok:boolean, message:string, count?:number}>}
 */
// Normalisiert einen Namen/Teilstring fuer den Vergleich (klein, ohne Anrede).
function normName(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/\b(herr|frau|hr|fr|patient|patientin)\b\.?/g, " ")
        .replace(/[^a-zäöüß0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
// "10", "10 uhr", "10:00", "1000" -> "10:00"
function normTime(s) {
    const m = String(s || "").match(/(\d{1,2})(?:[:.\s]?(\d{2}))?/);
    if (!m) return "";
    const h = String(Math.min(23, parseInt(m[1], 10))).padStart(2, "0");
    const min = (m[2] || "00").padStart(2, "0");
    return `${h}:${min}`;
}

export async function buildNextPatientsBriefing(clientId, { date, calendarId, count = 2, nowMs = Date.now(), patientName, time } = {}) {
    const theDate = date || todayBerlin();
    const day = await getDayAppointments(clientId, { date: theDate, calendarId });
    if (!day?.ok) return { ok: false, message: "Den Kalender kann ich gerade nicht lesen." };

    const toEchte = (d) => (d.appointments || [])
        .filter((a) => !a.isAbsence && a.patientId)
        .sort((a, b) => a.startMs - b.startMs);
    let echte = toEchte(day);

    // Gezielte Abfrage nach Patientenname oder Uhrzeit ("Heads up fuer Lindenthal",
    // "der Patient um 10 Uhr"). Dann durchsuchen wir den GANZEN Tag (nicht nur
    // ab jetzt) und liefern genau diesen einen Patienten. Bei keinem Treffer eine
    // klare Fehlmeldung — NIEMALS erfundene Termine.
    const nameQ = normName(patientName);
    const timeQ = normTime(time);
    if (nameQ || timeQ) {
        const matchIn = (list) => {
            let t = list;
            if (nameQ) {
                const toks = nameQ.split(" ").filter(Boolean);
                t = t.filter((a) => {
                    const hay = normName(`${a.patientName || ""} ${a.patientLastName || ""}`);
                    return toks.every((tok) => hay.includes(tok));
                });
            }
            if (timeQ) t = t.filter((a) => hhmm(a.startMs) === timeQ);
            return t;
        };
        let treffer = matchIn(echte);

        // War auf EINEN Kalender (Operator-Kalender) gescoped und nichts gefunden?
        // Dann praxisweit nachsehen, bevor wir "nicht gefunden" sagen: Der Patient
        // "um 11" kann bei einem ANDEREN Behandler sitzen (Vorfall 30.06.2026 —
        // Demo: Petsas fragt nach 11 Uhr, der einzige 11-Uhr-Patient lag bei
        // Dr. Patrikis, Clara meldete faelschlich "kein Termin um 11"). Nur
        // erweitern, nie verengen; die Sichtbarkeits-Filter (virtuell/Sperrzeit)
        // gelten in getDayAppointments unveraendert weiter.
        if (!treffer.length && calendarId) {
            const all = await getDayAppointments(clientId, { date: theDate }).catch(() => null);
            if (all?.ok) {
                echte = toEchte(all);
                treffer = matchIn(echte);
            }
        }

        if (!treffer.length) {
            // Kein Termin am Tag. Bei Namens-Anfrage NICHT abbrechen, sondern in
            // der KARTEI nachschlagen: Clara soll zu JEDEM Patienten ein Heads-up
            // geben koennen (Wunsch 27.06.) — Historie, Anamnese, offene Vorgaenge,
            // naechster geplanter Termin. Nur bei reiner Uhrzeit-Anfrage ohne Namen
            // bleibt es bei der klaren Fehlmeldung (Uhrzeit ohne Termin -> nichts).
            if (nameQ) return await renderChartPatient(clientId, String(patientName).trim());
            return { ok: true, message: `Ich finde an dem Tag keinen Termin um ${timeQ} Uhr. Bitte die Uhrzeit prüfen.`, count: 0 };
        }
        if (treffer.length > 1) {
            const namen = treffer.slice(0, 4).map((a) => `${a.patientName || a.patientLastName} um ${hhmm(a.startMs)}`).join("; ");
            return { ok: true, message: `Es gibt mehrere passende Termine: ${namen}. Welchen meinen Sie?`, count: treffer.length };
        }
        return await renderPatients(clientId, treffer.slice(0, 1), { single: true });
    }

    const anstehend = echte
        .filter((a) => a.startMs >= nowMs)
        .slice(0, Math.max(1, count));

    if (!anstehend.length) {
        return { ok: true, message: "Für heute stehen keine weiteren Patienten mehr an.", count: 0 };
    }
    return await renderPatients(clientId, anstehend, { single: false });
}

async function renderPatients(clientId, anstehend, { single } = {}) {

    // Offene Vorgaenge der anstehenden Patienten in wenigen Reads (best-effort).
    const casesByPatient = await listActiveCasesByPatientIds(
        clientId,
        anstehend.map((a) => a.patientId),
    ).catch(() => new Map());

    const teile = [];
    // Uebersichts-Karten fuer die Handy-App (Hero-Design): dieselben Fakten
    // wie der Sprachtext, nur strukturiert — eine Karte je Patient.
    const cards = [];
    for (let i = 0; i < anstehend.length; i++) {
        const a = anstehend[i];
        const who = a.patientName || a.patientLastName || "der nächste Patient";
        const fuehrung = single ? "Termin" : (i === 0
          ? vary("headsup.erst", ["Als Nächstes", "Zuerst", "Als Erstes", "Gleich", "Als Nächster"])
          : vary("headsup.dann", ["Danach", "Dann", "Im Anschluss", "Darauf", "Als Nächster"]));
        const zeit = hhmm(a.startMs);

        // Im Einzel-Heads-up den Behandler nennen, damit in einer Mehrbehandler-
        // Praxis klar ist, an welchem Stuhl der Patient sitzt (z.B. wenn der
        // gefragte Patient bei einem anderen Arzt als dem Operator liegt).
        const beiArzt = single && a.calendarName ? ` bei ${a.calendarName}` : "";
        let s = single
            ? `${who}${zeit ? `, ${zeit} Uhr` : ""}${beiArzt}`
            : `${fuehrung}${zeit ? ` um ${zeit}` : ""}: ${who}`;
        s += a.visitMotive ? ` — ${a.visitMotive}` : " — Termin";
        if (a.newPatient) s += ", Neupatient";
        if (a.comments) s += `. Geplant: ${kurz(a.comments)}`;

        let letzterBesuch = null;
        // Vorgeschichte — LETZTER Termin, gewichtet aus Lena-Template (8d).
        try {
            const hist = await getPatientAppointments(clientId, { patientId: a.patientId, lastName: a.patientLastName });
            if (hist?.ok && hist.last) {
                const lastMotive = hist.last.visitMotive || "ein Termin";
                const weighted = await loadWeightedVisitBriefing(clientId, {
                    lastAppt: hist.last,
                    thisAppt: a.id ? a : null,
                }).catch(() => null);
                if (weighted?.spoken) {
                    s += `. ${vary("headsup.letztesmal", LETZTES_MAL_LEADS)}: ${weighted.spoken}`;
                    letzterBesuch = {
                        motive: lastMotive,
                        startMs: hist.last.startMs || 0,
                        note: weighted.cardNote || "",
                    };
                } else {
                    const lastNote = hist.last.comments ? `, Notiz: ${kurz(hist.last.comments, 80)}` : "";
                    s += `. ${vary("headsup.letztesmal", LETZTES_MAL_LEADS)}: ${lastMotive}${lastNote}`;
                    letzterBesuch = { motive: lastMotive, startMs: hist.last.startMs || 0, note: hist.last.comments || "" };
                }
            } else {
                s += ". Kein früherer Termin bekannt";
            }
        } catch {
            /* Historie ist best-effort und darf das Briefing nie blockieren */
        }

        // Anamnese-Warnung (Wunsch 26.06.: Allergien/Medikamente/Vorerkrankungen
        // beim naechsten Patienten vorlesen, bevor er im Stuhl sitzt).
        let anaFindings = [];
        let anaHints = [];
        try {
            const ana = await getPatientAnamnese(clientId, { patientId: a.patientId });
            const anaTxt = kompakteAnamnese(ana);
            if (anaTxt) s += `. ${anaTxt}`;
            if (ana?.ok && ana.findings?.length) {
                anaFindings = ana.findings;
                anaHints = clinicalHints(ana.findings);
            }
        } catch {
            /* Anamnese ist best-effort und darf das Briefing nie blockieren */
        }

        // Offener Vorgang (Mail/Anruf/Factoring) — der "Jaw-Dropper" im Briefing.
        const fall = fallHinweis(casesByPatient.get(a.patientId) || [], who);
        if (fall) s += `. ${fall}`;

        // Unterlagen-Ampel: gelb = verschickt, rot = noch gar nicht — z.B. eine
        // OP-Aufklaerung, die vor dem Eingriff noch unterschrieben werden muss.
        if (a.docsStatus === "red") s += ". Achtung, Unterlagen sind noch nicht unterschrieben";
        else if (a.docsStatus === "yellow") s += ". Unterlagen sind verschickt, aber noch nicht unterschrieben";

        teile.push(`${s}.`);
        cards.push(kartePatient({
            name: who,
            startMs: a.startMs,
            motive: a.visitMotive || "Termin",
            neupatient: !!a.newPatient,
            comments: a.comments ? kurz(a.comments, 90) : "",
            commentsFull: a.comments || "",
            anamneseFindings: anaFindings,
            klinikHinweise: anaHints,
            letzterBesuch,
            fallText: fall,
            docsStatus: a.docsStatus || "",
            tag: single ? "Heads-up" : (i === 0 ? "Nächster Patient" : "Danach"),
            calendarName: single ? (a.calendarName || "") : "",
        }));
    }

    const kopf = single
        ? vary("headsup.kopf", [
            "Heads up",
            "Kurz zum Patienten",
            "Zum nächsten Patienten",
            "Aufgepasst",
            "Kurzes Briefing",
            "Einmal kurz vorab",
            "Bevor es losgeht",
            "Zur Vorbereitung",
            "Kleiner Überblick",
            "Das Wichtigste vorweg",
            "Ein Blick voraus",
            "Kurz für den Stuhl",
            "Was Sie wissen sollten",
            "Vor dem nächsten Patienten",
            "Eine Minute Vorbereitung",
        ])
        : (anstehend.length === 1
          ? vary("headsup.mehr.1", ["Der nächste Patient", "Als Nächstes kommt", "Gleich im Stuhl"])
          : vary("headsup.mehr.n", [
            `Die nächsten ${anstehend.length} Patienten`,
            `Kurz die nächsten ${anstehend.length}`,
            `Was als Nächstes kommt — ${anstehend.length} Patienten`,
          ]));
    return { ok: true, message: `${kopf}: ${teile.join(" ")}`, count: anstehend.length, cards };
}

// Heads-up zu einem Patienten OHNE Termin am gefragten Tag — direkt aus der
// Kartei (Wunsch 27.06.: "fuer jeden Patienten in der Kartei ein Heads-up").
// Identitaet ueber dieselbe sichere Route wie find_contact (resolvePatientSubject:
// kein Raten — eindeutig, mehrdeutig oder nicht gefunden). Inhalt: letzter +
// naechster Termin, Anamnese-Warnung, offene Vorgaenge. Reine Lesefunktion.
async function renderChartPatient(clientId, patientName) {
    const subj = await resolvePatientSubject(clientId, patientName).catch(() => null);

    if (!subj || subj.matchStatus === "unmatched" || (!subj.patientId && subj.matchStatus !== "ambiguous")) {
        return { ok: true, message: `Ich finde keinen Patienten „${patientName}" in der Kartei. Bitte den Namen prüfen.`, count: 0 };
    }
    if (subj.matchStatus === "ambiguous") {
        const namen = (subj.candidates || [])
            .slice(0, 4)
            .map((p) => `${p.firstName || ""} ${p.lastName || ""}`.trim())
            .filter(Boolean)
            .join("; ");
        return { ok: true, message: `Zu „${patientName}" gibt es mehrere Patienten${namen ? `: ${namen}` : ""}. Wen genau meinen Sie?`, count: (subj.candidates || []).length };
    }

    const who = subj.name || patientName;
    const lastName = (subj.candidates && subj.candidates[0] && subj.candidates[0].lastName) || "";
    let s = `Heads up zu ${who}`;
    let letzterBesuch = null;
    let naechsterMs = 0;
    let naechsterMotive = "";

    // Termin-Historie (kein Termin am gefragten Tag, aber evtl. frueher/spaeter).
    try {
        const hist = await getPatientAppointments(clientId, { patientId: subj.patientId, lastName });
        if (hist?.ok) {
            if (hist.next) {
                const nMot = hist.next.visitMotive || "ein Termin";
                s += `. Nächster Termin: ${nMot}${hist.next.startMs ? ` ${relativeDayLabel(dayOfMs(hist.next.startMs))}` : ""}`;
                naechsterMs = hist.next.startMs || 0;
                naechsterMotive = nMot;
            }
            if (hist.last) {
                const lMot = hist.last.visitMotive || "ein Termin";
                const weighted = await loadWeightedVisitBriefing(clientId, {
                    lastAppt: hist.last,
                    thisAppt: hist.next || null,
                }).catch(() => null);
                if (weighted?.spoken) {
                    s += `. ${vary("headsup.letztesmal", LETZTES_MAL_LEADS)}: ${weighted.spoken}`;
                    letzterBesuch = { motive: lMot, startMs: hist.last.startMs || 0, note: weighted.cardNote || "" };
                } else {
                    const lNote = hist.last.comments ? `, Notiz: ${kurz(hist.last.comments, 80)}` : "";
                    s += `. ${vary("headsup.letztesmal", LETZTES_MAL_LEADS)}: ${lMot}${lNote}`;
                    letzterBesuch = { motive: lMot, startMs: hist.last.startMs || 0, note: hist.last.comments ? kurz(hist.last.comments, 90) : "" };
                }
            }
            if (!hist.next && !hist.last) s += ". Kein Termin in der Historie";
        }
    } catch {
        /* Historie best-effort, blockiert das Heads-up nie */
    }

    // Anamnese-Warnung (Allergien/Medikamente/Vorerkrankungen).
    let anaFindings = [];
    let anaHints = [];
    try {
        const ana = await getPatientAnamnese(clientId, { patientId: subj.patientId });
        const anaTxt = kompakteAnamnese(ana);
        if (anaTxt) s += `. ${anaTxt}`;
        if (ana?.ok && ana.findings?.length) {
            anaFindings = ana.findings;
            anaHints = clinicalHints(ana.findings);
        }
    } catch {
        /* Anamnese best-effort */
    }

    // Offener Vorgang (Mail/Anruf/Rechnung) aus dem Praxisgedaechtnis.
    let fall = "";
    try {
        const casesByPatient = await listActiveCasesByPatientIds(clientId, [subj.patientId]).catch(() => new Map());
        fall = fallHinweis(casesByPatient.get(subj.patientId) || [], who);
        if (fall) s += `. ${fall}`;
    } catch {
        /* Vorgaenge best-effort */
    }

    const card = kartePatient({
        name: who,
        startMs: naechsterMs,
        motive: naechsterMotive ? `Nächster Termin: ${naechsterMotive}` : "Aus der Kartei",
        anamneseFindings: anaFindings,
        klinikHinweise: anaHints,
        letzterBesuch,
        fallText: fall,
        tag: "Heads-up",
    });
    return { ok: true, message: `${s}.`, count: 1, cards: [card] };
}
