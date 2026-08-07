const cron = require('node-cron');
const Invoice = require('../models/Invoice');
const logger = require('../config/logger');

// Sweep abandoned checkouts: a Razorpay/Stripe order that was created but
// never paid leaves a `pending` invoice row forever. Nothing depends on those
// rows, but they accumulate and pollute the invoice history. Mark them
// `abandoned` after a grace period — the user can always create a new order.
function startPendingInvoiceCron() {
  let isRunning = false;

  cron.schedule('0 * * * *', async () => {
    if (isRunning) {
      logger.warn('Pending-invoice cron: previous run still active — skipping');
      return;
    }
    isRunning = true;
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = await Invoice.updateMany(
        { status: 'pending', createdAt: { $lt: cutoff } },
        { $set: { status: 'abandoned' } }
      );
      if (result.modifiedCount > 0) {
        logger.info(`Marked ${result.modifiedCount} abandoned invoice(s)`, {
          cutoff: cutoff.toISOString(),
        });
      }
    } catch (err) {
      logger.error('Pending-invoice cron failed', { error: err.message });
    } finally {
      isRunning = false;
    }
  });
}

module.exports = { startPendingInvoiceCron };
