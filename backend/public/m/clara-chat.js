/** Shared Clara phone UI: Audio/Chat toggle, chat bubbles, action proofs,
 *  Übersichts-Karten (04.07.2026) im pickadoc.ai-Hero-Design. */

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

// ── Karten-Icons: Inline-SVG (kein CDN — die PWA muss offline zeichnen). ──
// Motive wie die FontAwesome-Icons im Website-Hero (Dreieck, Tropfen, Herz …).
const CARD_ICONS = {
  alert:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 1 21h22L12 2zm0 6 1 7h-2l1-7zm0 11.2a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z"/></svg>',
  droplet:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13z"/></svg>',
  heart:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21 4 13a5 5 0 0 1 7-7l1 1 1-1a5 5 0 0 1 7 7l-8 8z"/></svg>',
  scissors: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.6 7.6a3 3 0 1 0-1.2 1.6L11 12l-2.6 2.8a3 3 0 1 0 1.2 1.6L12 13.6l7 7.4h3L9.6 7.6zM22 3h-3l-5.4 5.8 1.7 1.8L22 3zM6 6.5A1.5 1.5 0 1 1 6 3.4a1.5 1.5 0 0 1 0 3.1zm0 14.1a1.5 1.5 0 1 1 0-3.1 1.5 1.5 0 0 1 0 3.1z"/></svg>',
  mail:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 5h20v14H2V5zm10 7L4 7v10h16V7l-8 5zm0-2 8-4H4l8 4z"/></svg>',
  phone:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .6 3.6 1 1 0 0 1-.25 1l-2.25 2.2z"/></svg>',
  pen:      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.2V21h3.8L17.9 9.9l-3.8-3.8L3 17.2zM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z"/></svg>',
  note:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16v18l-4-3H4V3zm3 5h10v2H7V8zm0 4h7v2H7v-2z"/></svg>',
  ray:      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 12.5A2.5 2.5 0 1 1 12 9.5a2.5 2.5 0 0 1 0 5zM12 4l1.2 4.6a3.6 3.6 0 0 0-2.4 0L12 4zm-6.9 12 3.5-3.2c.2.8.7 1.5 1.4 2L5.1 16zm13.8 0-4.9-1.2c.7-.5 1.2-1.2 1.4-2l3.5 3.2z"/></svg>',
  euro:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 18.5A6.5 6.5 0 0 1 9.2 14H15v-2H8.7a6.6 6.6 0 0 1 0-2H15V8H9.2a6.5 6.5 0 0 1 10.4-2.3l1.4-1.4A8.5 8.5 0 0 0 7.1 8H4v2h2.6a8.7 8.7 0 0 0 0 2H4v2h3.1a8.5 8.5 0 0 0 13.9 3.7l-1.4-1.4a6.5 6.5 0 0 1-4.1 2.2z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v2H4v18h16V4h-3V2h-2v2H9V2H7zm11 8v10H6V10h12z"/></svg>',
  check:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 16.2-3.5-3.5L4 14.2 9 19 20 8l-1.4-1.4L9 16.2z"/></svg>',
  clock:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5h-2v6l5 3 1-1.7-4-2.3V7z"/></svg>',
  doc:      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 11h8v2H8v-2zm0 4h8v2H8v-2z"/></svg>',
  person:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5z"/></svg>',
  tooth:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C9 3 8.5 2 6.5 2A4.5 4.5 0 0 0 2 6.5c0 2 .8 3 1.4 4.6.7 1.7.6 4.4 1.6 8.4.3 1.4 2.2 1.4 2.6 0 .6-2.4.7-5.5 2.2-5.5h4.4c1.5 0 1.6 3.1 2.2 5.5.4 1.4 2.3 1.4 2.6 0 1-4 1-6.7 1.6-8.4.6-1.6 1.4-2.6 1.4-4.6A4.5 4.5 0 0 0 17.5 2C15.5 2 15 3 12 3z"/></svg>',
  question: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 16h-2v-2h2v2zm1.1-6.3-.9.9c-.7.7-1.2 1.3-1.2 2.4h-2v-.5c0-1.1.5-2.1 1.2-2.8l1.2-1.3A2 2 0 0 0 10 8H8a4 4 0 1 1 8 0c0 .9-.4 1.7-.9 2.7z"/></svg>',
  mic:      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2z"/></svg>',
};
const LEVEL_FALLBACK_ICON = { alert: "alert", warn: "question", info: "note", ok: "check" };

// Muelltonne fuer Kandidaten-Zeilen der Anrufliste (Chef 28.07.2026: die
// Karten-Ansicht am Telefon hatte KEINE Bedienelemente — "keine muelltonnen").
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h1.6v-8H10zm3.4 0v8H15v-8h-1.6z"/></svg>';

