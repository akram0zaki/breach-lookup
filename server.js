import express from 'express';
import dotenv from 'dotenv';
import os from 'os';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path, { dirname } from 'path';
import FileStreamRotator from 'file-stream-rotator';
import { fileURLToPath } from 'url';

import config from './config.js';
import ShardSource from './ShardSource.js';
import PlaintextDirSource from './PlaintextDirSource.js';

dotenv.config();

const {
  EMAIL_HASH_KEY,
  SHARD_DIRS,
  PLAINTEXT_DIR,
  JWT_SECRET,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  SMTP_FROM,
  TURNSTILE_SECRET
} = process.env;

// emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

// Setup a daily-rotating access.log with symlink
const accessLogStream = FileStreamRotator.getStream({
  date_format: 'YYYYMMDD',
  filename: path.join(logDirectory, 'access_%DATE%.log'),
  frequency: 'daily',
  verbose: false,
  extension: '.log',
  create_symlink: true,
  symlink_name: 'access.log'
});

const app = express();
app.use(helmet());
app.disable('x-powered-by');
app.use(cors({
  origin: ['https://breach-lookup.azprojects.net'],
  methods: ['GET', 'POST'],
  optionsSuccessStatus: 200
}));
// Morgan middleware to write to access log
app.use(morgan('combined', { stream: accessLogStream }));
app.use(express.json());

// Data sources
const sources = [];
if (EMAIL_HASH_KEY && SHARD_DIRS) {
  const dirs = SHARD_DIRS.split(',').map(s => s.trim()).filter(Boolean);
  sources.push(new ShardSource(dirs, EMAIL_HASH_KEY));
}
if (PLAINTEXT_DIR) {
  sources.push(new PlaintextDirSource(PLAINTEXT_DIR));
}

// In-memory code store
const codeStore = new Map();

// Turnstile verification helper (with timeout)
async function verifyTurnstile(token, remoteip) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.captcha?.timeoutMs || 5000);

  try {
    const resp = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET,
          response: token,
          remoteip
        }),
        signal: controller.signal
      }
    );
    clearTimeout(timer);
    const data = await resp.json();
    return data.success === true;
  } catch (err) {
    clearTimeout(timer);
    console.error('Turnstile verify error:', err);
    return false;
  }
}

// Rate limiters
const lookupLimiter = rateLimit({
  windowMs: config.throttle.lookupRateLimit.windowMs,
  max: config.throttle.lookupRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many lookup requests, please try again later.' })
});
const codeLimiter = rateLimit({
  windowMs: config.throttle.codeRateLimit.windowMs,
  max: config.throttle.codeRateLimit.max,
  keyGenerator: req => req.body.email || req.ip,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many code requests, please try again later.' })
});
// Rate limiter for verifying codes to prevent brute-force
const verifyLimiter = rateLimit({
  windowMs: config.throttle.verifyRateLimit?.windowMs || config.throttle.codeRateLimit.windowMs,
  max: config.throttle.verifyRateLimit?.max || config.throttle.codeRateLimit.max,
  keyGenerator: req => req.body.email || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many verification attempts, please try again later.' })
});


// Simple concurrency limiter
class ConcurrencyLimiter {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
    this.current++;
  }
  release() {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    }
  }
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const concurrencyLimiter = new ConcurrencyLimiter(config.throttle.concurrencyLimit);

// CPU and memory guards
function cpuOkay() {
  const [load1] = os.loadavg();
  const cores = os.cpus().length;
  return load1 < cores * config.throttle.cpu.loadFactor;
}
function memOkay() {
  const { rss, heapTotal } = process.memoryUsage();
  return Math.max(rss, heapTotal) < os.totalmem() * config.throttle.memory.usageFactor;
}

// Setup SMTP transporter with WARN+ logging
const mailLogger = {
  info: () => {},
  debug: () => {},
  warn: msg => accessLogStream.write(`WARN: ${msg}\n`),
  error: msg => accessLogStream.write(`ERROR: ${msg}\n`)
};

let transporter;
(async () => {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    logger: mailLogger,
    debug: false
  });
  console.log('SMTP transporter configured');
})();

// Request verification code
app.post('/api/request-code', codeLimiter, async (req, res) => {
  const { email, turnstileToken } = req.body;
  if (!email || !turnstileToken) {
    return res.status(400).json({ error: 'email and captcha token required' });
  }
  const ok = await verifyTurnstile(turnstileToken, req.ip);
  if (!ok) {
    return res.status(403).json({ error: 'CAPTCHA verification failed or timed out' });
  }
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  if (codeStore.has(email)) clearTimeout(codeStore.get(email).timeout);
  const timeout = setTimeout(() => codeStore.delete(email), config.throttle.codeRateLimit.windowMs * 10);
  codeStore.set(email, { code, timeout });

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: 'Your breach lookup verification code',
      text: `Your code is: ${code}`
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Verify code & issue JWT
app.post('/api/verify-code', verifyLimiter, (req, res) => {
  const { email, code } = req.body;
  const entry = codeStore.get(email);
  if (!entry || entry.code !== code) {
    return res.status(401).json({ error: 'Invalid verification code' });
  }
  clearTimeout(entry.timeout);
  codeStore.delete(email);
  const token = jwt.sign({ sub: email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// Auth middleware
function authenticate(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).end();
  try {
    req.email = jwt.verify(h.slice(7), JWT_SECRET).sub;
    next();
  } catch {
    res.status(401).end();
  }
}

// Breach lookup endpoint
app.get(
  '/api/breaches',
  authenticate,
  (req, res, next) => {
    if (!cpuOkay()) return res.status(503).json({ error: 'Server too busy, try again later.' });
    if (!memOkay()) return res.status(503).json({ error: 'Server low on memory, try again later.' });
    next();
  },
  lookupLimiter,
  async (req, res) => {
    try {
      const emailRaw = req.email;
      const promises = sources.map(src =>
        concurrencyLimiter.run(() => src.search(emailRaw))
      );
      const allResults = await Promise.all(promises);
      res.json(allResults.flat());
    } catch (err) {
      console.error('Lookup error:', err);
      res.status(500).json({ error: 'Lookup failed' });
    }
  }
);

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => console.log(`Lookup service running on port ${PORT}`));
