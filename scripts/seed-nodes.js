#!/usr/bin/env node

/**
 * StealthVPN — Seed ServerNode documents into MongoDB.
 *
 * Usage:
 *   node scripts/seed-nodes.js
 *
 * Reads node configuration from environment variables:
 *   NODE_MUMBAI_IP, NODE_MUMBAI_WG_PUBLIC_KEY,
 *   NODE_MUMBAI_REALITY_PUBLIC_KEY, NODE_MUMBAI_REALITY_SHORT_ID,
 *   NODE_FRANKFURT_IP, NODE_FRANKFURT_WG_PUBLIC_KEY,
 *   NODE_FRANKFURT_REALITY_PUBLIC_KEY, NODE_FRANKFURT_REALITY_SHORT_ID
 *
 * Requires MONGO_URI to be set in .env or environment.
 */

const mongoose = require('mongoose');
const path = require('path');

// Load .env from project root if present
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  // dotenv not installed yet — env vars must be set manually
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set in environment.');
  process.exit(1);
}

const ServerNodeSchema = new mongoose.Schema({
  name:           { type: String, unique: true },
  ip:             { type: String, required: true },
  country:        { type: String, required: true },
  region:         { type: String, required: true },
  subnetCIDR:     { type: String, default: '10.8.0.0/16' },
  nextIP:         { type: Number, default: 2 },
  wgPublicKey:    { type: String, required: true },
  xrayPort:       { type: Number, default: 443 },
  wgPort:         { type: Number, default: 51820 },
  isOnline:       { type: Boolean, default: true },
  lastHealthCheck: Date,
  realityPublicKey: String,
  realityShortId:   String,
  createdAt:        { type: Date, default: Date.now },
});

const ServerNode = mongoose.model('ServerNode', ServerNodeSchema);

const seedData = [
  {
    name: 'mumbai',
    ip: process.env.NODE_MUMBAI_IP,
    country: 'IN',
    region: 'Maharashtra',
    wgPublicKey: process.env.NODE_MUMBAI_WG_PUBLIC_KEY,
    realityPublicKey: process.env.NODE_MUMBAI_REALITY_PUBLIC_KEY,
    realityShortId: process.env.NODE_MUMBAI_REALITY_SHORT_ID,
  },
  {
    name: 'frankfurt',
    ip: process.env.NODE_FRANKFURT_IP,
    country: 'DE',
    region: 'Hesse',
    wgPublicKey: process.env.NODE_FRANKFURT_WG_PUBLIC_KEY,
    realityPublicKey: process.env.NODE_FRANKFURT_REALITY_PUBLIC_KEY,
    realityShortId: process.env.NODE_FRANKFURT_REALITY_SHORT_ID,
  },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB.`);

  for (const node of seedData) {
    if (!node.ip) {
      console.warn(`Skipping "${node.name}" — IP not configured.`);
      continue;
    }
    if (!node.wgPublicKey) {
      console.warn(`Skipping "${node.name}" — WG public key not configured.`);
      continue;
    }

    await ServerNode.findOneAndUpdate(
      { name: node.name },
      { $setOnInsert: node },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Seeded server node: ${node.name} (${node.ip})`);
  }

  const count = await ServerNode.countDocuments();
  console.log(`Total server nodes in database: ${count}`);

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});