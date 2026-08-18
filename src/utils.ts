/**
 * OAuth utility functions adapted from clado-mcp.
 * Handles upstream authorization URL construction and token exchange.
 */

export function getUpstreamAuthorizeUrl({
  upstreamUrl,
  clientId,
  scope,
  redirectUri,
  state,
  hostedDomain,
}: {
  upstreamUrl: string;
  clientId: string;
  scope: string;
  redirectUri: string;
  state?: string;
  hostedDomain?: string;
}) {
  const upstream = new URL(upstreamUrl);
  upstream.searchParams.set('client_id', clientId);
  upstream.searchParams.set('redirect_uri', redirectUri);
  upstream.searchParams.set('scope', scope);
  upstream.searchParams.set('response_type', 'code');
  upstream.searchParams.set('include_granted_scopes', 'false');
  if (state) upstream.searchParams.set('state', state);
  if (hostedDomain) upstream.searchParams.set('hd', hostedDomain);
  return upstream.href;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  scope?: string;
}

export async function fetchUpstreamAuthToken({
  clientId,
  clientSecret,
  code,
  redirectUri,
  upstreamUrl,
  grantType,
}: {
  code: string | undefined;
  upstreamUrl: string;
  clientSecret: string;
  redirectUri: string;
  clientId: string;
  grantType: string;
}): Promise<[TokenData, null] | [null, Response]> {
  if (!code) {
    return [null, new Response('Missing code', { status: 400 })];
  }

  const resp = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: grantType,
    }).toString(),
  });

  if (!resp.ok) {
    // Log status only — the response body of a failed token exchange can
    // contain sensitive upstream detail and should not land in Worker logs.
    console.error(`OAuth token exchange failed: ${resp.status} ${resp.statusText}`);
    return [
      null,
      new Response('Failed to fetch access token', { status: 500 }),
    ];
  }

  const body = (await resp.json()) as OAuthTokenResponse;

  if (!body.access_token) {
    return [null, new Response('Missing access token', { status: 400 })];
  }

  const tokenData: TokenData = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    tokenType: body.token_type || 'Bearer',
    expiresAt: Date.now() + body.expires_in * 1000,
    scope: body.scope,
  };

  return [tokenData, null];
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to BrainliftMCP as this.props
export type Props = {
  name: string;
  email: string;
  accessToken: string;
  tokenType: string;
  expiresAt: number;
};
