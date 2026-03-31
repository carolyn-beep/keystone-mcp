/**
 * Cookie-based OAuth approval utilities.
 * Adapted from clado-mcp workers-oauth-utils.ts.
 */

import type { AuthRequest } from '@cloudflare/workers-oauth-provider';

const COOKIE_NAME = 'mcp-approved-clients';
const ONE_YEAR_IN_SECONDS = 31536000;

async function importKey(secret: string): Promise<CryptoKey> {
  if (!secret) {
    throw new Error('COOKIE_SECRET is not defined.');
  }
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signData(key: CryptoKey, data: string): Promise<string> {
  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(data),
  );
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifySignature(
  key: CryptoKey,
  signatureHex: string,
  data: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  try {
    const signatureBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes.buffer,
      enc.encode(data),
    );
  } catch {
    return false;
  }
}

async function getApprovedClientsFromCookie(
  cookieHeader: string | null,
  secret: string,
): Promise<string[] | null> {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const targetCookie = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!targetCookie) return null;

  const cookieValue = targetCookie.substring(COOKIE_NAME.length + 1);
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;

  const [signatureHex, base64Payload] = parts;
  const payload = atob(base64Payload);

  const key = await importKey(secret);
  const isValid = await verifySignature(key, signatureHex, payload);
  if (!isValid) return null;

  try {
    const approvedClients = JSON.parse(payload);
    if (!Array.isArray(approvedClients)) return null;
    if (!approvedClients.every((item) => typeof item === 'string')) return null;
    return approvedClients as string[];
  } catch {
    return null;
  }
}

export async function clientIdAlreadyApproved(
  request: Request,
  clientId: string,
  cookieSecret: string,
): Promise<boolean> {
  if (!clientId) return false;
  const cookieHeader = request.headers.get('Cookie');
  const approvedClients = await getApprovedClientsFromCookie(
    cookieHeader,
    cookieSecret,
  );
  return approvedClients?.includes(clientId) ?? false;
}

export interface ParsedApprovalResult {
  state: any;
  headers: Record<string, string>;
}

export async function parseRedirectApproval(
  request: Request,
  cookieSecret: string,
): Promise<ParsedApprovalResult> {
  if (request.method !== 'POST') {
    throw new Error('Invalid request method. Expected POST.');
  }

  const formData = await request.formData();
  const encodedState = formData.get('state');
  if (typeof encodedState !== 'string' || !encodedState) {
    throw new Error("Missing or invalid 'state' in form data.");
  }

  const state = JSON.parse(atob(encodedState)) as {
    oauthReqInfo?: AuthRequest;
  };
  const clientId = state?.oauthReqInfo?.clientId;
  if (!clientId) {
    throw new Error('Could not extract clientId from state object.');
  }

  const cookieHeader = request.headers.get('Cookie');
  const existingApprovedClients =
    (await getApprovedClientsFromCookie(cookieHeader, cookieSecret)) || [];
  const updatedApprovedClients = Array.from(
    new Set([...existingApprovedClients, clientId]),
  );

  const payload = JSON.stringify(updatedApprovedClients);
  const key = await importKey(cookieSecret);
  const signature = await signData(key, payload);
  const newCookieValue = `${signature}.${btoa(payload)}`;

  const headers: Record<string, string> = {
    'Set-Cookie': `${COOKIE_NAME}=${newCookieValue}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${ONE_YEAR_IN_SECONDS}`,
  };

  return { state, headers };
}

export async function autoApprove(
  request: Request,
  auth: AuthRequest,
  cookieSecret: string,
): Promise<ParsedApprovalResult> {
  const cookieHeader = request.headers.get('Cookie');
  const existingApprovedClients =
    (await getApprovedClientsFromCookie(cookieHeader, cookieSecret)) || [];
  const updatedApprovedClients = Array.from(
    new Set([...existingApprovedClients, auth.clientId]),
  );

  const payload = JSON.stringify(updatedApprovedClients);
  const key = await importKey(cookieSecret);
  const signature = await signData(key, payload);
  const newCookieValue = `${signature}.${btoa(payload)}`;

  const headers: Record<string, string> = {
    'Set-Cookie': `${COOKIE_NAME}=${newCookieValue}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${ONE_YEAR_IN_SECONDS}`,
  };

  return { headers, state: { oauthReqInfo: auth } };
}
