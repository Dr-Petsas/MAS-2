// Kontaktverlauf: Annahme der Meldungen, Fortschreiben von Termin und Einhaltung, die eine Auskunft.
// Die Regeln stehen in kontaktVerlaufLogik.js (rein); hier ist nur der Zugriff auf Praxisgedaechtnis und Kalender.
//
// - POST /brain/kontakt-verlauf/sendung   die Plattform meldet jede SMS und E-Mail aus Luecke fuellen und Kampagne
// - POST /brain/kontakt-verlauf/reaktion  die Plattform meldet Link geoeffnet, Antwort, Buchung ueber die Buchungsseite
// - GET  /brain/kontakt-verlauf           Eintraege und Zahlen fuer Clara-Seite und Monitor
//
// Gelesen wird im Kalender nur gezielt: der verknuepfte Termin ueber seine Kennung und die Termine von Patienten,
// die in den letzten 14 Tagen kontaktiert wurden. Geschrieben wird nur der Block `verlauf` am eigenen Eintrag.
//
// Vertrag: internal/kontakt-verlauf-schnittstelle.md (Projektspeicher).

import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { loadBooking } from "../clara/booking.js";
import { queryByPatient } from "./eventStore.js";
import { LISA_ANRUF_EXTRACTOR } from "./lisaAnrufe.js";
import {
  ZURECHNEN_MS, abfrageAus, berlinTag, berlinUhrzeit, einhaltungAus, eintragFuerReaktion, ersatzTermin, mitPruefen, monateVon, passtZurAbfrage,
  pruefeReaktion, pruefeSendung, reaktionAnwenden, sendungEintrag, terminForm, terminNachZeit, termineZurechnen, verlaufAusAnruf, verlaufVon,
  verlaufZeile, zahlenAus,
} from "./kontaktVerlaufLogik.js";

const FieldValue = admin.firestore.FieldValue;
const TAKT_MS = 10 * 60_000;
const PATIENTEN_JE_LAUF = 150;
const TERMINE_JE_LAUF = 300;
const PRUEFZEIT_SCHREIBEN_MS = 6 * 3_600_000;
const GLEICHZEITIG = 8;
export const EINTRAEGE_HOECHSTENS = 500;

const col = (clientId) => masCollection(clientId, "mas_events");
const text = (v) => (v == null ? "" : String(v).trim());

async function inGruppen(liste, fn) {
  for (let i = 0; i < liste.length; i += GLEICHZEITIG) await Promise.all(liste.slice(i, i + GLEICHZEITIG).map(fn));
}

function termine(clientId, standort) {
  return admin.firestore().collection("clients").doc(clientId).collection("locations").doc(standort).collection("appointments");
}

async function termineVonPatient(clientId, standort, patientId) {
  const snap = await termine(clientId, standort).where("patient.id", "==", patientId)
    .select("start", "createdAt", "updatedAt", "deletedAt", "patientAbsentExcusedAt", "status", "patientStatus", "isDeleted", "createdBy", "calendar.name").get();
  return snap.docs.map((d) => ({ ...terminForm(d.id, d.data()), standort }));
}

async function terminLesen(clientId, standort, id) {
  const snap = await termine(clientId, standort).doc(id).get();
  return snap.exists ? { ...terminForm(snap.id, snap.data()), standort } : null;
}

async function ladeMonate(clientId, monate) {
  const teile = await Promise.all(monate.map((m) => col(clientId).where("verlauf.monat", "==", m).get()));
  return teile.flatMap((s) => s.docs.map((d) => d.data()));
}

/** Meldung der Plattform zu einer SMS oder E-Mail annehmen. Dieselbe `kontakt_id` noch einmal erzeugt nichts Neues. */
export async function speichereSendung(clientId, roh = {}) {
  const p = pruefeSendung(roh);
  if (!p.ok) return p;
  const eintrag = sendungEintrag(clientId, p.sendung);
  const ref = col(clientId).doc(eintrag.id);
  if ((await ref.get()).exists) return { ok: true, id: eintrag.id, neu: false };
  if (roh.trocken === true) return { ok: true, id: eintrag.id, neu: true, trocken: true };
  try {
    await ref.create({ ...eintrag, createdAt: FieldValue.serverTimestamp() });
  } catch (err) {
    if (err?.code !== 6 /* ALREADY_EXISTS */) throw err;
    return { ok: true, id: eintrag.id, neu: false };
  }
  return { ok: true, id: eintrag.id, neu: true };
}

