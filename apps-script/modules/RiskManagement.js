/**
 * SmartQMS – RiskManagement.js
 * Module C: Risk Management (ISO 14971:2019)
 *
 * Implements a dynamic risk matrix linked to real NCR occurrence data.
 * RPN (Risk Priority Number) = Severity × Occurrence × Detectability
 * Each dimension is scored 1–5.
 *
 * Risk Alert: Automatically triggered when NCR occurrence for a device S/N
 * exceeds QMS_RISK_ALERT_THRESHOLD, forcing a Risk Management File review.
 *
 * ISO 14971:2019 – Risk Management for Medical Devices
 */

'use strict';

const RiskManagement = (() => {

  const RISK_ACCEPTABILITY = {
    LOW:    { maxRpn: 8,  label: 'Acceptable',           color: 'green'  },
    MEDIUM: { maxRpn: 40, label: 'ALARP – Review Required', color: 'orange' },
    HIGH:   { maxRpn: 125, label: 'Unacceptable',         color: 'red'    },
  };

  /**
   * Creates a new risk item in the risk register.
   * @param {{ hazard: string, hazardSituation: string, harm: string,
   *           severity: 1-5, occurrence: 1-5, detectability: 1-5,
   *           standardClauseIds?: number[], deviceType?: string }} input
   * @returns {{ riskId: number, rpn: number, acceptability: string }}
   */
  function createRiskItem({
    hazard, hazardSituation, harm,
    severity, occurrence, detectability,
    standardClauseIds = [], deviceType = null
  }) {
    Auth.requireRole('quality');
    const user = Auth.getCurrentUser();

    _validateScore('severity',     severity);
    _validateScore('occurrence',   occurrence);
    _validateScore('detectability', detectability);

    const rpn = severity * occurrence * detectability;
    const acceptability = _calculateAcceptability(rpn);

    const { insertId } = Database.execute(
      `INSERT INTO risk_items
         (hazard, hazard_situation, harm, severity, occurrence, detectability, rpn,
          acceptability, device_type, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, UTC_TIMESTAMP())`,
      [hazard, hazardSituation, harm, severity, occurrence, detectability, rpn, acceptability, deviceType, user.id]
    );

    standardClauseIds.forEach(clauseId => {
      Database.execute('INSERT INTO risk_clause_links (risk_id, clause_id) VALUES (?, ?)', [insertId, clauseId]);
    });

    AuditTrail.log({
      action: 'RISK_ITEM_CREATED', entityType: 'risk_item', entityId: insertId,
      newValue: { hazard, rpn, acceptability },
    });

    return { riskId: insertId, rpn, acceptability };
  }

  /**
   * Updates the occurrence score for a risk item based on real NCR data.
   * Called automatically by NCR.js when a new NCR is filed.
   */
  function updateOccurrenceFromNcr(riskId, newOccurrence) {
    Auth.requireRole('quality');
    const risk = _getById(riskId);

    const newRpn = risk.severity * newOccurrence * risk.detectability;
    const acceptability = _calculateAcceptability(newRpn);

    Database.execute(
      `UPDATE risk_items SET occurrence = ?, rpn = ?, acceptability = ?,
        updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [newOccurrence, newRpn, acceptability, riskId]
    );

    AuditTrail.log({
      action:     'RISK_OCCURRENCE_UPDATED', entityType: 'risk_item', entityId: riskId,
      oldValue:   { occurrence: risk.occurrence, rpn: risk.rpn, acceptability: risk.acceptability },
      newValue:   { occurrence: newOccurrence, rpn: newRpn, acceptability },
      note:       'Auto-updated from NCR data.',
    });

    if (acceptability === 'HIGH') {
      _sendRiskEscalationAlert(riskId, risk, newRpn);
    }

    return { riskId, rpn: newRpn, acceptability };
  }

  /**
   * Triggers a Risk Alert when NCR occurrence threshold is exceeded.
   * Creates a RISK_ALERT record and notifies the admin.
   */
  function triggerRiskAlert(deviceSN, openNcrCount) {
    // Note: this is called internally from NCR.js — no role check needed here,
    // but we still audit log the system-generated alert.
    const cfg = Config.get();

    Database.execute(
      `INSERT INTO risk_alerts (device_sn, open_ncr_count, triggered_at, resolved, created_at)
       VALUES (?, ?, UTC_TIMESTAMP(), 0, UTC_TIMESTAMP())`,
      [deviceSN, openNcrCount]
    );

    AuditTrail.log({
      action:     'RISK_ALERT_TRIGGERED', entityType: 'risk_alert', entityId: deviceSN,
      newValue:   { deviceSN, openNcrCount, threshold: cfg.qms.riskAlertThreshold },
      note:       'System-generated: NCR threshold exceeded.',
    });

    // Notify admin
    const subject = `⚠️ [${cfg.tenant.name}] RISK ALERT: Device ${deviceSN}`;
    const body = `RISK MANAGEMENT ALERT\n\nDevice S/N: ${deviceSN}\nOpen NCRs: ${openNcrCount} (threshold: ${cfg.qms.riskAlertThreshold})\n\nThe Risk Management File for this device requires immediate review.\n\nLog in to SmartQMS > Risk Management to review.`;
    GmailApp.sendEmail(cfg.tenant.adminEmail, subject, body);
  }

  /** Lists all risk items, optionally filtered by acceptability level. */
  function list({ acceptability = null, deviceType = null } = {}) {
    Auth.requireRole('employee');
    let sql = `
      SELECT r.*, u.name AS created_by_name
      FROM risk_items r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE 1=1`;
    const params = [];
    if (acceptability) { sql += ' AND r.acceptability = ?'; params.push(acceptability); }
    if (deviceType)    { sql += ' AND r.device_type = ?';   params.push(deviceType); }
    sql += ' ORDER BY r.rpn DESC';
    return Database.query(sql, params);
  }

  /** Returns a summary of risk alerts. */
  function listAlerts({ resolved = false } = {}) {
    Auth.requireRole('quality');
    return Database.query(
      'SELECT * FROM risk_alerts WHERE resolved = ? ORDER BY triggered_at DESC',
      [resolved ? 1 : 0]
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function _validateScore(name, value) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`[RiskManagement] '${name}' must be an integer between 1 and 5. Got: ${value}`);
    }
  }

  function _calculateAcceptability(rpn) {
    if (rpn <= RISK_ACCEPTABILITY.LOW.maxRpn)    return 'LOW';
    if (rpn <= RISK_ACCEPTABILITY.MEDIUM.maxRpn) return 'MEDIUM';
    return 'HIGH';
  }

  function _getById(riskId) {
    const rows = Database.query('SELECT * FROM risk_items WHERE id = ?', [riskId]);
    if (rows.length === 0) throw new Error(`[RiskManagement] Risk item ${riskId} not found.`);
    return rows[0];
  }

  function _sendRiskEscalationAlert(riskId, risk, newRpn) {
    const cfg = Config.get();
    const subject = `🔴 [${cfg.tenant.name}] Risk Escalated to UNACCEPTABLE: Risk #${riskId}`;
    const body = `Risk item has escalated to UNACCEPTABLE level.\n\nHazard: ${risk.hazard}\nHarm: ${risk.harm}\nNew RPN: ${newRpn}\n\nImmediate risk control measures are required.\n\nLog in to SmartQMS > Risk Management.`;
    GmailApp.sendEmail(cfg.tenant.adminEmail, subject, body);
  }

  return { createRiskItem, updateOccurrenceFromNcr, triggerRiskAlert, list, listAlerts, RISK_ACCEPTABILITY };
})();
