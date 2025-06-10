/**
 * test-config.js
 * 
 * Test configuration and utilities for the breach lookup service tests.
 * Provides centralized configuration for unit and integration tests.
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const testConfig = {
  // Test timeouts
  timeout: {
    unit: 5000,         // 5 seconds for unit tests
    integration: 30000, // 30 seconds for integration tests
    database: 10000,    // 10 seconds for database operations
    api: 15000          // 15 seconds for API tests
  },
  
  // Test server configuration
  server: {
    port: 3001,
    jwtSecret: 'test-secret-key-for-testing-only',
    rateLimitWindow: 60000,
    rateLimitMax: 100
  },

  // Test paths
  paths: {
    fixtures: path.join(__dirname, '..', 'fixtures'),
    testData: path.join(__dirname, '..', 'fixtures', 'test-data'),
    mockFiles: path.join(__dirname, '..', 'fixtures', 'mock-files')
  },
  
  // Test data
  testEmails: [
    'test@example.com',
    'user@domain.org',
    'sample@test.net',
    'john.doe@example.com',
    'jane.smith@test.org',
    'admin@secure.net',
    'nonexistent@nowhere.com'
  ],
  
  // Environment variables
  env: {
    EMAIL_HASH_KEY: process.env.EMAIL_HASH_KEY,
    SHARD_DIRS: process.env.SHARD_DIRS,
    PLAINTEXT_DIR: process.env.PLAINTEXT_DIR,
    POSTGRES_CONNECTION_STRING: process.env.POSTGRES_CONNECTION_STRING,
    JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret',
    SMTP_HOST: process.env.SMTP_HOST,
    TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || 'test-turnstile-secret'
  },
  
  // Database configuration for tests
  testDatabase: {
    connectionString: process.env.TEST_POSTGRES_CONNECTION_STRING || 
                     'postgresql://test:test@localhost:5432/testdb',
    tableName: 'test_breaches',
    emailColumn: 'email_norm'
  },
  
  // Mock data for testing
  mockBreachData: [
    {
      email_norm: 'test@example.com',
      password: 'password123',
      source: 'TestBreach2020',
      is_hash: false,
      hash_type: 'plaintext'
    },
    {
      email_norm: 'user@domain.org',
      password: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
      source: 'TestBreach2021',
      is_hash: true,
      hash_type: 'sha256'
    }
  ]
};

/**
 * Check if environment is properly configured for testing
 */
export function checkTestEnvironment() {
  const issues = [];
  
  if (!testConfig.env.EMAIL_HASH_KEY) {
    issues.push('EMAIL_HASH_KEY not set - some tests may fail');
  }
  
  if (!testConfig.env.JWT_SECRET) {
    issues.push('JWT_SECRET not set - using test default');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Get available data sources based on environment configuration
 */
export function getAvailableDataSources() {
  const sources = [];
  
  if (testConfig.env.EMAIL_HASH_KEY && testConfig.env.SHARD_DIRS) {
    sources.push('ShardSource');
  }
  
  if (testConfig.env.PLAINTEXT_DIR) {
    sources.push('PlaintextDirSource');
  }
  
  if (testConfig.env.POSTGRES_CONNECTION_STRING) {
    sources.push('PostgresSource');
  }
  
  return sources;
}
