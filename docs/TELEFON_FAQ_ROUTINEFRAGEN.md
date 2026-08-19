# Telefon-FAQ Bianca — 120 Routinefragen (Entwurf)

Stand: 19.08.2026 · Praxis: **med dent Zahnklinik, Düsseldorf-Grafenberg**
Status der Antworten: **Entwurf — bitte Zeile für Zeile freigeben, streichen, umformulieren.**

Fable 5 sollte die Liste gegenchecken; beide Läufe sind am Nutzungslimit
gescheitert. Die Karten 101–120 sind deshalb die Lücken aus derselben
Katalog-Logik (häufig am deutschen Zahnarzt-Telefon, in 01–100 noch nicht
drin).

## So ist die Datei gedacht

- **Editieren:** Antwort-Text und Chef-Notiz direkt hier ändern. Varianten sind Formulierungen, wie Patienten wirklich anrufen.
- **Erweitern:** Neue Nummer ans Ende der passenden Kategorie, gleiche Felder.
- **Freigabe:** `offen` → `ok` wenn der Wortlaut so gesprochen werden darf. `halten` wenn Bianca das **nicht** allein sagen soll.
- **Nicht live kippen:** Claras/Biancas Prompt darf nur wenige FAQ-Paare tragen (aktuell max. 6 im Prompt). Die Karten gehören in ein Retrieval, nicht in jeden Anruf. Eintrag auf der Masterplan-Warteliste.

Platzhalter in eckigen Klammern bitte ersetzen, z. B. `[CHEF: PZR-Preisrahmen]`.

Sicherheit:


| Kürzel      | Bedeutung                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| `ok`        | Darf so gesprochen werden (nach Freigabe).                                |
| `praxis`    | Braucht eine praxisinterne Zahl/Regel von Ihnen.                          |
| `triage`    | Keine Diagnose. Akut-Slot oder Notdienst anbieten.                        |
| `behandler` | Inhalt nur nach Rücksprache / Rückruf durch das Team.                     |
| `notdienst` | Außerhalb der Zeiten: 116 117 / KZV-Notdienst, keine Therapie am Telefon. |


---



## A · Termin und Erreichbarkeit





### 02

- **Frage:** Wann haben Sie geöffnet?
- **Varianten:** Bis wann kann ich noch anrufen? / Sind Sie samstags da?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Wir sind montags bis donnerstags von neun bis achtzehn Uhr da, freitags von neun bis sechzehn Uhr. Samstag und Sonntag ist die Praxis geschlossen. Außerhalb dieser Zeiten hilft der zahnärztliche Notdienst über 116 117.
- **Chef-Notiz: Dr.Petsas operiert ausschließlich vormittags wohingegen ab mittags nur noch kontrollenund normale termin vergeben werden**



### 03

- **Frage:** Wie ist Ihre Adresse, und wo kann ich parken?
- **Varianten:** Wo genau seid ihr? / Gibt es Parkplätze?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Sie finden uns in der Luise-Rainer-Straße 6 bis 10 in Düsseldorf-Grafenberg, Medical Center, Haus B, zweite Etage. Es gibt eine Tiefgarage mit Kurzparker-Plätzen; die Einfahrt liegt am Kreisverkehr vor dem Air-Liquide-Gebäude. Parken wird vor Ort bezahlt, auch über die App APCOA FLOW.
- **Chef-Notiz:**







### 06

- **Frage:** Ich bin neu, wie werde ich Patient bei Ihnen?
- **Varianten:** Nehmen Sie noch neue Patienten? / Erstuntersuchung.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ja, neue Patientinnen und Patienten nehmen wir gerne auf. Für die Erstuntersuchung vereinbaren wir einen Termin, bringen Sie bitte Versichertenkarte und — falls vorhanden — Röntgenbilder oder einen aktuellen Medikamentenplan mit. Online können Sie auch selbst über zahnärzte-mcd.de buchen.
- **Chef-Notiz:**



### 07

- **Frage:** Bei welchem Arzt kann ich einen Termin bekommen?
- **Varianten:** Welche Zahnärzte habt ihr? / Kann ich mir den Arzt aussuchen?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Bei uns behandeln Doktor Petsas, Doktor Patrikis und Doktor Nikolaou. Wenn Sie eine Präferenz haben, buche ich genau dort. Wenn Ihnen das egal ist, nehme ich den nächsten passenden freien Termin.
- **Chef-Notiz:** Bianca soll Ärzte nicht von selbst aufzählen, außer der Anrufer fragt.



### 08

