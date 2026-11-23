import { describe, it, expect } from 'vitest';
import { isLoopbackHostname, isRegisteredRedirectUri } from '../redirect-uri';

describe('isLoopbackHostname', () => {
  it('accepts localhost, 127.0.0.0/8 and [::1]', () => {
    for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '[::1]']) {
      expect(isLoopbackHostname(host), host).toBe(true);
    }
  });

  it('rejects other hosts, including lookalikes', () => {
    for (const host of ['example.com', 'localhost.example.com', '128.0.0.1', '10.0.0.1', '127.0.0.1.example.com']) {
      expect(isLoopbackHostname(host), host).toBe(false);
    }
  });
});

describe('isRegisteredRedirectUri', () => {
  const registered = ['http://localhost:54929/callback', 'https://app.example.com/cb'];

  it('accepts an exact match', () => {
    expect(isRegisteredRedirectUri('https://app.example.com/cb', registered)).toBe(true);
    expect(isRegisteredRedirectUri('http://localhost:54929/callback', registered)).toBe(true);
  });

  it('lets a loopback redirect URI use a different port (RFC 8252 §7.3)', () => {
    expect(isRegisteredRedirectUri('http://localhost:61000/callback', registered)).toBe(true);
    expect(isRegisteredRedirectUri('http://localhost/callback', registered)).toBe(true);
  });

  it('requires the loopback scheme, host, path and query to match', () => {
    expect(isRegisteredRedirectUri('http://localhost:61000/other', registered)).toBe(false);
    expect(isRegisteredRedirectUri('http://127.0.0.1:61000/callback', registered)).toBe(false);
    expect(isRegisteredRedirectUri('https://localhost:61000/callback', registered)).toBe(false);
    expect(isRegisteredRedirectUri('http://localhost:61000/callback?x=1', registered)).toBe(false);
    expect(isRegisteredRedirectUri('javascript://localhost:61000/callback', registered)).toBe(false);
  });

  it('never relaxes the port for non-loopback hosts', () => {
    expect(isRegisteredRedirectUri('https://app.example.com:8443/cb', registered)).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(isRegisteredRedirectUri('not a url', registered)).toBe(false);
  });
});
