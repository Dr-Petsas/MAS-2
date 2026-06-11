# Patcht den Live-ConvAI-Agenten "Med Dent Zahnklinik" (Bianca) um den
# Rueckrufer-Kontext: {{caller_context}}-Abschnitt im Prompt + Placeholder-
# Default. Vorher wird der komplette Agent als Backup gesichert; nachher wird
# verifiziert, dass NUR Prompt + dynamic_variables geaendert wurden.
import json
import os
import sys
import urllib.request

AGENT_ID = "pSUVNVsczM4risVkBNAt"
BASE = "https://api.elevenlabs.io"

SECTION = (
    "\n\n# R\u00dcCKRUFER-KONTEXT (aus dem Praxisged\u00e4chtnis, kann leer sein):\n"
    "{{caller_context}}\n"
    "# Wenn oben Kontext steht: Die Praxis kennt diese Rufnummer. Erkenne den\n"
    "# Zusammenhang FR\u00dcH im Gespr\u00e4ch an (z.B. \"Ah, wir hatten versucht Sie zu\n"
    "# erreichen\") statt bei Null anzufangen. Erfinde nichts dazu; wenn der\n"
    "# Anrufer ein ANDERES Anliegen hat, folge dem Anrufer.\n"
)


def req(path, method="GET", body=None):
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        sys.exit("ELEVENLABS_API_KEY missing")
    r = urllib.request.Request(
        BASE + path,
        method=method,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())


def main():
    agent = req(f"/v1/convai/agents/{AGENT_ID}")

    backup_path = os.path.join(os.path.dirname(__file__), "..", "backups",
                               "bianca-agent-pre-caller-context.json")
    os.makedirs(os.path.dirname(backup_path), exist_ok=True)
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(agent, f, ensure_ascii=False, indent=2)
    print(f"backup written: {os.path.abspath(backup_path)}")

    cc = agent["conversation_config"]
    prompt = cc["agent"]["prompt"]["prompt"]
    if "{{caller_context}}" in prompt:
        print("prompt already contains caller_context - skipping prompt edit")
    else:
        cc["agent"]["prompt"]["prompt"] = prompt + SECTION

    dyn = cc["agent"].setdefault("dynamic_variables", {})
    ph = dyn.setdefault("dynamic_variable_placeholders", {})
    ph.setdefault("caller_context", "")

    req(f"/v1/convai/agents/{AGENT_ID}", method="PATCH",
        body={"conversation_config": cc})
    print("patch sent")

    after = req(f"/v1/convai/agents/{AGENT_ID}")
    a_cc = after["conversation_config"]
    ok_prompt = "{{caller_context}}" in a_cc["agent"]["prompt"]["prompt"]
    ok_ph = "caller_context" in a_cc["agent"]["dynamic_variables"]["dynamic_variable_placeholders"]
    tools_before = json.dumps(cc["agent"]["prompt"].get("tools"), sort_keys=True)
    tools_after = json.dumps(a_cc["agent"]["prompt"].get("tools"), sort_keys=True)
    tool_ids_before = json.dumps(cc["agent"]["prompt"].get("tool_ids"), sort_keys=True)
    tool_ids_after = json.dumps(a_cc["agent"]["prompt"].get("tool_ids"), sort_keys=True)
    fm_same = a_cc["agent"].get("first_message") == cc["agent"].get("first_message")
    print(f"verify: prompt_has_var={ok_prompt} placeholder={ok_ph} "
          f"tools_unchanged={tools_before == tools_after} "
          f"tool_ids_unchanged={tool_ids_before == tool_ids_after} "
          f"first_message_unchanged={fm_same}")
    if not (ok_prompt and ok_ph):
        sys.exit("VERIFY FAILED - check backup and restore if needed")


if __name__ == "__main__":
    main()