- **Frage:** Kann ich online buchen?
- **Varianten:** Gibt es eine App? / Termin über die Website.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ja. Auf [www.zahnaerzte-mcd.de](http://www.zahnaerzte-mcd.de) können Sie selbst einen Termin buchen. Wenn Sie möchten, mache ich das auch jetzt am Telefon mit Ihnen.
- **Chef-Notiz:**



### 09

- **Frage:** Wie lange dauert der Termin?
- **Varianten:** Soll ich eine Stunde einplanen? / Bin ich schnell wieder raus?
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Das hängt vom Grund ab. Eine Kontrolle dauert in der Regel ein Viertelstunde, eine professionelle Zahnreinigung etwa eine halbe Stunde, eine Erstuntersuchung ebenfalls etwa eine halbe Stunde. Für Ihren konkreten Termin sage ich Ihnen die vorgesehene Dauer, sobald der Grund klar ist.
- **Chef-Notiz:** Dauern an echte Slot-Längen koppeln (Kalender).



### 10

- **Frage:** Kann ein Familienmitglied für mich anrufen und buchen?
- **Varianten:** Ich rufe für meine Mutter an. / Termin für mein Kind.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ja, das geht. Ich brauche Vor- und Nachnamen der Person, für die der Termin ist, und eine Telefonnummer, unter der wir sie erreichen. Bei Minderjährigen bitte zusätzlich das Geburtsdatum und wer mitkommt.
- **Chef-Notiz:**

---



## B · Schmerzen, Notfall, akute Beschwerden



### 11

- **Frage:** Ich habe Zahnschmerzen, können Sie mich heute noch sehen?
- **Varianten:** Es pocht seit gestern. / Der Zahn tut höllisch weh.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Das tut mir leid. Bei Schmerzen schaue ich nach dem nächsten akuten Termin. Haben Sie Fieber, eine dicke Backe oder Probleme beim Schlucken oder Atmen?
- **Nicht sagen:** „Das ist nur der Nerv“ / „Nehmen Sie einfach Ibuprofen, dann wird das.“
- **Chef-Notiz:**



### 12

- **Frage:** Meine Backe ist dick. Ist das ein Notfall?
- **Varianten:** Ich habe eine Schwellung. / Es sieht aus wie eine Eiterbeule.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Ja das ist ein sehr dringender Notfall Wenn die Schwellung schnell größer wird, Fieber dazukommt oder Schlucken, Sprechen oder Atmen schwerfällt, kommen Sie bitte auch ohne termin sofort in die Praxis. 
- **Chef-Notiz:**



### 13

- **Frage:** Mir ist ein Stück vom Zahn abgebrochen.
- **Varianten:** Die Ecke ist ab. / Die Füllung ist rausgefallen.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Ich schaue mal, ob ich Sie bei einem Arzt heute noch unterbringen kann wenn das was kleines ist oder möchten Sie nur zu Ihrem Stammzahnarzt, dann kann das etwas dauern mit dem Termin.
- **Chef-Notiz:**



### 14

- **Frage:** Die Krone / das Inlay ist rausgefallen. Was soll ich tun?
- **Varianten:** Die Krone liegt in der Hand. / Soll ich sie wieder reinkleben?
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Bitte nicht selbst festkleben, auch nicht mit Sekundenkleber oder Haftcreme auf Verdacht. Heben Sie die Krone trocken auf und bringen Sie sie mit. Ich suche einen zeitnahen Termin, damit der Zahn nicht weiter empfindlich wird.
- **Chef-Notiz:**



### 15

- **Frage:** Ich habe nach einer Behandlung immer noch Schmerzen. Ist das normal?
- **Varianten:** Seit der Wurzelbehandlung pocht es. / Nach der Füllung tut alles weh.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Leichte Empfindlichkeit kann nach einer Behandlung vorkommen, starke, zunehmende oder pochen­de Schmerzen, Schwellung oder Fieber nicht einfach abwarten. Ich kann das nicht am Telefon beurteilen. Ich schaue nach einem zeitnahen Kontrolltermin beim Behandler.
- **Chef-Notiz:**



### 16

- **Frage:** Was mache ich, wenn die Praxis zu ist und ich starke Schmerzen habe?
- **Varianten:** Notdienst Nummer? / Wochenende, Zahn kaputt.
- **Sicherheit:** notdienst
- **Freigabe:** offen
- **Antwort:** Außerhalb unserer Öffnungszeiten wählen Sie 116 117 für den zahnärztlichen Bereitschaftsdienst, oder schauen Sie auf der Notdienstseite der Kassenzahnärztlichen Vereinigung. Bei Atemnot, schnell zunehmender Schwellung oder hohem Fieber bitte die Notaufnahme.
- **Chef-Notiz:** Optional lokale Düsseldorfer Notdienst-URL ergänzen.



### 17

- **Frage:** Mein Zahnfleisch blutet stark. Muss ich kommen?
- **Varianten:** Es blutet beim Zähneputzen. / Nach dem Faden blutet es nicht mehr auf.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Gelegentliches Bluten beim Putzen klären wir in einer Kontrolle oder Prophylaxe. Wenn es stark, anhaltend oder nach einem Unfall blutet, oder Sie Blutverdünner nehmen, hole ich einen zeitnahen Termin und frage kurz nach Medikamenten. Am Telefon kann ich die Ursache nicht festlegen.
- **Chef-Notiz:**



### 18

- **Frage:** Ich habe so ein Druckgefühl, als wäre der Zahn zu hoch.
- **Varianten:** Ich beiße nicht richtig. / Nach der Füllung stört der Biss.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Wenn der Biss stört, sollte das zeitnah eingeschliffen werden, damit der Zahn nicht überlastet. Ich buche einen kurzen Termin zur Bisskontrolle. Bis dahin kauen Sie möglichst auf der anderen Seite und beißen nicht fest auf den Zahn.
- **Chef-Notiz:**



### 19

- **Frage:** Der Zahn ist nach einem Schlag locker / ich hatte einen Unfall.
- **Varianten:** Mein Kind ist gestürzt. / Sportunfall, Zahn verschoben.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Nach einem Zahnunfall sehen wir Sie so schnell wie möglich. Bitte bewahren Sie abgebrochene Stücke feucht auf — am besten in kalter Milch oder einer Zahnrettungsbox, nicht in Küchenpapier. Bei Bewusstlosigkeit, starker Blutung oder Kieferbruch bitte zuerst Notaufnahme.
- **Chef-Notiz:**



### 20

- **Frage:** Kann ich mit Weisheitszahnschmerzen einfach vorbeikommen?
- **Varianten:** Der Weisheitszahn entzündet sich. / Es schwillt am Kieferwinkel.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Bitte nicht unangemeldet in das volle Wartezimmer. Ich suche einen akuten Termin. Bei Fieber, Kieferklemme oder Schwellung am Hals gilt dasselbe wie bei jeder Entzündung: lieber heute als morgen, und bei Atemnot die Notaufnahme.
- **Chef-Notiz:**

---



## C · Kosten, Versicherung, Rezept, AU



### 21

- **Frage:** Was kostet eine professionelle Zahnreinigung?
- **Varianten:** PZR Preis? / Zahlt die Kasse die Reinigung?
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Die professionelle Zahnreinigung ist in der Regel eine Privatleistung. Der genaue Betrag für Ihren Fall  hängt vom Aufwand ab. In der Regal berechnen unsere Zahnärzte um die hundertzwanzig bis hundertfünfzig Euro , wenn Sie alle Zöhne haben. Wichtig ist zu erwähs die Zahnärzte die Reinigungen persönlich machen. Sie sind da sehr bemüht.] Viele Krankenkassen oder Zusatzversicherungen erstatten einen Teil — die Abrechnung klären wir vor Ort.
- **Chef-Notiz:** hundertzwanzig bis hundertfünfzig Euro  



### 22

- **Frage:** Übernimmt die Krankenkasse die Behandlung?
- **Varianten:** Zahlt die Kasse Implantate? / Was ist Kassenleistung?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Das hängt von der Behandlung und Ihrem Versicherungsverhältnis ab. Kassenleistungen erklären wir nach der Untersuchung. Für Zahnersatz und größere Planungen bekommen Sie einen Heil- und Kostenplan, den Sie bei der Kasse einreichen. IHr Arzt erklärt Ihnen alles, sollen wir den  Termin machen?
- **Chef-Notiz:**



### 23

- **Frage:** Ich bin privat versichert / Beihilfe. Läuft das anders?
- **Varianten:** GOZ? / Reicht ihr direkt bei der Versicherung ein?
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Privat und Beihilfe rechnen wir nach der Gebührenordnung ab. Einen Kostenvoranschlag oder Heil- und Kostenplan erstellen wir, bevor größere Maßnahmen starten. Ob und wie schnell Ihre Versicherung erstattet, hängt von Ihrem Tarif ab — das können wir nicht verbindlich zusagen.
- **Chef-Notiz:** 



### 24

- **Frage:** Kann ich die Rechnung in Raten zahlen?
- **Varianten:** Gibt es Finanzierung? / Ratenzahlung Zahnarzt.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Ja es gibt die Möglichkeit Raten zu zahlen, natürlich!
- **Chef-Notiz:** Ratenzahlung ist möglich , wir erklären alles im Termin



### 25

- **Frage:** Brauche ich für die Kontrolle eine Überweisung?
- **Varianten:** Überweisung vom Hausarzt? / Kann ich einfach kommen?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Zum Zahnarzt brauchen Sie in der Regel keine Überweisung. Eine Überweisung ist sinnvoll, wenn ein anderer Arzt Sie gezielt zu uns schickt, zum Beispiel vom Schlaflabor. Bringen Sie vorhandene Unterlagen einfach mit.
- **Chef-Notiz:**



### 26

- **Frage:** Können Sie mir ein Rezept für Schmerzmittel ausstellen?
- **Varianten:** Rezept Ibuprofen / Antibiotikum ohne Termin.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Ein Rezept stellt nur der Zahnarzt nach medizinischer Prüfung aus, nicht die Telefonzentrale. Ohne aktuellen Befund verschreiben wir nichts. Bei Schmerzen hole ich Ihnen einen zeitnahen Termin; ein bereits besprochenes Folgerezept kann zur Abholung vorbereitet werden.
- **Chef-Notiz:**



### 27

- **Frage:** Ich brauche eine Krankschreibung wegen dem Zahn.
- **Varianten:** AU / Gelber Schein / Arbeitsunfähig nach Ziehung.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Eine Arbeitsunfähigkeitsbescheinigung stellt der Behandler aus, wenn er Sie gesehen oder die Behandlung durchgeführt hat. Am Telefon können wir das nicht ausstellen. Wenn Sie bereits in Behandlung sind, bereite ich die AU zur Abholung vor, sobald der Arzt sie freigibt.
- **Chef-Notiz:**



### 28

- **Frage:** Bekomme ich eine Rechnung für die Steuer / das Finanzamt?
- **Varianten:** Quittung / Jahresquittung Krankenkasse.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ja, Sie bekommen eine ordnungsgemäße Rechnung bzw. können eine Kopie in der Praxis anfordern. Ich notiere das für die Abrechnung. Am Telefon lese ich keine Rechnungsbeträge aus dem System vor, wenn ich sie nicht sicher vorliegen habe.
- **Chef-Notiz:**



### 30

- **Frage:** Meine Kasse hat den Plan abgelehnt. Was nun?
- **Varianten:** Widerspruch / Zuzahlung zu hoch.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Dann schauen wir unsg den Bescheid mit Ihnen an und  ändern gegebenenfalls den Plan. Ich vereinbare einen kurzen Beratungstermin oder notiere einen Rückruf.Möchten Sie einen Rückruf oder einen Termin?
- **Chef-Notiz:**

