const cron = require('node-cron');
const tls = require('tls');
const ServerNode = require('../models/ServerNode');
const env = require('../config/env');
const { sshConnect } = require('../services/vpn.service');
const logger = require('../config/logger');
const { alertError } = require('../services/alert.service');

const DOWN_ALERT_THRESHOLD_MS = 5 * 60 * 1000;
const TLS_HANDSHAKE_TIMEOUT_MS = 10 * 1000;
// Renewal reminder horizon: alert while there is still time to act.
const TLS_RENEW_WARNING_DAYS = 14;

// Same guard as the other crons: an overlap (slow SSH round-trips vs the
// 2-minute interval) would run two sweeps at once and double-fire alerts.
let isRunning = false;

// Writes the sweep outcome. lastOnlineAt advances ONLY on success so the
// offline duration is measurable and the >5-min alert can fire; lastHealthCheck
// records that the sweep ran either way.
function recordStatus(node, isOnline, now) {
  return ServerNode.findByIdAndUpdate(
    node._id,
    isOnline
      ? { isOnline: true, lastOnlineAt: now, lastHealthCheck: now }
      : { isOnline: false, lastHealthCheck: now }
  );
}

// Time since the node last confirmed online; never-online nodes (lastOnlineAt
// null) reference creation time so a dead-on-arrival node still alerts.
function offlineSinceMs(node) {
  const reference = node.lastOnlineAt || node.createdAt || new Date();
  return new Date() - new Date(reference);
}

// INFRA-09: verify the REALITY fronting domain serves a valid TLS cert for
// its own SNI — a dead SNI or expired cert gets some networks blocking the
// domain entirely. Runs weekly (Sundays 03:00).
function checkFrontingTls(host, port = 443, timeoutMs = TLS_HANDSHAKE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      servername: host,
      // Manual inspection below: rejectUnauthorized would hide an expired
      // cert behind a generic handshake error, and we want the remaining
      // validity reported either way.
      rejectUnauthorized: false,
    });
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error('TLS handshake timed out')), timeoutMs);
    socket.once('error', fail);
    socket.once('secureConnect', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const peerCert = socket.getPeerCertificate();
      const authorized = socket.authorized; // chain + hostname check result
      socket.destroy();
      if (!peerCert || !peerCert.valid_to) {
        resolve({ ok: false, authorized: false, expired: false, daysLeft: 0, reason: 'no certificate presented' });
        return;
      }
      const validTo = new Date(peerCert.valid_to);
      const daysLeft = Math.floor((validTo - Date.now()) / 86400000);
      const expired = validTo <= Date.now();
      resolve({ ok: authorized && !expired, authorized, expired, daysLeft });
    });
  });
}

// Exported for tests; the cron wraps it with alerts.
function startWeeklyTlsCheckCron() {
  cron.schedule('0 3 * * 0', async () => {
    const host = env.XRAY_SNI_DEST;
    let result;
    try {
      result = await checkFrontingTls(host);
    } catch (err) {
      logger.error('Fronting domain TLS/SNI check failed', { host, error: err.message });
      alertError({
        source: 'cron.tls',
        title: `Fronting domain TLS check failed: ${host}`,
        message: `${host}:${443} — ${err.message}`,
        details: { host, error: err.message },
      });
      return;
    }

    if (result.ok) {
      logger.info('Weekly TLS/SNI check passed', { host, daysLeft: result.daysLeft });
      return;
    }
    if (result.expired) {
      logger.error('Fronting domain TLS cert expired', { host, validTo: result.validTo });
      alertError({
        source: 'cron.tls',
        title: `Fronting domain TLS cert expired: ${host}`,
        message: `${host} presents an expired certificate — REALITY stealth and every node are affected.`,
        details: { host, validTo: result.validTo },
      });
      return;
    }
    if (result.daysLeft < TLS_RENEW_WARNING_DAYS) {
      logger.warn('Fronting domain TLS cert expiring soon', { host, daysLeft: result.daysLeft });
      alertError({
        source: 'cron.tls',
        title: `Fronting domain TLS cert expiring in ${result.daysLeft}d: ${host}`,
        message: `${host} cert renews in ${result.daysLeft} day(s) — run the certbot renewal before it expires.`,
        details: { host, daysLeft: result.daysLeft },
      });
      return;
    }
    logger.error('Fronting domain TLS/SNI check failed', { host, authorized: result.authorized, reason: result.reason });
    alertError({
      source: 'cron.tls',
      title: `Fronting domain TLS/SNI check failed: ${host}`,
      message: `${host} did not present a valid certificate for its own SNI.`,
      details: { host, authorized: result.authorized, daysLeft: result.daysLeft, reason: result.reason },
    });
  });
}

