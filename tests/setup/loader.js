/**
 * SmartQMS – Module Loader for Tests
 *
 * Since Apps Script source files are IIFEs that execute in a shared global
 * scope (not ES modules), we must eval() each file to load it into the
 * current Node.js global context.
 *
 * Load order matters: dependencies must be loaded before the modules that
 * use them. Since all inter-module calls happen at FUNCTION CALL TIME
 * (not at IIFE definition time), forward references are safe — but we
 * still load core → modules → ai for clarity.
 *
 * Usage in test files:
 *   const { loadCore, loadModule, loadAi } = require('../setup/loader');
 *   loadCore();               // Config, Database, Auth, AuditTrail
 *   loadModule('NCR');        // loads apps-script/modules/NCR.js
 *   loadAi('GeminiClient');   // loads apps-script/ai/GeminiClient.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', 'apps-script');

function _loadFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  // Rewrite `const Foo = (() => { ... })();` to `global.Foo = (() => { ... })();`
  // so the IIFE result lands on the global object, mimicking Apps Script's shared
  // global scope. Matches top-level `const NAME = ` IIFE assignments only.
  // Rewrite ONLY top-level `const|let|var NAME = ...` to `global.NAME = ...`
  // Top-level means the declaration starts at column 0 (no leading whitespace).
  // This preserves closure-local variables inside IIFEs (which are indented).
  // The `m` flag makes ^ match start of each line.
  const globalised = code.replace(
    /^(?:const|let|var)\s+(\w+)\s*=/gm,
    (_match, name) => `global.${name} =`
  );
  const fn = new Function('global', globalised); // eslint-disable-line no-new-func
  fn(global);
}

function loadCore() {
  _loadFile(path.join(ROOT, 'core', 'Config.js'));
  _loadFile(path.join(ROOT, 'core', 'Database.js'));
  _loadFile(path.join(ROOT, 'core', 'Auth.js'));
  _loadFile(path.join(ROOT, 'core', 'AuditTrail.js'));
}

function loadModule(name) {
  _loadFile(path.join(ROOT, 'modules', `${name}.js`));
}

function loadAi(name) {
  _loadFile(path.join(ROOT, 'ai', `${name}.js`));
}

function loadAll() {
  loadCore();

  // Load AI before modules (modules use AI)
  loadAi('GeminiClient');
  loadAi('RootCauseAnalyzer');
  loadAi('SeverityClassifier');

  // Load Standards before modules (NCR uses RiskManagement, CAPA uses NCR)
  loadModule('Standards');
  loadModule('RiskManagement');
  loadModule('DocumentControl');
  loadModule('NCR');
  loadModule('CAPA');
  loadModule('Training');
  loadModule('Complaints');
}

module.exports = { loadCore, loadModule, loadAi, loadAll };