---



## D · Vor der Behandlung / Vorbereitung



### 31

- **Frage:** Was soll ich zum ersten Termin mitbringen?
- **Varianten:** Unterlagen? / Röntgenbilder vom Vorbehandler?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Bitte Versichertenkarte, einen aktuellen Medikamentenplan und falls vorhanden Allergiepass, Marcumar-Ausweis oder Röntgenbilder auf CD bzw. als Ausdruck. Eine Liste Ihrer Fragen hilft. Kommen Sie nach Möglichkeit ausgeschlafen und nicht nüchtern, außer wir haben Sie extra nüchtern bestellt.
- **Chef-Notiz:**



### 32

- **Frage:** Darf ich vorher essen? Muss ich nüchtern sein?
- **Varianten:** Narkose nüchtern? / Frühstück vor dem Termin.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Für normale Behandlung mit lokaler Betäubung dürfen Sie essen und trinken. Nüchtern müssen Sie nur sein, wenn eine Behandlung in Sedierung oder Vollnarkose geplant ist — das sagen wir Ihnen vorher ausdrücklich. Wenn unsicher: ein leichtes Essen ist besser als mit leerem Magen und Kreislaufproblemen.
- **Chef-Notiz:**



### 33

- **Frage:** Soll ich meine Blutverdünner absetzen?
- **Varianten:** Aspirin / Marcumar / Eliquis vor Ziehung.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Bitte nehmen Sie Ihre Medikamente wie gewohnt, bis der Zahnarzt das mit Ihrem Hausarzt oder Kardiologen abgestimmt hat. Bringen Sie den Medikamentenplan mit, und sagen Sie uns den Namen des Präparats beim Termin.
- **Nicht sagen:** „Setzen Sie das ruhig zwei Tage ab.“
- **Chef-Notiz: In der Regel operieren die Zahnärzte so minimalinvasiv, dass kaum Blutungen entstehen und Sie Ihre Medikamente normal weiter nehmen können.**



### 34

- **Frage:** Ich bin erkältet. Soll ich den Termin absagen?
- **Varianten:** Husten / Fieber / Corona / positiv getestet.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Bei Fieber, positivem Test oder heftigem Infekt verschieben wir den Termin — für Sie und für das Team. Bei einem leichten Schnupfen ohne Fieber können viele Kontrollen stattfinden, Behandlungen mit langem offenem Mund eher nicht. Sagen Sie uns kurz die Symptome, dann entscheide ich mit der Praxisregel.
- **Chef-Notiz:**Kein Termin bei schnupfen oder erkältung oder Herpes labialis



### 35

- **Frage:** Darf ich Make-up / Lippenstift / Schmuck tragen?
- **Varianten:** Nagellack bei Narkose? / Piercing in der Lippe.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Lippenstift und Make-up sind für normale Termine kein Problem. Lippen- oder Zungenpiercings bitte rausnehmen, wenn sie im Arbeitsfeld liegen. Für Narkose gelten die Hinweise, die Sie schriftlich bekommen — oft kein Schmuck, keine Lacke an den Nägeln.
- **Chef-Notiz:**



### 36

- **Frage:** Kann ich mit dem Auto nach Hause fahren?
- **Varianten:** Fahrtüchtigkeit nach Betäubung / nach Weisheitszahn.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Nach einer normalen lokalen Betäubung dürfen die meisten Patienten selbst fahren, sobald sie sich sicher fühlen. Nach Sedierung, Narkose oder wenn Sie sich benommen oder unsicher fühlen, brauchen Sie eine Abholung — nicht selbst Auto oder Rad. Das klären wir vor der geplanten Behandlung.
- **Chef-Notiz:**



### 37

- **Frage:** Soll ich vorher Antibiotikum nehmen, ich habe ein künstliches Gelenk / Herzfehler?
- **Varianten:** Endokarditisprophylaxe / Hüft-TEP.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Ob eine Endokarditis- oder Gelenkprophylaxe nötig ist, entscheidet der Zahnarzt nach Leitlinie und Ihrem Arztbrief. Bringen Sie den Ausweis oder den letzten Arztbrief mit. Setzen Sie nichts auf eigene Faust an.
- **Chef-Notiz:**



### 38

- **Frage:** Ich habe wenig Zeit. Kann man Kontrolle und Reinigung am selben Tag machen?
- **Varianten:** Alles in einem Termin? / PZR gleich nach der U.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Manchmal ja, wenn der Kalender das hergibt und medizinisch nichts dagegenspricht. Oft ist die Reinigung ein eigener Termin, damit genug Zeit bleibt. Ich schaue, was sich sinnvoll koppeln lässt.
- **Chef-Notiz:** Kombi slots sind erlaubt



### 39

- **Frage:** Ich brauche eine Bescheinigung für den Arbeitgeber / die Schule, dass ich beim Zahnarzt war.
- **Varianten:** Anwesenheitsbescheinigung.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Eine Anwesenheitsbescheinigung können wir nach dem Termin ausstellen. Bitte sagen Sie das an der Rezeption. Am Telefon vorab reserviere ich nichts davon.
- **Chef-Notiz:**



### 40

- **Frage:** Sprechen Sie auch Englisch / andere Sprachen?
- **Varianten:** English? / Türkisch? / Arabisch?
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Am Telefon bin ich auf Deutsch eingestellt. Im Behandlungszimmer klären wir, ob ein Teammitglied oder eine Begleitperson übersetzen kann. Für den Termin selbst ist das kein Hindernis.
- **Chef-Notiz:** Wir sprechen Deutsch, Englisch , Französich und Griechisch.

---



## E · Nach der Behandlung / Nachsorge



### 41

- **Frage:** Darf ich nach der Betäubung essen und trinken?
- **Varianten:** Kaffee nach der Spritze / Wange tot.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Bitte erst essen, wenn die Lippe und die Zunge wieder Gefühl haben, sonst beißen Sie sich leicht. Trinken ist vorsichtig möglich; heiße Getränke erst, wenn Sie Temperatur wieder spüren. Nach chirurgischen Eingriffen gelten die schriftlichen Hinweise, die Sie mitbekommen.
- **Chef-Notiz:**



### 42

- **Frage:** Darf ich nach dem Ziehen rauchen / Sport / sauna?
- **Varianten:** Fitnessstudio nach OP / Flug nach Implantat.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Rauchen stört die Heilung deutlich — möglichst die nächsten Tage lassen. Sport, Sauna und Flug hängen vom Eingriff ab; nach einer Extraktion in den ersten Tagen kein hartes Training. Die genaue Freigabe steht auf dem Merkblatt oder klären wir beim Nahtzug.
- **Chef-Notiz:** Keine Zigarette oder E-Zigarette nach OPs! mindestens 2 Tage lang.

- **Frage:** Die Naht hat sich gelöst / es blutet noch etwas. Ist das schlimm?
- **Varianten:** Blutgeschmack / Speichel rosa.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Leicht rosa Speichel in den ersten Stunden kommt vor. Bei klarem, anhaltendem Bluten ein feuchtes Mulltupfer-Paket fest auf die Wunde beißen, nicht spülen und nicht an der Wunde saugen. Hört es nicht auf oder kommt eine Schwellung, komme ich mit einem heutigen Termin oder verweise auf den Notdienst.
- **Chef-Notiz:**



### 44

- **Frage:** Wann darf ich wieder Zähne putzen?
- **Varianten:** Mundspülung nach OP / Chlorhexidin.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Putzen Sie die anderen Zähne wie gewohnt, die Wunde in den ersten vierundzwanzig Stunden nur vorsichtig umgehen. Nicht kräftig spülen am Operationstag. Ob eine Spüllösung sinnvoll ist, steht auf Ihrem Merkblatt — nicht jede Situation braucht Chlorhexidin.
- **Chef-Notiz:**



### 45

