#!/bin/bash
set -e

if [[ "$EUID" -ne 0 ]]; then
  echo "This script must be run as root."
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <PUBLIC_KEY> <TC_HANDLE>"
  echo "Example: $0 '4mZTj+...' '0x10a'"
  echo ""
  echo "TC_HANDLE is optional (only needed for Basic plan cleanup)."
  echo "Pass 'none' if no TC handle was set."
  exit 1
fi

PUBLIC_KEY="$1"
TC_HANDLE="$2"

# ── Remove WireGuard peer ────────────────────────────────────────────────────
echo "[-] Removing WireGuard peer: ${PUBLIC_KEY}"
wg set wg0 peer "${PUBLIC_KEY}" remove
wg-quick save wg0

# ── Clean up TC handles ──────────────────────────────────────────────────────
if [[ "$TC_HANDLE" != "none" && -n "$TC_HANDLE" ]]; then
  echo "[-] Removing TC handles (1:${TC_HANDLE}, 2:${TC_HANDLE})"
  tc class del dev wg0 classid 1:"${TC_HANDLE}" 2>/dev/null || echo "  (ingress class already removed)"
  tc class del dev wg0 classid 2:"${TC_HANDLE}" 2>/dev/null || echo "  (egress class already removed)"
fi

echo ""
echo "Peer removed successfully."