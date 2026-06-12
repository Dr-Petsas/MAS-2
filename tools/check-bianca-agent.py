import json, os, urllib.request

# Vergleich: Live-Agent vs. Backup vor dem caller_context-Patch.
key = ""
for line in open(r"F:\MAS-2\backend\.env", encoding="utf-8-sig"):
    if line.strip().startswith("ELEVENLABS_API_KEY="):
        key = line.split("=", 1)[1].strip()
AGENT = "pSUVNVsczM4risVkBNAt"

req = urllib.request.Request(
    f"https://api.elevenlabs.io/v1/convai/agents/{AGENT}",
    headers={"xi-api-key": key},
)
live = json.load(urllib.request.urlopen(req))
backup = json.load(open(r"F:\MAS-2\backups\bianca-agent-pre-caller-context.json", encoding="utf-8-sig"))

def prompt_of(cfg):
    return cfg.get("conversation_config", {}).get("agent", {}).get("prompt", {})

lp, bp = prompt_of(live), prompt_of(backup)
lp_text, bp_text = lp.get("prompt", ""), bp.get("prompt", "")

def tool_names(p):
    names = [t.get("name", "?") for t in p.get("tools", []) or []]
    names += [str(t) for t in p.get("tool_ids", []) or []]
    return names

print("Prompt-Laenge vorher:", len(bp_text), "| jetzt:", len(lp_text))
print("Original-Prompt vollstaendig enthalten:", bp_text.strip() in lp_text)
print("caller_context-Abschnitt vorhanden:", "{{caller_context}}" in lp_text)
print("Tools vorher :", tool_names(bp))
print("Tools jetzt  :", tool_names(lp))
dv_live = lp.get("dynamic_variables", {}) or live.get("conversation_config", {}).get("agent", {}).get("dynamic_variables", {})
print("Dynamic-Variable-Defaults:", json.dumps(dv_live, ensure_ascii=False)[:300])
print("--- Angehaengter Teil (Anfang) ---")
print(lp_text[len(bp_text):][:400].strip()[:400] if bp_text.strip() in lp_text else "(Abweichung! manueller Diff noetig)")
