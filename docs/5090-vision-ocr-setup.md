# 5090-Server: Vision-OCR (Qwen-VL) einrichten — Anleitung für den Server-Admin

Adressat: Kollege mit SSH-/Root-Zugang zum 5090 (Tailscale `100.77.30.98`).
Ziel: Ein kleines Vision-Sprachmodell (VL) auf dem 5090 bereitstellen, damit
unser Backend (MAS/„Nadine") hochgeladene **Scans/Fotos/PDF-Scans** von
Dokumenten auslesen kann (OCR). Der bestehende Schreib-LLM `qwen3.6:35b-a3b`
bleibt dabei **unverändert** der Text-Schreiber.

Die MAS-Seite (Code) ist bereits fertig und wartet nur auf das Modell. Wir
tragen danach zwei Env-Werte ein und testen. **Auf dem 5090 sind Änderungen
nötig, die nur du mit Server-Zugang machen kannst.**

---

## 1. Warum wir das brauchen

- MAS/„Nadine" schreibt Briefe und E-Mails. Der Schreiber ist `qwen3.6:35b-a3b`
  (dein vLLM auf Port 8000) — der bleibt, weil er als reines Text-Modell besser
  schreibt als ein VL-Modell. **Nicht tauschen.**
- Neu: Wenn jemand einen **Scan/ein Foto/ein gescanntes PDF** hochlädt, soll der
  Text daraus gelesen werden (OCR), damit Nadine darauf antworten kann.
- Ein Text-Modell kann keine Bilder lesen. Dafür braucht es ein **Vision-Modell
  (VL)**. Wir wollen ein **kleines** VL-Modell (Qwen2.5-VL-7B) — das reicht fürs
  Abschreiben von Dokumenten locker und passt neben dem 35B in die 32 GB.
- Alles bleibt **lokal auf dem 5090** (DSGVO): kein Cloud-Dienst, kein
  Patientendaten-Abfluss. Fällt das VL-Modell aus, nutzt MAS automatisch einen
  lokalen Fallback (Tesseract) — es bricht also nie etwas.

Aktueller Ist-Zustand (von uns geprüft): Auf `http://100.77.30.98:8000/v1`
läuft vLLM und serviert `nvidia/Qwen3.6-35B-A3B-NVFP4` (model-id
`qwen3.6:35b-a3b`, `max_model_len 32768`).

---

## 2. Was genau geändert werden muss (Überblick)

1. **Bestehenden qwen3.6-vLLM „deckeln"** — VRAM-Nutzung auf ~0.60 begrenzen,
   damit für das VL-Modell ~10–12 GB frei bleiben. (Abschnitt 3)
2. **VL-Modell herunterladen** — `Qwen/Qwen2.5-VL-7B-Instruct-AWQ` (~6 GB) von
   Hugging Face. (Abschnitt 4)
3. **Zweite vLLM-Instanz für das VL-Modell** starten (Port 8001). (Abschnitt 5)
4. **Port 8001 im Tailscale/Firewall erreichbar** machen. (Abschnitt 6)
5. Uns „läuft" melden → wir tragen die 2 Env-Werte ein und testen. (Abschnitt 8)

> Optional/Ausbaustufe: „on-demand laden + nach Leerlauf entladen" (Abschnitt 7).
> Zum Start **nicht nötig** — zwei feste Instanzen passen in die 32 GB.

---

## 3. LLM deckeln (Pflicht) — VRAM für das VL-Modell freimachen

vLLM reserviert per Default **90 %** des VRAM (`--gpu-memory-utilization 0.9`).
Dann bleibt für ein zweites Modell nichts übrig (Out-of-Memory). Deshalb:

- In **eurem bestehenden Startbefehl / systemd-Unit / Docker-Command** für
  `qwen3.6:35b-a3b` den Parameter setzen bzw. von 0.9 herabsetzen:

```
--gpu-memory-utilization 0.60
```

- Danach die qwen3.6-Instanz **einmal neu starten**.
- Rechnung (Richtwert, mit `nvidia-smi` gegenprüfen): 35B in NVFP4 ≈ ~17,5 GB
  Gewichte; bei `0.60` reserviert vLLM ~19 GB (Gewichte + KV-Cache). Es bleiben
  ~13 GB für das VL-Modell. Das reicht.
- Wichtig: `--host 0.0.0.0` muss gesetzt sein (ist es, da wir es über Tailscale
  erreichen). `--max-model-len 32768` wie gehabt belassen.

Kontrolle nach dem Neustart:
```
curl http://localhost:8000/v1/models
nvidia-smi          # qwen3.6 sollte jetzt ~19 GB statt ~29 GB belegen
```

---

## 4. VL-Modell herunterladen

Modell: **`Qwen/Qwen2.5-VL-7B-Instruct-AWQ`** (AWQ-4bit, ~6 GB Download).

Voraussetzung: **vLLM ≥ 0.7.2** (Qwen2.5-VL-Architektur `qwen2_5_vl`). Prüfen:
```
python -c "import vllm; print(vllm.__version__)"
```
Falls älter: `pip install -U vllm` (im selben venv/Container wie euer vLLM).

Download (einmalig, braucht kurz Internet auf dem 5090). Zwei Wege:

**A) Vorab-Download in einen festen Ordner (empfohlen, reproduzierbar):**
```
pip install -U "huggingface_hub[cli]"
huggingface-cli download Qwen/Qwen2.5-VL-7B-Instruct-AWQ \
  --local-dir /opt/models/qwen2.5-vl-7b-awq
```
Ablageort: `/opt/models/qwen2.5-vl-7b-awq` (Pfad frei wählbar; ~6–8 GB Platz;
Rechte so, dass der vLLM-Prozess/Container lesen darf).

