#!/bin/bash
set -e

# ──────────────────────────────────────────────────────────────────────────────
# StealthVPN Node Provisioning Script
# Run once on a fresh Ubuntu 22.04 LTS VPS as root.
# Idempotent — safe to re-run.
# ──────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Root check ───────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  err "This script must be run as root (or with sudo)."
  exit 1
fi

# ── Detect primary network interface ─────────────────────────────────────────
IFACE=$(ip route get 8.8.8.8 | awk '{print $5; exit}')
log "Detected primary network interface: ${IFACE}"

# ──────────────────────────────────────────────────────────────────────────────
# Step 1: System update and base packages
# ──────────────────────────────────────────────────────────────────────────────
log "Updating system and installing base packages..."
apt update && apt upgrade -y

apt install -y \
  wireguard wireguard-tools \
  iptables-persistent netfilter-persistent \
  curl wget unzip net-tools iproute2 \
  fail2ban ufw iptables \
  nginx \
  openssl

# ──────────────────────────────────────────────────────────────────────────────
# Step 2: Fail2ban — block SSH brute force
# ──────────────────────────────────────────────────────────────────────────────
log "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# ──────────────────────────────────────────────────────────────────────────────
# Step 3: Harden SSH + create least-privilege operator user
# ──────────────────────────────────────────────────────────────────────────────
log "Hardening SSH..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%s)

# Backend connects as non-root 'stealthnode' — root login is disabled.
id -u stealthnode >/dev/null 2>&1 || useradd -r -m -s /bin/bash stealthnode

# Sudoers whitelist: only the commands the control plane needs — no shell.
cat > /etc/sudoers.d/stealthnode << SUDOERS
# StealthVPN node commands only — no shell, no arbitrary commands.
Cmnd_Alias VPNNODE = /usr/bin/wg set wg0 *, /usr/bin/wg show *, /usr/bin/wg-quick save wg0, /usr/sbin/tc class *, /usr/sbin/tc filter *, /usr/local/bin/xray api *
stealthnode ALL=(root) NOPASSWD: VPNNODE
Defaults!VPNNODE !requiretty
SUDOERS
chmod 440 /etc/sudoers.d/stealthnode

sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
sed -i 's/^#\?LoginGraceTime.*/LoginGraceTime 20/' /etc/ssh/sshd_config

# SSH key access for the operator user only — root can never log in.
grep -q '^AllowUsers ' /etc/ssh/sshd_config && \
  sed -i 's/^AllowUsers .*/AllowUsers stealthnode/' /etc/ssh/sshd_config || \
  echo "AllowUsers stealthnode" >> /etc/ssh/sshd_config
grep -q '^DenyUsers ' /etc/ssh/sshd_config && \
  sed -i 's/^DenyUsers .*/DenyUsers root/' /etc/ssh/sshd_config || \
  echo "DenyUsers root" >> /etc/ssh/sshd_config

systemctl restart sshd

# ──────────────────────────────────────────────────────────────────────────────
# Step 4: UFW firewall
# ──────────────────────────────────────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH only from MANAGEMENT_CIDR (CSP-05): 0.0.0.0/0 is a brute-force surface,
# and running from outside the CIDR locks the operator out — set your IP/32.
if [[ -n "${MANAGEMENT_CIDR:-}" ]]; then
  ufw allow from "${MANAGEMENT_CIDR}" to any port 22 proto tcp comment 'SSH (management CIDR)'
  log "SSH allowed only from ${MANAGEMENT_CIDR}"
else
  warn "MANAGEMENT_CIDR unset — allowing SSH from anywhere. Set it to your IP/32."
  ufw allow 22/tcp comment 'SSH'
fi
ufw allow 443/tcp comment 'Xray XTLS-Reality'
ufw allow 51820/udp comment 'WireGuard'
ufw --force enable

# ──────────────────────────────────────────────────────────────────────────────
# Step 5: Generate WireGuard server keypair
# ──────────────────────────────────────────────────────────────────────────────
log "Generating WireGuard server keypair..."
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
chmod 600 /etc/wireguard/server_private.key

SERVER_PRIVATE=$(cat /etc/wireguard/server_private.key)
SERVER_PUBLIC=$(cat /etc/wireguard/server_public.key)

log "WireGuard server public key: ${SERVER_PUBLIC}"

# ──────────────────────────────────────────────────────────────────────────────
# Step 6: WireGuard config (wg0.conf)
# ──────────────────────────────────────────────────────────────────────────────
log "Writing WireGuard configuration..."
cat > /etc/wireguard/wg0.conf << WGCONF
[Interface]
PrivateKey = ${SERVER_PRIVATE}
# /24, not /16: the control plane hands out IPs from 10.8.0.0/24 and the
# client configs must stay inside the pool (INFRA-19).
Address = 10.8.0.1/24
ListenPort = 51820

