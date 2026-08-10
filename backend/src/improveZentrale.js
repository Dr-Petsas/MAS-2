/**
 * ZENTRALER MELDEEINGANG — alle Praxen an einer Stelle
 * (Auftrag Dr. Petsas, 10.08.2026, aus dem Urlaub).
 *
 * Das Problem: Eine Meldung aus der Improve-Seite landet bisher NUR im
 * Datenbestand der meldenden Praxis. Niemand erfaehrt davon. Genau die Faelle,
 * die per Code angegangen werden muessen, versanden damit still.
 *
 * Loesung: Jede Meldung hinterlaesst zusaetzlich einen kurzen Eintrag in einer
 * gemeinsamen Sammelstelle, und parallel geht eine E-Mail an Pickadoc raus.
 * Der Superuser sieht damit ALLE Kunden auf einem Blatt und kann nach
 * "muss per Code geloest werden" filtern.
 *
 * BEWUSSTE GRENZE — was hier NICHT hineinkommt:
 * Der volle Fall (Gespraechsverlauf, gehoerte Saetze, Tonaufnahmen, Patienten-
 * namen aus dem Anruf) bleibt ausschliesslich bei der Praxis. Hier stehen nur
 * die Einordnung und der Satz, den die Praxis selbst geschrieben hat, plus ein
 * Zeiger auf den vollen Fall (Praxis + Fall-Nummer). Wer den Verlauf sehen
 * will, oeffnet ihn dort. So wandern keine Anrufinhalte quer durch die
 * Mandanten, und die E-Mail traegt erst recht keine.
 *
 * Ablage: Wurzel-Sammlung `mas_improve_meldungen`. Sie liegt bewusst NICHT
 * unter clients/{id} — eine mandantenuebergreifende Sicht ist der ganze Zweck.
 * Deshalb geht sie auch nicht ueber tenant.js (das verlangt zu Recht immer
 * eine clientId); der Praefix `mas_` bleibt eingehalten.
 */
import { db } from "./firebase.js";
import { masCollection } from "./tenant.js";
import { listAccounts } from "./mail/accounts.js";
import { sendMail } from "./mail/mailbox.js";
import { log } from "./log.js";

const COL = "mas_improve_meldungen";

