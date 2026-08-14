#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# StealthVPN — certbot setup for the control-plane host (TLS on 80/443).
# Run as root AFTER:
#   1. deploy/nginx.conf is installed and nginx is running (port 80 open),
#      with server_name replaced with your real domain.
#   2. DNS A record for that domain points at this host.
# Run deploy/setup.sh first if this host is also the VPN node.
# Re-runnable: renewal hooks are installed on first run only.
# ──────────────────────────────────────────────────────────────────────────────

if [[ "$EUID" -ne 0 ]]; then
  echo "This script must be run as root." >&2
  exit 1
fi

DOMAIN="${DOMAIN:?Usage: DOMAIN=vpn.example.com ./certbot-setup.sh}"
EMAIL="${EMAIL:?Usage: EMAIL=you@example.com ./certbot-setup.sh}"
WEBROOT="${WEBROOT:-/var/www/certbot}"

log() { echo -e "\033[1;32m[INFO]\033[0m $1"; }

# ── 1. webroot directory the nginx config serves for ACME challenges ────────
mkdir -p "$WEBROOT"

# ── 2. Certbot ───────────────────────────────────────────────────────────────
if ! command -v certbot >/dev/null 2>&1; then
  log "Installing certbot (snap)..."
  apt update -y
  DEBIAN_FRONTEND=noninteractive apt install -y snapd
  snap install core
  snap refresh core
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
fi

# ── 3. Issue cert (webroot; nginx already exposes the challenge path) ────────
if ! certbot certificates --cert-name "$DOMAIN" >/dev/null 2>&1 | grep -q "Certificate Name"; then
  log "Issuing certificate for $DOMAIN..."
  certbot certonly \
    --webroot -w "$WEBROOT" \
    -d "$DOMAIN" \
    -m "$EMAIL" \
    --agree-tos --no-eff-email \
    --keep-until-expiring
else
  log "Certificate already exists — skipping issuance, certbot will renew it."
fi

# ── 4. Deploy hooks (default certbot systemd timers run twice daily) ────────
mkdir -p "/etc/letsencrypt/renewal-hooks/deploy"
cat > "/etc/letsencrypt/renewal-hooks/deploy/stealth-vpn-nginx.sh" << 'HOOK'
#!/bin/bash
# Renewal hook: only reload nginx when the config is still valid — a broken
# nginx.conf must never be masked by an unconditional reload.
set -e
nginx -t
systemctl reload nginx
HOOK
chmod +x "/etc/letsencrypt/renewal-hooks/deploy/stealth-vpn-nginx.sh"

# ── 5. Verify ────────────────────────────────────────────────────────────────
# snap's certbot ships its own timer; a distro package would use certbot.timer — report whichever is active.
log "Verifying renewal timer..."
if systemctl is-active snap.certbot.renew.timer >/dev/null 2>&1; then
  systemctl list-timers 'snap.certbot.renew.timer' --no-pager | head -5
elif systemctl is-active certbot.timer >/dev/null 2>&1; then
  systemctl list-timers 'certbot.timer' --no-pager | head -5
else
  log "WARN: no certbot timer found — enable with: systemctl enable --now snap.certbot.renew.timer"
fi

log ""
log "═══════════════════════════════════════════════════════"
log "TLS setup complete for $DOMAIN."
log "  Certificates: /etc/letsencrypt/live/$DOMAIN/"
log "  Renewal:      certbot renew --dry-run"
log "Next: confirm nginx serves HTTPS, then smoke-test:"
log "  curl -I https://$DOMAIN/"
log "  curl -I https://$DOMAIN/api/health"
log "═══════════════════════════════════════════════════════"
