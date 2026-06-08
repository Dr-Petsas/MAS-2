import { clientRef } from "./tenant.js";

// Mirrors the platform entitlement model (docgendaweb/src/models/appCatalog.ts):
//   source of truth = clients/{clientId}/settings/billing  (useEntitlements: true)
// SAFETY PRINCIPLE (identical to the platform): we only ever DISABLE an app when
// the billing document carries an explicit "off" signal. No document / no
// entitlements flag / unknown field => the app stays ENABLED, so no paying
// customer is ever accidentally locked out.

const CORE_APP_IDS = ["calendr", "signr", "clonr"];
const FRONTDESK_APP_IDS = ["callr", "campaignr"];
// MAS package apps (clara, nadine, julia, lens, marie, sophie) currently fall
// through to "enabled" — same as the platform resolver today. Fine-grained MAS
// gating via billing.masModules is a TODO to wire up on the platform side.

export async function getBilling(clientId) {
  const snap = await clientRef(clientId).collection("settings").doc("billing").get();
  return snap.exists ? snap.data() : null;
}

export function isAppEnabledFromBilling(billing, appId, opts = {}) {
  if (!billing || billing.useEntitlements !== true) return true;

  const override = billing.appOverrides ? billing.appOverrides[appId] : undefined;
  if (override === false) return false;
  if (override === true) return true;

  if (FRONTDESK_APP_IDS.includes(appId)) {
    const practiceFlag = billing.practiceApps ? billing.practiceApps[appId] : undefined;
    if (practiceFlag === false) return false;
    if (practiceFlag === true) return true;
    if (opts.locationId) {
      const enabled = billing.locationPackages?.[opts.locationId]?.frontdesk?.enabled;
      if (enabled === false) return false;
    }
    return true;
  }

  // Core apps and MAS apps: default enabled unless an explicit off above blocked it.
  return true;
}

export async function assertAppEnabled(clientId, appId, opts = {}) {
  const billing = await getBilling(clientId);
  return isAppEnabledFromBilling(billing, appId, opts);
}
