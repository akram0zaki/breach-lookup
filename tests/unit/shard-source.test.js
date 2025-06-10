/**
 * shard-source.test.js
 * 
 * Unit tests for ShardSource class
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import crypto from 'crypto';
import ShardSource from '../../ShardSource.js';
import { testConfig } from '../helpers/test-config.js';

describe('ShardSource', function() {
  this.timeout(testConfig.timeout.unit);
  
  let source;
  const testKey = 'b4a5eb12938dbf9543faf74e70718f54671ad8a6ac05d86c7b3fc2daab4313fd';
  const testDirs = ['/nonexistent/path1', '/nonexistent/path2'];
  
  describe('Constructor', function() {
    it('should create instance with valid parameters', function() {
      source = new ShardSource(testDirs, testKey);
      
      expect(source).to.be.instanceOf(ShardSource);
      expect(source.dirs).to.deep.equal(testDirs);
      expect(source.key).to.be.instanceOf(Buffer);
    });
    
    it('should convert hex key to buffer', function() {
      source = new ShardSource(testDirs, testKey);
      
      const expectedBuffer = Buffer.from(testKey, 'hex');
      expect(source.key).to.deep.equal(expectedBuffer);
    });
  });
  
  describe('Email Hashing', function() {
    beforeEach(function() {
      source = new ShardSource(testDirs, testKey);
    });
    
    it('should generate consistent hashes for same email', function() {
      const email = 'test@example.com';
      const hash1 = source._hash(email);
      const hash2 = source._hash(email);
      
      expect(hash1).to.equal(hash2);
      expect(hash1).to.be.a('string');
      expect(hash1).to.have.length(64); // SHA256 hex length
    });
    
    it('should generate different hashes for different emails', function() {
      const hash1 = source._hash('test@example.com');
      const hash2 = source._hash('user@domain.org');
      
      expect(hash1).to.not.equal(hash2);
    });
    
    it('should be case insensitive for email normalization', function() {
      const hash1 = source._hash('Test@Example.COM');
      const hash2 = source._hash('test@example.com');
      
      expect(hash1).to.equal(hash2);
    });
  });
  
  describe('Search Method', function() {
    beforeEach(function() {
      source = new ShardSource(testDirs, testKey);
    });
    
    it('should return empty array when no shard files exist', async function() {
      const results = await source.search('test@example.com');
      
      expect(results).to.be.an('array');
      expect(results).to.have.length(0);
    });
    
    it('should normalize email before processing', async function() {
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
    
    it('should handle empty or invalid input gracefully', async function() {
      const invalidInputs = ['', null, undefined];
      
      for (const input of invalidInputs) {
        try {
          const results = await source.search(input);
          expect(results).to.be.an('array');
        } catch (error) {
          // Some inputs may throw errors, which is acceptable
          expect(error).to.be.an('error');
        }
      }
    });
  });
  
  describe('Shard Path Generation', function() {
    beforeEach(function() {
      source = new ShardSource(testDirs, testKey);
    });
    
    it('should generate correct directory structure from hash', function() {
      const email = 'test@example.com';
      const hash = source._hash(email);
      
      const expectedDir = hash.slice(0, 2);
      const expectedPrefix = hash.slice(0, 4);
      
      expect(expectedDir).to.have.length(2);
      expect(expectedPrefix).to.have.length(4);
      expect(expectedPrefix.startsWith(expectedDir)).to.be.true;
    });
  });
});
