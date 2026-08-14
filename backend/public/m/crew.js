/** Zuständige Kollegin aus Tool, Karte oder Worker-Event — nicht aus dem Satz. */

const NAMES = new Set(["Bianca", "Lisa", "Nadine", "Marie", "Sophie", "Julia", "Lena"]);

const TOOLS = {
  call_log: "Bianca",
  lookup_caller: "Bianca",
  ask_nadine: "Nadine",
  read_email: "Nadine",
  compose_email: "Nadine",
  approve_and_send: "Nadine",
  comms_digest: "Nadine",
  send_sms: "Lisa",
  delegate_call: "Lisa",
  lisa_call_result: "Lisa",
  gapfill_call_patient: "Lisa",
  list_recall_candidates: "Lisa",
  approve_recall: "Lisa",
  recall_status: "Lisa",
  recall_snooze: "Lisa",
  gap_briefing: "Lisa",
  save_treatment_dictation: "Lena",
  strike_treatment_dictation: "Lena",
  start_findings_for_patient: "Lena",
  start_treatment_recording: "Lena",
  stop_treatment_recording: "Lena",
  start_patient_dictation: "Lena",
  stop_patient_dictation: "Lena",
  start_backdated_dictation: "Lena",
  get_doku_requirements: "Lena",
  get_open_doku_questions: "Lena",
  get_doku_luecken: "Lena",
  set_doku_rule: "Lena",
  plan_dokumentieren: "Lena",
  patient_treatments: "Lena",
  termin_abrechnen: "Sophie",
  qm_calendar: "Julia",
  team_dienstplan: "Marie",
  team_betriebsferien: "Marie",
};

const CARDS = {
  lisa_live: "Lisa",
  lisa_sms: "Lisa",
  lisa: "Lisa",
  recall_kandidaten: "Lisa",
  doku: "Lena",
  dokumente: "Lena",
  luecken: "Lena",
  sophie: "Sophie",
};

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/-/g, "_");
}

function whoFromEingaenge(card) {
  const sub = String(card?.subtitle || "");
  const hasCall = /anruf/i.test(sub);
  const hasMail = /e-?mail|brief/i.test(sub);
  if (hasCall && !hasMail) return "Bianca";
  if (hasMail) return "Nadine";
  return "";
}

function whoFromDictate(channel) {
  const ch = norm(channel);
  if (/sms|anruf|call|telefon/.test(ch)) return "Lisa";
  if (/mail|brief|email/.test(ch)) return "Nadine";
  return "";
}

/**
 * @param {{ tool?: string, card?: { kind?: string, subtitle?: string }, who?: string, channel?: string }} src
 * @returns {string} Kolleginnen-Name oder "" (Clara / unbekannt — kein Chip)
 */
export function crewWho(src = {}) {
  const direct = String(src.who || "").trim();
  if (NAMES.has(direct)) return direct;
  const tool = norm(src.tool);
  if (tool === "dictate") return whoFromDictate(src.channel);
  if (tool && TOOLS[tool]) return TOOLS[tool];
  const kind = norm(src.card?.kind);
  if (kind === "eingaenge") return whoFromEingaenge(src.card);
  if (kind === "wiedervorlage") return "Nadine";
  if (kind && CARDS[kind]) return CARDS[kind];
  return "";
}

export function bindCrewChips(host) {
  const els = Array.from(host?.querySelectorAll("span") || []);
  const byName = {};
  els.forEach((el) => { byName[el.textContent.trim()] = el; });
  let current = "";

  function paint(who, cls) {
    els.forEach((el) => el.classList.remove("is-asking", "is-answered"));
    const el = who && byName[who];
    if (el) el.classList.add(cls);
  }

  return {
    note(src) {
      const who = crewWho(src);
      if (who) current = who;
      return who;
    },
    asking() {
      if (current) paint(current, "is-asking");
      else els.forEach((el) => el.classList.remove("is-asking", "is-answered"));
    },
    answered() {
      if (current) paint(current, "is-answered");
    },
    clear() {
      current = "";
      els.forEach((el) => el.classList.remove("is-asking", "is-answered"));
    },
    who: () => current,
  };
}
