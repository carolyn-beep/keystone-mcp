/**
 * The small HTML page that forwards the browser to Google, and back to the
 * MCP client after sign-in, via a meta refresh plus a top-level navigation.
 *
 * The target URL ends up in an HTML attribute and in an inline script, so
 * it is checked to be http(s) and encoded for each context. A `javascript:`
 * URL would otherwise run in the Worker's origin.
 */

import { escapeHtml } from './consent-page.js';

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** JSON string literal that is also safe inside a <script> element. */
function scriptStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

/**
 * Returns null when `target` is not an http(s) URL; callers turn that into
 * an error response instead of redirecting.
 */
export function renderRedirectPage(target: string, title: string, message: string): string | null {
  if (!isHttpUrl(target)) return null;
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="3;url=${escapeHtml(target)}">
<title>${escapeHtml(title)}</title>
<script>setTimeout(() => { window.top.location.href = ${scriptStringLiteral(target)}; }, 1500);</script>
</head><body><p>${escapeHtml(message)}</p></body></html>`;
}
