/**
 * SmartQMS – NCR.js
 * Module B (Part 1): Non-Conformance Reports
 *
 * NCR lifecycle: OPEN → UNDER_INVESTIGATION → CAPA_LINKED → CLOSED
 * Every NCR is linked to a Device Serial Number for full traceability.
 *
 * ISO 13485:2016 §8.5.2 – Corrective Action
 * ISO 13485:2016 §8.5.3 – Preventive Action
 */

'use strict';

const NCR = (() => {

  const STATUS = {
    OPEN:                'OPEN',
    UNDER_INVESTIGATION: 'UNDER_INVESTIGATION',
    CAPA_LINKED:         'CAPA_LINKED',
    CLOSED:              'CLOSED',
  };

  /**
   * Reports a new Non-Conformance.
   * @param {{ deviceSN: string, description: string, detectedAt?: string,
   *           location?: string, standardClauseIds?: number[] }} input
   * @returns {{ ncrId: number }}
   */
  function report({ deviceSN, description, detectedAt = null, location = '', standardClauseIds = [] }) {
    Auth.requireRole('employee');
    const user = Auth.getCurrentUser();

    const ncrNumber = _generateNcrNumber();

    const { insertId } = Database.execute(
      `INSERT INTO ncrs
         (ncr_number, device_sn, description, detected_at, location, status, reported_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, UTC_TIMESTAMP())`,
      [ncrNumber, deviceSN, description, detectedAt || null, location, user.id]
    );

    standardClauseIds.forEach(clauseId => {
      Database.execute('INSERT INTO ncr_clause_links (ncr_id, clause_id) VALUES (?, ?)', [insertId, clauseId]);
    });

    AuditTrail.log({
      action: 'NCR_REPORTED', entityType: 'ncr', entityId: insertId,
      newValue: { ncrNumber, deviceSN, status: 'OPEN' },
    });

    // Check if this triggers a Risk Alert
    _checkRiskAlertThreshold(deviceSN);

    // Notify quality team
    _notifyQualityTeam(insertId, ncrNumber, deviceSN, description);

    return { ncrId: insertId, ncrNumber };
  }

  /**
   * Starts investigation on an NCR.
   */
  function startInvestigation(ncrId, assignedToUserId = null) {
    Auth.requireRole('quality');
    _assertStatus(ncrId, STATUS.OPEN);

    Database.execute(
      `UPDATE ncrs SET status = 'UNDER_INVESTIGATION', assigned_to = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [assignedToUserId, ncrId]
    );

    AuditTrail.log({
      action: 'NCR_INVESTIGATION_STARTED', entityType: 'ncr', entityId: ncrId,
      oldValue: { status: 'OPEN' }, newValue: { status: 'UNDER_INVESTIGATION' },
    });
  }

  /**
   * Closes an NCR once all linked CAPAs are verified effective.
   */
  function close(ncrId, closureNote = '') {
    Auth.requireRole('quality');
    const ncr = _getById(ncrId);
    if (ncr.status === STATUS.CLOSED) throw new Error(`[NCR] NCR ${ncrId} is already closed.`);

    Database.execute(
      "UPDATE ncrs SET status = 'CLOSED', closed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?",
      [ncrId]
    );

    AuditTrail.log({
      action: 'NCR_CLOSED', entityType: 'ncr', entityId: ncrId,
      oldValue: { status: ncr.status }, newValue: { status: 'CLOSED' },
      note: closureNote,
    });
  }

  /** Gets an NCR by ID with linked CAPAs and standard clauses. */
  function getById(ncrId) {
    Auth.requireRole('employee');
    return _getById(ncrId);
  }

  /** Lists NCRs with optional filters. */
  function list({ status = null, deviceSN = null, limit = 100, offset = 0 } = {}) {
    Auth.requireRole('employee');
    let sql = `
      SELECT n.*, u.name AS reported_by_name
      FROM ncrs n
      LEFT JOIN users u ON n.reported_by = u.id
      WHERE 1=1`;
    const params = [];
    if (status)   { sql += ' AND n.status = ?';     params.push(status); }
    if (deviceSN) { sql += ' AND n.device_sn LIKE ?'; params.push(`%${deviceSN}%`); }
    sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return Database.query(sql, params);
  }

  /** Returns all NCRs for a device S/N (used by AI root cause analysis). */
  function getHistoryForDevice(deviceSN) {
    Auth.requireRole('quality');
    return Database.query(
      'SELECT id, ncr_number, description, status, created_at FROM ncrs WHERE device_sn = ? ORDER BY created_at DESC LIMIT 20',
      [deviceSN]
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function _generateNcrNumber() {
    const year = new Date().getFullYear();
    const rows = Database.query(
      'SELECT COUNT(*) AS cnt FROM ncrs WHERE YEAR(created_at) = ?', [year]
    );
    const seq = (rows[0].cnt || 0) + 1;
    return `NCR-${year}-${String(seq).padStart(4, '0')}`;
  }

  function _assertStatus(ncrId, requiredStatus) {
    const ncr = _getById(ncrId);
    if (ncr.status !== requiredStatus) {
      throw new Error(`[NCR] NCR ${ncrId} must be '${requiredStatus}', but is '${ncr.status}'.`);
    }
    return ncr;
  }

  function _getById(ncrId) {
    const rows = Database.query('SELECT * FROM ncrs WHERE id = ?', [ncrId]);
    if (rows.length === 0) throw new Error(`[NCR] NCR ${ncrId} not found.`);
    return rows[0];
  }

  function _checkRiskAlertThreshold(deviceSN) {
    const threshold = Config.get().qms.riskAlertThreshold;
    const rows = Database.query(
      "SELECT COUNT(*) AS cnt FROM ncrs WHERE device_sn = ? AND status != 'CLOSED'", [deviceSN]
    );
    const openCount = rows[0].cnt || 0;
    if (openCount >= threshold) {
      RiskManagement.triggerRiskAlert(deviceSN, openCount);
    }
  }

  function _notifyQualityTeam(ncrId, ncrNumber, deviceSN, description) {
    const qualityUsers = Database.query(
      "SELECT email FROM users WHERE role IN ('quality', 'admin') AND is_active = 1"
    );
    if (qualityUsers.length === 0) return;
    const cfg = Config.get();
    const subject = `[${cfg.tenant.name}] New NCR Filed: ${ncrNumber}`;
    const body = `A new Non-Conformance Report has been filed.\n\nNCR: ${ncrNumber}\nDevice S/N: ${deviceSN}\nDescription: ${description}\n\nLog in to SmartQMS to begin investigation.`;
    qualityUsers.forEach(u => GmailApp.sendEmail(u.email, subject, body));
  }

  return { report, startInvestigation, close, getById, list, getHistoryForDevice, STATUS };
})();
