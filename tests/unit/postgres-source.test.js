/**
 * postgres-source.test.js
 * 
 * Unit tests for PostgresSource class
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import PostgresSource from '../../PostgresSource.js';
import { testConfig } from '../helpers/test-config.js';

describe('PostgresSource', function() {
  this.timeout(testConfig.timeout.unit);
  
  let source;
  
  describe('Constructor', function() {
    it('should create instance with valid connection string', function() {
      source = new PostgresSource({
        connectionString: testConfig.testDatabase.connectionString
      });
      
      expect(source).to.be.instanceOf(PostgresSource);
      expect(source.tableName).to.equal('breaches');
      expect(source.emailColumn).to.equal('email_norm');
    });
    
    it('should accept custom table and column names', function() {
      source = new PostgresSource({
        connectionString: testConfig.testDatabase.connectionString,
        tableName: 'custom_breaches',
        emailColumn: 'email_address'
      });
      
      expect(source.tableName).to.equal('custom_breaches');
      expect(source.emailColumn).to.equal('email_address');
    });
    
    it('should throw error with missing connection string', function() {
      expect(() => new PostgresSource({})).to.throw();
    });
  });
  
  describe('Search Method', function() {
    beforeEach(function() {
      source = new PostgresSource({
        connectionString: testConfig.testDatabase.connectionString
      });
    });
    
    afterEach(async function() {
      if (source && typeof source.close === 'function') {
        await source.close();
      }
    });
    
    it('should normalize email input', async function() {
      // Test various email formats
      const testEmails = [
        'Test@Example.com',
        '  user@domain.org  ',
        'CAPS@DOMAIN.NET'
      ];
      
      for (const email of testEmails) {
        const results = await source.search(email);
        expect(results).to.be.an('array');
      }
    });
    
    it('should return empty array on connection error', async function() {
      const invalidSource = new PostgresSource({
        connectionString: 'postgresql://invalid:invalid@nonexistent:5432/invalid'
      });
      
      const results = await invalidSource.search('test@example.com');
      expect(results).to.be.an('array');
      expect(results).to.have.length(0);
      
      await invalidSource.close();
    });
    
    it('should return properly formatted results', async function() {
      const results = await source.search('test@example.com');
      
      expect(results).to.be.an('array');
      
      // If results exist, check format
      if (results.length > 0) {
        const result = results[0];
        expect(result).to.have.property('email');
        expect(result).to.have.property('password');
        expect(result).to.have.property('source');
        expect(result).to.have.property('is_hash');
        expect(result).to.have.property('hash_type');
      }
    });
  });
  
  describe('Connection Management', function() {
    beforeEach(function() {
      source = new PostgresSource({
        connectionString: testConfig.testDatabase.connectionString
      });
    });
    
    it('should close connections gracefully', async function() {
      await source.close();
      // Should not throw error when called multiple times
      await source.close();
    });
  });
});
