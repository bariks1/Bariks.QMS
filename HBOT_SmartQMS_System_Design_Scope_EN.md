# System Design & Scope: HBOT-SmartQMS

**Version:** 1.0  
**Status:** Draft for Regulatory Approval  
**Entity:** Quality & Engineering Department  

---

## 1. Strategic Vision and Project Objectives
The transition from legacy, paper-and-Word-based quality management to the HBOT-SmartQMS is a strategic imperative for the development of mobile hyperbaric oxygen chambers (HBOT). In a high-stakes regulatory environment where patient safety is paramount, this digital transformation replaces static documentation with a dynamic, intelligence-driven infrastructure. The objective is to ensure that compliance is a continuous byproduct of daily operations, eliminating data silos and strictly adhering to ISO 13485:2016 and FDA regulations.

## 2. Scope of the System
The system will consist of five interconnected, modular components:

### A. Document Control & SOPs
* **Functionality:** Automated document lifecycles (Draft → Review → Approved → Obsolete), preventing the use of expired procedures.
* **Traceability:** Implementation of Role-Based Access Control (RBAC) and an immutable Audit Trail recording all modifications.

### B. Non-Conformance (NCR) & CAPA Management
* **Functionality:** Digital field reporting linked to specific Device Serial Numbers (S/N) for absolute traceability.
* **AI Engine:** Integration of Gemini AI for root cause synthesis and bilingual technical drafting, operating strictly under a Human-In-The-Loop (HITL) protocol where AI suggestions must be reviewed and signed off by a human expert.

### C. Risk Management (ISO 14971)
* **Functionality:** A dynamic risk matrix linked directly to real-world field failure data. The system automatically triggers "Risk Alerts" forcing a review of the Risk Management File if failure frequencies (Occurrence) exceed predefined thresholds.

### D. Training Management
* **Functionality:** Automated distribution of updated SOPs with digital competency questionnaires. Training is only marked complete once the employee passes the assessment, objectively proving training effectiveness.

### E. Complaints & Vigilance
* **Functionality:** Centralized logging of customer complaints with AI-assisted severity classification to help determine if regulatory reporting (e.g., MDR, Recalls) is required.

## 3. The Dynamic Standards Library Engine
The "regulatory brain" of the system, decoupling regulatory requirements from individual documents to maintain compliance agility.
* **Mechanism:** A secure master database (Google Cloud SQL) managed exclusively by the Regulatory Manager.
* **The Ripple Effect:** Updates to a standard (e.g., transitioning from MDD to MDR) automatically propagate across all linked QMS modules, forms, checklists, and dropdown menus without manual editing.

## 4. Regulatory Compliance & Validation Framework
Engineered from the ground up to satisfy the stringent requirements of FDA 21 CFR Part 11 and EU Annex 11:
* **Audit Trail:** Immutable, timestamped, and user-linked event logs for all system-level creations, modifications, and deletions.
* **Electronic Signatures:** Secure, validated e-signatures required for document approvals, CAPA closures, and AI draft approvals.
* **Computer Software Validation (CSV):** A risk-based validation strategy encompassing Installation Qualification (IQ), Operational Qualification (OQ), and Performance Qualification (PQ).

## 5. Core Technological Infrastructure (The Stack)
* **Infrastructure:** Google Workspace Enterprise (Drive, Forms, Sites).
* **Database Engine:** Google Cloud SQL (MySQL 8.0) ensuring relational traceability, data integrity, and automated backups.
* **Logic Layer:** Google Apps Script for server-side automation and RESTful API orchestration.
* **Intelligence Layer:** Google Gemini API (Flash 1.5 for rapid triage/classification; Pro for deep reasoning and regulatory cross-referencing).
* **Security:** Google Cloud Secret Manager for credential vaulting, AES-256 encryption at rest, TLS 1.2+ in transit, and Multi-Factor Authentication (2FA).

## 6. Implementation Roadmap
Execution follows a phased approach to mitigate transition risk and ensure proper system validation at each milestone.
* **Phase 1 - Core Foundation:** Deployment of the Google Cloud SQL database, Dynamic Standards Library, and the NCR module with S/N tracking.
* **Phase 2 - Governance:** Deployment of Document Control, Electronic Signatures, and the Competency/Training Module.
* **Phase 3 - Intelligence:** Integration of the ISO 14971 Risk Management Matrix and real-time KPI Dashboards for executive oversight.
