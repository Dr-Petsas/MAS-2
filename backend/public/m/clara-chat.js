/** Shared Clara phone UI: Audio/Chat toggle, chat bubbles, action proofs. */

export function formatSlotDe(iso) {
  const raw = String(iso ?? "").trim().replace(" ", "T");
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(d);
}

const CHAT_VISUAL_STATES = ["idle", "connecting", "listening", "thinking", "writing"];

export function mountClaraChat(root, { onSend, onModeChange, onConnect } = {}) {
  const els = {
    modeBar: root.querySelector("[data-clara-mode-bar]"),
    btnAudio: root.querySelector("[data-clara-mode-audio]"),
    btnChat: root.querySelector("[data-clara-mode-chat]"),
    audioPane: root.querySelector("[data-clara-audio-pane]"),
    bottomBar: root.querySelector("[data-clara-bottom-bar]"),
    chatPane: root.querySelector("[data-clara-chat-pane]"),
    chatScroll: root.querySelector("[data-clara-chat-scroll]"),
    chatMid: root.querySelector("[data-clara-chat-mid]"),
    connectBtn: root.querySelector("[data-clara-chat-connect]"),
    chatOrbWrap: root.querySelector("[data-clara-chat-orb-wrap]"),
    chatStateLabel: root.querySelector("[data-clara-chat-state]"),
    chatInput: root.querySelector("[data-clara-chat-input]"),
    chatSend: root.querySelector("[data-clara-chat-send]"),
    proofStrip: root.querySelector("[data-clara-proof-strip]"),
  };

  let mode = "audio";
  let partialLine = null;
  let assistantBuffer = "";
  let assistantTurnOpen = false;
  let chatVisual = "idle";

  const CHAT_LABELS = {
    idle: "",
    connecting: "Verbinde …",
    listening: "Bereit",
    thinking: "Clara denkt nach …",
    writing: "Clara schreibt …",
  };

  function setMode(next, opts = {}) {
    mode = next === "chat" ? "chat" : "audio";
    root.classList.toggle("clara-mode-audio", mode === "audio");
    root.classList.toggle("clara-mode-chat", mode === "chat");
    els.btnAudio?.classList.toggle("active", mode === "audio");
    els.btnChat?.classList.toggle("active", mode === "chat");
    els.btnAudio?.setAttribute("aria-pressed", mode === "audio" ? "true" : "false");
    els.btnChat?.setAttribute("aria-pressed", mode === "chat" ? "true" : "false");
    els.audioPane?.classList.toggle("hidden", mode === "chat");
    els.bottomBar?.classList.toggle("hidden", mode === "chat");
    els.chatPane?.classList.toggle("hidden", mode !== "chat");
    if (mode === "chat" && opts.focus) els.chatInput?.focus();
    onModeChange?.(mode);
  }

  setMode("audio");

  function setConnectVisible(on) {
    els.connectBtn?.classList.toggle("hidden", !on);
    if (on) els.chatOrbWrap?.classList.add("hidden");
  }

  function setChatVisual(next) {
    const state = CHAT_VISUAL_STATES.includes(next) ? next : "idle";
    chatVisual = state;
    CHAT_VISUAL_STATES.forEach((st) => els.chatMid?.classList.remove("chat-st-" + st));
    els.chatMid?.classList.add("chat-st-" + state);
    if (els.chatStateLabel && !els.chatStateLabel.dataset.holdStatus) {
      els.chatStateLabel.textContent = CHAT_LABELS[state] || "";
    }
    const showOrb = state !== "idle";
    els.chatOrbWrap?.classList.toggle("hidden", !showOrb);
    if (showOrb) els.connectBtn?.classList.add("hidden");
  }

  /** Status-/Fehlertext im Chat sichtbar (unten unter dem Orb). */
  function setStatusLine(text) {
    if (!els.chatStateLabel) return;
    const msg = String(text ?? "").trim();
    if (msg) {
      els.chatStateLabel.dataset.holdStatus = "1";
      els.chatStateLabel.textContent = msg;
      els.chatStateLabel.classList.add("has-status");
    } else {
      delete els.chatStateLabel.dataset.holdStatus;
      els.chatStateLabel.classList.remove("has-status");
      els.chatStateLabel.textContent = CHAT_LABELS[chatVisual] || "";
    }
  }

  els.btnAudio?.addEventListener("click", () => setMode("audio"));
  els.btnChat?.addEventListener("click", () => setMode("chat", { focus: false }));
  els.connectBtn?.addEventListener("click", () => {
    setConnectVisible(false);
    setChatVisual("connecting");
    onConnect?.();
  });

  function scrollChat() {
    if (!els.chatScroll) return;
    els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
  }

  function addBubble(role, text, { partial = false } = {}) {
    if (!els.chatScroll || !text) return;
    const wrap = document.createElement("div");
    wrap.className = `clara-bubble clara-bubble-${role}${partial ? " partial" : ""}`;
    wrap.textContent = text;
    if (partial && partialLine) {
      partialLine.textContent = text;
      partialLine.classList.toggle("hidden", !text);
      scrollChat();
      return;
    }
    if (partial) {
      partialLine = wrap;
      els.chatScroll.appendChild(wrap);
    } else {
      if (partialLine) {
        partialLine.remove();
        partialLine = null;
      }
      els.chatScroll.appendChild(wrap);
    }
    scrollChat();
  }

  function renderProofCard(proof) {
    const card = document.createElement("div");
    card.className = "clara-proof-card";
    if (proof.kind === "absence") {
      card.innerHTML = `
      <div class="clara-proof-head">✓ ${escapeHtml(proof.title || "Abwesenheit eingetragen")}</div>
      ${proof.dateLabel ? `<div class="clara-proof-line"><span>Tag</span><strong>${escapeHtml(proof.dateLabel)}</strong></div>` : ""}
      ${proof.windowLabel ? `<div class="clara-proof-line"><span>Zeitraum</span><strong>${escapeHtml(proof.windowLabel)}</strong></div>` : ""}
      ${proof.calendarName ? `<div class="clara-proof-line"><span>Bei</span><strong>${escapeHtml(proof.calendarName)}</strong></div>` : ""}
      ${proof.cancelledCount > 0 ? `<div class="clara-proof-line"><span>Absagen</span><strong>${proof.cancelledCount} Termin(e)</strong></div>` : ""}
    `;
    } else {
      const slot = proof.slotLabel || formatSlotDe(proof.slotIso);
      card.innerHTML = `
      <div class="clara-proof-head">✓ ${escapeHtml(proof.title || "Termin eingetragen")}</div>
      ${proof.patient ? `<div class="clara-proof-line"><span>Patient</span><strong>${escapeHtml(proof.patient)}</strong></div>` : ""}
      ${slot ? `<div class="clara-proof-line"><span>Termin</span><strong>${escapeHtml(slot)}</strong></div>` : ""}
      ${proof.calendarName ? `<div class="clara-proof-line"><span>Bei</span><strong>${escapeHtml(proof.calendarName)}</strong></div>` : ""}
      ${proof.visitMotiveName ? `<div class="clara-proof-line"><span>Grund</span><strong>${escapeHtml(proof.visitMotiveName)}</strong></div>` : ""}
    `;
    }
    if (proof.imageUrl) {
      const img = document.createElement("img");
      img.className = "clara-proof-img";
      img.alt = "Terminbeleg";
      img.src = proof.imageUrl;
      img.loading = "lazy";
      card.appendChild(img);
    }
    return card;
  }

  function showProof(proof) {
    const card = renderProofCard(proof);
    els.chatScroll?.appendChild(card.cloneNode(true));
    scrollChat();
    if (els.proofStrip) {
      els.proofStrip.innerHTML = "";
      els.proofStrip.appendChild(card);
      els.proofStrip.classList.remove("hidden");
    }
  }

  function flushAssistantReply() {
    const text = String(assistantBuffer || "").trim();
    assistantBuffer = "";
    assistantTurnOpen = false;
    if (!text) {
      setChatVisual("listening");
      return;
    }
    addBubble("assistant", text);
    setChatVisual("listening");
  }

  async function sendChat() {
    const text = (els.chatInput?.value || "").trim();
    if (!text) return;
    flushAssistantReply();
    els.chatInput.value = "";
    addBubble("user", text);
    await onSend?.(text);
  }

  els.chatSend?.addEventListener("click", sendChat);
  els.chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  return {
    setMode,
    getMode: () => mode,
    getChatVisual: () => chatVisual,
    setConnectVisible,
    setChatVisual,
    setStatusLine,
    addBubble,
    showProof,
    handleEvent(obj) {
      if (!obj?.type) return;
      if (obj.type === "assistant_text" && obj.text) {
        // Worker streams cumulative text token-by-token. Buffer until the
        // turn finishes (v3_chat_turn metric or audio_state idle) so the
        // reply appears as one bubble, not letter by letter.
        assistantBuffer = String(obj.text);
        if (!assistantTurnOpen) {
          assistantTurnOpen = true;
          setChatVisual("thinking");
        }
      } else if (obj.type === "metric" && obj.name === "v3_chat_turn") {
        flushAssistantReply();
      } else if (obj.type === "audio_state" && obj.state === "idle" && assistantTurnOpen) {
        flushAssistantReply();
      } else if (obj.type === "final_transcript" && obj.text) {
        addBubble("user", obj.text);
        setChatVisual("thinking");
      } else if (obj.type === "partial_transcript") {
        addBubble("user", obj.text || "…", { partial: true });
      } else if (obj.type === "action_proof") {
        flushAssistantReply();
        showProof(obj);
        if (obj.text) addBubble("assistant", obj.text);
        setChatVisual("listening");
      } else if (obj.type === "error") {
        flushAssistantReply();
        const msg = String(obj.error || "Fehler").trim();
        if (msg) setStatusLine(msg);
        setChatVisual("listening");
      }
    },
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
