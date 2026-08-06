# StealthVPN

A stealth VPN service built around WireGuard and Xray/REALITY, designed to stay
usable on networks that actively fingerprint and block VPN traffic.

> **Status: work in progress.** The backend API is feature-complete; the frontend
> is not committed yet. VPN nodes are provisioned by hand via the scripts in
> `scripts/`.

## What's implemented

- **Auth** — registration with email verification, login, JWT access/refresh
  token rotation via httpOnly cookies, password reset, per-route rate limiting.
- **Data models** — `User`, `Device`, `ServerNode`, `Invoice` (Mongoose).
- **Devices** — add/revoke, WireGuard config and QR download, per-device stealth
  mode toggle, bandwidth usage.
- **Payments** — Razorpay for INR, Stripe for international, with signature-verified
  webhooks and invoice history.
- **Admin** — user management and bans, revenue and bandwidth reporting, alerts.
- **Provisioning** — WireGuard peer/key management, Xray REALITY config generation,
  IP allocation, and SSH-driven node operations.
- **Cron jobs** — plan expiry with renewal warnings (daily), bandwidth sync
  (every 5 min), node health checks (every 2 min).

## Not yet built

- Frontend dashboard
- Automated tests

## Stack

Node.js 20+ · Express · MongoDB (Mongoose) · Zod · Winston · node-cron · WireGuard · Xray-core (REALITY)

## Getting started

```bash
cd backend
npm install
cp .env.example .env   # then fill in every value — the app exits at startup if any are missing
npm run dev
```

The API listens on `PORT` (default `5000`). `GET /health` is a liveness check.

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
| GET    | `/api/devices`               | auth required            |
| POST   | `/api/devices`               | provisions a WG peer     |
| DELETE | `/api/devices/:id`           | revokes the peer         |
| GET    | `/api/devices/:id/config`    | WireGuard config file    |
| GET    | `/api/devices/:id/qr`        | config as a QR code      |
| PATCH  | `/api/devices/:id/mode`      | toggle stealth mode      |
| GET    | `/api/devices/:id/bandwidth` |                          |
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
scripts/               node provisioning and peer management (bash)
docs/                  setup, xray config, anti-detection notes, legal
```

## Docs

- [Server setup](docs/SERVER_SETUP.md)
- [Xray configuration](docs/XRAY_CONFIG.md)
- [Anti-detection notes](docs/ANTI_DETECTION.md)
- [Legal](docs/LEGAL.md)

## Legal

Intended for lawful privacy and security use. See [docs/LEGAL.md](docs/LEGAL.md).
