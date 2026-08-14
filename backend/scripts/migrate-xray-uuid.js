#!/usr/bin/env node
// PRIV-05 migration: encrypt legacy plaintext Reality UUIDs.
//
// Older deployments stored the Xray Reality UUID in plaintext (field
// `xrayUUID`). The UUID is a live credential — with the node's public key
// and shortId, anyone holding it can build a working VLESS link — so the
// schema moved it to the AES-256-GCM `encryptedXrayUUID` envelope. This
// script re-encrypts any leftover plaintext rows in place.
//
//   node scripts/migrate-xray-uuid.js            # migrate
//   node scripts/migrate-xray-uuid.js --dry-run  # preview only
//
// Requires backend/.env (WG_ENCRYPTION_KEY) and a reachable MongoDB.

require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { encryptPrivateKey, CRYPTO_PURPOSES } = require('../src/utils/crypto');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  const db = mongoose.connection.db;
  const devices = db.collection('devices');

  // Plaintext-field rows: xrayUUID exists (and isn't already blank).
  const cursor = devices.find({ xrayUUID: { $type: 'string', $ne: '' } });

  let migrated = 0;
  let skipped = 0;
  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    const existing = doc.encryptedXrayUUID;
    if (existing) {
      console.log(`SKIP  ${doc._id}: already has encryptedXrayUUID (keep both? decide manually)`);
      skipped += 1;
      continue;
    }
    const uuid = doc.xrayUUID;
    if (DRY_RUN) {
      console.log(`DRY   ${doc._id}: would encrypt uuid ${uuid.slice(0, 8)}...`);
    } else {
      await devices.updateOne(
        { _id: doc._id },
        {
          $set: { encryptedXrayUUID: encryptPrivateKey(uuid, CRYPTO_PURPOSES.wg) },
          $unset: { xrayUUID: '' },
        }
      );
      console.log(`OK    ${doc._id}: plaintext xrayUUID removed, encryptedXrayUUID written`);
    }
    migrated += 1;
  }

  console.log(`\n${DRY_RUN ? 'DRY-RUN:' : 'DONE:'} ${migrated} row(s) processed, ${skipped} skipped.`);
  if (!DRY_RUN) {
    const remaining = await devices.countDocuments({ xrayUUID: { $type: 'string', $ne: '' } });
    console.log(`Plaintext rows remaining: ${remaining}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
