param (
    [switch]$DryRun
)

# Deploy MotionClone to Google Cloud Run with Vertex AI integration
$ErrorActionPreference = 'Stop'

$projectId = (& gcloud config get-value project 2>$null)
if (-not $projectId) {
    $projectId = "zeperai"
}

$region = if ($env:GOOGLE_CLOUD_LOCATION) { $env:GOOGLE_CLOUD_LOCATION } else { "us-central1" }
$serviceName = "motionclone-studio"
$geminiLoc = if ($env:GEMINI_LOCATION) { $env:GEMINI_LOCATION } else { "global" }
$firebaseApiKey = if ($env:FIREBASE_WEB_API_KEY) { $env:FIREBASE_WEB_API_KEY } else { "AIzaSyDemoPlaceholderKey" }
$firebaseAppId = if ($env:FIREBASE_APP_ID) { $env:FIREBASE_APP_ID } else { "1:123456789:web:abcdef" }
$firebaseAuthDomain = if ($env:FIREBASE_AUTH_DOMAIN) { $env:FIREBASE_AUTH_DOMAIN } else { "$projectId.firebaseapp.com" }
$allowedEmails = if ($env:ALLOWED_EMAILS) { $env:ALLOWED_EMAILS } else { "owner@zeper.ai,admin@zeper.ai,reachtoayush25@gmail.com" }

$envVars = "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$projectId,GOOGLE_CLOUD_LOCATION=$region,VERTEXAI_LOCATION_TEXT=$geminiLoc,VERTEXAI_LOCATION_VIDEO=us-central1,GEMINI_LOCATION=$geminiLoc,FRAMEFORGE_HOSTED=1,FIREBASE_WEB_API_KEY=$firebaseApiKey,FIREBASE_APP_ID=$firebaseAppId,FIREBASE_AUTH_DOMAIN=$firebaseAuthDomain,ALLOWED_EMAILS=$allowedEmails"

Write-Host "Deploying MotionClone to Google Cloud Run in project: $projectId, region: $region..." -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "--- DRY RUN MODE ---" -ForegroundColor Yellow
    Write-Host "1. Would enable APIs:"
    Write-Host "   gcloud services enable aiplatform.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com texttospeech.googleapis.com speech.googleapis.com firestore.googleapis.com storage.googleapis.com"
    Write-Host "2. Would deploy Cloud Run service:"
    $maskedVars = $envVars -replace 'FIREBASE_WEB_API_KEY=[^,]*', 'FIREBASE_WEB_API_KEY=[REDACTED]'
    Write-Host "   gcloud run deploy $serviceName --source . --region $region --platform managed --memory 8Gi --cpu 4 --timeout 3600 --min-instances 0 --max-instances 1 --cpu-throttling --set-env-vars `"$maskedVars`""
    Write-Host "--- Dry run complete. No commands executed. ---" -ForegroundColor Green
    exit 0
}

# 1. Enable required APIs
Write-Host "Enabling Google Cloud APIs..." -ForegroundColor Yellow
& gcloud services enable aiplatform.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com texttospeech.googleapis.com speech.googleapis.com firestore.googleapis.com storage.googleapis.com

# 2. Deploy directly with Cloud Run
Write-Host "Building container and deploying to Cloud Run..." -ForegroundColor Yellow
& gcloud run deploy $serviceName `
    --source . `
    --region $region `
    --platform managed `
    --memory 8Gi `
    --cpu 4 `
    --timeout 3600 `
    --min-instances 0 `
    --max-instances 1 `
    --cpu-throttling `
    --env-vars-file cloudrun-env.yaml

Write-Host "MotionClone successfully deployed to Google Cloud Run!" -ForegroundColor Green
