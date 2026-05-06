/**
 * SmartQMS – Auth.js
 * Role-Based Access Control (RBAC) enforcement.
 *
 * Roles (in order of privilege):
 *   admin         – Full system access (QMS Manager / Regulatory Manager)
 *   quality       – Create/manage NCRs, CAPAs, Risk items
 *   reviewer      – Approve documents
 *   employee      – Read documents, complete training, file complaints
 *
 * Usage:
 *   Auth.requireRole('quality');   // throws if current user lacks the role
 *   const user = Auth.getCurrentUser();
 */

'use strict';

const ROLE_HIERARCHY = ['employee', 'reviewer', 'quality', 'admin'];

const Auth = (() => {

  let _currentUser = null;

  /** Returns the full user record for the currently authenticated Google user. */
  function getCurrentUser() {
    if (_currentUser) return _currentUser;

    const email = Session.getActiveUser().getEmail();
    if (!email) throw new Error('[Auth] Could not determine user email. Ensure webapp runs as USER_ACCESSING.');

    const rows = Database.query(
      'SELECT id, email, name, role, is_active FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      throw new Error(`[Auth] User not found in QMS: ${email}. Contact your QMS Administrator.`);
    }

    const user = rows[0];
    if (!user.is_active) {
      throw new Error(`[Auth] Account is deactivated: ${email}.`);
    }

    _currentUser = user;
    return _currentUser;
  }

  /**
   * Asserts the current user has at least the required role.
   * Throws a descriptive error if access is denied.
   * @param {string} requiredRole
   */
  function requireRole(requiredRole) {
    const user = getCurrentUser();
    const userLevel     = ROLE_HIERARCHY.indexOf(user.role);
    const requiredLevel = ROLE_HIERARCHY.indexOf(requiredRole);

    if (requiredLevel === -1) {
      throw new Error(`[Auth] Unknown role requested: '${requiredRole}'.`);
    }
    if (userLevel < requiredLevel) {
      throw new Error(
        `[Auth] Access denied. '${user.email}' has role '${user.role}', but '${requiredRole}' or higher is required.`
      );
    }
  }

  /** Returns true if the current user has at least the given role (non-throwing). */
  function hasRole(requiredRole) {
    try {
      requireRole(requiredRole);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Clears cached user (for testing). */
  function reset() { _currentUser = null; }

  return { getCurrentUser, requireRole, hasRole, reset };
})();
