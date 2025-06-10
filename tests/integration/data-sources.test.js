#!/usr/bin/env node

/**
 * data-sources.test.js
 * 
 * Integration tests for all data sources in the breach lookup service.
 */

import 'dotenv/config';
import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import ShardSource from '../../ShardSource.js';
import PlaintextDirSource from '../../PlaintextDirSource.js';
import PostgresSource from '../../PostgresSource.js';
import { testConfig, checkTestEnvironment, getAvailableDataSources } from '../helpers/test-config.js';

describe('Breach Lookup Service - Data Sources Integration', function() {
  this.timeout(testConfig.timeout.integration);
  
  let sources = [];
  const testEmail = testConfig.testEmails[0];
  
  before(function() {
    // Check test environment
    const envCheck = checkTestEnvironment();
    if (!envCheck.isValid) {
      console.warn('Test environment issues:', envCheck.issues);
    }
    
    // Initialize sources based on environment
    const { env } = testConfig;
    
    if (env.EMAIL_HASH_KEY && env.SHARD_DIRS) {
      const dirs = env.SHARD_DIRS.split(',').map(s => s.trim()).filter(Boolean);
      if (dirs.length) {
        sources.push({
          name: 'ShardSource',
          source: new ShardSource(dirs, env.EMAIL_HASH_KEY)
        });
      }
    }
    
    if (env.PLAINTEXT_DIR) {
      sources.push({
        name: 'PlaintextDirSource',
        source: new PlaintextDirSource(env.PLAINTEXT_DIR)
      });
    }
    
    if (env.POSTGRES_CONNECTION_STRING) {
      sources.push({
        name: 'PostgresSource',
        source: new PostgresSource({ connectionString: env.POSTGRES_CONNECTION_STRING })
      });
    }
  });
  
  after(async function() {
    // Cleanup connections
    for (const { name, source } of sources) {
      if (name === 'PostgresSource' && typeof source.close === 'function') {
        await source.close();
      }
    }
  });
  
  describe('Environment Configuration', function() {
    it('should have test configuration available', function() {
      expect(testConfig).to.be.an('object');
      expect(testConfig.testEmails).to.be.an('array');
      expect(testConfig.testEmails.length).to.be.greaterThan(0);
    });
    
    it('should have at least one data source configured', function() {
      const availableSources = getAvailableDataSources();
      expect(availableSources.length).to.be.greaterThan(0, 
        'No data sources configured. Please set up at least one source in .env');
      expect(sources.length).to.be.greaterThan(0);
    });
  });
  
  describe('Data Source Search Operations', function() {
    it('should test all configured sources', function() {
      expect(sources.length).to.be.greaterThan(0);
    });
    
    sources.forEach(({ name, source }) => {
      describe(`${name} Integration`, function() {
        it('should search without throwing errors', async function() {
          const results = await source.search(testEmail);
          expect(results).to.be.an('array');
        });
        
        it('should return consistent results for same email', async function() {
          const results1 = await source.search(testEmail);
          const results2 = await source.search(testEmail);
          expect(results1).to.deep.equal(results2);
        });
        
        it('should handle email normalization', async function() {
          const normalizedResults = await source.search(testEmail.toLowerCase());
          const uppercaseResults = await source.search(testEmail.toUpperCase());
          expect(normalizedResults).to.deep.equal(uppercaseResults);
        });
        
        if (name === 'PostgresSource') {
          it('should handle database connection gracefully', async function() {
            // This test will pass even if DB is unreachable due to error handling
            const results = await source.search(testEmail);
            expect(results).to.be.an('array');
          });
        }
      });
    });
  });
  
  describe('Performance Tests', function() {
    it('should complete searches within reasonable time', async function() {
      this.timeout(testConfig.timeout.integration);
      
      for (const { name, source } of sources) {
        const startTime = Date.now();
        await source.search(testEmail);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Most searches should complete within 10 seconds
        expect(duration).to.be.lessThan(10000, 
          `${name} search took ${duration}ms, which is too slow`);
      }
    });
  });
});