/** Wohin der Alarm geht und wessen Postfach ihn verschickt. */
const ALARM_AN = (process.env.IMPROVE_ALERT_TO || "info@pickadoc.de").trim();
const ALARM_ABSENDER_CLIENT = (process.env.IMPROVE_ALERT_CLIENT || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

/** Klartext statt Kuerzel — die Sammelstelle liest ein Mensch, kein Programm. */
const SCHWERE_TEXT = {
  blocker: "Blockiert den Betrieb",
  stoerend: "Stört im Alltag",
  kosmetik: "Schönheitsfehler",
};
const KATEGORIE_TEXT = {
  verhoert: "Falsch verstanden",
  falsche_auskunft: "Falsche Auskunft",
  erfunden: "Etwas erfunden",
  nichts_passiert: "Nichts passiert",
  falsche_aktion: "Falsche Aktion",
  umstaendlich: "Umständlich",
};

/** Reihenfolge fuer die Anzeige: Was den Betrieb blockiert, steht oben. */
const SCHWERE_RANG = { blocker: 0, stoerend: 1, kosmetik: 2 };

/**
 * Muss dieser Fall per CODE angegangen werden? (PUR)
 *
 * Das ist die Frage, nach der der Superuser filtert. "einstellung" kann die
 * Praxis selbst pflegen (Namensliste, Tonfall) — das gehoert nicht auf die
 * Entwicklungs-Liste. Alles andere schon, und Unklares ebenfalls: Lieber ein
 * Fall zu viel angeschaut als ein echter Codefehler uebersehen.
 */
export function istCodeFall(m) {
  return String(m?.ebene || "") !== "einstellung";
}

/**
 * Den Eintrag fuer die Sammelstelle bauen (PUR, damit pruefbar ohne Datenbank).
 *
 * Alles wird gekappt: Ein Eintrag ist eine Zeile zum Draufschauen, kein Archiv.
 */
export function baueMeldung({
  clientId = "", praxis = "", fallId = "", einordnung = {}, schwere = "",
  text = "", meldung_von = "", gemeinter_name = "", anruf = "", jetzt = Date.now(),
} = {}) {
  const kategorie = String(einordnung.kategorie || "");
  return {
    praxis: String(clientId || "").trim(),
    praxis_name: String(praxis || "").trim().slice(0, 120),
    // Zeiger auf den vollen Fall bei der Praxis — dort liegt der Verlauf.
    fall: String(fallId || "").trim(),
    anruf: String(anruf || "").trim(),
    gemeldet_von: String(meldung_von || "").trim().slice(0, 120) || "unbekannt",
    kategorie,
    kategorie_text: KATEGORIE_TEXT[kategorie] || "Sonstiges",
    fehlerklasse: String(einordnung.fehlerklasse || "unklar"),
    bereich: String(einordnung.bereich || "unklar"),
    ebene: String(einordnung.ebene || "technisch"),
    schwere: String(schwere || "stoerend"),
    schwere_text: SCHWERE_TEXT[String(schwere)] || SCHWERE_TEXT.stoerend,
    schwere_rang: SCHWERE_RANG[String(schwere)] ?? 1,
    // Der Satz der Praxis, gekuerzt. Kein Anrufinhalt (s. Kopf der Datei).
    text: String(text || "").trim().slice(0, 600),
    gemeinter_name: String(gemeinter_name || "").trim().slice(0, 120),
    code_noetig: istCodeFall(einordnung),
    gelesen: false,
    status: "neu",
    // Ob der Alarm rausging, steht am Eintrag: Eine stumm gescheiterte E-Mail
    // waere schlimmer als gar keine — dann glaubt man, man sei informiert.
    mail_status: "offen",
    mail_fehler: "",
    createdAt: jetzt,
  };
}

/**
 * Betreff und Text des Alarms (PUR).
 *
 * Der Betreff muss im Handy-Posteingang allein schon reichen: Wer, welche
 * Praxis, wie schlimm. Dr. Petsas liest ihn unterwegs.
 */
export function alarmMail(m, { basis = "" } = {}) {
  const dringend = m?.schwere === "blocker" ? "BLOCKIERT" : (m?.code_noetig ? "Code" : "Einstellung");
  const praxis = m?.praxis_name || m?.praxis || "unbekannte Praxis";
  const betreff = `[Pickadoc] Meldung (${dringend}) — ${praxis}: ${m?.kategorie_text || "Sonstiges"}`;

  const zeilen = [
    "Es wurde ein Problem an Clara gemeldet.",
    "",
    `Praxis:        ${praxis}${m?.praxis ? ` (${m.praxis})` : ""}`,
    `Gemeldet von:  ${m?.gemeldet_von || "unbekannt"}`,
    `Art:           ${m?.kategorie_text || "Sonstiges"}`,
    `Schwere:       ${m?.schwere_text || ""}`,
    `Fehlerklasse:  ${m?.fehlerklasse || "unklar"}`,
    `Zu lösen per:  ${m?.code_noetig ? "CODE (Entwicklung)" : "Einstellung in der Praxis"}`,
  ];
  if (m?.gemeinter_name) zeilen.push(`Gemeinter Name: ${m.gemeinter_name}`);
  if (m?.text) zeilen.push("", "Wortlaut der Praxis:", m.text);
  zeilen.push(
    "",
    `Fall-Nummer:   ${m?.fall || "—"}`,
    "",
    "Der vollständige Verlauf mit Tonaufnahme liegt bei der Praxis und ist",
    "bewusst nicht Teil dieser E-Mail.",
  );
  if (basis) zeilen.push("", `Zentraler Eingang: ${basis}/improve-zentrale.html`);
  zeilen.push("", "— automatische Meldung aus der Improve-Seite");

  return { betreff, text: zeilen.join("\n") };
}

/** Name der Praxis, damit in der Liste nicht nur Kennungen stehen. Best effort. */
async function praxisName(clientId) {
  try {
    const doc = await db.collection("clients").doc(String(clientId)).get();
    return String(doc.data()?.name || "").trim();
  } catch {
    return "";
  }
}

/**
 * Alarm verschicken. Absender ist ein eingerichtetes Postfach des Pickadoc-
 * Mandanten. Schlaegt es fehl, wird das am Eintrag vermerkt und NICHT
 * geworfen — eine Meldung darf nie daran scheitern, dass die Mail klemmt.
 */
export async function sendeAlarm(m, { basis = "" } = {}) {
  try {
    const konten = await listAccounts(ALARM_ABSENDER_CLIENT);
    const konto = konten.find((a) => a.enabled !== false && a.smtp?.host) || konten[0];
    if (!konto?.id) return { ok: false, fehler: "kein Absender-Postfach eingerichtet" };
    const { betreff, text } = alarmMail(m, { basis });
    const out = await sendMail(ALARM_ABSENDER_CLIENT, konto.id, { to: [ALARM_AN], subject: betreff, text });
    return out?.ok ? { ok: true } : { ok: false, fehler: String(out?.reason || "Versand abgelehnt") };
  } catch (e) {
    return { ok: false, fehler: String(e?.message || e) };
  }
}

/**
 * Eine Meldung in die Sammelstelle legen und Pickadoc benachrichtigen.
 *
 * Absichtlich fehlertolerant: Weder ein fehlender Praxisname noch eine
 * klemmende E-Mail duerfen die Meldung verhindern.
 */
export async function zentralEintragen(daten, { basis = "", warten = false } = {}) {
  const name = daten?.praxis_name || (await praxisName(daten?.clientId));
  const m = baueMeldung({ ...daten, praxis: name });
  const ref = db.collection(COL).doc();
  await ref.set(m);

  // Der Eintrag ist geschrieben — DAS ist die Zusage an die Praxis. Der
  // Mailversand haengt an einem fremden Server und darf den Absende-Knopf
  // nicht sekundenlang blockieren; sein Ausgang wird nachgetragen und ist in
  // der Sammelstelle sichtbar.
  const versand = (async () => {
    const alarm = await sendeAlarm(m, { basis });
    await ref.update({
      mail_status: alarm.ok ? "raus" : "fehlgeschlagen",
      mail_fehler: alarm.ok ? "" : String(alarm.fehler || "").slice(0, 300),
    }).catch(() => {});
    if (!alarm.ok) log.warn?.("improve.alarm_mail_fehlgeschlagen", { fehler: alarm.fehler });
    return alarm;
  })().catch((e) => ({ ok: false, fehler: String(e?.message || e) }));

  if (warten) return { id: ref.id, ...(await versand) };
  return { id: ref.id };
}

/**
 * Die Sammelstelle lesen — neueste zuerst.
 *
 * @param {{nurCode?:boolean, nurOffen?:boolean, limit?:number}} opts
 */
export async function zentraleListe({ nurCode = false, nurOffen = false, limit = 100 } = {}) {
  const snap = await db.collection(COL)
    .orderBy("createdAt", "desc")
    .limit(Math.min(500, Math.max(1, Number(limit) || 100)))
    .get();
  let liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Gefiltert wird im Speicher: Die Sammelstelle ist klein, und so braucht es
  // keine zusaetzlichen Datenbank-Indizes fuer jede Filterkombination.
  if (nurCode) liste = liste.filter((m) => m.code_noetig);
  if (nurOffen) liste = liste.filter((m) => m.status !== "erledigt");
  return liste;
}

/** Wie viele ungelesene Meldungen liegen an? Fuer den Hinweis im Superuser-Konto. */
export async function zentraleAnzahl() {
  const liste = await zentraleListe({ limit: 500 });
  return {
    ungelesen: liste.filter((m) => !m.gelesen).length,
    offen_code: liste.filter((m) => m.code_noetig && m.status !== "erledigt").length,
    blocker: liste.filter((m) => m.schwere === "blocker" && m.status !== "erledigt").length,
    gesamt: liste.length,
  };
}

/**
 * Gelesen-Haken bzw. Bearbeitungsstand setzen.
 *
 * Der Stand wird ZURUECK an die Praxis geschrieben. Ohne das bliebe die
 * Meldung fuer den Melder auf ewig "neu" — er haette keinen Anhaltspunkt, ob
 * sich ueberhaupt jemand darum kuemmert, und wuerde beim naechsten Mal gar
 * nicht mehr melden. Best effort: Klemmt der Rueckweg, bleibt der Stand hier
 * trotzdem gesetzt.
 */
export async function setzeStand(id, { gelesen, status, notiz } = {}) {
  const patch = {};
  if (gelesen != null) patch.gelesen = !!gelesen;
  if (status && ["neu", "in_arbeit", "erledigt"].includes(String(status))) patch.status = String(status);
  if (notiz != null) patch.notiz = String(notiz).slice(0, 600);
  if (!Object.keys(patch).length) return { ok: false, fehler: "nichts zu ändern" };
  patch.updatedAt = Date.now();

  const ref = db.collection(COL).doc(String(id));
  const vorher = await ref.get();
  await ref.update(patch);

  let zurueck = false;
  const praxis = String(vorher.data()?.praxis || "").trim();
  const fall = String(vorher.data()?.fall || "").trim();
  if (praxis && fall && (patch.status || patch.notiz != null)) {
    try {
      const rueck = { updatedAt: patch.updatedAt };
      if (patch.status) rueck.status = patch.status;
      if (patch.notiz != null) rueck.antwort = patch.notiz;
      await masCollection(praxis, "mas_improve_faelle").doc(fall).update(rueck);
      zurueck = true;
    } catch (e) {
      log.warn?.("improve.stand_rueckweg_fehlgeschlagen", { fehler: String(e?.message || e) });
    }
  }
  return { ok: true, zurueck };
}

export const ZENTRALE_COL = COL;
export const ZENTRALE_ALARM_AN = ALARM_AN;