# DROP must come BEFORE the ACCEPTs: -i wg0 -j ACCEPT matches first, and an
# appended -i wg0 -o wg0 DROP would sit behind it and never fire (peer-to-peer
# traffic on the tunnel would slip through). Insert order = rule order.
PostUp   = iptables -A FORWARD -i wg0 -o wg0 -j DROP
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp   = iptables -A FORWARD -o wg0 -j ACCEPT
PostUp   = iptables -t nat -A POSTROUTING -o ${IFACE} -j MASQUERADE

PostDown = iptables -D FORWARD -i wg0 -o wg0 -j DROP
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -o wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o ${IFACE} -j MASQUERADE

SaveConfig = true
WGCONF

chmod 600 /etc/wireguard/wg0.conf

# ──────────────────────────────────────────────────────────────────────────────
# Step 7: Enable IP forwarding (IPv4 only, IPv6 disabled for WG)
# ──────────────────────────────────────────────────────────────────────────────
log "Enabling IP forwarding..."
cat > /etc/sysctl.d/99-stealth-vpn.conf << EOF
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=0
net.ipv6.conf.${IFACE}.disable_ipv6=0
net.ipv6.conf.wg0.disable_ipv6=1

# ── Kernel hardening (nodes are Internet-facing) ─────────────────────────────
# Reverse-path filtering: drop packets arriving on the wrong interface —
# the classic spoofing vector on any host with multiple interfaces.
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.default.rp_filter=1
# ICMP redirects + source routing are pure MITM helpers over a tunnel;
# no legitimate use on a VPN node.
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_source_route=0
net.ipv4.conf.default.accept_source_route=0
net.ipv6.conf.all.accept_redirects=0
net.ipv6.conf.all.accept_source_route=0
# SYN cookies: stay available under a SYN flood.
net.ipv4.tcp_syncookies=1
# Ignore broadcast pings (amplification).
net.ipv4.icmp_echo_ignore_broadcasts=1
# No core dumps: a crash of wg-quick/xray could otherwise write private
# key material (tunnel state is in process memory) to disk, recoverable
# by anyone with filesystem access.
kernel.core_pattern=|/bin/false
EOF
sysctl --system

# ──────────────────────────────────────────────────────────────────────────────
# Step 8: Start WireGuard
# ──────────────────────────────────────────────────────────────────────────────
log "Starting WireGuard..."
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# ──────────────────────────────────────────────────────────────────────────────
# Step 8b: Local DNS resolver — unbound on 10.8.0.1
# ──────────────────────────────────────────────────────────────────────────────
# Clients get DNS = 10.8.0.1, so a resolver must listen here — else they fall
# back to ISP DNS (a leak). DoT (TLS 853) upstream, tunnel+loopback only.
log "Installing unbound (local DNS resolver on 10.8.0.1:53)..."
apt install -y unbound

cat > /etc/unbound/unbound.conf.d/stealth-vpn.conf << 'UNBOUNDEOF'
server:
    interface: 10.8.0.1
    interface: 127.0.0.1
    port: 53
    do-ip6: no
    access-control: 10.8.0.0/24 allow
    access-control: 127.0.0.0/8 allow
    access-control: 0.0.0.0/0 refuse
    hide-identity: yes
    hide-version: yes
    qname-minimisation: yes
    qname-minimisation-strict: yes
    prefetch: yes
    cache-min-ttl: 60
    cache-max-ttl: 3600
    private-address: 10.0.0.0/8
    private-address: 172.16.0.0/12
    private-address: 192.168.0.0/16
    private-address: 169.254.0.0/16

forward-zone:
    name: "."
    forward-tls-upstream: yes
    forward-addr: 1.1.1.1@853
    forward-addr: 1.1.1.2@853
    forward-addr: 8.8.8.8@853
UNBOUNDEOF

systemctl enable unbound
systemctl restart unbound
log "unbound listening on 10.8.0.1:53 (DoT upstream)"

# ──────────────────────────────────────────────────────────────────────────────
# Step 9: Install Xray-core (pinned version)
# ──────────────────────────────────────────────────────────────────────────────
log "Installing Xray-core v1.8.11..."
bash -c "$(curl -sL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" \
  @ install --version v1.8.11