- **Frage:** Wann kommen die Fäden raus?
- **Varianten:** Nahtzug Termin / selbstauflösend?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Das hängt vom Nahtmaterial ab. Oft ziehen wir nach etwa nach zwei  Wochen. Selbstauflösende Fäden müssen Sie nicht selbst zupfen. Den Termin zum Nahtzug buche ich mit, wenn er noch fehlt.
- **Chef-Notiz:** 



### 46

- **Frage:** Die provisorische Krone ist runter. Was jetzt?
- **Varianten:** Provisorium gebrochen / wackelt.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Bitte nicht selbst festkleben. Heben Sie das Stück auf und kommen Sie zeitnah, damit der beschliffene Zahn nicht empfindlich wird oder wandert. Ich suche einen kurzen Termin.
- **Chef-Notiz:**



### 47

- **Frage:** Wie lange hält die Schwellung nach der OP?
- **Varianten:** Kühlung / wann sieht man das Hämatom?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Schwellung ist nach chirurgischen Eingriffen oft am zweiten und dritten Tag am stärksten, nicht am Operationstag. Kühlen von außen mit Pausen hilft vielen. Zunehmende Schwellung mit Fieber oder Schluckstörung gehört nicht zum normalen Verlauf — dann zeitnah sehen oder Notdienst.
- **Chef-Notiz:**



### 48

- **Frage:** Darf ich Schmerzmittel nehmen, und welche?
- **Varianten:** Ibuprofen oder Paracetamol / mit Magenschutz.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Am Telefon verordne ich nichts. Nehmen Sie nur, was Ihnen der Zahnarzt mitgegeben oder ausdrücklich empfohlen hat. Wenn Sie unsicher sind wegen Magen, Niere, Asthma, Schwangerschaft oder Blutverdünner, fragen Sie Apotheke oder Ihren Arzt, bevor Sie etwas Neues einnehmen.
- **Nicht sagen:** konkrete Dosierungen erfinden.
- **Chef-Notiz:** Ob Bianca „wie auf dem Merkblatt“ sagen darf.



### 49

- **Frage:** Wann ist die Krone / der Zahnersatz fertig?
- **Varianten:** Ist meine Schiene schon da? / Laborstatus.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Den genauen Laborstand sehe ich am Telefon nicht. Sobald Krone, Schiene oder Zahnersatz da ist, ruft die Praxis Sie an. Ich kann einen Rückruf notieren, aber keinen Fertigstellungstermin erfinden.
- **Chef-Notiz:** Entspricht Bianca-Profil (kein Laborstatus).



### 50

- **Frage:** Ich habe noch Fragen zur Aufklärung. Kann ich den Arzt sprechen?
- **Varianten:** Zweite Meinung im Haus / Bedenken vor OP.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Ja. Ich notiere Ihren Namen und das Thema und vereinbare einen kurzen Beratungsrückruf oder einen Besprechungstermin.
- **Chef-Notiz:**

---



## F · Prophylaxe, PZR, Mundhygiene



### 51

- **Frage:** Wie oft sollte ich zur professionellen Zahnreinigung?
- **Varianten:** Alle sechs Monate? / Reicht einmal im Jahr?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Viele kommen zweimal im Jahr, bei Parodontitis, viel Zahnstein oder festem Zahnersatz oft öfter. Das Intervall legt das Team nach Ihrem Befund fest, nicht eine pauschale Regel für alle.
- **Chef-Notiz:** Recall-Standard der Praxis.



### 52

- **Frage:** Tut die Zahnreinigung weh?
- **Varianten:** PZR schmerzhaft / empfindliche Hälse.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Die meisten spüren Druck und Kitzeln, keine starken Schmerzen. Bei empfindlichen Hälsen sagen Sie Bescheid, dann arbeiten wir vorsichtiger oder mit einer Oberflächenbetäubung. Nach der Reinigung kann es ein, zwei Tage ziehen.
- **Chef-Notiz:**



### 53

- **Frage:** Bringt Zähneputzen zu Hause überhaupt etwas, wenn ich zur PZR gehe?
- **Varianten:** Elektrische Bürste / Interdentalbürsten Pflicht?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Die Reinigung in der Praxis ersetzt das tägliche Putzen nicht. Zweimal täglich mit Fluoridzahnpasta und einmal täglich die Zahnzwischenräume — Seide oder kleine Bürstchen — halten das Ergebnis. Welche Hilfsmittel zu Ihnen passen, zeigen wir in der Prophylaxe.
- **Chef-Notiz:**



### 54

- **Frage:** Soll ich eine elektrische Zahnbürste kaufen?
- **Varianten:** Schallzahnbürste / welche Paste?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Eine gute Technik zählt mehr als die Marke. Viele kommen mit einer elektrischen Bürste leichter zurecht. Aggressive Whitening-Pasten mit grobem Putzkörper sind oft ungünstig. Konkrete Produktempfehlungen geben wir lieber in der Prophylaxe als am Telefon.
- **Chef-Notiz:** Falls es ein Haus-Empfehlungsprodukt gibt.



### 55

- **Frage:** Ich habe Mundgeruch. Liegt das an den Zähnen?
- **Varianten:** Halitosis / Belag auf der Zunge.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Mundgeruch hat oft mit Belag, Zahnfleisch oder einer entzündeten Tasche zu tun, manchmal auch mit Hals, Magen oder Medikamenten. Am Telefon lege ich die Ursache nicht fest. Eine Untersuchung plus Prophylaxe ist der sinnvolle erste Schritt.
- **Chef-Notiz:**



### 56

- **Frage:** Meine Zähne sind empfindlich auf kalt. Was tun?
- **Varianten:** Zahnhälse / Eisessen weh.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Kälteempfindlichkeit hat mehrere Ursachen — freie Hälse, eine undichte Füllung oder ein Riss. Ohne Blick in den Mund rate ich kein Mittel. Ich buche eine Kontrolle; bis dahin weiche Zahnbürste und keine harte Säurekur auf eigene Faust.
- **Chef-Notiz:**



### 57

- **Frage:** Hilft Mundspülung täglich?
- **Varianten:** Chlorhexidin dauerhaft / Ölziehen.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Eine fluoridhaltige Spülung kann ergänzen, ersetzt aber Putzen und Zwischenraumpflege nicht. Chlorhexidin ist ein Medikament für begrenzte Zeit, nicht als Dauer-Alltag. Ob und wie lange, entscheidet der Befund.
- **Chef-Notiz:**



### 58

- **Frage:** Ab wann soll ein Kind zur Prophylaxe?
- **Varianten:** Erstes Zähnchen / Individualprophylaxe Kasse.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Sobald die ersten Zähne da sind, ist ein Blick sinnvoll, spätestens zum ersten Geburtstag. Für Schulkinder gibt es oft Individualprophylaxe über die Kasse. Ich buche einen kindgerechten Termin.
- **Chef-Notiz:** Ab welchem Alter behandelt die Praxis Kinder?

---



## G · Füllungen, Karies, Zahnerhalt



### 59

- **Frage:** Brauche ich wirklich eine Füllung? Es tut doch gar nicht weh.
- **Varianten:** Karies ohne Schmerz / nur beobachten?
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Karies tut oft erst weh, wenn sie schon tiefer ist. Ob beobachtet, fluoridiert oder gefüllt wird, entscheidet der Zahnarzt nach Untersuchung und Röntgen, nicht das Telefon. Ich vereinbare den Befundtermin.
- **Chef-Notiz:**



### 60

- **Frage:** Kunststoff oder Gold oder Keramik — was ist besser?
- **Varianten:** Amalgam raus / Inlay statt Füllung.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Das hängt von Lochgröße, Biss, Zahn und Ihren Wünschen ab. Amalgam legen wir in vielen Praxen nicht mehr, Kunststoff ist Standard für kleinere Defekte, Inlay oder Teilkrone bei größeren. Die Empfehlung kommt nach dem Blick in den Mund, plus Kostenüberblick.
- **Chef-Notiz:** Amalgam-Politik der Praxis.



### 61

- **Frage:** Hält eine Füllung ewig?
- **Varianten:** Wann muss die Füllung erneuert werden?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Nein. Füllungen nutzen sich ab, Ränder werden undicht. Wie lange sie hält, hängt vom Material, vom Biss und von der Pflege ab. Deshalb sind Kontrollen wichtig, nicht nur der Moment der Füllung.
- **Chef-Notiz:**



