#!/usr/bin/env node

/**
 * test-postgres.js
 * 
 * Simple test script to verify PostgreSQL source connectivity and basic functionality.
 */

import 'dotenv/config';
import PostgresSource from '../PostgresSource.js';

async function testPostgresSource() {
  const { POSTGRES_CONNECTION_STRING } = process.env;
  
  if (!POSTGRES_CONNECTION_STRING) {
    console.error('ERROR: POSTGRES_CONNECTION_STRING not set in .env');
    process.exit(1);
  }

  console.log('Testing PostgreSQL source...');
  console.log('Connection string:', POSTGRES_CONNECTION_STRING.replace(/:[^:]*@/, ':***@'));

  const postgresSource = new PostgresSource({
    connectionString: POSTGRES_CONNECTION_STRING
  });

  try {
    // Test with a dummy email to check connectivity
    console.log('\nTesting connectivity...');
    const results = await postgresSource.search('test@example.com');
    console.log(`✓ PostgreSQL connection successful`);
    console.log(`Found ${results.length} records for test@example.com`);
    
    if (results.length > 0) {
      console.log('Sample result:', JSON.stringify(results[0], null, 2));
    }

  } catch (error) {
    console.error('✗ PostgreSQL connection failed:', error.message);
  } finally {
    // Clean up
    try {
      await postgresSource.close();
      console.log('✓ PostgreSQL connection closed');
    } catch (err) {
      console.error('Error closing connection:', err.message);
    }
  }
}

testPostgresSource().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
