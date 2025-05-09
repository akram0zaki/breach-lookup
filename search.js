#!/usr/bin/env node

/**
 * CLI tool to lookup breach shard entries for a given email.
 *
 * Usage:
 *   EMAIL_HASH_KEY=<hex32> SHARD_DIR=/path/to/shards node search.js user@example.com
 *
 * Or, create a .env file with:
 *   EMAIL_HASH_KEY=...
 *   SHARD_DIR=/path/to/shards
 *
 * Then run:
 *   node search.js user@example.com
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';

const [,, email] = process.argv;
if (!email) {
  console.error('Usage: node search.js <email>');
  process.exit(1);
}

const { EMAIL_HASH_KEY, SHARD_DIR } = process.env;
if (!EMAIL_HASH_KEY || !SHARD_DIR) {
  console.error('ERROR: Please set EMAIL_HASH_KEY and SHARD_DIR in environment or .env');
  process.exit(1);
}

// Normalize and HMAC-SHA256 the email
const emailNorm = email.trim().toLowerCase();
const emailHash = crypto
  .createHmac('sha256', Buffer.from(EMAIL_HASH_KEY, 'hex'))
  .update(emailNorm)
  .digest('hex');

// Derive shard file path
const dir = emailHash.slice(0, 2);
const filePrefix = emailHash.slice(0, 4);
const gzFilename = filePrefix + '.jsonl.gz';
const jsonlFilename = filePrefix + '.jsonl';
let filePath = path.join(SHARD_DIR, dir, gzFilename);
let isGzip = true;

// Fallback if gz doesn't exist
if (!fs.existsSync(filePath)) {
  const altPath = path.join(SHARD_DIR, dir, jsonlFilename);
  if (fs.existsSync(altPath)) {
    filePath = altPath;
    isGzip = false;
  } else {
    console.error(`No shard found for hash prefix: ${filePrefix} (.jsonl.gz or .jsonl)`);
    process.exit(0);
  }
}

console.log(`Looking up email: ${emailNorm}`);
console.log(`Hash: ${emailHash}`);
console.log(`Reading shard: ${filePath}`);
console.log('Matches:');

const stream = fs.createReadStream(filePath);
const input = isGzip ? stream.pipe(zlib.createGunzip()) : stream;
const rl = readline.createInterface({ input, crlfDelay: Infinity });

let found = false;
rl.on('line', line => {
  try {
    const rec = JSON.parse(line);
    if (rec.email_hash === emailHash) {
      console.log(JSON.stringify(rec, null, 2));
      found = true;
    }
  } catch (err) {
    // ignore parse errors
  }
});

rl.on('close', () => {
  if (!found) {
    console.log('No records found.');
  }
});
