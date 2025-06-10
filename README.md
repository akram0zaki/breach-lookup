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

### PostgresSource (PostgreSQL Database)
- **Configuration**: Set `POSTGRES_CONNECTION_STRING` in `.env` to a PostgreSQL connection string.
- **Connection String Format**: `postgresql://username:password@host:port/database`
- **Database Schema**: Expected table structure:
  ```sql
  CREATE TABLE breaches (
    email_norm VARCHAR(255),  -- normalized email address
    password TEXT,            -- password or hash
    source VARCHAR(255),      -- breach source name
    is_hash BOOLEAN,          -- whether password is hashed
    hash_type VARCHAR(50)     -- type of hash (if applicable)
  );
  CREATE INDEX idx_breaches_email_norm ON breaches(email_norm);
  ```
- **Lookup Process**:
  1. Email is normalized (trimmed and lowercased).
  2. Database is queried using the normalized email as a direct match.
  3. Results are returned with consistent field mapping to match other sources.

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

# PostgreSQL connection (optional)
POSTGRES_CONNECTION_STRING=postgresql://username:password@host:port/database

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

## Testing Framework

The project includes a comprehensive test suite built with **Mocha**, **Chai**, and **Supertest** to ensure code quality and reliability. The testing infrastructure is organized for maintainability and provides detailed coverage reporting.

### Test Organization

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── base-source.test.js       # Source base class tests
│   ├── plaintext-source.test.js  # PlaintextDirSource tests
│   ├── postgres-source.test.js   # PostgresSource tests
│   └── shard-source.test.js      # ShardSource tests
├── integration/             # Integration tests for full workflows
│   ├── basic-api.test.js          # Basic API functionality
│   └── data-sources.test.js      # Multi-source integration tests
├── helpers/                 # Test utilities and configuration
│   ├── auth-helper.js             # JWT and authentication utilities
│   └── test-config.js             # Environment and mock configuration
└── fixtures/                # Mock data and test fixtures
    ├── mock-data.js               # Shared mock data structures
    └── sample-breach-data.json    # Sample breach data for testing
```

### Test Configuration

The test suite uses several configuration files:

- **`.mocharc.json`**: Mocha test runner configuration with timeouts and reporters
- **`.c8rc.json`**: Coverage reporting configuration with thresholds
- **`tests/helpers/test-config.js`**: Centralized test environment setup

### Running Tests

#### All Tests
```bash
npm test                    # Run complete test suite (unit + integration)
```

#### Test Categories
```bash
npm run test:unit          # Run only unit tests (faster, no external dependencies)
npm run test:integration   # Run only integration tests (includes API tests)
```

#### Coverage Reports
```bash
npm run test:coverage      # Run tests with coverage analysis and HTML reports
```

The coverage command generates both text output and detailed HTML reports in the `coverage/` directory.

### Coverage Thresholds

The project maintains high code quality standards with the following coverage requirements:

| Metric    | Threshold | Current Status |
|-----------|-----------|----------------|
| Lines     | 60%       | ✅ 66.37%      |
| Functions | 80%       | ✅ 100%        |
| Branches  | 70%       | ✅ 81.25%      |
| Statements| 60%       | ✅ 66.37%      |

### Test Features

#### Unit Tests
- **Source Classes**: Comprehensive testing of all data source implementations
- **Mock Dependencies**: Uses Sinon for stubbing external dependencies (file system, database connections)
- **Error Handling**: Validates proper error handling and graceful degradation
- **Input Validation**: Tests edge cases, malformed inputs, and boundary conditions

#### Integration Tests
- **API Endpoints**: Tests complete request/response cycles
- **Multi-Source Queries**: Validates data source coordination and result aggregation
- **Performance**: Includes timing tests to ensure reasonable response times
- **Authentication**: Tests JWT token generation and validation workflows

#### Test Utilities
- **Auth Helper**: Provides utilities for generating test JWT tokens and API authentication
- **Mock Data**: Consistent test data across all test suites
- **Environment Config**: Automatic test environment detection and configuration

### Key Testing Practices

1. **Error Resilience**: All tests validate that database connection failures and missing files return empty arrays rather than throwing exceptions
2. **Case Sensitivity**: Email normalization and hashing consistency is thoroughly tested
3. **Performance**: Integration tests include timing assertions to catch performance regressions
4. **Isolation**: Unit tests use mocks to avoid dependencies on external services or file systems
5. **Real-world Scenarios**: Integration tests use realistic data patterns and API flows

### Viewing Coverage Reports

After running `npm run test:coverage`, open `coverage/index.html` in a browser to see:

- **File-by-file coverage breakdown**
- **Line-by-line coverage highlighting**
- **Branch coverage analysis**
- **Uncovered code identification**

### Development Testing

During development, you can run specific test files:

```bash
# Test a specific source class
npx mocha tests/unit/postgres-source.test.js

# Test with file watching (requires nodemon)
npx nodemon --exec "npm test" --watch tests/ --watch *.js
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
