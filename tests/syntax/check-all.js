/**
 * SmartQMS – Syntax Check
 * Runs `node --check` on every .js file in apps-script/.
 * This is the first line of defence: catches parse errors without
 * needing a real Apps Script deployment.
 *
 * Run:  npm run syntax
 *       OR as part of the test suite: npm test (syntax.test.js is included)
 */

'use strict';

const { execFileSync } = require('child_process');
const fs               = require('fs');
const path             = require('path');

const APPS_SCRIPT_DIR = path.resolve(__dirname, '..', '..', 'apps-script');

function getAllJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const files = getAllJsFiles(APPS_SCRIPT_DIR);

let passed = 0;
let failed = 0;

for (const file of files) {
  const rel = path.relative(APPS_SCRIPT_DIR, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`  ✅  ${rel}`);
    passed++;
  } catch (err) {
    const msg = err.stderr?.toString() || err.message;
    console.error(`  ❌  ${rel}`);
    console.error(`       ${msg.trim().split('\n')[0]}`);
    failed++;
  }
}

console.log('');
console.log(`Syntax check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
