/**
 * SmartQMS – Syntax Test
 * Jest wrapper around the syntax checker so it appears in the test report.
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

describe('Syntax – apps-script/**/*.js', () => {
  const files = getAllJsFiles(APPS_SCRIPT_DIR);

  test('at least one .js file exists', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = path.relative(APPS_SCRIPT_DIR, file);
    test(`${rel} has valid syntax`, () => {
      expect(() => {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      }).not.toThrow();
    });
  }
});
