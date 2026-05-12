/**
 * SmartQMS – DocumentControl.js
 * Module A: Document Control & SOPs
 *
 * Document lifecycle: DRAFT → REVIEW → APPROVED → OBSOLETE
 * All documents are stored in Google Drive under the tenant's QMS root folder.
 * Physical files: /QMS Root/Documents/Draft/ | /Active/ | /Archive/
 *
 * ISO 13485:2016 §4.2 – Document Control
 */

'use strict';

const DocumentControl = (() => {

  const STATUS = { DRAFT: 'DRAFT', REVIEW: 'REVIEW', APPROVED: 'APPROVED', OBSOLETE: 'OBSOLETE' };

  // ─────────────────────────────────────────────────────────────────────────────
  // Drive folder helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function _getDriveFolders() {
    const rootId = Config.get().drive.rootFolderId;
    const root = DriveApp.getFolderById(rootId);

    function _getOrCreate(parent, name) {
      const it = parent.getFoldersByName(name);
      return it.hasNext() ? it.next() : parent.createFolder(name);
    }

    const docs = _getOrCreate(root, 'Documents');
    return {
      draft:    _getOrCreate(docs, 'Draft'),
      active:   _getOrCreate(docs, 'Active'),
      archive:  _getOrCreate(docs, 'Archive'),
    };
  }

  function _moveFileTo(fileId, targetFolder) {
    const file = DriveApp.getFileById(fileId);
    file.getParents().next()?.removeFile(file);
    targetFolder.addFile(file);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a new document record and a Google Doc in the Draft folder.
   * @param {{ title: string, sopNumber: string, standardClauseIds: number[], description?: string }} input
   * @returns {{ documentId: number, driveFileId: string }}
   */
  function createDocument({ title, sopNumber, standardClauseIds = [], description = '' }) {
    Auth.requireRole('quality');
    const user = Auth.getCurrentUser();
    const folders = _getDriveFolders();

    // Create Google Doc
    const doc = DocumentApp.create(`[DRAFT] ${sopNumber} – ${title}`);
    const file = DriveApp.getFileById(doc.getId());
    folders.draft.addFile(file);
    DriveApp.getRootFolder().removeFile(file); // Remove from My Drive root

    const { insertId } = Database.execute(
      `INSERT INTO documents (title, sop_number, description, status, drive_file_id, created_by, version)
       VALUES (?, ?, ?, 'DRAFT', ?, ?, 1)`,
      [title, sopNumber, description, doc.getId(), user.id]
    );

    // Link to standard clauses
    standardClauseIds.forEach(clauseId => {
      Database.execute(
        'INSERT INTO document_clause_links (document_id, clause_id) VALUES (?, ?)',
        [insertId, clauseId]
      );
    });

    AuditTrail.log({
      action: 'DOCUMENT_CREATED', entityType: 'document', entityId: insertId,
      newValue: { sopNumber, title, status: 'DRAFT', driveFileId: doc.getId() },
    });

    return { documentId: insertId, driveFileId: doc.getId() };
  }

  /**
   * Submits a DRAFT document for review.
   */
  function submitForReview(documentId) {
    Auth.requireRole('quality');
    const doc = _assertDocument(documentId, STATUS.DRAFT);

    Database.execute(
      "UPDATE documents SET status = 'REVIEW', updated_at = UTC_TIMESTAMP() WHERE id = ?",
      [documentId]
    );

    AuditTrail.log({
      action: 'DOCUMENT_SUBMITTED_FOR_REVIEW', entityType: 'document', entityId: documentId,
      oldValue: { status: 'DRAFT' }, newValue: { status: 'REVIEW' },
    });

    _notifyReviewers(doc);
  }

  /**
   * Approves a document under REVIEW. Moves Drive file to Active folder.
   * @param {{ documentId: number, eSignatureConfirm: boolean, comments?: string }} input
   */
  function approve({ documentId, eSignatureConfirm, comments = '' }) {
    Auth.requireRole('reviewer');
    if (!eSignatureConfirm) throw new Error('[DocumentControl] Electronic signature confirmation is required.');

    const doc = _assertDocument(documentId, STATUS.REVIEW);
    const user = Auth.getCurrentUser();
    const folders = _getDriveFolders();

    Database.transaction(() => {
      // Increment version, set approved
      const newVersion = (doc.version || 1) + 1;
      Database.execute(
        `UPDATE documents SET status = 'APPROVED', version = ?, approved_by = ?,
          approved_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?`,
        [newVersion, user.id, documentId]
      );

      // Log approval record
      Database.execute(
        `INSERT INTO document_approvals (document_id, approved_by, version, comments, approved_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
        [documentId, user.id, newVersion, comments]
      );

      // Move drive file
      _moveFileTo(doc.drive_file_id, folders.active);

      // Rename file to remove [DRAFT] prefix
      DriveApp.getFileById(doc.drive_file_id).setName(`${doc.sop_number} – ${doc.title} (v${newVersion})`);
    });

    AuditTrail.log({
      action: 'DOCUMENT_APPROVED', entityType: 'document', entityId: documentId,
      oldValue: { status: 'REVIEW' }, newValue: { status: 'APPROVED' },
      note: `e-Signature by ${user.email}. ${comments}`,
    });

    _notifyAllUsersOfNewVersion(doc);
  }

  /**
   * Marks an approved document as obsolete. Moves to Archive.
   */
  function obsolete(documentId, reason = '') {
    Auth.requireRole('admin');
    const doc = _assertDocument(documentId, STATUS.APPROVED);
    const folders = _getDriveFolders();

    Database.execute(
      "UPDATE documents SET status = 'OBSOLETE', updated_at = UTC_TIMESTAMP() WHERE id = ?",
      [documentId]
    );
    _moveFileTo(doc.drive_file_id, folders.archive);

    AuditTrail.log({
      action: 'DOCUMENT_OBSOLETED', entityType: 'document', entityId: documentId,
      oldValue: { status: 'APPROVED' }, newValue: { status: 'OBSOLETE' },
      note: reason,
    });
  }

  /** Lists documents, optionally filtered by status. */
  function list({ status = null, sopNumber = null } = {}) {
    Auth.requireRole('employee');
    let sql = 'SELECT d.*, u.name AS created_by_name FROM documents d LEFT JOIN users u ON d.created_by = u.id WHERE 1=1';
    const params = [];
    if (status)    { sql += ' AND d.status = ?';      params.push(status); }
    if (sopNumber) { sql += ' AND d.sop_number LIKE ?'; params.push(`%${sopNumber}%`); }
    sql += ' ORDER BY d.sop_number ASC';
    return Database.query(sql, params);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function _assertDocument(documentId, requiredStatus) {
    const rows = Database.query('SELECT * FROM documents WHERE id = ?', [documentId]);
    if (rows.length === 0) throw new Error(`[DocumentControl] Document ${documentId} not found.`);
    const doc = rows[0];
    if (doc.status !== requiredStatus) {
      throw new Error(`[DocumentControl] Document ${documentId} must be in '${requiredStatus}' status, but is '${doc.status}'.`);
    }
    return doc;
  }

  function _notifyReviewers(doc) {
    const reviewers = Database.query(
      "SELECT email FROM users WHERE role IN ('reviewer', 'admin') AND is_active = 1"
    );
    if (reviewers.length === 0) return;

    const cfg = Config.get();
    const subject = `[${cfg.tenant.name}] Document Ready for Review: ${doc.sop_number}`;
    const body = `Document "${doc.title}" (${doc.sop_number}) has been submitted for review.\n\nPlease log in to SmartQMS to review and approve.`;
    reviewers.forEach(r => GmailApp.sendEmail(r.email, subject, body));
  }

  function _notifyAllUsersOfNewVersion(doc) {
    const users = Database.query("SELECT email FROM users WHERE is_active = 1");
    if (users.length === 0) return;

    const cfg = Config.get();
    const subject = `[${cfg.tenant.name}] Updated Document: ${doc.sop_number}`;
    const body = `A new version of "${doc.title}" (${doc.sop_number}) has been approved.\n\nPlease review the updated document and ensure your training is up to date.`;
    users.forEach(u => GmailApp.sendEmail(u.email, subject, body));
  }

  return { createDocument, submitForReview, approve, obsolete, list, STATUS };
})();
