# -*- coding: utf-8 -*-
"""Setzt die Kapitel der Clara-Tour neu (17.08.2026, Chef-Vorgabe).

Warum als Skript und nicht per Hand: die Kapitel liegen als grosser HTML-Block
in clara-tour.html; Reihenfolge UND Nummerierung aendern sich zusammen. Das
Skript tauscht ausschliesslich den Bereich zwischen <main class="deck"> und
<footer> aus - Kopf, CSS und Skript der Seite bleiben unberuehrt.

Vorgaben des Chefs (17.08.2026, 21:27):
- Die drei starken Themen ZUERST: Next-Patient-Briefing, Terminlueckenfueller,
  papierlose Post (Scan-Dienstleister -> Nadine als E-Mail, vorsortiert,
  paraphiert, vorbeantwortet).
- KEIN Eigenlob ueber Wahrhaftigkeit: "ich erzaehle nur die Wahrheit",
  "Halluzinations-Schutz" und aehnliche Selbstauskuenfte fliegen raus.
- Dopplungen ersetzen (das Briefing stand vorher in drei Kapiteln, Feiertage
  doppelt, Sprach-Intelligenz und Persoenlichkeit ueberlappten).
Inhaltlich gedeckt durch die Werkzeug-Inventur (74 Sprach-Werkzeuge) und das
MAS-Backend - nichts, was es nicht gibt.
"""
import io
import pathlib
import re

SEITE = pathlib.Path(r"F:\MAS-2\backend\public\m\clara-tour.html")

