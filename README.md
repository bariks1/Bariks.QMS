# SmartQMS

> **Generic Quality Management System for small companies using Google Workspace.**
> Built for ISO 13485, ISO 9001, ISO 14971, and ISO 27001 compliance. Powered by Google Apps Script, Cloud SQL, and Gemini AI.

---

## What is SmartQMS?

SmartQMS is a fully digital, AI-assisted Quality Management System that replaces paper-and-Word QMS workflows. It runs entirely inside your Google Workspace environment — no external hosting required.

**Key Features:**
- 📄 **Document Control** — Automated SOP lifecycle with Google Drive integration
- 🔴 **NCR & CAPA Management** — Digital non-conformance reports with AI root cause analysis (HITL)
- ⚠️ **Risk Management** — ISO 14971 risk matrix linked to real failure data, auto-alerts
- 🎓 **Training Management** — Automated SOP distribution with Google Forms competency quizzes
- 📞 **Complaints & Vigilance** — AI-assisted severity classification, vigilance report drafting
- 📚 **Dynamic Standards Library** — Ripple-effect standard updates across all linked content
- 🔒 **Immutable Audit Trail** — FDA 21 CFR Part 11 / ISO 13485 compliant event logging

---

## Architecture

```
Google Workspace Tenant
├── Apps Script Web App (UI + API)  ← serves the interface and handles all logic
├── Google Drive                    ← document storage (Draft / Active / Archive)
├── Google Forms                    ← competency quiz engine
└── Cloud SQL (MySQL 8.0)           ← relational data, audit trail, standards library
    └── Gemini AI API               ← root cause analysis, severity classification
```

**Deployment model:** One GCP project per customer — full data isolation.

---

## Project Structure

```
Bariks.QMS/
├── apps-script/          # All Apps Script source (push with clasp)
│   ├── core/             # Config, Database, Auth, AuditTrail
│   ├── modules/          # 5 QMS modules + Standards engine
│   ├── ai/               # Gemini client + HITL AI features
│   ├── api/              # Web App doGet/doPost router
│   └── ui/               # Frontend HTML/CSS/JS
├── database/
│   ├── schema.sql         # Full MySQL 8.0 schema
│   └── seed_standards.sql # ISO 13485, 9001, 14971, 27001 clause trees
├── scripts/
│   └── NewTenant.ps1      # End-to-end tenant onboarding wizard
├── docs/
│   └── deployment-guide.md
└── tenant.config.example.json  # Config template (never commit actual config)
```

---

## Onboarding a New Tenant

```powershell
.\scripts\NewTenant.ps1 `
  -TenantName "ACME Corp" `
  -ProjectId  "acme-qms-prod" `
  -AdminEmail "admin@acme.com" `
  -Region     "us-central1"
```

This wizard:
1. Provisions a Google Cloud SQL instance
2. Creates the database and app user
3. Runs schema migrations and seeds standards data
4. Revokes UPDATE/DELETE on the audit_log table (immutability)
5. Guides you through Apps Script deployment and Script Properties setup

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI & Logic | Google Apps Script (V8 runtime) |
| Database | Google Cloud SQL – MySQL 8.0 |
| Document Storage | Google Drive |
| Quiz Engine | Google Forms |
| Notifications | Gmail |
| AI | Gemini API (dynamic latest model selection) |
| Security | Google Identity (OAuth), AES-256 at rest, TLS 1.2+ in transit |

---

## Compliance Targets

| Standard | Coverage |
|---|---|
| ISO 13485:2016 | §4.2 Document Control, §6.2 Training, §8.2.2 Complaints, §8.5.2/3 CAPA |
| ISO 14971:2019 | Risk Analysis, Risk Control, Occurrence Monitoring |
| ISO 9001:2015  | General QMS (non-medical customers) |
| ISO 27001:2022 | Information security management |
| FDA 21 CFR Part 11 | Audit trail, electronic signatures |
| EU MDR | Article 87 Vigilance reporting |

---

## Languages

- **English** (primary)
- **Hebrew** — UI RTL support, `utf8mb4` database encoding

---

## Security Notes

- `tenant.config.json` and `tenant.credentials.json` are in `.gitignore` — **never commit them**
- The `audit_log` table has `UPDATE`/`DELETE` privileges revoked for the app user
- All DB queries use parameterized statements (no string concatenation, no SQL injection)
- API keys are stored in Apps Script Script Properties, never in source code

---

## License

MIT — free to use and adapt for your organization.
