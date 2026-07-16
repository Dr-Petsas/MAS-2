# 5090: Vision-OCR on-demand + Text-LLM mit 32k Kontext

**Stand:** 16.07.2026 — Antwort auf die Ist-Einrichtung (dauerhaft 35B + VL-3B).  
**Ziel:** Text-LLM wieder mit `max_model_len 32768`, Vision nur bei Bedarf.

Adressat: Server-Admin (SSH auf pickadoc1).  
MAS-Code unterstützt Wake/Wait bereits (`MAS_OCR_VISION_WAKE_*`).

---

## Warum umstellen

Dauerhaft parallel (Ist):

- Text 35B @ `gpu-memory-utilization 0.70`, `max_model_len 16384`
- Vision 3B-AWQ dauerhaft daneben  
→ ~30,5 / 32 GB, **kein Platz für 32k KV-Cache**.

Gewünscht:

- Text **immer an**, Kontext **32768** (Briefe, Telefon-Kontext, Shared Memory)
- Vision **nur bei Scan-Upload** starten, nach Idle wieder stoppen  
→ VRAM für Text frei, OCR-Latenz nur beim ersten Aufruf (~30–60 s Container-Start)

Modell-ID `qwen-vl` und Port 8001 bleiben. Das bereits geladene  
`Qwen2.5-VL-3B-Instruct-AWQ` unter `/opt/pickadoc/phone-agent/models/…` bleibt.

---

## Soll-Zustand

| Rolle | Port | Laufzeit | Wichtige Flags |
|--------|------|----------|----------------|
| Text `qwen3.6:35b-a3b` | 8000 | **immer** (`restart: unless-stopped`) | `max_model_len **32768**`, `gpu-memory-utilization` so hoch, dass 32k stabil läuft (typisch **0.85–0.90**, wenn VL gestoppt ist) |
| Vision `qwen-vl` | 8001 | **on-demand** | `gpu-memory-utilization ~0.18`, `max_model_len 4096`, **kein** Autostart beim Boot |

Wenn Vision läuft, teilen sich beide die GPU kurzzeitig — Text behält seinen Speicher; Vision braucht die freie Rest-VRAM. Deshalb Text nicht auf 0.95+ setzen, sondern so wählen, dass **~5–7 GB frei bleiben**, während Vision hochfährt (mit `nvidia-smi` justieren). Richtwert oft **0.78–0.85** bei 32k — bitte messen, nicht raten.

---

## Was du auf dem Server ändern musst

### 1) Text-Container: 32k zurück

In `deploy/linux/docker-compose.yml` (Service `vllm`):

- `--max-model-len` von `16384` auf **`32768`**
- `--gpu-memory-utilization` von `0.70` auf einen Wert, der 32k + Rest für VL erlaubt (siehe oben; starten mit **0.82**, bei OOM leicht senken)

Neu starten:

```bash
cd /opt/pickadoc/phone-agent/deploy/linux
docker compose up -d vllm
curl -s http://127.0.0.1:8000/v1/models
nvidia-smi   # Text allein sollte unter ~27 GB bleiben, Rest frei für VL
```

### 2) Vision-Container: kein Boot-Autostart

Service `vllm-vl`:

- **`restart: "no"`** (oder Profil `ocr`, das nicht default ist) — **nicht** `unless-stopped`
- Beim Boot **nicht** mitstarten
- Image/Command wie bisher (3B-AWQ, `--served-model-name qwen-vl`, Port 8001) belassen

Manuell testen:

```bash
docker compose up -d vllm-vl
curl -s http://127.0.0.1:8001/v1/models   # id: qwen-vl
docker compose stop vllm-vl
```

### 3) Wake-URL (MAS stupst vor OCR an)

Kleine HTTP-Route auf pickadoc1 (z. B. Port **8010**, nur Tailnet), die:

1. `docker compose up -d vllm-vl` (oder `docker start …`) ausführt
2. `200 OK` zurückgibt (Start ist asynchron ok)

Beispiel (Sketch — an eure Compose-Pfade anpassen):

