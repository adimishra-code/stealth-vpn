#!/usr/bin/env node
// First-admin seeding script. Run ONCE on a fresh deploy to create the
// operator account.
//
//   node scripts/seed-admin.js <email> <password>
//
// Requirements: backend/.env (with MONGO_URI). Idempotent: re-running with
// the same email only updates the role + password and prints the existing
// user's id, never creating a duplicate.
//
// The user MUST set up TOTP separately at /settings (the admin UI) — TOTP
// cannot be enrolled from a CLI without an authenticator app. The role is
// set here so the operator can log in immediately and complete the second
// factor.

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const User = require('../src/models/User');
const logger = require('../src/config/logger');

async function main() {
  const [, , emailArg, passwordArg] = process.argv;
  if (!emailArg || !passwordArg) {
    console.error('Usage: node scripts/seed-admin.js <email> <password>');
    console.error('  email    — operator email address');
    console.error('  password — at least 8 characters');
    process.exit(1);
  }

  if (passwordArg.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  // Mongoose's pre('save') hook hashes the password. Using .save() on an
  // existing document triggers the hook (findOneAndUpdate + $set does NOT —
  // see User.js).
  let user = await User.findOne({ email: emailArg });
  let created = false;

  if (!user) {
    user = new User({
      email: emailArg,
      passwordHash: passwordArg,
      emailVerified: true,
      role: 'admin',
      isActive: true,
      plan: 'free',
    });
    created = true;
  } else {
    user.passwordHash = passwordArg;
    user.emailVerified = true;
    user.role = 'admin';
    user.isActive = true;
  }

  await user.save();

  console.log(
    created
      ? `Admin account created: ${emailArg} (id=${user._id})`
      : `Admin account updated: ${emailArg} (id=${user._id})`
  );
  console.log('Log in at /login, then enable TOTP at /settings.');

  await mongoose.disconnect();
  logger.info('seed-admin complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('seed-admin failed:', err.message);
  process.exit(1);
});
