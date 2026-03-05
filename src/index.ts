#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.VERFI_API_URL || "https://api.verfi.io/tenant/v1";
const API_KEY = process.env.VERFI_API_KEY || "";

async function apiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// --- Server ---

const server = new McpServer({
  name: "verfi",
  version: "0.1.0",
});

// --- Tools ---

server.tool(
  "verfi_search_session",
  "Look up a consent session by Verfi ID. Optionally verify email/phone hashes match. Returns session status, metadata, and PII verification results.",
  {
    verfiID: z.string().describe("Verfi session ID (e.g. VF-a1b2c3d4) or full proof URL"),
    email: z.string().optional().describe("SHA-256 hash of email to verify against session"),
    phone: z.string().optional().describe("SHA-256 hash of phone to verify against session"),
  },
  async ({ verfiID, email, phone }) => {
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (phone) params.set("phone", phone);
    const qs = params.toString() ? `?${params}` : "";
    const { data } = await apiCall("GET", `/sessions/${encodeURIComponent(verfiID)}${qs}`);
    return textResult(data);
  }
);

server.tool(
  "verfi_get_proof",
  "Get machine-readable consent proof for a session. Returns structured data including consent status, interaction metrics, form data, device info, and tamper verification. All PII is SHA-256 hashed.",
  {
    verfiID: z.string().describe("Verfi session ID (e.g. VF-a1b2c3d4)"),
  },
  async ({ verfiID }) => {
    const { data } = await apiCall("GET", `/sessions/${encodeURIComponent(verfiID)}/proof`);
    return textResult(data);
  }
);

server.tool(
  "verfi_verify_consent",
  "Verify consent validity for a lead. Given a Verfi ID and optional PII hashes, returns whether consent was given, TCPA compliance status, and interaction quality. This is the primary tool for checking if a lead has valid consent before contacting them.",
  {
    verfiID: z.string().describe("Verfi session ID (e.g. VF-a1b2c3d4)"),
    email_hash: z.string().optional().describe("SHA-256 hash of the consumer's email to verify binding"),
    phone_hash: z.string().optional().describe("SHA-256 hash of the consumer's phone to verify binding"),
  },
  async ({ verfiID, email_hash, phone_hash }) => {
    // Get proof data
    const { status, data: proofResult } = await apiCall("GET", `/sessions/${encodeURIComponent(verfiID)}/proof`);

    if (status !== 200) {
      return textResult(proofResult);
    }

    const proof = (proofResult as any)?.data;
    if (!proof) {
      return textResult({ consent_valid: false, error: "No proof data available" });
    }

    // Verify PII binding if hashes provided
    let emailMatch: boolean | null = null;
    let phoneMatch: boolean | null = null;

    if (email_hash || phone_hash) {
      const params = new URLSearchParams();
      if (email_hash) params.set("email", email_hash);
      if (phone_hash) params.set("phone", phone_hash);
      const { data: searchResult } = await apiCall(
        "GET",
        `/sessions/${encodeURIComponent(verfiID)}?${params}`
      );
      const searchData = (searchResult as any)?.data;
      emailMatch = searchData?.verification?.emailMatch ?? null;
      phoneMatch = searchData?.verification?.phoneMatch ?? null;
    }

    // Build verification summary
    const result = {
      consent_valid: proof.consent?.given === true,
      tcpa_compliant: proof.consent?.tcpa_compliant === true,
      consent_language: proof.consent?.language || null,
      one_to_one_consent: proof.consent?.one_to_one === true,
      session_duration_ms: proof.session?.duration_ms,
      total_interactions: proof.interactions?.total_events,
      form_fields_filled: proof.form_data?.fields_filled?.length || 0,
      consent_checkbox_interacted: proof.form_data?.consent_checkbox_interacted === true,
      pii_binding: {
        email_match: emailMatch,
        phone_match: phoneMatch,
        fields_bound: proof.pii_binding?.fields_bound || [],
      },
      tamper_detected: proof.verification?.tamper_detected === true,
      proof_url: proof.proof_url,
      status: proof.status,
    };

    return textResult(result);
  }
);

