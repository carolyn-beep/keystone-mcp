import { describe, it, expect } from 'vitest';
import { keystoneErrorMessage } from '../utils/keystone-client';
import { formatErrorGuidance } from '../utils/formatters';

describe('keystoneErrorMessage', () => {
  it('keeps the status and the short error string from a JSON body', () => {
    expect(keystoneErrorMessage(404, '{"error":"Brainlift not found"}')).toBe(
      'Keystone API error: 404 - Brainlift not found',
    );
    expect(keystoneErrorMessage(400, '{"message":"Markdown content is required"}')).toBe(
      'Keystone API error: 400 - Markdown content is required',
    );
  });

  it('drops non-JSON bodies such as HTML error pages or stack traces', () => {
    const html = '<html><body>Error: connect ECONNREFUSED 10.0.0.5:5432 at TCPConnectWrap</body></html>';
    expect(keystoneErrorMessage(500, html)).toBe('Keystone API error: 500');
  });

  it('drops JSON bodies without a string error field', () => {
    expect(keystoneErrorMessage(500, '{"stack":"at db.query (/srv/app/db.ts:12)"}')).toBe('Keystone API error: 500');
    expect(keystoneErrorMessage(500, '{"error":{"code":"X"}}')).toBe('Keystone API error: 500');
    expect(keystoneErrorMessage(500, '')).toBe('Keystone API error: 500');
  });

  it('truncates long error strings', () => {
    const message = keystoneErrorMessage(400, JSON.stringify({ error: 'x'.repeat(5000) }));
    expect(message.length).toBeLessThan(350);
    expect(message.endsWith('...')).toBe(true);
  });

  it("passes Keystone's retryAfter through so rate-limit guidance uses it", () => {
    const message = keystoneErrorMessage(429, '{"error":"Rate limit exceeded","retryAfter":17}');
    expect(message).toBe('Keystone API error: 429 - Rate limit exceeded (retry-after: 17)');
    expect(formatErrorGuidance(message, 'list_brainlifts')).toContain('Wait 17 seconds');
  });

  it('falls back to 60 seconds without a retryAfter value', () => {
    const message = keystoneErrorMessage(429, '{"error":"Rate limit exceeded"}');
    expect(formatErrorGuidance(message, 'list_brainlifts')).toContain('Wait 60 seconds');
  });
});