# (Akzentfarbe, Titel, Ansage-Text, Prompt, Ueberschrift, Vorspann, Karten)
# Karten: (Vorderseite-Titel, Vorderseite-Text, Rueckseiten-Label, Rueckseite)
KAPITEL = [
    (
        "turq", "Willkommen",
        "Ich bin Clara, Ihre interne Sprach-Assistentin. Scrollen Sie sich durch die Kapitel — ich fange mit dem an, was Ihnen im Alltag am meisten Zeit spart, und arbeite mich dann durch den Rest.",
        "Stelle dich in zwei Saetzen als interne Sprach-Assistentin des Praxis-Chefs vor und sage, dass die Tour mit den drei staerksten Themen beginnt: das Briefing zum naechsten Patienten, das Fuellen von Terminluecken und die papierlose Post. Kein Gruss, keine Selbstauskunft ueber Zuverlaessigkeit.",
        "Ich bin <span class=\"accent\">Clara</span>.",
        "Ihre interne Sprach-Assistentin. Wir fangen mit den drei Dingen an, die im Alltag am meisten bringen — danach kommt der Rest, Kapitel für Kapitel.",
        [("Auf Zuruf", "Sagen Sie es in einem Satz — ich mache den Rest.", "So sagen Sie es", "Guten Morgen, Clara!"),
         ("Das ganze Team", "Nadine, Bianca, Lisa, Julia, Lena, Sophie, Marie.", "So sagen Sie es", "Lass Nadine den Brief schreiben."),
         ("Ohne Bildschirm", "Freihändig am Headset, während Sie behandeln.", "So sagen Sie es", "Clara, brief mich zum nächsten Patienten.")],
    ),
    (
        "amber", "Next-Patient-Briefing",
        "Bevor der nächste Patient ins Zimmer kommt, fasse ich Ihnen in wenigen Sekunden zusammen, was Sie über ihn wissen müssen: was beim letzten Mal gemacht wurde, was in seinem Anamnesebogen auffällt, welche Unterlagen fehlen und was zwischenzeitlich telefonisch oder per Mail hereinkam. Sie können auch einen einzelnen Namen oder eine Uhrzeit nennen. Standardmäßig nehme ich die nächsten zwei Patienten.",
        "Erklaere das Briefing zum naechsten Patienten als deine wichtigste Aufgabe: wenige Sekunden vor dem Aufruf das Wesentliche zum Patienten - letzte Behandlung, Auffaelligkeiten aus dem Anamnesebogen (Allergien, Medikamente, Vorerkrankungen), fehlende Unterlagen, dazwischen eingegangene Anrufe und Mails. Erwaehne, dass man auch einen Namen oder eine Uhrzeit nennen kann und dass es standardmaessig die naechsten zwei Patienten sind. Nenne ein Beispiel, wie man es sagt.",
        "Nie mehr <span class=\"accent\">unvorbereitet</span> ins Zimmer.",
        "Wenige Sekunden vor dem Aufruf: letzte Behandlung, Auffälligkeiten aus dem Anamnesebogen, fehlende Unterlagen, neue Anrufe und Mails zu diesem Patienten.",
        [("Der Nächste", "Standard: die nächsten zwei Patienten.", "So sagen Sie es", "Brief mich zum nächsten Patienten."),
         ("Ein Name", "Auch mitten am Tag, für einen einzelnen.", "So sagen Sie es", "Was mache ich bei Mustafa Gülhan heute?"),
         ("Eine Uhrzeit", "Wer kommt um zehn, und was steht an.", "So sagen Sie es", "Wer kommt um zehn Uhr und was machen wir da?"),
         ("Aus dem Bogen", "Allergie, Medikament, Vorerkrankung.", "Klingt dann so", "Markierung in der Kartei: Allergie Bienenstich."),
         ("Was fehlt", "Aufklärung noch nicht unterschrieben.", "Klingt dann so", "Bei zwei Terminen fehlen noch Unterlagen.")],
    ),
    (
        "green", "Terminlücken füllen",
        "Eine Lücke im Kalender ist verlorener Umsatz. Ich zeige Ihnen die Lücken der nächsten Tage und dazu Patienten aus dem Recall-Topf, die passen. Angerufen wird niemand, bevor Sie freigeben — dann übernimmt Lisa, ruft an oder schickt eine SMS mit Zusage-Link, und die erste Zusage bucht den Platz. Wen Lisa gerade erreicht hat, sage ich Ihnen jederzeit.",
        "Erklaere den Lueckenfueller als Umsatz-Thema: freie Luecken im Kalender plus passende Patienten aus dem Recall-Topf, Kandidaten werden dir vorgelesen und koennen einzeln gestrichen werden. Betone, dass NIEMAND angerufen wird, bevor der Chef freigibt, dass Lisa danach anruft oder eine SMS mit Zusage-Link schickt und die erste Zusage den Platz bucht. Erwaehne, dass er den Zwischenstand abfragen kann. Nenne ein Beispiel, wie man es sagt.",
        "Aus Lücken werden <span class=\"accent\">Termine</span>.",
        "Lücken finden, passende Patienten vorschlagen, nach Ihrer Freigabe anrufen lassen — die erste Zusage bucht den Platz.",
        [("Lücken zeigen", "Wo im Kalender ist morgen Luft.", "So sagen Sie es", "Wo habe ich morgen Lücken?"),
         ("Kandidaten hören", "Bis zu acht Namen pro Lücke, einzeln streichbar.", "So sagen Sie es", "Lies mir die Kandidaten vor."),
         ("Ansage vorher prüfen", "Was Lisa am Telefon sagen wird — vor der Freigabe.", "So sagen Sie es", "Was sagt Lisa denn genau?"),
         ("Freigeben", "Erst jetzt ruft Lisa an oder schickt die SMS.", "So sagen Sie es", "Gib die Liste frei."),
         ("Zwischenstand", "Gebucht, abgesagt, nicht erreicht.", "So sagen Sie es", "Wie weit ist Lisa mit dem Recall?"),
         ("Einer gezielt", "Ein bestimmter Patient für eine bestimmte Lücke.", "So sagen Sie es", "Ruf Frau Weber für die Lücke am Donnerstag an.")],
    ),
    (
        "purple", "Keine Papierpost mehr",
        "Ihre Hauspost geht zum Scan-Dienstleister und kommt als E-Mail bei Nadine an — kein Papier, keine Ablage, keine Postmappe. Nadine sortiert alles ein: Rechnung, Labor, Kammer, Beschwerde, Anwaltsschreiben. Was beantwortet werden muss, liegt schon als Entwurf da, mit dem passenden Zusammenhang aus Vorgang, Telefonaten und früheren Briefen. Ich lese Ihnen den Eingang vor, Sie sagen ja — dann geht es raus.",
        "Erklaere die papierlose Post: die Hauspost wird von einem Scan-Dienstleister digitalisiert und landet als E-Mail bei Nadine. Nadine sortiert nach Art (Rechnung, Labor, Kammer, Beschwerde, Anwaltsschreiben), bereitet Antworten als ENTWURF vor und zieht dafuer den Zusammenhang aus Vorgang, Telefonaten und frueheren Briefen zusammen. Du liest den Eingang vor, kannst eine einzelne Nachricht zusammenfassen oder im Volltext vorlesen, und verschickt wird erst nach ausdruecklicher Freigabe. Nenne ein Beispiel, wie man es sagt.",
        "Post kommt <span class=\"accent\">vorbereitet</span>, nicht als Stapel.",
        "Scan-Dienstleister digitalisiert die Hauspost, Nadine sortiert und beantwortet vor. Sie hören zu und geben frei — Papier fällt weg.",
        [("Kein Papier", "Hauspost wird gescannt und kommt als E-Mail an.", "Heißt konkret", "Keine Postmappe, keine Ablage."),
         ("Vorsortiert", "Rechnung, Labor, Kammer, Beschwerde, Anwalt.", "So sagen Sie es", "Was ist heute reingekommen?"),
         ("Vorbeantwortet", "Antwort liegt als Entwurf bereit.", "So sagen Sie es", "Frag mal Nadine, was im Posteingang liegt."),
         ("Mit Zusammenhang", "Vorgang, Telefonate und alte Briefe stecken im Entwurf.", "So sagen Sie es", "Schreib der Frau Müller, dass ihr Termin rutscht."),
         ("Vorlesen", "Kurzfassung — oder Wort für Wort.", "So sagen Sie es", "Lies mir die Mail vom Labor vor."),
         ("Erst Ihr Ja", "Gesendet wird nur nach Ihrer Freigabe.", "So sagen Sie es", "Ja, schick das so raus.")],
    ),
    (
        "turq", "So sprechen Sie mit mir",
        "Sprechen Sie in ganzen Sätzen mit mir, nicht in Stichworten. Sagen Sie lieber: Sag den Termin von Herrn Meier am Dienstag ab. Je mehr Zusammenhang in einem Satz steckt — Name, Tag und Absicht zusammen —, desto sicherer treffe ich das Richtige.",
        "Erklaere freundlich, dass man dich am besten in ganzen Saetzen steuert und Stichworte vermeidet, weil Name, Tag und Absicht zusammen den Zusammenhang liefern. Gib ein Beispiel fuer einen guten Satz.",
        "Ganze Sätze statt <span class=\"accent\">Stichworte</span>.",
        "Name, Tag und Absicht am besten zusammen in einem Satz — dann treffe ich sicher das Richtige.",
        [],  # eigener Baustein unten (steer)
    ),
    (
        "amber", "Ihr Tag",
        "Morgens sage ich Ihnen, was ansteht und was über Nacht hereinkam, abends nur noch das, was für morgen wirklich wichtig ist. Zwischendurch frage ich Sie ab: wie voll der Tag ist, wo Luft ist, wer heute kommt. Und wenn es brennt — Anwalt, Kammer, Mahnung, Frist —, steht das oben. Feiertage und Wochenenden erkenne ich; einen Feiertag behandle ich nie als Arbeitstag.",
        "Erklaere den Tagesrhythmus: Morgen-Auftakt mit Kritischem zuerst, Tagesplan und Eingaengen ueber Nacht; Abend-Fokus nur mit dem Dringenden fuer morgen; dazwischen Tagesueberblick (wie voll, wo Luecken) und die Patientenliste. Erwaehne die Dringlichkeitsliste (Anwalt, Kammer, Mahnung, Fristen) und dass du Feiertage und Wochenenden erkennst und nie einen Arbeitstag vorgaukelst. Sprich NICHT ueber das Briefing zum naechsten Patienten - das hatten wir schon.",
        "Der Tag, in <span class=\"accent\">Ihrem</span> Takt.",
        "Morgens der Auftakt, abends der Fokus auf morgen — dazwischen Auskunft auf Zuruf. Was brennt, steht immer oben.",
        [("Morgen-Auftakt", "Kritisches zuerst, dann der Plan und was nachts kam.", "So sagen Sie es", "Guten Morgen, Clara — was steht an?"),
         ("Abend-Fokus", "Nur noch das, was für morgen zählt.", "So sagen Sie es", "Feierabend, Clara — mach den Tagesabschluss."),
         ("Wie voll wird's", "Anzahl, Zeitraum, wo Luft ist.", "So sagen Sie es", "Heads-up für morgen — wie voll wird's?"),
         ("Wer kommt heute", "Namen, Uhrzeit, Behandlungsgrund.", "So sagen Sie es", "Wer kommt heute bei Doktor Berg?"),
         ("Was brennt", "Anwalt, Kammer, Mahnung, Fristen, Beschwerden.", "So sagen Sie es", "Clara, was brennt?"),
         ("Feiertag erkannt", "NRW-Kalender, jedes Jahr neu gerechnet.", "Klingt dann so", "Morgen ist Fronleichnam — die Praxis bleibt zu.")],
    ),
    (
        "green", "Patienten & Termine",
        "Bei Terminen suche ich erst den richtigen Patienten und handle dann. Ich buche, sage ab, verschiebe, nenne den nächsten freien Termin und sage Ihnen, wann jemand zuletzt da war oder das nächste Mal kommt. Bei mehreren gleich klingenden Namen frage ich nach, statt zu raten — und abgesagt wird nur, wenn Sie es bestätigen.",
        "Erklaere, dass du bei Terminen immer erst den richtigen Patienten sicher findest und dann handelst: buchen, absagen (nur nach Bestaetigung), verschieben mit Ausweich-Slots, naechster freier Termin, letzter und naechster Termin eines Patienten. Erwaehne, dass du bei mehreren aehnlich klingenden Namen nachfragst. Nenne ein Beispiel, wie man es sagt.",
        "Erst den <span class=\"accent\">Richtigen</span>, dann handeln.",
        "Patient finden, buchen, absagen, verschieben, freie Zeiten prüfen — mit Beleg aufs gekoppelte Handy.",
        [("Patient finden", "Über den gesprochenen Namen, auch bei ähnlichem Klang.", "So sagen Sie es", "Such mir mal die Frau Ketsetzi."),
         ("Buchen", "Der Kalender füllt sich live mit, Beleg kommt aufs Handy.", "So sagen Sie es", "Buch ihr morgen um zehn eine Kontrolle."),
         ("Absagen", "Ich finde den Termin über Name und Tag — und frage vorher.", "So sagen Sie es", "Sag den Termin von Herrn Meier am Dienstag ab."),
         ("Verschieben", "Ich schlage freie Zeiten vor und buche erst nach Ihrem Ja um.", "So sagen Sie es", "Der Termin von Frau Wagner muss verschoben werden."),
         ("Nächster freier", "Aus echten Slots, optional nach Arzt und Behandlung.", "So sagen Sie es", "Wann ist der nächste freie Termin für eine PZR?"),
         ("Letzter Besuch", "Wann jemand da war und wann er wiederkommt.", "So sagen Sie es", "Wann war Herr Bauer zuletzt da?")],
    ),
    (
        "purple", "Praxisgedächtnis",
        "Alles, was in der Praxis passiert, sammle ich pro Patient: Anrufe, SMS, Mails, Briefe, Notizen und offene Vorgänge. Fragen Sie mich, was mit Herrn Meier war, und ich lese seine Spur vor. Sagen Sie: Merk dir, Herr Fischer braucht eine neue Schiene — und die Notiz kommt zu seinem nächsten Termin von allein wieder hoch. Bianca, Lisa und Nadine schreiben in dasselbe Gedächtnis, deshalb weiß ich auch, was am Telefon besprochen wurde, als Sie behandelt haben.",
        "Erklaere das geteilte Praxisgedaechtnis: pro Patient laufen Anrufe, SMS, Mails, Briefe, Notizen und offene Vorgaenge zusammen; Bianca, Lisa und Nadine schreiben in dasselbe Gedaechtnis. Nenne den Zeitstrahl auf Zuruf, die Notiz die beim naechsten Termin von allein wiederkommt, Vorgaenge oeffnen, ergaenzen, delegieren und schliessen, sowie dass du bei einer unbekannten Nummer sagen kannst, wer da vermutlich anruft. Nenne ein Beispiel, wie man es sagt.",
        "Einmal gesagt, immer <span class=\"accent\">da</span>.",
        "Ein Gedächtnis für das ganze Team: Anrufe, Mails, Briefe, Notizen und Vorgänge — pro Patient an einem Ort.",
        [("Die ganze Spur", "Was mit einem Patienten war, neueste Ereignisse zuerst.", "So sagen Sie es", "Was war eigentlich mit Herrn Meier?"),
         ("Notiz, die wiederkommt", "Steht beim nächsten Termin von allein da.", "So sagen Sie es", "Merk dir, Herr Fischer braucht eine neue Schiene."),
         ("Delegieren", "Vorgang mit Auftrag an Nadine, Lisa oder das Team.", "So sagen Sie es", "Pack das auf Nadine, sie soll wegen der Rechnung schreiben."),
         ("Der Patient von vorhin", "Ich knüpfe auch im nächsten Gespräch an.", "So sagen Sie es", "Der Patient von vorhin — buch ihm morgen um zehn."),
         ("Unbekannte Nummer", "Wer da vermutlich anruft und warum.", "So sagen Sie es", "Wer ruft mich da an?"),
         ("Team-Notiz", "Einmal gesagt, alle wissen es.", "So sagen Sie es", "Sag dem Team, der Kompressor wird Freitag gewartet.")],
    ),
    (
        "pink", "Telefon: rein und raus",
        "Bianca nimmt die Patientenanrufe an, auch wenn bei Ihnen niemand am Tresen steht, und schreibt jedes Gespräch ins Gedächtnis. Ich sage Ihnen danach, wer angerufen hat und worum es ging. In die andere Richtung schicke ich Lisa los: sie ruft an und richtet aus, was Sie gesagt haben, verschickt SMS im Wortlaut und meldet zurück, was dabei herauskam.",
        "Erklaere die zwei Telefon-Richtungen: eingehend nimmt Bianca die Patientenanrufe an und schreibt sie ins Praxisgedaechtnis, du liest danach das Anrufprotokoll und den Tages-Eingang vor (Anrufe, Mails, Briefe). Ausgehend beauftragst du Lisa: anrufen und etwas ausrichten, SMS im Wortlaut verschicken, Ergebnis zurueckmelden. Erwaehne die Kontaktkarte aufs Handy. Sage NICHT, dass du laufende Gespraeche mithoerst - du liest das Protokoll danach. Nenne ein Beispiel, wie man es sagt.",
        "Ein Anruf geht nie <span class=\"accent\">verloren</span>.",
        "Bianca nimmt an und schreibt mit, Lisa ruft raus und meldet zurück — Sie hören von mir nur das Ergebnis.",
        [("Wer hat angerufen", "Aus dem frischen Protokoll des Tages.", "So sagen Sie es", "Hat heute jemand angerufen?"),
         ("Alles, was reinkam", "Anrufe, Mails, Briefe, Empfang — in einem Rutsch.", "So sagen Sie es", "Was ist heute alles reingekommen?"),
         ("Anruf beauftragen", "Lisa ruft an und richtet es aus.", "So sagen Sie es", "Lass Herrn Hoffmann anrufen, die Montage ist Montag."),
         ("Rückmeldung", "Was beim Anruf herauskam.", "So sagen Sie es", "Was hat Lisa bei Herrn Hoffmann erreicht?"),
         ("SMS im Wortlaut", "Genau der Text, den Sie sagen.", "So sagen Sie es", "Schick Frau Schneider eine SMS: Ihr Rezept liegt bereit."),
         ("Kontaktkarte", "Nummer vorlesen und antippbar aufs Handy.", "So sagen Sie es", "Wie ist die Handynummer von Herrn Bauer?")],
    ),
    (
        "red", "Fristen & Eskalation",
        "Anwaltsschreiben, Kammer, Mahnung, Pfändung: solche Sachen dürfen nicht in einem Stapel liegen bleiben. Ich ziehe Fristen und offene Rechnungen aus Mails, gescannter Post und Telefonaten zusammen und sage Ihnen, was überfällig ist, was heute fällig wird und was bald ansteht. Beträge stehen dabei auf der Karte am Handy, ich spreche sie nicht aus.",
        "Erklaere den Fristen- und Eskalations-Blick: aus Mails, gescannter Post und Telefonaten ziehst du Fristen und offene Rechnungen zusammen - ueberfaellig, heute faellig, bald faellig - und meldest Kritisches wie Anwalt, Kammer, Mahnung oder Pfaendung zuerst. Erwaehne, dass Betraege nur auf der Karte am Handy stehen und nicht gesprochen werden, und dass eine Wiedervorlage abgehakt werden kann. Nenne ein Beispiel, wie man es sagt.",
        "Keine Frist mehr im <span class=\"accent\">Stapel</span>.",
        "Fristen und offene Rechnungen aus Mail, Post und Telefon — überfällig, heute, bald. Beträge nur auf der Karte, nicht gesprochen.",
        [("Was ist überfällig", "Fristen, die schon abgelaufen sind.", "So sagen Sie es", "Was ist bei den Fristen überfällig?"),
         ("Heute fällig", "Was heute raus muss.", "So sagen Sie es", "Was wird heute fällig?"),
         ("Eskalation zuerst", "Anwalt, Kammer, Mahnung, Pfändung.", "Klingt dann so", "Ein Anwaltsschreiben, seit Freitag offen."),
         ("Abhaken", "Erledigt ist erledigt.", "So sagen Sie es", "Die Rechnung vom Labor ist bezahlt, hak das ab."),
         ("Beträge diskret", "Zahlen stehen auf der Karte am Handy.", "Warum", "Im Behandlungszimmer hört jemand mit.")],
    ),
    (
        "turq", "Dokumentation & Abrechnung",
        "Sie sprechen, Lena schreibt: Behandlungen diktieren Sie einfach, den Befund nehmen wir am iPad im Zahnschema auf, und einen Nachtrag zu einem vergangenen Termin können Sie jederzeit hinterherschieben. Sophie schlägt Ihnen dazu die passenden Ziffern vor. Wenn irgendwo Doku fehlt, sage ich es Ihnen — und wenn eine Rückfrage nervt, stellen wir die Regel dauerhaft ab.",
        "Erklaere die Sprachdokumentation mit Lena und die Abrechnung mit Sophie: Behandlung diktieren, Befund am iPad im Zahnschema aufnehmen, Nachtrag zu einem vergangenen Termin, Diktat streichen statt loeschen, Doku vorlesen und in der Doku suchen, praxisweite Doku-Luecken der letzten Tage, Doku-Regeln dauerhaft anpassen. Sophie liefert Abrechnungs-VORSCHLAEGE und offene Abrechnungsfragen - sie rechnet nichts von allein ab. Nenne ein Beispiel, wie man es sagt.",
        "Sprache rein, <span class=\"accent\">Doku</span> raus.",
        "Behandlung diktieren, Befund am iPad, Nachtrag hinterher — Sophie schlägt die Ziffern vor.",
        [("Behandlung diktieren", "Frei sprechen, Lena strukturiert.", "So sagen Sie es", "Nimm für Frau Meier ein Diktat auf."),
         ("Befund am iPad", "Zahnschema öffnet sich für den Patienten.", "So sagen Sie es", "Starte den Befund für Herrn Meier."),
         ("Nachtrag", "Auch für einen vergangenen Termin.", "So sagen Sie es", "Ich muss noch was zu gestern nachtragen."),
         ("Streichen statt löschen", "Falsches bleibt sichtbar durchgestrichen.", "So sagen Sie es", "Streich den letzten Satz im Diktat."),
         ("Was fehlt noch", "Doku-Lücken der letzten Tage, praxisweit.", "So sagen Sie es", "Wo fehlt noch Dokumentation?"),
         ("Ziffern-Vorschlag", "Sophie schlägt vor, Sie entscheiden.", "So sagen Sie es", "Rechne den Termin von Frau Meier ab.")],
    ),
    (
        "amber", "Qualitätsmanagement",
        "Julia hält das Qualitätsmanagement zusammen: Prüfungen, Hygiene- und Steri-Pläne, Gerätebücher. Fragen Sie mich, was fällig ist — ich sage Ihnen, was überfällig ist, was diese Woche dran ist und wer es zuletzt gemacht hat. Die Aufgaben selbst landen als Push bei der zuständigen Mitarbeiterin, die sie am Handy abhakt.",
        "Erklaere das Qualitaetsmanagement mit Julia: du gibst Auskunft aus dem QM-Kalender - was ueberfaellig ist, was diese Woche und diesen Monat faellig wird, wann die naechste Pruefung dran ist und wer zuletzt erledigt hat. Die Aufgaben gehen als Push an die zustaendige Mitarbeiterin, die sie am Handy abhakt; eingerichtet wird QM in der Oberflaeche, nicht per Sprache. Nenne ein Beispiel, wie man es sagt.",
        "QM, das sich selbst <span class=\"accent\">meldet</span>.",
        "Julia kennt Prüfungen, Hygiene- und Steri-Pläne. Ich sage Ihnen, was fällig ist — abgehakt wird am Handy.",
        [("Was ist fällig", "Überfällig, diese Woche, diesen Monat.", "So sagen Sie es", "Was ist im QM überfällig?"),
         ("Nächste Prüfung", "Zum Beispiel die OPG-Konstanzprüfung.", "So sagen Sie es", "Wann ist die nächste Konstanzprüfung?"),
         ("Wer war's zuletzt", "Wer die Aufgabe das letzte Mal gemacht hat.", "So sagen Sie es", "Wer hat den Steri zuletzt geprüft?"),
         ("Push ans Handy", "Die Zuständige bekommt die Aufgabe aufs Telefon.", "Heißt konkret", "Anzeigen, starten, erledigen — fertig.")],
    ),
    (
        "green", "Urlaub, Abwesenheit & Personal",
        "Wenn Sie nicht da sind, zeige ich Ihnen zuerst, welche Termine betroffen wären — abgesagt wird nichts, bevor Sie freigeben. Danach sperre ich den Tag, storniere die Termine und jeder Patient bekommt genau eine Absage mit Buchungslink. Zum Team kann ich Ihnen sagen, wer da ist, wer krank oder im Urlaub ist und wie viel Resturlaub jemand hat. Betriebsferien trage ich ein und informiere alle per Push — nach Ihrer Bestätigung.",
        "Erklaere zwei Dinge: Erstens die Abwesenheit des Behandlers - erst der Plan mit den betroffenen Terminen, dann nach Freigabe Tag sperren, Termine stornieren, je Patient eine Absage mit Buchungslink, danach Stand abfragbar (wer hat neu gebucht). Zweitens das Personal ueber Marie - du gibst Auskunft: wer ist da, wer ist krank oder im Urlaub, Resturlaub, Besetzung, Schichtzeiten; Betriebsferien tragst du nach Bestaetigung ein und informierst alle per Push. Sage klar, dass Stempeln und einzelne Urlaubsantraege in Maries Oberflaeche laufen. Nenne ein Beispiel, wie man es sagt.",
        "Weg sein, ohne <span class=\"accent\">Chaos</span>.",
        "Erst der Plan, dann Ihre Freigabe: Tag sperren, Termine absagen, jeder Patient bekommt einen Buchungslink. Plus Auskunft zum Team.",
        [("Abwesenheit planen", "Erst zeigen, was betroffen ist — noch passiert nichts.", "So sagen Sie es", "Nächsten Freitag bin ich nicht da."),
         ("Freigeben", "Tag gesperrt, Termine abgesagt, Buchungslink raus.", "So sagen Sie es", "Ja, sag die Termine ab."),
         ("Stand danach", "Wer hat neu gebucht, wer ist noch offen.", "So sagen Sie es", "Haben die Patienten vom Freitag neu gebucht?"),
         ("Wer ist da", "Anwesend, krank, im Urlaub.", "So sagen Sie es", "Wer ist morgen im Haus?"),
         ("Resturlaub", "Wie viele Tage noch offen sind.", "So sagen Sie es", "Wie viel Resturlaub hat Nadine noch?"),
         ("Betriebsferien", "Eintragen und alle per Push informieren.", "So sagen Sie es", "Trag Betriebsferien ein, vom 24. Dezember bis zum 6. Januar.")],
    ),
    (
        "purple", "Aufgaben & Vorgänge",
        "Was Ihnen zwischen zwei Patienten einfällt, muss nicht auf einen Zettel: Sagen Sie es mir, und es wird eine Aufgabe oder ein Vorgang. Ich notiere, wer sich darum kümmert, halte den Fortschritt fest und schließe den Vorgang, wenn er durch ist. Was offen ist, sage ich Ihnen im Morgen-Auftakt.",
        "Erklaere Aufgaben und Vorgaenge: Aufgabe oder Erinnerung notieren, Vorgang zu einem Patienten finden, an Nadine, Lisa oder das Team delegieren, Fortschritt festhalten, Vorgang schliessen - und dass offene Vorgaenge im Morgen-Auftakt auftauchen. Nenne ein Beispiel, wie man es sagt.",
        "Der Zettel, der nie <span class=\"accent\">verschwindet</span>.",
        "Aufgabe sagen, Zuständige benennen, Fortschritt festhalten, Vorgang schließen — offene Punkte kommen morgens von allein.",
        [("Aufgabe notieren", "Rückruf, Erinnerung, To-do.", "So sagen Sie es", "Erinnere mich, das Röntgenbild nachzufordern."),
         ("Vorgang finden", "Was zu einem Patienten offen ist.", "So sagen Sie es", "Gibt es einen offenen Vorgang zu Frau Weber?"),
         ("Zuständige benennen", "Nadine, Lisa oder eine Mitarbeiterin.", "So sagen Sie es", "Gib den Vorgang an Lisa, sie soll anrufen."),
         ("Schließen", "Durch ist durch.", "So sagen Sie es", "Der Vorgang mit dem Labor ist erledigt.")],
    ),
    (
        "pink", "Ihr Team über mich",
        "Über mich erreichen Sie das ganze Team: Nadine für Post, Briefe und E-Mails, Bianca am Patiententelefon, Lisa für Anrufe nach draußen und SMS, Julia für das Qualitätsmanagement, Lena für die Dokumentation, Sophie für die Abrechnung und Marie für Arbeitszeit und Urlaub. Sie sagen einfach, wer was tun soll.",
        "Stelle das Team knapp vor - Nadine (Post, Briefe, E-Mails), Bianca (Patiententelefon), Lisa (Anrufe nach draussen, SMS), Julia (Qualitaetsmanagement), Lena (Dokumentation), Sophie (Abrechnung), Marie (Arbeitszeit, Urlaub) - und betone, dass man alle ueber dich erreicht, indem man einfach sagt, wer was tun soll.",
        "Ein Zuruf — das ganze <span class=\"accent\">Team</span>.",
        "Sieben Spezialistinnen, eine Stimme. Sagen Sie einfach, wer was tun soll.",
        [],  # eigener Baustein unten (team)
    ),
    (
        "turq", "Wie ich spreche",
        "Ich rede, wie man in der Praxis redet: aus einem Datum wird morgen oder nächste Woche Montag, aus einer Uhrzeit neun Uhr zehn, aus einer Abkürzung ein ganzes Wort. Telefonnummern lasse ich Ziffer für Ziffer, damit Sie sie mitschreiben können. Ich stelle immer nur eine Frage auf einmal, und ich verstehe Deutsch und Griechisch.",
        "Erklaere, wie du sprichst: relatives Datum statt Zahlenkolonne (morgen, naechste Woche Montag), Uhrzeiten und Mengen als Woerter, Abkuerzungen ausgeschrieben, Telefonnummern bleiben Ziffer fuer Ziffer zum Mitschreiben. Erwaehne, dass du immer nur eine Frage auf einmal stellst und Deutsch und Griechisch verstehst, auch griechische Namen. Sprich NICHT ueber Zuverlaessigkeit, Wahrheit oder Halluzinationen.",
        "Ich klinge wie eine <span class=\"accent\">Kollegin</span>.",
        "Relatives Datum, Uhrzeiten als Wörter, Abkürzungen ausgeschrieben — Telefonnummern Ziffer für Ziffer.",
        [("Relatives Datum", "Aus dem 18. August wird morgen.", "Klingt dann so", "Das ist morgen, Dienstag."),
         ("Uhrzeit & Menge", "09:10 wird neun Uhr zehn.", "Klingt dann so", "Sie haben zwölf Termine."),
         ("Nummer bleibt", "Ziffer für Ziffer, zum Mitschreiben.", "Warum", "Nummern muss man hören können."),
         ("Deutsch & Griechisch", "Auch griechische Namen sitzen.", "So sagen Sie es", "Kalimera, ti rantevou exoume simera?")],
    ),
]

