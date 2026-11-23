/**
 * Redirect URI rules shared by the OAuth handler.
 *
 * workers-oauth-provider applies the same rules when it parses an
 * authorization request; these copies let /callback re-check a request
 * after the round trip through Google without trusting it blindly.
 */

/**
 * Loopback hosts per RFC 8252 §7.3: `localhost`, 127.0.0.0/8 and `::1`.
 * `URL.hostname` keeps the brackets on IPv6 literals.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Whether `requested` is one of the client's registered redirect URIs.
 *
 * Non-loopback URIs must match exactly. Loopback URIs may differ only in
 * port (RFC 8252 §7.3), because native MCP clients listen on an ephemeral
 * port chosen at sign-in time. Scheme, host, path and query must still match.
 */
export function isRegisteredRedirectUri(
  requested: string,
  registered: readonly string[],
): boolean {
  if (registered.includes(requested)) return true;

  const requestedUrl = parseUrl(requested);
  if (!requestedUrl || !isLoopbackHostname(requestedUrl.hostname)) return false;

  return registered.some((candidate) => {
    const registeredUrl = parseUrl(candidate);
    return (
      registeredUrl !== null
      && isLoopbackHostname(registeredUrl.hostname)
      && registeredUrl.protocol === requestedUrl.protocol
      && registeredUrl.hostname === requestedUrl.hostname
      && registeredUrl.pathname === requestedUrl.pathname
      && registeredUrl.search === requestedUrl.search
    );
  });
}
