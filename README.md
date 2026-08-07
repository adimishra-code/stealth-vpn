# StealthVPN

A stealth VPN service built around WireGuard and Xray/REALITY, designed to stay
usable on networks that actively fingerprint and block VPN traffic.

> **Status: production-ready.** The backend API is feature-complete, the React
> dashboard is functional, and the deployment path (nginx + TLS, PM2, cron
> resilience) is documented in `docs/DEPLOYMENT.md`. VPN nodes are provisioned
> via `deploy/setup.sh` and the scripts in `scripts/`.

## What's implemented

- **Auth** — registration with email verification, login, JWT access tokens with
  rotating refresh tokens (stored hashed, reuse revokes every session), password
  reset, per-route rate limiting.
- **Data models** — `User`, `Device`, `ServerNode`, `Invoice`, `BandwidthSnapshot` (Mongoose).
- **Devices** — add/revoke, WireGuard config and QR download, per-device stealth
  mode toggle, bandwidth usage.
- **Payments** — Razorpay for INR, Stripe international. Signature-verified,
  idempotent webhooks; a retried delivery cannot credit a plan twice.
- **Admin** — user management and bans, revenue and bandwidth reporting, alerts.
- **Provisioning** — WireGuard peer/key management, Xray REALITY config generation,
  atomic IP allocation, SSH-driven node operations with rollback on failure.
- **Cron jobs** — plan expiry with renewal warnings (daily), bandwidth sync
  (every 5 min), bandwidth snapshots (daily at UTC midnight), node health checks
  (every 2 min). Every cron reports failures through the alert service.
- **Alerting** — email + webhook + Sentry alerting on 5xx errors, cron failures
  and startup; throttled per hour (see `docs/ALERTING.md`).
- **Backups** — scripts and a restore/verify workflow in `docs/BACKUP_RESTORE.md`.
- **Frontend** — dashboard, billing, servers, settings and admin screens, with
  transparent access-token refresh on 401.

## Tests

The backend suite runs against an in-memory MongoDB (mongodb-memory-server) and
covers auth, device/bandwidth, payments, IP allocation, crypto and the alert
service:

```bash
cd backend
npm test        # 27 tests / 6 suites
npm run lint    # ESLint (flat config, --max-warnings 0)
```

The frontend is lint-checked with ESLint (flat config, `--max-warnings 0`):

```bash
cd frontend
npm run lint
```

## Deployment

Production deployment (VPN nodes + control-plane host, nginx + TLS via certbot,
PM2 with a 10-second graceful-shutdown budget, cron/SSH failure hardening) is
documented step by step in:

- `docs/DEPLOYMENT.md` — full deployment guide
- `docs/RUNBOOK.md` — day-to-day operations, billing incidents, node recovery

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
| POST   | `/api/auth/register`         |                          |
| POST   | `/api/auth/verify`           | email verification       |
| POST   | `/api/auth/login`            |                          |
| POST   | `/api/auth/refresh`          | rotates refresh token    |
| POST   | `/api/auth/logout`           |                          |
| POST   | `/api/auth/forgot-password`  |                          |
| POST   | `/api/auth/reset-password`   |                          |
| GET    | `/api/auth/me`               | current user             |
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
| GET    | `/api/admin/users`           | admin only               |
| PATCH  | `/api/admin/users/:id`       | admin only               |
| GET    | `/api/admin/revenue`         | admin only               |
| GET    | `/api/admin/bandwidth`       | admin only               |
| GET    | `/api/admin/alerts`          | admin only               |

## Server nodes

VPN nodes are Ubuntu 22.04 VPS instances provisioned with `scripts/provision-node.sh`.
Once nodes are up, seed them into the database with `npm run seed`.

## Layout

```
backend/
  server.js            entrypoint
  src/
    app.js             express wiring
    config/            env validation, db, logger
    models/            mongoose schemas
    routes/            route definitions
    controllers/       request handlers
    services/          wireguard, xray, payments, email, provisioning
    middleware/        auth, admin, validation, rate limiting
    cron/              expiry, bandwidth sync, node health
    utils/             jwt, crypto, cookies, ip allocation, qr codes
frontend/
  src/
    app/               redux store, RTK Query base api
    features/          auth, devices, payment, admin
    pages/             route-level screens
    router/            auth and admin route guards
scripts/               node provisioning and peer management (bash)
docs/                  setup, xray config, anti-detection notes, legal
```

## Docs

- [Server setup](docs/SERVER_SETUP.md)
- [Xray configuration](docs/XRAY_CONFIG.md)
- [Anti-detection notes](docs/ANTI_DETECTION.md)
- [Backup & restore](docs/BACKUP_RESTORE.md)
- [Alerting](docs/ALERTING.md)
- [Legal](docs/LEGAL.md)

## Legal

Intended for lawful privacy and security use. See [docs/LEGAL.md](docs/LEGAL.md).