STEER = """      <div class="steer">
        <div class="box no"><div class="lab">✗ lieber nicht</div><div class="line">„Termin. Meier. Absagen."</div><div class="line">„Nummer."</div><div class="line">„SMS."</div></div>
        <div class="box yes"><div class="lab">✓ so verstehe ich Sie sicher</div><div class="line">„Sag den Termin von Herrn Meier am Dienstag ab."</div><div class="line">„Wie ist die Handynummer von Herrn Bauer?"</div><div class="line">„Schick Frau Schneider eine SMS: Ihr Rezept liegt bereit."</div></div>
      </div>
"""

TEAM = """      <div class="team">
        <div class="mate"><div class="av">N</div><div><h3>Nadine</h3><p>Post, Briefe & E-Mails</p></div></div>
        <div class="mate"><div class="av">B</div><div><h3>Bianca</h3><p>nimmt die Patientenanrufe an</p></div></div>
        <div class="mate"><div class="av">L</div><div><h3>Lisa</h3><p>ruft raus & verschickt SMS</p></div></div>
        <div class="mate"><div class="av">J</div><div><h3>Julia</h3><p>Qualitätsmanagement</p></div></div>
        <div class="mate"><div class="av">L</div><div><h3>Lena</h3><p>Dokumentation & Befund</p></div></div>
        <div class="mate"><div class="av">S</div><div><h3>Sophie</h3><p>Abrechnungsvorschläge</p></div></div>
        <div class="mate"><div class="av">M</div><div><h3>Marie</h3><p>Arbeitszeit & Urlaub</p></div></div>
      </div>
"""


