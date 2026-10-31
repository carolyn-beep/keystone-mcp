/**
 * Tests for the Google OAuth handler (/authorize and /callback).
 *
 * Exercises the Hono app directly with a mocked OAUTH_PROVIDER and a mocked
 * global fetch for the Google token + userinfo calls. Both worker entrypoints
 * mount this same handler, so these tests cover both deployments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import { GoogleHandler } from '../google-handler';
import {
  createSignedOAuthState,
  OAUTH_NONCE_COOKIE_NAME,
} from '../workers-oauth-utils';

const SECRET = 'test-cookie-secret-0123456789abcdef';
const REGISTERED_REDIRECT = 'http://localhost:54929/callback';

const oauthReqInfo: AuthRequest = {
  responseType: 'code',
  clientId: 'client-abc',
  redirectUri: REGISTERED_REDIRECT,
  scope: ['email'],
  state: 'client-state-xyz',
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const lookupClient = vi.fn();
const completeAuthorization = vi.fn();
const parseAuthRequest = vi.fn();

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    COOKIE_ENCRYPTION_KEY: SECRET,
    KEYSTONE_BASE_URL: 'https://keystone.example',
    KEYSTONE_SERVICE_KEY: 'svc',
    OAUTH_PROVIDER: { lookupClient, completeAuthorization, parseAuthRequest },
    ...overrides,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Queue successful Google token + userinfo responses. */
function mockGoogleSuccess(userinfo: Record<string, unknown>) {
  mockFetch
    .mockResolvedValueOnce(json({ access_token: 'g-access', token_type: 'Bearer', expires_in: 3600 }))
    .mockResolvedValueOnce(json(userinfo));
}

async function signedState(nonce: string, info: AuthRequest = oauthReqInfo) {
  return createSignedOAuthState({ oauthReqInfo: info, nonce }, SECRET);
}

function callback(query: Record<string, string>, cookie?: string, env = makeEnv()) {
  const params = new URLSearchParams(query).toString();
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  return GoogleHandler.request(`/callback?${params}`, { headers }, env);
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupClient.mockResolvedValue({ clientId: 'client-abc', redirectUris: [REGISTERED_REDIRECT] });
  completeAuthorization.mockResolvedValue({ redirectTo: `${REGISTERED_REDIRECT}?code=issued` });
  parseAuthRequest.mockResolvedValue(oauthReqInfo);
});

