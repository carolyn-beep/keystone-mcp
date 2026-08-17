/**
 * Keystone MCP
 *
 * Cloudflare Worker that exposes Brainlift grading tools via Model Context Protocol.
 * Uses Google OAuth for user identification and communicates with Keystone
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
import { registerListExperts } from './tools/list-experts';
import { registerCreateExpert } from './tools/create-expert';
import { registerDeleteExpert } from './tools/delete-expert';
import { registerGetStaleItems } from './tools/get-stale-items';
import { registerDismissStale } from './tools/dismiss-stale';
import { registerLinkDok3 } from './tools/link-dok3';
import { registerLinkDok4 } from './tools/link-dok4';
import { BRAINLIFT_MCP_INSTRUCTIONS } from './instructions/brainlift';
import type { Env, Props } from './types/env';

export class BrainliftMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'Keystone MCP',
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
    registerListExperts(this.server, this.env, this.props);
    registerCreateExpert(this.server, this.env, this.props);
    registerDeleteExpert(this.server, this.env, this.props);
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
      // 24h access tokens (default is 1h). Reduces how often clients hit the
      // refresh path -- some MCP clients (e.g. OpenClaw via mcporter) have
      // bugs persisting rotated refresh tokens, which forced users into a
      // browser re-auth every hour.
      accessTokenTTL: 24 * 60 * 60,
    });

    return provider.fetch(request, adaptedEnv, ctx);
  },
};
