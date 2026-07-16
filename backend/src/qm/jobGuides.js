// ============================================================================
// QM-Job-Anleitungen: WAS ist zu tun und WORAN erkenne ich, dass der Job
// erfolgreich erledigt ist. Wird bei createJob an jeden Job gehaengt
// (instructions[] + completionCriteria) und erscheint im Julia-Popup, in der
// Push-Nachricht und auf der Handy-Seite (/m/qm.html).
//
// Quelle/Pflege: bewusst hier zentral gehalten (kann spaeter in
// qm-knowledge.json wandern). Zuordnung ueber den normalisierten Job-Titel;
// greift kein exakter/enthaltender Treffer, liefert ein sinnvoller Fallback je
// Schlagwort (pruefen/unterweisung/reinigen/dokumentieren/...).
// ============================================================================

function norm(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")   // Geraete-/Zusatz-Klammern raus
    .replace(/[äöü]/g, (m) => ({ "ä": "ae", "ö": "oe", "ü": "ue" }[m]))
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Schluesselwort -> { steps, done }. Reihenfolge = Prioritaet bei Teiltreffern.
const GUIDES = [
  {
    match: ["haendedesinfektion", "spender seife", "spender haendedesinfektion"],
    steps: [
      "Alle Spender (Behandlung, Aufbereitung, WC) auf Funktion und Füllstand prüfen.",
      "Leere/fast leere Spender mit dem freigegebenen Präparat auffüllen bzw. Gebinde tauschen.",
      "Verfallsdatum des Präparats kontrollieren; abgelaufene Ware aussortieren.",
      "Pumpe/Hebel auf saubere Dosierung testen.",
    ],
    done: "Alle Spender sind funktionsfähig, gefüllt und mit gültigem Präparat bestückt.",
  },
  {
    match: ["flaechendesinfektion behandlung", "flaechen patientennah", "flaechendesinfektion"],
    steps: [
      "Behandlungsplätze nach jeder Behandlung mit dem VAH-Flächendesinfektionsmittel wischdesinfizieren.",
      "Herstellerangabe zur Einwirkzeit einhalten (Fläche muss vollständig benetzt bleiben).",
      "Bei sichtbarer Blut-/Sekretkontamination zuerst mechanisch entfernen, dann desinfizieren.",
    ],
    done: "Alle patientennahen Flächen sind wischdesinfiziert; Einwirkzeit wurde eingehalten.",
  },
  {
    match: ["ansatzloesung flaechendesinfektion", "ansatzloesung"],
    steps: [
      "Alte Ansatzlösung verwerfen, Behälter reinigen.",
      "Frische Lösung exakt nach Dosiertabelle ansetzen (Konzentration/Menge).",
      "Behälter mit Datum + Konzentration beschriften.",
    ],
    done: "Frische Wischdesinfektionslösung ist korrekt dosiert angesetzt und mit Datum beschriftet.",
  },
  {
    match: ["absauganlage", "absaugung"],
    steps: [
      "Nach der letzten Behandlung Reinigungs-/Desinfektionsmittel-Luft-Gemisch durchsaugen (Herstellerdosierung/Einwirkzeit).",
      "Siebe/Filter kontrollieren, bei Bedarf reinigen/tauschen.",
      "Außenflächen der Schläuche wischdesinfizieren.",
    ],
    done: "Absauganlage ist durchgesaugt/desinfiziert und Siebe sind frei.",
  },
  {
    match: ["fussboden", "boeden", "boden behandlung"],
    steps: [
      "Behandlungs-/Aufbereitungsräume am Arbeitsende feucht reinigen.",
      "Freigegebenes Reinigungsmittel korrekt dosieren.",
      "Sichtbare Kontamination sofort gezielt desinfizieren.",
    ],
    done: "Böden der Behandlungsräume sind feucht gereinigt.",
  },
  {
    match: ["wasserfuehrende systeme", "wasserwege", "einheit spuelen", "systeme spuelen"],
    steps: [
      "Zu Arbeitsbeginn alle Entnahmestellen (Turbine, Hand-/Winkelstück, Becherfüller) je 2 Minuten spülen.",
      "Nach jedem Patienten die benutzten Entnahmestellen ca. 20 Sekunden spülen.",
      "Ergebnis/Durchführung dokumentieren.",
    ],
    done: "Wasserwege wurden gemäß Intervall gespült.",
  },
  {
    match: ["psa bestand", "psa pruefen", "schutzausruestung"],
    steps: [
      "Bestand an Handschuhen (Größen), Mund-Nasen-Schutz, Schutzbrillen und Schutzkitteln prüfen.",
      "Ablauf-/Verfallsdaten kontrollieren.",
      "Fehlmengen nachbestellen/auffüllen.",
    ],
    done: "PSA ist vollständig, unbeschädigt und in ausreichender Menge vorhanden.",
  },
  {
    match: ["instrumentenaufbereitung dokumentieren", "aufbereitung dokumentieren"],
    steps: [
      "Reinigung/Desinfektion, Verpackung, Sterilisation und Freigabe je Charge im Steri-Dokusystem erfassen.",
      "Prozessparameter (Programm, Chargennummer) auf Sollbereich prüfen.",
      "Freigabe durch die autorisierte Person bestätigen.",
    ],
    done: "Alle Chargen des Tages sind dokumentiert und freigegeben.",
  },
  {
    match: ["tagesroutine autoklav", "vakuum", "bowie dick", "bowie-dick"],
    steps: [
      "Vor der ersten Charge Vakuum-/Bowie-Dick-Test (bzw. Herstellerroutine) durchführen.",
      "Testergebnis auf 'bestanden' prüfen; Testkörper/Streifen aufbewahren.",
      "Ergebnis dokumentieren.",
    ],
    done: "Tagestest des Autoklaven ist durchgeführt und bestanden.",
  },
  {
    match: ["tuer staubschutzdichtungen", "dichtungen autoklav", "staubschutzdichtungen"],
    steps: [
      "Türdichtung des Autoklaven auf Risse/Verschmutzung sichtprüfen und reinigen.",
      "Staubschutz-/Schubladendichtungen kontrollieren.",
      "Defekte Dichtungen zum Tausch melden.",
    ],
    done: "Dichtungen sind sauber, dicht und ohne sichtbare Schäden.",
  },
  {
    match: ["sterilgutlager", "vorratsschrank", "lagerdauer"],
    steps: [
      "Sterilgutlager auf Sauberkeit und Trockenheit prüfen.",
      "Verpackungen auf Unversehrtheit kontrollieren; beschädigte aussortieren.",
      "Lagerdauer/Verfallsdaten prüfen, abgelaufenes Sterilgut erneut aufbereiten.",
    ],
    done: "Lager ist sauber, alle Verpackungen intakt und innerhalb der Lagerfrist.",
  },
  {
    match: ["wasserqualitaet", "ve wasser", "ve-wasser"],
    steps: [
      "VE-Wasser/Speisewasser des Autoklaven gemäß Herstellervorgabe prüfen (Leitwert).",
      "Wert mit dem Sollbereich vergleichen.",
      "Bei Abweichung Wasser tauschen/Anlage prüfen.",
    ],
    done: "Wasserqualität liegt im vom Hersteller vorgegebenen Sollbereich.",
  },
  {
    match: ["hautschutzplan"],
    steps: [
      "Verfügbarkeit von Hautschutz-, Hände- und Pflegepräparaten am Waschplatz prüfen.",
      "Aushang des Hautschutzplans auf Aktualität kontrollieren.",
      "Fehlende Präparate auffüllen.",
    ],
    done: "Hautschutzmittel sind vorhanden und der Hautschutzplan hängt aktuell aus.",
  },
  {
    match: ["konstanzpruefung", "roentgen konstanz"],
    steps: [
      "Prüfkörper gemäß QS-Richtlinie aufnehmen.",
      "Messwerte mit den Bezugswerten der Abnahmeprüfung vergleichen.",
      "Ergebnis (bestanden/nicht bestanden) und Messwert dokumentieren.",
    ],
    done: "Konstanzprüfung ist durchgeführt und im Sollbereich; Ergebnis dokumentiert.",
  },
  {
    match: ["sachverstaendigenpruefung"],
    steps: [
      "Termin mit dem/der Sachverständigen vereinbaren.",
      "Prüfung durchführen lassen, Prüfbericht entgegennehmen.",
      "Ergebnis und Sachverständige/n dokumentieren, Prüfbericht ablegen.",
    ],
    done: "Sachverständigenprüfung ist erfolgt und der Prüfbericht liegt vor.",
  },
];

// Fallback nach Schlagwort im Titel.
function fallback(titleNorm, typ) {
  if (/unterweisung|schulung|einweisung/.test(titleNorm) || typ === "unterweisung") {
    return {
      steps: [
        "Team anhand des aktuellen Plans/der SOP unterweisen.",
        "Inhalte und Datum festhalten.",
        "Teilnehmende per Unterschrift/Lesebestätigung quittieren lassen.",
      ],
      done: "Alle zuständigen Beschäftigten sind unterwiesen und haben quittiert.",
    };
  }
  if (/pruefen|aktualisieren|begehung|review/.test(titleNorm) || typ === "review" || typ === "pruefung") {
    return {
      steps: [
        "Ist-Zustand mit den Vorgaben abgleichen.",
        "Abweichungen/Mängel notieren und beheben (oder melden).",
        "Ergebnis dokumentieren; ggf. Version/Datum aktualisieren.",
      ],
      done: "Prüfung ist durchgeführt, Abweichungen behoben und dokumentiert.",
    };
  }
  if (/reinig|desinfekt|spuel|wisch/.test(titleNorm)) {
    return {
      steps: [
        "Bereich/Gerät gemäß Reinigungs- und Desinfektionsplan behandeln.",
        "Freigegebenes Mittel korrekt dosieren, Einwirkzeit einhalten.",
        "Durchführung dokumentieren.",
      ],
      done: "Reinigung/Desinfektion ist gemäß Plan erfolgt.",
    };
  }
  if (/dokument/.test(titleNorm) || typ === "doku") {
    return {
      steps: [
        "Vorgang vollständig im vorgesehenen System/Formular erfassen.",
        "Pflichtangaben und Freigabe prüfen.",
      ],
      done: "Der Vorgang ist vollständig dokumentiert und freigegeben.",
    };
  }
  return {
    steps: [
      "Aufgabe gemäß QM-Plan durchführen.",
      "Durchführung/Ergebnis festhalten.",
    ],
    done: "Aufgabe ist erledigt und dokumentiert.",
  };
}

/**
 * Liefert Anleitung + Abschlusskriterium fuer einen Job.
 * @param {{title?:string, typ?:string, bookKey?:string}} job
 * @returns {{ instructions: string[], completionCriteria: string }}
 */
export function guideForJob({ title = "", typ = "" } = {}) {
  const n = norm(title);
  for (const g of GUIDES) {
    if (g.match.some((m) => n.includes(norm(m)))) {
      return { instructions: g.steps.slice(), completionCriteria: g.done };
    }
  }
  const fb = fallback(n, typ);
  return { instructions: fb.steps.slice(), completionCriteria: fb.done };
}
