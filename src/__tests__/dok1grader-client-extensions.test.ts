/**
 * Tests for FR1: DOK1GraderClient extensions
 *
 * Tests gradeBrainlift, listBrainlifts, getStatus, getAssessment methods.
 * Mocks: global fetch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let DOK1GraderClient: any;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
  const mod = await import('../utils/dok1grader-client');
  DOK1GraderClient = mod.DOK1GraderClient;
});

describe('DOK1GraderClient extensions', () => {
  const BASE_URL = 'https://example.com';
  const SERVICE_KEY = 'sk-test-123';

  function makeClient() {
    return new DOK1GraderClient(BASE_URL, SERVICE_KEY).withUser('user@example.com', 'Test User');
  }

  // ── gradeBrainlift ──

  describe('gradeBrainlift', () => {
    it('throws if withUser not called', async () => {
      const client = new DOK1GraderClient(BASE_URL, SERVICE_KEY);
      await expect(client.gradeBrainlift('# Test')).rejects.toThrow(/withUser/i);
    });

    it('sends POST to /api/internal/grade with markdown in body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ slug: 'test-slug', brainliftId: 1, status: 'grading', retryAfter: 30 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = makeClient();
      await client.gradeBrainlift('# My Brainlift\n\nContent');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/api/internal/grade');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.markdown).toBe('# My Brainlift\n\nContent');
    });

    it('sends title in body when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ slug: 'test-slug', brainliftId: 1, status: 'grading', retryAfter: 30 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = makeClient();
      await client.gradeBrainlift('# Content', 'Custom Title');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.title).toBe('Custom Title');
    });

    it('returns parsed response with slug, brainliftId, status, retryAfter', async () => {
      const responseData = { slug: 'my-slug', brainliftId: 42, status: 'grading', retryAfter: 30 };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      }));

      const client = makeClient();
      const result = await client.gradeBrainlift('# Test');

      expect(result).toEqual(responseData);
    });

    it('throws on non-200 response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Markdown content is required'),
      }));

      const client = makeClient();
      await expect(client.gradeBrainlift('')).rejects.toThrow(/400/);
    });
  });

  // ── listBrainlifts ──

  describe('listBrainlifts', () => {
    it('throws if withUser not called', async () => {
      const client = new DOK1GraderClient(BASE_URL, SERVICE_KEY);
      await expect(client.listBrainlifts()).rejects.toThrow(/withUser/i);
    });

    it('sends GET to /api/internal/brainlifts with query params', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ brainlifts: [], pagination: { page: 2, pageSize: 5, totalItems: 0, totalPages: 0 } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = makeClient();
      await client.listBrainlifts(2, 5);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/internal/brainlifts');
      expect(url).toContain('page=2');
      expect(url).toContain('pageSize=5');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('uses defaults when no params provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ brainlifts: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = makeClient();
      await client.listBrainlifts();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('page=1');
      expect(url).toContain('pageSize=10');
    });

    it('returns parsed response', async () => {
      const responseData = {
        brainlifts: [{ slug: 's', title: 't', status: 'complete', score: 4.0, createdAt: '2026-03-31' }],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      }));

      const client = makeClient();
      const result = await client.listBrainlifts();
      expect(result).toEqual(responseData);
    });

    it('throws on non-200 response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      }));

      const client = makeClient();
      await expect(client.listBrainlifts()).rejects.toThrow(/500/);
    });
  });

  // ── getStatus ──

  describe('getStatus', () => {
    it('throws if withUser not called', async () => {
      const client = new DOK1GraderClient(BASE_URL, SERVICE_KEY);
      await expect(client.getStatus('my-slug')).rejects.toThrow(/withUser/i);
    });

    it('sends GET to /api/internal/brainlifts/:slug/status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ slug: 'my-slug', status: 'grading', progress: {}, score: {}, retryAfter: 15 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = makeClient();
      await client.getStatus('my-slug');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://example.com/api/internal/brainlifts/my-slug/status');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('returns parsed response', async () => {
      const responseData = {
        slug: 'my-slug',
        title: 'Test',
        status: 'grading',
        progress: {
          dok1: { total: 10, graded: 5, pending: 5, error: 0 },
          dok2: { total: 3, graded: 3, pending: 0, error: 0 },
          dok3: { total: 2, graded: 0, pending: 2, error: 0 },
          dok4: { total: 1, graded: 0, pending: 1, error: 0 },
        },
        score: { overall: null, dok1Mean: 3.8, dok2Mean: 4.1, dok3Mean: null, dok4Mean: null },
        retryAfter: 15,
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      }));

      const client = makeClient();
      const result = await client.getStatus('my-slug');
      expect(result).toEqual(responseData);
    });

    it('throws on 404', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Brainlift not found'),
      }));

      const client = makeClient();
      await expect(client.getStatus('bad-slug')).rejects.toThrow(/404/);
    });
  });

  // ── getAssessment ──

  describe('getAssessment', () => {
    it('throws if withUser not called', async () => {
      const client = new DOK1GraderClient(BASE_URL, SERVICE_KEY);
      await expect(client.getAssessment('slug', 1, 1, 20)).rejects.toThrow(/withUser/i);
    });

    it('sends GET with all query params', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ slug: 's', dok: 1, items: [], pagination: {} }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = makeClient();
      await client.getAssessment('my-slug', 3, 2, 25, 'full');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/internal/brainlifts/my-slug/assessment');
      expect(url).toContain('dok=3');
      expect(url).toContain('page=2');
      expect(url).toContain('pageSize=25');
      expect(url).toContain('detail=full');
    });

    it('defaults detail to summary when not provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ slug: 's', dok: 1, items: [], pagination: {} }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = makeClient();
      await client.getAssessment('my-slug', 1, 1, 20);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('detail=summary');
    });

    it('returns parsed response', async () => {
      const responseData = {
        slug: 's',
        dok: 1,
        status: 'complete',
        items: [{ id: 1, fact: 'A fact', score: 4 }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      }));

      const client = makeClient();
      const result = await client.getAssessment('s', 1, 1, 20);
      expect(result).toEqual(responseData);
    });

    it('throws on non-200 response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      }));

      const client = makeClient();
      await expect(client.getAssessment('bad', 1, 1, 20)).rejects.toThrow(/404/);
    });
  });
});
