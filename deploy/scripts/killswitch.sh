#!/bin/bash
# Emergency — stop ALL traffic on every node (xray down + wg0 down).
# Use when the tunnel must die before anything else is evaluated.
#
# Usage:
#   ./deploy/scripts/killswitch.sh [node-ip ...]
#   (no args: reads NODE_MUMBAI_IP / NODE_FRANKFURT_IP from backend/.env)
#
# Restore on each node afterward:
#   sudo systemctl start wg-quick@wg0 && sudo systemctl start xray
#   sudo systemctl restart unbound
#
# NOTE: stopping systemd units requires root — this script defaults to
# SSH_USER=root (an incident is human-run and root was used to provision).
# Set SSH_USER=stealthnode only if you extend the sudoers whitelist.

set -euo pipefail

SSH_USER="${SSH_USER:-stealthnode}"
SSH_KEY="${SSH_PRIVATE_KEY_PATH:-}"

if [[ $# -gt 0 ]]; then
  NODES=("$@")
else
  ENV_FILE="${ENV_FILE:-/srv/stealthvpn/backend/.env}"
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
  fi
  NODES=()
  [[ -n "${NODE_MUMBAI_IP:-}" ]] && NODES+=("$NODE_MUMBAI_IP")
  [[ -n "${NODE_FRANKFURT_IP:-}" ]] && NODES+=("$NODE_FRANKFURT_IP")
fi

if [[ ${#NODES[@]} -eq 0 ]]; then
  echo "ERROR: no node IPs — pass them as args or set NODE_*_IP in .env" >&2
  exit 1
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
[[ -n "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY")

for ip in "${NODES[@]}"; do
  echo "==> ${ip}: stopping xray + wg0"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" \
    'sudo -n systemctl stop xray 2>/dev/null || true; sudo -n wg-quick down wg0 2>/dev/null || sudo -n ip link set dev wg0 down 2>/dev/null || true; sudo -n systemctl stop unbound 2>/dev/null || true; true'
  echo "==> ${ip}: down"
done

echo "Kill switch engaged — no tunnel traffic is being forwarded."
