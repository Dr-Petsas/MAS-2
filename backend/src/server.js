import "dotenv/config";
import express from "express";
import { createTask, listOpenTasks } from "./tools/createTask.js";
import { assertAppEnabled } from "./entitlements.js";

const app = express();
app.use(express.json());

const DEFAULT_CLIENT_ID = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

// Tenant context: prefer the X-Client-Id header, then a body clientId, then the
// configured default test client. Every tool runs inside exactly one tenant.
function resolveClientId(req) {
  return (req.header("X-Client-Id") || req.body?.clientId || DEFAULT_CLIENT_ID).trim();
}

app.get("/health", (req, res) => {
  res.json({ ok: true, defaultClientId: DEFAULT_CLIENT_ID });
});

app.post("/tools/create-task", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const task = await createTask(clientId, req.body || {});
    res.status(201).json({ ok: true, clientId, task });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/tools/open-tasks", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const tasks = await listOpenTasks(clientId);
    res.json({ ok: true, clientId, count: tasks.length, tasks });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[mas-2] tools backend listening on http://127.0.0.1:${PORT}`);
  console.log(`[mas-2] default test client: ${DEFAULT_CLIENT_ID}`);
});
