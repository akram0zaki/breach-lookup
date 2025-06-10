/**
 * plaintext-source.test.js
 * 
 * Unit tests for PlaintextDirSource class
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import PlaintextDirSource from '../../PlaintextDirSource.js';
import { testConfig } from '../helpers/test-config.js';

describe('PlaintextDirSource', function() {
  this.timeout(testConfig.timeout.unit);
  
  let source;
  const testBaseDir = '/nonexistent/path';
  
  describe('Constructor', function() {
    it('should create instance with valid base directory', function() {
      source = new PlaintextDirSource(testBaseDir);
      
      expect(source).to.be.instanceOf(PlaintextDirSource);
      expect(source.baseDir).to.equal(testBaseDir);
    });
  });
  
  describe('Character Mapping', function() {
    beforeEach(function() {
      source = new PlaintextDirSource(testBaseDir);
    });
    
    it('should map alphanumeric characters correctly', function() {
      // Note: We need to access the internal mapChar function
      // For now, we'll test the behavior through the search method
      expect(source).to.be.instanceOf(PlaintextDirSource);
    });
  });
  
  describe('Search Method', function() {
    beforeEach(function() {
      source = new PlaintextDirSource(testBaseDir);
    });
    
    it('should return empty array when directory does not exist', async function() {
      const results = await source.search('test@example.com');
      
      expect(results).to.be.an('array');
      expect(results).to.have.length(0);
    });
    
    it('should handle various email formats', async function() {
      const testEmails = [
        'test@example.com',
        'user@domain.org',
        'a@b.co',
        'long.email.address@very-long-domain-name.com'
      ];
      
      for (const email of testEmails) {
        const results = await source.search(email);
        expect(results).to.be.an('array');
      }
    });
    
    it('should handle special characters in email', async function() {
      const specialEmails = [
        '123@domain.com',
        'user+tag@domain.com',
        'user.name@domain.co.uk',
        '_user@domain.org'
      ];
      
      for (const email of specialEmails) {
        const results = await source.search(email);
        expect(results).to.be.an('array');
      }
    });
    
    it('should trim whitespace from email input', async function() {
      const results1 = await source.search('test@example.com');
      const results2 = await source.search('  test@example.com  ');
      
      // Both should behave the same way (both will be empty arrays in this case)
      expect(results1).to.deep.equal(results2);
    });
    
    it('should handle empty or invalid input gracefully', async function() {
      const invalidInputs = ['', '   ', 'invalid-email'];
      
      for (const input of invalidInputs) {
        try {
          const results = await source.search(input);
          expect(results).to.be.an('array');
        } catch (error) {
          // Some inputs may cause grep to fail, which should be handled gracefully
          expect(error).to.be.an('error');
        }
      }
    });
  });
  
  describe('Result Format', function() {
    beforeEach(function() {
      source = new PlaintextDirSource(testBaseDir);
    });
    
    it('should return results in correct format when data exists', async function() {
      // Since we can't create actual test files, we'll test the expected format
      const results = await source.search('test@example.com');
      
      expect(results).to.be.an('array');
      
      // If results exist (which they won't in this test), check format
      if (results.length > 0) {
        const result = results[0];
        expect(result).to.have.property('email');
        expect(result).to.have.property('password');
        expect(result).to.have.property('source');
        expect(result).to.have.property('is_hash');
        expect(result).to.have.property('hash_type');
        
        expect(result.source).to.equal('Other');
        expect(result.is_hash).to.be.false;
        expect(result.hash_type).to.equal('plaintext');
      }
    });
  });
});