# ──────────────────────────────────────────────────────────────────────────────
# Step 10: Generate REALITY keypair and shortId
# ──────────────────────────────────────────────────────────────────────────────
log "Generating REALITY X25519 keypair..."
mkdir -p /etc/xray
xray x25519 > /etc/xray/reality_keys.txt
chmod 600 /etc/xray/reality_keys.txt

REALITY_PRIVATE=$(grep 'Private key' /etc/xray/reality_keys.txt | awk '{print $3}')
REALITY_PUBLIC=$(grep 'Public key' /etc/xray/reality_keys.txt | awk '{print $3}')

SHORT_ID=$(openssl rand -hex 8)
echo "ShortId: ${SHORT_ID}" >> /etc/xray/reality_keys.txt

log "REALITY public key: ${REALITY_PUBLIC}"
log "REALITY shortId:   ${SHORT_ID}"

# ──────────────────────────────────────────────────────────────────────────────
# Step 11: Write Xray config
# ──────────────────────────────────────────────────────────────────────────────
log "Writing Xray configuration..."
cat > /usr/local/etc/xray/config.json << XRAYEOF
{
  "log": { "loglevel": "warning" },
  "api": {
    "tag": "api",
    "services": ["HandlerService", "StatsService"]
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "tag": "vless-in",
      "settings": {
        "clients": [],
        "decryption": "none",
        "fallbacks": [
          { "dest": 80, "xver": 0 }
        ]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "microsoft.com:443",
          "xver": 0,
          "serverNames": ["microsoft.com", "www.microsoft.com"],
          "privateKey": "${REALITY_PRIVATE}",
          "shortIds": ["${SHORT_ID}"],
          "fingerprint": "chrome"
        },
        "tcpSettings": {
          "header": { "type": "none" }
        }
      },
      "sniffing": { "enabled": false }
    },
    {
      "listen": "127.0.0.1",
      "port": 10085,
      "protocol": "dokodemo-door",
      "tag": "api-in",
      "settings": { "address": "127.0.0.1" }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct",
      "settings": {}
    },
    {
      "protocol": "blackhole",
      "tag": "block",
      "settings": {}
    }
  ],
  "routing": {
    "rules": [
      {
        "type": "field",
        "inboundTag": ["api-in"],
        "outboundTag": "api",
        "tag": "api"
      },
      {
        "type": "field",
        "ip": ["geoip:private"],
        "outboundTag": "block"
      }
    ]
  },
  "stats": {},
  "policy": {
    "levels": {
      "0": {
        "statsUserUplink": true,
        "statsUserDownlink": true
      }
    },
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true
    }
  }
}
XRAYEOF

systemctl enable xray
systemctl start xray

# ──────────────────────────────────────────────────────────────────────────────
# Step 12: Traffic shaping for anti-ML-detection
# ──────────────────────────────────────────────────────────────────────────────
log "Applying traffic shaping rules..."

# HTB root on wg0 only — shaping the physical IFACE would jitter SSH/API
# traffic and leak the tunnel's QoS fingerprint onto other host flows.
tc qdisc add dev wg0 root handle 1: htb default 999 2>/dev/null || \
  tc qdisc replace dev wg0 root handle 1: htb default 999

tc class add dev wg0 parent 1: classid 1:999 htb rate 1000mbit 2>/dev/null || true
tc class add dev wg0 parent 1: classid 2:999 htb rate 1000mbit 2>/dev/null || true

# Residential-look jitter: netem must hang off the HTB class (parent 1:999),
# not the device root — wg0 already owns the root qdisc.
tc qdisc add dev wg0 parent 1:999 handle 10: netem \
  delay 5ms 13ms distribution normal loss 0.01% 2>/dev/null || \
  tc qdisc replace dev wg0 parent 1:999 handle 10: netem \
    delay 5ms 13ms distribution normal loss 0.01%

# Reduce MTU on WG interface — prevents packet-size signatures
ip link set wg0 mtu 1380

# Randomize outbound NAT port per connection. Match by interface, not
# --dport 51820 (traffic *to* WG; tunneled flows exit with source port 51820).
iptables -t nat -C POSTROUTING -o ${IFACE} -i wg0 -j MASQUERADE --random-fully 2>/dev/null || \
  iptables -t nat -A POSTROUTING -o ${IFACE} -i wg0 -j MASQUERADE --random-fully

netfilter-persistent save

# ──────────────────────────────────────────────────────────────────────────────
# Step 13: Nginx as Xray fallback (port 80)
# ──────────────────────────────────────────────────────────────────────────────
log "Configuring Nginx fallback..."
cat > /etc/nginx/sites-available/default << 'NGINXEOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    return 444;
}
NGINXEOF
systemctl restart nginx

