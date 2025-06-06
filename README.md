# Breach Lookup Service

This project hosts a secure and privacy-respecting breach lookup service that allows users to check if their email addresses were found in known breach compilations. 
As a proof of concept, this project is published on a Raspberry Pi, backed by JSONL shard storage and served through a lightweight Express web service with email verification.

Password managers sometimes alert the user that an account of theirs has appeared in one or more breaches. This message is often a vague one and doesn't tell the user where it has appeared, or exactly what data  was compromised.
I thought it can be useful if authenticated owners of an an email address can learn exactly what data of theirs was compromised in the past, and this service is created to serve this purpose.

The following measures were taken to ensure privacy:

- When a user requests a lookup for an email address, a 6-digit code is sent to that email to verify ownership of the account. Upon entering the correct code, the user is able to view relevant data concerning their email address.
- The breach data is transformed into json shards. Every entry contained an HMAC-hash value of the email address, in addition to the cleartext email which was needed in the early stages to verify the application is working as intended. After completing the verification, the cleartext email was scrubbed from all shards using ('scrub-emails.js') in the [Breach-Ingestor repo](https://github.com/akram0zaki/breach-ingestor).
- The cleartext email address entered by the user is not persisted in any application or web log files or databases. It lives in memory for a pre-configured number of minutes to be able to do the code validation. I currently have this window set to 10 minutes in the published service.
- To perform the lookup, the cleartext email entered by the user is then converted into an HMAC-hash, which is used for the lookup.

To learn more about thow the data shards are created, please visit the [Breach-Ingestor repo](https://github.com/akram0zaki/breach-ingestor).

I am hosting this project online at [AZ Projects](https://breach-lookup.azprojects.net/) where it relies on Cloudflare Tunnel to channel the traffic to a Raspberry Pi device, and Cloudflare Turnstil for the Captcha challenge. 

The installation instructions below reflect this setup for educational purpose only, to demonstrate how a service can be published with free hosting, TLS certificates, WAF protection, and free captcha challenge, all on low-specs hardware.

It's important to pay attention to security concerns if you plan to host public pages. Place your server in a De-militarized Zone (DMZ) isolated from the rest of your network, continuously harden your OS and software stack, don't store any other sensitive information on the same device or network, and have security monitoring in place.

---

## OWASP Security Controls

To ensure the lookup service is safe and resilient against common attack vectors, multiple protections aligned with the [OWASP Top 10](https://owasp.org/Top10/) were implemented:

| OWASP Threat | Protection Implemented |
|--------------|------------------------|
| A01: Broken Access Control | JWT token required for `/api/breaches`. Only verified users can access data. |
| A02: Cryptographic Failures | All email addresses are hashed using HMAC-SHA256. No plaintext email is persisted. TLS is enforced via Cloudflare Tunnel. |
| A03: Injection | No dynamic SQL or command injection vectors present. Input is sanitized. |
| A04: Insecure Design | CAPTCHA and rate limits mitigate automated abuse. Clear separation between verification and data access. |
| A05: Security Misconfiguration | `helmet` sets secure HTTP headers. Express fingerprint removed. Proper CORS configured. |
| A07: Identification & Auth Failures | Email code verification with expiry + JWT tokens with TTL. |
| A08: Software/Data Integrity Failures | No dynamic eval/imports. Only static dependencies. |
| A09: Logging & Monitoring | `morgan` logs all HTTP access. PM2 captures stdout/stderr for audit. |

These controls ensure the service remains lightweight, verifiable, and secure while hosted on constrained hardware such as a Raspberry Pi.

---

## Architecture

```mermaid
flowchart TD
  Client(UI) -->|HTTPS| CloudflareTunnel[Cloudflare Tunnel]
  CloudflareTunnel --> Nginx[Nginx]
  Nginx -->|Static| UI["Static Page
(index.html)"]
  Nginx -->|Proxy| API["Express API
(server.js)"]
  API --> Shards["Shards Directory
(/shards)"]
  API --> SMTP[SMTP Server]
  CLI -->|Local FS| Shards
```

* **Cloudflare Tunnel**: Secures inbound traffic, routes hostnames to your Pi.

* **Nginx**:

  * Serves static UI under `breach-lookup.azprojects.net`
  * Proxies `/api/*` to Express API on port 3000

* **Express API** (`server.js`):

  1. **POST /api/request-code**

     * Validates Cloudflare Turnstile CAPTCHA
     * Generates and emails a 6-digit one-time code

  2. **POST /api/verify-code**

     * Verifies the code, issues a JWT (1h)

  3. **GET /api/breaches**

     * Authenticates JWT
     * Streams the corresponding shard file and filters records

* **Shards**:

  * Directory tree: 256 subfolders `00`–`ff`
  * Files named `<first4hex>.jsonl.gz` or `.jsonl`

* **CLI** (`search.js`): Locally hashes an email, finds and searches the proper shard. Used mainly in the initial stages to verify that the application is working as designed.

---


## Data Sources and Formats

This service uses a **pluggable sources** architecture to query multiple breach data formats. New sources can be added by implementing a `Source` interface.

### ShardSource (JSONL Shards)
- **Configuration**: Set `SHARD_DIRS` in `.env` to a comma-separated list of directories.
- **Directory Structure**: Each base directory is organized into two levels of subfolders named `00`–`ff` (hex):
  ```
  /path/to/shards/
    00/000a.jsonl[.gz]
    00/000b.jsonl[.gz]
    ...
    ff/fffa.jsonl[.gz]
  ```
- **Lookup Process**:
  1. Email is normalized and hashed (HMAC-SHA256).
  2. First two hex chars map to subfolder, next two to filename prefix.
  3. Streams `.jsonl` or `.jsonl.gz` files, filtering entries matching the email hash.

### PlaintextDirSource (Two-Level Plaintext Files)
- **Configuration**: Set `PLAINTEXT_DIR` in `.env` to the root of the plaintext data.
- **Directory Structure**:  
  - **First level**: folder name is the first character of the email (alphanumeric or `symbols`).  
  - **Second level**: folder or file name is the second character.
  - **Third level (optional)**: if a folder exists (to split large buckets), files are named by the third character.
  ```
  /path/to/data/
    a/
      k   (file containing all emails starting 'ak')
      symbols/
        ... (if 'ak' bucket is large, further split by 3rd char)
    symbols
    ...
  ```
- **Lookup Process**:
  1. Maps first, second (and third if needed) characters to reach the leaf file.
  2. Uses a **case-insensitive grep** to scan for `^email[:; ]` and parses key–value pairs.
  3. Returns plaintext passwords with `"source": "Other"` for clarity.

---

## Throttling

Heavy or abusive traffic can overwhelm a low-powered host (like a Raspberry Pi). I’ve added multi-layer throttles to gracefully shed load and maintain responsiveness:

| Layer                            | What it does                                                       | Config key                    |
|----------------------------------|--------------------------------------------------------------------|-------------------------------|
| **Per-IP rate limit**            | Caps `/api/breaches` calls per minute per client IP               | `throttle.lookupRateLimit`    |
| **Per-email rate limit**         | Caps `/api/request-code` (email) calls per minute per IP/email    | `throttle.codeRateLimit`      |
| **Concurrency limiter**          | Only N simultaneous heavy `search()` jobs at once                  | `throttle.concurrencyLimit`   |
| **CPU load circuit breaker**     | Rejects when 1-min loadavg ≥ cores × loadFactor                    | `throttle.cpu.loadFactor`     |
| **Memory‐usage guard**           | Rejects when heap/RSS ≥ total RAM × usageFactor                    | `throttle.memory.usageFactor` |
| **Edge/NGINX rate limit**        | Global rate limiting at the proxy layer via `limit_req_zone`       | n/a (in NGINX conf)           |

Each parameter can be tweaked in [config.js](config.js) (and proxy settings in NGINX), so you can dial limits up or down as your Pi’s capacity or usage changes.

---

## Prerequisites

* **Hardware**: This project was hosted on a Raspberry Pi 5, which offers very low resource consumption, making it a good choice for 24x7 hobby-project hosting
* **Node.js** ≥ 18
* **pm2** for process management
* **cloudflared** for Cloudflare Tunnel
* **A mounted NAS** with the breach data shards
* **SMTP** account (e.g., Zoho)
* **Cloudflare Turnstile** site & secret keys for CAPTCHA

---

## Installation

```bash
git clone https://github.com/akram0zaki/breach-lookup.git
cd breach-lookup
npm install
```

---

## Configuration

Create a `.env` in the project root:

```ini
# Keys & Secrets
EMAIL_HASH_KEY=<hex 32-byte key>
JWT_SECRET=<jwt-secret>

# Shard path
SHARD_DIRS=/mnt/data/shards,...

# Cloudflare Turnstile
TURNSTILE_SECRET=<turnstile-secret>

# SMTP (e.g. Zoho)
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<user@example.com>
SMTP_PASS=<app-password>
SMTP_FROM="Breach Lookup <user@example.com>"
```

Configure Cloudflare Tunnel at `/etc/cloudflared/config.yml`:

```yaml
tunnel: <UUID>
credentials-file: ~/.cloudflared/<UUID>.json
origincert: ~/.cloudflared/cert.pem

ingress:
  - hostname: breach-lookup.azprojects.net
    service: http://localhost
  - hostname: www.azprojects.net
    service: http://localhost
  - service: http_status:404
```

---

## Running the Service

### Start with PM2

```bash
# Start API + UI
pm2 start ecosystem.config.cjs --only breach-lookup

# Persist on reboot
pm2 save
pm2 startup
```

* **Status**: `pm2 list`
* **Logs**:

  * `~/.pm2/logs/breach-lookup-out.log`
  * `~/.pm2/logs/breach-lookup-error.log`

### Start Tunnel

```bash
systemctl enable --now cloudflared
```

---

## CLI Lookup

Used during the development and testing of this project to ensure it is functioning as designed.
```bash
# Ensure .env is present or export vars
npm install dotenv

node search.js user@example.com
```

---

## Troubleshooting

* **400 on /api/request-code**

  * CAPTCHA token missing or invalid → check front-end Turnstile integration

* **502 Bad Gateway**

  * Check PM2 logs for stack trace
  * Ensure no `node-fetch` imports in server.js (use global fetch)

* **UI not loading**

  * Verify `index.html` served by Nginx at the correct vhost
  * Check Nginx config and reload: `nginx -t && systemctl reload nginx`

* **Shards not found**

  * Confirm `SHARD_DIR` correct, permissions allow read
  * Temporary `.jsonl` vs `.jsonl.gz` support

---

## Logs & Monitoring

* **PM2**

  * `pm2 logs breach-lookup`
  * `pm2 status`

* **Cloudflared**

  ```bash
  journalctl -u cloudflared -f
  ```

---


### Log Rotation

In addition to PM2 logs, the Express application writes structured access logs to the `logs/` directory at the project root. The setup uses `file-stream-rotator` to rotate logs daily. Key points:

- **Current Log Symlink**: `logs/access.log` is a symlink pointing to today’s log file.
- **Rotated Files**: At the first access after midnight, the previous day’s log is renamed to `access_YYYYMMDD.log` (e.g., `access_20250529.log`).
- **Location**: All rotated logs (e.g., `access_20250529.log`, `access_20250530.log`) reside in `logs/`. The `access.log` symlink always points to the current day’s file.
- **Mailer Warnings/Errors**: Nodemailer’s `WARN` and `ERROR` messages also stream into these access logs via the same rotation mechanism.
- **Example Path**: If you clone the repo and run under `/home/pi2/apps/breach-lookup`, you would see:
  ```
  /home/pi2/apps/breach-lookup/logs/
    access.log         # symlink to today's file (e.g., access_20250531.log)
    access_20250529.log
    access_20250530.log
    ...
  ```
- **PM2’s stdout/stderr** are still available via:
  ```
  ~/.pm2/logs/breach-lookup-out.log
  ~/.pm2/logs/breach-lookup-error.log
  ```

---

## License

MIT
