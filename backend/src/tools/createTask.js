import { randomUUID } from "node:crypto";
import { masCollection } from "../tenant.js";

// Clara's first tool: create a delegation task for a tenant. Writes ONLY to
// clients/{clientId}/mas_tasks (additive, never touches existing data).
export async function createTask(clientId, input = {}) {
  const { title, description, contactName, phoneNumber, dueAt, priority, source } = input;

  if (!title && !description && !contactName) {
    throw new Error("create-task needs at least one of: title, description, contactName");
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const task = {
    id,
    clientId,
    title: title || null,
    description: description || null,
    contactName: contactName || null,
    phoneNumber: phoneNumber || null,
    dueAt: dueAt || null,
    priority: priority || "normal",
    status: "open",
    source: source || "clara",
    createdAt: now,
    updatedAt: now,
  };

  await masCollection(clientId, "mas_tasks").doc(id).set(task);
  return task;
}

export async function listOpenTasks(clientId, limit = 20) {
  const snap = await masCollection(clientId, "mas_tasks")
    .where("status", "==", "open")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data());
}
