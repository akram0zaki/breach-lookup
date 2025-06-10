import { describe, it } from 'mocha';
import { expect } from 'chai';

describe('Debug Test', function() {
  it('should work', function() {
    console.log('Test is running!');
    expect(true).to.be.true;
  });
});