# ──────────────────────────────────────────────────────────────────────────────
# Step 14: Persist traffic shaping rules across reboots
# ──────────────────────────────────────────────────────────────────────────────
log "Persisting traffic shaping rules..."
cat > /etc/systemd/system/tc-shaping.service << EOF
[Unit]
Description=StealthVPN Traffic Shaping Rules
After=network.target wg-quick@wg0.service
Before=xray.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/stealth-tc.sh
# Oneshot services don't retry on failure by default — if wg0 is briefly
# missing at boot, tc fails and shaping stays off until the next reboot.
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

cat > /usr/local/bin/stealth-tc.sh << EOF
#!/bin/bash
set -e
IFACE=\$(ip route get 8.8.8.8 | awk '{print \$5; exit}')

tc qdisc replace dev wg0 root handle 1: htb default 999
tc class add dev wg0 parent 1: classid 1:999 htb rate 1000mbit 2>/dev/null || true
tc class add dev wg0 parent 1: classid 2:999 htb rate 1000mbit 2>/dev/null || true

# netem under the HTB class — wg0's root qdisc is already owned by HTB.
tc qdisc replace dev wg0 parent 1:999 handle 10: netem \\
  delay 5ms 13ms distribution normal loss 0.01%

ip link set wg0 mtu 1380

iptables -t nat -C POSTROUTING -o \${IFACE} -i wg0 -j MASQUERADE --random-fully 2>/dev/null || \\
  iptables -t nat -A POSTROUTING -o \${IFACE} -i wg0 -j MASQUERADE --random-fully
EOF

chmod +x /usr/local/bin/stealth-tc.sh
systemctl daemon-reload
systemctl enable tc-shaping.service
systemctl start tc-shaping.service

# ──────────────────────────────────────────────────────────────────────────────
# Step 15: Diagnostic endpoint (optional, localhost only)
# ──────────────────────────────────────────────────────────────────────────────
log "Setting up health endpoint on localhost:9999..."
cat > /usr/local/bin/stealth-health.sh << 'HEOF'
#!/bin/bash
WG_STATUS=$(wg show wg0 2>/dev/null && echo "ok" || echo "down")
XRAY_STATUS=$(systemctl is-active xray 2>/dev/null || echo "unknown")
TC_SERVICE=$(systemctl is-active tc-shaping 2>/dev/null || echo "unknown")
CPU=$(top -bn1 | grep "CPU(s)" | awk '{print $2+$4}')
MEM_FREE=$(free -m | awk 'NR==2{print $4}')
LOAD=$(uptime | awk -F'load average:' '{print $2}' | tr -d ' ')
PEER_COUNT=$(wg show wg0 | grep -c "peer:" 2>/dev/null || echo 0)
echo "{\"wg\":\"${WG_STATUS}\",\"xray\":\"${XRAY_STATUS}\",\"tc\":\"${TC_SERVICE}\",\"cpu_percent\":${CPU},\"mem_free_mb\":${MEM_FREE},\"load\":\"${LOAD}\",\"peers\":${PEER_COUNT}}"
HEOF
chmod +x /usr/local/bin/stealth-health.sh

# ──────────────────────────────────────────────────────────────────────────────
# Step 16: Print summary
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "          StealthVPN Node Setup Complete"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "WireGuard Public Key:  ${SERVER_PUBLIC}"
echo "WireGuard Private Key: /etc/wireguard/server_private.key"
echo ""
echo "REALITY Public Key:    ${REALITY_PUBLIC}"
echo "REALITY Private Key:   ${REALITY_PRIVATE}"
echo "REALITY ShortId:       ${SHORT_ID}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${GREEN}Copy these 4 values into your backend .env file:${NC}"
echo "  NODE_<NAME>_WG_PUBLIC_KEY=${SERVER_PUBLIC}"
echo "  NODE_<NAME>_REALITY_PUBLIC_KEY=${REALITY_PUBLIC}"
echo "  NODE_<NAME>_REALITY_SHORT_ID=${SHORT_ID}"
echo "  NODE_<NAME>_IP=<server public IP>"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Keys saved to /etc/xray/reality_keys.txt"
echo "WG private key at /etc/wireguard/server_private.key"
echo ""
echo "Run these commands to verify:"
echo "  wg show wg0                  # WireGuard status"
echo "  systemctl status xray        # Xray status"
echo "  ss -tlnp | grep -E '443|51820'  # Listening ports"
echo ""
echo "${YELLOW}Important: Copy all keys NOW before disconnecting.${NC}"