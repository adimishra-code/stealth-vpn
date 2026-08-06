/**
 * Migration: legacy invoices stored `amountINR`; the schema now uses `amount`
 * (minor units of `currency`). `amountINR` was already in paise (INR minor
 * units), so for INR rows the value carries over unchanged; a currency field
 * is backfilled to 'INR' where missing.
 *
 * Run once against production AFTER the new code is deployed:
 *   NODE_ENV=production node scripts/migrate-invoice-amount.js
 *
 * Safe to re-run: idempotent (skips docs that already have `amount`).
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');

async function migrate() {
  await mongoose.connect(env.MONGO_URI);
  const invoices = mongoose.connection.collection('invoices');

  const legacy = await invoices.find({ amountINR: { $exists: true }, amount: { $exists: false } }).toArray();
  console.log(`legacy rows to migrate: ${legacy.length}`);

  let updated = 0;
  for (const inv of legacy) {
    const result = await invoices.updateOne(
      { _id: inv._id, amount: { $exists: false } },
      { $set: { amount: inv.amountINR, currency: inv.currency || 'INR' }, $unset: { amountINR: '' } }
    );
    updated += result.modifiedCount;
  }

  const orphan = await invoices.find({ amount: { $exists: false } }).countDocuments();
  console.log(`migrated: ${updated}, remaining without amount: ${orphan}`);
  await mongoose.disconnect();
}

migrate().catch(async (err) => {
  console.error('migration failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
