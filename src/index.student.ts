/**
 * Brainlift Student MCP Server
 *
 * Cloudflare Worker that exposes student sprint and Brainlift tools via MCP.
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
import { registerGeneratePlan } from './tools/generate-plan';
import { registerGetPlan } from './tools/get-plan';
import { registerListTasks } from './tools/list-tasks';
import { registerGetTask } from './tools/get-task';
import { registerSaveDeliverable } from './tools/save-deliverable';
import { registerReadDeliverable } from './tools/read-deliverable';
import { registerUpdateDeliverable } from './tools/update-deliverable';
import { registerListDeliverables } from './tools/list-deliverables';
import { BRAINLIFT_MCP_INSTRUCTIONS } from './instructions/brainlift';
import { STUDENT_SPRINT_APPENDIX } from './instructions/student-sprint';

const STUDENT_MCP_INSTRUCTIONS = `${BRAINLIFT_MCP_INSTRUCTIONS}\n\n${STUDENT_SPRINT_APPENDIX}`;

interface StudentEnv {
  BRAINLIFT_MCP_OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  DOK1GRADER_BASE_URL: string;
  DOK1GRADER_SERVICE_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  HOSTED_DOMAIN?: string;
  COOKIE_ENCRYPTION_KEY: string;
}

interface StudentProps extends Record<string, unknown> {
  name: string;
  email: string;
  accessToken: string;
  tokenType: string;
  expiresAt: number;
}

export class BrainliftStudentMCP extends McpAgent<
  StudentEnv,
  Record<string, never>,
  StudentProps
> {
  server = new McpServer({
    name: 'Brainlift Student MCP',
    version: '0.1.0',
    instructions: STUDENT_MCP_INSTRUCTIONS,
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
    registerGeneratePlan(this.server, this.env, this.props);
    registerGetPlan(this.server, this.env, this.props);
    registerListTasks(this.server, this.env, this.props);
    registerGetTask(this.server, this.env, this.props);
    registerSaveDeliverable(this.server, this.env, this.props);
    registerReadDeliverable(this.server, this.env, this.props);
    registerUpdateDeliverable(this.server, this.env, this.props);
    registerListDeliverables(this.server, this.env, this.props);
  }
}

class OAuthKVAdapter {
  private env: StudentEnv;

  constructor(env: StudentEnv) {
    this.env = env;
  }

  get OAUTH_KV() {
    return this.env.BRAINLIFT_MCP_OAUTH_KV;
  }
}

async function syncLocalhostRedirectUri(request: Request, env: StudentEnv): Promise<void> {
  const url = new URL(request.url);
  if (url.pathname !== '/authorize') return;

  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  if (!clientId || !redirectUri) return;

  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return;
  }
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return;

  const kv = env.BRAINLIFT_MCP_OAUTH_KV;
  const stored = await kv.get(`client:${clientId}`);
  if (!stored) return;

  const clientInfo = JSON.parse(stored);
  const currentUris: string[] = clientInfo.redirectUris || [];
  if (currentUris.includes(redirectUri)) return;

  clientInfo.redirectUris = [
    ...currentUris.filter((uri: string) => {
      try {
        const parsedUri = new URL(uri);
        return parsedUri.hostname !== 'localhost' && parsedUri.hostname !== '127.0.0.1';
      } catch {
        return true;
      }
    }),
    redirectUri,
  ];

  await kv.put(`client:${clientId}`, JSON.stringify(clientInfo));
}

const sseHandler = BrainliftStudentMCP.serveSSE('/sse');
const streamableHandler = BrainliftStudentMCP.serve('/sse');
const mcpHandler = {
  fetch: (request: Request, env: StudentEnv, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/sse') {
      return streamableHandler.fetch(request, env, ctx);
    }
    return sseHandler.fetch(request, env, ctx);
  },
};

export default {
  fetch: async (request: Request, env: StudentEnv, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    if (
      url.pathname === '/sse/.well-known/oauth-protected-resource'
      || url.pathname === '/.well-known/oauth-protected-resource'
    ) {
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
    await syncLocalhostRedirectUri(request, env);

    const provider = new OAuthProvider({
      apiHandler: mcpHandler as any,
      apiRoute: '/sse',
      authorizeEndpoint: '/authorize',
      clientRegistrationEndpoint: '/register',
      defaultHandler: GoogleHandler as any,
      tokenEndpoint: '/token',
      accessTokenTTL: 24 * 60 * 60,
    });

    return provider.fetch(request, adaptedEnv, ctx);
  },
};
