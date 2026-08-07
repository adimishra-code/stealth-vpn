# Backup Key Setup — what to save so a restore actually works

Restoring `stealthvpn.gz` is useless without the keys that unlock the rest of
the system. This page lists every secret a full restore needs, how to back
them up offline, and how to restore each role. Run through it ONCE at launch
and after any rotation.

**Golden rule: the keys live in the vault/paper, never only in `.env` on the
server.** A lost VPS without this backup set means permanent loss of every
user's WireGuard key material.

---

## 1. The key inventory

| Key | File / env var | What it unlocks | If lost |
|---|---|---|---|
| `WG_ENCRYPTION_KEY` | `backend/.env` (64 hex chars) | AES-256-GCM encryption of every device's WireGuard private key | All client configs become unusable; users must re-provision |
| `WG_ENCRYPTION_KEY_PREVIOUS` | `backend/.env` (optional) | Decryption during key rotation | Rotation fails for old devices |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `backend/.env` | Session tokens (HMAC fallback) | Everyone logged out (recoverable) |
| `JWT_*_PUBLIC_KEY` / `JWT_*_PRIVATE_KEY` (ES256) | `backend/.env` (base64 DER, from `scripts/generate-jwt-keys.js`) | Session tokens (ES256, preferred) | Everyone logged out (recoverable); regenerate + redeploy |
| `SSH_PRIVATE_KEY_PATH` keypair | `~/.ssh/vpn_nodes_ed25519` (+ pubkey on nodes) | Control-plane → node access | Nodes unreachable for provisioning/health |
| `backend/.env` itself | `backend/.env` | All of the above + payment/SMTP creds + `NODE_*` values | Everything above |
| Node key material | `/etc/wireguard/server_private.key`, `/etc/xray/reality_keys.txt` on each node | Node identity + REALITY stealth | Re-provision the node (public parts feed `.env`) |

## 2. Creating the offline backup set

On the control plane:

```bash
# 1. Concatenate the critical files into one archive
tar czf /tmp/stealthvpn-secrets.tar.gz \
  backend/.env \
  ~/.ssh/vpn_nodes_ed25519 ~/.ssh/vpn_nodes_ed25519.pub

# 2. Encrypt with your PGP key (or a strong passphrase)
gpg --symmetric --cipher-algo AES256 --output /tmp/stealthvpn-secrets.tar.gz.gpg /tmp/stealthvpn-secrets.tar.gz
rm /tmp/stealthvpn-secrets.tar.gz

# 3. Store at least two copies in different places:
#    - offline USB / hardware vault
#    - a second operator's possession
```

Paper backup of the two 64-hex secrets (print + lock away):

```bash
openssl rand -hex 32   # example of what WG_ENCRYPTION_KEY looks like
# print: WG_ENCRYPTION_KEY + JWT_ACCESS_SECRET + JWT_REFRESH_SECRET
```

## 3. Restoring each role

- **Fresh control-plane host:** reinstall (`deploy/setup.sh`), copy
  `backend/.env` + SSH key back, decrypt `stealthvpn.gz` with the PGP
  passphrase, restore Mongo (`scripts/restore-mongo.sh`, drill in
  `docs/BACKUP_RESTORE.md`).
- **Node identity lost:** run `scripts/provision-node.sh` on a fresh node,
  copy the printed public values into `backend/.env` (`NODE_<NAME>_*`), reseed
  the `ServerNode` doc, re-provision affected devices from the admin panel.
- **`WG_ENCRYPTION_KEY` lost:** there is no recovery — re-provision every
  device (generate new configs, revoke old peers). This is the one scenario
  where the backup set is the difference between hours and days.

## 4. Rotation checklist

1. Set `WG_ENCRYPTION_KEY_PREVIOUS` to the current key (still in `.env`).
2. Generate a new `WG_ENCRYPTION_KEY` (`openssl rand -hex 32`), update `.env`,
   restart PM2.
3. Verify a sample device config still decrypts (dashboard config delivery).
4. Update the vault/paper backup; remove `WG_ENCRYPTION_KEY_PREVIOUS` once no
   device was provisioned under the old key (query `Device.createdAt`).
5. Rotate JWT secrets = force-login for all users — schedule a quiet window.

---

Related: `docs/BACKUP_RESTORE.md` (the Mongo dump/restore drill),
`docs/SERVER_SETUP.md` (key storage), `docs/INCIDENT_RESPONSE.md`.
