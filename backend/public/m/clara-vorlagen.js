// Vorgaben fuer die Anliegen-Knoepfe der Clara-Seite (/m/clara-start.html).
// Der Text ist das, was Bianca weiss, wenn der Patient zurueckruft. Eine Praxis
// kann jeden Text auf der Seite aendern und fuer den Knopf merken; gemerkte
// Texte liegen je Praxis im Backend (GET/PUT /brain/notiz-vorlagen).
//
// kurz: Name des Reiters (wie im Termin-Fenster der Plattform)
// termin: true  -> der Anrufer soll einen Termin bekommen
// rueckruf: true -> die Praxis moechte zurueckrufen
window.CLARA_VORLAGEN = [
  {
    id: "allgemein",
    titel: "Allgemein",
    kurz: "Allgemein",
    knoepfe: [
      {
        id: "rueckruf",
        label: "Wir bitten um Rückruf",
        rueckruf: true,
        text: "Wir haben versucht, den Patienten zu erreichen, und möchten ihn persönlich sprechen. Bitte fragen, wann er gut erreichbar ist, und einen Rückruf für das Praxisteam notieren.",
      },
      {
        id: "kontrolle",
        label: "Kontrolltermin vereinbaren",
        termin: true,
        text: "Wir haben angerufen, weil die jährliche Kontrolle fällig ist. Bitte einen Kontrolltermin vereinbaren.",
      },
      {
        id: "zahnreinigung",
        label: "Zahnreinigung vereinbaren",
        termin: true,
        text: "Wir haben angerufen, weil die nächste professionelle Zahnreinigung fällig ist. Bitte einen Termin dafür vereinbaren.",
      },
      {
        id: "termin-verlegt",
        label: "Termin muss verlegt werden",
        termin: true,
        text: "Wir haben angerufen, weil wir den vereinbarten Termin leider verlegen müssen. Bitte um Entschuldigung bitten und einen neuen Termin vereinbaren.",
      },
      {
        id: "unterlagen",
        label: "Unterlagen liegen bereit",
        text: "Wir haben angerufen, weil Unterlagen zum Abholen bereitliegen. Der Patient kann sie während der Sprechzeiten am Empfang abholen.",
      },
      {
        id: "rechnung",
        label: "Frage zur Rechnung",
        rueckruf: true,
        text: "Wir haben wegen einer Rechnung angerufen. Bitte keine Beträge nennen, sondern einen Rückruf für das Praxisteam notieren und fragen, wann der Patient erreichbar ist.",
      },
    ],
  },
  {
    id: "ze",
    titel: "Zahnersatz und Schienen (ZE)",
    kurz: "ZE",
    knoepfe: [
      {
        id: "ze-da",
        label: "Zahnersatz ist fertig",
        termin: true,
        text: "Wir haben angerufen, weil der Zahnersatz aus dem Labor da ist. Bitte einen Termin zum Einsetzen vereinbaren.",
      },
      {
        id: "schiene-da",
        label: "Schiene ist fertig",
        termin: true,
        text: "Wir haben angerufen, weil die Schiene fertig ist. Bitte einen kurzen Termin zum Einsetzen vereinbaren.",
      },
      {
        id: "hkp-genehmigt",
        label: "Kostenplan ist genehmigt",
        termin: true,
        text: "Wir haben angerufen, weil die Krankenkasse den Heil- und Kostenplan genehmigt hat. Bitte einen Termin für den Beginn der Behandlung vereinbaren.",
      },
      {
        id: "hkp-unterschrift",
        label: "Kostenplan zur Unterschrift",
        termin: true,
        text: "Wir haben angerufen, weil der Heil- und Kostenplan fertig ist und unterschrieben werden muss. Bitte einen kurzen Termin dafür vereinbaren oder fragen, ob der Patient in der Sprechzeit vorbeikommt.",
      },
      {
        id: "anprobe",
        label: "Anprobe vereinbaren",
        termin: true,
        text: "Wir haben angerufen, weil der Zahnersatz zur Anprobe da ist. Bitte einen Termin zur Anprobe vereinbaren.",
      },
    ],
  },
  {
    id: "par",
    titel: "Zahnfleisch (PAR)",
    kurz: "PAR",
    knoepfe: [
      {
        id: "upt",
        label: "Zahnfleisch-Nachsorge vereinbaren",
        termin: true,
        text: "Wir haben angerufen, weil der nächste Nachsorgetermin nach der Zahnfleischbehandlung fällig ist (in der Praxis UPT genannt). Bitte diesen Termin vereinbaren.",
      },
      {
        id: "par-start",
        label: "Zahnfleischbehandlung beginnen",
        termin: true,
        text: "Wir haben angerufen, weil die Krankenkasse die Zahnfleischbehandlung genehmigt hat. Bitte die Termine für die Behandlung vereinbaren.",
      },
      {
        id: "par-kontrolle",
        label: "Kontrolle nach Zahnfleischbehandlung",
        termin: true,
        text: "Wir haben angerufen, weil die Kontrolle nach der Zahnfleischbehandlung ansteht. Bitte einen Termin dafür vereinbaren.",
      },
    ],
  },
  {
    id: "kons",
    titel: "Füllungen und Wurzelbehandlung (Kons)",
    kurz: "KONS",
    knoepfe: [
      {
        id: "fuellung",
        label: "Füllung vereinbaren",
        termin: true,
        text: "Wir haben angerufen, weil bei der Kontrolle eine Füllung geplant wurde. Bitte einen Termin dafür vereinbaren.",
      },
      {
        id: "wurzel",
        label: "Wurzelbehandlung fortsetzen",
        termin: true,
        text: "Wir haben angerufen, weil die Wurzelbehandlung fortgesetzt werden muss. Bitte bald einen Termin vereinbaren.",
      },
    ],
  },
  {
    id: "slm",
    titel: "Schlafmedizin (SLM)",
    kurz: "SLM",
    knoepfe: [
      {
        id: "schlafschiene-da",
        label: "Schlafschiene ist fertig",
        termin: true,
        text: "Wir haben angerufen, weil die Schlafschiene fertig ist. Bitte einen Termin zum Einsetzen vereinbaren.",
      },
      {
        id: "schlafschiene-kontrolle",
        label: "Kontrolle der Schlafschiene",
        termin: true,
        text: "Wir haben angerufen, weil die Kontrolle der Schlafschiene ansteht. Bitte einen Termin dafür vereinbaren.",
      },
      {
        id: "schlaf-unterlagen",
        label: "Unterlagen vom Schlaflabor fehlen",
        rueckruf: true,
        text: "Wir haben angerufen, weil uns für die Schlafschiene noch Unterlagen vom Schlaflabor oder vom Hausarzt fehlen. Bitte den Patienten bitten, sie in der Praxis abzugeben oder zu schicken.",
      },
    ],
  },
];
