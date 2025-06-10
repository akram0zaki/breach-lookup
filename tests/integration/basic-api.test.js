import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import supertest from 'supertest';

describe('Basic API Tests', function() {
  let request;

  it('should run a basic test', function() {
    expect(true).to.be.true;
  });

  it('should be able to import supertest', function() {
    expect(supertest).to.be.a('function');
  });
});
