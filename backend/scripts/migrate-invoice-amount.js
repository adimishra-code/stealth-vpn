#!/usr/bin/env node
// PAY-01 migration: normalize invoice amounts to MINOR units.
//
// The schema stores `amount` in minor units (paise for INR, cents for USD —
// see backend/src/models/Invoice.js). A legacy deployment once wrote major
// units (₹99 instead of 9900). Both sides of the ledger (Razorpay/Stripe
// payloads, admin revenue stats, invoice history) assume minor units, so a
// wrong-unit invoice skews revenue reports.
//
// Heuristic is deliberately conservative: only amounts that EXACTLY match a
// known major-unit plan price are touched — anything else is left alone and
// listed for manual review.
//
//   node scripts/migrate-invoice-amount.js            # migrate
//   node scripts/migrate-invoice-amount.js --dry-run  # preview only
//
// Requires backend/.env and a reachable MongoDB.

require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');

const DRY_RUN = process.argv.includes('--dry-run');

// Known plan prices in major units, per currency. If an invoice amount
// matches one of these exactly, it was almost certainly written in major
// units. USD floats from JSON were also written as 1.99 — match both the
// float and its rounded integer form (2, 4, 10).
const MAJOR_UNIT_PRICES = {
  INR: new Set([99, 199, 499]),
  USD: new Set([1.99, 2, 3.99, 4, 9.99, 10]),
};

function isMajorUnitAmount(amount, currency) {
  const prices = MAJOR_UNIT_PRICES[currency];
  if (!prices) return false;
  return prices.has(amount);
}

async function main() {
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  const db = mongoose.connection.db;
  const invoices = db.collection('invoices');

  const cursor = invoices.find({ status: 'paid' });

  let migrated = 0;
  let skipped = 0;
  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    const currency = doc.currency || 'INR';
    const amount = doc.amount;
    if (!isMajorUnitAmount(amount, currency)) {
      skipped += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(`DRY   ${doc._id}: ${currency} ${amount} -> ${Math.round(amount * 100)} (major -> minor)`);
    } else {
      await invoices.updateOne(
        { _id: doc._id },
        { $set: { amount: Math.round(amount * 100) } }
      );
      console.log(`OK    ${doc._id}: ${currency} ${amount} -> ${Math.round(amount * 100)}`);
    }
    migrated += 1;
  }

  console.log(`\n${DRY_RUN ? 'DRY-RUN:' : 'DONE:'} ${migrated} invoice(s) would be/updated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