```bash
# z. B. /opt/pickadoc/phone-agent/scripts/wake-vl.sh
#!/bin/bash
cd /opt/pickadoc/phone-agent/deploy/linux
docker compose up -d vllm-vl
echo "waking"
```

Davor ein Miniservice (systemd + `socat`/winziges Node/Python), erreichbar als:

```
http://100.77.30.98:8010/wake-vl
```

GET reicht. Absichern: nur Tailscale-Interface binden (`100.x` / `tailscale0`).

### 4) Idle-Stop (VRAM wieder frei)

Watchdog (Cron alle 1 Min oder Sidecar), der `vllm-vl` stoppt, wenn z. B. **5 Minuten** keine Requests:

- Metrik: `http://127.0.0.1:8001/metrics` → `vllm:num_requests_running` / Request-Zähler, **oder**
- schlicht: wenn `/v1/models` erreichbar und letzte Aktivität > 5 Min (Log/Datei-Timestamp bei jedem Wake + Proxy)

Minimalvariante:

```bash
# nach Wake: idle-timer; bei neuem Request Timer resetten
docker compose stop vllm-vl
```

Ohne Idle-Stop bleibt Vision nach dem ersten Upload ewig im VRAM → 32k-Text leidet wieder.

### 5) Uns melden

Wenn Wake-URL steht und Text wieder 32k hat:

```
WAKE=http://100.77.30.98:8010/wake-vl   # oder eure URL
curl -s http://100.77.30.98:8000/v1/models
# optional: Wake + curl :8001/v1/models
```

---

## Env auf MAS-Seite (wir setzen das, sobald Wake steht)

```env
MAS_OCR_VISION_BASE_URL=http://100.77.30.98:8001/v1
MAS_OCR_VISION_MODEL=qwen-vl
MAS_OCR_VISION_WAKE_URL=http://100.77.30.98:8010/wake-vl
MAS_OCR_VISION_WAKE_METHOD=GET
MAS_OCR_VISION_STARTUP_WAIT_MS=90000
```

(`STARTUP_WAIT_MS=90000` = bis 90 s auf `/v1/models` pollen, während der Container lädt.  
Fällt der Start aus → Tesseract-Fallback.)

Schreib-LLM unverändert Port 8000 / `qwen3.6:35b-a3b` — mit **32k** auf dem Server.

---

## Copy-&-paste für Cursor auf pickadoc1

> Ist: vllm (8000) + vllm-vl (8001) laufen dauerhaft parallel, Text nur mit
> max_model_len 16384. Soll: Text immer an mit max_model_len 32768; Vision
> on-demand (kein Boot-Start, restart no), Idle-Stop nach ~5 Min ohne Traffic.
> 1) In docker-compose.yml Service vllm: max_model_len 32768, gpu-memory-utilization
>    so setzen, dass 32k stabil ist und ~5–7 GB Rest für VL bleiben (Start 0.82).
> 2) Service vllm-vl: restart "no", nicht beim Boot starten. Modell qwen-vl / 3B-AWQ
>    und Port 8001 beibehalten.
> 3) Wake-HTTP auf Port 8010 (nur Tailnet): GET startet `docker compose up -d vllm-vl`.
> 4) Idle-Stop: nach 5 Min ohne Nutzung `docker compose stop vllm-vl`.
> 5) Verifizieren: Text allein mit 32k; nach Wake :8001/v1/models zeigt qwen-vl;
>    nach Idle ist VL gestoppt und nvidia-smi zeigt wieder freien VRAM für Text.
> Melde die finale Wake-URL zurück.

---

## Checkliste

- [ ] Text: `max_model_len 32768`, läuft dauerhaft
- [ ] `nvidia-smi`: mit gestopptem VL genug frei für 3B-AWQ
- [ ] `vllm-vl` startet **nicht** automatisch beim Reboot
- [ ] Wake-URL startet VL; `/v1/models` auf 8001 antwortet mit `qwen-vl`
- [ ] Idle-Stop nach ~5 Min → VRAM wieder frei
- [ ] Wake-URL an MAS gemeldet
