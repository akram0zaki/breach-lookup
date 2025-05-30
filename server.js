import express from 'express';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import ShardSource from './ShardSource.js';
import PlaintextDirSource from './PlaintextDirSource.js';

dotenv.config();

// Normalize email similarly to hashing logic
function normalizeEmail(email) {
  let e = email.trim().toLowerCase();
  e = e.replace(/^[^a-z0-9]+/, '');
  const at = e.indexOf('@');
  if (at > 0) {
    let local = e.slice(0, at).split('+')[0];
    const domain = e.slice(at + 1);
    e = `${local}@${domain}`;
  }
  return e;
}

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

const app = express();
app.use(helmet());
app.disable('x-powered-by');
app.use(morgan('combined'));
app.use(cors({
  origin: ['https://breach-lookup.azprojects.net'],
  methods: ['GET','POST'],
  optionsSuccessStatus: 200
}));
app.use(express.json());

// Setup email code store
const codeStore = new Map();

// Prepare data sources
const sources = [];

if (EMAIL_HASH_KEY && SHARD_DIRS) {
  const dirs = SHARD_DIRS.split(',').map(s => s.trim()).filter(Boolean);
  if (dirs.length) {
    sources.push(new ShardSource(dirs, EMAIL_HASH_KEY));
  }
}
if (PLAINTEXT_DIR) {
  sources.push(new PlaintextDirSource(PLAINTEXT_DIR));
}

// Turnstile verification helper
async function verifyTurnstile(token, remoteip) {
  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method:'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      secret: TURNSTILE_SECRET,
      response: token,
      remoteip
    })
  });
  const data = await resp.json();
  return data.success;
}

// Rate limiter for email requests
const emailLimiter = rateLimit({
  windowMs: 60*1000,
  max: 5,
  keyGenerator: req => req.body.email || req.ip,
  handler: (_, res) => res.status(429).json({ error: 'Too many requests. Try again later.' })
});

// Setup SMTP transporter
let transporter;
(async () => {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT,10),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  console.log('SMTP ready');
})();

// Request verification code
app.post('/api/request-code', emailLimiter, async (req, res) => {
  const { email, turnstileToken } = req.body;
  if (!email || !turnstileToken) return res.status(400).json({ error: 'email & captcha required' });
  try {
    const ok = await verifyTurnstile(turnstileToken, req.ip);
    if (!ok) return res.status(403).json({ error: 'captcha failed' });
  } catch (e) {
    return res.status(500).json({ error: 'captcha error' });
  }
  const code = Math.floor(100000 + Math.random()*900000).toString();
  if (codeStore.has(email)) clearTimeout(codeStore.get(email).timeout);
  const timeout = setTimeout(() => codeStore.delete(email), 10*60*1000);
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
    res.status(500).json({ error: 'email send failed' });
  }
});

// Verify code and issue JWT
app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;
  const entry = codeStore.get(email);
  if (!entry || entry.code !== code) return res.status(401).json({ error: 'invalid code' });
  clearTimeout(entry.timeout);
  codeStore.delete(email);
  const token = jwt.sign({ sub: email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// Authentication middleware
function authenticate(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).end();
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET);
    req.email = payload.sub;
    next();
  } catch {
    res.status(401).end();
  }
}

// Breach lookup endpoint
app.get('/api/breaches', authenticate, async (req, res) => {
  const emailRaw = req.email;
  const emailNorm = normalizeEmail(emailRaw);
  const results = [];
  for (const src of sources) {
    try {
      const recs = await src.search(emailRaw);
      results.push(...recs);
    } catch (err) {
      console.error('Source error', err);
    }
  }
  res.json(results);
});

const PORT = parseInt(process.env.PORT||'3000',10);
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
