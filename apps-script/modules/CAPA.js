/**
 * SmartQMS – CAPA.js
 * Module B (Part 2): Corrective and Preventive Actions
 *
 * CAPA lifecycle: DRAFT → OPEN → IN_PROGRESS → VERIFICATION → CLOSED
 * AI-generated root cause drafts are flagged and cannot be approved without
 * human sign-off (HITL protocol enforced).
 *
 * ISO 13485:2016 §8.5.2 – Corrective Action
 * ISO 13485:2016 §8.5.3 – Preventive Action
 */

'use strict';

const CAPA = (() => {

  const STATUS = {
    DRAFT:        'DRAFT',
    OPEN:         'OPEN',
    IN_PROGRESS:  'IN_PROGRESS',
    VERIFICATION: 'VERIFICATION',
    CLOSED:       'CLOSED',
  };

  /**
   * Creates a CAPA linked to an NCR.
   * Optionally triggers AI root cause analysis (returns draft, HITL required).
   * @param {{ ncrId: number, type: 'CORRECTIVE'|'PREVENTIVE', useAiDraft?: boolean }} input
   * @returns {{ capaId: number, aiDraft?: Object }}
   */
  function create({ ncrId, type = 'CORRECTIVE', useAiDraft = false }) {
    Auth.requireRole('quality');
    const user = Auth.getCurrentUser();

    // Validate NCR exists
    const ncrRows = Database.query('SELECT * FROM ncrs WHERE id = ?', [ncrId]);
    if (ncrRows.length === 0) throw new Error(`[CAPA] NCR ${ncrId} not found.`);
    const ncr = ncrRows[0];

    const capaNumber = _generateCapaNumber();

    const { insertId } = Database.execute(
      `INSERT INTO capas
         (capa_number, ncr_id, type, status, created_by, ai_generated, created_at)
       VALUES (?, ?, ?, 'DRAFT', ?, 0, UTC_TIMESTAMP())`,
      [capaNumber, ncrId, type, user.id]
    );

    // Update NCR status
    Database.execute(
      "UPDATE ncrs SET status = 'CAPA_LINKED', updated_at = UTC_TIMESTAMP() WHERE id = ?",
      [ncrId]
    );

    AuditTrail.log({
      action: 'CAPA_CREATED', entityType: 'capa', entityId: insertId,
      newValue: { capaNumber, ncrId, type, status: 'DRAFT' },
    });

    let aiDraft = null;
    if (useAiDraft) {
      const history = NCR.getHistoryForDevice(ncr.device_sn);
      aiDraft = RootCauseAnalyzer.analyze({
        ncrId,
        description: ncr.description,
        deviceSN:    ncr.device_sn,
        pastNcrs:    history,
      });

      // Store AI draft in CAPA record
      Database.execute(
        'UPDATE capas SET root_cause_draft = ?, ai_generated = 1 WHERE id = ?',
        [JSON.stringify(aiDraft), insertId]
      );
    }

    return { capaId: insertId, capaNumber, aiDraft };
  }

  /**
   * Sets the root cause and actions on a CAPA (human-authored or AI-reviewed).
   * If the CAPA had an AI draft, requires explicit human confirmation.
   */
  function setRootCause({ capaId, rootCause, actions, humanReviewedAi = false }) {
    Auth.requireRole('quality');
    const capa = _getById(capaId);

    if (capa.ai_generated && !humanReviewedAi) {
      throw new Error('[CAPA] This CAPA has an AI-generated draft. Set humanReviewedAi=true to confirm human review.');
    }

    Database.execute(
      `UPDATE capas SET root_cause = ?, actions = ?, status = 'OPEN',
        updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [rootCause, JSON.stringify(actions), capaId]
    );

    AuditTrail.log({
      action: 'CAPA_ROOT_CAUSE_SET', entityType: 'capa', entityId: capaId,
      oldValue: { status: capa.status }, newValue: { status: 'OPEN', rootCause },
      note: capa.ai_generated ? 'AI draft reviewed and confirmed by human expert.' : null,
    });
  }

  /** Moves CAPA to IN_PROGRESS with a due date. */
  function startImplementation(capaId, dueDate) {
    Auth.requireRole('quality');
    _assertStatus(capaId, STATUS.OPEN);

    Database.execute(
      "UPDATE capas SET status = 'IN_PROGRESS', due_date = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?",
      [dueDate, capaId]
    );

    AuditTrail.log({
      action: 'CAPA_IMPLEMENTATION_STARTED', entityType: 'capa', entityId: capaId,
      newValue: { status: 'IN_PROGRESS', dueDate },
    });
  }

  /** Submits implementation for effectiveness verification. */
  function submitForVerification(capaId, implementationSummary) {
    Auth.requireRole('quality');
    _assertStatus(capaId, STATUS.IN_PROGRESS);

    Database.execute(
      `UPDATE capas SET status = 'VERIFICATION', implementation_summary = ?,
        updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [implementationSummary, capaId]
    );

    AuditTrail.log({
      action: 'CAPA_SUBMITTED_FOR_VERIFICATION', entityType: 'capa', entityId: capaId,
      newValue: { status: 'VERIFICATION' },
    });
  }

  /** Closes CAPA after effectiveness verified. */
  function close({ capaId, effectivenessSummary, eSignatureConfirm }) {
    Auth.requireRole('reviewer');
    if (!eSignatureConfirm) throw new Error('[CAPA] Electronic signature required to close CAPA.');
    _assertStatus(capaId, STATUS.VERIFICATION);
    const user = Auth.getCurrentUser();

    Database.execute(
      `UPDATE capas SET status = 'CLOSED', effectiveness_summary = ?,
        closed_by = ?, closed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [effectivenessSummary, user.id, capaId]
    );

    AuditTrail.log({
      action: 'CAPA_CLOSED', entityType: 'capa', entityId: capaId,
      newValue: { status: 'CLOSED' },
      note: `e-Signature: ${user.email}. ${effectivenessSummary}`,
    });
  }

  function list({ status = null, ncrId = null } = {}) {
    Auth.requireRole('employee');
    let sql = `
      SELECT c.*, u.name AS created_by_name, n.ncr_number, n.device_sn
      FROM capas c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN ncrs n ON c.ncr_id = n.id
      WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    if (ncrId)  { sql += ' AND c.ncr_id = ?'; params.push(ncrId); }
    sql += ' ORDER BY c.created_at DESC';
    return Database.query(sql, params);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function _generateCapaNumber() {
    const year = new Date().getFullYear();
    const rows = Database.query('SELECT COUNT(*) AS cnt FROM capas WHERE YEAR(created_at) = ?', [year]);
    const seq = (rows[0].cnt || 0) + 1;
    return `CAPA-${year}-${String(seq).padStart(4, '0')}`;
  }

  function _assertStatus(capaId, requiredStatus) {
    const capa = _getById(capaId);
    if (capa.status !== requiredStatus) {
      throw new Error(`[CAPA] CAPA ${capaId} must be '${requiredStatus}', but is '${capa.status}'.`);
    }
    return capa;
  }

  function _getById(capaId) {
    const rows = Database.query('SELECT * FROM capas WHERE id = ?', [capaId]);
    if (rows.length === 0) throw new Error(`[CAPA] CAPA ${capaId} not found.`);
    return rows[0];
  }

  return { create, setRootCause, startImplementation, submitForVerification, close, list, STATUS };
})();
