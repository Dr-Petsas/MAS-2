import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import admin from "../firebase.js";

// Letter PDF generation for Nadine — a clean DIN-5008 (Form A) layout, built
// from scratch: letterhead, return line above the address window, recipient
// block, info column (date), bold subject, body, and signature, plus fold/punch
// marks. Pure-ish: takes plain data + practice settings, returns a Buffer.
// Optionally archived to Cloud Storage when a bucket exists.

const MM = 2.83465; // mm -> pt

function lines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd());
}

function firstLine(value) {
  return lines(value).find((l) => l.trim()) || "";
}

/**
 * Render a letter to a PDF Buffer (DIN-5008 Form A).
 * @param {{
 *   settings?: object, practice?: {name?:string,address?:string,contact?:string},
 *   to?: string, subject?: string, body?: string, date?: number,
 *   signature?: {name?:string, role?:string},
 *   signatureImage?: Buffer, stampImage?: Buffer,
 *   layout?: object  // per-placeholder mm coordinates (overrides DIN defaults)
 * }} input
 * @returns {Promise<Buffer>}
 */
export function buildLetterPdf(input = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margins: { top: 20 * MM, left: 25 * MM, right: 20 * MM, bottom: 20 * MM } });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => {
        const content = Buffer.concat(chunks);
        // A PDF letterhead can't be drawn by pdfkit; overlay it afterwards.
        if (lh && lh.kind === "pdf" && lh.buffer) {
          overlayOnLetterhead(content, lh.buffer).then(resolve).catch(() => resolve(content));
        } else {
          resolve(content);
        }
      });
      doc.on("error", reject);

      // Merge settings with the legacy `practice` fallback.
      const st = input.settings || {};
      const practice = input.practice || {};
      const senderName = st.senderName || practice.name || "Praxis";
      const senderAddress = st.senderAddress || practice.address || "";
      const contactBlock = st.contactBlock || practice.contact || "";
      const returnLine = st.returnLine || [senderName, firstLine(senderAddress)].filter(Boolean).join(" · ");

      // Uploaded letterhead (branded stationery). When present we suppress the
      // typeset sender block + footer and push the body down by bodyTopMm.
      const lh = input.letterhead && input.letterhead.buffer ? input.letterhead : null;
      const useAsset = !!lh;
      const bodyTop = Math.max(0, Number(st.bodyTopMm) || 0);

      const leftX = 25 * MM;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const rightEdge = pageW - 20 * MM;
      const infoX = 125 * MM; // right info column

      // --- Placeholder layout (mm) -------------------------------------------
      // Where each element sits on the page. Defaults reproduce the classic
      // DIN-5008 positions; a saved letterLayout (designed in the settings UI)
      // overrides any slot. A `y` of 0 for body/signature/stamp means "auto"
      // (flow after the previous block), matching the historical behaviour.
      const defaultLayout = {
        date: { x: 125, y: 50 },
        recipient: { x: 25, y: 50, w: 85 },
        subject: { x: 25, y: 100 + bodyTop },
        body: { x: 25, y: 0, w: (rightEdge - leftX) / MM },
        signature: { x: 25, y: 0 },
        stamp: { x: 140, y: 0 },
      };
      const rawLayout = input.layout || st.letterLayout || null;
      const L = {};
      for (const slot of Object.keys(defaultLayout)) {
        L[slot] = { ...defaultLayout[slot], ...(rawLayout && rawLayout[slot] ? rawLayout[slot] : {}) };
      }

      // --- Image letterhead: full-page background drawn first ---
      if (useAsset && lh.kind === "image") {
        try { doc.image(lh.buffer, 0, 0, { width: pageW, height: pageH }); } catch { /* ignore bad image */ }
      }

      // --- Fold + punch marks (skip on asset letterheads that print their own) ---
      if (!useAsset) {
        doc.save().lineWidth(0.4).strokeColor("#999999");
        for (const mm of [87, 192]) doc.moveTo(3 * MM, mm * MM).lineTo(8 * MM, mm * MM).stroke(); // Faltmarken
        doc.moveTo(3 * MM, 148.5 * MM).lineTo(9 * MM, 148.5 * MM).stroke(); // Lochmarke
        doc.restore();
      }

      // --- Typeset letterhead (sender), top right — only without an asset ---
      if (!useAsset) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111");
        doc.text(senderName, infoX, 20 * MM, { width: rightEdge - infoX, align: "right" });
        doc.font("Helvetica").fontSize(9).fillColor("#555555");
        if (senderAddress) doc.text(senderAddress, infoX, doc.y + 1, { width: rightEdge - infoX, align: "right" });
        if (contactBlock) doc.text(contactBlock, infoX, doc.y + 1, { width: rightEdge - infoX, align: "right" });

        // Return line (Rücksendeangabe) above the address window.
        doc.font("Helvetica").fontSize(7).fillColor("#666666");
        doc.text(returnLine, leftX, 45 * MM, { width: 85 * MM });
        doc.moveTo(leftX, 48.5 * MM).lineTo(leftX + 85 * MM, 48.5 * MM).strokeColor("#cccccc").lineWidth(0.3).stroke();
      }

      // --- Recipient address window (placeholder: recipient) ---
      doc.font("Helvetica").fontSize(11).fillColor("#000000");
      doc.text(lines(input.to).join("\n") || "", L.recipient.x * MM, L.recipient.y * MM, { width: L.recipient.w * MM });

      // --- Date (placeholder: date), right-aligned from its x to the page edge ---
      const dateStr = new Date(input.date || Date.now()).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
      doc.font("Helvetica").fontSize(10).fillColor("#333333");
      doc.text(dateStr, L.date.x * MM, L.date.y * MM, { width: Math.max(20 * MM, rightEdge - L.date.x * MM), align: "right" });

      // --- Subject (bold) (placeholder: subject) ---
      let y = L.subject.y * MM;
      const subjectX = L.subject.x * MM;
      if (input.subject) {
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
        doc.text(input.subject, subjectX, y, { width: rightEdge - subjectX });
        y = doc.y + 5 * MM;
      }

      // --- Body (placeholder: body) — Anrede, Textbausteine & Grußformel flow
      // here as one column from the body anchor (y=0 → just below the subject). ---
      const bodyX = L.body.x * MM;
      const bodyY = L.body.y > 0 ? L.body.y * MM : y;
      doc.font("Helvetica").fontSize(11).fillColor("#000000");
      doc.text(input.body || "", bodyX, bodyY, { width: L.body.w * MM, align: "left", lineGap: 2.5 });

      // --- Signature + stamp zone: fixed, non-overlapping slots ---------------
      // The body (Anrede, Textbausteine, Grußformel) flows as one text column
      // above. The signature image, the typeset name/role and the stamp each get
      // their OWN reserved slot, so they can never overlap or overwrite one
      // another. The whole zone is kept clear of the footer; if a long letter
      // would otherwise collide, we continue the zone on a fresh page.
      const sig = input.signature || {};
      const sigName = sig.name || st.signatureName || "";
      const sigRole = sig.role || st.signatureRole || "";
      const sigImg = input.signatureImage || null;
      const stampImg = input.stampImage || null;
      const nameTyped = sigName && new RegExp(sigName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(input.body || "");
      const showName = sigName && !nameTyped;

      if (sigImg || stampImg || showName) {
        const footerTop = 282 * MM;
        const sigImgW = 55 * MM, sigImgH = 18 * MM;
        const stampW = 42 * MM, stampH = 28 * MM;
        const nameBlockH = showName ? (sigRole ? 11 * MM : 6 * MM) : 0;
        const leftColH = (sigImg ? sigImgH + 2 * MM : 0) + nameBlockH;
        const zoneH = Math.max(leftColH, stampImg ? stampH : 0);
        const gap = 8 * MM; // breathing room after the closing (handwriting space)

        // Auto position (when a slot has no explicit y): flow after the body but
        // clamp just above the footer so nothing runs off the page.
        const maxY = footerTop - 6 * MM - zoneH;
        const autoY = Math.min(doc.y + gap, Math.max(doc.page.margins.top, maxY));

        // Explicit anchors from the layout take precedence (designer placement).
        const sigAbs = L.signature.y > 0;
        const stampAbs = L.stamp.y > 0;
        const sigX = sigAbs ? L.signature.x * MM : leftX;
        const sigY = sigAbs ? L.signature.y * MM : autoY;
        const stampX = stampAbs ? L.stamp.x * MM : leftX + 100 * MM;
        const stampY = stampAbs ? L.stamp.y * MM : autoY;

        // Stamp — its own slot.
        if (stampImg) {
          try { doc.image(stampImg, stampX, stampY, { fit: [stampW, stampH] }); } catch { /* ignore bad image */ }
        }
        // Signature image — its own slot.
        let nameY = sigY;
        if (sigImg) {
          try { doc.image(sigImg, sigX, sigY, { fit: [sigImgW, sigImgH] }); nameY = sigY + sigImgH + 2 * MM; } catch { nameY = sigY; }
        }
        // Name + role — directly under the signature image, width-capped so a long
        // name wraps inside the left column instead of running into the stamp.
        if (showName) {
          doc.font("Helvetica").fontSize(11).fillColor("#000000").text(sigName, sigX, nameY, { width: sigImgW + 20 * MM });
          if (sigRole) doc.font("Helvetica").fontSize(9).fillColor("#555555").text(sigRole, sigX, doc.y, { width: sigImgW + 20 * MM });
        }
      }

      // --- Footer (three columns) — only without an asset (asset prints its own) ---
      if (!useAsset) {
        const footY = 282 * MM;
        const cols = [st.footerLeft, st.footerMid, st.footerRight];
        if (cols.some(Boolean)) {
          doc.font("Helvetica").fontSize(7.5).fillColor("#777777");
          const colW = (rightEdge - leftX) / 3;
          cols.forEach((c, i) => {
            if (c) doc.text(c, leftX + i * colW, footY, { width: colW - 4, align: i === 0 ? "left" : i === 1 ? "center" : "right" });
          });
        }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Overlay the typeset content (transparent pdfkit page) on top of an uploaded
 * letterhead PDF — once per content page so multi-page letters keep the header.
 */
async function overlayOnLetterhead(contentBuf, letterheadBuf) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const contentDoc = await PDFDocument.load(contentBuf);
  const lhDoc = await PDFDocument.load(letterheadBuf);
  const pageCount = contentDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const [lhEmbed] = await out.embedPdf(lhDoc, [0]);
    const [cEmbed] = await out.embedPdf(contentDoc, [i]);
    const page = out.addPage([cEmbed.width, cEmbed.height]);
    const w = page.getWidth();
    const h = page.getHeight();
    page.drawPage(lhEmbed, { x: 0, y: 0, width: w, height: h });
    page.drawPage(cEmbed, { x: 0, y: 0, width: w, height: h });
  }
  return Buffer.from(await out.save());
}

