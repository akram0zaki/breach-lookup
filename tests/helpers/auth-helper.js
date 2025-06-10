import jwt from 'jsonwebtoken';
import { expect } from 'chai';

/**
 * Generate a test JWT token for API testing
 * @param {Object} payload - Token payload
 * @param {string} secret - JWT secret (defaults to test secret)
 * @param {Object} options - JWT options
 * @returns {string} JWT token
 */
export function generateTestToken(payload = {}, secret = 'test-secret-key', options = {}) {
  const defaultPayload = {
    userId: 'test-user',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    ...payload
  };

  return jwt.sign(defaultPayload, secret, options);
}

/**
 * Create authorization header with Bearer token
 * @param {string} token - JWT token
 * @returns {string} Authorization header value
 */
export function createAuthHeader(token) {
  return `Bearer ${token}`;
}

/**
 * Verify JWT token structure and content
 * @param {string} token - JWT token to verify
 * @param {string} secret - JWT secret
 * @returns {Object} Decoded token payload
 */
export function verifyTestToken(token, secret = 'test-secret-key') {
  return jwt.verify(token, secret);
}

/**
 * Create a mock authenticated request function
 * @param {Object} request - Supertest request object
 * @param {string} token - Optional custom token
 * @returns {Object} Request object with auth header
 */
export function authenticatedRequest(request, token = null) {
  const authToken = token || generateTestToken();
  return {
    get: (path) => request.get(path).set('Authorization', createAuthHeader(authToken)),
    post: (path) => request.post(path).set('Authorization', createAuthHeader(authToken)),
    put: (path) => request.put(path).set('Authorization', createAuthHeader(authToken)),
    delete: (path) => request.delete(path).set('Authorization', createAuthHeader(authToken))
  };
}

/**
 * Common test assertions for API responses
 */
export const apiAssertions = {
  /**
   * Assert successful API response
   * @param {Object} response - Supertest response
   */
  success: (response) => {
    expect(response.status).to.be.within(200, 299);
    expect(response.body).to.be.an('object');
  },

  /**
   * Assert error response with specific status and message
   * @param {Object} response - Supertest response
   * @param {number} expectedStatus - Expected status code
   * @param {string} expectedMessage - Expected error message
   */
  error: (response, expectedStatus, expectedMessage) => {
    expect(response.status).to.equal(expectedStatus);
    expect(response.body).to.have.property('error');
    if (expectedMessage) {
      expect(response.body.error).to.equal(expectedMessage);
    }
  },

  /**
   * Assert unauthorized response
   * @param {Object} response - Supertest response
   */
  unauthorized: (response) => {
    expect(response.status).to.equal(401);
    expect(response.body.error).to.equal('Access denied');
  },

  /**
   * Assert bad request response
   * @param {Object} response - Supertest response
   * @param {string} expectedMessage - Expected error message
   */
  badRequest: (response, expectedMessage) => {
    expect(response.status).to.equal(400);
    expect(response.body).to.have.property('error');
    if (expectedMessage) {
      expect(response.body.error).to.equal(expectedMessage);
    }
  },

  /**
   * Assert rate limit response
   * @param {Object} response - Supertest response
   */
  rateLimited: (response) => {
    expect(response.status).to.equal(429);
    expect(response.headers).to.have.property('retry-after');
  },

  /**
   * Assert security headers are present
   * @param {Object} response - Supertest response
   */
  securityHeaders: (response) => {
    expect(response.headers).to.have.property('x-content-type-options');
    expect(response.headers).to.have.property('x-frame-options');
    expect(response.headers).to.have.property('x-xss-protection');
  },

  /**
   * Assert CORS headers are present
   * @param {Object} response - Supertest response
   */
  corsHeaders: (response) => {
    expect(response.headers).to.have.property('access-control-allow-origin');
  },

  /**
   * Assert lookup response structure
   * @param {Object} response - Supertest response
   * @param {string} email - Expected email in response
   */
  lookupResponse: (response, email) => {
    apiAssertions.success(response);
    expect(response.body).to.have.property('email', email);
    expect(response.body).to.have.property('found');
    expect(response.body).to.have.property('results');
    expect(response.body.results).to.be.an('array');
  },

  /**
   * Assert bulk lookup response structure
   * @param {Object} response - Supertest response
   * @param {Array} emails - Expected emails in response
   */
  bulkLookupResponse: (response, emails) => {
    apiAssertions.success(response);
    expect(response.body).to.have.property('results');
    expect(response.body.results).to.be.an('object');
    
    emails.forEach(email => {
      expect(response.body.results).to.have.property(email);
      expect(response.body.results[email]).to.be.an('array');
    });
  },

  /**
   * Assert health check response structure
   * @param {Object} response - Supertest response
   */
  healthResponse: (response) => {
    apiAssertions.success(response);
    expect(response.body).to.have.property('status');
    expect(response.body).to.have.property('timestamp');
    expect(response.body).to.have.property('sources');
    expect(response.body.sources).to.be.an('array');
    
    response.body.sources.forEach(source => {
      expect(source).to.have.property('name');
      expect(source).to.have.property('status');
    });
  }
};

/**
 * Sleep utility for testing rate limits
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate test email addresses
 * @param {number} count - Number of emails to generate
 * @param {string} domain - Email domain (default: example.com)
 * @returns {Array} Array of email addresses
 */
export function generateTestEmails(count, domain = 'example.com') {
  return Array(count).fill().map((_, i) => `test${i}@${domain}`);
}

/**
 * Create temporary test files for integration testing
 * @param {string} dir - Directory to create files in
 * @param {Object} files - Object with filename: content pairs
 * @returns {Promise} Promise that resolves when files are created
 */
export async function createTestFiles(dir, files) {
  const fs = await import('fs/promises');
  await fs.mkdir(dir, { recursive: true });
  
  for (const [filename, content] of Object.entries(files)) {
    const path = await import('path');
    await fs.writeFile(path.join(dir, filename), content);
  }
}

/**
 * Clean up temporary test files
 * @param {string} dir - Directory to remove
 * @returns {Promise} Promise that resolves when cleanup is complete
 */
export async function cleanupTestFiles(dir) {
  try {
    const fs = await import('fs/promises');
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
    console.warn(`Failed to cleanup test files: ${error.message}`);
  }
}