### 62

- **Frage:** Kann man Karies wieder zurückdrehen?
- **Varianten:** Remineralisation / ohne Bohren.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ganz frühe beginnende Stellen lassen sich manchmal mit Fluorid und besserer Pflege beruhigen. Eine echte Lochbildung braucht in der Regel eine Füllung. Ob bei Ihnen noch ohne Bohren geht, sieht nur der Befund.
- **Chef-Notiz:**



### 63

- **Frage:** Muss der alte Stiftaufbau / die alte Füllung raus, obwohl sie hält?
- **Varianten:** Amalgamsanierung auf Wunsch.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Nur weil etwas alt ist, muss es nicht sofort raus. Auf Wunsch oder bei Undichtigkeit planen wir das gezielt. Eine Komplettsanierung „auf Verdacht“ am Telefon vereinbare ich nicht.
- **Chef-Notiz:**



### 64

- **Frage:** Bekomme ich eine Spritze für die Füllung?
- **Varianten:** Ohne Betäubung / Angst vor der Spritze.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Bei den meisten Füllungen betäuben wir, damit Sie nichts Unangenehmes spüren. Kleine, oberflächliche Stellen gehen manchmal ohne. Sagen Sie Ihre Angst ruhig — wir gehen Schritt für Schritt.
- **Chef-Notiz:**

---



## H · Wurzelbehandlung, Extraktion, Weisheitszahn



### 65

- **Frage:** Brauche ich eine Wurzelbehandlung?
- **Varianten:** Nerv tot / Pulpitis / Zahn bleibt oder raus.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Das entscheidet nur die Untersuchung, oft mit Test und Röntgen. Am Telefon kann ich nicht sagen, ob der Nerv noch zu retten ist. Bei Schmerzen hole ich einen zeitnahen Termin.
- **Chef-Notiz:**



### 66

- **Frage:** Tut eine Wurzelbehandlung sehr weh?
- **Varianten:** Ist das schlimmer als ziehen?
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Mit guter Betäubung ist der Termin für die meisten gut auszuhalten. Unbehandelt pocht ein entzündeter Nerv oft stärker als die Behandlung selbst. Danach kann es ein paar Tage empfindlich sein.
- **Chef-Notiz:**



### 67

- **Frage:** Wie oft muss ich zur Wurzelbehandlung kommen?
- **Varianten:** Eine Sitzung oder drei? / Danach Krone Pflicht?
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Manchmal reicht eine Sitzung, manchmal sind zwei oder mehr nötig, plus später oft eine Krone, wenn der Zahn stark geschwächt ist. Den Ablauf legt der Behandler nach dem Röntgen fest.
- **Chef-Notiz:** Ob Überweisung ans Endodontie-Zentrum üblich ist.



### 68

- **Frage:** Muss der Weisheitszahn raus, obwohl er nicht weh tut?
- **Varianten:** Liegt quer / Platzmangel / Kieferorthopädie will Ziehung.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Nicht jeder Weisheitszahn muss raus. Wenn er Platz wegnimmt, entzündet oder den Nachbarzahn schädigt, sprechen wir eine Entfernung an. Die Entscheidung nach Röntgen, nicht nach einer Telefonregel.
- **Chef-Notiz:**



### 69

- **Frage:** Ziehen Sie Weisheitszähne selbst oder überweisen Sie?
- **Varianten:** MKG / Narkose Ziehung / alle vier auf einmal.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Einfache Situationen behandeln wir oft selbst. Liegen die Zähne ungünstig oder ist eine Narkose sinnvoll, überweisen wir zum Fachkollegen. Das entscheidet der Befund, nicht das Telefon.
- **Chef-Notiz:** Überweiser / ITN-Kooperation eintragen.



### 70

- **Frage:** Was kostet das Ziehen eines Zahns?
- **Varianten:** Weisheitszahn Kasse oder privat?
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Eine medizinisch nötige Extraktion ist oft Kassenleistung, besondere chirurgische Verfahren oder Narkose können Zuzahlung bedeuten. Einen Betrag nenne ich erst nach Einschätzung, nicht pauschal am Telefon.
- **Chef-Notiz:**



### 71

- **Frage:** Kann man den Zahn nicht noch retten statt ziehen?
- **Varianten:** Zweite Meinung / Implantat gleich in der Lücke.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Erhalt steht vor Ersatz, wenn der Zahn eine Chance hat. Ob Wurzelbehandlung, Krone oder Entfernung sinnvoller ist, klären wir in der Untersuchung. Ein Implantat ist eine Option für die Lücke — nicht die telefonische Vorentscheidung.
- **Chef-Notiz:**



### 72

- **Frage:** Ich habe Angst vor dem Ziehen. Geht das unter Dämmerschlaf?
- **Varianten:** Lachgas / Sedierung / Vollnarkose.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Lokale Betäubung reicht in den meisten Fällen. Ob Sedierung oder Narkose bei uns oder über eine Überweisung möglich ist, klären wir im Beratungstermin. Am Telefon verspreche ich keine Narkose.
- **Chef-Notiz:** Leistungsangebot Sedierung/ITN.

---



## I · Krone, Brücke, Prothese, Implantat



### 73

- **Frage:** Brauche ich eine Krone oder reicht eine große Füllung?
- **Varianten:** Teilkrone / Zahn ist schon sehr zerstört.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Wenn wenig eigene Zahnsubstanz bleibt, schützt eine Krone oder Teilkrone oft besser als eine sehr große Füllung. Das Verhältnis erklärt Ihnen der Zahnarzt am Modell oder am Bild, plus Heil- und Kostenplan.
- **Chef-Notiz:**



### 74

- **Frage:** Wie lange hält eine Krone?
- **Varianten:** Garantie Zahnersatz / was wenn sie runterkommt.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Viele Kronen halten Jahre bis Jahrzehnte, wenn der Zahn und das Zahnfleisch mitmachen. Eine Garantie im Alltagssinn gibt es nicht, wohl aber Gewährleistung nach den Regeln für Zahnersatz. Pflege und Kontrollen entscheiden mit.
- **Chef-Notiz:** Gewährleistungs-Satz der Praxis.



### 75

- **Frage:** Brücke oder Implantat — was ist besser?
- **Varianten:** Nachbarzähne beschleifen? / Knochen reicht nicht.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Beides kann gut sein. Die Brücke nutzt Nachbarzähne, das Implantat steht allein, braucht aber Knochen und Heilungszeit. Was in Ihrer Lücke sinnvoll ist, klären Untersuchung, Röntgen und ein Beratungsgespräch — nicht das Telefon.
- **Chef-Notiz:**



### 76

- **Frage:** Was kostet ein Implantat, und zahlt die Kasse?
- **Varianten:** All-on-four Preis / Knochenaufbau extra.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Implantate sind in der Regel Privatleistung. Die Kasse beteiligt sich allenfalls am Zahnersatzteil, nicht am Implantatkörper selbst, je nach Fall. Einen seriösen Betrag gibt es erst nach Planung, nicht als Telefonpauschale.
- **Chef-Notiz:** Ob Bianca eine grobe Spanne nennen darf.



### 77

- **Frage:** Wie lange dauert es von der Ziehung bis zum Implantat?
- **Varianten:** Sofortimplantat / wie viele Monate heilen?
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Manchmal sofort, häufiger nach einer Einheilzeit von Wochen bis Monaten. Das hängt von Entzündung, Knochen und Weichgewebe ab. Den Zeitplan nennt der Implantat-Beratungstermin.
- **Chef-Notiz:**



### 78

- **Frage:** Meine Prothese drückt. Können Sie unterfüttern?
- **Varianten:** Haftcreme reicht nicht / Prothese gebrochen.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Drücken und Druckstellen sollten zeitnah angesehen werden, sonst entsteht eine wunde Stelle. Eine gebrochene Prothese bitte nicht selbst kleben. Ich buche einen Termin zur Kontrolle oder Unterfütterung und Sie bringen die Prothese mit.
- **Chef-Notiz:**



