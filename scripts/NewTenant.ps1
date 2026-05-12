# ============================================================================
# SmartQMS – NewTenant.ps1
# Full end-to-end tenant onboarding wizard.
# Provisions GCP Cloud SQL, deploys Apps Script, and seeds the database.
#
# Usage:
#   .\scripts\NewTenant.ps1 -TenantName "ACME Corp" -ProjectId "acme-qms-prod" `
#                           -AdminEmail "admin@acme.com" -Region "us-central1"
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - clasp installed (npm install -g @google/clasp) and authenticated (clasp login)
#   - mysql client available on PATH
# ============================================================================
param(
  [Parameter(Mandatory)][string] $TenantName,
  [Parameter(Mandatory)][string] $ProjectId,
  [Parameter(Mandatory)][string] $AdminEmail,
  [string] $Region        = "me-west1",
  [string] $InstanceName  = "smartqms-db-prod",
  [string] $DbName        = "smartqms",
  [string] $AppUser       = "qms_app",
  [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot

function Step($n, $total, $msg) {
  Write-Host ""
  Write-Host "[$n/$total] $msg" -ForegroundColor Cyan
}
function OK($msg)   { Write-Host "  ✅ $msg" -ForegroundColor Green }
function WARN($msg) { Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function FAIL($msg) { Write-Host "  ❌ $msg" -ForegroundColor Red; exit 1 }

# ─────────────────────────────────────────────────────────────────────────────
$TOTAL_STEPS = 7
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║          SmartQMS – New Tenant Wizard            ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Tenant   : $TenantName"
Write-Host "  GCP Proj : $ProjectId"
Write-Host "  Region   : $Region"
Write-Host "  Admin    : $AdminEmail"
if ($DryRun) { WARN "DRY RUN MODE — no changes will be made." }
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
Step 1 $TOTAL_STEPS "Setting GCP project context"
if (-not $DryRun) {
  gcloud config set project $ProjectId 2>&1 | Out-Null
  gcloud services enable sqladmin.googleapis.com --quiet 2>&1 | Out-Null
}
OK "Project set to: $ProjectId"

# ─────────────────────────────────────────────────────────────────────────────
Step 2 $TOTAL_STEPS "Generating secure passwords"
$RootPass = [System.Web.Security.Membership]::GeneratePassword(24, 4)
$AppPass  = [System.Web.Security.Membership]::GeneratePassword(24, 4)

# Store passwords in a local credentials file (NOT committed to git)
$CredsPath = Join-Path $ScriptDir "..\tenant.credentials.json"
$creds = @{
  tenantName   = $TenantName
  projectId    = $ProjectId
  instanceName = $InstanceName
  dbName       = $DbName
  appUser      = $AppUser
  rootPass     = $RootPass
  appPass      = $AppPass
  generatedAt  = (Get-Date -Format "o")
} | ConvertTo-Json
if (-not $DryRun) { $creds | Set-Content $CredsPath -Encoding UTF8 }
OK "Credentials saved to tenant.credentials.json (add to .gitignore!)"

# ─────────────────────────────────────────────────────────────────────────────
Step 3 $TOTAL_STEPS "Provisioning Cloud SQL instance (this takes 5-10 minutes)"
if (-not $DryRun) {
  gcloud sql instances create $InstanceName `
    --database-version=MYSQL_8_0 `
    --tier=db-f1-micro `
    --region=$Region `
    --root-password=$RootPass `
    --require-ssl `
    --storage-type=SSD `
    --storage-size=10GB `
    --quiet
  gcloud sql databases create $DbName --instance=$InstanceName --quiet
  gcloud sql users create $AppUser --instance=$InstanceName --password=$AppPass --quiet
}
OK "Cloud SQL instance '$InstanceName' ready. Database: '$DbName'. User: '$AppUser'."

# ─────────────────────────────────────────────────────────────────────────────
Step 4 $TOTAL_STEPS "Getting Cloud SQL public IP"
$DbHost = ""
if (-not $DryRun) {
  $DbHost = (gcloud sql instances describe $InstanceName --format="value(ipAddresses[0].ipAddress)").Trim()
  if (-not $DbHost) { FAIL "Could not retrieve Cloud SQL IP. Check GCP console." }
  OK "Cloud SQL IP: $DbHost"
} else {
  $DbHost = "DRY_RUN_IP"
  OK "Dry run — skipping IP fetch."
}

# ─────────────────────────────────────────────────────────────────────────────
Step 5 $TOTAL_STEPS "Running database migrations (schema + seed data)"
$SchemaPath = Join-Path $ScriptDir "..\database\schema.sql"
$SeedPath   = Join-Path $ScriptDir "..\database\seed_standards.sql"

if (-not $DryRun) {
  mysql --host=$DbHost --user=root --password=$RootPass --ssl-mode=REQUIRED `
    $DbName < $SchemaPath
  if ($LASTEXITCODE -ne 0) { FAIL "schema.sql failed." }

  mysql --host=$DbHost --user=root --password=$RootPass --ssl-mode=REQUIRED `
    $DbName < $SeedPath
  if ($LASTEXITCODE -ne 0) { FAIL "seed_standards.sql failed." }

  # Revoke UPDATE/DELETE on audit_log for app user
  $revokeCmd = "REVOKE UPDATE, DELETE ON ${DbName}.audit_log FROM '${AppUser}'@'%';"
  echo $revokeCmd | mysql --host=$DbHost --user=root --password=$RootPass --ssl-mode=REQUIRED
}
OK "Schema applied. Standards seed data loaded. audit_log locked (no UPDATE/DELETE for app user)."

# ─────────────────────────────────────────────────────────────────────────────
Step 6 $TOTAL_STEPS "Deploying Apps Script project"
WARN "clasp deployment requires a Script ID. If this is a new project:"
WARN "  1. Go to script.google.com and create a new project."
WARN "  2. Copy the Script ID from Project Settings."
WARN "  3. Update apps-script/.clasp.json with the Script ID."
WARN "  4. Run: clasp push --force"
WARN "  5. Deploy as Web App from the Apps Script editor."

Write-Host ""
$ScriptId = Read-Host "  Enter your Apps Script Script ID (or press Enter to skip)"
if ($ScriptId -and -not $DryRun) {
  $ClaspConfig = @{ scriptId = $ScriptId; rootDir = "./apps-script" } | ConvertTo-Json
  $ClaspConfig | Set-Content (Join-Path $ScriptDir "..\apps-script\.clasp.json") -Encoding UTF8
  Push-Location (Join-Path $ScriptDir "..")
  clasp push --force
  Pop-Location
  OK "Apps Script deployed. Script ID: $ScriptId"
} else {
  WARN "Skipped clasp deployment. Run manually when ready."
}

# ─────────────────────────────────────────────────────────────────────────────
Step 7 $TOTAL_STEPS "Setting Apps Script Script Properties"
Write-Host ""
Write-Host "  Set the following Script Properties in your Apps Script project:" -ForegroundColor Yellow
Write-Host "  (Project Settings → Script Properties → Add property)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  QMS_TENANT_NAME         = $TenantName"
Write-Host "  QMS_ADMIN_EMAIL         = $AdminEmail"
Write-Host "  QMS_DB_HOST             = $DbHost"
Write-Host "  QMS_DB_NAME             = $DbName"
Write-Host "  QMS_DB_USER             = $AppUser"
Write-Host "  QMS_DB_PASS             = [see tenant.credentials.json]"
Write-Host "  QMS_GEMINI_API_KEY      = [your Gemini API key]"
Write-Host "  QMS_DRIVE_ROOT_ID       = [your Google Drive QMS root folder ID]"
Write-Host "  QMS_LOCALE              = en"
Write-Host "  QMS_PASSING_SCORE       = 80"
Write-Host "  QMS_RISK_ALERT_THRESHOLD= 3"
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          Onboarding Complete!                    ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host "  1. Set all Script Properties listed above in Apps Script"
Write-Host "  2. Deploy the Web App (Execute as: User accessing, Access: Domain)"
Write-Host "  3. Add the first admin user to the 'users' table"
Write-Host "  4. Share the Web App URL with your team"
Write-Host ""
Write-Host "  Credentials file: $CredsPath"
Write-Host "  ⚠️  Add tenant.credentials.json to .gitignore immediately!" -ForegroundColor Red
Write-Host ""
