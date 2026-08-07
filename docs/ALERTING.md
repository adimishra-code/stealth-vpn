# Alerting

The backend ships a small self-hosted alert layer (`backend/src/services/alert.service.js`)
that surfaces failures without depending on a paid monitoring SaaS. Every event is
logged via winston; configured channels are then notified out-of-band.

## When alerts fire

| Source | Trigger |
|--------|---------|
| `http` | Any 5xx response (the Express error handler) |
| `cron.<name>` | Any cron pass throws (expiry, bandwidth sync, snapshots, health) |
| `process` | Unhandled rejection, uncaught exception (then exit 1) |
| startup | Logged on boot (logger); channels only fire on events above |

## Channels

- **Email** — sent via the existing SMTP transporter to `ALERT_EMAIL_TO`.
- **Webhook** — `POST` with `{ content, text, title }` JSON; Discord reads
  `content`, Slack reads `text`, so either service works with zero adaptation.
- **Sentry** — optional. Set `SENTRY_DSN` and `npm i @sentry/node` in `backend/`.
  If the package is missing, alerting silently degrades to email/webhook.

## Environment variables

| Variable | Required | Default | Meaning |
|----------|----------|---------|---------|
| `ALERT_EMAIL_TO` | no | – | Email address alerts are delivered to |
| `ALERT_WEBHOOK_URL` | no | – | Slack/Discord webhook URL |
| `ALERT_COOLDOWN_MINUTES` | no | 60 | Min between alerts with the same signature |
| `SENTRY_DSN` | no | – | Sentry DSN (optional, needs `@sentry/node`) |

`ALERT_EMAIL_TO` and `ALERT_WEBHOOK_URL` are validated only when non-empty —
an unset value just disables that channel.

## Throttling

The same error signature (first 200 chars of message + stack) is delivered at
most once per `ALERT_COOLDOWN_MINUTES` window. A flapping failure therefore
produces one alert, not an alert storm. The window table is in-memory, so a
restart can deliver one duplicate alert at worst.

## Failure behavior

Alert dispatch never throws into the caller: every channel failure is logged
and swallowed, so an alerting outage cannot take down the API.
