'use strict';

const { loadCore }     = require('../setup/loader');
const { createDbMock } = require('../setup/db-mock');

loadCore();

const VALID_PROPS = {
  QMS_DB_HOST: '1.2.3.4', QMS_DB_NAME: 'smartqms',
  QMS_DB_USER: 'qms_app', QMS_DB_PASS: 'secret',
  QMS_GEMINI_API_KEY: 'key', QMS_DRIVE_ROOT_ID: 'folder',
  QMS_ADMIN_EMAIL: 'admin@example.com',
};

let db;

beforeEach(() => {
  _resetAllMocks();
  Auth.reset();
  PropertiesService._reset({ ...VALID_PROPS });
  db = createDbMock();
  Jdbc._setMockConnection(db.connection);
});

test('alice login', () => {
  Session._setEmail('alice@example.com');
  Auth.reset();
  db.setQueryResult('is_active FROM users WHERE email', [
    { id: 1, email: 'alice@example.com', name: 'Alice', role: 'quality', is_active: 1 }
  ]);
  const u = Auth.getCurrentUser();
  expect(u.email).toBe('alice@example.com');
});

test('ghost should throw', () => {
  // No db result set — empty result
  Session._setEmail('ghost@example.com');
  // Do NOT call Auth.reset() — rely on beforeEach
  expect(() => Auth.getCurrentUser()).toThrow('User not found in QMS');
});

test('employee role check', () => {
  Session._setEmail('emp@example.com');
  Auth.reset();
  db.setQueryResult('is_active FROM users WHERE email', [
    { id: 2, email: 'emp@example.com', name: 'Emp', role: 'employee', is_active: 1 }
  ]);
  expect(() => Auth.requireRole('quality')).toThrow('[Auth] Access denied');
});