**B) Auto-Download beim ersten Start:** vLLM lädt das Modell selbst in den
HF-Cache (`~/.cache/huggingface/hub`), wenn man in Abschnitt 5 statt des
lokalen Pfads einfach `Qwen/Qwen2.5-VL-7B-Instruct-AWQ` angibt.

---

## 5. Zweite vLLM-Instanz für das VL-Modell (Port 8001)

Als eigener Prozess/Container, **getrennt** vom qwen3.6. Wichtig ist der
`--served-model-name qwen-vl` (unter diesem Namen spricht MAS das Modell an) und
der niedrige VRAM-Anteil.

**Bare-metal / venv:**
```
vllm serve /opt/models/qwen2.5-vl-7b-awq \
  --served-model-name qwen-vl \
  --host 0.0.0.0 --port 8001 \
  --gpu-memory-utilization 0.30 \
  --max-model-len 8192 \
  --limit-mm-per-prompt image=2
```
(Bei Weg B in Abschnitt 4 statt des Pfads `Qwen/Qwen2.5-VL-7B-Instruct-AWQ`
angeben.)

**Docker (Beispiel):**
```
docker run -d --name vllm-vl --gpus all \
  -p 8001:8001 \
  -v /opt/models/qwen2.5-vl-7b-awq:/model \
  vllm/vllm-openai:latest \
  --model /model --served-model-name qwen-vl \
  --host 0.0.0.0 --port 8001 \
  --gpu-memory-utilization 0.30 --max-model-len 8192 --limit-mm-per-prompt image=2
```

Als Dauerdienst am besten eine **systemd-Unit** `vllm-vl.service` anlegen
(analog zu eurer qwen3.6-Unit), damit es einen Neustart übersteht.

Kontrolle:
```
curl http://localhost:8001/v1/models      # muss "qwen-vl" listen
nvidia-smi                                 # beide Modelle < 32 GB gesamt
```

---

## 6. Erreichbarkeit (Tailscale/Firewall)

- Der VL-Endpoint muss vom MAS-Host über Tailscale erreichbar sein, d. h.
  **Port 8001 auf `100.77.30.98`**. `--host 0.0.0.0` (oben gesetzt) sorgt dafür,
  dass vLLM auf allen Interfaces lauscht.
- Falls eine Firewall (ufw o. ä.) aktiv ist, Port 8001 für das Tailnet freigeben:
```
sudo ufw allow in on tailscale0 to any port 8001 proto tcp
```
- Test von außerhalb (vom MAS-Host aus prüfen wir das ohnehin):
```
curl http://100.77.30.98:8001/v1/models
```

---

## 7. OPTIONAL — on-demand laden & nach Leerlauf entladen

Nur nötig, wenn du das VL-Modell **nicht** dauerhaft im VRAM halten willst
(z. B. weil qwen3.6 später mehr Kontext/KV braucht). MAS unterstützt das bereits:

- MAS ruft vor einer OCR eine **Wake-URL** auf und **wartet**, bis der Endpoint
  bereit ist. Danach stoppt sich der Container per Idle-Timeout selbst → VRAM frei.
