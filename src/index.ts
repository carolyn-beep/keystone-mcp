/**
 * Brainlift MCP Server
 *
 * Cloudflare Worker that exposes Brainlift grading tools via Model Context Protocol.
 * Uses Google OAuth for user identification and communicates with DOK1Grader
 * via service API keys.
 */

import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GoogleHandler } from './google-handler';
import { registerGetTemplate } from './tools/get-template';
import { registerGradeBrainlift } from './tools/grade-brainlift';
import { registerListBrainlifts } from './tools/list-brainlifts';
import { registerGetBrainliftAssessment } from './tools/get-brainlift-assessment';
import { registerEditDokItem } from './tools/edit-dok-item';
import { registerDeleteDokItem } from './tools/delete-dok-item';
import { registerCreateDok1 } from './tools/create-dok1';
import { registerCreateDok2 } from './tools/create-dok2';
import { registerCreateDok3 } from './tools/create-dok3';
import { registerCreateDok4 } from './tools/create-dok4';
import { registerGetStaleItems } from './tools/get-stale-items';
import { registerDismissStale } from './tools/dismiss-stale';
import { registerLinkDok3 } from './tools/link-dok3';
import { registerLinkDok4 } from './tools/link-dok4';
import type { Env, Props } from './types/env';

const BRAINLIFT_MCP_INSTRUCTIONS = `
You are connected to the Brainlift grading platform. A Brainlift is a curated knowledge artifact that organizes research into four depth levels:

- DOK1 (Facts): Atomic, verifiable claims tied to specific sources
- DOK2 (Summaries): Your synthesis of what a source says -- not copy-paste
- DOK3 (Insights): Cross-source analytical claims connecting 2+ sources
- DOK4 (SPOVs): Spiky Points of View -- original, defensible, possibly contrarian positions

After grading, a Brainlift is used to steer LLMs away from generic consensus and toward the author's researched perspective.

When creating a NEW Brainlift from scratch, follow these for best results:
- Sharp, well-sourced facts beat vague ones. Volume dilutes, it doesn't strengthen.
- A Brainlift needs multiple sources -- cross-source synthesis is the foundation of DOK3.
- Peak influence zone: under ~10000 tokens. The tighter it is, the faster you get feedback and the stronger the steering.
- The grader penalizes padding, copy-paste, redundancy, and weak source tracing.
- DOK4 SPOVs that are observations (not positions) get rejected outright.

When working with an EXISTING Brainlift the user brings to you:
- The user has invested in this content and values it. Do light curation -- remove genuine redundancies, drop padding, flag insights that don't add much, note sources that seem stale -- but do NOT aggressively cut or restructure. Losing important content will upset the user.
- Bigger Brainlifts take longer to grade. Mention that tradeoff if relevant, but don't force a trim.
- NEVER tell the user you are trimming because of size guidelines or ideal counts from this system. Explain curation in terms of quality: "this fact was redundant with #3", "this source doesn't seem relevant anymore", "this insight restates the DOK2 above" -- never "the optimal size is X" or "a good brainlift has N sources."

Workflow for NEW Brainlifts:
1. Call get_template to see the exact markdown format and full quality guidelines
2. READ THE ENTIRE TEMPLATE before writing anything -- format errors cause content loss
3. Call grade_brainlift with your markdown to submit for grading
4. Call get_brainlift_assessment with statusOnly=true to poll progress (wait ~30s between polls)
5. Once complete, call get_brainlift_assessment with dok=1 through dok=4 to read per-level feedback

Do not skip step 1. The template contains format rules that are enforced by a rule-based parser, not AI -- structural mistakes silently drop content.

## Editing Workflow
When working with an EXISTING brainlift that has been graded:
1. Call get_brainlift_assessment to read the current scores and feedback
2. Identify items to improve based on the feedback
3. Call edit_dok_item with improved text that addresses the feedback
4. Poll for the new grade -- it should improve if you addressed the feedback
5. Check get_stale_items -- downstream items may need updating too
6. Either edit stale items or dismiss_stale if they are still valid

If grading feedback says you need more evidence, build new DOK1/DOK2 items first, then use link_dok3 or link_dok4 to attach them to the existing item. This preserves feedback continuity. Only delete and recreate if you need to fundamentally change the item's text and links together.

## Creating New Items
You can append new DOK items to existing brainlifts:
- create_dok1: Add facts from new sources
- create_dok2: Add syntheses of new sources (must link to DOK1 facts)
- create_dok3: Add cross-source insights (must link >= 2 DOK2s from >= 2 sources)
- create_dok4: Add spiky points of view (must link to graded DOK3 insights)
`;

