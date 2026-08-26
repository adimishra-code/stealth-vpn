const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Device = require('../models/Device');
const ServerNode = require('../models/ServerNode');
const logger = require('../config/logger');

const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');
const vpn = require('../services/vpn.service');

function extendedExpiry(user) {
  const ms = paymentService.PLAN_DURATION_DAYS * 86400000;
  const now = new Date();
  return user.planExpiresAt && user.planExpiresAt > now
    ? new Date(user.planExpiresAt.getTime() + ms)
    : new Date(now.getTime() + ms);
}

// Returns 'ok' when applied, 'duplicate' when already processed (webhook
// retry), or 'retry' when the invoice/user isn't visible yet — the caller
// turns 'retry' into a non-2xx so the gateway redelivers.
async function applyRenewal({ gateway, orderId, paymentId }) {
  // Atomic pending -> paid claim. A retried webhook, or a concurrent client-side
  // verify, matches zero documents and cannot credit the plan a second time.
  const invoice = await Invoice.findOneAndUpdate(
    { gatewayOrderId: orderId, gateway, status: 'pending' },
    { $set: { status: 'paid', gatewayPaymentId: paymentId, paidAt: new Date() } },
    { new: true }
  );

  if (!invoice) {
    const existing = await Invoice.findOne({ gatewayOrderId: orderId, gateway });
    if (!existing) {
      logger.warn('Renewal webhook: invoice not found', { gateway, orderId });
      return 'retry';
    }
    logger.info('Renewal webhook: already processed', { gateway, orderId });
    return 'duplicate';
  }

  const user = await User.findById(invoice.userId);
  if (!user) {
    await Invoice.updateOne({ _id: invoice._id }, { $set: { status: 'pending' } });
    logger.error('Renewal webhook: user missing', { gateway, orderId });
    return 'retry';
  }

  user.plan = invoice.plan;
  user.planExpiresAt = extendedExpiry(user);
  user.isActive = true;
  user.notified = {};
  await user.save();

  // SEC-11: Reconcile devices for new plan: revoke excess LRU devices if downgrading,
  // apply basic throttling if moving to basic, or remove throttling if upgrading.
  try {
    await reconcileDevicesForPlan(user._id, invoice.plan);
  } catch (err) {
    logger.error('[WEBHOOK] device reconciliation failed on renewal/downgrade', {
      orderId,
      userId: user._id.toString(),
      plan: invoice.plan,
      error: err.message,
    });
  }

  logger.info('Renewal applied', {
    gateway,
    userId: user._id.toString(),
    planExpiresAt: user.planExpiresAt,
  });
  return 'ok';
}

// SEC-11: Plan downgrade reconciliation — enforces device caps by revoking
// least-recently-used devices down to the new tier limit, and applies/removes
// tc bandwidth throttling immediately.
async function reconcileDevicesForPlan(userId, newPlan) {
  const provisioningService = require('../services/provisioning.service');
  const limit = provisioningService.PLAN_LIMITS[newPlan]?.devices ?? 1;

  // LRU sorting: oldest lastSeen first, then oldest createdAt first
  const activeDevices = await Device.find({ userId, isActive: true })
    .sort({ lastSeen: 1, createdAt: 1 });

  if (activeDevices.length > limit) {
    const excessCount = activeDevices.length - limit;
    const toRevoke = activeDevices.slice(0, excessCount);
    const toRetain = activeDevices.slice(excessCount);

    logger.info('Plan downgrade: revoking excess devices (LRU)', {
      userId: userId.toString(),
      newPlan,
      limit,
      revokingCount: toRevoke.length,
    });

    for (const dev of toRevoke) {
      try {
        await provisioningService.revokeDevice(dev, { status: 'downgraded' });
      } catch (err) {
        logger.error('Failed to revoke excess device on downgrade', {
          deviceId: dev._id.toString(),
          error: err.message,
        });
      }
    }

    if (newPlan === 'basic') {
      for (const dev of toRetain) {
        if (!dev.tcHandle) {
          const node = await ServerNode.findOne({ name: dev.serverNode });
          if (node) {
            try {
              const tcHandle = await vpn.applyThrottle({ serverNode: node, assignedIP: dev.assignedIP });
              dev.tcHandle = tcHandle;
              dev.plan = 'basic';
              await dev.save();
            } catch (err) {
              logger.error('Failed to apply basic throttle on downgrade', {
                deviceId: dev._id.toString(),
                error: err.message,
              });
            }
          }
        }
      }
    }
  } else if (newPlan === 'basic') {
    // Apply basic throttle to retained devices if not already throttled
    for (const dev of activeDevices) {
      if (!dev.tcHandle) {
        const node = await ServerNode.findOne({ name: dev.serverNode });
        if (node) {
          try {
            const tcHandle = await vpn.applyThrottle({ serverNode: node, assignedIP: dev.assignedIP });
            dev.tcHandle = tcHandle;
            dev.plan = 'basic';
            await dev.save();
          } catch (err) {
            logger.error('Failed to apply basic throttle on downgrade', {
              deviceId: dev._id.toString(),
              error: err.message,
            });
          }
        }
      }
    }
  } else {
    // Upgrading away from basic -> remove throttling
    await applyPlanUpgradeCleanup(userId, newPlan);
  }
}

// D3 — plan upgrade path: moving OFF basic must remove the 10 Mbps tc
// throttles on existing basic devices, or they stay shaped forever.
// Best-effort — SSH failures are logged (never thrown), retried next renewal.
async function applyPlanUpgradeCleanup(userId, newPlan) {
  if (newPlan === 'basic') return;

  const throttled = await Device.find({
    userId,
    isActive: true,
    plan: 'basic',
    tcHandle: { $ne: null },
  });
  if (!throttled.length) return;

  logger.info('Plan upgrade — removing throttles', {
    userId: userId.toString(),
    deviceCount: throttled.length,
    newPlan,
  });

  for (const device of throttled) {
    const node = await ServerNode.findOne({ name: device.serverNode });
    if (!node) continue;
    try {
      await vpn.removeThrottle({ serverNode: node, tcHandle: device.tcHandle });
      device.tcHandle = null;
      device.plan = newPlan;
      await device.save();
      logger.info('Throttle removed on upgrade', { deviceId: device._id.toString() });
    } catch (err) {
      logger.error('Throttle removal on upgrade failed — retried next renewal', {
        deviceId: device._id.toString(),
        error: err.message,
      });
    }
  }
}

function handleRazorpayRenewal(payment) {
  return applyRenewal({
    gateway: 'razorpay',
    orderId: payment.order_id,
    paymentId: payment.id,
  });
}

function handleStripeRenewal(session) {
  return applyRenewal({
    gateway: 'stripe',
    orderId: session.id,
    paymentId: session.payment_intent || session.id,
  });
}

async function handleRazorpayFailure(payment) {
  const invoice = await Invoice.findOneAndUpdate(
    { gatewayOrderId: payment.order_id, gateway: 'razorpay', status: 'pending' },
    { $set: { status: 'failed' } },
    { new: true }
  );
  if (!invoice) return 'duplicate';

  const user = await User.findById(invoice.userId);
  if (user) {
    try {
      await emailService.sendPaymentFailedEmail(user);
    } catch (err) {
      logger.warn('Payment-failed email not sent', { error: err.message });
    }
  }
  logger.warn('Payment failed via Razorpay webhook', { invoiceId: invoice._id.toString() });
  return 'ok';
}

module.exports = {
  handleRazorpayRenewal,
  handleRazorpayFailure,
  handleStripeRenewal,
  applyPlanUpgradeCleanup,
  reconcileDevicesForPlan,
};