/** Meldung der Plattform zu einer Reaktion annehmen und am passenden Kontakt vermerken. */
export async function speichereReaktion(clientId, roh = {}) {
  const p = pruefeReaktion(roh);
  if (!p.ok) return p;
  const r = p.reaktion;
  // Die genannte Sendung, sonst (auch wenn sie hier unbekannt ist) der juengste Kontakt des Patienten davor.
  let e = null;
  if (r.kontakt_id) {
    const snap = await col(clientId).doc(r.kontakt_id).get();
    if (snap.exists) e = eintragFuerReaktion([snap.data()], r);
  }
  if (!e) e = eintragFuerReaktion(await queryByPatient(clientId, r.patient_id, 300), { ...r, kontakt_id: "" });
  if (!e) return { ok: true, zugeordnet: false };
  const neu = reaktionAnwenden(verlaufVon(e), r);
  if (neu && roh.trocken !== true) await col(clientId).doc(e.id).update({ verlauf: neu, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true, zugeordnet: true, id: e.id, geaendert: !!neu, ...(roh.trocken === true ? { trocken: true } : {}) };
}

const letzterLauf = new Map();
const laufend = new Map();
const nachgetragen = new Set();
// Wann ein Patient oder ein Termin zuletzt nachgesehen wurde: bei mehr Arbeit als ein Lauf schafft, kommen
// die am laengsten nicht gesehenen zuerst dran. Nur im Speicher; nach einem Neustart beginnt die Reihe neu.
const zuletztGesehen = new Map();
const gesehen = (k) => zuletztGesehen.get(k) || 0;
const aelteste = (liste, schluessel, hoechstens) => [...liste].sort((a, b) => gesehen(schluessel(a)) - gesehen(schluessel(b))).slice(0, hoechstens);

/** Nur fuer Tests: den Takt vergessen. */
export function _taktVergessen() {
  letzterLauf.clear();
  nachgetragen.clear();
  zuletztGesehen.clear();
}

/**
 * Termin und Einhaltung fortschreiben: spaeter gebuchte Termine den Kontakten zurechnen, Rueckrufe als Reaktion
 * vermerken, verknuepfte Termine nachsehen. Hoechstens alle zehn Minuten je Praxis; laeuft schon einer, wird
 * auf ihn gewartet.
 */
export async function fortschreiben(clientId, { jetzt = Date.now(), erzwingen = false } = {}) {
  if (laufend.has(clientId)) return laufend.get(clientId);
  if (!erzwingen && jetzt - (letzterLauf.get(clientId) || 0) < TAKT_MS) return { uebersprungen: true };
  const lauf = (async () => {
    try {
      return await einLauf(clientId, jetzt);
    } finally {
      laufend.delete(clientId);
      letzterLauf.set(clientId, Date.now());
    }
  })();
  laufend.set(clientId, lauf);
  return lauf;
}

const ohnePruefzeit = (v) => JSON.stringify({ ...v, einhaltung: { ...v.einhaltung, geprueft_ms: 0 } });

async function einLauf(clientId, jetzt) {
  const c = col(clientId);
  const aus = { nachgetragen: 0, zugerechnet: 0, reaktionen: 0, geaendert: 0, fehler: 0 };
  const stand = new Map();
  const vorher = new Map();
  const merke = (e) => {
    if (stand.has(e.id)) return;
    const v = verlaufVon(e);
    if (!v) return;
    stand.set(e.id, { event: e, verlauf: v });
    vorher.set(e.id, ohnePruefzeit(v));
  };

  // Anrufe von Lisa aus der Zeit vor dem Block bekommen ihn einmal nachgetragen, damit die Auskunft sie findet.
  if (!nachgetragen.has(clientId)) {
    const alt = await c.where("extractor", "==", LISA_ANRUF_EXTRACTOR).get();
    for (const d of alt.docs) {
      const e = d.data();
      if (e.verlauf || !e.anruf) continue;
      await d.ref.update({ verlauf: verlaufAusAnruf(e.anruf), updatedAt: FieldValue.serverTimestamp() });
      aus.nachgetragen += 1;
    }
    nachgetragen.add(clientId);
  }

  const seit = jetzt - ZURECHNEN_MS;
  const frisch = (await ladeMonate(clientId, monateVon(berlinTag(seit), berlinTag(jetzt)))).filter((e) => (verlaufVon(e)?.kontakt.ms || 0) >= seit);
  const offen = (await c.where("verlauf.pruefen", "==", true).get()).docs.map((d) => d.data());
  for (const e of [...frisch, ...offen]) merke(e);

  let standardStandort = null;
  const standortVon = async (v) => {
    if (text(v.standort)) return text(v.standort);
    if (standardStandort === null) standardStandort = text((await loadBooking(clientId).catch(() => null))?.locationId);
    return standardStandort;
  };
  const terminCache = new Map();
  const termineFuer = async (standort, patientId) => {
    const k = `${standort}|${patientId}`;
    if (!terminCache.has(k)) terminCache.set(k, termineVonPatient(clientId, standort, patientId).catch(() => { aus.fehler += 1; return []; }));
    return terminCache.get(k);
  };

  // Die alte TelefonKI meldet auch Lisas eigene Anrufe als eingehenden Anruf (siehe kontaktPruefung.js).
  // Die sind kein Rueckruf: ihre Kennungen stehen am Auftrag.
  let berichte = null;
  const lisaBerichte = () => {
    if (!berichte) {
      berichte = masCollection(clientId, "mas_lisa_tasks").where("ts", ">=", seit - 24 * 3_600_000).limit(500).get()
        .then((snap) => new Set(snap.docs.map((d) => text(d.data()?.reportEventId)).filter(Boolean)))
        .catch(() => new Set());
    }
    return berichte;
  };

  // Je kontaktiertem Patienten: Termine zurechnen, Rueckruf als Reaktion.
  const jePatient = new Map();
  for (const e of frisch) {
    const pid = text(e.subject?.patientId);
    const s = stand.get(e.id);
    if (!pid || !s) continue;
    if (!jePatient.has(pid)) jePatient.set(pid, []);
    jePatient.get(pid).push(s);
  }
  const zuTun = aelteste([...jePatient.entries()].filter(([, liste]) => liste.some((s) => s.verlauf.kontakt.stand !== "fehlgeschlagen"
    && (s.verlauf.termin.stand !== "vereinbart" || !s.verlauf.termin.termin_id || !s.verlauf.kontakt.erreicht))), ([pid]) => `p|${clientId}|${pid}`, PATIENTEN_JE_LAUF);

  await inGruppen(zuTun, async ([pid, liste]) => {
    try {
      zuletztGesehen.set(`p|${clientId}|${pid}`, jetzt);
      const standorte = [...new Set(await Promise.all(liste.map((s) => standortVon(s.verlauf))))].filter(Boolean);
      const alle = (await Promise.all(standorte.map((so) => termineFuer(so, pid)))).flat();

      // Lisa hat einen Termin ohne Kennung gemeldet: derselbe Tag und dieselbe Uhrzeit im Kalender.
      for (const s of liste) {
        if (s.verlauf.termin.stand !== "vereinbart" || s.verlauf.termin.termin_id) continue;
        const t = terminNachZeit(s.verlauf.termin, alle);
        if (t) s.verlauf = { ...s.verlauf, standort: s.verlauf.standort || t.standort, termin: { ...s.verlauf.termin, termin_id: t.id } };
      }

      const neu = termineZurechnen(liste.map((s) => ({ id: s.event.id, verlauf: s.verlauf, angebotTerminId: s.event.sendung?.angebot_termin_id })), alle, { jetzt });
      for (const { id, termin } of neu) {
        const s = stand.get(id);
        const kontakt = s.verlauf.kontakt.erreicht ? s.verlauf.kontakt
          : { ...s.verlauf.kontakt, erreicht: true, reaktion: "buchung", reaktion_ms: termin.vereinbart_ms };
        s.verlauf = { ...s.verlauf, standort: s.verlauf.standort || text(alle.find((t) => t.id === termin.termin_id)?.standort), kontakt, termin,
          einhaltung: { stand: "offen", geprueft_ms: 0, verlegt: false } };
        aus.zugerechnet += 1;
      }

      // Rueckruf bei Bianca nach dem Kontakt.
      if (liste.some((s) => !s.verlauf.kontakt.erreicht && s.verlauf.kontakt.stand !== "fehlgeschlagen")) {
        const eigene = await lisaBerichte();
        const anrufe = (await queryByPatient(clientId, pid, 300)).filter((e) => e.channel === "bianca_call" && e.direction === "in" && !eigene.has(e.id))
          .map((e) => Number(e.ts) || 0).sort((a, b) => a - b);
        for (const s of liste) {
          const k = s.verlauf.kontakt;
          if (k.erreicht || k.stand === "fehlgeschlagen") continue;
          const ts = anrufe.find((t) => t > k.ms && t - k.ms <= ZURECHNEN_MS);
          if (!ts) continue;
          s.verlauf = { ...s.verlauf, kontakt: { ...k, erreicht: true, reaktion: "rueckruf", reaktion_ms: ts } };
          aus.reaktionen += 1;
        }
      }
    } catch {
      aus.fehler += 1;
    }
  });

  // Verknuepfte Termine nachsehen.
  const zuPruefen = aelteste([...stand.values()].filter((s) => mitPruefen(s.verlauf).pruefen), (s) => `t|${clientId}|${s.event.id}`, TERMINE_JE_LAUF);
  await inGruppen(zuPruefen, async (s) => {
    try {
      zuletztGesehen.set(`t|${clientId}|${s.event.id}`, jetzt);
      let v = s.verlauf;
      const pid = text(s.event.subject?.patientId);
      const standort = await standortVon(v);
      if (!standort) return;
      if (!text(v.termin.termin_id) && pid) {
        const t = terminNachZeit(v.termin, await termineFuer(standort, pid));
        if (t) v = { ...v, standort: v.standort || standort, termin: { ...v.termin, termin_id: t.id } };
      }
      const id = text(v.einhaltung?.verlegt_auf?.termin_id) || text(v.termin.termin_id);
      if (!id) {
        // Ohne Kennung und im Kalender nicht gefunden: erst nach dem Tag steht fest, dass nichts feststeht.
        if (v.termin.datum && v.termin.datum < berlinTag(jetzt)) {
          s.verlauf = { ...v, einhaltung: { ...v.einhaltung, stand: "unklar", hinweis: "termin_nicht_gefunden", geprueft_ms: jetzt, fertig: true } };
        }
        return;
      }
      const t = await terminLesen(clientId, standort, id);
      let e = einhaltungAus(v, t, { jetzt });
      if (e.stand === "abgesagt" && t && pid) {
        // Abgesagt und um die Absage herum neu gebucht: verlegt. Gewertet wird der neue Termin.
        const vergeben = new Set([...stand.values()].flatMap((x) => [text(x.verlauf.termin.termin_id), text(x.verlauf.einhaltung?.verlegt_auf?.termin_id)]).filter(Boolean));
        const ersatz = ersatzTermin(t, (await termineFuer(standort, pid)).filter((k) => !vergeben.has(k.id)));
        if (ersatz) {
          const auf = { termin_id: ersatz.id, datum: berlinTag(ersatz.startMs), uhrzeit: berlinUhrzeit(ersatz.startMs) };
          e = einhaltungAus({ ...v, einhaltung: { ...v.einhaltung, verlegt: true, verlegt_auf: auf } }, ersatz, { jetzt });
        }
      }
      s.verlauf = { ...v, einhaltung: e };
    } catch {
      aus.fehler += 1;
    }
  });

  // Geschrieben wird, was sich geaendert hat; die Pruefzeit allein nur, wenn sie aelter als sechs Stunden ist.
  for (const [id, s] of stand) {
    const neu = mitPruefen(s.verlauf);
    const anders = ohnePruefzeit(neu) !== vorher.get(id);
    const pruefzeitAlt = (Number(neu.einhaltung.geprueft_ms) || 0) - (Number(s.event.verlauf?.einhaltung?.geprueft_ms) || 0) > PRUEFZEIT_SCHREIBEN_MS;
    if (!anders && !pruefzeitAlt && s.event.verlauf) continue;
    if (anders) aus.geaendert += 1;
    await c.doc(id).update({ verlauf: neu, updatedAt: FieldValue.serverTimestamp() });
  }
  return aus;
}

/** Die eine Auskunft fuer Clara-Seite und Monitor: Eintraege und Zahlen, je Quelle getrennt. */
export async function auskunft(clientId, abfrage = {}, { jetzt = Date.now() } = {}) {
  const a = abfrageAus(abfrage, { jetzt });
  const hinweise = [];
  try {
    await fortschreiben(clientId, { jetzt });
  } catch (e) {
    hinweise.push(`fortschreiben:${String(e?.message || e)}`);
  }
  const events = await ladeMonate(clientId, monateVon(a.von, a.bis));
  const zeilen = events.map(verlaufZeile).filter((z) => z && passtZurAbfrage(z, a)).sort((x, y) => y.zeitMs - x.zeitMs);
  return {
    ok: true,
    clientId,
    zeitraum: { von: a.von, bis: a.bis },
    zahlen: zahlenAus(zeilen),
    ...(a.mitEintraegen ? { eintraege: zeilen.slice(0, EINTRAEGE_HOECHSTENS).map(({ patientSchluessel, ...z }) => z) } : {}),
    abgeschnitten: a.mitEintraegen && zeilen.length > EINTRAEGE_HOECHSTENS,
    hinweise,
  };
}