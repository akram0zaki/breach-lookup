#!/usr/bin/env node

/**
 * CLI tool to lookup breach shard entries for a given email across multiple shard directories.
 *
 * Usage:
 *   EMAIL_HASH_KEY=<hex32> SHARD_DIRS=/path/to/shards1,/path/to/shards2 node search.js user@example.com
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';

(async () => {
  const [,, email] = process.argv;
  if (!email) {
    console.error('Usage: node search.js <email>');
    process.exit(1);
  }

  const { EMAIL_HASH_KEY, SHARD_DIRS } = process.env;
  if (!EMAIL_HASH_KEY || !SHARD_DIRS) {
    console.error('ERROR: Please set EMAIL_HASH_KEY and SHARD_DIRS in environment or .env');
    process.exit(1);
  }

  // Normalize and HMAC-SHA256 the email
  const emailNorm = email.trim().toLowerCase();
  const emailHash = crypto
    .createHmac('sha256', Buffer.from(EMAIL_HASH_KEY, 'hex'))
    .update(emailNorm)
    .digest('hex');

  // Derive shard filename components
  const dir = emailHash.slice(0, 2);
  const prefix = emailHash.slice(0, 4);
  const gzFilename = prefix + '.jsonl.gz';
  const jsonlFilename = prefix + '.jsonl';

  // Collect all shard files across configured directories
  const baseDirs = SHARD_DIRS.split(',').map(d => d.trim()).filter(Boolean);
  const shardFiles = [];
  for (const base of baseDirs) {
    const gzPath = path.join(base, dir, gzFilename);
    const jsonlPath = path.join(base, dir, jsonlFilename);
    if (fs.existsSync(gzPath)) shardFiles.push({ filePath: gzPath, isGzip: true });
    if (fs.existsSync(jsonlPath)) shardFiles.push({ filePath: jsonlPath, isGzip: false });
  }

  if (shardFiles.length === 0) {
    console.error(`No shard files found for prefix ${prefix} in any of: ${baseDirs.join(', ')}`);
    process.exit(0);
  }

  console.log(`Looking up email: ${emailNorm}`);
  console.log(`Hash: ${emailHash}`);
  console.log('Shard files:');
  shardFiles.forEach(s => console.log(`  ${s.filePath}`));
  console.log('Matches:');

  const matches = [];
  for (const { filePath, isGzip } of shardFiles) {
    const fileStream = fs.createReadStream(filePath);
    const input = isGzip
      ? fileStream.pipe(zlib.createGunzip().on('error', () => fileStream.destroy()))
      : fileStream;

    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of rl) {
      try {
        const rec = JSON.parse(line);
        if (rec.email_hash === emailHash) {
          matches.push(rec);
        }
      } catch {
        // ignore unparsable lines
      }
    }
  }

  if (matches.length === 0) {
    console.log('No records found.');
  } else {
    matches.forEach(m => console.log(JSON.stringify(m, null, 2)));
  }
})();