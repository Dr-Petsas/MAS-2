import admin from "../firebase.js";
import { syncAccount, backfillInboundMailBrain } from "./mailbox.js";
import { tenantsWithOutbox, processBrainOutbox } from "../brain/outbox.js";
import { maybeReflectNightly } from "../brain/reflect.js";
import { watchCalendarOnce, tenantsWithCalendar } from "../clara/calendarWatch.js";

// Background poller that keeps inboxes fresh across ALL tenants AND drains the
// brain dead-letter outbox (retries failed event/case writes). ON BY DEFAULT
// (120s) — a stale inbox or a dropped brain write is a correctness problem, not
// a convenience one. Set MAIL_SYNC_INTERVAL_MS=0 to disable; <30s is rejected as
// a safety floor. Each tick finds every practice with a mail account (one
// collectionGroup query) and syncs the active, IMAP-configured ones. Ticks
// never overlap.

const DEFAULT_INTERVAL_MS = 120000;
const db = admin.firestore();
let timer = null;
let running = false;

/** One sweep: returns how many accounts were synced. */
export async function runOnce({ limit = 20 } = {}) {
  if (running) return { ok: false, reason: "already_running" };
  running = true;
  let synced = 0, tenants = 0;
  try {
    const snap = await db.collectionGroup("mas_mail_accounts").get();
    const byTenant = new Map();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.active === false || !data.imap?.host || !data.imapPasswordEnc) continue;
      const clientId = doc.ref.parent.parent?.id;
      if (!clientId) continue;
      if (!byTenant.has(clientId)) byTenant.set(clientId, []);
      byTenant.get(clientId).push(doc.id);
    }
    tenants = byTenant.size;
    for (const [clientId, ids] of byTenant) {
      for (const accountId of ids) {
        const r = await syncAccount(clientId, accountId, { limit }).catch(() => ({ ok: false }));
        if (r.ok) synced++;
      }
      // Self-healing brain link: catch relevant inbound mails the sync-time
      // recording missed (pre-pipeline mails, late LLM re-classification).
      // Idempotent via stable event ids, so every tick is safe.
      const bf = await backfillInboundMailBrain(clientId, { sinceDays: 14 }).catch(() => null);
      if (bf?.recorded) console.log(`[brain-backfill] ${clientId}: ${bf.recorded} E-Mail(s) nachträglich ins Gehirn übernommen.`);
    }
    // Clara's calendar watch: every appointment change + document traffic
    // light in the watch window becomes a brain observation on the patient's
    // timeline — no matter who made the change. Runs for EVERY tenant with a
    // calendar config, independent of whether a mail account exists.
    const calTenants = await tenantsWithCalendar().catch(() => []);
    for (const clientId of calTenants) {
      const cw = await watchCalendarOnce(clientId).catch(() => null);
      if (cw?.recorded) console.log(`[calendar-watch] ${clientId}: ${cw.recorded} Kalender-Beobachtung(en) ins Gehirn geschrieben.`);
      else if (cw?.baseline) console.log(`[calendar-watch] ${clientId}: Baseline mit ${cw.tracked} Terminen angelegt.`);
    }
    return { ok: true, tenants, accounts: synced };
  } finally {
    running = false;
  }
}

/**
 * Drain the brain dead-letter outbox for every tenant that has pending repair
 * jobs (failed event append / case threading). Runs every tick so a transient
 * Firestore error during a send/sync self-heals within minutes.
 */
export async function drainOutboxes({ maxTenants = 200 } = {}) {
  const ids = await tenantsWithOutbox({ limit: maxTenants }).catch(() => []);
  let repaired = 0, dead = 0;
  for (const clientId of ids) {
    const r = await processBrainOutbox(clientId).catch(() => ({ repaired: 0, dead: 0 }));
    repaired += r.repaired || 0;
    dead += r.dead || 0;
  }
  return { tenants: ids.length, repaired, dead };
}

/**
 * Nightly Living-Prompt reflection across all tenants (same tenant discovery
 * as the mail sweep). maybeReflectNightly is self-gating (after 03:00 Berlin,
 * max once per ~day, state in Firestore), so calling it every tick is cheap.
 */
export async function runNightlyReflections() {
  const snap = await db.collectionGroup("mas_mail_accounts").get();
  const tenants = new Set();
  for (const doc of snap.docs) {
    const clientId = doc.ref.parent.parent?.id;
    if (clientId) tenants.add(clientId);
  }
  let ran = 0;
  for (const clientId of tenants) {
    const r = await maybeReflectNightly(clientId).catch(() => ({ ran: false }));
    if (r.ran) ran++;
  }
  return { tenants: tenants.size, ran };
}

export function startMailScheduler() {
  const raw = process.env.MAIL_SYNC_INTERVAL_MS;
  const interval = raw == null || raw === "" ? DEFAULT_INTERVAL_MS : Number(raw);
  if (!interval || interval < 30000) return { enabled: false };
  if (timer) return { enabled: true, intervalMs: interval };
  timer = setInterval(() => {
    runOnce().then((r) => {
      if (r.ok) console.log(`[mail-sync] tick: ${r.accounts} Konten in ${r.tenants} Praxen synchronisiert.`);
    }).catch((e) => console.warn("[mail-sync] tick failed:", e?.message || e));
    drainOutboxes().then((r) => {
      if (r.repaired || r.dead) console.log(`[brain-outbox] tick: ${r.repaired} repariert, ${r.dead} Dead-Letter in ${r.tenants} Praxen.`);
    }).catch((e) => console.warn("[brain-outbox] tick failed:", e?.message || e));
    runNightlyReflections().then((r) => {
      if (r.ran) console.log(`[living-prompt] Reflexion gelaufen für ${r.ran}/${r.tenants} Praxen.`);
    }).catch((e) => console.warn("[living-prompt] reflection failed:", e?.message || e));
  }, interval);
  timer.unref?.();
  console.log(`[mail-sync] aktiviert, Intervall ${Math.round(interval / 1000)}s (inkl. Brain-Outbox-Retry).`);
  return { enabled: true, intervalMs: interval };
}

export function stopMailScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
