# ── Dependencies ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine
# wireguard-tools: backend runs `wg genkey` / `wg pubkey` to provision peers.
# openssh-client: node-ssh shell. dumb-init: proper PID 1 signal forwarding
# (SIGTERM → graceful shutdown in server.js).
RUN apk add --no-cache wireguard-tools openssh-client dumb-init \
  && adduser -D -u 1001 app

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /home/app/.ssh && chown -R app:app /app /home/app

USER app
EXPOSE 5000

# Mount the VPN-node SSH key at $SSH_PRIVATE_KEY_PATH (e.g. /home/app/.ssh/vpn_nodes_ed25519).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health || exit 1

CMD ["dumb-init", "node", "server.js"]
