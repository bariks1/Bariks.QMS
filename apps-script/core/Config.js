/**
 * SmartQMS – Config.js
 * Loads all tenant-specific configuration from Google Apps Script Script Properties.
 * NO credentials or tenant data are ever hardcoded here.
 *
 * Required Script Properties (set via Project Settings > Script Properties):
 *   QMS_TENANT_NAME        – Display name of the company (e.g. "HBOT Medical Ltd.")
 *   QMS_TENANT_LOGO_URL    – URL to company logo image (optional)
 *   QMS_DB_HOST            – Cloud SQL public IP
 *   QMS_DB_NAME            – MySQL database name
 *   QMS_DB_USER            – App user
 *   QMS_DB_PASS            – App user password
 *   QMS_GEMINI_API_KEY     – Gemini API key
 *   QMS_DRIVE_ROOT_ID      – Google Drive folder ID for QMS root
 *   QMS_ADMIN_EMAIL        – Email of the QMS system admin / Regulatory Manager
 *   QMS_PASSING_SCORE      – Minimum score (%) to pass a training quiz (default: 80)
 *   QMS_LOCALE             – UI locale: "en" or "he" (default: "en")
 *   QMS_RISK_ALERT_THRESHOLD – NCR occurrence count that triggers a Risk Alert (default: 3)
 */

'use strict';

const Config = (() => {
  let _cache = null;

  function _load() {
    if (_cache) return _cache;

    const props = PropertiesService.getScriptProperties().getProperties();

    const required = [
      'QMS_DB_HOST', 'QMS_DB_NAME', 'QMS_DB_USER', 'QMS_DB_PASS',
      'QMS_GEMINI_API_KEY', 'QMS_DRIVE_ROOT_ID', 'QMS_ADMIN_EMAIL'
    ];

    const missing = required.filter(k => !props[k]);
    if (missing.length > 0) {
      throw new Error(`[SmartQMS] Missing required Script Properties: ${missing.join(', ')}`);
    }

    _cache = {
      tenant: {
        name:     props['QMS_TENANT_NAME']    || 'SmartQMS',
        logoUrl:  props['QMS_TENANT_LOGO_URL'] || '',
        adminEmail: props['QMS_ADMIN_EMAIL'],
        locale:   props['QMS_LOCALE']          || 'en',
      },
      db: {
        host: props['QMS_DB_HOST'],
        name: props['QMS_DB_NAME'],
        user: props['QMS_DB_USER'],
        pass: props['QMS_DB_PASS'],
      },
      ai: {
        apiKey: props['QMS_GEMINI_API_KEY'],
      },
      drive: {
        rootFolderId: props['QMS_DRIVE_ROOT_ID'],
      },
      qms: {
        passingScore:        parseInt(props['QMS_PASSING_SCORE']        || '80',  10),
        riskAlertThreshold:  parseInt(props['QMS_RISK_ALERT_THRESHOLD'] || '3',   10),
      }
    };

    return _cache;
  }

  /** Clears the in-memory cache (useful after updating Script Properties in tests). */
  function reset() { _cache = null; }

  return { get: _load, reset };
})();
