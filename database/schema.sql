-- ============================================================================
-- SmartQMS – Complete Database Schema
-- MySQL 8.0 / Google Cloud SQL
-- ============================================================================
-- Tenant: one database per customer (Option A isolated model)
-- Character set: utf8mb4 (required for Hebrew/multilingual support)
-- All timestamps are stored in UTC.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS & RBAC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  email       VARCHAR(254)    NOT NULL UNIQUE,
  name        VARCHAR(200)    NOT NULL,
  role        ENUM('employee','reviewer','quality','admin') NOT NULL DEFAULT 'employee',
  is_active   TINYINT(1)      NOT NULL DEFAULT 1,
  created_at  DATETIME        NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at  DATETIME        NULL,
  PRIMARY KEY (id),
  INDEX idx_users_email (email),
  INDEX idx_users_role  (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- STANDARDS LIBRARY (Dynamic Regulatory Brain)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS standards (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name                VARCHAR(100)    NOT NULL,        -- e.g. "ISO 13485"
  full_name           VARCHAR(300)    NOT NULL,        -- e.g. "ISO 13485:2016 - Quality management systems for medical devices"
  version             VARCHAR(50)     NOT NULL,        -- e.g. "2016"
  issuing_body        VARCHAR(100)    NOT NULL,        -- e.g. "ISO"
  change_description  TEXT            NULL,
  created_at          DATETIME        NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at          DATETIME        NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS standard_clauses (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  standard_id      INT UNSIGNED    NOT NULL,
  parent_clause_id INT UNSIGNED    NULL,
  clause_number    VARCHAR(20)     NOT NULL,   -- e.g. "8.5.2"
  title            VARCHAR(300)    NOT NULL,   -- e.g. "Corrective Action"
  description      TEXT            NULL,
  PRIMARY KEY (id),
  INDEX idx_clauses_standard (standard_id),
  INDEX idx_clauses_parent   (parent_clause_id),
  CONSTRAINT fk_clause_standard FOREIGN KEY (standard_id)      REFERENCES standards(id) ON DELETE CASCADE,
  CONSTRAINT fk_clause_parent   FOREIGN KEY (parent_clause_id) REFERENCES standard_clauses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOCUMENT CONTROL
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  title          VARCHAR(300)    NOT NULL,
  sop_number     VARCHAR(50)     NOT NULL UNIQUE,
  description    TEXT            NULL,
  status         ENUM('DRAFT','REVIEW','APPROVED','OBSOLETE') NOT NULL DEFAULT 'DRAFT',
  version        INT UNSIGNED    NOT NULL DEFAULT 1,
  drive_file_id  VARCHAR(100)    NOT NULL,
  created_by     INT UNSIGNED    NOT NULL,
  approved_by    INT UNSIGNED    NULL,
  approved_at    DATETIME        NULL,
  needs_review   TINYINT(1)      NOT NULL DEFAULT 0,
  review_reason  TEXT            NULL,
  created_at     DATETIME        NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at     DATETIME        NULL,
  PRIMARY KEY (id),
  INDEX idx_documents_status (status),
  INDEX idx_documents_sop    (sop_number),
  CONSTRAINT fk_doc_created_by  FOREIGN KEY (created_by)  REFERENCES users(id),
  CONSTRAINT fk_doc_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_approvals (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id  INT UNSIGNED NOT NULL,
  approved_by  INT UNSIGNED NOT NULL,
  version      INT UNSIGNED NOT NULL,
  comments     TEXT         NULL,
  approved_at  DATETIME     NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  CONSTRAINT fk_approval_doc  FOREIGN KEY (document_id) REFERENCES documents(id),
  CONSTRAINT fk_approval_user FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_clause_links (
  document_id INT UNSIGNED NOT NULL,
  clause_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (document_id, clause_id),
  CONSTRAINT fk_dcl_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_dcl_clause   FOREIGN KEY (clause_id)   REFERENCES standard_clauses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- NON-CONFORMANCE REPORTS (NCR)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ncrs (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  ncr_number   VARCHAR(20)     NOT NULL UNIQUE,          -- NCR-2025-0001
  device_sn    VARCHAR(100)    NOT NULL,
  description  TEXT            NOT NULL,
  detected_at  DATETIME        NULL,
  location     VARCHAR(200)    NULL,
  status       ENUM('OPEN','UNDER_INVESTIGATION','CAPA_LINKED','CLOSED') NOT NULL DEFAULT 'OPEN',
  reported_by  INT UNSIGNED    NOT NULL,
  assigned_to  INT UNSIGNED    NULL,
  closed_at    DATETIME        NULL,
  created_at   DATETIME        NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at   DATETIME        NULL,
  PRIMARY KEY (id),
  INDEX idx_ncr_device_sn (device_sn),
  INDEX idx_ncr_status    (status),
  CONSTRAINT fk_ncr_reported_by FOREIGN KEY (reported_by) REFERENCES users(id),
  CONSTRAINT fk_ncr_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ncr_clause_links (
  ncr_id    INT UNSIGNED NOT NULL,
  clause_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (ncr_id, clause_id),
  CONSTRAINT fk_ncl_ncr    FOREIGN KEY (ncr_id)    REFERENCES ncrs(id) ON DELETE CASCADE,
  CONSTRAINT fk_ncl_clause FOREIGN KEY (clause_id) REFERENCES standard_clauses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- CORRECTIVE AND PREVENTIVE ACTIONS (CAPA)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS capas (
  id                      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  capa_number             VARCHAR(20)     NOT NULL UNIQUE,      -- CAPA-2025-0001
  ncr_id                  INT UNSIGNED    NOT NULL,
  type                    ENUM('CORRECTIVE','PREVENTIVE') NOT NULL DEFAULT 'CORRECTIVE',
  status                  ENUM('DRAFT','OPEN','IN_PROGRESS','VERIFICATION','CLOSED') NOT NULL DEFAULT 'DRAFT',
  root_cause              TEXT            NULL,
  root_cause_draft        TEXT            NULL,   -- AI-generated HITL draft
  ai_generated            TINYINT(1)      NOT NULL DEFAULT 0,
  actions                 TEXT            NULL,   -- JSON array of action objects
  implementation_summary  TEXT            NULL,
  effectiveness_summary   TEXT            NULL,
  due_date                DATE            NULL,
  created_by              INT UNSIGNED    NOT NULL,
  closed_by               INT UNSIGNED    NULL,
  closed_at               DATETIME        NULL,
  created_at              DATETIME        NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at              DATETIME        NULL,
  PRIMARY KEY (id),
  INDEX idx_capa_status (status),
  INDEX idx_capa_ncr    (ncr_id),
  CONSTRAINT fk_capa_ncr        FOREIGN KEY (ncr_id)     REFERENCES ncrs(id),
  CONSTRAINT fk_capa_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_capa_closed_by  FOREIGN KEY (closed_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- RISK MANAGEMENT (ISO 14971)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk_items (
  id               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  hazard           VARCHAR(500)   NOT NULL,
  hazard_situation TEXT           NOT NULL,
  harm             VARCHAR(300)   NOT NULL,
  severity         TINYINT        NOT NULL CHECK (severity BETWEEN 1 AND 5),
  occurrence       TINYINT        NOT NULL CHECK (occurrence BETWEEN 1 AND 5),
  detectability    TINYINT        NOT NULL CHECK (detectability BETWEEN 1 AND 5),
  rpn              TINYINT        NOT NULL,
  acceptability    ENUM('LOW','MEDIUM','HIGH') NOT NULL,
  device_type      VARCHAR(100)   NULL,
  status           ENUM('OPEN','MITIGATED','CLOSED') NOT NULL DEFAULT 'OPEN',
  needs_review     TINYINT(1)     NOT NULL DEFAULT 0,
  review_reason    TEXT           NULL,
  created_by       INT UNSIGNED   NOT NULL,
  created_at       DATETIME       NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at       DATETIME       NULL,
  PRIMARY KEY (id),
  INDEX idx_risk_acceptability (acceptability),
  INDEX idx_risk_device_type   (device_type),
  CONSTRAINT fk_risk_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS risk_alerts (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_sn      VARCHAR(100) NOT NULL,
  open_ncr_count INT          NOT NULL,
  triggered_at   DATETIME     NOT NULL,
  resolved       TINYINT(1)   NOT NULL DEFAULT 0,
  resolved_at    DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  INDEX idx_alert_device (device_sn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS risk_clause_links (
  risk_id   INT UNSIGNED NOT NULL,
  clause_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (risk_id, clause_id),
  CONSTRAINT fk_rcl_risk   FOREIGN KEY (risk_id)   REFERENCES risk_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_rcl_clause FOREIGN KEY (clause_id) REFERENCES standard_clauses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- TRAINING MANAGEMENT
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_assignments (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id   INT UNSIGNED NOT NULL,
  target_role   VARCHAR(50)  NULL,
  due_date      DATE         NULL,
  quiz_form_id  VARCHAR(100) NULL,
  quiz_form_url VARCHAR(500) NULL,
  created_at    DATETIME     NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  CONSTRAINT fk_ta_document FOREIGN KEY (document_id) REFERENCES documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_records (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED  NOT NULL,
  user_id       INT UNSIGNED  NOT NULL,
  status        ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  score_percent TINYINT       NULL,
  completed_at  DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  UNIQUE KEY uq_training_assignment_user (assignment_id, user_id),
  CONSTRAINT fk_tr_assignment FOREIGN KEY (assignment_id) REFERENCES training_assignments(id),
  CONSTRAINT fk_tr_user       FOREIGN KEY (user_id)       REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPLAINTS & VIGILANCE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS complaints (
  id                      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  complaint_number        VARCHAR(20)   NOT NULL UNIQUE,      -- CMP-2025-0001
  customer_name           VARCHAR(200)  NOT NULL,
  description             TEXT          NOT NULL,
  device_type             VARCHAR(100)  NOT NULL,
  device_sn               VARCHAR(100)  NULL,
  contact_email           VARCHAR(254)  NULL,
  status                  ENUM('OPEN','UNDER_REVIEW','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  severity                ENUM('LOW','MEDIUM','HIGH','CRITICAL') NULL,
  ai_severity             ENUM('LOW','MEDIUM','HIGH','CRITICAL') NULL,
  ai_reporting_required   TINYINT(1)    NULL,
  ai_rationale            TEXT          NULL,
  human_severity_override TINYINT(1)    NOT NULL DEFAULT 0,
  resolution_summary      TEXT          NULL,
  reported_by             INT UNSIGNED  NOT NULL,
  closed_by               INT UNSIGNED  NULL,
  closed_at               DATETIME      NULL,
  created_at              DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at              DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_complaint_status   (status),
  INDEX idx_complaint_severity (severity),
  CONSTRAINT fk_complaint_reported_by FOREIGN KEY (reported_by) REFERENCES users(id),
  CONSTRAINT fk_complaint_closed_by   FOREIGN KEY (closed_by)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vigilance_reports (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id INT UNSIGNED NOT NULL,
  content      TEXT         NOT NULL,
  status       ENUM('DRAFT','REVIEWED','SUBMITTED') NOT NULL DEFAULT 'DRAFT',
  reviewed_by  INT UNSIGNED NULL,
  reviewed_at  DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  CONSTRAINT fk_vig_complaint   FOREIGN KEY (complaint_id) REFERENCES complaints(id),
  CONSTRAINT fk_vig_reviewed_by FOREIGN KEY (reviewed_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT TRAIL (Immutable – app user has NO UPDATE/DELETE on this table)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NULL,       -- NULL for system-generated events
  user_email   VARCHAR(254)    NULL,
  action       VARCHAR(100)    NOT NULL,   -- e.g. DOCUMENT_APPROVED
  entity_type  VARCHAR(50)     NOT NULL,   -- e.g. document
  entity_id    VARCHAR(50)     NULL,       -- PK of the affected entity
  old_value    JSON            NULL,
  new_value    JSON            NULL,
  note         TEXT            NULL,
  created_at   DATETIME        NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  INDEX idx_audit_entity   (entity_type, entity_id),
  INDEX idx_audit_user     (user_id),
  INDEX idx_audit_action   (action),
  INDEX idx_audit_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY: Revoke UPDATE/DELETE on audit_log for the app user
-- Run as root after creating schema:
--   REVOKE UPDATE, DELETE ON <db_name>.audit_log FROM '<app_user>'@'%';
-- ─────────────────────────────────────────────────────────────────────────────
