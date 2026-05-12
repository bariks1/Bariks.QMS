/**
 * SmartQMS – RiskManagement.test.js
 * Tests: RPN calculation, acceptability thresholds, risk alert trigger
 * These are pure business logic tests — no Drive/Gmail side effects.
 */

'use strict';

const { loadCore, loadModule } = require('../setup/loader');
const { createDbMock }         = require('../setup/db-mock');

loadCore();
loadModule('RiskManagement');

const VALID_PROPS = {
  QMS_DB_HOST: '1.2.3.4', QMS_DB_NAME: 'smartqms',
  QMS_DB_USER: 'qms_app', QMS_DB_PASS: 'secret',
  QMS_GEMINI_API_KEY: 'key', QMS_DRIVE_ROOT_ID: 'folder',
  QMS_ADMIN_EMAIL: 'admin@example.com',
  QMS_RISK_ALERT_THRESHOLD: '3',
};

let db;

beforeEach(() => {
  _resetAllMocks();
  Auth.reset();  // Explicit: _resetAllMocks guard runs before Auth module is loaded
  PropertiesService._reset({ ...VALID_PROPS });
  db = createDbMock();
  Jdbc._setMockConnection(db.connection);

  Session._setEmail('quality@example.com');
  db.setQueryResult('is_active FROM users WHERE email', [
    { id: 1, email: 'quality@example.com', name: 'Quality User', role: 'quality', is_active: 1 }
  ]);
  db.setInsertId(10);
});

describe('RiskManagement – RPN Calculation', () => {
  test('calculates RPN as severity × occurrence × detectability', () => {
    const input = { hazard: 'H', hazardSituation: 'HS', harm: 'Harm', severity: 3, occurrence: 2, detectability: 2 };
    db.setQueryResult('SELECT * FROM risk_items', []);
    const result = RiskManagement.createRiskItem(input);
    expect(result.rpn).toBe(12); // 3 × 2 × 2
  });

  test('stores correct rpn in INSERT statement', () => {
    const input = { hazard: 'H', hazardSituation: 'HS', harm: 'Harm', severity: 5, occurrence: 5, detectability: 5 };
    RiskManagement.createRiskItem(input);
    // Use normalized whitespace search (SQL has newlines)
    const insertStmt = db.executedStatements.find(s => s.sql.replace(/\s+/g, ' ').includes('INSERT INTO risk_items'));
    expect(insertStmt).toBeDefined();
    expect(insertStmt.params[6]).toBe(125);
  });
});

describe('RiskManagement – Acceptability Thresholds', () => {
  function makeItem(s, o, d) {
    return { hazard: 'H', hazardSituation: 'HS', harm: 'Harm', severity: s, occurrence: o, detectability: d };
  }

  test('RPN ≤ 8 → LOW (Acceptable)', () => {
    const r = RiskManagement.createRiskItem(makeItem(2, 2, 2)); // rpn=8
    expect(r.acceptability).toBe('LOW');
  });

  test('RPN 9–40 → MEDIUM (ALARP)', () => {
    const r = RiskManagement.createRiskItem(makeItem(2, 2, 3)); // rpn=12
    expect(r.acceptability).toBe('MEDIUM');
  });

  test('RPN 41–125 → HIGH (Unacceptable)', () => {
    const r = RiskManagement.createRiskItem(makeItem(5, 5, 2)); // rpn=50
    expect(r.acceptability).toBe('HIGH');
  });

  test('maximum RPN (125) → HIGH', () => {
    const r = RiskManagement.createRiskItem(makeItem(5, 5, 5)); // rpn=125
    expect(r.acceptability).toBe('HIGH');
  });

  test('minimum RPN (1) → LOW', () => {
    const r = RiskManagement.createRiskItem(makeItem(1, 1, 1)); // rpn=1
    expect(r.acceptability).toBe('LOW');
  });
});

describe('RiskManagement – Input Validation', () => {
  const baseItem = { hazard: 'H', hazardSituation: 'HS', harm: 'Harm' };

  test.each([
    ['severity',      { ...baseItem, severity: 0,  occurrence: 1, detectability: 1 }],
    ['severity',      { ...baseItem, severity: 6,  occurrence: 1, detectability: 1 }],
    ['occurrence',    { ...baseItem, severity: 1,  occurrence: 0, detectability: 1 }],
    ['detectability', { ...baseItem, severity: 1,  occurrence: 1, detectability: 6 }],
  ])('%s=%s must be 1-5', (field, input) => {
    expect(() => RiskManagement.createRiskItem(input)).toThrow(`'${field}' must be an integer between 1 and 5`);
  });
});

describe('RiskManagement – Risk Alert', () => {
  test('triggerRiskAlert inserts alert record and emails admin', () => {
    RiskManagement.triggerRiskAlert('SN-001', 5);

    const insertStmt = db.executedStatements.find(s => s.sql.replace(/\s+/g,' ').includes('risk_alerts'));
    expect(insertStmt).toBeDefined();
    expect(insertStmt.params[0]).toBe('SN-001');
    expect(insertStmt.params[1]).toBe(5);

    expect(GmailApp._sent).toHaveLength(1);
    expect(GmailApp._sent[0].to).toBe('admin@example.com');
    expect(GmailApp._sent[0].subject).toContain('RISK ALERT');
    expect(GmailApp._sent[0].subject).toContain('SN-001');
  });
});

describe('RiskManagement – Access Control', () => {
  test('employee cannot create risk items', () => {
    Session._setEmail('emp@example.com');
    db.setQueryResult('is_active FROM users WHERE email', [
      { id: 2, email: 'emp@example.com', name: 'Emp', role: 'employee', is_active: 1 }
    ]);
    expect(() =>
      RiskManagement.createRiskItem({ hazard: 'H', hazardSituation: 'HS', harm: 'Harm', severity: 1, occurrence: 1, detectability: 1 })
    ).toThrow('[Auth] Access denied');
  });
});
