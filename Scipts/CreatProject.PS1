# ==========================================
# HBOT-SmartQMS: Cloud SQL Deployment Script
# ==========================================

# 1. הגדרת משתנים (חובה לעדכן את הפרויקט והסיסמאות!)
$PROJECT_ID = "YOUR_PROJECT_ID"
$INSTANCE_NAME = "hbot-qms-db-prod"
$REGION = "me-west1" # אזור תל אביב
$DB_NAME = "hbot_smartqms"
$APP_USER = "qms_app_user"
$APP_PASS = "YourStrongAppPassword123!"
$ROOT_PASS = "YourStrongRootPassword123!"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Starting deployment for HBOT-SmartQMS..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 2. הגדרת הפרויקט ב-CLI
Write-Host "1/5 Setting target project to: $PROJECT_ID" -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# 3. הפעלת ה-API של Cloud SQL
Write-Host "2/5 Enabling Cloud SQL Admin API..." -ForegroundColor Yellow
gcloud services enable sqladmin.googleapis.com

# 4. הקמת השרת (תהליך שלוקח 5-10 דקות)
Write-Host "3/5 Provisioning Cloud SQL Instance ($INSTANCE_NAME)..." -ForegroundColor Yellow
Write-Host "This step takes 5-10 minutes. Please do not close the window." -ForegroundColor Yellow
gcloud sql instances create $INSTANCE_NAME `
    --database-version=MYSQL_8_0 `
    --tier=db-f1-micro `
    --region=$REGION `
    --root-password=$ROOT_PASS `
    --require-ssl `
    --storage-type=SSD `
    --storage-size=10GB

# 5. יצירת מסד הנתונים של מערכת האיכות
Write-Host "4/5 Creating the database ($DB_NAME)..." -ForegroundColor Yellow
gcloud sql databases create $DB_NAME --instance=$INSTANCE_NAME

# 6. יצירת משתמש האפליקציה (עבור Apps Script)
Write-Host "5/5 Creating the application user ($APP_USER)..." -ForegroundColor Yellow
gcloud sql users create $APP_USER `
    --instance=$INSTANCE_NAME `
    --password=$APP_PASS

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Deployment Complete! Your database is live." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green