
# **1 Install Dependencies**

Make sure package.json includes these dependencies:
'''json
{
  "name": "breach-lookup-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "dotenv": "^16.0.0",
    "nodemailer": "^6.9.1",
    "jsonwebtoken": "^9.0.0"
  }
}
'''

If you don’t already have these, you can add them in one go:
npm install express dotenv nodemailer jsonwebtoken

# **2 Create your .env file**

'''dotenv
# HMAC key for hashing emails (32-byte hex)
EMAIL_HASH_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# JWT signing secret
JWT_SECRET=your_jwt_secret_here

# How long codes live (in seconds)
CODE_TTL=600

# Where your breach .txt files live (for ingest, not needed at runtime)
INPUT_DIR=/mnt/Torrents/WDHome/breaches

# Where your shards (*.jsonl.gz) live
SHARD_DIR=/mnt/Torrents/WDHome/data/shards

# (Optional) SMTP settings—if you have your own SMTP server
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=username
SMTP_PASS=password
SMTP_FROM="no-reply@yourdomain.com"

# If you omit SMTP_HOST, Ethereal (a throw-away testing SMTP) will automatically be used
'''

Be sure to replace EMAIL_HASH_KEY and JWT_SECRET with your own securely generated random values.

# **3 Install everything**
npm install

# **4 Run the service**
npm start

# **5 Test the endpoints**
1. Request a code
curl -X POST http://localhost:3000/api/request-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'

2. Verify & get JWT
curl -X POST http://localhost:3000/api/verify-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","code":"123456"}'

3. Lookup breaches
curl http://localhost:3000/api/breaches \
  -H "Authorization: Bearer eyJ…"

# **6 View logs**
pm2 logs breach-lookup
OR just the error stream:
tail -f ~/.pm2/logs/breach-lookup-error.log

# **6 (Optional) Run under PM2 for production**
1. Install PM2 globally:
sudo npm install -g pm2
pm2 start ecosystem.config.cjs --only breach-lookup
pm2 save
pm2 startup

2. Check status:
pm2 list
pm2 logs breach-lookup

3. Restart
- To stop the lookup service
pm2 stop breach-lookup

- To start it again
pm2 start breach-lookup

- Or to restart in one go
pm2 restart breach-lookup

- You can do the same my <id> which is shown in pm2 list:
pm2 stop <id>
pm2 start <id>

