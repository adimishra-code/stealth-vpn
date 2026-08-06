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
  amountINR: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
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
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  paidAt: Date,
  refundedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

InvoiceSchema.index({ userId: 1 });
InvoiceSchema.index({ gatewayOrderId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Invoice', InvoiceSchema);