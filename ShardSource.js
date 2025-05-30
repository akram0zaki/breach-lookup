import Source from './Source.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';

/**
 * ShardSource: searches JSONL or JSONL.GZ shards for matching email_hash entries.
 */
export default class ShardSource extends Source {
  /**
   * @param {string[]} dirs - array of shard base directories
   * @param {string} keyHex - hex-encoded HMAC key for email hashing
   */
  constructor(dirs, keyHex) {
    super();
    this.dirs = dirs;
    this.key = Buffer.from(keyHex, 'hex');
  }

  _hash(emailNorm) {
    return crypto
      .createHmac('sha256', this.key)
      .update(emailNorm)
      .digest('hex');
  }

  async search(email) {
    const emailNorm = email.trim().toLowerCase();
    const emailHash = this._hash(emailNorm);
    const dir = emailHash.slice(0, 2);
    const pref = emailHash.slice(0, 4);

    // Gather candidate shard files across all dirs
    const candidates = [];
    for (const base of this.dirs) {
      const gzPath = path.join(base, dir, `${pref}.jsonl.gz`);
      const jlPath = path.join(base, dir, `${pref}.jsonl`);
      if (fs.existsSync(gzPath)) candidates.push({ filePath: gzPath, isGzip: true });
      if (fs.existsSync(jlPath)) candidates.push({ filePath: jlPath, isGzip: false });
    }

    const results = [];
    for (const { filePath, isGzip } of candidates) {
      const fileStream = fs.createReadStream(filePath);
      const inputStream = isGzip
        ? fileStream.pipe(zlib.createGunzip().on('error', () => fileStream.destroy()))
        : fileStream;
      const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });

      for await (const line of rl) {
        try {
          const rec = JSON.parse(line);
          if (rec.email_hash === emailHash) {
            results.push({
              email:     emailNorm,
              password:  rec.password,
              source:    filePath,
              is_hash:   rec.is_hash,
              hash_type: rec.hash_type,
            });
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    return results;
  }
}
