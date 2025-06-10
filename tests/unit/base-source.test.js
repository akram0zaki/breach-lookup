/**
 * base-source.test.js
 * 
 * Unit tests for the base Source class
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import Source from '../../Source.js';

describe('Source Base Class', function() {
  let source;
  
  describe('Constructor', function() {
    it('should create instance of Source', function() {
      source = new Source();
      expect(source).to.be.instanceOf(Source);
    });
  });
  
  describe('Search Method', function() {
    it('should throw error when search method is not implemented', async function() {
      source = new Source();
      
      try {
        await source.search('test@example.com');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('search() not implemented');
      }
    });
  });
});