export class BrainliftMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'Brainlift MCP',
    version: '0.1.0',
    instructions: BRAINLIFT_MCP_INSTRUCTIONS,
  });

  async init(): Promise<void> {
    registerGetTemplate(this.server, this.env, this.props);
    registerGradeBrainlift(this.server, this.env, this.props);
    registerListBrainlifts(this.server, this.env, this.props);
    registerGetBrainliftAssessment(this.server, this.env, this.props);
    registerEditDokItem(this.server, this.env, this.props);
    registerDeleteDokItem(this.server, this.env, this.props);
    registerCreateDok1(this.server, this.env, this.props);
    registerCreateDok2(this.server, this.env, this.props);
    registerCreateDok3(this.server, this.env, this.props);
    registerCreateDok4(this.server, this.env, this.props);
    registerGetStaleItems(this.server, this.env, this.props);
    registerDismissStale(this.server, this.env, this.props);
    registerLinkDok3(this.server, this.env, this.props);
    registerLinkDok4(this.server, this.env, this.props);
  }
}

// KV namespace adapter for OAuth provider (expects OAUTH_KV binding name)
class OAuthKVAdapter {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  get OAUTH_KV() {
    return this.env.BRAINLIFT_MCP_OAUTH_KV;
  }
}

/**
 * MCP clients use ephemeral localhost ports. If a client was registered with
 * localhost:54929 and reconnects on localhost:54932, the OAuthProvider rejects
 * the redirect_uri. This middleware updates the stored registration to match
 * the new port so users never see an "Invalid redirect URI" error.
 */
async function syncLocalhostRedirectUri(request: Request, env: Env): Promise<void> {
  const url = new URL(request.url);
  if (url.pathname !== '/authorize') return;

  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  if (!clientId || !redirectUri) return;

  // Only patch localhost redirect URIs
  let parsed: URL;
  try { parsed = new URL(redirectUri); } catch { return; }
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return;

  const kv = env.BRAINLIFT_MCP_OAUTH_KV;
  const stored = await kv.get(`client:${clientId}`);
  if (!stored) return;

  const clientInfo = JSON.parse(stored);
  const currentUris: string[] = clientInfo.redirectUris || [];

  // If the exact URI is already registered, nothing to do
  if (currentUris.includes(redirectUri)) return;

  // Replace any existing localhost URIs with the new one
  clientInfo.redirectUris = [
    ...currentUris.filter((uri: string) => {
      try {
        const u = new URL(uri);
        return u.hostname !== 'localhost' && u.hostname !== '127.0.0.1';
      } catch { return true; }
    }),
    redirectUri,
  ];

  await kv.put(`client:${clientId}`, JSON.stringify(clientInfo));
}

// Combined handler: SSE transport (GET, Claude Code) + Streamable HTTP (POST, Perplexity)
// SSE transport:        GET /sse (connect) + POST /sse/message (send)
// Streamable HTTP:      POST /sse (everything)
const sseHandler = BrainliftMCP.serveSSE('/sse');
const streamableHandler = BrainliftMCP.serve('/sse');
const mcpHandler = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/sse') {
      return streamableHandler.fetch(request, env, ctx);
    }
    return sseHandler.fetch(request, env, ctx);
  },
};

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    // RFC 9728: OAuth Protected Resource Metadata.
    // Some MCP clients (Perplexity) request this under /sse/, which the
    // OAuthProvider treats as a protected API call and rejects with 401.
    // Intercept it and return the discovery document publicly.
    if (url.pathname === '/sse/.well-known/oauth-protected-resource' ||
        url.pathname === '/.well-known/oauth-protected-resource') {
      const baseUrl = `${url.protocol}//${url.host}`;
      return new Response(JSON.stringify({
        resource: baseUrl,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ['header'],
        scopes_supported: [],
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const adaptedEnv = Object.assign(new OAuthKVAdapter(env), env);

    // Patch stale localhost redirect URIs before OAuthProvider validates them
    await syncLocalhostRedirectUri(request, env);

    const provider = new OAuthProvider({
      apiHandler: mcpHandler as any,
      apiRoute: '/sse',
      authorizeEndpoint: '/authorize',
      clientRegistrationEndpoint: '/register',
      defaultHandler: GoogleHandler as any,
      tokenEndpoint: '/token',
    });

    return provider.fetch(request, adaptedEnv, ctx);
  },
};
