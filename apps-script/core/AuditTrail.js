/**
 * SmartQMS – AuditTrail.js
 * Append-only audit logger. Every state-changing operation in every module
 * MUST call AuditTrail.log() — this is non-negotiable for FDA 21 CFR Part 11
 * and ISO 13485 compliance.
 *
 * The audit_log table has NO UPDATE/DELETE grants for the app user — records
 * are truly immutable once written.
 *
 * Usage:
 *   AuditTrail.log({
 *     action:     'DOCUMENT_APPROVED',
 *     entityType: 'document',
 *     entityId:   42,
 *     oldValue:   { status: 'REVIEW' },
 *     newValue:   { status: 'APPROVED' },
 *   });
 */

'use strict';

const AuditTrail = (() => {

  /**
   * @param {{ action: string, entityType: string, entityId: number|string,
   *           oldValue?: Object, newValue?: Object, note?: string }} entry
   */
  function log({ action, entityType, entityId, oldValue = null, newValue = null, note = null }) {
    if (!action || !entityType) {
      throw new Error('[AuditTrail] action and entityType are required.');
    }

    const user = Auth.getCurrentUser();

    Database.execute(
      `INSERT INTO audit_log
         (user_id, user_email, action, entity_type, entity_id, old_value, new_value, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        user.id,
        user.email,
        action,
        entityType,
        entityId !== undefined ? String(entityId) : null,
        oldValue  !== null ? JSON.stringify(oldValue)  : null,
        newValue  !== null ? JSON.stringify(newValue)  : null,
        note,
      ]
    );
  }

  /**
   * Retrieves audit history for a specific entity.
   * @param {string} entityType
   * @param {number|string} entityId
   * @returns {Object[]}
   */
  function getHistory(entityType, entityId) {
    Auth.requireRole('quality');
    return Database.query(
      `SELECT id, user_email, action, old_value, new_value, note, created_at
       FROM audit_log
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at ASC`,
      [entityType, String(entityId)]
    );
  }

  /**
   * Full audit log export (admin only).
   * @param {{ fromDate?: string, toDate?: string, entityType?: string }} filters
   * @returns {Object[]}
   */
  function export_(filters = {}) {
    Auth.requireRole('admin');
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (filters.fromDate)   { sql += ' AND created_at >= ?'; params.push(filters.fromDate); }
    if (filters.toDate)     { sql += ' AND created_at <= ?'; params.push(filters.toDate); }
    if (filters.entityType) { sql += ' AND entity_type = ?'; params.push(filters.entityType); }
    sql += ' ORDER BY created_at DESC LIMIT 10000';
    return Database.query(sql, params);
  }

  return { log, getHistory, export: export_ };
})();
