/**
 * Google OAuth handler for Keystone MCP.
 * Adapted from clado-mcp google-handler.ts.
 * Handles authorize, callback, and token exchange with Google.
 */

import type {
  AuthRequest,
  OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { Hono, type Context } from 'hono';
import {
  fetchUpstreamAuthToken,
  getUpstreamAuthorizeUrl,
  type Props,
} from './utils.js';
import {
  clientIdAlreadyApproved,
  parseRedirectApproval,
  autoApprove,
} from './workers-oauth-utils.js';
import { requiredScopes } from './required-scopes.js';
import type { Env } from './types/env.js';

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text('Invalid request', 400);
  }

  if (
    await clientIdAlreadyApproved(
      c.req.raw,
      oauthReqInfo.clientId,
      c.env.COOKIE_ENCRYPTION_KEY,
    )
  ) {
    return redirectToGoogle(c, oauthReqInfo);
  }

  // Auto-approve for MCP clients
  const { state, headers } = await autoApprove(
    c.req.raw,
    oauthReqInfo,
    c.env.COOKIE_ENCRYPTION_KEY,
  );

  return redirectToGoogle(c, state.oauthReqInfo, headers);
});

app.post('/authorize', async (c) => {
  const { state, headers } = await parseRedirectApproval(
    c.req.raw,
    c.env.COOKIE_ENCRYPTION_KEY,
  );
  if (!state.oauthReqInfo) {
    return c.text('Invalid request', 400);
  }

  return redirectToGoogle(c, state.oauthReqInfo, headers);
});

async function redirectToGoogle(
  c: Context,
  oauthReqInfo: AuthRequest,
  headers: Record<string, string> = {},
) {
  const googleAuthUrl = getUpstreamAuthorizeUrl({
    upstreamUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: requiredScopes.join(' '),
    clientId: c.env.GOOGLE_CLIENT_ID,
    redirectUri: new URL('/callback', c.req.raw.url).href,
    state: btoa(JSON.stringify(oauthReqInfo)),
    hostedDomain: c.env.HOSTED_DOMAIN,
  });

  const urlWithParams = new URL(googleAuthUrl);
  urlWithParams.searchParams.set('access_type', 'offline');
  urlWithParams.searchParams.set('prompt', 'consent');

  return new Response(
    `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="3;url=${urlWithParams.href}">
<title>Redirecting to Google...</title>
<script>setTimeout(() => { window.top.location.href = "${urlWithParams.href}"; }, 1500);</script>
</head><body><p>Redirecting to Google login...</p></body></html>`,
    {
      status: 200,
      headers: { ...headers, 'Content-Type': 'text/html' },
    },
  );
}

app.get('/callback', async (c) => {
  const stateParam = c.req.query('state');
  if (!stateParam) {
    return c.text('Missing authorization state', 400);
  }

  let oauthReqInfo: AuthRequest;
  try {
    oauthReqInfo = JSON.parse(atob(stateParam)) as AuthRequest;
  } catch {
    return c.text('Invalid authorization state', 400);
  }

  if (!oauthReqInfo.clientId) {
    return c.text('Invalid authorization request', 400);
  }

  // Check for OAuth errors
  const error = c.req.query('error');
  if (error) {
    const errorDescription =
      c.req.query('error_description') || `OAuth error: ${error}`;
    const errorUrl = new URL(oauthReqInfo.redirectUri);
    errorUrl.searchParams.set('error', error);
    errorUrl.searchParams.set('error_description', errorDescription);
    if (oauthReqInfo.state) {
      errorUrl.searchParams.set('state', oauthReqInfo.state);
    }
    return c.redirect(errorUrl.toString());
  }

  // Exchange code for tokens
  const code = c.req.query('code');
  const [tokenData, tokenErrResponse] = await fetchUpstreamAuthToken({
    upstreamUrl: 'https://accounts.google.com/o/oauth2/token',
    clientId: c.env.GOOGLE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    code,
    redirectUri: new URL('/callback', c.req.url).href,
    grantType: 'authorization_code',
  });
  if (tokenErrResponse) {
    return tokenErrResponse;
  }

  // Fetch user info from Google
  const userResponse = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: { Authorization: `Bearer ${tokenData.accessToken}` },
    },
  );
  if (!userResponse.ok) {
    return c.text(
      `Failed to fetch user info: ${await userResponse.text()}`,
      500,
    );
  }

  const { id, name, email } = (await userResponse.json()) as {
    id: string;
    name: string;
    email: string;
  };

  const propsToStore: Props = {
    name,
    email,
    accessToken: tokenData.accessToken,
    tokenType: tokenData.tokenType || 'Bearer',
    expiresAt: tokenData.expiresAt,
  };

  // Complete authorization and redirect back to MCP client
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: id,
    metadata: { label: name },
    scope: oauthReqInfo.scope,
    props: propsToStore,
  });

  return new Response(
    `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="3;url=${redirectTo}">
<title>Authentication Successful</title>
<script>setTimeout(() => { window.top.location.href = "${redirectTo}"; }, 1500);</script>
</head><body><p>Authentication successful! Redirecting...</p></body></html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    },
  );
});

export { app as GoogleHandler };
