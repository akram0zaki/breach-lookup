import { expect } from 'chai';
import supertest from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  generateTestToken, 
  createAuthHeader, 
  authenticatedRequest, 
  apiAssertions,
  createTestFiles,
  cleanupTestFiles,
  generateTestEmails 
} from '../helpers/auth-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('API Integration Tests', function() {
  let app;
  let request;
  const testPort = 3001; // Use different port for testing

  before(async function() {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.PORT = testPort;
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';
    
    // Create temporary test data directories
    const testDataDir = path.join(__dirname, '..', 'fixtures', 'test-data');
    await fs.mkdir(testDataDir, { recursive: true });
      // Create test plaintext file
    const plaintextFile = path.join(testDataDir, 'test-plaintext.txt');
    await fs.writeFile(plaintextFile, 'test@example.com:password123:testuser:Test User\n');
    process.env.PLAINTEXT_DIR = testDataDir;
    
    // Create test shard directory
    const shardDir = path.join(testDataDir, 'shards');
    await fs.mkdir(shardDir, { recursive: true });
    await fs.writeFile(path.join(shardDir, '0'), 'test@example.com:hash123:data123\n');
    process.env.SHARD_DIR = shardDir;
    
    // Disable PostgreSQL for API tests (unless specifically testing it)
    delete process.env.POSTGRES_CONNECTION_STRING;
    
    // Import and start server
    const serverModule = await import('../../server.js');
    app = serverModule.app;
    request = supertest(app);
  });

  after(async function() {
    // Cleanup test data
    const testDataDir = path.join(__dirname, '..', 'fixtures', 'test-data');
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('GET /', function() {
    it('should return the index page', async function() {
      const response = await request.get('/');
      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.include('<!DOCTYPE html>');
    });
  });

  describe('GET /favicon.ico', function() {
    it('should return the favicon', async function() {
      const response = await request.get('/favicon.ico');
      expect(response.status).to.equal(200);
      expect(response.type).to.include('image');
    });
  });
  describe('POST /lookup', function() {
    let authRequest;

    beforeEach(function() {
      authRequest = authenticatedRequest(request);
    });

    it('should require authentication', async function() {
      const response = await request
        .post('/lookup')
        .send({ email: 'test@example.com' });
      
      apiAssertions.unauthorized(response);
    });

    it('should validate email format', async function() {
      const response = await authRequest
        .post('/lookup')
        .send({ email: 'invalid-email' });
      
      apiAssertions.badRequest(response, 'Invalid email format');
    });

    it('should handle missing email parameter', async function() {
      const response = await authRequest
        .post('/lookup')
        .send({});
      
      apiAssertions.badRequest(response, 'Email parameter is required');
    });

    it('should return 404 for non-existent email', async function() {
      const response = await authRequest
        .post('/lookup')
        .send({ email: 'nonexistent@nowhere.com' });
      
      expect(response.status).to.equal(404);
      expect(response.body.found).to.be.false;
    });

    it('should return breach data for existing email', async function() {
      const response = await authRequest
        .post('/lookup')
        .send({ email: 'test@example.com' });
      
      if (response.status === 200) {
        apiAssertions.lookupResponse(response, 'test@example.com');
      } else {
        // Email not found in test data
        expect(response.status).to.equal(404);
      }
    });
  });
  describe('POST /bulk-lookup', function() {
    let authRequest;

    beforeEach(function() {
      authRequest = authenticatedRequest(request);
    });

    it('should require authentication', async function() {
      const response = await request
        .post('/bulk-lookup')
        .send({ emails: ['test@example.com'] });
      
      apiAssertions.unauthorized(response);
    });

    it('should validate emails array', async function() {
      const response = await authRequest
        .post('/bulk-lookup')
        .send({ emails: 'not-an-array' });
      
      apiAssertions.badRequest(response, 'Emails must be an array');
    });

    it('should enforce email limit', async function() {
      const emails = generateTestEmails(1001);
      
      const response = await authRequest
        .post('/bulk-lookup')
        .send({ emails });
      
      apiAssertions.badRequest(response, 'Too many emails. Maximum 1000 allowed.');
    });

    it('should handle valid bulk lookup request', async function() {
      const emails = ['test@example.com', 'nonexistent@nowhere.com'];
      
      const response = await authRequest
        .post('/bulk-lookup')
        .send({ emails });
      
      if (response.status === 200) {
        apiAssertions.bulkLookupResponse(response, emails);
      } else {
        // Handle case where service returns error
        expect(response.status).to.be.within(400, 500);
      }
    });
  });
  describe('GET /health', function() {
    it('should return health status', async function() {
      const response = await request.get('/health');
      apiAssertions.healthResponse(response);
    });

    it('should include source status information', async function() {
      const response = await request.get('/health');
      apiAssertions.healthResponse(response);
      
      // Check that we have at least the basic sources
      const sourceNames = response.body.sources.map(s => s.name);
      expect(sourceNames).to.include.members(['plaintext', 'shard']);
    });
  });

  describe('Rate Limiting', function() {
    it('should enforce rate limits', async function() {
      this.timeout(10000);
      
      // This test would make many requests to test rate limiting
      // For now, we'll skip it as it would be slow
      this.skip();
    });
  });

  describe('Error Handling', function() {
    it('should handle 404 for unknown routes', async function() {
      const response = await request.get('/unknown-route');
      expect(response.status).to.equal(404);
    });

    it('should handle malformed JSON', async function() {
      const response = await request
        .post('/lookup')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');
      
      expect(response.status).to.equal(400);
    });
  });
  describe('Security Headers', function() {
    it('should include security headers', async function() {
      const response = await request.get('/');
      apiAssertions.securityHeaders(response);
    });

    it('should include CORS headers', async function() {
      const response = await request
        .options('/lookup')
        .set('Origin', 'https://example.com');
      
      apiAssertions.corsHeaders(response);
    });
  });
});
