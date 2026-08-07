# StealthVPN — Server Setup Guide

Step-by-step instructions for setting up Contabo and Hetzner VPS nodes.

---

## Pre-requisites

- Two Ubuntu 22.04 LTS VPS instances:
  - **Contabo** (Mumbai, India): primary node, lowest latency for IN users
  - **Hetzner CX23** (Frankfurt, Germany): secondary exit node, obfuscation fallback
- Domain pointed to Cloudflare (for dashboard, not VPN nodes)
- SSH key pair generated: `ssh-keygen -t ed25519 -f ~/.ssh/vpn_nodes_ed25519 -C "stealth-vpn-admin"`
- Local IP of VPS (find via `ip a` or `curl ifconfig.me`)

---

## Quick Setup (automated)

```bash
# 1. Upload the provisioning script
scp scripts/provision-node.sh root@<VPS_IP>:/root/

# 2. Upload your SSH public key
ssh-copy-id -i ~/.ssh/vpn_nodes_ed25519 root@<VPS_IP>

# 3. SSH in and run
ssh root@<VPS_IP>
chmod +x /root/provision-node.sh
bash /root/provision-node.sh
```

**Save all 4 values printed at the end:**
- WireGuard public key
- REALITY public key
- REALITY private key
- REALITY shortId

---

## Manual Setup Steps

### 1. Update and Install Packages

```bash
apt update && apt upgrade -y
apt install -y wireguard wireguard-tools iptables-persistent \
  curl wget unzip net-tools iproute2 fail2ban ufw nginx openssl
```

### 2. SSH Hardening

Edit `/etc/ssh/sshd_config`:

```
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 20
AllowUsers root
```

Restart SSH: `systemctl restart sshd`

Add your `vpn_nodes_ed25519.pub` to `/root/.ssh/authorized_keys`.

### 3. UFW Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 443/tcp    # Xray
ufw allow 51820/udp  # WireGuard
ufw --force enable
```

### 4. WireGuard Setup

```bash
# Generate keys
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
chmod 600 /etc/wireguard/server_private.key

# Find primary interface
IFACE=$(ip route get 8.8.8.8 | awk '{print $5; exit}')

# Create wg0.conf (replace ${IFACE} and ${SERVER_PRIVATE})
cat > /etc/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = $(cat /etc/wireguard/server_private.key)
Address = 10.8.0.1/16
ListenPort = 51820

PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp   = iptables -A FORWARD -o wg0 -j ACCEPT
PostUp   = iptables -t nat -A POSTROUTING -o ${IFACE} -j MASQUERADE
PostUp   = iptables -A FORWARD -i wg0 -o wg0 -j DROP

PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -o wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o ${IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -o wg0 -j DROP

SaveConfig = true
EOF
chmod 600 /etc/wireguard/wg0.conf
```

### 5. Enable IP Forwarding

```bash
cat > /etc/sysctl.d/99-stealth-vpn.conf << EOF
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=0
net.ipv6.conf.wg0.disable_ipv6=1
EOF
sysctl --system
```

Start WireGuard: `systemctl enable wg-quick@wg0 && systemctl start wg-quick@wg0`

### 6. Install Xray-core

```bash
bash -c "$(curl -sL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install --version v1.8.11
```

### 7. Generate REALITY Keypair

```bash
mkdir -p /etc/xray
xray x25519 > /etc/xray/reality_keys.txt
chmod 600 /etc/xray/reality_keys.txt
SHORT_ID=$(openssl rand -hex 8)
```

**Copy these values:**
- Private key from `grep 'Private key' /etc/xray/reality_keys.txt`
- Public key from `grep 'Public key' /etc/xray/reality_keys.txt`
- `SHORT_ID` value

### 8. Traffic Shaping

```bash
IFACE=$(ip route get 8.8.8.8 | awk '{print $5; exit}')

# Root HTB qdisc
tc qdisc add dev wg0 root handle 1: htb default 999
tc class add dev wg0 parent 1: classid 1:999 htb rate 1000mbit
tc class add dev wg0 parent 1: classid 2:999 htb rate 1000mbit

# Jitter injection (anti-ML-DPI)
tc qdisc add dev ${IFACE} root handle 10: netem \
  delay 5ms 13ms distribution normal loss 0.01%

# MTU reduction
ip link set wg0 mtu 1380

# Randomize NAT ports
iptables -t nat -A POSTROUTING -o ${IFACE} -p udp --dport 51820 \
  -j MASQUERADE --random-fully
netfilter-persistent save
```

---

## Verification Checklist

After provisioning, verify the following on each node:

- [ ] `wg show wg0` — interface is up
- [ ] `systemctl status xray` — active
- [ ] `ss -tlnp | grep -E '443|51820'` — ports listening
- [ ] `ss -tlnp | grep 10085` — Xray API on localhost only (not 0.0.0.0)
- [ ] `tc qdisc show dev wg0` — htb qdisc present
- [ ] `tc qdisc show dev ${IFACE}` — netem qdisc with delay
- [ ] `ip link show wg0 | grep mtu` — shows 1380
- [ ] `curl localhost:80` — returns empty / connection closed (Nginx fallback)
- [ ] Manual WG client connects and routes traffic

### Client Test (from your laptop)

```bash
# Save this as test.conf
[Interface]
PrivateKey = <client_private_key>
Address = 10.8.0.2/32
# Tunnel-local resolver (unbound on the node, provision-node.sh Step 8b) —
# never the ISP's resolver.
DNS = 10.8.0.1

[Peer]
PublicKey = <server_public_key>
Endpoint = <VPS_IP>:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25

# Connect
sudo wg-quick up ./test.conf

# Test
curl ifconfig.me   # should return VPS IP

# Disconnect
sudo wg-quick down ./test.conf
```

---

## Key Storage

Store all generated keys securely:

```
/root/.ssh/vpn_nodes_ed25519          — SSH private key (local only)
/root/.ssh/vpn_nodes_ed25519.pub      — SSH public key (on each VPS)

Backend .env:
  NODE_MUMBAI_IP=<Contabo IP>
  NODE_MUMBAI_WG_PUBLIC_KEY=<from setup>
  NODE_MUMBAI_REALITY_PUBLIC_KEY=<from setup>
  NODE_MUMBAI_REALITY_SHORT_ID=<from setup>

  NODE_FRANKFURT_IP=<Hetzner IP>
  NODE_FRANKFURT_WG_PUBLIC_KEY=<from setup>
  NODE_FRANKFURT_REALITY_PUBLIC_KEY=<from setup>
  NODE_FRANKFURT_REALITY_SHORT_ID=<from setup>

  SSH_PRIVATE_KEY_PATH=/home/$USER/.ssh/vpn_nodes_ed25519
```

---

## Troubleshooting

### WireGuard handshake fails
```bash
wg show wg0
# Check peer endpoint, public key, and allowed-ips match
# Test UDP reachability: nmap -sU -p 51820 <VPS_IP>
```

### Xray doesn't start
```bash
xray run -test -config /usr/local/etc/xray/config.json
# Checks config syntax; fix any JSON errors
journalctl -u xray -n 50 --no-pager
```

### Traffic not flowing through WG
```bash
iptables -L -n -v | grep wg0
# Ensure forward rules are present
sysctl net.ipv4.ip_forward
# Should be 1
```

### REALITY handshake rejected by client
- Verify `shortIds` in config matches client config
- Verify `serverNames` matches client's `serverName`
- Check fingerprint: `chrome` is recommended