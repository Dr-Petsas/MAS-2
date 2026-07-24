# Lena Trainingscenter (STT-Personalisierung + Trainingskorpus)

Stand 24.07.2026 · additiv, Clara bleibt unangetastet · Quelle: Chef-Auftrag
(„bau das als Trainingscenter in Lena ein, auffällig; sammle Rohdaten
Audio+Text pro Kunde, damit wir irgendwann genug zum Trainieren haben").

## Ziel

Jede Praxis schärft die Lena-Spracherkennung auf ihr **individuelles**
Fachvokabular (Überweiser, Labore, Implantat-/Materialmarken, Abkürzungen).
Gleichzeitig sammeln wir **Audio+Text-Paare pro Kunde** als Trainingskorpus für
späteres LoRA-Fine-Tuning.

Kernprinzip (Framing): **Lena lernt bei dir.** Der Arzt ist Mentor, kein
Prüfling. Fortschritt = „Lena versteht Sie zu X %".

## Datenfluss

```
PDF/Brief (im Browser zu Text) ─┐
manueller Begriff ──────────────┤→ POST /training/extract (LOKALES LLM)
                                 │   → Kandidaten-Begriffe (clients/{id}/lenaVocab)
Begriff-Karte antippen → Mikro (16 kHz PCM) → POST /training/attempt
   → MAS reicht PCM an lena_stt /transcribe → Treffer/Verhörung
   → WAV in Firebase Storage (clients/{id}/lena-training/{sampleId}.wav)
   → Sample-Metadaten (clients/{id}/lenaSamples) = Trainingskorpus
   → Begriff-Status + Gamification (XP/Level/Streak/Coverage/Badges)
Bestätigte Begriffe + reale Korrekturpaare: GET /training/export
   → speist später lena_stt Hotwords + medical_postcorrect (eigene AP)
```

DSGVO: Term-Extraktion läuft über das **lokale** LLM (`mail/llm.js`, on-prem).
Audio bleibt im Praxis-/Projekt-Storage, pro `clientId` getrennt.

## Firestore-/Storage-Layout (pro Kunde)

- `clients/{clientId}/lenaVocab/{termId}`: term, display, aliases[], category,
  status (candidate|confirmed|hard|retired), source, stats{attempts,
  recognizedOk, lastMisrecognition, lastHeardAtMs}, samples, createdAtMs.
- `clients/{clientId}/lenaVocabMeta/stats`: totalTerms, confirmed, coveragePct,
  xp, level, streakDays, lastTrainingDay, samples, badges[].
- `clients/{clientId}/lenaSamples/{sampleId}`: termId, term, targetText,
  recognizedText, ok, conf, audioPath, durationMs, sampleRate, speaker,
  createdAtMs.
- Storage `clients/{clientId}/lena-training/{sampleId}.wav` — Roh-Audio (Korpus).

## Arbeitspakete

- **T1 Backend** (`routes/training.js`, registriert, `isPublic`-Eintrag,
  Tests): extract/terms/term/attempt/stats/export + Gamification-Logik +
  WAV-Storage + lena_stt-Transkription. FERTIG.
- **T2 Frontend** (`public/m/lena-training.html`): auffälliges, gamifiziertes
  Trainingscenter (Coverage-Balken, Streak, Level, Badges, Karten, Aufnahme,
  Grün/Gelb-Feedback, PDF-Upload via pdf.js). FERTIG.
- **T3 Einstieg**: auffälliger „Trainingscenter"-Button im Lena-Bereich von
  `ipad-app.html`. FERTIG.
- **T4 (später, eigene AP)**: `GET /training/export` → lena_stt lädt
  per-Client-Hotwords + deterministische Korrekturpaare (mit Deckel gegen
  Halluzination); LoRA-Fine-Tune offline, eval-gesichert (`eval_wer.py`).

## Leitplanken

- Additiv, keine bestehenden MAS-Verträge brechen; Clara unberührt.
- Keine Cloud für Patiententext (lokales LLM erzwungen).
- Audio = personenbezogen → Einwilligung/Speicherregel vor Produktivnutzung.
- Hotword-Deckel + konservative Korrektur (Halluzinationsschutz), erst in T4.
