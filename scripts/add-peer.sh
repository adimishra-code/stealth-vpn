#!/bin/bash
set -e

if [[ "$EUID" -ne 0 ]]; then
  echo "This script must be run as root."
  exit 1
fi

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <PUBLIC_KEY> <ASSIGNED_IP> <PLAN> <TC_HANDLE>"
  echo "Example: $0 '4mZTj+...' '10.8.0.42' 'basic' '0x10a'"
  echo ""
  echo "Plans:"
  echo "  free   — no bandwidth (revoke immediately)"
  echo "  basic  — 10 Mbps throttle"
  echo "  pro    — unlimited"
  echo "  team   — unlimited"
  exit 1
fi

PUBLIC_KEY="$1"
ASSIGNED_IP="$2"
PLAN="$3"
TC_HANDLE="$4"

# ── Add WireGuard peer ───────────────────────────────────────────────────────
echo "[+] Adding WireGuard peer: ${PUBLIC_KEY}"
wg set wg0 peer "${PUBLIC_KEY}" allowed-ips "${ASSIGNED_IP}/32"
wg-quick save wg0

# ── Apply bandwidth throttle for Basic plan ──────────────────────────────────
if [[ "$PLAN" == "basic" ]]; then
  echo "[+] Applying 10 Mbps throttle (handle: 1:${TC_HANDLE})"

  tc class add dev wg0 parent 1:0 classid 1:"${TC_HANDLE}" htb rate 10mbit burst 15mbit 2>/dev/null || \
    tc class change dev wg0 parent 1:0 classid 1:"${TC_HANDLE}" htb rate 10mbit burst 15mbit

  tc filter add dev wg0 protocol ip parent 1:0 prio 1 u32 \
    match ip dst "${ASSIGNED_IP}/32" flowid 1:"${TC_HANDLE}" 2>/dev/null || true

  tc class add dev wg0 parent 1:0 classid 2:"${TC_HANDLE}" htb rate 10mbit burst 15mbit 2>/dev/null || \
    tc class change dev wg0 parent 1:0 classid 2:"${TC_HANDLE}" htb rate 10mbit burst 15mbit

  tc filter add dev wg0 protocol ip parent 1:0 prio 1 u32 \
    match ip src "${ASSIGNED_IP}/32" flowid 2:"${TC_HANDLE}" 2>/dev/null || true
fi

# ── Verify ────────────────────────────────────────────────────────────────────
echo ""
echo "Peer added successfully:"
wg show wg0 | grep -A 3 "peer: ${PUBLIC_KEY}" || echo "  (check wg show wg0 for details)"
echo ""
echo "Assigned IP: ${ASSIGNED_IP}"
echo "Plan: ${PLAN}"