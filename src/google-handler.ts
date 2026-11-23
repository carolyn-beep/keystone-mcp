/**
 * Google OAuth handler for Keystone MCP.
 * Adapted from clado-mcp google-handler.ts.
 * Handles authorize, callback, and token exchange with Google.
 *
 * Shared by both worker entrypoints (src/index.ts and src/index.student.ts),
 * so every security check here covers both deployments.
 */

import {
  AuthorizationError,
  authorizationErrorRedirect,
  type AuthRequest,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { Hono, type Context } from 'hono';
import {
  fetchUpstreamAuthToken,
  getUpstreamAuthorizeUrl,
  type Props,
} from './utils.js';
import {
  createSignedOAuthState,
  verifySignedOAuthState,
  generateOAuthNonce,
  oauthNonceCookieHeader,
  clearOAuthNonceCookieHeader,
  readOAuthNonceCookie,
} from './workers-oauth-utils.js';
import { requiredScopes } from './required-scopes.js';
import { isRegisteredRedirectUri } from './redirect-uri.js';
import { CONSENT_PAGE_CSP, renderConsentPage } from './consent-page.js';
import { renderRedirectPage } from './redirect-page.js';
import type { Env } from './types/env.js';

type HandlerEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const app = new Hono<{ Bindings: HandlerEnv }>();

/**
 * Approvals are remembered per browser, per client, redirect URI and scope,
 * in a signed cookie managed by workers-oauth-provider. The user is not
 * known until Google returns, so approvals are not tied to an account.
 */
function rememberConsent(env: HandlerEnv) {
  return { secret: env.COOKIE_ENCRYPTION_KEY };
}

function plainTextError(message: string, status: 400): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
  });
}

/**
 * Report an invalid authorization request. Redirect back to the client only
 * when the provider has validated the client and its redirect URI (it sets
 * `redirectTo` in exactly that case); otherwise render the error here.
 */
function authorizationErrorResponse(error: AuthorizationError): Response {
  if (error.redirectTo) {
    return new Response(null, { status: 302, headers: { Location: error.redirectTo } });
  }
  return plainTextError(`Invalid authorization request: ${error.description}`, 400);
}

// GET /authorize: validate the request, then either continue to Google (the
// user already approved this client in this browser) or show the consent
// screen. Dynamic client registration is open, so without this screen any
// registered client could obtain a token for a signed-in user in one click.
app.get('/authorize', async (c) => {
  const oauth = c.env.OAUTH_PROVIDER;

  let authRequest: AuthRequest;
  try {
    authRequest = await oauth.parseAuthRequest(c.req.raw);
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    throw error;
  }

  // MCP requires S256 PKCE from every client. The provider already refuses
  // `plain` and requires PKCE from public clients; this extends the
  // requirement to confidential clients too. The provider has validated the
  // redirect URI at this point, so the error can go back to the client.
  if (!authRequest.codeChallenge || authRequest.codeChallengeMethod !== 'S256') {
    const location = authorizationErrorRedirect(
      authRequest,
      'invalid_request',
      'PKCE with code_challenge_method=S256 is required',
    );
    return new Response(null, { status: 302, headers: { Location: location } });
  }

  if (await oauth.isConsentRemembered(c.req.raw, authRequest, rememberConsent(c.env))) {
    return redirectToGoogle(c, authRequest);
  }

  // describeConsent first: a failed lookup then leaves nothing in KV.
  const details = await oauth.describeConsent(authRequest);
  const consent = await oauth.beginConsent(authRequest);
  // beginConsent's headers carry the browser-binding cookie, no-store and
  // anti-framing headers; the page's own CSP is added alongside them.
  consent.headers.set('Content-Type', 'text/html; charset=UTF-8');
  consent.headers.append('Content-Security-Policy', CONSENT_PAGE_CSP);
  return new Response(renderConsentPage(details, consent.handle), {
    status: 200,
    headers: consent.headers,
  });
});

// POST /authorize: the consent form. The form carries only a single-use
// handle; the authorization request itself comes back from server-side
// storage, and the handle only works in the browser that holds its binding
// cookie (SameSite=Lax, so cross-site posts arrive without it).
app.post('/authorize', async (c) => {
  const oauth = c.env.OAUTH_PROVIDER;
  const form = await c.req.raw.formData();
  const handle = form.get('handle');
  if (typeof handle !== 'string' || !handle) {
    return plainTextError('Missing consent handle. Start the connection again from your MCP client.', 400);
  }

  try {
    if (form.get('decision') !== 'approve') {
      const denied = await oauth.denyConsent(c.req.raw, handle);
      denied.headers.set('Location', denied.redirectTo);
      return new Response(null, { status: 302, headers: denied.headers });
    }

    const approved = await oauth.approveConsent(c.req.raw, handle, {
      remember: rememberConsent(c.env),
    });
    return redirectToGoogle(c, approved.request, approved.headers);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return plainTextError(
        'This approval page has expired, was already used, or was opened in another browser. '
          + 'Start the connection again from your MCP client.',
        400,
      );
    }
    throw error;
  }
});

async function redirectToGoogle(
  c: Context<{ Bindings: HandlerEnv }>,
  oauthReqInfo: AuthRequest,
  headers: Headers = new Headers(),
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

  headers.append('Set-Cookie', oauthNonceCookieHeader(nonce));
  headers.set('Content-Type', 'text/html; charset=UTF-8');

  // googleAuthUrl is always https://accounts.google.com/..., so this is non-null.
  const page = renderRedirectPage(googleAuthUrl, 'Redirecting to Google...', 'Redirecting to Google login...');
  return new Response(page, { status: 200, headers });
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
  //    registered (loopback URIs may differ in port, RFC 8252 §7.3). This
  //    also protects the ?error= early return below from being used as an
  //    open redirect.
  const clientInfo = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  if (!clientInfo || !isRegisteredRedirectUri(oauthReqInfo.redirectUri, clientInfo.redirectUris)) {
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

  // The provider only accepts https or loopback http redirect URIs, so a
  // non-http(s) redirectTo means something upstream is wrong: refuse it.
  const page = renderRedirectPage(redirectTo, 'Authentication Successful', 'Authentication successful! Redirecting...');
  if (!page) {
    return callbackError('Refusing to redirect to a non-http(s) URI', 400);
  }
  return new Response(page, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Set-Cookie': clearOAuthNonceCookieHeader(),
    },
  });
});

export { app as GoogleHandler };
