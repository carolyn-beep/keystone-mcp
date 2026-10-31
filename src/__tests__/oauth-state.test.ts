/**
 * Tests for the signed OAuth state helpers and approval-cookie parsing in
 * workers-oauth-utils.ts.
 */

import { describe, it, expect } from 'vitest';
import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import {
  createSignedOAuthState,
  verifySignedOAuthState,
  generateOAuthNonce,
  readOAuthNonceCookie,
  oauthNonceCookieHeader,
  clearOAuthNonceCookieHeader,
  clientIdAlreadyApproved,
  OAUTH_NONCE_COOKIE_NAME,
} from '../workers-oauth-utils';

const SECRET = 'test-cookie-secret-0123456789abcdef';

const oauthReqInfo: AuthRequest = {
  responseType: 'code',
  clientId: 'client-abc',
  redirectUri: 'http://localhost:54929/callback',
  scope: ['email'],
  state: 'client-state',
};

describe('signed OAuth state', () => {
  it('round-trips the payload and nonce', async () => {
    const nonce = generateOAuthNonce();
    const encoded = await createSignedOAuthState({ oauthReqInfo, nonce }, SECRET);

    expect(encoded.split('.')).toHaveLength(2);
    // base64url: no '+', '/', or '=' padding in the payload half.
    expect(encoded.split('.')[0]).toMatch(/^[A-Za-z0-9_-]+$/);

    const decoded = await verifySignedOAuthState(encoded, SECRET);
    expect(decoded).toEqual({ oauthReqInfo, nonce });
  });

  it('rejects a payload with a tampered field', async () => {
    const nonce = generateOAuthNonce();
    const encoded = await createSignedOAuthState({ oauthReqInfo, nonce }, SECRET);
    const [payload, signature] = encoded.split('.');

    // Forge a payload pointing at an attacker redirect URI, keep the signature.
    const forged = { oauthReqInfo: { ...oauthReqInfo, redirectUri: 'https://evil.example/cb' }, nonce };
    const forgedPayload = btoa(JSON.stringify(forged))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(forgedPayload).not.toBe(payload);

    expect(await verifySignedOAuthState(`${forgedPayload}.${signature}`, SECRET)).toBeNull();
  });

  it('rejects a state signed with a different secret', async () => {
    const encoded = await createSignedOAuthState(
      { oauthReqInfo, nonce: generateOAuthNonce() },
      'some-other-secret',
    );
    expect(await verifySignedOAuthState(encoded, SECRET)).toBeNull();
  });

  it('rejects the legacy unsigned btoa(JSON) format', async () => {
    const legacy = btoa(JSON.stringify(oauthReqInfo));
    expect(await verifySignedOAuthState(legacy, SECRET)).toBeNull();
  });

  it('rejects malformed input without throwing', async () => {
    for (const bad of ['', '.', 'a.b.c', 'not-base64!!.deadbeef', '%%%.00']) {
      expect(await verifySignedOAuthState(bad, SECRET), bad).toBeNull();
    }
  });

  it('rejects a signed payload that lacks a nonce', async () => {
    // Build a correctly signed payload by hand that is missing `nonce`.
    const good = await createSignedOAuthState({ oauthReqInfo, nonce: 'n' }, SECRET);
    const decoded = await verifySignedOAuthState(good, SECRET);
    expect(decoded?.nonce).toBe('n');

    // Signing arbitrary data requires the internal key, so assert via the
    // public API that an empty nonce is refused at creation + verification.
    const emptyNonce = await createSignedOAuthState({ oauthReqInfo, nonce: '' }, SECRET);
    expect(await verifySignedOAuthState(emptyNonce, SECRET)).toBeNull();
  });

  it('generates distinct, hex-only nonces', () => {
    const a = generateOAuthNonce();
    const b = generateOAuthNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe('nonce cookie helpers', () => {
  it('sets an HttpOnly, Secure, SameSite=Lax cookie with a 10 minute lifetime', () => {
    const header = oauthNonceCookieHeader('abc');
    expect(header).toContain(`${OAUTH_NONCE_COOKIE_NAME}=abc`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Max-Age=600');
  });

  it('clears the cookie with Max-Age=0', () => {
    expect(clearOAuthNonceCookieHeader()).toContain('Max-Age=0');
    expect(clearOAuthNonceCookieHeader()).toContain(`${OAUTH_NONCE_COOKIE_NAME}=;`);
  });

  it('reads the nonce out of a Cookie header among other cookies', () => {
    const header = `other=1; ${OAUTH_NONCE_COOKIE_NAME}=deadbeef; mcp-approved-clients=x.y`;
    expect(readOAuthNonceCookie(header)).toBe('deadbeef');
    expect(readOAuthNonceCookie('other=1')).toBeNull();
    expect(readOAuthNonceCookie(null)).toBeNull();
    expect(readOAuthNonceCookie(`${OAUTH_NONCE_COOKIE_NAME}=`)).toBeNull();
  });
});

describe('approval cookie parsing', () => {
  it('returns false (not a throw) for a malformed base64 approval cookie', async () => {
    const request = new Request('https://worker.example/authorize', {
      headers: { Cookie: 'mcp-approved-clients=deadbeef.%%%not-base64%%%' },
    });
    await expect(clientIdAlreadyApproved(request, 'client-abc', SECRET)).resolves.toBe(false);
  });
});
