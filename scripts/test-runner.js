#!/usr/bin/env node

/**
 * test-runner.js
 * 
 * Enhanced test runner for the breach lookup service.
 * Provides utilities for running different types of tests with proper setup.
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    log(`Running: ${command} ${args.join(' ')}`, 'cyan');
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function checkEnvironment() {
  log('Checking test environment...', 'yellow');
  
  // Check if required test dependencies are installed
  const requiredDeps = ['mocha', 'chai', 'supertest', 'nyc'];
  const missingDeps = [];
  
  for (const dep of requiredDeps) {
    try {
      require.resolve(dep);
    } catch (error) {
      missingDeps.push(dep);
    }
  }
    if (missingDeps.length > 0) {
    log(`Missing test dependencies: ${missingDeps.join(', ')}`, 'red');
    log('Run: npm install', 'yellow');
    process.exit(1);
  }
  
  log('Environment check passed ✓', 'green');
}

async function runTests(type = 'all') {
  try {
    await checkEnvironment();
    
    switch (type) {
      case 'unit':
        log('Running unit tests...', 'bright');
        await runCommand('npm', ['run', 'test:unit']);
        break;
        
      case 'integration':
        log('Running integration tests...', 'bright');
        await runCommand('npm', ['run', 'test:integration']);
        break;
        
      case 'coverage':
        log('Running tests with coverage...', 'bright');
        await runCommand('npm', ['run', 'test:coverage']);
        break;
        
      case 'all':
      default:
        log('Running all tests...', 'bright');
        await runCommand('npm', ['test']);
        break;
    }
    
    log('Tests completed successfully ✓', 'green');
  } catch (error) {
    log(`Tests failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const testType = args[0] || 'all';

// Validate test type
const validTypes = ['all', 'unit', 'integration', 'coverage'];
if (!validTypes.includes(testType)) {  log(`Invalid test type: ${testType}`, 'red');
  log(`Valid types: ${validTypes.join(', ')}`, 'yellow');
  process.exit(1);
}

// Run tests
runTests(testType).catch((error) => {
  log(`Test runner error: ${error.message}`, 'red');
  process.exit(1);
});