### 79

- **Frage:** Kann ich mit der Vollprothese wieder alles essen?
- **Varianten:** Haftcreme Dauerlösung / Implantatprothese.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Eine gut sitzende Prothese kann viel, aber nicht denselben Halt wie eigene Zähne. Haftcreme ist eine Hilfe, kein Dauerersatz für Unterfütterung. Festeren Halt besprechen wir in der Zahnersatz-Beratung, wenn Sie das möchten.
- **Chef-Notiz:**



### 80

- **Frage:** Bekomme ich für die Übergangszeit ein Provisorium?
- **Varianten:** Zahnlücke sichtbar / Urlaub nächste Woche.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Ob ein Provisorium möglich und sinnvoll ist, hängt vom Zahn und vom Zeitplan ab. Das plant der Behandler, nicht die Telefonzentrale. Sagen Sie uns den Anlass — zum Beispiel eine Feier — dann nehmen wir das in den Termin mit.
- **Chef-Notiz:**

---



## J · Bleaching, Ästhetik, Veneers



### 81

- **Frage:** Können Sie meine Zähne weiß machen?
- **Varianten:** Bleaching / Home-Kit / Instagram-Zähne.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Aufhellung bieten wir an, aber erst nach einer Kontrolle: Karies, undichte Füllungen und entzündetes Zahnfleisch sollten vorher in Ordnung sein. Füllungen und Kronen bleicht man nicht mit — die Farbe bleibt. Ich buche gerne eine Beratung zur Zahnaufhellung.
- **Chef-Notiz:** CeraWhite-Historie nicht von selbst erwähnen.



### 82

- **Frage:** Ist Bleaching schädlich für den Zahnschmelz?
- **Varianten:** Empfindlich nach Whitening-Streifen.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Kontrolliertes Bleaching in der Praxis ist bei gesunden Zähnen in der Regel gut verträglich. Freie Whitening-Streifen und aggressive Pasten können Zähne empfindlich machen. Deshalb lieber nach Befund als auf eigene Faust.
- **Chef-Notiz:**



### 83

- **Frage:** Was kosten Veneers, und für wen sind sie?
- **Varianten:** Nur Schneidezähne / statt Krone.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Veneers sind eine ästhetische, meist private Versorgung für Form und Farbe der Front. Ob sie zu Ihren Zähnen passen, sieht man erst in der Beratung. Preise nenne ich nicht pauschal.
- **Chef-Notiz:** Bietet die Praxis Veneers an?



### 84

- **Frage:** Kann man eine Lücke zwischen den Schneidezähnen schließen ohne Spange?
- **Varianten:** Diastema / Bonding / Kompositaufbau.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Manchmal mit Komposit, manchmal mit Veneers, manchmal ist Kieferorthopädie nachhaltiger. Ohne Blick auf Biss und Zahnfleisch lege ich das nicht fest. Ich buche eine Beratung.
- **Chef-Notiz:**



### 85

- **Frage:** Meine Füllung hat eine andere Farbe als der Zahn. Kann man das anpassen?
- **Varianten:** Gräuliche alte Füllung / Frontzahn abgeplatzt.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ja, oft lässt sich das ästhetisch korrigieren, wenn der Zahn sonst in Ordnung ist. Ich vereinbare einen Termin, und der Behandler sagt, ob Polieren reicht oder eine neue Füllung sinnvoller ist.
- **Chef-Notiz:**

---



## K · Kieferorthopädie, Schienen, Knirschen, Schnarchen



### 86

- **Frage:** Ich knirsche nachts. Brauche ich eine Aufbissschiene?
- **Varianten:** CMD / Kiefergelenk knackt / Zähne flach.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Knirschen und Pressen sehen wir häufig. Ob eine Schiene sinnvoll ist, klärt die Untersuchung — abgenutzte Zähne, Muskelverspannung, Knacken. Ich buche gerne einen Termin zur Abklärung, ohne am Telefon eine Schiene zu verkaufen.
- **Chef-Notiz:**



### 87

- **Frage:** Die Knirscherschiene drückt / ich trage sie nicht. Was nun?
- **Varianten:** Schiene verloren / neu anfertigen.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Eine Schiene, die drückt, sollte angepasst werden, sonst landet sie in der Schublade. Bei Verlust brauchen wir in der Regel eine neue. Bringen Sie die Schiene mit, ich suche einen kurzen Termin.
- **Chef-Notiz:**



### 88

- **Frage:** Ich schnarche / habe Schlafapnoe. Macht ihr die Schiene?
- **Varianten:** Narval / Resmed / Schlaflabor Grüger Lange.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ja, Unterkiefer-Protrusionsschienen, unter anderem Narval von Resmed, fertigen wir nach Scan der Zähne. Dafür brauchen wir einen Termin zum Scan. Wenn das Schlaflabor Sie schickt, bringen Sie bitte die Unterlagen mit.
- **Chef-Notiz:** Entspricht vorhandenem Bianca-Wissen.



### 89

- **Frage:** Braucht mein Kind eine Spange? Der Schulzahnarzt hat etwas angemerkt.
- **Varianten:** KFO Überweisung / Invisalign Teen.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Das sehen wir uns in einer kieferorthopädischen Beratung an. Am Telefon beurteile ich weder Engstand noch Kieferlage. Ich buche eine KFO-Besprechung.
- **Chef-Notiz:** KFO im Haus oder Überweiser?



### 90

- **Frage:** Macht ihr unsichtbare Schienen / Aligner?
- **Varianten:** Invisalign / Spark / nur Nachtschiene gerade rücken.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Ob Aligner bei uns oder über eine Überweisung laufen, klären wir in der Beratung. Nicht jeder Biss eignet sich für Schienen. Ich setze einen Beratungstermin, ohne ein System zu versprechen.
- **Chef-Notiz:** Aligner-Angebot ja/nein.

---



## L · Kinder, Schwangerschaft, Angst, besondere Situationen



### 91

- **Frage:** Ab welchem Alter nehmen Sie Kinder?
- **Varianten:** Kleinkind erster Besuch / Angst vorm Zahnarzt vererben.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Kinder sind willkommen. Der erste Besuch darf ruhig nur Kennenlernen sein, ohne Zwang. Sagen Sie uns das Alter und ob schon Schmerzen da sind — dann plane ich den passenden Slot.
- **Chef-Notiz:** Untere Altersgrenze, ob ITN-Kinder überwiesen werden.



### 92

- **Frage:** Mein Kind will den Mund nicht aufmachen. Was tun?
- **Varianten:** Trauma alter Zahnarzt / hält die Hände vors Gesicht.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Dann gehen wir langsam und ohne Druck. Bitte nicht mit Spritzen-Geschichten vorwarnen. Beim Termin darf eine Bezugsperson dabei sein. Bei starken Schmerzen finden wir trotzdem einen Weg — notfalls mit Fachüberweisung.
- **Chef-Notiz:**



### 93

- **Frage:** Ich bin schwanger. Darf ich zum Zahnarzt? Röntgen? Betäubung?
- **Varianten:** Stillzeit / erstes Drittel / Zahnfleisch blutet in der Schwangerschaft.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Zahnarztbesuche in der Schwangerschaft sind wichtig, entzündetes Zahnfleisch gerade dann. Nötige Behandlung und lokale Betäubung sind in der Regel möglich; Röntgen nur wenn wirklich nötig und mit Schutz. Sagen Sie uns Woche und ob Sie stillen. Keine Hausmittel-Diagnose am Telefon.
- **Chef-Notiz:**



### 94

- **Frage:** Ich habe starke Zahnarztangst. Geht das trotzdem?
- **Varianten:** Panik / will nur Narkose / letzte Sitzung abgebrochen.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ja. Sagen Sie die Angst gleich am Anfang, dann planen wir kürzere Sitzungen, Pausen und klare Stopp-Zeichen. Narkose ist nicht der erste und nicht der einzige Weg. Ich buche einen ruhigen Beratungstermin, kein Überrumpeln.
- **Chef-Notiz:** Angstpatienten-Slots / Sedierung.



