import { masCollection } from "../tenant.js";

// Letterhead + signature settings per practice, stored at
// clients/{clientId}/mas_config/letterhead. Drives the look of every generated
// letter (sender block, return line above the address window, footer, default
// signature). Falls back to the tenant's client doc / sane defaults when unset.

const DOC = "letterhead";

function ref(clientId) {
  return masCollection(clientId, "mas_config").doc(DOC);
}

const s = (v) => (v == null ? "" : String(v).trim());

export function emptySettings() {
  return {
    senderName: "",
    senderAddress: "", // multi-line: street / zip city
    returnLine: "", // one-liner shown above the recipient window
    contactBlock: "", // right info column (phone, email, web)
    footerLeft: "",
    footerMid: "",
    footerRight: "",
    signatureName: "",
    signatureRole: "",
    // Plain-text signature appended to OUTGOING e-mails (Nadine replies & sends).
    // Separate from the letter signature (which is name/role + optional image).
    emailSignature: "",
    // Optional STYLED (HTML) e-mail signature built in the settings editor. When
    // set it is used for the HTML mail part (raw), while emailSignature stays the
    // plain-text fallback. Kept small (embedded logos should be modest in size).
    emailSignatureHtml: "",
    // Letterhead source: "text" (typeset from the fields above) or "asset"
    // (an uploaded letterhead PDF/image is used as the page background and the
    // text sender block is suppressed). bodyTopMm pushes the body down so it
    // clears a tall printed header.
    letterheadMode: "text",
    bodyTopMm: 0, // extra top offset for the body when an asset is used (mm)
    // Id of the active letterhead (clients/{clientId}/mas_letterheads). Empty =
    // newest / none. The active letterhead is overlaid on generated letters.
    activeLetterheadId: "",
    // Visual layout: where each placeholder sits on the A4 page, in millimetres
    // from the top-left corner. Designed in the settings UI; the PDF renderer
    // honours it. null = use the built-in DIN-5008 defaults.
    letterLayout: null,
  };
}

const NUMERIC = new Set(["bodyTopMm"]);
const OBJECT = new Set(["letterLayout"]);

// Allowed placeholder slots and which numeric props each one carries (mm).
const LAYOUT_SLOTS = {
  date: ["x", "y"],
  recipient: ["x", "y", "w"],
  subject: ["x", "y"],
  body: ["x", "y", "w"],
  signature: ["x", "y"],
  stamp: ["x", "y"],
};

// Keep coordinates inside a sane A4 envelope so a bad value can never push text
// off-page or break the renderer.
function clampLayout(input) {
  if (input == null) return null;
  if (typeof input !== "object") return null;
  const out = {};
  for (const [slot, props] of Object.entries(LAYOUT_SLOTS)) {
    const src = input[slot];
    if (!src || typeof src !== "object") continue;
    const dst = {};
    for (const p of props) {
      const v = Number(src[p]);
      if (!Number.isFinite(v)) continue;
      const max = p === "x" ? 210 : p === "w" ? 200 : 297;
      dst[p] = Math.max(0, Math.min(max, Math.round(v * 10) / 10));
    }
    if (Object.keys(dst).length) out[slot] = dst;
  }
  return Object.keys(out).length ? out : null;
}
// HTML fields keep markup (only outer whitespace trimmed) and are length-capped
// so the settings doc stays well under Firestore's 1 MB limit even with a logo.
const HTML = new Set(["emailSignatureHtml"]);
const HTML_MAX = 200000;

export async function getLetterSettings(clientId) {
  const snap = await ref(clientId).get();
  return { ...emptySettings(), ...(snap.exists ? snap.data() : {}) };
}

export async function setLetterSettings(clientId, input = {}) {
  const cur = await getLetterSettings(clientId);
  const next = { ...cur };
  for (const k of Object.keys(emptySettings())) {
    if (input[k] == null) continue;
    if (NUMERIC.has(k)) next[k] = Math.max(0, Math.min(120, Number(input[k]) || 0));
    else if (OBJECT.has(k)) next[k] = clampLayout(input[k]);
    else if (HTML.has(k)) next[k] = String(input[k]).trim().slice(0, HTML_MAX);
    else next[k] = s(input[k]);
  }
  await ref(clientId).set(next, { merge: true });
  return { ok: true, settings: next };
}
