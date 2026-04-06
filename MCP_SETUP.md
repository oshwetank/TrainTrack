# MCP Setup Guide — TrainTrack

This document explains how to wire the two MCP servers used by TrainTrack into
**Antigravity / Stitch MCP**, and exactly how to fix the two bootstrap errors
you will encounter on a fresh Windows machine.

---

## Table of Contents

1. [Error Reference](#error-reference)
2. [Cloud Run MCP — Setup & Fix](#cloud-run-mcp)
3. [GitHub MCP — No-Docker Setup (Recommended)](#github-mcp-no-docker)
4. [GitHub MCP — Docker Setup (Optional)](#github-mcp-docker)
5. [Antigravity mcp\_config.json — Full Reference](#antigravity-mcp_configjson)
6. [Verification Checklist](#verification-checklist)

---

## Error Reference

### Error 1 — Cloud Run MCP: `Cannot find package 'google-auth-library'`

```
Error: Cannot find package 'google-auth-library' imported from .../index.js
```

**Root cause**: The Cloud Run MCP server (`mcp/cloud-run/`) has not had its npm
dependencies installed yet.  
**Fix**: `cd mcp/cloud-run && npm install`  
`google-auth-library` is declared in `mcp/cloud-run/package.json` and will be
resolved automatically after install.

---

### Error 2 — GitHub MCP: `'docker' is not recognized as an internal or external command`

```
'docker' is not recognized as an internal or external command, operable program or batch file.
```

**Root cause**: The GitHub MCP default launch command tries to pull and run a
Docker image, but Docker Desktop is not installed or not in `%PATH%`.  
**Fix**: Use the **no-Docker** variant, which runs the server with `npx`
directly. See [GitHub MCP — No-Docker Setup](#github-mcp-no-docker) below.

---

## Cloud Run MCP

### Purpose

Exposes Google Cloud Run service inspection as MCP tools so Antigravity can
list services, check revision health, and monitor deployments — all from chat.

### Prerequisites

| Requirement | How to satisfy |
|---|---|
| Node.js ≥ 20 | `winget install OpenJS.NodeJS.LTS` or https://nodejs.org |
| GCP project | Create at https://console.cloud.google.com |
| Auth credentials | Either ADC (recommended) or a service account key |

### Step 1 — Authenticate with Google Cloud

**Option A — Application Default Credentials (ADC) — recommended for local dev**

```powershell
# Install gcloud CLI if not installed:
# winget install Google.CloudSDK

gcloud auth application-default login
```

No `GOOGLE_APPLICATION_CREDENTIALS` env var needed when using ADC.

**Option B — Service Account Key**

```powershell
# Download a JSON key from GCP Console → IAM → Service Accounts
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\your-key.json"
# Put this in your PowerShell profile to persist:
# notepad $PROFILE
```

### Step 2 — Install Dependencies

```powershell
cd C:\path\to\TrainTrack\mcp\cloud-run
npm install
```

This installs:
- `@google-cloud/run` — Cloud Run Admin API client
- `google-auth-library` — **the missing dependency that causes Error 1**
- `@modelcontextprotocol/sdk` — MCP stdio server framework

### Step 3 — Set Project ID

```powershell
# In PowerShell (current session):
$env:GOOGLE_CLOUD_PROJECT = "your-gcp-project-id"

# To persist permanently, add to your PowerShell profile:
# [System.Environment]::SetEnvironmentVariable("GOOGLE_CLOUD_PROJECT","your-gcp-project-id","User")
```

### Step 4 — Test the Server

```powershell
cd C:\path\to\TrainTrack\mcp\cloud-run
node index.js
# Should print: [cloud-run-mcp] Server running on stdio
# Press Ctrl+C to stop.
```

### Step 5 — Add to Antigravity mcp\_config.json

See the [full config reference](#antigravity-mcp_configjson) below.

---

## GitHub MCP — No-Docker Setup (Recommended)

> **This is the fix for Error 2.** Using `npx` eliminates the Docker dependency
> entirely. No Docker Desktop installation required.

### Prerequisites

| Requirement | How to satisfy |
|---|---|
| Node.js ≥ 18 | Already needed for Cloud Run MCP |
| GitHub Personal Access Token (PAT) | See below |

### Step 1 — Create a GitHub PAT

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Set expiry, select scopes:
   - `repo` (full control of private repositories)
   - `read:org` (for org-level operations, optional)
4. Copy the token — you only see it once.

### Step 2 — Set the Environment Variable

```powershell
# Current session:
$env:GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Persist permanently (recommended):
[System.Environment]::SetEnvironmentVariable(
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "User"
)
```

### Step 3 — Test manually (optional)

```powershell
npx -y @modelcontextprotocol/server-github
# Should start and await stdio input. Press Ctrl+C.
```

### Step 4 — Add to Antigravity mcp\_config.json

See the [full config reference](#antigravity-mcp_configjson) below.

---

## GitHub MCP — Docker Setup (Optional)

> Only follow this if you explicitly prefer Docker-based isolation.
> Requires Docker Desktop installed and running.

### Prerequisites

1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Ensure `docker` is in `%PATH%` (restart shell after install).
3. Have your GitHub PAT ready (same as above).

### mcp\_config.json Entry

```json
"github": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "--env", "GITHUB_PERSONAL_ACCESS_TOKEN",
    "ghcr.io/github/github-mcp-server"
  ],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-pat-here>"
  }
}
```

> Replace `<your-pat-here>` with your actual token, or use an environment
> variable reference if your MCP client supports it.

---

## Antigravity mcp\_config.json

Location: `C:\Users\<you>\.gemini\antigravity\mcp_config.json`

### Full Config (No-Docker — Recommended)

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "@google/mcp-server-stitch"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    },
    "cloud-run": {
      "command": "node",
      "args": ["C:\\path\\to\\TrainTrack\\mcp\\cloud-run\\index.js"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-gcp-project-id"
      }
    }
  }
}
```

> **Security note**: Never commit your PAT or service account key to Git.
> Use `%GITHUB_PERSONAL_ACCESS_TOKEN%` env var injection where possible, and
> add `mcp_config.json` to `.gitignore` if it contains secrets.

### Windows Path Escaping

All backslashes in JSON must be doubled:
```json
"C:\\Users\\shwet\\TrainTrack\\mcp\\cloud-run\\index.js"
```

### How This Eliminates the Two Errors

| Error | Cause | Fix applied by this config |
|---|---|---|
| `Cannot find package 'google-auth-library'` | Dependencies not installed | `npm install` in `mcp/cloud-run/` adds it |
| `'docker' is not recognized` | Docker not in PATH | Replaced `docker run ...` with `npx` command |

---

## Verification Checklist

After applying the config, restart Antigravity and run these checks:

### Cloud Run MCP

- [ ] Antigravity shows `cloud-run` in its connected MCP list
- [ ] Ask: *"List my Cloud Run services in asia-south1"* — should return JSON

### GitHub MCP

- [ ] Antigravity shows `github` in its connected MCP list
- [ ] Ask: *"List open pull requests in oshwetank/TrainTrack"* — should return PR list
- [ ] Ask: *"Create a file in oshwetank/TrainTrack"* — should work without Docker errors

### Stitch MCP

- [ ] Antigravity shows `stitch` in its connected MCP list
- [ ] UI generation commands respond as expected

---

*Committed by Antigravity — `docs: add MCP setup and error fixes`*