### 95

- **Frage:** Ich sitze im Rollstuhl / brauche Barrierefreiheit.
- **Varianten:** Aufzug / Begleitperson / Schwerhörigkeit.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Wir sitzen im Medical Center, Haus B, zweite Etage — es gibt Aufzug. Sagen Sie uns bitte, was Sie brauchen, dann planen wir Zeit und Raum. Eine Begleitperson ist willkommen.
- **Chef-Notiz:** Konkrete Barrieren (WC, Türbreite, Lifter) eintragen.



### 96

- **Frage:** Ich habe eine Behinderung / Demenz / brauche viel Zeit.
- **Varianten:** gesetzliche Betreuung / Einwilligung.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Dann geben Sie uns das vorher Bescheid, damit der Termin nicht gehetzt ist. Bei gesetzlicher Betreuung brauchen wir die Einwilligung der berechtigten Person für Behandlungen. Ich notiere den Hinweis an das Team.
- **Chef-Notiz:**



### 97

- **Frage:** Darf ich meinen Hund mitbringen? Ich habe Angst ohne ihn.
- **Varianten:** Assistenzhund / Wartezimmer Hund.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Aus Hygienegründen bleiben Haustiere außerhalb. Ein ausgebildeter Assistenzhund ist etwas anderes — sagen Sie uns das vorher, dann klären wir den Ablauf. [CHEF: Assistenzhund-Regel verbindlich machen.]
- **Chef-Notiz:** Profil sagt Haustiere unerwünscht. Assistenzhund-Ausnahme hier festlegen.

---



## M · Medikamente, Betäubung, Allergien, Vorerkrankungen



### 98

- **Frage:** Ich bin allergisch gegen Penicillin / Latex / Betäubungsmittel.
- **Varianten:** Anaphylaxie früher / Articain.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Das gehört unbedingt in die Karte. Nennen Sie uns die Allergie und was damals passiert ist. Am Telefon teste ich nichts und ersetze keine Notfallplanung. Bringen Sie den Allergiepass mit.
- **Chef-Notiz:**



### 99

- **Frage:** Ich habe Diabetes / Bluthochdruck / Osteoporose mit Infusionen. Ist Zahnziehen gefährlich?
- **Varianten:** Bisphosphonat / Denosumab / unkontrollierter Zucker.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Vorerkrankungen und bestimmte Knochenmedikamente ändern die Planung, sie sind aber kein Grund, Schmerzen auszusitzen. Setzen Sie keine Infusionen selbst ab. Bringen Sie den Medikamentenplan mit; der Zahnarzt entscheidet nach Befund, ob wir behandeln, zuwarten oder den Hausarzt einbinden.
- **Nicht sagen:** „Bei Bisphosphonat darf man nie ziehen.“
- **Chef-Notiz:**



### 100

- **Frage:** Wirkt die Betäubung bei mir nicht, ich brauche immer extra?
- **Varianten:** Entzündung, Spritze wirkt nicht / lange taub danach.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Bei Entzündungen wirkt Betäubung manchmal langsamer. Sagen Sie das vor der Spritze, dann stellt sich der Zahnarzt darauf ein. Wie lange die Taubheit anhält, ist unterschiedlich; bleibt eine Seite Stunden ungewöhnlich taub oder fällt die Mimik, rufen Sie uns oder den Notdienst an.
- **Chef-Notiz:**

---



## N · Lücken (häufig am Telefon, in 01–100 noch nicht)



### 101

- **Frage:** Die Bestätigungs-SMS ist nicht angekommen. Gilt der Termin trotzdem?
- **Varianten:** Keine SMS / SMS in Spam / habe die Nummer gewechselt.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ich prüfe den Termin im Kalender. Steht er dort, gilt er — die SMS ist die Bestätigung, nicht die einzige Wahrheit. Ich kann die Nummer aktualisieren und die Bestätigung erneut anstoßen. Ohne hinterlegte Nummer bleibt der Termin unsicher.
- **Chef-Notiz:**



### 102

- **Frage:** Ich komme zu spät. Soll ich trotzdem kommen?
- **Varianten:** Stecke im Stau / fünf Minuten / zwanzig Minuten.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Kurze Verspätung sagen Sie uns bitte sofort, dann halten wir den Slot wenn möglich. Bei längerer Verspätung kann die Behandlung nicht mehr in der vorgesehenen Zeit laufen — dann verschiebe ich lieber, als dass Sie umsonst warten. [CHEF: Ab wie vielen Minuten umbuchen?]
- **Chef-Notiz:**



### 103

- **Frage:** Lisa hat angerufen / eine SMS geschickt. Worum geht es?
- **Varianten:** Verpasste Nummer der Praxis / Recall zurückrufen.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Vermutlich wollte die Praxis einen Termin zur Kontrolle oder Weiterbehandlung mit Ihnen abstimmen. Ich schaue nach, ob ein offener Terminwunsch da ist, und buche gerne direkt. Einen medizinischen Grund erfinde ich am Telefon nicht.
- **Chef-Notiz:** Entspricht Bianca-Profil zu Lisa.



### 104

- **Frage:** Können Sie meine Röntgenbilder an den anderen Zahnarzt schicken?
- **Varianten:** Unterlagen anfordern / Kopie der Akte / CD mit Bildern.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Ja, Unterlagen geben wir an Behandler weiter, die Sie benennen — dafür brauchen wir in der Regel Ihre Einwilligung und die Adresse der anderen Praxis. Ich notiere den Wunsch. Am Telefon mailen wir keine Patientenbilder ins Ungewisse.
- **Chef-Notiz:** Formular / Fax / KIM hier vermerken.



### 105

- **Frage:** Können Sie mein Bonusheft abstempeln?
- **Varianten:** Bonusheft vergessen / Stempel für die Kasse.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Den Bonusheft-Eintrag machen wir bei der Kontrolle, wenn Sie das Heft dabeihaben. Nachträglich nur, wenn die Untersuchung tatsächlich stattgefunden hat. Bringen Sie das Heft zum nächsten Termin mit, oder kommen Sie kurz an die Rezeption, wenn der Stempel noch fehlt.
- **Chef-Notiz:**



### 106

- **Frage:** Ich möchte eine zweite Meinung. Darf ich mit Befund von woanders kommen?
- **Varianten:** Mein Zahnarzt will ziehen / Implantat-Angebot prüfen.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Ja, bringen Sie vorhandene Röntgenbilder, den Heil- und Kostenplan und den Arztbrief mit. Wir ersetzen am Telefon keine Diagnose und werten keinen fremden Plan ohne Untersuchung ab. Ich buche eine Beratung.
- **Chef-Notiz:**



### 107

- **Frage:** Kann ich mit Karte zahlen? Geht Rechnung per E-Mail?
- **Varianten:** EC / Kreditkarte / bar / PayPal / Rechnung an die Versicherung.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Zahlungsmittel nenne ich verbindlich nur so, wie die Praxis es festlegt. [CHEF: EC ja, Kreditkarte?, bar?, Rechnung per Mail ja/nein.] Eine Rechnung an die private Versicherung läuft über die Abrechnung, nicht über das Telefon-Ja.
- **Chef-Notiz:**



### 108

- **Frage:** Liegt mein Rezept / meine AU / meine Überweisung schon zur Abholung?
- **Varianten:** Kann ich in einer Stunde vorbeikommen? / Wer darf abholen?
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Ob das Papier schon unterschrieben bereitliegt, sehe ich am Telefon nicht zuverlässig. Ich notiere Ihren Namen und bitte das Team um einen kurzen Rückruf, sobald es abholbereit ist. Abholen kann in der Regel nur die behandelte Person oder jemand mit Vollmacht.
- **Chef-Notiz:**



### 109

- **Frage:** Ich schicke Ihnen ein Foto vom Zahn per WhatsApp. Können Sie sagen, was das ist?
- **Varianten:** Bild der Schwellung / ist der Zahn abgestorben?
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Ein Handyfoto ersetzt keine Untersuchung, und am Telefon stelle ich keine Diagnose. Bei Schmerzen oder Schwellung hole ich einen zeitnahen Termin. Fotos über WhatsApp nehmen wir für die Akte so nicht entgegen.
- **Nicht sagen:** „Das sieht nach Abszess aus.“
- **Chef-Notiz:** Offizieller Kanal für Bilder, falls es einen gibt.



