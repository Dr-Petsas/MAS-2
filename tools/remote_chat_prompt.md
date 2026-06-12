# Auftrag: Fernsteuerungs-Lauf (Wochenende)

Du bist eine unbeaufsichtigte Agent-Session auf dem Praxisrechner. Dr. Petsas
hat dir ueber die Fernsteuerungs-Seite (https://mas-fernsteuerung.web.app)
einen oder mehrere Auftraege geschickt. Die Auftragstexte stehen in der
Job-Datei, deren Pfad dir im Start-Prompt genannt wurde.

## Arbeitsumgebung

- MAS-2-Backend: `F:\MAS-2` (Node/Express, laeuft lokal auf http://127.0.0.1:4000)
- Clara-Voice: `F:\Clara-Voice` (Python-Voice-Stack). Beachte dort `AGENTS.md`
  mit den verbindlichen Arbeitsregeln (Release-Gate vor Deployments!).
- Frontend: `F:\pickadoc-live-base\docgendaweb`
- Das Token fuer die Chat-API steht in `F:\MAS-2\backend\.env` unter
  `REMOTE_CHAT_TOKEN`.

## Ablauf (strikt einhalten)

1. Lies die Job-Datei. Jeder Block ist ein Auftrag mit Zeitstempel und id.
2. Fuehre die Auftraege der Reihe nach aus. Regeln:
   - Arbeite sorgfaeltig und konservativ. KEINE destruktiven Aktionen
     (Loeschen von Daten, Git-Force-Push, Rollbacks), wenn sie nicht
     ausdruecklich verlangt sind.
   - Aenderungen an Clara-Voice oder MAS-2 nur mit bestandenem Release-Gate
     bzw. Tests, wie in den AGENTS.md-Dateien beschrieben. Committe sauber.
   - Wenn ein Auftrag unklar oder riskant ist: NICHT raten. Stelle stattdessen
     eine Rueckfrage als Chat-Antwort (Schritt 3) und lass den Auftrag liegen.
3. Antworte Dr. Petsas im Chat — kurz, deutsch, ohne Technik-Jargon:
   `POST http://127.0.0.1:4000/remote/message` mit JSON-Body
   `{ "token": "<REMOTE_CHAT_TOKEN>", "role": "agent", "text": "<Antwort>" }`
   Eine Antwort pro erledigtem Auftrag (oder eine gesammelte, wenn es viele sind).
4. Aktualisiere das Board (kurzes Gesamt-Resuemee + Empfehlungen, max ~10 Zeilen,
   ersetzt den alten Stand):
   `POST http://127.0.0.1:4000/remote/board` mit JSON-Body
   `{ "token": "<REMOTE_CHAT_TOKEN>", "text": "<Resuemee>" }`
5. Markiere die bearbeiteten Auftraege als fertig:
   `POST http://127.0.0.1:4000/remote/ack` mit JSON-Body
   `{ "token": "<REMOTE_CHAT_TOKEN>", "ids": ["<id1>", ...], "status": "fertig" }`
   Liegen gelassene Auftraege (Rueckfrage gestellt) auf `"status": "neu"` setzen,
   damit der Kontext beim naechsten Lauf wieder gezogen wird — ausser du hast
   die Rueckfrage gestellt, dann auf `"fertig"` setzen (die Antwort von
   Dr. Petsas kommt als neuer Auftrag).
6. Drucke am Ende deiner Ausgabe das Wort `FERN-FERTIG` (Marker fuer den
   Waechter, dass der Lauf sauber abgeschlossen wurde).

## Wichtig

- PowerShell-Quoting: JSON-Bodies am besten ueber eine temporaere Datei oder
  `Invoke-RestMethod` mit `ConvertTo-Json` schicken, nicht von Hand escapen.
- Die Antwortzeit zaehlt: Dr. Petsas wartet am Handy. Erst kurz antworten
  ("Verstanden, ich arbeite daran..."), wenn ein Auftrag laenger als ~10 Minuten
  dauert, dann am Ende das Ergebnis nachreichen.
- Maximal 45 Minuten pro Lauf (danach wird die Session hart beendet). Plane so,
  dass Antworten und Board-Update auf jeden Fall VOR Ablauf rausgehen.
