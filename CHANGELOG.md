# Changelog

All notable changes implemented on this date.

## 2025-05-31

### 🆕 Added

* **Log Rotation**: Introduced access logs under logs/ directory with daily rotation using `file-stream-rotator`

### 🔄 Changed

* **index.html**:

  * Added an error banner div to display error codes returned from the server.
  * Improved the error handling for non-success server response codes.

* **server.js**:

  * Added rate limiter to the /api/verify-code endpoint to prevent bruteforce.

### 🐛 Fixed

* **ShardSource.js**:

  * Populated the source as per the parsed json shard, instead of the shard location.

---

## 2025-05-30

### 🆕 Added

* **Pluggable Sources Architecture**: Introduced a `Source` interface to support multiple breach data formats.
* **ShardSource.js**: New module for JSONL/.jsonl.gz shard lookup, HMAC‐SHA256 hashing, directory/file discovery.
* **PlaintextDirSource.js**: New module for two‐level (and optional third level) plaintext directory lookup using case‐insensitive grep, with `source: "Other"`.
* **merge-shards.js**: Node.js script to merge multiple shard directories into a base directory, with:

  * Status file `.merge-progress.json` to track `in-progress` and `done` states for audit.
  * Resume support on interruption.

### 🔄 Changed

* **search.js**:

  * Refactored to use pluggable sources (`ShardSource`, `PlaintextDirSource`).
  * Returns *all* matching records from all configured sources.
  * CLI usage updated to read `EMAIL_HASH_KEY`, `SHARD_DIRS`, and `PLAINTEXT_DIR` from `.env`.

* **server.js**:

  * Refactored to instantiate and query multiple sources in `/api/breaches` endpoint.
  * Maintained JWT authentication, Turnstile, rate‐limiting, and email verification logic.

* **index.html**:

  * Wrapped JavaScript in `DOMContentLoaded` to ensure event bindings load correctly.
  * Converted form submissions to `type="button"` to prevent full‐page reloads; disabled caching via `<meta http-equiv="Cache-Control" content="no-store" />`.
  * Added **Loading…** banner during API queries and disabled lookup button to avoid duplicate clicks.
  * Displayed query duration (`performance.now()`) in the UI.
  * Restored **toast alert** styling and element.

* **README.md**:

  * Added **Data Sources and Formats** section explaining:

    * JSONL shard structure and lookup process.
    * Two‐level plaintext directory (with optional third level) and grep‐based lookup.

* **Throttling**  
  - Introduced multi-layer throttling with externalized parameters in `config.js` for:
    - Per-IP lookup rate limits (`lookupRateLimit`)  
    - Per-email verification code rate limits (`codeRateLimit`)  
    - Concurrency limits on shard searches (`concurrencyLimit`)  
    - CPU load-average circuit breaker (`cpu.loadFactor`)  
    - Memory-usage guard (`memory.usageFactor`)  
  - Documented proxy-level rate limiting via `limit_req_zone` and `limit_req` in the NGINX config.

### 🐛 Fixed

* **search.js**:

  * Corrected bug where only the first match was returned; updated to collect and print all matches.
---
