#!/usr/bin/env bash
# TrainTrack — Cloud Run MCP Startup Script (Linux/Mac/WSL)
# Usage:  ./start-cloud-run-mcp.sh
#
# Required environment variables:
#   GOOGLE_CLOUD_PROJECT             Your GCP project ID
#   GOOGLE_APPLICATION_CREDENTIALS  Path to service account JSON key
#                                    (omit if using `gcloud auth application-default login`)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Validate required env var
if [[ -z "${GOOGLE_CLOUD_PROJECT:-}" ]]; then
  echo "[ERROR] GOOGLE_CLOUD_PROJECT is not set."
  echo "        export GOOGLE_CLOUD_PROJECT=your-project-id"
  exit 1
fi

# Install deps if missing
if [[ ! -d "${SCRIPT_DIR}/node_modules" ]]; then
  echo "[INFO] node_modules not found. Running npm install..."
  cd "${SCRIPT_DIR}" && npm install
fi

echo "[INFO] Starting Cloud Run MCP server for project: ${GOOGLE_CLOUD_PROJECT}"
exec node "${SCRIPT_DIR}/index.js"