### 110

- **Frage:** Bitte keine Recall-SMS mehr / keine Erinnerungen.
- **Varianten:** Abbestellen / Opt-out / nicht mehr anrufen.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Das notiere ich für das Team, damit die Erinnerungen ausbleiben. Termine können Sie trotzdem jederzeit selbst anrufen oder online buchen. Den Wunsch „nicht mehr kontaktieren“ setze ich nicht stillschweigend um, ohne ihn festzuhalten.
- **Chef-Notiz:** An Opt-out-Liste der Praxis koppeln, sobald die existiert.



### 111

- **Frage:** Am Zahnfleisch ist ein Eiterpickel / eine Fistel. Muss ich kommen?
- **Varianten:** Bläschen mit Eiter / salziger Geschmack / immer wieder auf.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** So etwas sollte zeitnah angesehen werden, auch wenn es gerade nicht stark schmerzt. Am Telefon lege ich nicht fest, ob das eine Fistel ist. Ich suche einen akuten oder zeitnahen Termin. Bei Fieber oder Schwellung gelten die Notfallregeln.
- **Chef-Notiz:**



### 112

- **Frage:** Ein Zahn wackelt, ich hatte keinen Unfall. Ist der noch zu retten?
- **Varianten:** Parodontose / Zahn locker beim Essen / Frontzahn bewegt sich.
- **Sicherheit:** triage
- **Freigabe:** offen
- **Antwort:** Einen lockeren Zahn ohne Unfall klären wir in einer Untersuchung — oft Zahnfleisch und Knochen, manchmal eine Entzündung an der Wurzel. Ob er zu halten ist, sage ich nicht am Telefon. Bitte nicht selbst festbinden; ich buche zeitnah.
- **Chef-Notiz:**



### 113

- **Frage:** Ich habe Aphthen / Lippenherpes. Soll ich den Termin trotzdem wahrnehmen?
- **Varianten:** Fieberblase / wunde Stelle in der Mundhöhle / ansteckend?
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Offene Lippenherpes-Blasen im Schorfstadium sind für Behandlungen im Mund oft ungünstig — dann verschieben wir, sobald die Stelle zu ist. Aphthen innen sind etwas anderes und kein Grund, Schmerzen auszusitzen. Sagen Sie uns, wo die Stelle sitzt und ob sie nässt.
- **Chef-Notiz:** Hausregel Herpes: verschieben ja/nein.



### 114

- **Frage:** Was kostet eine Knirscherschiene, zahlt die Kasse?
- **Varianten:** Aufbissschiene Preis / CMD Schiene Zuzahlung.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Ob die Kasse eine Aufbissschiene trägt, hängt vom Befund ab, nicht vom Telefonwunsch. Den Betrag nenne ich nicht pauschal. Nach der Untersuchung bekommen Sie die Aufstellung, bevor etwas angefertigt wird.
- **Chef-Notiz:** Typische Spanne, falls erlaubt.



### 115

- **Frage:** Was kostet die Schnarchschiene, und zahlt die Krankenkasse?
- **Varianten:** Narval Preis / Schlafapnoe Hilfsmittel / Rezept vom Schlaflabor.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Die Unterkiefer-Protrusionsschiene ist oft ein Hilfsmittel-Weg über Schlaflabor und Kasse oder Privat. Einen Betrag nenne ich erst nach Scan und Planung. Bringen Sie die Unterlagen vom Schlaflabor mit, dann sieht die Abrechnung, was einreichbar ist.
- **Chef-Notiz:**



### 116

- **Frage:** Wie lange darf ich in der Tiefgarage parken? Wird das Ticket entwertet?
- **Varianten:** Parkdauer Termin / APCOA / Validierung an der Rezeption.
- **Sicherheit:** praxis
- **Freigabe:** offen
- **Antwort:** Die Tiefgarage gehört zum Medical Center, nicht zur Praxis allein. Parkgebühren zahlen Sie vor Ort oder über APCOA FLOW. [CHEF: Validiert die Rezeption? Kurzparker-Regel?] Für die Fahrzeit zum Termin selbst reicht in der Regel das normale Kurzparken.
- **Chef-Notiz:**



### 117

- **Frage:** Ich möchte nicht mehr zu Doktor X, kann ich wechseln?
- **Varianten:** Keine Chemie / will nur noch Petsas / Behandlerin statt Behandler.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Ja, das geht. Sagen Sie uns, wen Sie künftig wünschen, dann buche ich die nächsten Termine dort. Einen Grund müssen Sie am Telefon nicht erklären. Laufende Pläne bleiben bestehen, bis der neue Behandler sie bestätigt.
- **Chef-Notiz:**



### 118

- **Frage:** Ich brauche ein Gutachten / eine Bescheinigung für die Versicherung nach dem Unfall.
- **Varianten:** Schmerzensgeld / Unfallbericht Zahn / Rechtsschutz.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Schriftliche Gutachten und detaillierte Unfallberichte erstellt der Behandler, nicht die Telefonzentrale. Ich notiere Versicherung und Aktenzeichen und vereinbare, falls nötig, einen Untersuchungstermin. Am Telefon diktiere ich kein Gutachten.
- **Chef-Notiz:** Honorar Gutachten?



### 119

- **Frage:** Können Sie das Amalgam rausnehmen, zahlt das die Kasse?
- **Varianten:** Amalgamverbot / Quecksilber raus / nur weil ich das will.
- **Sicherheit:** behandler
- **Freigabe:** offen
- **Antwort:** Intakte Füllungen tauschen wir nicht am Telefon auf Wunsch. Ist die Füllung undicht oder medizinisch zu ersetzen, besprechen wir Material und was Kasse oder Privat tragen. Quecksilber-Ängste ernst nehmen, aber ohne Befund keine Komplettsanierung zusagen.
- **Chef-Notiz:** Amalgam-Politik der Praxis.



### 120

- **Frage:** Darf mein Partner / meine Mutter mit in das Behandlungszimmer?
- **Varianten:** Dolmetschen / Kind und beide Eltern / Begleitung bei Angst.
- **Sicherheit:** ok
- **Freigabe:** offen
- **Antwort:** Eine Begleitperson ist in der Regel willkommen, besonders bei Angst, Kindern oder wenn übersetzt werden soll. Im Eingriff kann der Behandler aus Platz oder Hygiene bitten, kurz draußen zu warten. Sagen Sie uns das vorher, dann ist niemand überrascht.
- **Chef-Notiz:**

---



## Was Bianca am Telefon **nicht** allein entscheidet

Diese Fragen brauchen Behandler, Notdienst oder Notaufnahme — Katalog-Antwort höchstens als Brücke zum Termin:

1. Diagnose („Ist das ein Abszess? Ist der Nerv tot?“)
2. Medikament neu ansetzen, absetzen oder dosieren (inkl. Blutverdünner, Antibiotikum)
3. Röntgen in der Schwangerschaft ohne Arztentscheid
4. Laborstand von Krone, Schiene, Prothese
5. Verbindliche Preise ohne HKP / ohne Befund
6. Arbeitsunfähigkeit ohne Kontakt zum Behandler
7. Schnell zunehmende Schwellung, Atemnot, Kieferklemme mit Fieber → Notaufnahme, nicht trösten
8. Unfall mit Bewusstlosigkeit oder Kieferfraktur-Verdacht
9. Zweite Meinung ersetzen / Behandlungsplan am Telefon umwerfen
10. Narkose oder Implantat „zusagen“ ohne Beratungstermin

---



## Felder zum Erweitern (Vorlage)

```
### NNN
- **Frage:**
- **Varianten:**
- **Sicherheit:** ok | praxis | triage | behandler | notdienst
- **Freigabe:** offen
- **Antwort:**
- **Nicht sagen:**
- **Chef-Notiz:**
```

