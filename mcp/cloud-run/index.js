/**
 * TrainTrack — Cloud Run MCP Server (index.js)
 *
 * Exposes Google Cloud Run service management as MCP tools so Antigravity /
 * Stitch MCP can inspect, deploy, and manage the TrainTrack backend directly.
 *
 * Requires:
 *   GOOGLE_APPLICATION_CREDENTIALS  path to service-account JSON key, OR
 *   GOOGLE_CLOUD_PROJECT             your GCP project ID (for ADC)
 *
 * Start:  node index.js   (or via start-cloud-run-mcp.cmd / .sh)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ServicesClient } from "@google-cloud/run";
import { GoogleAuth } from "google-auth-library";

// ── Auth ──────────────────────────────────────────────────────────────────────
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

if (!PROJECT_ID) {
  console.error(
    "[cloud-run-mcp] ERROR: Set GOOGLE_CLOUD_PROJECT environment variable."
  );
  process.exit(1);
}

const runClient = new ServicesClient({ auth });

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "cloud-run-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool Definitions ──────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_cloud_run_services",
      description: "List all Cloud Run services in the project",
      inputSchema: {
        type: "object",
        properties: {
          region: {
            type: "string",
            description: "GCP region (e.g. asia-south1). Defaults to all regions.",
          },
        },
      },
    },
    {
      name: "get_cloud_run_service",
      description: "Get details of a specific Cloud Run service",
      inputSchema: {
        type: "object",
        required: ["service_name", "region"],
        properties: {
          service_name: { type: "string", description: "Service name" },
          region: { type: "string", description: "GCP region" },
        },
      },
    },
    {
      name: "get_cloud_run_revisions",
      description: "List revisions for a Cloud Run service",
      inputSchema: {
        type: "object",
        required: ["service_name", "region"],
        properties: {
          service_name: { type: "string" },
          region: { type: "string" },
        },
      },
    },
  ],
}));

// ── Tool Handlers ─────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    if (name === "list_cloud_run_services") {
      const region = args?.region || "-"; // '-' = all regions
      const parent = `projects/${PROJECT_ID}/locations/${region}`;
      const [services] = await runClient.listServices({ parent });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              services.map((s) => ({
                name: s.name,
                uri: s.uri,
                latestRevision: s.latestReadyRevision,
                conditions: s.conditions?.map((c) => c.type),
              })),
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "get_cloud_run_service") {
      const { service_name, region } = args;
      const name_path = `projects/${PROJECT_ID}/locations/${region}/services/${service_name}`;
      const [service] = await runClient.getService({ name: name_path });
      return {
        content: [{ type: "text", text: JSON.stringify(service, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[cloud-run-mcp] Server running on stdio");