def karten_html(karten):
    if not karten:
        return ""
    teile = ['      <div class="cards">']
    for titel, text, label, rueck in karten:
        teile.append('        <div class="flip"><div class="flip-in">')
        teile.append(f'          <div class="face"><h3>{titel}</h3><p>{text}</p>'
                     f'<span class="hint">tippen zum Umdrehen</span></div>')
        teile.append(f'          <div class="face back"><div class="say-l">{label}</div>'
                     f'<div class="say">{rueck}</div></div>')
        teile.append('        </div></div>')
    teile.append('      </div>')
    return "\n".join(teile) + "\n"


def deck_html():
    aus = ['<main class="deck" id="deck">', ""]
    for i, (farbe, titel, narr, prompt, h2, lead, karten) in enumerate(KAPITEL):
        an = " on" if i == 0 else ""
        nummer = f"{i + 1:02d}"
        koerper = karten_html(karten)
        if titel == "So sprechen Sie mit mir":
            koerper = STEER
        elif titel == "Ihr Team über mich":
            koerper = TEAM
        aus.append(f'  <section class="chapter{an}" style="--accent: var(--{farbe})" data-title="{titel}"')
        aus.append(f'    data-narr="{narr}"')
        aus.append(f'    data-prompt="{prompt}">')
        aus.append('    <div class="inner">')
        aus.append(f'      <div class="kicker"><span class="no">{nummer}</span> {titel}</div>')
        aus.append(f'      <h2>{h2}</h2>')
        aus.append(f'      <p class="lead">{lead}</p>')
        aus.append(koerper.rstrip("\n"))
        aus.append('      <details class="prompt"><summary>Claras Prompt für dieses Kapitel anpassen</summary>')
        aus.append(f'        <textarea>{prompt}</textarea>')
        aus.append('      </details>')
        aus.append('    </div>')
        aus.append('  </section>')
        aus.append("")
    aus.append('  <footer>picka<b style="color:var(--turq)">doc</b> · Clara — interne Fähigkeits-Tour. '
               'Scrollen Sie zum Anfang, um von vorn zu hören.</footer>')
    aus.append('</main>')
    return "\n".join(aus) + "\n"


text = io.open(SEITE, encoding="utf-8").read()
neu = deck_html()
muster = re.compile(r'<main class="deck" id="deck">.*?</main>\s*', re.DOTALL)
if not muster.search(text):
    raise SystemExit("Kapitel-Block nicht gefunden - Abbruch, nichts geaendert.")
text_neu = muster.sub(neu + "\n", text, count=1)
io.open(SEITE, "w", encoding="utf-8").write(text_neu)
print(f"{len(KAPITEL)} Kapitel geschrieben, Datei {len(text)} -> {len(text_neu)} Zeichen")
