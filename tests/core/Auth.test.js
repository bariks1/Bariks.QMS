/**
 * SmartQMS – Auth.test.js
 * Tests: role hierarchy enforcement, getCurrentUser, error messages
 */

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

/** Registers a user in the DB mock AND sets the session email. */
function asUser(email, role, isActive = 1) {
  Session._setEmail(email);
  Auth.reset(); // clear cached user so next getCurrentUser() re-queries
  db.setQueryResult('is_active FROM users WHERE email', [
    { id: 1, email, name: 'Test User', role, is_active: isActive }
  ]);
}

describe('Auth', () => {
  describe('getCurrentUser()', () => {
    test('returns user record for the active session email', () => {
      asUser('alice@example.com', 'quality');
      const user = Auth.getCurrentUser();
      expect(user.email).toBe('alice@example.com');
      expect(user.role).toBe('quality');
    });

    test('throws if user email is not found in database (empty result)', () => {
      Session._setEmail('ghost@example.com');
      // DB mock has no result registered → returns [] → should throw
      expect(() => Auth.getCurrentUser()).toThrow('User not found in QMS');
    });

    test('throws if user account is deactivated', () => {
      asUser('disabled@example.com', 'employee', 0);
      expect(() => Auth.getCurrentUser()).toThrow('Account is deactivated');
    });
  });

  describe('requireRole()', () => {
    test('admin can access admin-level routes', () => {
      asUser('admin@example.com', 'admin');
      expect(() => Auth.requireRole('admin')).not.toThrow();
    });

    test('admin can access quality-level routes (higher privilege)', () => {
      asUser('admin@example.com', 'admin');
      expect(() => Auth.requireRole('quality')).not.toThrow();
    });

    test('admin can access employee-level routes', () => {
      asUser('admin@example.com', 'admin');
      expect(() => Auth.requireRole('employee')).not.toThrow();
    });

    test('employee cannot access quality-level routes', () => {
      asUser('emp@example.com', 'employee');
      expect(() => Auth.requireRole('quality')).toThrow('[Auth] Access denied');
    });

    test('employee cannot access reviewer-level routes', () => {
      asUser('emp@example.com', 'employee');
      expect(() => Auth.requireRole('reviewer')).toThrow('[Auth] Access denied');
    });

    test('reviewer cannot access quality-level routes', () => {
      asUser('rev@example.com', 'reviewer');
      expect(() => Auth.requireRole('quality')).toThrow('[Auth] Access denied');
    });

    test('reviewer can access employee-level routes', () => {
      asUser('rev@example.com', 'reviewer');
      expect(() => Auth.requireRole('employee')).not.toThrow();
    });

    test('throws on unknown role name', () => {
      asUser('quality@example.com', 'quality');
      expect(() => Auth.requireRole('superadmin')).toThrow("Unknown role requested: 'superadmin'");
    });
  });

  describe('hasRole()', () => {
    test('returns true when user has sufficient role', () => {
      asUser('admin@example.com', 'admin');
      expect(Auth.hasRole('quality')).toBe(true);
    });

    test('returns false when user lacks sufficient role', () => {
      asUser('emp@example.com', 'employee');
      expect(Auth.hasRole('admin')).toBe(false);
    });
  });
});
