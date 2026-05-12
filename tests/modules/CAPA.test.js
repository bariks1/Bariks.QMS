/**
 * SmartQMS – CAPA.test.js
 * Critical tests: HITL enforcement (the most important safety invariant),
 * lifecycle state machine, access control.
 */

'use strict';

const { loadCore, loadModule, loadAi } = require('../setup/loader');
const { createDbMock }                  = require('../setup/db-mock');

loadCore();
loadAi('GeminiClient');
loadAi('RootCauseAnalyzer');
loadModule('NCR');
loadModule('CAPA');

const VALID_PROPS = {
  QMS_DB_HOST: '1.2.3.4', QMS_DB_NAME: 'smartqms',
  QMS_DB_USER: 'qms_app', QMS_DB_PASS: 'secret',
  QMS_GEMINI_API_KEY: 'gemini-key', QMS_DRIVE_ROOT_ID: 'folder',
  QMS_ADMIN_EMAIL: 'admin@example.com',
};

let db;
const QUALITY_USER  = { id: 1, email: 'quality@example.com',  name: 'QE',  role: 'quality',  is_active: 1 };
const REVIEWER_USER = { id: 2, email: 'reviewer@example.com', name: 'Rev', role: 'reviewer', is_active: 1 };
const EMPLOYEE_USER = { id: 3, email: 'emp@example.com',      name: 'Emp', role: 'employee', is_active: 1 };

function setActiveUser(user) {
  Session._setEmail(user.email);
  Auth.reset();
  db.setQueryResult('is_active FROM users WHERE email', [user]);
}

function setCapa(capaRow) {
  // Use unique fragment: 'FROM capas WHERE id' appears only in CAPA._getById
  db.setQueryResult('FROM capas WHERE id', [capaRow]);
}

beforeEach(() => {
  _resetAllMocks();
  Auth.reset();  // Explicit: _resetAllMocks guard runs before Auth module is loaded
  PropertiesService._reset({ ...VALID_PROPS });
  db = createDbMock();
  Jdbc._setMockConnection(db.connection);
  setActiveUser(QUALITY_USER);
  db.setInsertId(100);
});

// ─────────────────────────────────────────────────────────────────────────────
// The HITL invariant — this is the most critical safety test in the suite
// ─────────────────────────────────────────────────────────────────────────────
describe('CAPA – HITL Safety Invariant', () => {
  const aiCapaRow = { id: 100, capa_number: 'CAPA-2025-0001', ncr_id: 1, status: 'DRAFT', ai_generated: 1 };

  beforeEach(() => {
    setCapa(aiCapaRow);
  });

  test('setRootCause on AI-generated CAPA THROWS when humanReviewedAi is not set', () => {
    expect(() =>
      CAPA.setRootCause({
        capaId:    100,
        rootCause: 'The AI suggested this',
        actions:   [],
        // humanReviewedAi omitted / false — must throw
      })
    ).toThrow('humanReviewedAi=true');
  });

  test('setRootCause on AI-generated CAPA THROWS when humanReviewedAi is explicitly false', () => {
    expect(() =>
      CAPA.setRootCause({ capaId: 100, rootCause: 'AI draft', actions: [], humanReviewedAi: false })
    ).toThrow('humanReviewedAi=true');
  });

  test('setRootCause on AI-generated CAPA SUCCEEDS when humanReviewedAi is true', () => {
    expect(() =>
      CAPA.setRootCause({ capaId: 100, rootCause: 'Reviewed root cause', actions: [], humanReviewedAi: true })
    ).not.toThrow();
  });

  test('setRootCause on human-authored CAPA does NOT require humanReviewedAi flag', () => {
    setCapa({ ...aiCapaRow, ai_generated: 0 });
    expect(() =>
      CAPA.setRootCause({ capaId: 100, rootCause: 'Manual root cause', actions: [] })
    ).not.toThrow();
  });

  test('audit trail records HITL review note when AI draft is confirmed', () => {
    CAPA.setRootCause({ capaId: 100, rootCause: 'Confirmed', actions: [], humanReviewedAi: true });
    const auditInsert = db.executedStatements.find(s => s.sql.replace(/\s+/g,' ').includes('audit_log'));
    expect(auditInsert).toBeDefined();
    expect(auditInsert.params.some(p => typeof p === 'string' && p.includes('human expert'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle state machine
// ─────────────────────────────────────────────────────────────────────────────
describe('CAPA – Lifecycle State Machine', () => {
  function makeCapa(status) {
    return { id: 100, capa_number: 'CAPA-2025-0001', ncr_id: 1, status, ai_generated: 0 };
  }

  test('startImplementation requires OPEN status', () => {
    setCapa(makeCapa('DRAFT'));
    expect(() => CAPA.startImplementation(100, '2025-12-31')).toThrow("must be 'OPEN'");
  });

  test('startImplementation succeeds on OPEN CAPA', () => {
    setCapa(makeCapa('OPEN'));
    expect(() => CAPA.startImplementation(100, '2025-12-31')).not.toThrow();
    const stmt = db.executedStatements.find(s => s.sql.includes('IN_PROGRESS'));
    expect(stmt).toBeDefined();
  });

  test('submitForVerification requires IN_PROGRESS status', () => {
    setCapa(makeCapa('OPEN'));
    expect(() => CAPA.submitForVerification(100, 'summary')).toThrow("must be 'IN_PROGRESS'");
  });

  test('close requires VERIFICATION status', () => {
    setCapa(makeCapa('OPEN'));
    setActiveUser(REVIEWER_USER);
    expect(() => CAPA.close({ capaId: 100, effectivenessSummary: 'OK', eSignatureConfirm: true }))
      .toThrow("must be 'VERIFICATION'");
  });

  test('close requires eSignatureConfirm = true', () => {
    setCapa(makeCapa('VERIFICATION'));
    setActiveUser(REVIEWER_USER);
    expect(() => CAPA.close({ capaId: 100, effectivenessSummary: 'OK', eSignatureConfirm: false }))
      .toThrow('Electronic signature required');
  });

  test('close succeeds with reviewer role + VERIFICATION status + e-signature', () => {
    setCapa(makeCapa('VERIFICATION'));
    setActiveUser(REVIEWER_USER);
    expect(() =>
      CAPA.close({ capaId: 100, effectivenessSummary: 'Effective', eSignatureConfirm: true })
    ).not.toThrow();
  });

  test('employee cannot close a CAPA', () => {
    setCapa(makeCapa('VERIFICATION'));
    setActiveUser(EMPLOYEE_USER);
    expect(() => CAPA.close({ capaId: 100, effectivenessSummary: 'OK', eSignatureConfirm: true }))
      .toThrow('[Auth] Access denied');
  });
});
