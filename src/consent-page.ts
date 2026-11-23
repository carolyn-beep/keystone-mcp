/**
 * HTML for the MCP consent screen shown by GET /authorize.
 *
 * Anyone can register a client through /register, so the client name and
 * redirect URI are attacker-chosen. Everything that came from the client is
 * HTML-escaped, and the page has no script.
 */

import type { ConsentDescription } from '@cloudflare/workers-oauth-provider';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Blocks script, framing and form posts to other origins on the consent page. */
export const CONSENT_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export function renderConsentPage(details: ConsentDescription, handle: string): string {
  const clientName = escapeHtml(details.clientName);
  const redirectHost = escapeHtml(details.redirectHost);
  const redirectUri = escapeHtml(details.redirectUri);

  const localAppWarning = details.redirectIsLoopback
    ? `<p class="warning"><strong>This sends access to an app on your computer.</strong>
  Continue only if you just started connecting from that app yourself.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Allow ${clientName} to use Keystone?</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 34rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; color: #1a1a1a; background: #fff; }
  .host { font-family: ui-monospace, monospace; font-size: 1.05em; }
  .uri { font-family: ui-monospace, monospace; font-size: 0.85em; color: #555; word-break: break-all; }
  .warning { background: #fff4e5; border-left: 4px solid #b45309; padding: 0.5rem 0.75rem; }
  button { font-size: 1rem; padding: 0.5rem 1.25rem; margin-right: 0.5rem; }
</style>
</head><body>
<h1>Allow ${clientName} to use your Keystone account?</h1>
<p>An app calling itself <strong>${clientName}</strong> wants to connect to Keystone as you.
This name was chosen by the app when it registered and has not been verified.</p>
<p>If you allow it, it can read, create, edit and delete your Keystone documents using your account.</p>
<p>Access will be sent to <strong class="host">${redirectHost}</strong></p>
<p class="uri">${redirectUri}</p>
${localAppWarning}
<p>If you did not just try to connect an app to Keystone, choose Deny.</p>
<form method="post" action="/authorize">
  <input type="hidden" name="handle" value="${escapeHtml(handle)}">
  <button type="submit" name="decision" value="approve">Allow</button>
  <button type="submit" name="decision" value="deny">Deny</button>
</form>
</body></html>`;
}