describe('GET /authorize', () => {
  it('sets a nonce cookie and embeds a signed state carrying the same nonce', async () => {
    const res = await GoogleHandler.request(
      '/authorize?client_id=client-abc&redirect_uri=' + encodeURIComponent(REGISTERED_REDIRECT),
      {},
      makeEnv(),
    );
    expect(res.status).toBe(200);

    const setCookies = res.headers.getSetCookie();
    const nonceCookie = setCookies.find((c) => c.startsWith(`${OAUTH_NONCE_COOKIE_NAME}=`));
    expect(nonceCookie).toBeDefined();
    expect(nonceCookie).toContain('HttpOnly');
    expect(nonceCookie).toContain('Secure');
    expect(nonceCookie).toContain('SameSite=Lax');
    expect(nonceCookie).toContain('Max-Age=600');
    // The approval cookie from autoApprove must survive alongside the nonce.
    expect(setCookies.some((c) => c.startsWith('mcp-approved-clients='))).toBe(true);

    const nonce = nonceCookie!.split(';')[0].split('=')[1];
    const html = await res.text();
    const match = html.match(/url=(https:\/\/accounts\.google\.com[^"]+)"/);
    expect(match).not.toBeNull();
    const googleUrl = new URL(match![1].replace(/&amp;/g, '&'));

    // No refresh-token request; identity only.
    expect(googleUrl.searchParams.get('access_type')).toBeNull();
    expect(googleUrl.searchParams.get('prompt')).toBeNull();
    expect(googleUrl.searchParams.get('scope')).toBe('email profile');

    const state = googleUrl.searchParams.get('state')!;
    expect(state).not.toBe(btoa(JSON.stringify(oauthReqInfo)));
    const decoded = JSON.parse(
      Buffer.from(state.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    );
    expect(decoded.nonce).toBe(nonce);
    expect(decoded.oauthReqInfo.clientId).toBe('client-abc');
  });

  it('passes HOSTED_DOMAIN to Google as hd when set', async () => {
    const res = await GoogleHandler.request('/authorize?client_id=client-abc', {}, makeEnv({ HOSTED_DOMAIN: 'example.com' }));
    const html = await res.text();
    expect(html).toContain('hd=example.com');
  });
});

describe('GET /callback: state and nonce validation', () => {
  it('400s when state is missing', async () => {
    const res = await callback({ code: 'c' });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Missing authorization state');
  });

  it('400s on the legacy unsigned btoa(JSON) state (forgery attempt)', async () => {
    const forged = btoa(JSON.stringify({ ...oauthReqInfo, redirectUri: 'https://evil.example/cb' }));
    const res = await callback({ state: forged, code: 'c' }, `${OAUTH_NONCE_COOKIE_NAME}=n`);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid authorization state');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it('400s when the signature does not verify', async () => {
    const state = await signedState('nonce-1');
    const [payload] = state.split('.');
    const res = await callback({ state: `${payload}.00deadbeef`, code: 'c' }, `${OAUTH_NONCE_COOKIE_NAME}=nonce-1`);
    expect(res.status).toBe(400);
  });

  it('400s when the nonce cookie is missing', async () => {
    const state = await signedState('nonce-1');
    const res = await callback({ state, code: 'c' });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('does not match this browser session');
  });

  it('400s when the nonce cookie does not match the state nonce', async () => {
    const state = await signedState('nonce-1');
    const res = await callback({ state, code: 'c' }, `${OAUTH_NONCE_COOKIE_NAME}=nonce-2`);
    expect(res.status).toBe(400);
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it('400s when the client is unknown', async () => {
    lookupClient.mockResolvedValueOnce(null);
    const state = await signedState('nonce-1');
    const res = await callback({ state, code: 'c' }, `${OAUTH_NONCE_COOKIE_NAME}=nonce-1`);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Unknown client');
    expect(lookupClient).toHaveBeenCalledWith('client-abc');
  });

  it('400s when the redirect URI is not registered for the client', async () => {
    lookupClient.mockResolvedValueOnce({ clientId: 'client-abc', redirectUris: ['http://localhost:1/other'] });
    const state = await signedState('nonce-1');
    const res = await callback({ state, code: 'c' }, `${OAUTH_NONCE_COOKIE_NAME}=nonce-1`);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('GET /callback: ?error= path', () => {
  it('redirects a Google error back to the validated client redirect URI', async () => {
    const state = await signedState('nonce-1');
    const res = await callback(
      { state, error: 'access_denied', error_description: 'User said no' },
      `${OAUTH_NONCE_COOKIE_NAME}=nonce-1`,
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe(REGISTERED_REDIRECT);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('error_description')).toBe('User said no');
    expect(location.searchParams.get('state')).toBe('client-state-xyz');
    expect(res.headers.get('Set-Cookie')).toContain(`${OAUTH_NONCE_COOKIE_NAME}=;`);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('does not act as an open redirect when the redirect URI is unregistered', async () => {
    const state = await signedState('nonce-1', { ...oauthReqInfo, redirectUri: 'https://evil.example/cb' });
    const res = await callback({ state, error: 'access_denied' }, `${OAUTH_NONCE_COOKIE_NAME}=nonce-1`);
    expect(res.status).toBe(400);
    expect(res.headers.get('Location')).toBeNull();
  });

  it('does not act as an open redirect when the state is unsigned', async () => {
    const forged = btoa(JSON.stringify({ ...oauthReqInfo, redirectUri: 'https://evil.example/cb' }));
    const res = await callback({ state: forged, error: 'access_denied' }, `${OAUTH_NONCE_COOKIE_NAME}=n`);
    expect(res.status).toBe(400);
    expect(res.headers.get('Location')).toBeNull();
  });
});

describe('GET /callback: email verification and domain allow-list', () => {
  const validCookie = `${OAUTH_NONCE_COOKIE_NAME}=nonce-1`;

  it('completes authorization for a verified email and stores only name + email', async () => {
    mockGoogleSuccess({ id: 'g-123', name: 'Ada', email: 'ada@example.com', verified_email: true });
    const state = await signedState('nonce-1');

    const res = await callback({ state, code: 'auth-code' }, validCookie);

    expect(res.status).toBe(200);
    expect(completeAuthorization).toHaveBeenCalledTimes(1);
    const call = completeAuthorization.mock.calls[0][0];
    expect(call.userId).toBe('g-123');
    expect(call.props).toEqual({ name: 'Ada', email: 'ada@example.com' });
    expect(call.props).not.toHaveProperty('accessToken');
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(await res.text()).toContain(`${REGISTERED_REDIRECT}?code=issued`);
  });

  it('403s when verified_email is not true', async () => {
    mockGoogleSuccess({ id: 'g-123', name: 'Ada', email: 'ada@example.com', verified_email: false });
    const state = await signedState('nonce-1');

    const res = await callback({ state, code: 'auth-code' }, validCookie);

    expect(res.status).toBe(403);
    expect(await res.text()).toContain('not verified');
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it('403s when verified_email is absent from the userinfo response', async () => {
    mockGoogleSuccess({ id: 'g-123', name: 'Ada', email: 'ada@example.com' });
    const state = await signedState('nonce-1');

    const res = await callback({ state, code: 'auth-code' }, validCookie);
    expect(res.status).toBe(403);
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it('403s when HOSTED_DOMAIN is set and the email is on another domain', async () => {
    mockGoogleSuccess({ id: 'g-123', name: 'Ada', email: 'ada@gmail.com', verified_email: true });
    const state = await signedState('nonce-1');

    const res = await callback({ state, code: 'auth-code' }, validCookie, makeEnv({ HOSTED_DOMAIN: 'example.com' }));

    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(await res.text()).toContain('@example.com');
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it('403s on a lookalike domain (suffix must include the @)', async () => {
    mockGoogleSuccess({ id: 'g-123', name: 'Ada', email: 'ada@notexample.com', verified_email: true });
    const state = await signedState('nonce-1');

    const res = await callback({ state, code: 'auth-code' }, validCookie, makeEnv({ HOSTED_DOMAIN: 'example.com' }));
    expect(res.status).toBe(403);
  });

  it('accepts a matching domain case-insensitively when HOSTED_DOMAIN is set', async () => {
    mockGoogleSuccess({ id: 'g-123', name: 'Ada', email: 'Ada@Example.COM', verified_email: true });
    const state = await signedState('nonce-1');

    const res = await callback({ state, code: 'auth-code' }, validCookie, makeEnv({ HOSTED_DOMAIN: 'example.com' }));
    expect(res.status).toBe(200);
    expect(completeAuthorization).toHaveBeenCalledTimes(1);
  });

  it('accepts any verified domain when HOSTED_DOMAIN is unset', async () => {
    mockGoogleSuccess({ id: 'g-123', name: 'Ada', email: 'ada@gmail.com', verified_email: true });
    const state = await signedState('nonce-1');

    const res = await callback({ state, code: 'auth-code' }, validCookie);
    expect(res.status).toBe(200);
  });
});
