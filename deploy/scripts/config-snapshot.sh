#!/bin/bash
# Config snapshot + drift detection for VPN nodes.
#
# Per node: copies identity/config files to /opt/stealthvpn/snapshots/<node>/<date>/,
# writes a SHA-256 manifest, diffs it against the previous day's (a change
# without a deploy = investigate, possibly an intruder).
#
# Usage:
#   ./deploy/scripts/config-snapshot.sh [node-ip ...]
#   (no args: reads NODE_MUMBAI_IP / NODE_FRANKFURT_IP from backend/.env)
#
# /etc/wireguard (mode 600) + /etc/xray need root — defaults to SSH_USER=root (same caveat as killswitch.sh).

set -euo pipefail

SSH_USER="${SSH_USER:-root}"
SSH_KEY="${SSH_PRIVATE_KEY_PATH:-}"
SNAP_ROOT="${SNAP_ROOT:-/opt/stealthvpn/snapshots}"

if [[ $# -gt 0 ]]; then
  NODES=("$@")
else
  ENV_FILE="${ENV_FILE:-/srv/stealthvpn/backend/.env}"
  if [[ -f "$ENV_FILE" ]]; then
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

FILES=(
  /etc/wireguard/wg0.conf
  /etc/wireguard/server_private.key
  /etc/wireguard/server_public.key
  /usr/local/etc/xray/config.json
  /etc/xray/reality_keys.txt
  /etc/ssh/sshd_config
  /etc/sudoers.d/stealthnode
  /etc/sysctl.d/99-stealth-vpn.conf
  /etc/unbound/unbound.conf.d/stealth-vpn.conf
  /usr/local/bin/stealth-tc.sh
)

for ip in "${NODES[@]}"; do
  TODAY="$(date +%F)"
  DEST="${SNAP_ROOT}/${ip}/${TODAY}"
  mkdir -p "${DEST}"
  echo "==> ${ip}: fetching ${#FILES[@]} config files"
  for f in "${FILES[@]}"; do
    name="$(basename "${f}").txt"
    # Missing must be visible: empty vs vanished used to be indistinguishable,
    # so deletions were silent — store explicit "MISSING" markers.
    if content="$(ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" "cat ${f} 2>/dev/null")"; then
      printf '%s\n' "${content}" > "${DEST}/${name}"
    else
      echo "!! ${ip}: ${f} is MISSING on the node" >&2
      echo "# MISSING on ${TODAY}" > "${DEST}/${name}"
    fi
  done

  # Manifest + drift check against the previous snapshot day.
  (
    cd "${DEST}"
    sha256sum * > SHA256SUMS 2>/dev/null
  )
  PREV="$(ls -1 "${SNAP_ROOT}/${ip}" | grep -v "${TODAY}" | sort | tail -1 || true)"
  if [[ -n "${PREV}" ]] && [[ -f "${SNAP_ROOT}/${ip}/${PREV}/SHA256SUMS" ]]; then
    if diff -q "${SNAP_ROOT}/${ip}/${PREV}/SHA256SUMS" "${DEST}/SHA256SUMS" >/dev/null 2>&1; then
      echo "==> ${ip}: no drift vs ${PREV}"
    else
      echo "==> ${ip}: DRIFT vs ${PREV}:"
      diff -u "${SNAP_ROOT}/${ip}/${PREV}/SHA256SUMS" "${DEST}/SHA256SUMS" | grep '^[+-]' | grep -v '^[+-][+-]' || true
    fi
  else
    echo "==> ${ip}: baseline snapshot (${TODAY})"
  fi

  # Retention: 30 days — a non-rotating snapshot fills the disk and slows drift searches.
  find "${SNAP_ROOT}/${ip}" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
done

echo "Snapshots: ${SNAP_ROOT}"
