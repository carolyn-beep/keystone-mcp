/**
 * Tests for FR3: DOK1GraderClient HTTP client
 *
 * Tests request headers, error handling, and getTemplate method.
 * Mocks: global fetch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll import the client after creating it
let DOK1GraderClient: any;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
  const mod = await import('../utils/dok1grader-client');
  DOK1GraderClient = mod.DOK1GraderClient;
});

describe('DOK1GraderClient', () => {
  describe('constructor', () => {
    it('stores baseUrl and serviceKey', () => {
      const client = new DOK1GraderClient('https://example.com', 'sk-test-123');
      expect(client).toBeDefined();
    });
  });

  describe('withUser', () => {
    it('returns this for chaining', () => {
      const client = new DOK1GraderClient('https://example.com', 'sk-test-123');
      const result = client.withUser('user@example.com', 'Test User');
      expect(result).toBe(client);
    });
  });

  describe('getTemplate', () => {
    it('throws if withUser not called', async () => {
      const client = new DOK1GraderClient('https://example.com', 'sk-test-123');
      await expect(client.getTemplate()).rejects.toThrow(/withUser/i);
    });

    it('sends correct headers (X-Service-Key, X-User-Email, X-User-Name)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ template: '# Template', format: 'markdown' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new DOK1GraderClient('https://example.com', 'sk-test-123');
      client.withUser('user@example.com', 'Test User');
      await client.getTemplate();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/api/internal/template');
      expect(options.headers['X-Service-Key']).toBe('sk-test-123');
      expect(options.headers['X-User-Email']).toBe('user@example.com');
      expect(options.headers['X-User-Name']).toBe('Test%20User');
    });

    it('uses GET method', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ template: '# T', format: 'markdown' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new DOK1GraderClient('https://example.com', 'sk-test-123');
      client.withUser('u@e.com', 'U');
      await client.getTemplate();

      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('returns the template string from response', async () => {
      const templateContent = '# Brainlift Template\n\nContent here.';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ template: templateContent, format: 'markdown' }),
      }));

      const client = new DOK1GraderClient('https://example.com', 'sk-test-123');
      client.withUser('u@e.com', 'U');
      const result = await client.getTemplate();

      expect(result).toBe(templateContent);
    });

    it('throws on non-200 response with status and message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      }));

      const client = new DOK1GraderClient('https://example.com', 'sk-test-123');
      client.withUser('u@e.com', 'U');

      await expect(client.getTemplate()).rejects.toThrow(/401/);
    });

    it('throws on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const client = new DOK1GraderClient('https://example.com', 'sk-test-123');
      client.withUser('u@e.com', 'U');

      await expect(client.getTemplate()).rejects.toThrow(/Network error/);
    });

    it('constructs URL from baseUrl without trailing slash', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ template: '#', format: 'markdown' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new DOK1GraderClient('https://example.com/', 'sk-test-123');
      client.withUser('u@e.com', 'U');
      await client.getTemplate();

      // Should not have double slash
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('//api');
    });
  });
});
