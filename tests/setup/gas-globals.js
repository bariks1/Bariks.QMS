/**
 * SmartQMS – Gas Globals Setup
 * Injects mock implementations of all Google Apps Script built-in services
 * into Node's `global` object BEFORE any test runs.
 *
 * This allows source files (loaded via eval in loader.js) to reference
 * these globals just as they would inside the real Apps Script runtime.
 *
 * Only services actually used by SmartQMS are mocked here.
 * Mocks are reset between tests via beforeEach in individual test files.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// PropertiesService
// ─────────────────────────────────────────────────────────────────────────────
global.PropertiesService = {
  _store: {},
  getScriptProperties() {
    return {
      getProperty:    (k)    => global.PropertiesService._store[k] ?? null,
      getProperties:  ()     => ({ ...global.PropertiesService._store }),
      setProperty:    (k, v) => { global.PropertiesService._store[k] = v; },
      setProperties:  (obj)  => { Object.assign(global.PropertiesService._store, obj); },
      deleteProperty: (k)    => { delete global.PropertiesService._store[k]; },
    };
  },
  _reset(props = {}) { this._store = props; },
};

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────
global.Session = {
  _email: 'test.user@example.com',
  getActiveUser() { return { getEmail: () => global.Session._email }; },
  _setEmail(email) { this._email = email; },
};

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────
global.Logger = {
  _logs: [],
  log(msg)   { this._logs.push({ level: 'LOG',   msg }); },
  warn(msg)  { this._logs.push({ level: 'WARN',  msg }); },
  error(msg) { this._logs.push({ level: 'ERROR', msg }); },
  _reset()   { this._logs = []; },
};

// ─────────────────────────────────────────────────────────────────────────────
// console (Apps Script wraps this)
// ─────────────────────────────────────────────────────────────────────────────
global.console = {
  log:   (...a) => {},
  warn:  (...a) => {},
  error: (...a) => {},
  info:  (...a) => {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Jdbc (Database connections)
// ─────────────────────────────────────────────────────────────────────────────
global.Jdbc = {
  _mockConnection: null,
  getConnection(_url, _user, _pass) {
    if (!global.Jdbc._mockConnection) {
      throw new Error('[Jdbc Mock] No mock connection set. Use Jdbc._setMockConnection()');
    }
    return global.Jdbc._mockConnection;
  },
  _setMockConnection(conn) { this._mockConnection = conn; },
  _reset() { this._mockConnection = null; },
};

// ─────────────────────────────────────────────────────────────────────────────
// DriveApp (document storage)
// ─────────────────────────────────────────────────────────────────────────────
global.DriveApp = {
  _files:   {},
  _folders: {},
  getFolderById(id)  { return global.DriveApp._folders[id] || global.DriveApp._makeFolderMock(id); },
  getFileById(id)    { return global.DriveApp._files[id]   || global.DriveApp._makeFileMock(id); },
  getRootFolder()    { return global.DriveApp._makeFolderMock('root'); },
  _makeFolderMock(id) {
    return {
      id,
      _children: [],
      _files: [],
      getFoldersByName(name) {
        const found = this._children.filter(f => f.name === name);
        let i = 0;
        return { hasNext: () => i < found.length, next: () => found[i++] };
      },
      createFolder(name) {
        const f = global.DriveApp._makeFolderMock(`${id}/${name}`);
        f.name = name;
        this._children.push(f);
        return f;
      },
      addFile(file)    { this._files.push(file); },
      removeFile(file) { this._files = this._files.filter(f => f !== file); },
    };
  },
  _makeFileMock(id) {
    return {
      id, name: `file-${id}`,
      getParents()  { return { hasNext: () => false, next: () => null }; },
      setName(name) { this.name = name; },
      getId()       { return this.id; },
    };
  },
  _reset() { this._files = {}; this._folders = {}; },
};

// ─────────────────────────────────────────────────────────────────────────────
// DocumentApp
// ─────────────────────────────────────────────────────────────────────────────
global.DocumentApp = {
  _idCounter: 1,
  create(title) {
    const id = `doc-${this._idCounter++}`;
    const fileEntry = global.DriveApp._makeFileMock(id);
    fileEntry.name = title;
    global.DriveApp._files[id] = fileEntry;
    return { getId: () => id, getUrl: () => `https://docs.google.com/document/d/${id}/edit` };
  },
  _reset() { this._idCounter = 1; },
};

// ─────────────────────────────────────────────────────────────────────────────
// FormApp
// ─────────────────────────────────────────────────────────────────────────────
global.FormApp = {
  _idCounter: 1,
  create(title) {
    const id = `form-${this._idCounter++}`;
    const items = [];
    return {
      getId:                       () => id,
      getPublishedUrl:             () => `https://docs.google.com/forms/d/${id}/viewform`,
      setIsQuiz:                   (_v) => {},
      setCollectEmail:             (_v) => {},
      setLimitOneResponsePerUser:  (_v) => {},
      setConfirmationMessage:      (_m) => {},
      getItems:                    () => items,
      addMultipleChoiceItem() {
        const choices = [];
        const item = {
          setTitle:    (_t) => item,
          setRequired: (_r) => item,
          setPoints:   (_p) => item,
          createChoice: (text, isCorrect) => ({ text, isCorrect }),
          setChoices:   (c) => { choices.push(...c); return item; },
          _choices: choices,
        };
        items.push(item);
        return item;
      },
    };
  },
  _reset() { this._idCounter = 1; },
};

// ─────────────────────────────────────────────────────────────────────────────
// GmailApp / MailApp
// ─────────────────────────────────────────────────────────────────────────────
global.GmailApp = {
  _sent: [],
  sendEmail(to, subject, body, opts) {
    this._sent.push({ to, subject, body, opts });
  },
  _reset() { this._sent = []; },
};
global.MailApp = {
  _sent: [],
  sendEmail(opts) { this._sent.push(opts); },
  getRemainingDailyQuota: () => 100,
  _reset() { this._sent = []; },
};

// ─────────────────────────────────────────────────────────────────────────────
// UrlFetchApp (Gemini API calls)
// ─────────────────────────────────────────────────────────────────────────────
global.UrlFetchApp = {
  _responses: {},
  _defaultResponse: null,
  fetch(url, _opts) {
    const mock = this._responses[url] || this._defaultResponse;
    if (!mock) throw new Error(`[UrlFetchApp Mock] No mock set for URL: ${url.substring(0, 80)}`);
    return {
      getResponseCode:  () => mock.code    ?? 200,
      getContentText:   () => typeof mock.body === 'string' ? mock.body : JSON.stringify(mock.body),
    };
  },
  _setResponse(url, body, code = 200) { this._responses[url] = { body, code }; },
  _setDefaultResponse(body, code = 200) { this._defaultResponse = { body, code }; },
  _reset() { this._responses = {}; this._defaultResponse = null; },
};

// ─────────────────────────────────────────────────────────────────────────────
// ContentService
// ─────────────────────────────────────────────────────────────────────────────
global.ContentService = {
  MimeType: { JSON: 'application/json', TEXT: 'text/plain', HTML: 'text/html' },
  createTextOutput(text) {
    let _type = 'text/plain';
    return {
      setMimeType: (t) => { _type = t; return this; },
      getContent:  () => text,
      getMimeType: () => _type,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HtmlService
// ─────────────────────────────────────────────────────────────────────────────
global.HtmlService = {
  XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
  createTemplateFromFile: (file) => ({
    evaluate: () => ({
      setTitle:         (_t) => this,
      setXFrameOptionsMode: (_m) => this,
      addMetaTag:       (_n, _c) => this,
    }),
  }),
  createHtmlOutputFromFile: (file) => ({ getContent: () => `<div data-file="${file}"></div>` }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
global.Utilities = {
  newBlob: (data, mimeType) => ({ data, mimeType }),
};

// ─────────────────────────────────────────────────────────────────────────────
// MimeType constants
// ─────────────────────────────────────────────────────────────────────────────
global.MimeType = {
  GOOGLE_DOCS: 'application/vnd.google-apps.document',
  HTML:        'text/html',
  PLAIN_TEXT:  'text/plain',
};

// ─────────────────────────────────────────────────────────────────────────────
// Global reset helper — call in beforeEach for a clean slate
// ─────────────────────────────────────────────────────────────────────────────
global._resetAllMocks = () => {
  global.PropertiesService._reset();
  global.Session._setEmail('test.user@example.com');
  global.Logger._reset();
  global.Jdbc._reset();
  global.DriveApp._reset();
  global.DocumentApp._reset();
  global.FormApp._reset();
  global.GmailApp._reset();
  global.MailApp._reset();
  global.UrlFetchApp._reset();
  // Reset module caches if they exist (loaded after this file, so guard with ?)
  if (global.Config)        global.Config.reset();
  if (global.Auth)          global.Auth.reset();
  if (global.GeminiClient)  global.GeminiClient.reset();
};
