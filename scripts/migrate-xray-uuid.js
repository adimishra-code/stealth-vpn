/**
 * Migration (PRIV-05): Device.xrayUUID (plaintext Reality credential) is
 * renamed to Device.encryptedXrayUUID and the value AES-256-GCM encrypted
 * with WG_ENCRYPTION_KEY.
 *
 * Run once against production AFTER the new code is deployed:
 *   cd backend && NODE_ENV=production node ../scripts/migrate-xray-uuid.js
 *
 * Safe to re-run: idempotent (skips docs that already have encryptedXrayUUID).
 * The plaintext field is removed only after the encrypted copy exists.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { encryptPrivateKey } = require('../src/utils/crypto');

async function migrate() {
  await mongoose.connect(env.MONGO_URI);
  const devices = mongoose.connection.collection('devices');

  const legacy = await devices
    .find({ xrayUUID: { $exists: true, $ne: null }, encryptedXrayUUID: { $exists: false } })
    .toArray();
  console.log(`devices with plaintext xrayUUID to migrate: ${legacy.length}`);

  let updated = 0;
  for (const device of legacy) {
    const result = await devices.updateOne(
      { _id: device._id, encryptedXrayUUID: { $exists: false } },
      {
        $set: { encryptedXrayUUID: encryptPrivateKey(String(device.xrayUUID)) },
        $unset: { xrayUUID: '' },
      }
    );
    updated += result.modifiedCount;
  }

  const orphan = await devices
    .find({ xrayUUID: { $exists: true, $ne: null } })
    .countDocuments();
  console.log(`migrated: ${updated}, remaining plaintext: ${orphan}`);
  await mongoose.disconnect();
}

migrate().catch(async (err) => {
  console.error('migration failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
