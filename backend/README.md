# MAS-2 Backend — Tools & Tenant Layer (Step A)

Node.js + `firebase-admin`. Provides the deterministic, tenant-scoped tool
endpoints that Clara (voice service) calls. All data lives under
`clients/{clientId}/mas_*` in the existing Pickadoc Firestore.

## Run

```bash
cd backend
npm install
cp .env.example .env   # set GOOGLE_APPLICATION_CREDENTIALS to a service-account key
npm run dev
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/health` | liveness + default client |
| POST | `/tools/create-task` | create a delegation task in `clients/{clientId}/mas_tasks` |
| GET  | `/tools/open-tasks` | list open tasks for the tenant |

Tenant resolution: `X-Client-Id` header → body `clientId` → `DEFAULT_CLIENT_ID`.

Entitlements: every tool checks `clients/{clientId}/settings/billing` via the
same logic as the platform (`appCatalog.ts`); only an explicit "off" blocks an app.

### Example

```bash
curl -X POST http://127.0.0.1:4000/tools/create-task \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: MEe4ZQHEzOPzLcexyhdT" \
  -d '{"title":"Rückruf Herr Telides","contactName":"Herr Telides","phoneNumber":"+49177...","priority":"normal","source":"clara-mvp-test"}'
```

## Safety

- Writes ONLY to `mas_*` subcollections (enforced in `tenant.js`). Existing
  platform collections are never modified.
- No secrets are committed (`.env`, service-account keys are gitignored).
