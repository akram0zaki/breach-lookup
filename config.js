// config.js

export default {
  throttle: {
    // Rate limit for lookup requests per IP: max requests within window
    lookupRateLimit: {
      windowMs: 60 * 1000,
      max: 5
    },
    // Rate limit for verification code requests per IP/email
    codeRateLimit: {
      windowMs: 60 * 1000,
      max: 5
    },
    verifyRateLimit: { 
      windowMs: 60 * 1000, 
      max: 5 
    },
    // Maximum concurrent shard/source searches
    concurrencyLimit: 2,
    // CPU load factor threshold (loadavg 1min < cores * factor)
    cpu: {
      loadFactor: 0.75
    },
    // Memory usage factor threshold (usage < totalmem * factor)
    memory: {
      usageFactor: 0.8
    }
  },
  captcha: {
    // Timeout for Turnstile verification (ms)
    timeoutMs: 5000
  }
};