server.tool(
  "verfi_claim_session",
  "Claim a consent session for your organization. Starts 3-year retention. Use after verifying consent is valid.",
  {
    verfiID: z.string().describe("Verfi session ID to claim"),
    expirationDate: z
      .string()
      .optional()
      .describe("Custom expiration date (ISO 8601). Max 5 years. Defaults to 3 years."),
  },
  async ({ verfiID, expirationDate }) => {
    const body: Record<string, unknown> = {};
    if (expirationDate) body.expirationDate = expirationDate;
    const { data } = await apiCall("POST", `/sessions/${encodeURIComponent(verfiID)}/claim`, body);
    return textResult(data);
  }
);

server.tool(
  "verfi_unclaim_session",
  "Release a previously claimed session. Retention drops to 30 days. Only the claiming tenant can unclaim.",
  {
    verfiID: z.string().describe("Verfi session ID to unclaim"),
  },
  async ({ verfiID }) => {
    const { data } = await apiCall("POST", `/sessions/${encodeURIComponent(verfiID)}/unclaim`);
    return textResult(data);
  }
);

server.tool(
  "verfi_list_sessions",
  "List sessions claimed by your organization. Returns paginated results with session status and metadata.",
  {
    page: z.number().optional().describe("Page number (default 1)"),
    limit: z.number().optional().describe("Results per page (1-100, default 20)"),
    status: z
      .enum(["claimed", "unclaimed", "recorded", "expired"])
      .optional()
      .describe("Filter by session status"),
  },
  async ({ page, limit, status }) => {
    const params = new URLSearchParams();
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    if (status) params.set("status", status);
    const qs = params.toString() ? `?${params}` : "";
    const { data } = await apiCall("GET", `/sessions${qs}`);
    return textResult(data);
  }
);

server.tool(
  "verfi_update_expiration",
  "Update the expiration date of a claimed session. Must be 30+ days from now, max 5 years from claim date. Rate limited: 3 updates/month per session.",
  {
    verfiID: z.string().describe("Verfi session ID"),
    expirationDate: z.string().describe("New expiration date (ISO 8601)"),
  },
  async ({ verfiID, expirationDate }) => {
    const { data } = await apiCall("PUT", `/sessions/${encodeURIComponent(verfiID)}/expiration`, {
      expirationDate,
    });
    return textResult(data);
  }
);

server.tool(
  "verfi_add_sdk",
  "Get the Verfi SDK integration snippet and setup instructions for capturing consent on a web form.",
  {
    publicKey: z
      .string()
      .optional()
      .describe("Your Verfi public API key (pk_). If not provided, returns generic instructions."),
  },
  async ({ publicKey }) => {
    const key = publicKey || "pk_YOUR_PUBLIC_KEY";
    const snippet = `<script src="https://sdk.verfi.io/v1/verfi.js" data-key="${key}" async></script>`;
    const instructions = {
      snippet,
      setup_steps: [
        "1. Add the script tag to your HTML page, before the closing </body> tag",
        "2. The SDK auto-detects forms and begins recording consent sessions",
        "3. Each form submission generates a unique Verfi ID (VF-xxxxxxxx)",
        "4. Use the tenant API to claim sessions and verify consent",
      ],
      api_key_note:
        "You need two API keys: a public key (pk_) for the SDK and a secret key (sk_) for the tenant API. Generate both in the Verfi dashboard under Integration > API Keys.",
      docs_url: "https://verfi.io/docs",
    };
    return textResult(instructions);
  }
);

// --- Start ---

async function main() {
  if (!API_KEY) {
    console.error(
      "Warning: VERFI_API_KEY not set. Tools will fail on API calls. Set it in your MCP config."
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Verfi MCP Server started");
}

main().catch(console.error);

process.stdin.on("close", () => {
  server.close();
});
