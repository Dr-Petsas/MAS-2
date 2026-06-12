# Patcht den Live-ConvAI-Agenten "Med Dent Zahnklinik" (Bianca) um:
#   1. ESKALATIONS-Regeln im Prompt: droht ein Anrufer mit Anwalt/Kammer/
#      Anzeige oder ist hoerbar aufgebracht -> ruhig bleiben, Weiterleitung an
#      einen Menschen anbieten, Anliegen besonders sorgfaeltig zusammenfassen.
#   2. {{ai_disclosure}}-Zeile: die zuschaltbare DSGVO-KI-Ansage (Default ""
#      = keine Ansage). Der Schalter im Cockpit setzt den Placeholder-Default.
# Vorher Backup, nachher Verifikation (Tools/first_message unveraendert).
import json
import os
import sys
import urllib.request

AGENT_ID = os.environ.get("BIANCA_AGENT_ID", "pSUVNVsczM4risVkBNAt")
BASE = "https://api.elevenlabs.io"

ESCALATION = (
    "\n\n# ESKALATION (wichtig)\n"
    "- Droht der Anrufer mit Anwalt, Kammer, Anzeige oder Presse, oder ist er\n"
    "  hoerbar wuetend/verzweifelt: bleib RUHIG und freundlich, entschuldige\n"
    "  dich NICHT pauschal, sondern biete AKTIV an, dass sich ein Mitglied des\n"
    "  Praxisteams persoenlich und zeitnah meldet. Frage nach der besten\n"
    "  Rueckrufnummer und Uhrzeit.\n"
    "- Fasse das Anliegen solcher Anrufer besonders sorgfaeltig und woertlich\n"
    "  zusammen (wer, was, welche Frist, welche Drohung) - die Praxis sieht das\n"
    "  sofort auf der roten Liste.\n"
    "- Diskutiere NIE ueber Schuld, Rechnungen oder rechtliche Fragen. Keine\n"
    "  Zusagen ausser dem persoenlichen Rueckruf.\n"
)

DISCLOSURE = (
    "\n\n# HINWEIS-ANSAGE (zuschaltbar, kann leer sein)\n"
    "{{ai_disclosure}}\n"
    "- Steht oben ein Hinweis-Satz: sage ihn EINMAL direkt nach deiner\n"
    "  Begruessung, dann normal weiter. Ist oben nichts: KEINE solche Ansage.\n"
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
                               "bianca-agent-pre-escalation.json")
    os.makedirs(os.path.dirname(backup_path), exist_ok=True)
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(agent, f, ensure_ascii=False, indent=2)
    print(f"backup written: {os.path.abspath(backup_path)}")

    cc = agent["conversation_config"]
    prompt = cc["agent"]["prompt"]["prompt"]
    changed = False
    if "# ESKALATION (wichtig)" not in prompt:
        prompt += ESCALATION
        changed = True
    if "{{ai_disclosure}}" not in prompt:
        prompt += DISCLOSURE
        changed = True
    cc["agent"]["prompt"]["prompt"] = prompt

    dyn = cc["agent"].setdefault("dynamic_variables", {})
    ph = dyn.setdefault("dynamic_variable_placeholders", {})
    if "ai_disclosure" not in ph:
        ph["ai_disclosure"] = ""  # Default: KEINE Ansage
        changed = True

    if not changed:
        print("agent already patched - nothing to do")
        return

    req(f"/v1/convai/agents/{AGENT_ID}", method="PATCH",
        body={"conversation_config": cc})
    print("patch sent")

    after = req(f"/v1/convai/agents/{AGENT_ID}")
    a_cc = after["conversation_config"]
    ok_esc = "# ESKALATION (wichtig)" in a_cc["agent"]["prompt"]["prompt"]
    ok_dis = "{{ai_disclosure}}" in a_cc["agent"]["prompt"]["prompt"]
    ok_ph = "ai_disclosure" in a_cc["agent"]["dynamic_variables"]["dynamic_variable_placeholders"]
    tools_same = json.dumps(cc["agent"]["prompt"].get("tools"), sort_keys=True) == \
        json.dumps(a_cc["agent"]["prompt"].get("tools"), sort_keys=True)
    tool_ids_same = json.dumps(cc["agent"]["prompt"].get("tool_ids"), sort_keys=True) == \
        json.dumps(a_cc["agent"]["prompt"].get("tool_ids"), sort_keys=True)
    fm_same = a_cc["agent"].get("first_message") == cc["agent"].get("first_message")
    cczero = "caller_context" in a_cc["agent"]["dynamic_variables"]["dynamic_variable_placeholders"]
    print(f"verify: escalation={ok_esc} disclosure={ok_dis} placeholder={ok_ph} "
          f"caller_context_kept={cczero} tools_unchanged={tools_same} "
          f"tool_ids_unchanged={tool_ids_same} first_message_unchanged={fm_same}")
    if not (ok_esc and ok_dis and ok_ph and cczero):
        sys.exit("VERIFY FAILED - check backup and restore if needed")


if __name__ == "__main__":
    main()
