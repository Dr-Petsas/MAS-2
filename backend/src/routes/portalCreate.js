// Pickadoc Portal/Create Studio — starkes Text-/Storyboard-Gehirn.
//
// Qwen 3.6 läuft auf dem privaten RTX-5090-Server (vLLM). Diese Route ist der
// EINZIGE Browser-Zugang: kein direkter Tailscale-/vLLM-Zugriff, kein Cloud-LLM,
// Firebase-ID-Token wird zentral in auth.js geprüft.
import { Router } from "express";
import { chat, isLocalLlm, strongLlm } from "../mail/llm.js";

const router = Router();

export const PORTAL_AI_OPERATIONS = [
  "titles",
  "script",
  "storyboard",
  "image_prompt",
  "board_bullets",
];

const OPERATION_CONTRACT = {
  titles: `Antworte als JSON: {"titles":["...","...","..."]}. Genau 5 kurze, konkrete deutsche Videotitel.`,
  script: `Antworte als JSON: {"title":"...","hook":"...","script":"...","cta":"..."}. Das Feld script ist ausschließlich der gesprochene Hauptteil. Halte die im Kontext genannte Wortzahl ein. Wenn keine Wortzahl genannt ist, 80–180 Wörter.`,
  storyboard: `Antworte als JSON: {"scenes":[{"title":"...","mode":"lipsync|ambient|board","narration":"...","visual":"...","durationHintSeconds":8,"bullets":[]}]}. 3–8 Szenen. Off-Stimme ist erlaubt: ambient/board laufen weiter unter narration.`,
  image_prompt: `Antworte als JSON: {"prompt":"...","negativePrompt":"..."}. Prompt beschreibt Ort, Perspektive, Abstand, Outfit, Licht und Pose; Gesicht/Identität unverändert.`,
  board_bullets: `Antworte als JSON: {"title":"...","bullets":["...","..."]}. Maximal 5 kurze, medizinisch verständliche Stichpunkte.`,
};

function clampText(value, max) {
  return String(value || "").trim().slice(0, max);
}

/** Entfernt Markdown-Fences und liest das erste vollständige JSON-Objekt. */
export function parsePortalAiJson(raw) {
  const clean = String(raw || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function buildPortalAiMessages(operation, input) {
  const topic = clampText(input?.topic, 500);
  const context = clampText(input?.context, 6500);
  const language = clampText(input?.language || "Deutsch", 40);
  const tone = clampText(input?.tone || "klar, empathisch, medizinisch verständlich", 200);
  const audience = clampText(input?.audience || "Patientinnen und Patienten", 200);

  return [
    {
      role: "system",
      content:
        `Du bist das Create-Studio-Gehirn von Pickadoc für deutsche Arztpraxen. ` +
        `Schreibe faktengetreu, ruhig, ohne Heilversprechen und ohne erfundene Patientendaten. ` +
        `Du gibst ausschließlich valides JSON ohne Markdown aus. ${OPERATION_CONTRACT[operation]}`,
    },
    {
      role: "user",
      content:
        `Aufgabe: ${operation}\nSprache: ${language}\nZielgruppe: ${audience}\nTon: ${tone}\n` +
        `Thema: ${topic || "allgemeine Patienteninformation"}\n` +
        `Praxis-/Fachkontext (nur verwenden, nichts erfinden):\n${context || "(kein Zusatzkontext)"}`,
    },
  ];
}

function sanitizeResult(operation, raw) {
  if (operation === "titles") {
    const titles = Array.isArray(raw?.titles)
      ? raw.titles.map((v) => clampText(v, 120)).filter(Boolean).slice(0, 5)
      : [];
    return titles.length ? { titles } : null;
  }
  if (operation === "script") {
    const script = clampText(raw?.script, 5000);
    if (!script) return null;
    return {
      title: clampText(raw?.title, 160),
      hook: clampText(raw?.hook, 500),
      script,
      cta: clampText(raw?.cta, 500),
    };
  }
  if (operation === "storyboard") {
    const scenes = Array.isArray(raw?.scenes)
      ? raw.scenes.slice(0, 8).map((scene, index) => ({
          id: `scene-${index + 1}`,
          title: clampText(scene?.title || `Szene ${index + 1}`, 120),
          mode: ["lipsync", "ambient", "board"].includes(scene?.mode) ? scene.mode : "lipsync",
          narration: clampText(scene?.narration, 3000),
          visual: clampText(scene?.visual, 1000),
          durationHintSeconds: Math.max(2, Math.min(90, Number(scene?.durationHintSeconds) || 8)),
          bullets: Array.isArray(scene?.bullets)
            ? scene.bullets.map((v) => clampText(v, 180)).filter(Boolean).slice(0, 6)
            : [],
        })).filter((scene) => scene.narration || scene.visual)
      : [];
    return scenes.length ? { scenes } : null;
  }
  if (operation === "image_prompt") {
    const prompt = clampText(raw?.prompt, 2000);
    return prompt
      ? { prompt, negativePrompt: clampText(raw?.negativePrompt, 1000) }
      : null;
  }
  if (operation === "board_bullets") {
    const bullets = Array.isArray(raw?.bullets)
      ? raw.bullets.map((v) => clampText(v, 180)).filter(Boolean).slice(0, 5)
      : [];
    return bullets.length ? { title: clampText(raw?.title, 160), bullets } : null;
  }
  return null;
}

router.post("/portal/create-ai", async (req, res) => {
  const operation = clampText(req.body?.operation, 40);
  if (!PORTAL_AI_OPERATIONS.includes(operation)) {
    return res.status(400).json({ ok: false, error: "invalid_operation" });
  }
  if (!req.auth?.clientId && req.auth?.kind !== "service") {
    return res.status(403).json({ ok: false, error: "tenant_required" });
  }

  const strong = strongLlm();
  if (!isLocalLlm(strong.base)) {
    return res.status(503).json({ ok: false, error: "qwen_not_private" });
  }

  const result = await chat(buildPortalAiMessages(operation, req.body), {
    baseUrl: strong.base,
    model: strong.model,
    temperature: operation === "titles" ? 0.65 : 0.35,
    maxTokens: operation === "storyboard" ? 1800 : 1200,
    timeoutMs: 90000,
  });
  if (!result.ok) {
    return res.status(503).json({
      ok: false,
      error: "qwen_unavailable",
      reason: result.reason || "unknown",
      model: strong.model,
    });
  }

  const parsed = parsePortalAiJson(result.text);
  const data = sanitizeResult(operation, parsed);
  if (!data) {
    return res.status(502).json({ ok: false, error: "qwen_invalid_json", model: result.model });
  }

  return res.json({
    ok: true,
    operation,
    provider: "qwen-5090",
    model: result.model,
    data,
  });
});

export default router;
