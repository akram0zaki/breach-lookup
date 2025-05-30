#!/usr/bin/env node

/**
 * search.js
 *
 * Unified breach lookup CLI using pluggable sources.
 * Sources: ShardSource (JSONL shards) and PlaintextDirSource (two-level directory).
 *
 * Usage:
 *   EMAIL_HASH_KEY=<hex32> SHARD_DIRS=/path/to/shards1,... PLAINTEXT_DIR=/path/to/data node search.js user@example.com
 */

import 'dotenv/config';
import ShardSource from './ShardSource.js';
import PlaintextDirSource from './PlaintextDirSource.js';

async function main() {
  const [,, email] = process.argv;
  if (!email) {
    console.error('Usage: node search.js <email>');
    process.exit(1);
  }

  const { EMAIL_HASH_KEY, SHARD_DIRS, PLAINTEXT_DIR } = process.env;
  const sources = [];

  // JSONL shard source
  if (EMAIL_HASH_KEY && SHARD_DIRS) {
    const dirs = SHARD_DIRS.split(',').map(s => s.trim()).filter(Boolean);
    if (dirs.length) {
      sources.push(new ShardSource(dirs, EMAIL_HASH_KEY));
    }
  }

  // Plaintext 2-level directory source
  if (PLAINTEXT_DIR) {
    sources.push(new PlaintextDirSource(PLAINTEXT_DIR));
  }

  if (sources.length === 0) {
    console.error('ERROR: No data sources configured. Please set SHARD_DIRS and/or PLAINTEXT_DIR in .env');
    process.exit(1);
  }

  console.log(`Looking up email: ${email}`);
  const results = [];

  for (const src of sources) {
    try {
      const recs = await src.search(email);
      results.push(...recs);
    } catch (err) {
      console.error(`Error querying source ${src.constructor.name}:`, err);
    }
  }

  if (results.length === 0) {
    console.log('No records found.');
  } else {
    results.forEach(rec => console.log(JSON.stringify(rec, null, 2)));
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
