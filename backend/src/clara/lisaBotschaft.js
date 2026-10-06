// L3b (Chef 29.07.2026, Live 23:17): Aus "du sollst morgen frueh Termine
// machen" wurde ein naechtlicher Anruf mit leerer Botschaft ("Bitte kommen
// Sie morgen frueh in die Praxis" — auf "Wieso?" mauerte Lisa). Ein
// delegierter Anruf braucht eine INHALTLICHE Botschaft: Ein blosses "Komm in
// die Praxis" ohne jeden Grund wird nicht gewaehlt — Clara fragt stattdessen
// nach der Botschaft.
//
// 06.10.2026 (Register reg-05): Eine Absage oder Verschiebung IST die
// Botschaft. "Sie muessen morgen nicht in die Praxis kommen" wurde als leere
// Einbestellung abgelehnt. Die Verneinung zaehlt nur, wenn sie das Kommen
// selbst betrifft ("Kommen Sie in die Praxis, nicht vergessen" bleibt leer).

const EINBESTELLUNG_RE = /\b(?:komm\w*|vorbei\s?kommen|erschein\w*|in\s+die\s+praxis|zu\s+uns)\b/i;

const GRUND_RE = /\b(?:weil|wegen|grund|da\s|termin\w*|kontroll\w*|schmerz\w*|befund\w*|labor\w*|abhol\w*|besprech\w*|ergebnis\w*|unterlagen|rezept\w*|krank\w*|dringend\w*|nachricht|ausricht\w*|mitteil\w*|zahn\w*|behandl\w*|implant\w*|prothes\w*|krone\w*|fuellung\w*|füllung\w*|reinigung\w*|blutung\w*|op\b|operation\w*)\b/i;

const ABSAGE_RES = [
  /\bnicht\s+(?:\S+\s+){0,4}?(?:komm\w*|erschein\w*|vorbei\w*|in\s+die\s+praxis)/i,
  /\b(?:komm\w*|erschein\w*)\s+(?:\S+\s+){0,3}?nicht\b/i,
  /\b(?:muss|m(?:ü|ue)ss\w*|brauch\w*)\s+(?:\S+\s+){0,5}?nicht\b/i,
  /\b(?:absag\w*|abgesagt|entf(?:ä|ae)ll\w*|ausf(?:ä|ae)ll\w*|verschoben|verschieb\w*|verlegt)\b/i,
  /\bf(?:ä|ae)llt\s+(?:\S+\s+){0,3}?aus\b/i,
  /\b(?:sp(?:ä|ae)ter|fr(?:ü|ue)her)\b/i,
];

/** true = keine verwertbare Botschaft -> nicht waehlen, nach dem Inhalt fragen. */
export function botschaftFehlt(instruction) {
  const text = String(instruction || "").replace(/\s+/g, " ").trim();
  if (text.length < 15) return true;
  if (!EINBESTELLUNG_RE.test(text) || GRUND_RE.test(text)) return false;
  return !ABSAGE_RES.some((re) => re.test(text));
}
