import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

dotenv.config();

function normalizeEmail(email) {
  let e = email.trim().toLowerCase();
  e = e.replace(/^[^a-z0-9]+/, '');
  const atIndex = e.indexOf('@');
  if (atIndex > 0) {
    let local = e.slice(0, atIndex).split('+')[0];
    const domain = e.slice(atIndex + 1);
    e = `${local}@${domain}`;
  }
  return e;
}

const {
  EMAIL_HASH_KEY,
  JWT_SECRET,
  CODE_TTL = '600',
  SHARD_DIR,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  SMTP_FROM,
  TURNSTILE_SECRET
} = process.env;
const CODE_LIFETIME = parseInt(CODE_TTL, 10) * 1000;

const app = express();
app.use(helmet());
app.disable('x-powered-by');
app.use(morgan('combined'));
app.use(cors({
  origin: ['https://breach-lookup.azprojects.net'],
  methods: ['GET', 'POST'],
  optionsSuccessStatus: 200
}));
app.use(express.json());

const codeStore = new Map();

let transporter;
(async () => {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  console.log('SMTP transporter configured:', {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    user: SMTP_USER
  });
})();

function hashEmail(email) {
  return crypto
    .createHmac('sha256', Buffer.from(EMAIL_HASH_KEY, 'hex'))
    .update(normalizeEmail(email))
    .digest('hex');
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function verifyTurnstile(token, remoteip) {
  const resp = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: token,
        remoteip
      })
    }
  );
  const data = await resp.json();
  return data.success;
}

const emailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: req => req.body.email || req.ip,
  handler: (_, res) => res.status(429).json({ error: 'Too many requests. Try again later.' })
});

app.post('/api/request-code', emailLimiter, async (req, res) => {
  const { email, turnstileToken } = req.body;
  if (!email || !turnstileToken) {
    return res.status(400).json({ error: 'email and captcha token required' });
  }
  try {
    const ok = await verifyTurnstile(turnstileToken, req.ip);
    if (!ok) return res.status(403).json({ error: 'captcha verification failed' });
  } catch (err) {
    console.error('Turnstile verify error:', err);
    return res.status(500).json({ error: 'captcha verification error' });
  }
  const code = generateCode();
  if (codeStore.has(email)) clearTimeout(codeStore.get(email).timeout);
  const timeout = setTimeout(() => codeStore.delete(email), CODE_LIFETIME);
  codeStore.set(email, { code, timeout });
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: 'Your breach lookup verification code',
      text: `Your verification code is: ${code}`
    });
    console.log('Sent code to', email, 'msgId=', info.messageId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: 'failed to send email' });
  }
});

app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'email & code required' });
  const entry = codeStore.get(email);
  if (!entry || entry.code !== code) return res.status(401).json({ error: 'invalid code' });
  clearTimeout(entry.timeout);
  codeStore.delete(email);
  const token = jwt.sign({ sub: email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).end();
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.email = payload.sub;
    next();
  } catch {
    res.status(401).end();
  }
}

app.get('/api/breaches', authenticate, async (req, res) => {
  const email_hash = hashEmail(req.email);
  const dir    = email_hash.slice(0, 2);
  const pref   = email_hash.slice(0, 4);
  
  const gzPath   = path.join(SHARD_DIR, dir, `${pref}.jsonl.gz`);
  const jsonlPath= path.join(SHARD_DIR, dir, `${pref}.jsonl`);
  let   filePath, isGzip;
  
  if (fs.existsSync(gzPath)) {
    filePath = gzPath;  isGzip = true;
  } else if (fs.existsSync(jsonlPath)) {
    filePath = jsonlPath; isGzip = false;
  } else {
    console.warn(`[/api/breaches] no shard for ${email_hash}, looked at:\n  ${gzPath}\n  ${jsonlPath}`);
    return res.json([]);  // no records
  }

  console.log(`[/api/breaches] streaming shard: ${filePath}`);
  const rawStream = fs.createReadStream(filePath);
  rawStream.on('error', err => {
    console.error(`[/api/breaches] error opening shard ${filePath}:`, err);
    return res.status(500).json({ error: 'Failed to read shard file' });
  });

  const input = isGzip
    ? rawStream.pipe(zlib.createGunzip().on('error', e => {
        console.error(`[/api/breaches] gunzip error:`, e);
        rawStream.destroy();
      }))
    : rawStream;

  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const results = [];

  rl.on('line', line => {
    try {
      const rec = JSON.parse(line);
      if (rec.email_hash === email_hash) {
        // trim everything before "breaches" (inclusive)
        const idx = rec.source.indexOf('breaches');
        if (idx !== -1) {
          rec.source = rec.source.slice(idx);
        }
        results.push(rec);
	  }
    } catch (e) {
      console.error(`[/api/breaches] JSON parse error:`, e, `\n  line>`, line);
    }
  });

  rl.on('close', () => {
    console.log(`[/api/breaches] found ${results.length} records for query.`);
    res.json(results);
  });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => console.log(`Lookup service running on port ${PORT}`));