/**
 * Übersichts-Karte im Website-Hero-Design ("Nächster Patient" /
 * "Das Wichtigste") als DOM-Element. Reine Anzeige — AUSSER: Kandidaten-
 * Zeilen einer Anrufliste (kind=recall_kandidaten, Item traegt pid) bekommen
 * eine Muelltonne, wenn onRemoveKandidat verdrahtet ist.
 * @param {object} card  { kind, caseId, tag, title, time, subtitle, heading, items, footer }
 * @param {object} opts  { when, onRemoveKandidat } — Uhrzeit-Label + Tonnen-Handler
 */
export function renderOverviewCard(card, { when = "", onRemoveKandidat = null } = {}) {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.kind = String(card?.kind || "");

  const mitTonnen = typeof onRemoveKandidat === "function"
    && String(card?.kind) === "recall_kandidaten" && String(card?.caseId || "");
  const items = Array.isArray(card?.items) ? card.items : [];
  const lis = items.map((it, idx) => {
    const level = ["alert", "warn", "info", "ok"].includes(it?.level) ? it.level : "info";
    const iconKey = CARD_ICONS[it?.icon] ? it.icon : LEVEL_FALLBACK_ICON[level];
    const tonne = (mitTonnen && it?.pid)
      ? `<button type="button" class="card-trash" data-pid="${escapeHtml(it.pid)}" data-idx="${idx}" aria-label="Von der Liste nehmen">${TRASH_ICON}</button>`
      : "";
    return `<li class="is-${level}"><i>${CARD_ICONS[iconKey]}</i><span>${escapeHtml(it?.text || "")}</span>${tonne}</li>`;
  }).join("");

  el.innerHTML = `
    <div class="card-next">
      ${card?.tag ? `<div class="card-tag">${escapeHtml(card.tag)}</div>` : ""}
      <div class="card-name">
        <b>${escapeHtml(card?.title || "")}</b>
        ${card?.time ? `<span class="card-time">${escapeHtml(card.time)}</span>` : ""}
      </div>
      ${card?.subtitle ? `<div class="card-why">${escapeHtml(card.subtitle)}</div>` : ""}
    </div>
    ${lis ? `
    <div class="card-key">
      <div class="card-key-h">${escapeHtml(card?.heading || "Das Wichtigste")}</div>
      <ul>${lis}</ul>
    </div>` : ""}
    ${(card?.footer || when) ? `
    <div class="card-foot">
      <span class="fnote">${escapeHtml(card?.footer || "")}</span>
      <span class="fwhen">${escapeHtml(when)}</span>
    </div>` : ""}
  `;

  // Tonnen-Klick: Zeile sofort ausblenden (optimistisch), Handler entscheidet.
  // Meldet der Server einen Fehler, holt der Handler die Zeile zurueck.
  if (mitTonnen) {
    el.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".card-trash");
      if (!btn) return;
      e.stopPropagation();
      const li = btn.closest("li");
      const idx = Number(btn.dataset.idx);
      const it = items[idx] || {};
      if (li) li.classList.add("is-removing");
      btn.disabled = true;
      Promise.resolve(onRemoveKandidat({
        caseId: String(card.caseId || ""),
        patientId: String(btn.dataset.pid || ""),
        name: String(it.name || it.text || ""),
      })).then((ok) => {
        if (ok !== false) { li?.remove(); return; }
        li?.classList.remove("is-removing");
        btn.disabled = false;
      }).catch(() => {
        li?.classList.remove("is-removing");
        btn.disabled = false;
      });
    });
  }
  return el;
}

export function mountClaraChat(root, { onSend, onModeChange, onConnect, onCard } = {}) {
  const els = {
    modeBar: root.querySelector("[data-clara-mode-bar]"),
    btnAudio: root.querySelector("[data-clara-mode-audio]"),
    btnChat: root.querySelector("[data-clara-mode-chat]"),
    audioPane: root.querySelector("[data-clara-audio-pane]"),
    bottomBar: root.querySelector("[data-clara-bottom-bar]"),
    flipLabels: root.querySelector("[data-clara-flip-labels]"),
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
    els.flipLabels?.classList.toggle("hidden", mode === "chat");
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

  /** Übersichts-Karte in den Chat-Verlauf legen (gleiches Hero-Design). */
  function addCard(card) {
    if (!els.chatScroll || !card) return;
    const el = renderOverviewCard(card, {
      when: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    });
    el.classList.add("is-new");
    els.chatScroll.appendChild(el);
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
    addCard,
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
      } else if (obj.type === "card" && obj.card) {
        // Übersichts-Karte (Heads-up, Doku-Memo, Tagesplan …): im Chat
        // inline; die Audio-Rückseite bedient der Host über onCard.
        // NICHT flushen — die Karte kommt MITTEN im Turn (nach dem Tool,
        // vor Claras Antwortsatz); der Antwort-Bubble folgt danach.
        if (mode === "chat") addCard(obj.card);
        try { onCard?.(obj.card); } catch { /* Anzeige ist Komfort */ }
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
