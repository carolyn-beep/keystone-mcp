/**
 * Tests for KeystoneClient CRUD methods.
 *
 * Verifies URL construction, HTTP method, body serialization,
 * and auth header injection for all new CRUD endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeystoneClient, normalizeAiWritingSignal, transformAssessmentItem } from './keystone-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function okJson(data: object) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function errorResponse(status: number, body: string) {
  return new Response(body, { status });
}

describe('KeystoneClient CRUD methods', () => {
  let client: KeystoneClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new KeystoneClient('https://api.example.com', 'test-key')
      .withUser('user@example.com', 'Test User');
  });

  // ── Auth headers ──

  it('injects service key and user headers on all requests', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ id: 1, dokLevel: 1, status: 'regrading', previousScore: 3, message: 'ok' }));
    await client.editDokItem('my-slug', 1, 42, 'new text');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['X-Service-Key']).toBe('test-key');
    expect(init.headers['X-User-Email']).toBe('user@example.com');
    expect(init.headers['X-User-Name']).toBe('Test%20User');
  });

  // ── editDokItem ──

  describe('editDokItem', () => {
    it('sends PATCH to correct URL with text body', async () => {
      mockFetch.mockResolvedValueOnce(okJson({
        id: 42, dokLevel: 1, status: 'regrading', previousScore: 3, message: 'Regrading',
      }));

      const result = await client.editDokItem('my-slug', 1, 42, 'updated fact text');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/dok/1/items/42');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ text: 'updated fact text' });
      expect(result).toEqual({
        id: 42, dokLevel: 1, status: 'regrading', previousScore: 3, message: 'Regrading',
      });
    });

    it('throws on non-OK response with status code in message', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404, 'Item not found'));
      await expect(client.editDokItem('my-slug', 1, 999, 'text'))
        .rejects.toThrow(/404/);
    });
  });

  // ── deleteDokItem ──

  describe('deleteDokItem', () => {
    it('sends DELETE with ?preview=true when preview is true', async () => {
      mockFetch.mockResolvedValueOnce(okJson({
        item: { id: 42, text: 'fact', score: 3 },
        impact: { unlinked: 2, markedStale: 1, details: ['DOK2 #10 unlinked'] },
      }));

      await client.deleteDokItem('my-slug', 1, 42, true);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/dok/1/items/42?preview=true');
      expect(init.method).toBe('DELETE');
    });

    it('sends DELETE without preview param when preview is false', async () => {
      mockFetch.mockResolvedValueOnce(okJson({
        deleted: true, impact: { unlinked: 2, markedStale: 1 },
      }));

      await client.deleteDokItem('my-slug', 1, 42, false);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/dok/1/items/42');
      expect(init.method).toBe('DELETE');
    });
  });

  // ── createDok1 ──

  describe('createDok1', () => {
    it('sends POST to /dok1 with fact, source, category', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ id: 100, status: 'grading' }));

      const result = await client.createDok1('my-slug', {
        fact: 'Water boils at 100C', source: 'Physics textbook', category: 'Science',
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/dok1');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        fact: 'Water boils at 100C', source: 'Physics textbook', category: 'Science',
      });
      expect(result).toEqual({ id: 100, status: 'grading' });
    });
  });

  // ── createDok2 ──

  describe('createDok2', () => {
    it('sends POST to /dok2 with points and relatedFactIds', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ id: 50, status: 'grading' }));

      await client.createDok2('my-slug', {
        sourceName: 'Research Paper', sourceUrl: 'https://example.com/paper',
        points: ['Point 1', 'Point 2'], relatedFactIds: [1, 2],
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/dok2');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.points).toEqual(['Point 1', 'Point 2']);
      expect(body.relatedFactIds).toEqual([1, 2]);
    });
  });

  // ── createDok3 ──

  describe('createDok3', () => {
    it('sends POST to /dok3 with text and linkedDok2Ids', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ id: 30, status: 'grading' }));

      await client.createDok3('my-slug', {
        text: 'Cross-source insight', linkedDok2Ids: [10, 15],
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/dok3');
      expect(JSON.parse(init.body)).toEqual({
        text: 'Cross-source insight', linkedDok2Ids: [10, 15],
      });
    });
  });

  // ── createDok4 ──

  describe('createDok4', () => {
    it('sends POST to /dok4 with text, linkedDok3Ids, and primaryDok3Id', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ id: 20, status: 'grading' }));

      await client.createDok4('my-slug', {
        text: 'My spiky take', linkedDok3Ids: [30, 31], primaryDok3Id: 30,
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/dok4');
      const body = JSON.parse(init.body);
      expect(body.linkedDok3Ids).toEqual([30, 31]);
      expect(body.primaryDok3Id).toBe(30);
    });
  });

  // ── expert methods ──

  describe('listExperts', () => {
    it('sends GET to the internal experts endpoint', async () => {
      mockFetch.mockResolvedValueOnce(okJson([
        {
          id: 10,
          name: 'Andrew Huberman',
          who: 'Stanford neuroscientist',
          why: 'Grounds the neuroscience angle',
          focus: 'sleep',
          where: '@hubermanlab',
          rankScore: 4.3,
          rationale: 'High relevance',
          twitterHandle: 'hubermanlab',
          source: 'manual',
          isFollowing: false,
        },
      ]));

      const result = await client.listExperts('my-slug');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/experts');
      expect(init.method).toBe('GET');
      expect(result[0].id).toBe(10);
    });
  });

  describe('createExperts', () => {
    it('sends POST to the internal experts endpoint with batch payload', async () => {
      mockFetch.mockResolvedValueOnce(okJson([
        {
          id: 11,
          name: 'Cal Newport',
          who: 'Computer science professor',
          why: 'Frames deep work tradeoffs',
          focus: null,
          where: '@CalNewportMedia',
          rankScore: null,
          rationale: null,
          twitterHandle: 'CalNewportMedia',
          source: 'manual',
          isFollowing: false,
        },
      ]));

      const result = await client.createExperts('my-slug', [
        {
          name: 'Cal Newport',
          who: 'Computer science professor',
          why: 'Frames deep work tradeoffs',
          where: '@CalNewportMedia',
        },
      ]);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/experts');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        experts: [
          {
            name: 'Cal Newport',
            who: 'Computer science professor',
            why: 'Frames deep work tradeoffs',
            where: '@CalNewportMedia',
          },
        ],
      });
      expect(result[0].id).toBe(11);
    });
  });

  describe('deleteExpert', () => {
    it('sends DELETE to the internal experts item endpoint', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await client.deleteExpert('my-slug', 12);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/experts/12');
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
    });
  });

  // ── getStaleItems ──

  describe('getStaleItems', () => {
    it('sends GET to /stale endpoint', async () => {
      mockFetch.mockResolvedValueOnce(okJson({
        dok1: [], dok2: [{ id: 10, displayTitle: 'Summary', staleReason: 'DOK1 #42 edited' }],
        dok3: [], dok4: [],
      }));

      const result = await client.getStaleItems('my-slug');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/stale');
      expect(init.method).toBe('GET');
      expect(result.dok2).toHaveLength(1);
    });
  });

  // ── dismissStale ──

  describe('dismissStale', () => {
    it('sends POST to the item dismiss-stale endpoint', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ dismissed: true }));

      await client.dismissStale('my-slug', 2, 10);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/internal/brainlifts/my-slug/dok/2/items/10/dismiss-stale');
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
    });
  });

  // ── request() body for PATCH/DELETE ──

  describe('request method body handling', () => {
    it('sends body for PATCH requests', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ id: 1, dokLevel: 1, status: 'regrading', previousScore: null, message: '' }));
      await client.editDokItem('slug', 1, 1, 'text');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('PATCH');
      expect(init.body).toBeDefined();
    });
  });

  // ── AI Writing Signal transform on getAssessment (Spec 04) ──

  describe('getAssessment AI Writing Signal transform', () => {
    function assessmentBody(dok: number, items: object[]) {
      return {
        slug: 'my-slug',
        dok,
        status: 'complete',
        items,
        pagination: { page: 1, pageSize: 10, totalItems: items.length, totalPages: 1 },
      };
    }

    it('transforms camelCase aiWritingSignal to snake_case ai_writing_signal on DOK3 items', async () => {
      mockFetch.mockResolvedValueOnce(okJson(assessmentBody(3, [
        { id: 1, text: 'Insight A', aiWritingSignal: 'Human' },
        { id: 2, text: 'Insight B', aiWritingSignal: 'AI-Assisted' },
        { id: 3, text: 'Insight C', aiWritingSignal: 'Mixed' },
        { id: 4, text: 'Insight D', aiWritingSignal: 'AI' },
      ])));

      const result = await client.getAssessment('my-slug', 3, 1, 10);

      expect(result.items).toHaveLength(4);
      expect(result.items[0].ai_writing_signal).toBe('human');
      expect(result.items[1].ai_writing_signal).toBe('ai-assisted');
      expect(result.items[2].ai_writing_signal).toBe('mixed');
      expect(result.items[3].ai_writing_signal).toBe('ai');
      // camelCase form is stripped at the boundary
      expect(result.items[0].aiWritingSignal).toBeUndefined();
    });

    it('transforms on DOK2 items', async () => {
      mockFetch.mockResolvedValueOnce(okJson(assessmentBody(2, [
        { id: 10, displayTitle: 'Summary', aiWritingSignal: 'Human' },
      ])));

      const result = await client.getAssessment('my-slug', 2, 1, 10);
      expect(result.items[0].ai_writing_signal).toBe('human');
    });

    it('transforms on DOK4 items', async () => {
      mockFetch.mockResolvedValueOnce(okJson(assessmentBody(4, [
        { id: 20, text: 'SPOV', aiWritingSignal: 'AI' },
      ])));

      const result = await client.getAssessment('my-slug', 4, 1, 10);
      expect(result.items[0].ai_writing_signal).toBe('ai');
    });

    it('deserializes missing field as ai_writing_signal: null (pre-Spec-01 / pre-launch items)', async () => {
      mockFetch.mockResolvedValueOnce(okJson(assessmentBody(3, [
        { id: 1, text: 'Insight with no signal field at all' },
      ])));

      const result = await client.getAssessment('my-slug', 3, 1, 10);
      expect(result.items[0].ai_writing_signal).toBeNull();
    });

    it('deserializes explicit null as ai_writing_signal: null (in-progress / errored analysis)', async () => {
      mockFetch.mockResolvedValueOnce(okJson(assessmentBody(3, [
        { id: 1, text: 'In-progress', aiWritingSignal: null },
      ])));

      const result = await client.getAssessment('my-slug', 3, 1, 10);
      expect(result.items[0].ai_writing_signal).toBeNull();
    });

    it('deserializes unknown future label as null (forward-compatible, no crash)', async () => {
      mockFetch.mockResolvedValueOnce(okJson(assessmentBody(3, [
        { id: 1, text: 'Future bucket', aiWritingSignal: 'Hyper-Synthetic' },
      ])));

      const result = await client.getAssessment('my-slug', 3, 1, 10);
      expect(result.items[0].ai_writing_signal).toBeNull();
    });

    it('does NOT transform DOK1 items (DOK1 is not analyzed per decisions §1)', async () => {
      // DOK1 items pass through verbatim. If the API ever included aiWritingSignal
      // on a DOK1 item by mistake, we leave it alone so it is not silently hidden.
      mockFetch.mockResolvedValueOnce(okJson(assessmentBody(1, [
        { id: 1, fact: 'Water boils at 100C', aiWritingSignal: 'Human' },
      ])));

      const result = await client.getAssessment('my-slug', 1, 1, 10);
      expect(result.items[0]).not.toHaveProperty('ai_writing_signal');
      // The raw camelCase passes through untouched on DOK1
      expect(result.items[0].aiWritingSignal).toBe('Human');
    });

    it('preserves other item fields during transform', async () => {
      mockFetch.mockResolvedValueOnce(okJson(assessmentBody(3, [
        {
          id: 1,
          text: 'Insight',
          score: 4,
          linkedSources: ['Source A', 'Source B'],
          rationale: 'because reasons',
          feedback: 'fb',
          aiWritingSignal: 'Human',
        },
      ])));

      const result = await client.getAssessment('my-slug', 3, 1, 10);
      const item = result.items[0];
      expect(item.id).toBe(1);
      expect(item.text).toBe('Insight');
      expect(item.score).toBe(4);
      expect(item.linkedSources).toEqual(['Source A', 'Source B']);
      expect(item.rationale).toBe('because reasons');
      expect(item.feedback).toBe('fb');
      expect(item.ai_writing_signal).toBe('human');
    });
  });
});

// ── Unit tests for the standalone normalize/transform helpers ──

describe('normalizeAiWritingSignal', () => {
  it('lowercases known capitalized labels', () => {
    expect(normalizeAiWritingSignal('Human')).toBe('human');
    expect(normalizeAiWritingSignal('AI-Assisted')).toBe('ai-assisted');
    expect(normalizeAiWritingSignal('Mixed')).toBe('mixed');
    expect(normalizeAiWritingSignal('AI')).toBe('ai');
  });

  it('passes through already-lowercase labels', () => {
    expect(normalizeAiWritingSignal('human')).toBe('human');
    expect(normalizeAiWritingSignal('ai-assisted')).toBe('ai-assisted');
  });

  it('returns null for null / undefined / non-string', () => {
    expect(normalizeAiWritingSignal(null)).toBeNull();
    expect(normalizeAiWritingSignal(undefined)).toBeNull();
    expect(normalizeAiWritingSignal(42)).toBeNull();
    expect(normalizeAiWritingSignal({})).toBeNull();
  });

  it('returns null for unknown labels (forward-compatible)', () => {
    expect(normalizeAiWritingSignal('Robot')).toBeNull();
    expect(normalizeAiWritingSignal('Hyper-Synthetic')).toBeNull();
    expect(normalizeAiWritingSignal('')).toBeNull();
  });
});

describe('transformAssessmentItem', () => {
  it('accepts camelCase aiWritingSignal on input', () => {
    const out = transformAssessmentItem({ id: 1, text: 'x', aiWritingSignal: 'Human' });
    expect(out.ai_writing_signal).toBe('human');
    expect(out).not.toHaveProperty('aiWritingSignal');
  });

  it('accepts snake_case ai_writing_signal on input (forward-compat if API ever switches)', () => {
    const out = transformAssessmentItem({ id: 1, text: 'x', ai_writing_signal: 'mixed' });
    expect(out.ai_writing_signal).toBe('mixed');
  });

  it('writes null when neither key is present', () => {
    const out = transformAssessmentItem({ id: 1, text: 'x' });
    expect(out.ai_writing_signal).toBeNull();
  });
});
