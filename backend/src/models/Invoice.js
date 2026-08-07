const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  plan: {
    type: String,
    enum: ['basic', 'pro', 'team'],
    required: true,
  },
  // Minor units of `currency` (paise for INR, cents for USD).
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    enum: ['INR', 'USD'],
    default: 'INR',
  },
  gateway: {
    type: String,
    enum: ['razorpay', 'stripe'],
    required: true,
  },
  gatewayPaymentId: String,
  gatewayOrderId: String,
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'abandoned'],
    default: 'pending',
  },
  paidAt: Date,
  refundedAt: Date,
  // Set when the account owner requests deletion — the purge cron removes
  // invoices with this field in the past together with the account.
  deletionScheduledAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

InvoiceSchema.index({ userId: 1 });
InvoiceSchema.index({ gatewayOrderId: 1 }, { unique: true, sparse: true });
// Pending-invoice cron and per-user history listing.
InvoiceSchema.index({ status: 1, createdAt: 1 });
InvoiceSchema.index({ userId: 1, createdAt: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);