-- ============================================================================
-- SmartQMS – Standards Library Seed Data
-- Populates the regulatory brain with clause trees for:
--   1. ISO 13485:2016 (Medical Devices QMS)
--   2. ISO 9001:2015  (General QMS)
--   3. ISO 14971:2019 (Risk Management for Medical Devices)
--   4. ISO 27001:2022 (Information Security)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STANDARDS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO standards (id, name, full_name, version, issuing_body) VALUES
(1, 'ISO 13485', 'Medical devices — Quality management systems — Requirements for regulatory purposes', '2016', 'ISO'),
(2, 'ISO 9001',  'Quality management systems — Requirements', '2015', 'ISO'),
(3, 'ISO 14971', 'Medical devices — Application of risk management to medical devices', '2019', 'ISO'),
(4, 'ISO 27001', 'Information security, cybersecurity and privacy protection — Information security management systems — Requirements', '2022', 'ISO');

-- ─────────────────────────────────────────────────────────────────────────────
-- ISO 13485:2016 Clauses
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO standard_clauses (standard_id, parent_clause_id, clause_number, title) VALUES
-- Top-level sections
(1, NULL, '4', 'Quality Management System'),
(1, NULL, '5', 'Management Responsibility'),
(1, NULL, '6', 'Resource Management'),
(1, NULL, '7', 'Product Realization'),
(1, NULL, '8', 'Measurement, Analysis and Improvement');

SET @s13_4 = LAST_INSERT_ID() - 4;
SET @s13_5 = LAST_INSERT_ID() - 3;
SET @s13_6 = LAST_INSERT_ID() - 2;
SET @s13_7 = LAST_INSERT_ID() - 1;
SET @s13_8 = LAST_INSERT_ID();

INSERT INTO standard_clauses (standard_id, parent_clause_id, clause_number, title) VALUES
-- §4 sub-clauses
(1, @s13_4, '4.1', 'General Requirements'),
(1, @s13_4, '4.2', 'Documentation Requirements'),
-- §5 sub-clauses
(1, @s13_5, '5.1', 'Management Commitment'),
(1, @s13_5, '5.2', 'Customer Focus'),
(1, @s13_5, '5.6', 'Management Review'),
-- §6 sub-clauses
(1, @s13_6, '6.2', 'Human Resources'),
(1, @s13_6, '6.3', 'Infrastructure'),
(1, @s13_6, '6.4', 'Work Environment'),
-- §7 sub-clauses
(1, @s13_7, '7.3', 'Design and Development'),
(1, @s13_7, '7.4', 'Purchasing'),
(1, @s13_7, '7.5', 'Production and Service Provision'),
(1, @s13_7, '7.6', 'Control of Monitoring and Measuring Equipment'),
-- §8 sub-clauses
(1, @s13_8, '8.2', 'Monitoring and Measurement'),
(1, @s13_8, '8.3', 'Control of Nonconforming Product'),
(1, @s13_8, '8.4', 'Analysis of Data'),
(1, @s13_8, '8.5', 'Improvement');

-- §8.5 sub-sub-clauses (key ones)
SET @s13_85 = LAST_INSERT_ID();
INSERT INTO standard_clauses (standard_id, parent_clause_id, clause_number, title) VALUES
(1, @s13_85, '8.5.1', 'General'),
(1, @s13_85, '8.5.2', 'Corrective Action'),
(1, @s13_85, '8.5.3', 'Preventive Action');

-- §8.2 sub-clauses
SET @s13_82 = @s13_85 - 3;
INSERT INTO standard_clauses (standard_id, parent_clause_id, clause_number, title) VALUES
(1, @s13_82, '8.2.1', 'Feedback'),
(1, @s13_82, '8.2.2', 'Complaint Handling'),
(1, @s13_82, '8.2.3', 'Reporting to Regulatory Authorities'),
(1, @s13_82, '8.2.4', 'Internal Audit'),
(1, @s13_82, '8.2.6', 'Monitoring and Measurement of Product');

-- ─────────────────────────────────────────────────────────────────────────────
-- ISO 14971:2019 Clauses (Risk Management)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO standard_clauses (standard_id, parent_clause_id, clause_number, title) VALUES
(3, NULL, '4',   'General Requirements for a Risk Management System'),
(3, NULL, '5',   'Risk Analysis'),
(3, NULL, '6',   'Risk Evaluation'),
(3, NULL, '7',   'Risk Control'),
(3, NULL, '8',   'Evaluation of Overall Residual Risk'),
(3, NULL, '9',   'Risk Management Review'),
(3, NULL, '10',  'Production and Post-Production Activities');

SET @s14_5 = LAST_INSERT_ID() - 5;
INSERT INTO standard_clauses (standard_id, parent_clause_id, clause_number, title) VALUES
(3, @s14_5, '5.2', 'Intended Use and Identification of Characteristics Related to Safety'),
(3, @s14_5, '5.3', 'Identification of Hazards and Hazardous Situations'),
(3, @s14_5, '5.4', 'Risk Estimation');

-- ─────────────────────────────────────────────────────────────────────────────
-- ISO 27001:2022 Clauses (Information Security – abbreviated)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO standard_clauses (standard_id, parent_clause_id, clause_number, title) VALUES
(4, NULL, '4',  'Context of the Organization'),
(4, NULL, '5',  'Leadership'),
(4, NULL, '6',  'Planning'),
(4, NULL, '7',  'Support'),
(4, NULL, '8',  'Operation'),
(4, NULL, '9',  'Performance Evaluation'),
(4, NULL, '10', 'Improvement');
