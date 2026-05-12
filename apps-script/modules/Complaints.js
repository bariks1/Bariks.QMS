/**
 * SmartQMS – Complaints.js
 * Module E: Complaints & Vigilance
 *
 * Centralized logging of customer complaints with AI-assisted severity
 * classification. CRITICAL complaints auto-generate a vigilance report draft.
 *
 * ISO 13485:2016 §8.2.2 – Complaint Handling
 * EU MDR Article 87 / FDA 21 CFR Part 803 – MDR Reporting
 */

'use strict';

const Complaints = (() => {

  const STATUS   = { OPEN: 'OPEN', UNDER_REVIEW: 'UNDER_REVIEW', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED' };
  const SEVERITY = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

  /**
   * Logs a new customer complaint and triggers AI severity classification.
   * @param {{ customerName: string, description: string, deviceType: string,
   *           deviceSN?: string, contactEmail?: string }} input
   * @returns {{ complaintId: number, complaintNumber: string, aiClassification: Object }}
   */
  function logComplaint({ customerName, description, deviceType, deviceSN = null, contactEmail = null }) {
    Auth.requireRole('employee');
    const user = Auth.getCurrentUser();

    const complaintNumber = _generateComplaintNumber();

    const { insertId } = Database.execute(
      `INSERT INTO complaints
         (complaint_number, customer_name, description, device_type, device_sn,
          contact_email, status, reported_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, UTC_TIMESTAMP())`,
      [complaintNumber, customerName, description, deviceType, deviceSN, contactEmail, user.id]
    );

    AuditTrail.log({
      action: 'COMPLAINT_LOGGED', entityType: 'complaint', entityId: insertId,
      newValue: { complaintNumber, customerName, deviceType, deviceSN },
    });

    // AI severity classification
    const aiClassification = SeverityClassifier.classify({
      complaintId: insertId,
      description,
      deviceType,
      deviceSN,
    });

    // Store AI classification result
    Database.execute(
      `UPDATE complaints SET
         ai_severity = ?, ai_reporting_required = ?, ai_rationale = ?,
         severity = ?, updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [
        aiClassification.severity,
        aiClassification.reportingRequired ? 1 : 0,
        aiClassification.rationale,
        aiClassification.severity,  // Use AI severity as initial severity (human can override)
        insertId,
      ]
    );

    // Auto-generate vigilance draft for CRITICAL
    if (aiClassification.severity === SEVERITY.CRITICAL) {
      _generateVigilanceDraft(insertId, complaintNumber, aiClassification);
      _alertAdminCritical(insertId, complaintNumber, description, aiClassification);
    }

    return { complaintId: insertId, complaintNumber, aiClassification };
  }

  /**
   * Overrides the AI severity classification with a human decision.
   * Requires quality role and a justification.
   */
  function overrideSeverity({ complaintId, severity, justification }) {
    Auth.requireRole('quality');
    if (!Object.values(SEVERITY).includes(severity)) {
      throw new Error(`[Complaints] Invalid severity: '${severity}'. Must be one of: ${Object.values(SEVERITY).join(', ')}`);
    }

    const rows = Database.query('SELECT severity FROM complaints WHERE id = ?', [complaintId]);
    if (rows.length === 0) throw new Error(`[Complaints] Complaint ${complaintId} not found.`);

    Database.execute(
      'UPDATE complaints SET severity = ?, human_severity_override = 1, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [severity, complaintId]
    );

    AuditTrail.log({
      action: 'COMPLAINT_SEVERITY_OVERRIDDEN', entityType: 'complaint', entityId: complaintId,
      oldValue: { severity: rows[0].severity }, newValue: { severity },
      note: `Human override. Justification: ${justification}`,
    });
  }

  /** Closes a complaint with resolution details. */
  function resolve({ complaintId, resolutionSummary, eSignatureConfirm }) {
    Auth.requireRole('quality');
    if (!eSignatureConfirm) throw new Error('[Complaints] Electronic signature required to close complaint.');
    const user = Auth.getCurrentUser();

    const rows = Database.query('SELECT status FROM complaints WHERE id = ?', [complaintId]);
    if (rows.length === 0) throw new Error(`[Complaints] Complaint ${complaintId} not found.`);

    Database.execute(
      `UPDATE complaints SET status = 'CLOSED', resolution_summary = ?,
        closed_by = ?, closed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [resolutionSummary, user.id, complaintId]
    );

    AuditTrail.log({
      action: 'COMPLAINT_CLOSED', entityType: 'complaint', entityId: complaintId,
      oldValue: { status: rows[0].status }, newValue: { status: 'CLOSED' },
      note: `e-Signature: ${user.email}. ${resolutionSummary}`,
    });
  }

  function list({ status = null, severity = null, limit = 100 } = {}) {
    Auth.requireRole('employee');
    let sql = `
      SELECT c.*, u.name AS reported_by_name
      FROM complaints c
      LEFT JOIN users u ON c.reported_by = u.id
      WHERE 1=1`;
    const params = [];
    if (status)   { sql += ' AND c.status = ?';   params.push(status); }
    if (severity) { sql += ' AND c.severity = ?'; params.push(severity); }
    sql += ' ORDER BY c.created_at DESC LIMIT ?';
    params.push(limit);
    return Database.query(sql, params);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function _generateComplaintNumber() {
    const year = new Date().getFullYear();
    const rows = Database.query('SELECT COUNT(*) AS cnt FROM complaints WHERE YEAR(created_at) = ?', [year]);
    const seq = (rows[0].cnt || 0) + 1;
    return `CMP-${year}-${String(seq).padStart(4, '0')}`;
  }

  function _generateVigilanceDraft(complaintId, complaintNumber, classification) {
    const content = `VIGILANCE REPORT DRAFT – AUTO-GENERATED (AI DRAFT – REQUIRES HUMAN REVIEW)
==========================================================================
Complaint Number: ${complaintNumber}
AI Severity:      ${classification.severity}
Reporting Required: ${classification.reportingRequired ? 'YES' : 'NO'}
Applicable Regulations: ${(classification.reportingRegulations || []).join(', ')}

AI Rationale:
${classification.rationale}

Suggested Actions:
${(classification.suggestedActions || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}

==========================================================================
STATUS: DRAFT — MANDATORY HUMAN EXPERT REVIEW REQUIRED BEFORE SUBMISSION
==========================================================================`;

    Database.execute(
      'INSERT INTO vigilance_reports (complaint_id, content, status, created_at) VALUES (?, ?, \'DRAFT\', UTC_TIMESTAMP())',
      [complaintId, content]
    );
  }

  function _alertAdminCritical(complaintId, complaintNumber, description, classification) {
    const cfg = Config.get();
    const subject = `🚨 [${cfg.tenant.name}] CRITICAL COMPLAINT: ${complaintNumber}`;
    const body = `A CRITICAL severity complaint has been logged.\n\n` +
      `Complaint: ${complaintNumber}\nDescription: ${description}\n\n` +
      `AI Assessment: ${classification.rationale}\n` +
      `Regulatory Reporting: ${classification.reportingRequired ? '⚠️ LIKELY REQUIRED' : 'Not indicated'}\n\n` +
      `A Vigilance Report draft has been auto-generated. Log in to SmartQMS > Complaints to review.`;
    GmailApp.sendEmail(cfg.tenant.adminEmail, subject, body);
  }

  return { logComplaint, overrideSeverity, resolve, list, STATUS, SEVERITY };
})();
