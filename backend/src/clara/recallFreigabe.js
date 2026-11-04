// Recall-Freigabe nur im Recall-Gespraech (Vorfall 04.11.2026): Das "Ja, bitte"
// des Chefs auf Lisas Einzelanruf-Rueckfrage loeste zusaetzlich approve_recall
// aus — acht Patienten wurden ungewollt angerufen. Die Freigabe zaehlt deshalb
// nur, wenn das LETZTE Gespraechsthema die Recall-Liste war; lag ein Lisa-
// Einzelauftrag dazwischen oder ist das Recall-Gespraech zu alt, fragt Clara
// einmal ausdruecklich nach. Zustand bewusst im Speicher: nach einem Neustart
// fragt Clara lieber einmal zu viel.

export const RECALL_GESPRAECH_PFADE = new Set([
  "/tools/gap-briefing",
  "/tools/recall-candidates",
  "/tools/recall-remove-candidate",
  "/tools/recall-instruction-preview",
  "/tools/recall-instruction-adjust",
]);

export const EINZEL_AUFTRAG_PFADE = new Set([
  "/tools/delegate-call",
  "/tools/gapfill-call-patient",
  "/tools/send-sms",
  "/tools/dictate",
]);

const GESPRAECH_GUELTIG_MS = 15 * 60 * 1000;
// Ein Aufruf direkt nach Claras Rueckfrage stammt noch aus demselben Zug.
const MIN_NACH_RUECKFRAGE_MS = 4000;

const stand = new Map();

function eintrag(clientId) {
  let e = stand.get(clientId);
  if (!e) {
    e = { recallAt: 0, einzelAt: 0, rueckfrageAt: 0 };
    stand.set(clientId, e);
  }
  return e;
}

export function merkeAufruf(clientId, pfad, jetzt = Date.now()) {
  if (!clientId) return;
  if (RECALL_GESPRAECH_PFADE.has(pfad)) eintrag(clientId).recallAt = jetzt;
  else if (EINZEL_AUFTRAG_PFADE.has(pfad)) eintrag(clientId).einzelAt = jetzt;
}

export function pruefeRecallFreigabe(clientId, jetzt = Date.now()) {
  const e = eintrag(clientId);
  if (e.rueckfrageAt && e.rueckfrageAt > e.einzelAt
      && jetzt - e.rueckfrageAt >= MIN_NACH_RUECKFRAGE_MS
      && jetzt - e.rueckfrageAt <= GESPRAECH_GUELTIG_MS) {
    e.rueckfrageAt = 0;
    return { ok: true };
  }
  const recallAktuell = e.recallAt > e.einzelAt && jetzt - e.recallAt <= GESPRAECH_GUELTIG_MS;
  if (recallAktuell) return { ok: true };

  const warEinzel = e.einzelAt > e.recallAt;
  if (!(e.rueckfrageAt && jetzt - e.rueckfrageAt < MIN_NACH_RUECKFRAGE_MS)) e.rueckfrageAt = jetzt;
  return {
    ok: false,
    needsConfirm: true,
    message: warEinzel
      ? "Die Recall-Anrufliste habe ich NICHT freigegeben – Ihr Ja galt dem Einzelauftrag. Soll Lisa wirklich zusätzlich die wartende Recall-Liste abtelefonieren?"
      : "Soll Lisa wirklich die wartende Recall-Anrufliste jetzt abtelefonieren?",
  };
}

export function _zuruecksetzen() {
  stand.clear();
}
