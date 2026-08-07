#!/bin/bash
# Config snapshot + drift detection for VPN nodes.
#
# What it does per node:
#   * copies the identity/config files into
#     /opt/stealthvpn/snapshots/<node>/<date>/
#   * writes a SHA-256 manifest, then diffs it against the previous day's
#     manifest (a change without a deploy = investigate, possibly an intruder).
#
# Usage:
#   ./deploy/scripts/config-snapshot.sh [node-ip ...]
#   (no args: reads NODE_MUMBAI_IP / NODE_FRANKFURT_IP from backend/.env)
#
# Reading /etc/wireguard (mode 600) and /etc/xray requires root — this is a
# human-run ops script, so it defaults to SSH_USER=root (same caveat as
# killswitch.sh).

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
    ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" "cat ${f} 2>/dev/null || true" > "${DEST}/${name}"
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
done

echo "Snapshots: ${SNAP_ROOT}"
