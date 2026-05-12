/**
 * SmartQMS – Standards.js
 * The Dynamic Standards Library Engine.
 *
 * Decouples regulatory requirements from individual documents.
 * Updates to a standard automatically propagate ("Ripple Effect") across
 * all linked documents, checklists, and risk items — flagging them for review.
 *
 * Supported standards seed data: ISO 13485, ISO 9001, ISO 14971, ISO 27001
 */

'use strict';

const Standards = (() => {

  /** Lists all standards in the library. */
  function listStandards() {
    Auth.requireRole('employee');
    return Database.query('SELECT * FROM standards ORDER BY name ASC');
  }

  /** Lists clauses for a standard, optionally filtered by parent clause. */
  function listClauses(standardId, parentClauseId = null) {
    Auth.requireRole('employee');
    let sql = 'SELECT * FROM standard_clauses WHERE standard_id = ?';
    const params = [standardId];
    if (parentClauseId !== null) {
      sql += ' AND parent_clause_id = ?';
      params.push(parentClauseId);
    } else {
      sql += ' AND parent_clause_id IS NULL';
    }
    sql += ' ORDER BY clause_number ASC';
    return Database.query(sql, params);
  }

  /**
   * Updates a standard's version and triggers the ripple effect.
   * All documents linked to any clause of this standard are flagged for review.
   * All risk items linked to any clause are flagged for reassessment.
   * @param {{ standardId: number, newVersion: string, changeDescription: string }} input
   * @returns {{ flaggedDocuments: number, flaggedRiskItems: number }}
   */
  function updateStandardVersion({ standardId, newVersion, changeDescription }) {
    Auth.requireRole('admin');
    const rows = Database.query('SELECT * FROM standards WHERE id = ?', [standardId]);
    if (rows.length === 0) throw new Error(`[Standards] Standard ${standardId} not found.`);
    const standard = rows[0];

    Database.transaction(() => {
      Database.execute(
        `UPDATE standards SET version = ?, change_description = ?,
          updated_at = UTC_TIMESTAMP() WHERE id = ?`,
        [newVersion, changeDescription, standardId]
      );
    });

    // Ripple effect: flag all linked documents
    const flaggedDocResult = Database.execute(
      `UPDATE documents d
       JOIN document_clause_links dcl ON d.id = dcl.document_id
       JOIN standard_clauses sc ON dcl.clause_id = sc.id
       SET d.needs_review = 1, d.review_reason = ?
       WHERE sc.standard_id = ? AND d.status = 'APPROVED'`,
      [`Standard updated: ${standard.name} → v${newVersion}. ${changeDescription}`, standardId]
    );

    // Ripple effect: flag all linked risk items
    const flaggedRiskResult = Database.execute(
      `UPDATE risk_items ri
       JOIN risk_clause_links rcl ON ri.id = rcl.risk_id
       JOIN standard_clauses sc ON rcl.clause_id = sc.id
       SET ri.needs_review = 1, ri.review_reason = ?
       WHERE sc.standard_id = ?`,
      [`Standard updated: ${standard.name} → v${newVersion}`, standardId]
    );

    AuditTrail.log({
      action: 'STANDARD_UPDATED', entityType: 'standard', entityId: standardId,
      oldValue: { version: standard.version },
      newValue: { version: newVersion, changeDescription },
      note: `Ripple: ${flaggedDocResult.affectedRows} docs, ${flaggedRiskResult.affectedRows} risk items flagged.`,
    });

    // Notify admin of ripple effect
    _notifyRippleEffect(standard, newVersion, flaggedDocResult.affectedRows, flaggedRiskResult.affectedRows);

    return {
      flaggedDocuments: flaggedDocResult.affectedRows,
      flaggedRiskItems: flaggedRiskResult.affectedRows,
    };
  }

  /** Lists all documents that need review due to standard updates. */
  function listDocumentsNeedingReview() {
    Auth.requireRole('quality');
    return Database.query(
      "SELECT id, title, sop_number, review_reason FROM documents WHERE needs_review = 1 AND status = 'APPROVED'"
    );
  }

  /** Marks a document as reviewed after a standard update. */
  function acknowledgeDocumentReview(documentId) {
    Auth.requireRole('reviewer');
    Database.execute(
      'UPDATE documents SET needs_review = 0, review_reason = NULL WHERE id = ?', [documentId]
    );
    AuditTrail.log({
      action: 'STANDARD_REVIEW_ACKNOWLEDGED', entityType: 'document', entityId: documentId,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function _notifyRippleEffect(standard, newVersion, docCount, riskCount) {
    const cfg = Config.get();
    const subject = `[${cfg.tenant.name}] Standard Updated: ${standard.name} → v${newVersion}`;
    const body = `The regulatory standard "${standard.name}" has been updated to version ${newVersion}.\n\n` +
      `Ripple Effect Summary:\n` +
      `• ${docCount} approved documents have been flagged for review\n` +
      `• ${riskCount} risk items have been flagged for reassessment\n\n` +
      `Log in to SmartQMS > Standards to review all flagged items.`;
    GmailApp.sendEmail(cfg.tenant.adminEmail, subject, body);
  }

  return { listStandards, listClauses, updateStandardVersion, listDocumentsNeedingReview, acknowledgeDocumentReview };
})();
