# Security Pins & Dependency Policy

StealthVPN — pinned dependency versions and the rules for changing them.

## Why pins matter

The audit's threat model assumes the **control plane** (API + MongoDB +
nginx) and the **nodes** are hardened hosts. A compromised dependency chain
defeats every other control: supply-chain attacks (typosquatting, published
malicious versions, hijacked maintainer accounts) have shipped in the exact
dependencies this app uses. The rules below are the operational guardrails.

## Pinned versions (package-lock.json is the source of truth)

### Backend (`backend/package.json`)

| Dependency | Pinned (caret) | Security role |
|---|---|---|
| express | ^4.21.0 | HTTP framework — keep in 4.x, review 5.x upgrade in staging |
| helmet | ^7.1.0 | Security headers (HSTS, CSP, X-Frame-Options, nosniff) |
| express-rate-limit | ^7.4.0 | Auth/payment/device/admin rate limits |
| express-mongo-sanitize | ^2.2.0 | `$`/`.` operator stripping (NoSQL injection) |
| csrf-csrf | ^4.0.3 | Double-submit CSRF protection (CSRF-02) |
| mongoose | ^8.6.0 | DB driver — pin major version (8.x) intentionally |
| jsonwebtoken | ^9.0.2 | JWT sign/verify (HMAC + ES256) |
| zod | ^3.23.8 | Request validation (schemas.js) |
| bcryptjs | ^2.4.3 | Password hashing — never swap to plain or SHA |
| nodemailer | ^9.0.4 | SMTP (verify/reset/alert email) |
| stripe / razorpay | ^16.8.0 / ^2.9.4 | Payment gateways — pin updates in lockstep with API changes |
| winston | ^3.14.0 | Structured logging |
| node-ssh | ^13.2.0 | SSH to VPN nodes (provisioning, health) |

### Frontend (`frontend/package.json`)

| Dependency | Pinned (caret) | Security role |
|---|---|---|
| react / react-dom | ^19.0.0 | Keep React 19 pinned until release-notes review |
| react-redux / @reduxjs/toolkit | ^9.1.2 / ^2.2.7 | Auth state (in-memory only) |
| react-router | ^8.3.0 | Route guards (ProtectedRoute/AdminRoute) |
| qrcode.react | ^4.1.0 | QR rendering of WG configs — keep QR payloads server-side |
| vite (dev) | ^5.4.3 | Build tool — see the vite-8 note below |
| vitest + @testing-library (dev) | ^4.1.10 / ^16.3.2 | Test suite — non-shipping, still tracked |

## Rules

1. **Never `npm update` blindly.** Inspect `npm audit` output first, upgrade
   the flagged package alone, re-run the full test suite (backend jest +
   frontend vitest), and commit `package-lock.json`.
2. **Major-version bumps need a staging deploy.** Express 5, mongoose 9,
   react-router 9, vite 8 — each changes behavior. Test in staging with real
   Razorpay/Stripe sandbox keys and a live node before touching production.
3. **The vite/esbuild dev-server advisories are accepted** (see
   `.github/workflows/ci.yml`): the built artifact is static files served by
   nginx; the dev server never ships. `npm audit --omit=dev` must stay clean.
4. **`npm audit --audit-level=high` is part of CI** for both packages —
   a failing audit blocks merge.
5. **Node runtime:** 20.x LTS on the control plane (matches CI). Deploy
   script `deploy/setup.sh` installs the distro package — verify its version
   at provisioning time, or install NodeSource 20 LTS explicitly.

## Node-side binaries (provision-node.sh)

These are installed by the distro and pinned by version at the top of
`scripts/provision-node.sh`:
- wireguard-tools (wg / wg-quick)
- xray-core — install the pinned release (see `scripts/provision-node.sh`)
- unbound — distro package, forward-TLS config pinned in the same script
- nftables/iptables — distro package

Drift in ANY of these is detectable via `deploy/scripts/config-snapshot.sh`
(SHA-256 manifest diffed against the previous day).

## Rotation schedule

| Secret | Rotation | Audit item |
|---|---|---|
| JWT signing keys (HMAC + ES256) | Every 90 days, or on any access-token leak | JWT-01 |
| CSRF_SECRET | Every 90 days, or on cookie-scheme changes | CSRF-02 |
| WG_ENCRYPTION_KEY | Every 180 days — use WG_ENCRYPTION_KEY_PREVIOUS during rotation | CRYPTO-01 |
| MongoDB credentials | Every 90 days (setup.sh can regenerate users) | DB-02 |
| SSH keypair (control plane → nodes) | Every 180 days, or on node decommission | — |

Backup the key material per `docs/BACKUP_KEY_SETUP.md`; rotate per the
procedures there.
