# StealthVPN

![CI](https://github.com/adimishra-code/stealth-vpn/workflows/CI/badge.svg)

A stealth VPN service built around WireGuard and Xray/REALITY, designed to stay
usable on networks that actively fingerprint and block VPN traffic.

> **Status: production-ready.** The backend API is feature-complete, the React
> dashboard is functional, and a full security audit (62 items — CSRF, CSP,
> session handling, crypto key scoping, rate limiting, deploy hardening,
> migration tooling) has been completed and verified. VPN nodes are
> provisioned via `deploy/setup.sh` and the scripts in `scripts/`.

## Quick reference

```bash
# Backend
cd backend
npm install
cp .env.example .env
npm run dev        # API on :5000
npm test           # 83 tests
npm run lint       # ESLint --max-warnings 0

# Frontend
cd frontend
npm install
cp .env.example .env
npm run dev        # Vite dev server on :5173
npm test           # 22 tests
npm run build      # production build
npm run lint       # ESLint --max-warnings 0

# Shell scripts (run from repo root)
shellcheck deploy/*.sh deploy/scripts/*.sh scripts/*.sh
```

## What's implemented

- **Auth** — registration with email verification, login, JWT access tokens with
  rotating refresh tokens (stored hashed, reuse revokes every session), password
  reset, TOTP two-factor for admin accounts, per-route rate limiting.
- **CSRF protection** — double-submit cookie pattern (`csrf-csrf`) with an
  httpOnly signed cookie; every state-changing request must echo the token from
  `GET /api/csrf-token`. The access token lives in memory only (never
  `sessionStorage`), so a compromised page script cannot exfiltrate either.
- **Data models** — `User`, `Device`, `ServerNode`, `Invoice`,
  `BandwidthSnapshot`, `AuditLog` (Mongoose). Device keys and Xray UUIDs are
  stored AES-256-GCM encrypted under HKDF purpose-scoped subkeys, with legacy
  key rotation support.
- **Devices** — add/revoke, WireGuard config and QR download (both `no-store`),
  per-device stealth mode toggle, bandwidth usage.
- **Payments** — Razorpay for INR, Stripe international. Signature-verified,
  idempotent webhooks; a retried delivery cannot credit a plan twice. Stripe
  redirect URLs are pinned to the app's own origin.
- **Admin** — user management and bans, revenue and bandwidth reporting, alerts,
  and a full audit log (90-day retention) of admin actions.
- **Privacy** — GDPR-style account deletion (instant revocation, hard delete
  after a grace period via the purge cron), expired verify/reset tokens swept
  daily, audit-log and snapshot retention.
- **Provisioning** — WireGuard peer/key management, Xray REALITY config
  generation, atomic IP allocation, SSH-driven node operations with rollback on
  failure (including tc throttle failures — a peer is never silently
  over-provisioned).
- **Cron jobs** — plan expiry with renewal warnings (daily), bandwidth sync
  (every 5 min), bandwidth snapshots (daily at UTC midnight), node health checks
  (every 2 min), account purge + token sweep (daily). Every cron reports
  failures through the alert service. Runs on a dedicated PM2 worker separate
  from the API.
- **Alerting** — email + webhook + Sentry alerting on 5xx errors, cron failures
  and startup; throttled per hour (see `docs/ALERTING.md`). Client-side render
  errors report to the API through an ErrorBoundary + store-level telemetry.
- **Backups** — scripts and a restore/verify workflow in `docs/BACKUP_RESTORE.md`
  (restores to non-localhost targets require an explicit `--yes`).
- **Frontend** — dashboard, billing, servers, settings and admin screens, with
  transparent access-token refresh on 401 and an error boundary with a reload
  recovery screen.

## Tests

The backend suite runs against an in-memory MongoDB (mongodb-memory-server) and
covers auth, TOTP, CSRF enforcement, devices/bandwidth, payments, IP allocation,
crypto (incl. HKDF migration paths), purge/retention, cron health, rate limiting
and the alert service:

```bash
cd backend
npm test        # 83 tests / 17 suites
npm run lint    # ESLint (flat config, --max-warnings 0)
```

The frontend suite runs with Vitest + Testing Library (store logic, route
guards, TOTP flow, billing plans and payment-gateway routing, admin modals):

```bash
cd frontend
npm test        # 22 tests / 4 files
npm run lint    # ESLint (flat config, --max-warnings 0)
```

CI (`.github/workflows/ci.yml`) runs both suites, lint, `npm audit` and
ShellCheck on every push/PR.

## Security

The completed audit is documented in `docs/SECURITY_PINS.md` (pinned dependency
versions, rotation schedule, upgrade rules). Highlights:

- CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, `nosniff`
  — no third-party fonts or scripts in the frontend.
- nginx dual-layer rate limiting (`auth_limit`, `api_limit`) plus
  express-rate-limit per route; query strings never logged; `?token=` SPA
  routes log nothing at all.
- Kernel hardening on both control plane and nodes (rp_filter, no ICMP
  redirects, SYN cookies, ASLR, no core dumps, no IPv6 leaks).
- Node firewall (UFW) restricted to the management CIDR; WireGuard netem
  throttling and MTU tuned for the tunnel.

## Deployment

Production deployment (VPN nodes + control-plane host, nginx + TLS via certbot,
PM2 with a 10-second graceful-shutdown budget, cron/SSH failure hardening) is
documented step by step in:

- `docs/DEPLOYMENT.md` — full deployment guide
- `docs/RUNBOOK.md` — day-to-day operations, billing incidents, node recovery
- `docs/INCIDENT_RESPONSE.md` — what to do when something breaks

PM2 runs two isolated workers (`deploy/ecosystem.config.cjs`): the API in
cluster mode (one worker per CPU, no cron jobs) and a single dedicated cron
worker — a crash in either restarts independently without dropping traffic or
duplicating emails.

## Not yet built

- Refunds and plan downgrades

## Stack

**Backend** — Node.js 20+ · Express · MongoDB (Mongoose) · Zod · Winston · node-cron
**Frontend** — React 19 · Vite · Redux Toolkit Query · Tailwind · Recharts
**VPN** — WireGuard · Xray-core (REALITY)

## Getting started

```bash
cd backend
npm install
cp .env.example .env   # then fill in every value — the app exits at startup if any are missing
npm run dev
```

The API listens on `PORT` (default `5000`). `GET /health` is a liveness check.

```bash
cd frontend
npm install
cp .env.example .env   # VITE_RAZORPAY_KEY_ID (Razorpay test key is fine for local dev)
npm run dev            # proxies /api to localhost:5000
```

### API routes

| Method | Route                        | Notes                    |
|--------|------------------------------|--------------------------|
| GET    | `/api/csrf-token`            | mints the CSRF cookie     |
| POST   | `/api/auth/register`         |                          |
| POST   | `/api/auth/verify`           | email verification       |
| POST   | `/api/auth/login`            |                          |
| POST   | `/api/auth/refresh`          | rotates refresh token    |
| POST   | `/api/auth/logout`           |                          |
| DELETE | `/api/auth/sessions`         | logout all sessions      |
| POST   | `/api/auth/forgot-password`  |                          |
| POST   | `/api/auth/reset-password`   |                          |
| GET    | `/api/auth/me`               | current user             |
| DELETE | `/api/auth/me`               | request account deletion |
| POST   | `/api/auth/totp/setup`       | admin 2FA enrollment     |
| POST   | `/api/auth/totp/verify`      | admin 2FA                |
| POST   | `/api/auth/totp/disable`     | admin 2FA                |
| GET    | `/api/devices`               | auth required            |
| POST   | `/api/devices`               | provisions a WG peer     |
| DELETE | `/api/devices/:id`           | revokes the peer         |
| GET    | `/api/devices/:id/config`    | WireGuard config file    |
| GET    | `/api/devices/:id/qr`        | config as a QR code      |
| PATCH  | `/api/devices/:id/mode`      | toggle stealth mode      |
| GET    | `/api/devices/:id/bandwidth` |                          |
| GET    | `/api/bandwidth/daily`       | 30/90-day snapshots      |
| GET    | `/api/servers`               | auth required            |
| GET    | `/api/servers/:name/health`  |                          |
| POST   | `/api/payment/create-order`  | Razorpay, auth required  |
| POST   | `/api/payment/verify`        | auth required            |
| POST   | `/api/payment/stripe/session`| auth required            |
| POST   | `/api/payment/stripe/confirm`| auth required            |
| GET    | `/api/payment/invoices`      | auth required            |
| POST   | `/api/payment/webhook`       | Razorpay/Stripe webhooks |
| POST   | `/api/client-errors`         | SPA telemetry, rate-limited |
| POST   | `/api/admin/users`           | admin only (list)        |
| PATCH  | `/api/admin/users/:id`       | admin only               |
| GET    | `/api/admin/revenue`         | admin only               |
| GET    | `/api/admin/bandwidth`       | admin only               |
| GET    | `/api/admin/alerts`          | admin only               |
| GET    | `/api/admin/audit-logs`      | admin only               |
| POST   | `/api/admin/devices`         | admin only (list)        |

## Server nodes

VPN nodes are Ubuntu 22.04 VPS instances provisioned with `scripts/provision-node.sh`.
Once nodes are up, seed them into the database with `npm run seed`.

## Layout

```
backend/
  server.js            API entrypoint (cluster workers)
  src/
    cron.js            dedicated cron-worker entrypoint (PM2)
    app.js             express wiring, CSRF, telemetry, error handling
    config/            env validation, db (TLS), logger
    models/            mongoose schemas
    routes/            route definitions
    controllers/       request handlers
    services/          wireguard, xray, payments, email, provisioning
    middleware/        auth, admin, validation (body + query), rate limiting
    cron/              expiry, bandwidth sync, node health, purge
    utils/             jwt, crypto (HKDF envelopes), cookies, ip allocation, qr
  scripts/             key generation + data migrations
frontend/
  src/
    app/               redux store, RTK Query base api
    components/        shared UI incl. ErrorBoundary
    features/          auth, devices, payment, admin
    pages/             route-level screens
    router/            auth and admin route guards
    test/              vitest setup + helpers
scripts/               node provisioning and peer management (bash)
deploy/                nginx, PM2 ecosystem, setup, node scripts
docs/                  setup, ops, security, anti-detection notes, legal
```

## Docs

- [Server setup](docs/SERVER_SETUP.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Runbook](docs/RUNBOOK.md)
- [Xray configuration](docs/XRAY_CONFIG.md)
- [Anti-detection notes](docs/ANTI_DETECTION.md)
- [Backup & restore](docs/BACKUP_RESTORE.md)
- [Backup keys & rotation](docs/BACKUP_KEY_SETUP.md)
- [Security pins & dependency policy](docs/SECURITY_PINS.md)
- [Alerting](docs/ALERTING.md)
- [Incident response](docs/INCIDENT_RESPONSE.md)
- [Legal](docs/LEGAL.md)

## Legal

Intended for lawful privacy and security use. See [docs/LEGAL.md](docs/LEGAL.md).
