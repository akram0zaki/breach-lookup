import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const SYMBOL_KEY = 'symbols';

// Map a character to its directory/file key
function mapChar(c) {
  if (!c) return SYMBOL_KEY;
  return /^[0-9a-z]$/i.test(c) ? c.toLowerCase() : SYMBOL_KEY;
}

export default class PlaintextDirSource {
  /**
   * @param {string} baseDir - root of the two-level (or deeper) plaintext directory
   */
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  async search(email) {
    // Use original email case for lookup, and normalized for mapping
    const norm = email.trim();
    const first = mapChar(norm[0]);
    const second = mapChar(norm[1]);
    let leafPath = path.join(this.baseDir, first, second);

    // If second-level is a directory, map third character
    try {
      const stat = fs.statSync(leafPath);
      if (stat.isDirectory()) {
        const third = mapChar(norm[2]);
        leafPath = path.join(leafPath, third);
      }
    } catch (e) {
      // path doesn't exist, will handle below
    }

    if (!fs.existsSync(leafPath)) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const results = [];
      // grep line-by-line, case-insensitive match of start
      const grep = spawn('grep', ['-i', `^${norm}[:; ]`, leafPath]);
      let output = '';
      grep.stdout.on('data', data => { output += data.toString(); });
      grep.stderr.on('data', data => { /* ignore stderr */ });
      grep.on('error', err => reject(err));
      grep.on('close', code => {
        if (code === 0 && output) {
          for (const line of output.trim().split(/\r?\n/)) {
            const sep = line.includes(':') ? ':' :
                        line.includes(';') ? ';' : ' ';
            const [e, pw] = line.split(sep);
            results.push({
              email: e,
              password: pw,
              source: 'Other',
              is_hash: false,
              hash_type: 'plaintext'
            });
          }
        }
        resolve(results);
      });
    });
  }
}
