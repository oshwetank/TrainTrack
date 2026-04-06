@echo off
:: TrainTrack — Cloud Run MCP Startup Script (Windows)
:: Usage: start-cloud-run-mcp.cmd
::
:: Required environment variables (set before running or in your shell profile):
::   GOOGLE_CLOUD_PROJECT             Your GCP project ID
::   GOOGLE_APPLICATION_CREDENTIALS  Path to your service account JSON key
::                                    (skip if using gcloud ADC: `gcloud auth application-default login`)

SET "SCRIPT_DIR=%~dp0"

:: Validate required env var
IF "%GOOGLE_CLOUD_PROJECT%"=="" (
    echo [ERROR] GOOGLE_CLOUD_PROJECT is not set.
    echo         Set it with: set GOOGLE_CLOUD_PROJECT=your-project-id
    exit /b 1
)

:: Install dependencies if node_modules is missing
IF NOT EXIST "%SCRIPT_DIR%node_modules" (
    echo [INFO] node_modules not found. Running npm install...
    cd /d "%SCRIPT_DIR%" && npm install
    IF %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed. Ensure Node.js >= 20 is installed.
        exit /b 1
    )
)

echo [INFO] Starting Cloud Run MCP server for project: %GOOGLE_CLOUD_PROJECT%
node "%SCRIPT_DIR%index.js"
