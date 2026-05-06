/**
 * SmartQMS – Training.js
 * Module D: Training Management
 *
 * Distributes updated SOPs to relevant role groups via Gmail.
 * Creates Google Form competency quizzes programmatically.
 * Training is only marked complete when the employee passes the assessment
 * (score >= QMS_PASSING_SCORE).
 *
 * ISO 13485:2016 §6.2 – Human Resources (Training & Competency)
 */

'use strict';

const Training = (() => {

  /**
   * Creates a training assignment for a document, targeting a specific role or user.
   * Sends notification emails with the Drive link.
   * @param {{ documentId: number, targetRole?: string, targetUserIds?: number[],
   *           dueDate?: string }} input
   * @returns {{ assignmentId: number, notifiedCount: number }}
   */
  function assignTraining({ documentId, targetRole = null, targetUserIds = [], dueDate = null }) {
    Auth.requireRole('quality');

    const docRows = Database.query(
      "SELECT * FROM documents WHERE id = ? AND status = 'APPROVED'", [documentId]
    );
    if (docRows.length === 0) {
      throw new Error(`[Training] Document ${documentId} not found or not in APPROVED status.`);
    }
    const doc = docRows[0];

    // Resolve target users
    let targetUsers = [];
    if (targetRole) {
      targetUsers = Database.query(
        'SELECT id, email, name FROM users WHERE role = ? AND is_active = 1', [targetRole]
      );
    } else if (targetUserIds.length > 0) {
      const placeholders = targetUserIds.map(() => '?').join(',');
      targetUsers = Database.query(
        `SELECT id, email, name FROM users WHERE id IN (${placeholders}) AND is_active = 1`,
        targetUserIds
      );
    }

    if (targetUsers.length === 0) {
      throw new Error('[Training] No active users found matching the target criteria.');
    }

    const { insertId: assignmentId } = Database.execute(
      `INSERT INTO training_assignments (document_id, target_role, due_date, created_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP())`,
      [documentId, targetRole, dueDate]
    );

    // Create individual training records
    targetUsers.forEach(u => {
      Database.execute(
        `INSERT INTO training_records (assignment_id, user_id, status, created_at)
         VALUES (?, ?, 'PENDING', UTC_TIMESTAMP())`,
        [assignmentId, u.id]
      );
    });

    AuditTrail.log({
      action: 'TRAINING_ASSIGNED', entityType: 'training_assignment', entityId: assignmentId,
      newValue: { documentId, sopNumber: doc.sop_number, targetRole, userCount: targetUsers.length },
    });

    // Send notification emails
    _sendTrainingNotification(targetUsers, doc, dueDate);

    return { assignmentId, notifiedCount: targetUsers.length };
  }

  /**
   * Creates a Google Form competency quiz for a training assignment.
   * Questions are defined as an array by the quality team.
   * @param {{ assignmentId: number, questions: Array<{ question: string, options: string[], correctIndex: number }> }}
   * @returns {{ formId: string, formUrl: string }}
   */
  function createCompetencyQuiz({ assignmentId, questions }) {
    Auth.requireRole('quality');

    const rows = Database.query(
      `SELECT ta.*, d.title, d.sop_number FROM training_assignments ta
       JOIN documents d ON ta.document_id = d.id WHERE ta.id = ?`, [assignmentId]
    );
    if (rows.length === 0) throw new Error(`[Training] Assignment ${assignmentId} not found.`);
    const assignment = rows[0];

    const form = FormApp.create(`[SmartQMS] Competency Quiz: ${assignment.sop_number} – ${assignment.title}`);
    form.setIsQuiz(true);
    form.setCollectEmail(true);
    form.setLimitOneResponsePerUser(true);

    questions.forEach(q => {
      const item = form.addMultipleChoiceItem();
      item.setTitle(q.question);
      item.setRequired(true);
      const choices = q.options.map((opt, i) =>
        item.createChoice(opt, i === q.correctIndex)
      );
      item.setChoices(choices);
      item.setPoints(1);
    });

    form.setConfirmationMessage('Thank you! Your responses have been recorded. Training completion will be confirmed by the QMS system.');

    // Save form ID to assignment
    Database.execute(
      'UPDATE training_assignments SET quiz_form_id = ?, quiz_form_url = ? WHERE id = ?',
      [form.getId(), form.getPublishedUrl(), assignmentId]
    );

    AuditTrail.log({
      action: 'TRAINING_QUIZ_CREATED', entityType: 'training_assignment', entityId: assignmentId,
      newValue: { formId: form.getId(), questionCount: questions.length },
    });

    return { formId: form.getId(), formUrl: form.getPublishedUrl() };
  }

  /**
   * Processes Google Form responses and records training completions.
   * Should be run as a Form onFormSubmit trigger.
   * @param {Object} formEvent – Apps Script form submit event
   */
  function processQuizSubmission(formEvent) {
    const response    = formEvent.response;
    const score       = response.getScore();
    const maxScore    = formEvent.source.getItems().length;
    const percent     = Math.round((score / maxScore) * 100);
    const email       = response.getRespondentEmail();
    const passingPct  = Config.get().qms.passingScore;

    const userRows = Database.query('SELECT id FROM users WHERE email = ?', [email]);
    if (userRows.length === 0) return; // Not a QMS user
    const userId = userRows[0].id;

    const formId = formEvent.source.getId();
    const assignmentRows = Database.query(
      'SELECT id FROM training_assignments WHERE quiz_form_id = ?', [formId]
    );
    if (assignmentRows.length === 0) return;
    const assignmentId = assignmentRows[0].id;

    const passed = percent >= passingPct;
    const status = passed ? 'COMPLETED' : 'FAILED';

    Database.execute(
      `UPDATE training_records SET status = ?, score_percent = ?, completed_at = UTC_TIMESTAMP()
       WHERE assignment_id = ? AND user_id = ?`,
      [status, percent, assignmentId, userId]
    );

    AuditTrail.log({
      action:     passed ? 'TRAINING_COMPLETED' : 'TRAINING_FAILED',
      entityType: 'training_record',
      entityId:   `${assignmentId}:${userId}`,
      newValue:   { scorePercent: percent, passed, passingThreshold: passingPct },
    });

    if (!passed) {
      _sendRetakeNotification(email, percent, passingPct);
    }
  }

  /** Returns training compliance stats. */
  function getComplianceStats() {
    Auth.requireRole('quality');
    return Database.query(`
      SELECT
        u.name, u.email, u.role,
        COUNT(tr.id) AS total_assigned,
        SUM(CASE WHEN tr.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN tr.status = 'FAILED'    THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN tr.status = 'PENDING'   THEN 1 ELSE 0 END) AS pending
      FROM users u
      LEFT JOIN training_records tr ON u.id = tr.user_id
      WHERE u.is_active = 1
      GROUP BY u.id
      ORDER BY u.name
    `);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function _sendTrainingNotification(users, doc, dueDate) {
    const cfg     = Config.get();
    const subject = `[${cfg.tenant.name}] Training Required: ${doc.sop_number}`;
    const dueLine = dueDate ? `Due Date: ${dueDate}\n` : '';
    const body = `You have been assigned a training requirement.\n\nDocument: ${doc.title} (${doc.sop_number})\n${dueLine}\nPlease review the document and complete the competency assessment in SmartQMS.`;
    users.forEach(u => GmailApp.sendEmail(u.email, subject, body));
  }

  function _sendRetakeNotification(email, score, passing) {
    const cfg = Config.get();
    GmailApp.sendEmail(
      email,
      `[${cfg.tenant.name}] Training Assessment: Retake Required`,
      `Your score of ${score}% did not meet the required passing threshold of ${passing}%.\n\nPlease review the document and retake the assessment.`
    );
  }

  return { assignTraining, createCompetencyQuiz, processQuizSubmission, getComplianceStats };
})();
