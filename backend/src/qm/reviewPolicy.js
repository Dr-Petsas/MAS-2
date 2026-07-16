// ============================================================================
// Gültigkeit von QM-Plänen (Vorgabe 11.07.2026).
//
// Der Nutzer kennt die gesetzlichen Aktualisierungsfristen nicht — also legt
// Julia sie fest. Regel bewusst einfach und konservativ:
//   • Pläne (type "plan"): jährliche Überprüfung/Aktualisierung (12 Monate).
//     RKI/KRINKO (Hygiene-/Reinigungsplan), ArbSchG/BioStoffV/GefStoffV
//     (Gefährdungsbeurteilung), MPBetreibV (Aufbereitung) verlangen mindestens
//     jährliche Prüfung bzw. Prüfung bei Änderung.
//   • Röntgen-Sachverständigenprüfung: alle 5 Jahre (StrlSchG/StrlSchV).
//   • Laufende Bücher/Register (Charge, Verbandbuch, Geräteverzeichnis …):
//     KEIN Ablauf — sie werden fortlaufend geführt, nicht "aktualisiert".
//
// 0 = kein Ablauf. Wer feinere Fristen will, überschreibt hier per key.
// ============================================================================

const OVERRIDES = Object.freeze({
  radiation_expert_inspection: 60, // Sachverständigenprüfung Röntgen: 5 Jahre
});

const DEFAULT_PLAN_MONTHS = 12;

/** Überprüfungsintervall in Monaten für ein Katalog-Artefakt (0 = kein Ablauf). */
export function reviewIntervalMonthsFor(artifact) {
  if (!artifact) return 0;
  if (OVERRIDES[artifact.key]) return OVERRIDES[artifact.key];
  return artifact.type === "plan" ? DEFAULT_PLAN_MONTHS : 0;
}
