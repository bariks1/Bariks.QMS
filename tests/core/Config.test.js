/**
 * SmartQMS – Config.test.js
 * Tests: required key validation, caching, defaults, reset
 */

'use strict';

const { loadCore } = require('../setup/loader');
loadCore();

const VALID_PROPS = {
  QMS_DB_HOST:         '1.2.3.4',
  QMS_DB_NAME:         'smartqms',
  QMS_DB_USER:         'qms_app',
  QMS_DB_PASS:         'secret',
  QMS_GEMINI_API_KEY:  'gemini-key-123',
  QMS_DRIVE_ROOT_ID:   'drive-folder-id',
  QMS_ADMIN_EMAIL:     'admin@example.com',
};

beforeEach(() => {
  _resetAllMocks();
  Config.reset();
});

describe('Config', () => {
  describe('get()', () => {
    test('returns tenant config when all required props are set', () => {
      PropertiesService._reset({ ...VALID_PROPS, QMS_TENANT_NAME: 'ACME Corp' });
      const cfg = Config.get();
      expect(cfg.tenant.name).toBe('ACME Corp');
      expect(cfg.db.host).toBe('1.2.3.4');
      expect(cfg.ai.apiKey).toBe('gemini-key-123');
    });

    test('uses default tenant name "SmartQMS" when QMS_TENANT_NAME is not set', () => {
      PropertiesService._reset({ ...VALID_PROPS });
      const cfg = Config.get();
      expect(cfg.tenant.name).toBe('SmartQMS');
    });

    test('uses default locale "en" when QMS_LOCALE is not set', () => {
      PropertiesService._reset({ ...VALID_PROPS });
      expect(Config.get().tenant.locale).toBe('en');
    });

    test('uses default passingScore 80 when QMS_PASSING_SCORE is not set', () => {
      PropertiesService._reset({ ...VALID_PROPS });
      expect(Config.get().qms.passingScore).toBe(80);
    });

    test('uses default riskAlertThreshold 3 when not set', () => {
      PropertiesService._reset({ ...VALID_PROPS });
      expect(Config.get().qms.riskAlertThreshold).toBe(3);
    });

    test('throws if any required property is missing', () => {
      const incomplete = { ...VALID_PROPS };
      delete incomplete.QMS_DB_HOST;
      PropertiesService._reset(incomplete);
      expect(() => Config.get()).toThrow('Missing required Script Properties');
      expect(() => Config.get()).toThrow('QMS_DB_HOST');
    });

    test('throws listing ALL missing required properties at once', () => {
      PropertiesService._reset({});
      expect(() => Config.get()).toThrow('QMS_DB_HOST');
    });

    test('caches result on second call (same object reference)', () => {
      PropertiesService._reset({ ...VALID_PROPS });
      const first  = Config.get();
      const second = Config.get();
      expect(first).toBe(second);
    });
  });

  describe('reset()', () => {
    test('clears cache so next get() re-reads properties', () => {
      PropertiesService._reset({ ...VALID_PROPS, QMS_TENANT_NAME: 'First' });
      expect(Config.get().tenant.name).toBe('First');

      Config.reset();
      PropertiesService._reset({ ...VALID_PROPS, QMS_TENANT_NAME: 'Second' });
      expect(Config.get().tenant.name).toBe('Second');
    });
  });
});
