#!/bin/bash
# StealthVPN node health check
# Returns JSON with WG status, Xray status, TC rules, system metrics.
# Run locally on the VPN node or remotely via SSH.

set -e

OUTPUT_MODE="${1:-json}"

WG_OK=0
XRAY_OK=0
TC_OK=0

# ── WireGuard check ──────────────────────────────────────────────────────────
if wg show wg0 &>/dev/null; then
  WG_OK=1
  PEER_COUNT=$(wg show wg0 | grep -c "peer:" || echo 0)
  WG_LISTEN=$(ss -tulnp | grep -c ':51820' || echo 0)
else
  PEER_COUNT=0
  WG_LISTEN=0
fi

# ── Xray check ───────────────────────────────────────────────────────────────
XRAY_STATUS=$(systemctl is-active xray 2>/dev/null || echo "inactive")
if [[ "$XRAY_STATUS" == "active" ]]; then
  XRAY_OK=1
fi
XRAY_LISTEN=$(ss -tulnp | grep -c ':443' || echo 0)

# ── Traffic shaping check ────────────────────────────────────────────────────
if tc qdisc show dev wg0 2>/dev/null | grep -q 'htb'; then
  TC_OK=1
fi

# ── System metrics ───────────────────────────────────────────────────────────
CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print 100 - $8}')
MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
MEM_USED=$(free -m | awk 'NR==2{print $3}')
DISK_USED=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
LOAD_1M=$(uptime | awk -F'load average:' '{print $2}' | awk -F',' '{print $1}' | tr -d ' ')
UPTIME=$(uptime -p | sed 's/up //')

# ── WireGuard transfer stats ─────────────────────────────────────────────────
if [[ $WG_OK -eq 1 ]]; then
  TOTAL_RX=0
  TOTAL_TX=0
  while IFS=$'\t' read -r _ rx tx; do
    TOTAL_RX=$((TOTAL_RX + rx))
    TOTAL_TX=$((TOTAL_TX + tx))
  done < <(wg show wg0 transfer 2>/dev/null)
  TOTAL_RX_MB=$((TOTAL_RX / 1048576))
  TOTAL_TX_MB=$((TOTAL_TX / 1048576))
else
  TOTAL_RX_MB=0
  TOTAL_TX_MB=0
fi

# ── Output ────────────────────────────────────────────────────────────────────
if [[ "$OUTPUT_MODE" == "json" ]]; then
  cat << JSONOUT
{
  "node_healthy": $([[ $WG_OK -eq 1 && $XRAY_OK -eq 1 ]] && echo true || echo false),
  "wireguard": {
    "running": $([[ $WG_OK -eq 1 ]] && echo true || echo false),
    "listening": $([[ ${WG_LISTEN:-0} -gt 0 ]] && echo true || echo false),
    "peers": ${PEER_COUNT:-0},
    "rx_mb": ${TOTAL_RX_MB},
    "tx_mb": ${TOTAL_TX_MB}
  },
  "xray": {
    "running": $([[ $XRAY_OK -eq 1 ]] && echo true || echo false),
    "status": "${XRAY_STATUS}",
    "listening": $([[ ${XRAY_LISTEN:-0} -gt 0 ]] && echo true || echo false)
  },
  "traffic_shaping": {
    "active": $([[ $TC_OK -eq 1 ]] && echo true || echo false)
  },
  "system": {
    "cpu_percent": ${CPU},
    "mem_total_mb": ${MEM_TOTAL},
    "mem_used_mb": ${MEM_USED},
    "disk_used_pct": ${DISK_USED:-0},
    "load_1m": ${LOAD_1M},
    "uptime": "${UPTIME}"
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSONOUT
else
  echo "=== StealthVPN Node Health ==="
  echo "WireGuard:   $( [[ $WG_OK -eq 1 ]] && echo 'RUNNING' || echo 'DOWN' ) | Peers: ${PEER_COUNT:-0} | RX: ${TOTAL_RX_MB}MB TX: ${TOTAL_TX_MB}MB"
  echo "Xray:        $( [[ $XRAY_OK -eq 1 ]] && echo 'RUNNING' || echo 'DOWN' ) | Status: ${XRAY_STATUS}"
  echo "Traffic Shp: $( [[ $TC_OK -eq 1 ]] && echo 'ACTIVE' || echo 'MISSING' )"
  echo "CPU:         ${CPU}% | MEM: ${MEM_USED}/${MEM_TOTAL}MB | Disk: ${DISK_USED:-0}% | Load: ${LOAD_1M}"
  echo "Uptime:      ${UPTIME}"
  echo "Timestamp:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi