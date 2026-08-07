#!/bin/bash
# Check the service's public IPs against common IP-reputation databases.
# A VPN infrastructure that lands on blocklists loses users (and stealth).
# Run weekly from cron; investigate any LISTED hit immediately.
#
# Usage:
#   ./deploy/scripts/check-ip-reputation.sh [ip ...]
#   (no args: checks the control plane's own public IP + NODE_*_IP from .env)
#
# Requires: dig (dnsutils). Optional: curl (for the ipinfo abuse report —
# free tier, rate-limited; unset IPINFO=0 to skip it).

set -euo pipefail

IPINFO="${IPINFO:-1}"
DNSBLS=( zen.spamhaus.org bl.spamcop.net b.barracudacentral.org dnsbl.sorbs.net )

if ! command -v dig >/dev/null 2>&1; then
  echo "ERROR: dig not found — install dnsutils (apt install dnsutils)" >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  IPS=("$@")
else
  ENV_FILE="${ENV_FILE:-/srv/stealthvpn/backend/.env}"
  if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
  fi
  IPS=()
  SELF="$(curl -s --max-time 10 https://ifconfig.me 2>/dev/null || true)"
  [[ -n "$SELF" ]] && IPS+=("$SELF")
  [[ -n "${NODE_MUMBAI_IP:-}" ]] && IPS+=("$NODE_MUMBAI_IP")
  [[ -n "${NODE_FRANKFURT_IP:-}" ]] && IPS+=("$NODE_FRANKFURT_IP")
fi

if [[ ${#IPS[@]} -eq 0 ]]; then
  echo "ERROR: no IPs to check — pass them as args" >&2
  exit 1
fi

any_listed=0

for ip in "${IPS[@]}"; do
  rev="$(printf '%s' "$ip" | awk -F. '{print $4"."$3"."$2"."$1}')"
  echo "── ${ip}"
  listed=0
  for zone in "${DNSBLS[@]}"; do
    result="$(dig +short +time=5 +tries=1 "${rev}.${zone}" A 2>/dev/null || true)"
    if [[ -n "$result" ]]; then
      echo "    ${zone}: LISTED (${result})"
      listed=1
      any_listed=1
    else
      echo "    ${zone}: clean"
    fi
  done
  if [[ "$listed" -eq 0 ]] && [[ "$IPINFO" -eq 1 ]] && command -v curl >/dev/null 2>&1; then
    abuse="$(curl -s --max-time 10 "https://ipinfo.io/${ip}/json" 2>/dev/null || true)"
    if [[ -n "$abuse" ]] && printf '%s' "$abuse" | grep -q '"abuse"'; then
      echo "    ipinfo.io: see abuse contact below (not a listing itself)"
      printf '%s' "$abuse" | grep -E '"(hosting|org|country)"' | sed 's/^/      /'
    fi
  fi
done

echo ""
if [[ "$any_listed" -eq 1 ]]; then
  echo "RESULT: one or more IPs are LISTED — investigate now (see docs/RUNBOOK.md, IP reputation section)"
  exit 1
else
  echo "RESULT: all IPs clean on the checked DNSBLs"
fi