function startHealthCheckCron() {
  cron.schedule('*/2 * * * *', async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      let nodes;
      try {
        nodes = await ServerNode.find();
      } catch (err) {
        // node-cron does not handle a rejected callback — without this the process exits.
        logger.error('Health cron: failed to load nodes', { error: err.message });
        return;
      }

for (const node of nodes) {
        const now = new Date();
        try {
          let ssh;
          try {
            ssh = await sshConnect(node);
          } catch (sshErr) {
            // Could not connect via SSH — node is unreachable.
            await recordStatus(node, false, now);
            if (offlineSinceMs(node) > DOWN_ALERT_THRESHOLD_MS) {
              logger.error('Node health check failing >5min (SSH unreachable)', { node: node.name, error: sshErr.message });
              alertError({
                source: 'cron.health',
                title: `VPN node health check failing >5min: ${node.name}`,
                message: `${node.name} (${node.ip}) — SSH unreachable since ${node.lastOnlineAt || 'never online'}`,
                details: { node: node.name, ip: node.ip, lastOnlineAt: node.lastOnlineAt, error: sshErr.message },
              });
            }
            continue;
          }
          const cmdTimeout = 10000;
          const xrayCmd = ssh.execCommand('systemctl is-active xray');
          const wgCmd = ssh.execCommand('sudo -n wg show wg0');
          const [xrayResult, wgResult] = await Promise.all([
            Promise.race([xrayCmd, new Promise((_, reject) => setTimeout(() => reject(new Error('SSH command timed out')), cmdTimeout))]),
            Promise.race([wgCmd, new Promise((_, reject) => setTimeout(() => reject(new Error('SSH command timed out')), cmdTimeout))]),
          ]);
          const xrayStatus = xrayResult?.stdout?.trim();
          const wgStatusText = wgResult?.stdout?.trim;
          const isOnline = xrayStatus !== '' || wgStatusText !== '';

          if (!isOnline) {
            if (node.isOnline) {
              logger.warn('Node went offline', { node: node.name, ip: node.ip });
            }
            if (offlineSinceMs(node) > DOWN_ALERT_THRESHOLD_MS) {
              logger.error('Node offline >5min', { node: node.name });
              alertError({
                source: 'cron.health',
                title: `VPN node offline >5min: ${node.name}`,
                message: `${node.name} (${node.ip}) — xray/wg0 down since ${node.lastOnlineAt || 'never online'}`,
                details: { node: node.name, ip: node.ip, lastOnlineAt: node.lastOnlineAt },
              });
            }
          }
        } catch (err) {
          try {
            await recordStatus(node, false, now);
          } catch (dbErr) {
            logger.error('Health cron: status write failed', { node: node.name, error: dbErr.message });
          }
          if (offlineSinceMs(node) > DOWN_ALERT_THRESHOLD_MS) {
            logger.error('Node health check failing >5min', { node: node.name, error: err.message });
            alertError({
              source: 'cron.health',
              title: `VPN node health check failing >5min: ${node.name}`,
              message: `${node.name} (${node.ip}) — ${err.message}`,
              details: { node: node.name, ip: node.ip, error: err.message },
              err,
            });
          }
        }
      }
    } finally {
      isRunning = false;
    }
  });
}

module.exports = {
  startHealthCheckCron,
  startWeeklyTlsCheckCron,
  checkFrontingTls,
  recordStatus,
  offlineSinceMs,
};