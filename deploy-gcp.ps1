# Deploy MotionClone to Google Cloud Run with Vertex AI integration
$ErrorActionPreference = 'Stop'

$projectId = (& gcloud config get-value project 2>$null)
if (-not $projectId) {
    Write-Error "No GCP Project selected. Run 'gcloud config set project <PROJECT_ID>'"
    exit 1
}

$region = if ($env:GOOGLE_CLOUD_LOCATION) { $env:GOOGLE_CLOUD_LOCATION } else { "us-central1" }
$serviceName = "motionclone-studio"

Write-Host "Deploying MotionClone to Google Cloud Run in project: $projectId, region: $region..." -ForegroundColor Cyan

# 1. Enable required APIs
Write-Host "Enabling Google Cloud APIs..." -ForegroundColor Yellow
& gcloud services enable aiplatform.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com texttospeech.googleapis.com

# 2. Deploy directly with Cloud Run
Write-Host "Building container and deploying to Cloud Run..." -ForegroundColor Yellow
& gcloud run deploy $serviceName `
    --source . `
    --region $region `
    --platform managed `
    --memory 4Gi `
    --cpu 2 `
    --timeout 900 `
    --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$projectId,GOOGLE_CLOUD_LOCATION=$region,VERTEXAI_LOCATION_TEXT=global,VERTEXAI_LOCATION_VIDEO=us-central1,FRAMEFORGE_HOSTED=1"

Write-Host "MotionClone successfully deployed to Google Cloud Run!" -ForegroundColor Green
