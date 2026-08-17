import type { BrainliftMCP } from '../index';

export interface Env {
  BRAINLIFT_MCP_OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace<BrainliftMCP>;
  KEYSTONE_BASE_URL: string;
  KEYSTONE_SERVICE_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  HOSTED_DOMAIN?: string;
  COOKIE_ENCRYPTION_KEY: string;
}

export interface Props extends Record<string, unknown> {
  name: string;
  email: string;
  accessToken: string;
  tokenType: string;
  expiresAt: number;
}
