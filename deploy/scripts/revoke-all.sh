#!/bin/bash
# Emergency — revoke EVERY WireGuard peer on every node (burn-the-tunnel
# switch: compromised control plane, mass exfiltration, lost keys).
#
# Usage:
#   ./deploy/scripts/revoke-all.sh [node-ip ...]
#   (no args: reads NODE_MUMBAI_IP / NODE_FRANKFURT_IP from backend/.env)
#
# Connects as NODE_SSH_USER (default stealthnode — sudoers whitelist covers
# wg show/set/save); SSH_USER=root only for root-required emergencies.
#
# Per node: dump `wg show wg0`, remove every peer, `wg-quick save wg0` so the
# wipe survives reboot. Xray users untouched (wg0 is the only transit).

set -euo pipefail

SSH_USER="${NODE_SSH_USER:-stealthnode}"
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
  echo "==> ${ip}: collecting peers"
  PEERS="$(ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" 'sudo -n wg show wg0 dump' | awk 'NR > 1 { print $1 }' || true)"
  COUNT="$(printf '%s\n' "${PEERS}" | grep -c '[^[:space:]]' || true)"

  if [[ -n "${PEERS}" ]]; then
    while IFS= read -r pk; do
      [[ -z "${pk}" ]] && continue
      ssh -n "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" "sudo -n wg set wg0 peer '${pk}' remove"
      echo "    revoked ${pk:0:8}..."
    done <<< "${PEERS}"
  fi

  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" 'sudo -n wg-quick save wg0'
  echo "==> ${ip}: done (${COUNT} peers revoked)"
done

echo "All nodes wiped. Existing configs are dead on arrival."
