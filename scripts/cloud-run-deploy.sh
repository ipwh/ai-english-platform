#!/usr/bin/env bash
# ============================================
# Cloud Run Deploy Script
# 使用 Cloud Build 建構 → 不需本機 Docker！
# 取代: Vercel auto-deploy + scripts/vercel-build.js
# ============================================
#
# 使用方式:
#   bash scripts/cloud-run-deploy.sh [PROJECT_ID] [REGION]
#
# 範例:
#   bash scripts/cloud-run-deploy.sh my-gcp-project asia-east2

set -euo pipefail

PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-}}"
REGION="${2:-asia-east2}"
SERVICE_NAME="english-platform"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ PROJECT_ID is required. Usage: bash scripts/cloud-run-deploy.sh <PROJECT_ID> [REGION]"
  exit 1
fi

echo "============================================"
echo " Cloud Run Deploy — AI English Platform"
echo " (Cloud Build — no local Docker needed)"
echo "============================================"
echo " Project:     ${PROJECT_ID}"
echo " Region:      ${REGION}"
echo " Service:     ${SERVICE_NAME}"
echo " Image:       ${IMAGE_NAME}:${TIMESTAMP}"
echo "============================================"
echo ""

# Step 1: Verify gcloud
echo "🔧 Step 1/3: Verifying gcloud setup..."
gcloud config set project "${PROJECT_ID}"
echo "✅ gcloud project set to ${PROJECT_ID}"

# Step 2: Build & Push using Cloud Build (no local Docker!)
echo ""
echo "🔧 Step 2/3: Building & pushing with Cloud Build..."
echo "   (This sends source to GCP, builds Docker image in the cloud,"
echo "    and pushes to Container Registry — all remote, ~3-5 minutes)"
echo ""

gcloud builds submit \
  --tag "${IMAGE_NAME}:${TIMESTAMP}" \
  --tag "${IMAGE_NAME}:latest" \
  --timeout 1200 \
  --machine-type e2-highcpu-8 \
  .

echo "✅ Image built and pushed: ${IMAGE_NAME}:${TIMESTAMP}"

# Step 3: Deploy to Cloud Run
echo ""
echo "🔧 Step 3/3: Deploying to Cloud Run..."

gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}:latest" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --timeout 300 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 20 \
  --concurrency 80 \
  --cpu-boost \
  --set-env-vars "NODE_ENV=production"

echo "✅ Deployed to Cloud Run"

# Verify
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format 'value(status.url)')

echo ""
echo "============================================"
echo " 🎉 Deployment Complete!"
echo "============================================"
echo " Service URL:  ${SERVICE_URL}"
echo " Health Check: ${SERVICE_URL}/api/health"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Set environment variables in Cloud Console:"
echo "     https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}/revisions"
echo "  2. View logs:"
echo "     gcloud run services logs tail ${SERVICE_NAME} --region=${REGION}"
echo ""
