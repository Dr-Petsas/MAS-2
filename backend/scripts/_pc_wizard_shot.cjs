// Sichtpruefung PC-Wizard (headless Chrome + CDP): Seite laden, durch die
// Wizard-Schritte klicken, Screenshots ablegen. Read-only Werkzeugskript.
const http = require("http");
const fs = require("fs");
const WebSocket = require("F:/pickadoc-live-base/docgendaweb/node_modules/ws");

const URL_PAGE = process.argv[2];
const OUT_DIR = "F:/MAS-2/backend/scripts";
const PORT = 9233;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path }, (res) => {
      let b = "";
      res.on("data", (c) => { b += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch { resolve(b); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  // Tab anlegen (neuere Chrome-Versionen verlangen PUT)
  let tab = await httpReq("PUT", "/json/new?" + encodeURIComponent(URL_PAGE));
  if (!tab || !tab.webSocketDebuggerUrl) {
    tab = await httpReq("GET", "/json/new?" + encodeURIComponent(URL_PAGE));
  }
  if (!tab || !tab.webSocketDebuggerUrl) throw new Error("kein Tab: " + JSON.stringify(tab).slice(0, 200));
  const ws = new WebSocket(tab.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  let idSeq = 0;
  const pend = new Map();
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++idSeq;
    pend.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const errors = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id);
      pend.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
      return;
    }
    if (m.method === "Log.entryAdded" && m.params?.entry?.level === "error") {
      errors.push(m.params.entry.text || "");
    }
    if (m.method === "Runtime.exceptionThrown") {
      errors.push(m.params?.exceptionDetails?.exception?.description || "exception");
    }
  });
  await new Promise((r) => ws.on("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });

  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r?.result?.value;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(OUT_DIR + "/" + name, Buffer.from(r.data, "base64"));
    console.log("shot:", name);
  };

  // Laden + erste Poll-Runde abwarten (Boot zeigt Schritt 3 bei ?appointmentId)
  await sleep(9000);
  console.log("step-now:", await evalJs("(function(){for(let i=1;i<=7;i++){if(document.getElementById('lwWiz'+i)?.classList.contains('is-show'))return i;}return 0;})()"));
  console.log("segs:", await evalJs("document.querySelectorAll('#lwDialog .bubble').length"));
  console.log("schema-cells:", await evalJs("document.querySelectorAll('#lwSchemaTpl .zs-cell').length"));
  await shot("_pc_wizard_step3_schema.png");

  const click = (step) => evalJs("document.querySelector('#lwSteps .step-chip[data-step=\"" + step + "\"]').click()");
  await click(4); await sleep(2500);
  console.log("doku-fields:", await evalJs("document.querySelectorAll('#lwDokuTpl .tpl-field').length"));
  await shot("_pc_wizard_step4_doku.png");
  await click(5); await sleep(2500);
  console.log("nd-gaps:", await evalJs("document.querySelectorAll('#lwNdGaps .nd-gap-q, #lwNdGaps .nd-gap-ok').length"));
  await shot("_pc_wizard_step5_nachdiktat.png");
  await click(6); await sleep(2500);
  console.log("sum-fields:", await evalJs("document.querySelectorAll('#lwSumBoxes .tpl-field').length"));
  await shot("_pc_wizard_step6_summary.png");
  await click(1); await sleep(1200);
  await shot("_pc_wizard_step1_arzt.png");
  await click(3); await sleep(2500);
  await shot("_pc_wizard_check.png");

  console.log("js-errors:", JSON.stringify(errors.slice(0, 12)));
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("FEHLER:", e.message); process.exit(1); });
