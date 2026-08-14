/** Lisa-Live-Flip: laufender Anruf auf Handy/iPad (wählen, sprechen, Transkript, Übernehmen). */

const PHASE = {
  scheduled: "Eingeplant — Lisa ruft später an.",
  dialing: "Lisa wählt …",
  talking: "Lisa spricht.",
  joining: "Ihr Telefon klingelt …",
  takeover: "Sie sind verbunden. Lisa ist stumm.",
  done: "Gespräch beendet.",
  ended: "Gespräch beendet.",
};
const CHEF_PHONE_KEY = "pickadoc.lisaChefPhone";

function displayPhone(n) {
  const raw = String(n || "").trim();
  if (!raw) return "";
  return raw.replace(/^\+49/, "0");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function injectCss() {
  if (document.getElementById("lisa-live-css")) return;
  const st = document.createElement("style");
  st.id = "lisa-live-css";
  st.textContent = `
    .lisa-live { display:none; flex-direction:column; gap:10px; padding:4px 2px 12px;
      min-height:0; flex:1; }
    .lisa-live.is-on { display:flex; }
    .lisa-live .ll-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .lisa-live .ll-tag { font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
      color:#2ee6c8; }
    .lisa-live .ll-close { border:0; background:transparent; color:#8fa3bd; font:inherit;
      font-size:13px; font-weight:700; cursor:pointer; padding:6px 4px; }
    .lisa-live .ll-who { font-size:22px; font-weight:800; letter-spacing:-.03em; line-height:1.15; }
    .lisa-live .ll-phase { font-size:15px; font-weight:700; color:#2ee6c8; }
    .lisa-live .ll-phase.is-talk { color:#34d399; }
    .lisa-live .ll-phase.is-end { color:#8fa3bd; }
    .lisa-live .ll-phone { font-variant-numeric:tabular-nums; font-size:18px; font-weight:800;
      letter-spacing:.04em; }
    .lisa-live .ll-auftrag { font-size:13px; color:#8fa3bd; line-height:1.4; }
    .lisa-live .ll-lines { flex:1; min-height:120px; overflow:auto; display:flex; flex-direction:column;
      gap:8px; padding:8px 2px; -webkit-overflow-scrolling:touch; }
    .lisa-live .ll-line { border-radius:12px; padding:9px 12px; font-size:14px; line-height:1.4;
      background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); }
    .lisa-live .ll-line.agent { border-color:rgba(46,230,200,.28); }
    .lisa-live .ll-line .w { display:block; font-size:11px; font-weight:800; letter-spacing:.06em;
      text-transform:uppercase; color:#2ee6c8; margin-bottom:3px; }
    .lisa-live .ll-line.user .w { color:#ffb347; }
    .lisa-live .ll-empty { color:#5f719a; font-size:13px; padding:12px 4px; }
    .lisa-live .ll-actions { display:flex; flex-direction:column; gap:8px; }
    .lisa-live .ll-btn { display:block; text-align:center; text-decoration:none; border:0; border-radius:14px;
      padding:13px 14px; font:inherit; font-weight:800; cursor:pointer; }
    .lisa-live .ll-btn.take { background:linear-gradient(135deg,#ff4d6d,#c81e4a); color:#fff; }
    .lisa-live .ll-btn[hidden] { display:none !important; }
    .lisa-live .ll-btn:disabled { opacity:.45; cursor:default; }
    .lisa-live .ll-chef { display:flex; flex-direction:column; gap:4px; }
    .lisa-live .ll-chef label { font-size:11px; font-weight:800; letter-spacing:.06em;
      text-transform:uppercase; color:#8fa3bd; }
    .lisa-live .ll-chef input { border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.28);
      color:#e6edf6; border-radius:10px; padding:10px 12px; font:inherit; font-size:16px;
      font-weight:700; letter-spacing:.02em; }
    .lisa-live .ll-hint { font-size:12px; color:#8fa3bd; line-height:1.35; }
    .lisa-live .ll-line.chef { border-color:rgba(255,179,71,.35); }
    .lisa-live .ll-line.chef .w { color:#ffb347; }
    .lisa-live .ll-sms { margin-top:8px; padding:10px 12px; border-radius:10px;
      background:rgba(0,0,0,.28); font-size:14px; font-weight:600; line-height:1.45; color:#e6edf6; }
    .lisa-live .ll-line.is-in { opacity:0; transform:translateY(8px);
      animation:llIn .35s ease forwards; }
    @keyframes llIn { to { opacity:1; transform:none; } }
    .flip-face--cards:has(.lisa-live.is-on) .cards-face-head,
    .flip-face--cards:has(.lisa-live.is-on) .cards-scroll { display:none !important; }
    .clara-right:has(.lisa-live.is-on) #claraRightCards,
    .clara-right:has(.lisa-live.is-on) #featList,
    .clara-right:has(.lisa-live.is-on) .patient-card,
    .clara-right:has(.lisa-live.is-on) .right-h { display:none !important; }
  `;
  document.head.appendChild(st);
}

export function mountLisaLive(host, { getAuth } = {}) {
  injectCss();
  if (!host) return { start() {}, stop() {} };

  host.innerHTML = `
    <div class="ll-top">
      <span class="ll-tag">Lisa live</span>
      <button type="button" class="ll-close" data-ll-close>Zurück</button>
    </div>
    <div class="ll-who" data-ll-who></div>
    <div class="ll-phase" data-ll-phase></div>
    <div class="ll-phone" data-ll-phone></div>
    <div class="ll-auftrag" data-ll-auftrag></div>
    <div class="ll-lines" data-ll-lines><div class="ll-empty">Noch kein Wort — Lisa wählt.</div></div>
    <div class="ll-actions">
      <div class="ll-chef">
        <label for="ll-chef-phone">Ihre Nummer — wir rufen Sie an</label>
        <input id="ll-chef-phone" data-ll-chef type="tel" inputmode="tel" autocomplete="tel"
          placeholder="0176 …">
      </div>
      <button type="button" class="ll-btn take" data-ll-take>Gespräch übernehmen</button>
      <div class="ll-hint" data-ll-hint>Lisa bleibt in der Leitung, wird aber stumm. Das Transkript läuft weiter.</div>
    </div>
  `;
  host.classList.add("lisa-live");

  const els = {
    who: host.querySelector("[data-ll-who]"),
    phase: host.querySelector("[data-ll-phase]"),
    phone: host.querySelector("[data-ll-phone]"),
    auftrag: host.querySelector("[data-ll-auftrag]"),
    lines: host.querySelector("[data-ll-lines]"),
    take: host.querySelector("[data-ll-take]"),
    chef: host.querySelector("[data-ll-chef]"),
    hint: host.querySelector("[data-ll-hint]"),
    close: host.querySelector("[data-ll-close]"),
  };

  let timer = 0;
  let stepTimer = 0;
  let taskId = "";
  let lastSig = "";
  const tagEl = host.querySelector(".ll-tag");

  function hide() {
    host.classList.remove("is-on");
    if (timer) { clearInterval(timer); timer = 0; }
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = 0; }
  }

  function paint(snap, card) {
    const name = snap.contactName || card.contactName || snap.phone || card.phone || "Kontakt";
    const phone = snap.phone || card.phone || "";
    const phase = snap.phase || (card.status === "scheduled" ? "scheduled" : "dialing");
    els.who.textContent = name;
    els.phase.textContent = PHASE[phase] || PHASE.dialing;
    els.phase.classList.toggle("is-talk", phase === "talking" || phase === "takeover" || phase === "joining");
    els.phase.classList.toggle("is-end", phase === "done" || phase === "ended");
    els.phone.textContent = displayPhone(phone);
    const auftrag = snap.instruction || card.instruction || "";
    els.auftrag.textContent = auftrag ? `Auftrag: ${auftrag}` : "";
    if (snap.chefPhone && els.chef && !els.chef.dataset.touched) {
      els.chef.value = displayPhone(snap.chefPhone);
    }
    const live = phase === "joining" || phase === "takeover";
    els.take.hidden = phase === "scheduled" || phase === "done" || phase === "ended" || phase === "takeover";
    els.take.disabled = live && phase === "joining";
    if (phase === "joining") els.take.textContent = "Ihr Telefon klingelt …";
    else if (phase !== "takeover") els.take.textContent = "Gespräch übernehmen";
    if (els.chef) els.chef.closest(".ll-chef").hidden = phase === "done" || phase === "ended" || phase === "takeover";
    if (els.hint) {
      els.hint.textContent = phase === "takeover"
        ? "Lisa hört zu, spricht aber nicht. Sie können das Gespräch führen."
        : "Lisa bleibt in der Leitung, wird aber stumm. Das Transkript läuft weiter.";
    }

    const rows = Array.isArray(snap.transcript) ? snap.transcript : [];
    const sig = `${phase}|${rows.length}|${rows.map((r) => r.message).join("|")}`;
    if (sig === lastSig) return;
    lastSig = sig;
    if (!rows.length) {
      const empty = phase === "takeover" ? "Sie sind in der Leitung."
        : phase === "joining" ? "Ihr Telefon klingelt — gleich sind Sie drin."
        : phase === "talking" ? "Lisa ist in der Leitung."
        : "Noch kein Wort — Lisa wählt.";
      els.lines.innerHTML = `<div class="ll-empty">${empty}</div>`;
      return;
    }
    els.lines.innerHTML = rows.map((r) => {
      const agent = r.role === "agent" || r.role === "assistant";
      const chef = r.role === "chef";
      const who = agent ? "Lisa" : chef ? "Sie" : name;
      return `<div class="ll-line ${agent ? "agent" : chef ? "chef" : "user"}"><span class="w">${who}</span>${escapeHtml(r.message || "")}</div>`;
    }).join("");
    els.lines.scrollTop = els.lines.scrollHeight;
    if (phase === "done" || phase === "ended") {
      els.take.hidden = true;
      if (timer) { clearInterval(timer); timer = 0; }
    }
  }

  async function poll(card) {
    const auth = typeof getAuth === "function" ? getAuth() : null;
    if (!auth?.clientId || !auth?.deviceId || !auth?.deviceKey || !taskId) return;
    try {
      const resp = await fetch("/clara/devices/lisa-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, taskId }),
      });
      const j = await resp.json().catch(() => null);
      if (j?.ok) paint(j, card);
    } catch { /* nächster Tick */ }
  }

  els.close.addEventListener("click", (e) => { e.stopPropagation(); hide(); });
  if (els.chef) {
    try {
      const saved = localStorage.getItem(CHEF_PHONE_KEY) || "";
      if (saved) els.chef.value = displayPhone(saved);
    } catch { /* private mode */ }
    els.chef.addEventListener("input", () => { els.chef.dataset.touched = "1"; });
  }
  els.take.addEventListener("click", async (e) => {
    e.stopPropagation();
    const auth = typeof getAuth === "function" ? getAuth() : null;
    if (!auth?.clientId || !taskId) return;
    const chefPhone = String(els.chef?.value || "").trim();
    els.take.disabled = true;
    els.take.textContent = "Verbinde …";
    try {
      const resp = await fetch("/clara/devices/lisa-takeover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, taskId, chefPhone }),
      });
      const j = await resp.json().catch(() => null);
      if (j?.ok) {
        if (chefPhone) {
          try { localStorage.setItem(CHEF_PHONE_KEY, chefPhone); } catch { /* ignore */ }
        }
        els.phase.textContent = j.joined ? PHASE.takeover : PHASE.joining;
        els.phase.classList.add("is-talk");
        els.phase.classList.remove("is-end");
        els.take.textContent = j.joined ? "Gespräch übernehmen" : "Ihr Telefon klingelt …";
        els.take.hidden = !!j.joined;
        els.take.disabled = !j.joined;
        if (els.chef) els.chef.closest(".ll-chef").hidden = !!j.joined;
        if (!timer) timer = setInterval(() => poll({}), 2500);
      } else {
        els.take.disabled = false;
        els.take.textContent = "Gespräch übernehmen";
        if (j?.reason === "need_phone") {
          els.phase.textContent = "Bitte Ihre Nummer eintragen — wir rufen Sie an.";
          els.chef?.focus();
        } else {
          els.phase.textContent = "Übernahme gerade nicht möglich. Noch einmal versuchen.";
        }
      }
    } catch {
      els.take.disabled = false;
      els.take.textContent = "Gespräch übernehmen";
    }
  });

  function startSms(card) {
    if (timer) { clearInterval(timer); timer = 0; }
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = 0; }
    taskId = String(card?.taskId || "");
    const name = card.contactName || "den Patienten";
    const phone = displayPhone(card.phone);
    const text = String(card.body || card.instruction || "").trim();
    const ok = card.status !== "failed" && card.status !== "no_phone";
    if (tagEl) tagEl.textContent = "Lisa · SMS";
    els.who.textContent = name === "den Patienten" ? "SMS" : name;
    els.phase.textContent = ok ? "Lisa schreibt eine SMS." : "Lisa kommt nicht durch.";
    els.phase.classList.toggle("is-end", !ok);
    els.phase.classList.remove("is-talk");
    els.phone.textContent = phone;
    els.auftrag.textContent = "";
    els.take.hidden = true;
    if (els.chef) els.chef.closest(".ll-chef").hidden = true;
    if (els.hint) els.hint.hidden = true;
    els.lines.innerHTML = "";
    host.classList.add("is-on");

    const steps = [
      { label: "Sucht", text: `Sucht ${name} im Stamm.` },
      { label: phone ? "Nummer" : "Stopp", text: phone ? `Nimmt die Nummer ${phone}.` : "Keine Nummer hinterlegt.", fail: !phone },
      { label: text ? "Text" : "Stopp", text: text ? "Formuliert den SMS-Text." : "Kein Text.", fail: !text, body: text },
      { label: ok ? "Versendet" : "Stopp", text: ok ? "Versendet die SMS." : "Die SMS ist nicht rausgegangen.", fail: !ok },
    ];
    let i = 0;
    const next = () => {
      if (i >= steps.length) {
        if (ok) {
          els.phase.textContent = "Die SMS ist raus.";
          els.phase.classList.add("is-end");
        }
        return;
      }
      const s = steps[i];
      const div = document.createElement("div");
      div.className = `ll-line is-in ${s.fail ? "user" : "agent"}`;
      div.innerHTML = `<span class="w">${escapeHtml(s.label)}</span>${escapeHtml(s.text)}${s.body ? `<div class="ll-sms">${escapeHtml(s.body)}</div>` : ""}`;
      els.lines.appendChild(div);
      els.lines.scrollTop = els.lines.scrollHeight;
      i += 1;
      stepTimer = setTimeout(next, 420);
    };
    next();
  }

  return {
    start(card) {
      if (card?.kind === "lisa_sms") {
        startSms(card);
        return;
      }
      taskId = String(card?.taskId || "");
      if (!taskId) return;
      lastSig = "";
      if (tagEl) tagEl.textContent = "Lisa live";
      els.take.hidden = card?.status === "scheduled";
      els.take.disabled = false;
      els.take.textContent = "Gespräch übernehmen";
      if (els.chef) els.chef.closest(".ll-chef").hidden = card?.status === "scheduled";
      if (els.hint) els.hint.hidden = false;
      host.classList.add("is-on");
      paint({
        phase: card.status === "scheduled" ? "scheduled" : "dialing",
        phone: card.phone,
        contactName: card.contactName,
        instruction: card.instruction,
        transcript: [],
      }, card);
      if (timer) clearInterval(timer);
      if (card?.status !== "scheduled") {
        poll(card);
        timer = setInterval(() => poll(card), 2500);
      }
    },
    stop: hide,
    isOn: () => host.classList.contains("is-on"),
  };
}