export function letterFilename(subject) {
  const slug = String(subject || "brief").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "brief";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${stamp}-${slug}.pdf`;
}

/** Archive a letter PDF to Cloud Storage and return a short-lived signed URL. */
export async function archiveLetter(clientId, caseId, filename, buffer) {
  let bucket;
  try {
    bucket = admin.storage().bucket();
    if (!bucket?.name) return { stored: false, url: null, path: null };
  } catch {
    return { stored: false, url: null, path: null };
  }
  const id = createHash("sha1").update(`${caseId}:${filename}`).digest("hex").slice(0, 16);
  const path = `mas-letters/${clientId}/${caseId || "adhoc"}/${id}-${filename}`;
  try {
    await bucket.file(path).save(buffer, { contentType: "application/pdf", resumable: false });
    const [url] = await bucket.file(path).getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 3600 * 1000 });
    return { stored: true, url, path };
  } catch {
    return { stored: false, url: null, path: null };
  }
}

/** Best-effort practice letterhead from the tenant's client doc. */
export async function practiceFromClient(clientId) {
  try {
    const snap = await admin.firestore().collection("clients").doc(clientId).get();
    const d = snap.exists ? snap.data() : {};
    const name = d.practiceName || d.name || d.companyName || "Praxis";
    const addr = [d.street || d.address, [d.zip || d.postalCode, d.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
    const contact = [d.phone, d.email].filter(Boolean).join(" · ");
    return { name, address: addr, contact };
  } catch {
    return { name: "Praxis", address: "", contact: "" };
  }
}
