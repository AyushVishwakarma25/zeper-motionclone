#!/usr/bin/env bash
# Deploy MotionClone to Google Cloud Run with Vertex AI integration
set -e

PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="motionclone-studio"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No GCP Project configured. Run 'gcloud config set project <PROJECT_ID>'"
  exit 1
fi

echo "Deploying MotionClone to Google Cloud Run in project: $PROJECT_ID, region: $REGION..."

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
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,VERTEXAI_LOCATION_TEXT=global,VERTEXAI_LOCATION_VIDEO=us-central1,FRAMEFORGE_HOSTED=1"

echo "MotionClone is deployed and running on Google Cloud Run!"