- Umsetzung auf dem Server (dein Teil): `vllm-vl.service` **nicht** bei Boot
  aktivieren; eine winzige HTTP-Route bereitstellen, die `systemctl start
  vllm-vl` (bzw. `docker start vllm-vl`) auslöst; und ein kleines Idle-Watch-
  Skript, das den Dienst nach z. B. 5 Min ohne Anfragen wieder stoppt
  (vLLM-Metrik `vllm:num_requests_running` auf `:8001/metrics` beobachten).
- Wir tragen dann zusätzlich ein: `MAS_OCR_VISION_WAKE_URL=<deine-wake-url>` und
  `MAS_OCR_VISION_STARTUP_WAIT_MS=45000`.

**Empfehlung:** Zum Start Abschnitt 5 (dauerhaft) nehmen — einfacher und
schneller. On-demand jederzeit später nachrüstbar, ohne MAS-Codeänderung.

---

## 8. Was WIR (MAS-Seite) danach tun — nur zur Info

Sobald `curl http://100.77.30.98:8001/v1/models` bei dir `qwen-vl` zeigt und du
uns „läuft" meldest, tragen wir in der MAS-Konfiguration ein:
```
MAS_OCR_VISION_BASE_URL=http://100.77.30.98:8001/v1
MAS_OCR_VISION_MODEL=qwen-vl
# (nur bei on-demand zusätzlich:)
# MAS_OCR_VISION_WAKE_URL=...
# MAS_OCR_VISION_STARTUP_WAIT_MS=45000
```
und testen mit einem echten Dokument (`node scripts/test-vision-ocr.mjs bild.png`).
Kein weiterer Eingriff auf dem 5090 nötig.

---

## 9. Copy-&-paste für deinen Cursor-Agenten (auf dem 5090)

Falls du das per Cursor auf dem Server erledigst — folgender Auftrag deckt alles ab:

> Auf diesem Rechner läuft vLLM (Port 8000, Modell `qwen3.6:35b-a3b`). Bitte:
> 1) Finde heraus, wie diese vLLM-Instanz gestartet wird (systemd-Unit oder
>    Docker) und setze/ändere `--gpu-memory-utilization` auf `0.60`, dann neu
>    starten. Prüfe mit `nvidia-smi`, dass jetzt ~19 GB statt ~29 GB belegt sind.
> 2) Prüfe `python -c "import vllm; print(vllm.__version__)"` (muss ≥ 0.7.2 sein,
>    sonst `pip install -U vllm`).
> 3) Lade `Qwen/Qwen2.5-VL-7B-Instruct-AWQ` nach `/opt/models/qwen2.5-vl-7b-awq`
>    (`huggingface-cli download ... --local-dir ...`).
> 4) Starte eine ZWEITE vLLM-Instanz als Dienst auf Port 8001:
>    `vllm serve /opt/models/qwen2.5-vl-7b-awq --served-model-name qwen-vl
>    --host 0.0.0.0 --port 8001 --gpu-memory-utilization 0.30
>    --max-model-len 8192 --limit-mm-per-prompt image=2`
>    (als systemd-Unit `vllm-vl.service`, damit es einen Reboot übersteht).
> 5) Öffne Port 8001 fürs Tailnet und verifiziere
>    `curl http://100.77.30.98:8001/v1/models` → muss `qwen-vl` listen.
> Wichtig: die bestehende qwen3.6-Instanz auf Port 8000 muss weiterlaufen; beide
> Modelle zusammen müssen unter 32 GB VRAM bleiben (mit `nvidia-smi` prüfen).

---

## 10. Checkliste

- [ ] qwen3.6-vLLM mit `--gpu-memory-utilization 0.60` neu gestartet, läuft weiter
- [ ] vLLM ≥ 0.7.2
- [ ] `Qwen/Qwen2.5-VL-7B-Instruct-AWQ` heruntergeladen und abgelegt
- [ ] 2. vLLM-Instanz „qwen-vl" auf Port 8001 läuft (als Dienst)
- [ ] `nvidia-smi`: beide Modelle zusammen < 32 GB
- [ ] Port 8001 über Tailscale erreichbar (`curl .../v1/models` zeigt `qwen-vl`)
- [ ] „läuft" an uns gemeldet

Bei Rückfragen: einfach antworten. Danke!
