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
import type { Env, Props } from './types/env';

const BRAINLIFT_MCP_INSTRUCTIONS = `
You are connected to the Brainlift grading platform. A Brainlift is a curated knowledge artifact that organizes research into four depth levels:

- DOK1 (Facts): Atomic, verifiable claims tied to specific sources
- DOK2 (Summaries): Your synthesis of what a source says -- not copy-paste
- DOK3 (Insights): Cross-source analytical claims connecting 2+ sources
- DOK4 (SPOVs): Spiky Points of View -- original, defensible, possibly contrarian positions

After grading, a Brainlift is used to steer LLMs away from generic consensus and toward the author's researched perspective. This only works if the Brainlift is tight and curated.

CRITICAL -- Less is more:
- 5 sharp facts beat 30 vague ones. Volume dilutes, it doesn't strengthen.
- Peak influence zone: 500-1000 tokens. Above 5000 tokens, steering collapses.
- The grader penalizes padding, copy-paste, redundancy, and weak source tracing.
- DOK4 SPOVs that are observations (not positions) get rejected outright.

Workflow:
1. Call get_template to see the exact markdown format and full quality guidelines
2. READ THE ENTIRE TEMPLATE before writing anything -- format errors cause content loss
3. Call grade_brainlift with your markdown to submit for grading
4. Call get_brainlift_assessment with statusOnly=true to poll progress (wait ~30s between polls)
5. Once complete, call get_brainlift_assessment with dok=1 through dok=4 to read per-level feedback

Do not skip step 1. The template contains format rules that are enforced by a rule-based parser, not AI -- structural mistakes silently drop content.
`;

export class BrainliftMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'Brainlift MCP',
    version: '0.1.0',
    instructions: BRAINLIFT_MCP_INSTRUCTIONS,
  });

  async init(): Promise<void> {
    registerGetTemplate(this.server, this.env, this.props);
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

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    const adaptedEnv = Object.assign(new OAuthKVAdapter(env), env);

    const provider = new OAuthProvider({
      apiHandler: BrainliftMCP.mount('/sse') as any,
      apiRoute: '/sse',
      authorizeEndpoint: '/authorize',
      clientRegistrationEndpoint: '/register',
      defaultHandler: GoogleHandler as any,
      tokenEndpoint: '/token',
    });

    return provider.fetch(request, adaptedEnv, ctx);
  },
};
