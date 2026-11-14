#!/usr/bin/env bash
# Deploy MotionClone to Google Cloud Run with Vertex AI integration
set -e

DRY_RUN=false
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN=true
  fi
done

PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "zeperai")
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID="zeperai"
fi

REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="motionclone-studio"
GEMINI_LOC="${GEMINI_LOCATION:-global}"
FIREBASE_API_KEY="${FIREBASE_WEB_API_KEY:-AIzaSyDemoPlaceholderKey}"
FIREBASE_ID="${FIREBASE_APP_ID:-1:123456789:web:abcdef}"
FIREBASE_DOMAIN="${FIREBASE_AUTH_DOMAIN:-$PROJECT_ID.firebaseapp.com}"
EMAILS="${ALLOWED_EMAILS:-owner@zeper.ai,admin@zeper.ai}"

ENV_VARS="GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,VERTEXAI_LOCATION_TEXT=global,VERTEXAI_LOCATION_VIDEO=us-central1,GEMINI_LOCATION=$GEMINI_LOC,FRAMEFORGE_HOSTED=1,FIREBASE_WEB_API_KEY=$FIREBASE_API_KEY,FIREBASE_APP_ID=$FIREBASE_ID,FIREBASE_AUTH_DOMAIN=$FIREBASE_DOMAIN,ALLOWED_EMAILS=$EMAILS"

echo "Deploying MotionClone to Google Cloud Run in project: $PROJECT_ID, region: $REGION..."

if [ "$DRY_RUN" = true ]; then
  echo "--- DRY RUN MODE ---"
  echo "1. Would enable APIs:"
  echo "   gcloud services enable aiplatform.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com texttospeech.googleapis.com"
  echo "2. Would deploy Cloud Run service:"
  echo "   gcloud run deploy \"$SERVICE_NAME\" --source . --region \"$REGION\" --platform managed --memory 4Gi --cpu 2 --timeout 900 --set-env-vars \"$ENV_VARS\""
  echo "--- Dry run complete. No commands executed. ---"
  exit 0
fi

# 1. Enable required Google Cloud APIs
echo "Enabling Vertex AI, Cloud Run, Cloud Build, Artifact Registry, and Text-to-Speech APIs..."
gcloud services enable \
  aiplatform.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  texttospeech.googleapis.com

# 2. Deploy directly with Cloud Run Source Deploy
echo "Building container and deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --memory 4Gi \
  --cpu 2 \
  --timeout 900 \
  --set-env-vars "$ENV_VARS"

echo "MotionClone is deployed and running on Google Cloud Run!"
