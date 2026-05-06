/**
 * SmartQMS – Router.js
 * Apps Script Web App entry point.
 * Handles doGet (serve UI) and doPost (API calls from the frontend).
 *
 * All API calls are JSON-over-POST:
 *   { "module": "NCR", "method": "report", "params": { ... } }
 *
 * Responses:
 *   { "ok": true,  "data": ... }
 *   { "ok": false, "error": "message" }
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Route registry
// Declares which module methods are callable from the frontend.
// Only explicitly registered methods are accessible — no reflection.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTES = {
  // Document Control
  'DocumentControl.createDocument':        (p) => DocumentControl.createDocument(p),
  'DocumentControl.submitForReview':       (p) => DocumentControl.submitForReview(p.documentId),
  'DocumentControl.approve':               (p) => DocumentControl.approve(p),
  'DocumentControl.obsolete':              (p) => DocumentControl.obsolete(p.documentId, p.reason),
  'DocumentControl.list':                  (p) => DocumentControl.list(p),

  // NCR
  'NCR.report':                            (p) => NCR.report(p),
  'NCR.startInvestigation':                (p) => NCR.startInvestigation(p.ncrId, p.assignedToUserId),
  'NCR.close':                             (p) => NCR.close(p.ncrId, p.closureNote),
  'NCR.getById':                           (p) => NCR.getById(p.ncrId),
  'NCR.list':                              (p) => NCR.list(p),

  // CAPA
  'CAPA.create':                           (p) => CAPA.create(p),
  'CAPA.setRootCause':                     (p) => CAPA.setRootCause(p),
  'CAPA.startImplementation':              (p) => CAPA.startImplementation(p.capaId, p.dueDate),
  'CAPA.submitForVerification':            (p) => CAPA.submitForVerification(p.capaId, p.implementationSummary),
  'CAPA.close':                            (p) => CAPA.close(p),
  'CAPA.list':                             (p) => CAPA.list(p),

  // Risk Management
  'RiskManagement.createRiskItem':         (p) => RiskManagement.createRiskItem(p),
  'RiskManagement.list':                   (p) => RiskManagement.list(p),
  'RiskManagement.listAlerts':             (p) => RiskManagement.listAlerts(p),

  // Training
  'Training.assignTraining':               (p) => Training.assignTraining(p),
  'Training.createCompetencyQuiz':         (p) => Training.createCompetencyQuiz(p),
  'Training.getComplianceStats':           (_) => Training.getComplianceStats(),

  // Complaints
  'Complaints.logComplaint':               (p) => Complaints.logComplaint(p),
  'Complaints.overrideSeverity':           (p) => Complaints.overrideSeverity(p),
  'Complaints.resolve':                    (p) => Complaints.resolve(p),
  'Complaints.list':                       (p) => Complaints.list(p),

  // Standards
  'Standards.listStandards':               (_) => Standards.listStandards(),
  'Standards.listClauses':                 (p) => Standards.listClauses(p.standardId, p.parentClauseId),
  'Standards.updateStandardVersion':       (p) => Standards.updateStandardVersion(p),
  'Standards.listDocumentsNeedingReview':  (_) => Standards.listDocumentsNeedingReview(),
  'Standards.acknowledgeDocumentReview':   (p) => Standards.acknowledgeDocumentReview(p.documentId),

  // Audit Trail
  'AuditTrail.getHistory':                 (p) => AuditTrail.getHistory(p.entityType, p.entityId),
  'AuditTrail.export':                     (p) => AuditTrail.export(p),

  // System
  'System.getCurrentUser':                 (_) => Auth.getCurrentUser(),
  'System.getTenantConfig':                (_) => {
    const cfg = Config.get().tenant;
    return { name: cfg.name, logoUrl: cfg.logoUrl, locale: cfg.locale };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry points
// ─────────────────────────────────────────────────────────────────────────────

/** Serves the main web app UI. */
function doGet(e) {
  const page = (e.parameter.page || 'index').toLowerCase();
  const template = HtmlService.createTemplateFromFile('ui/Index');
  return template.evaluate()
    .setTitle('SmartQMS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Handles all API POST requests from the frontend. */
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const route  = `${body.module}.${body.method}`;
    const params = body.params || {};

    const handler = ROUTES[route];
    if (!handler) {
      return _jsonResponse({ ok: false, error: `Unknown route: '${route}'` }, 404);
    }

    const data = handler(params);
    return _jsonResponse({ ok: true, data });

  } catch (err) {
    const isAuthError = err.message.startsWith('[Auth]');
    const statusCode  = isAuthError ? 403 : 500;
    Logger.log(`[SmartQMS Router ERROR] ${err.message}\n${err.stack}`);
    return _jsonResponse({ ok: false, error: err.message }, statusCode);
  }
}

/** Include helper for HTML partials. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function _jsonResponse(payload, statusCode = 200) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
