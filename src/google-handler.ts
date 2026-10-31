/**
 * Google OAuth handler for Keystone MCP.
 * Adapted from clado-mcp google-handler.ts.
 * Handles authorize, callback, and token exchange with Google.
 *
 * Shared by both worker entrypoints (src/index.ts and src/index.student.ts),
 * so every security check here covers both deployments.
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
  createSignedOAuthState,
  verifySignedOAuthState,
  generateOAuthNonce,
  oauthNonceCookieHeader,
  clearOAuthNonceCookieHeader,
  readOAuthNonceCookie,
} from './workers-oauth-utils.js';
import { requiredScopes } from './required-scopes.js';
import type { Env } from './types/env.js';

type HandlerEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const app = new Hono<{ Bindings: HandlerEnv }>();

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
  c: Context<{ Bindings: HandlerEnv }>,
  oauthReqInfo: AuthRequest,
  extraHeaders: Record<string, string> = {},
) {
  // The nonce lives in both the signed state and an HttpOnly cookie. On
  // /callback the two must match, which binds the state to this browser.
  const nonce = generateOAuthNonce();
  const signedState = await createSignedOAuthState(
    { oauthReqInfo, nonce },
    c.env.COOKIE_ENCRYPTION_KEY,
  );

  const googleAuthUrl = getUpstreamAuthorizeUrl({
    upstreamUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: requiredScopes.join(' '),
    clientId: c.env.GOOGLE_CLIENT_ID,
    redirectUri: new URL('/callback', c.req.raw.url).href,
    state: signedState,
    hostedDomain: c.env.HOSTED_DOMAIN,
  });

  const headers = new Headers();
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.append(name, value);
  }
  headers.append('Set-Cookie', oauthNonceCookieHeader(nonce));
  headers.set('Content-Type', 'text/html');

  return new Response(
    `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="3;url=${googleAuthUrl}">
<title>Redirecting to Google...</title>
<script>setTimeout(() => { window.top.location.href = "${googleAuthUrl}"; }, 1500);</script>
</head><body><p>Redirecting to Google login...</p></body></html>`,
    { status: 200, headers },
  );
}

/**
 * Plain-text error response that also clears the nonce cookie so a failed
 * callback cannot be retried against the same nonce.
 */
function callbackError(message: string, status: 400 | 403 | 500): Response {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'Set-Cookie': clearOAuthNonceCookieHeader(),
    },
  });
}

function isAllowedEmail(email: string, hostedDomain: string | undefined): boolean {
  if (!hostedDomain) return true;
  const expectedSuffix = `@${hostedDomain.trim().toLowerCase()}`;
  return email.toLowerCase().endsWith(expectedSuffix);
}

app.get('/callback', async (c) => {
  const stateParam = c.req.query('state');
  if (!stateParam) {
    return callbackError('Missing authorization state', 400);
  }

  // 1. The state must carry a valid HMAC signature.
  const signedState = await verifySignedOAuthState(
    stateParam,
    c.env.COOKIE_ENCRYPTION_KEY,
  );
  if (!signedState) {
    return callbackError('Invalid authorization state', 400);
  }

  // 2. The nonce inside the state must match the nonce cookie we set on
  //    /authorize, so the state is bound to the browser that started the flow.
  const cookieNonce = readOAuthNonceCookie(c.req.raw.headers.get('Cookie'));
  if (!cookieNonce || cookieNonce !== signedState.nonce) {
    return callbackError('Authorization state does not match this browser session', 400);
  }

  const oauthReqInfo = signedState.oauthReqInfo;
  if (!oauthReqInfo.clientId || !oauthReqInfo.redirectUri) {
    return callbackError('Invalid authorization request', 400);
  }

  // 3. The client must still exist and the redirect URI must be one it
  //    registered. This also protects the ?error= early return below from
  //    being used as an open redirect.
  const clientInfo = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  if (!clientInfo || !clientInfo.redirectUris.includes(oauthReqInfo.redirectUri)) {
    return callbackError('Unknown client or unregistered redirect URI', 400);
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
    return new Response(null, {
      status: 302,
      headers: {
        Location: errorUrl.toString(),
        'Set-Cookie': clearOAuthNonceCookieHeader(),
      },
    });
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
    return callbackError(
      `Failed to fetch user info: ${await userResponse.text()}`,
      500,
    );
  }

  const { id, name, email, verified_email } = (await userResponse.json()) as {
    id: string;
    name: string;
    email: string;
    verified_email?: boolean;
  };

  // The email is what Keystone keys the user on, so it must be verified and
  // (when HOSTED_DOMAIN is set) belong to the allow-listed domain. Google's
  // `hd` parameter is only a UI hint, so we enforce the domain here too.
  if (!email || verified_email !== true) {
    return callbackError('Google account email is not verified', 403);
  }
  if (!isAllowedEmail(email, c.env.HOSTED_DOMAIN)) {
    return callbackError(
      `Access restricted to @${c.env.HOSTED_DOMAIN} Google accounts`,
      403,
    );
  }

  // Only identity is kept. The Google access token is not needed after this
  // point (Keystone is called with a service key), so it is not stored.
  const propsToStore: Props = { name, email };

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
      headers: {
        'Content-Type': 'text/html',
        'Set-Cookie': clearOAuthNonceCookieHeader(),
      },
    },
  );
});

export { app as GoogleHandler };
