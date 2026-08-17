import { beforeEach, describe, expect, it, vi } from 'vitest';

let KeystoneClient: any;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
  const mod = await import('../utils/keystone-client');
  KeystoneClient = mod.KeystoneClient;
});

describe('KeystoneClient student sprint methods', () => {
  const BASE_URL = 'https://example.com';
  const SERVICE_KEY = 'sk-test-123';

  function makeClient() {
    return new KeystoneClient(BASE_URL, SERVICE_KEY).withUser('student@example.com', 'Student User');
  }

  it('generatePlan posts localDate to internal plans endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        plan: { id: 7, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active', taskCount: 2, completedTaskCount: 0 },
        tasks: [],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeClient();
    const diagnosis = {
      goalRaw: 'Ship an MVP in 30 days.',
      currentState: 'Rough problem statement; no user interviews yet.',
    };
    await client.generatePlan('my-brainlift', { localDate: '2026-04-21', diagnosis });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api/internal/brainlifts/my-brainlift/plans');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Service-Key']).toBe(SERVICE_KEY);
    expect(options.headers['X-User-Email']).toBe('student@example.com');
    expect(options.headers['X-User-Name']).toBe('Student%20User');
    expect(JSON.parse(options.body)).toEqual({ localDate: '2026-04-21', diagnosis });
  });

  it('getPlan normalizes { plan: null, tasks: [] } to null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ plan: null, tasks: [] }),
    }));

    const client = makeClient();
    const result = await client.getPlan('my-brainlift');

    expect(result).toBeNull();
  });

  it('listTasks serializes query params including includePastDue/localDate', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeClient();
    await client.listTasks('my-brainlift', {
      date: '2026-04-22',
      week: 1,
      state: 'incomplete',
      includePastDue: true,
      localDate: '2026-04-22',
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/internal/brainlifts/my-brainlift/tasks?');
    expect(url).toContain('date=2026-04-22');
    expect(url).toContain('week=1');
    expect(url).toContain('state=incomplete');
    expect(url).toContain('includePastDue=true');
    expect(url).toContain('localDate=2026-04-22');
  });

  it('getTask uses task detail endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 12 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeClient();
    await client.getTask('slug-a', 12);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api/internal/brainlifts/slug-a/tasks/12');
    expect(options.method).toBe('GET');
  });

  it('saveDeliverable posts title + markdown', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docUrl: 'https://docs.google.com/document/d/abc' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeClient();
    await client.saveDeliverable('slug-a', 10, { title: 'Draft', markdown: '# body' });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api/internal/brainlifts/slug-a/tasks/10/deliverable');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ title: 'Draft', markdown: '# body' });
  });

  it('readDeliverable uses GET deliverable endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: 'Draft', contentMarkdown: '# body', docUrl: 'https://docs.google.com/document/d/abc' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeClient();
    await client.readDeliverable('slug-a', 10);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api/internal/brainlifts/slug-a/tasks/10/deliverable');
    expect(options.method).toBe('GET');
  });

  it('updateDeliverable uses PUT and sends markdown body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docUrl: 'https://docs.google.com/document/d/abc' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeClient();
    await client.updateDeliverable('slug-a', 10, { markdown: '# revised' });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api/internal/brainlifts/slug-a/tasks/10/deliverable');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ markdown: '# revised' });
  });

  it('listDeliverables supports optional planId query', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ plans: [], deliverables: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeClient();
    await client.listDeliverables('slug-a', { planId: 3 });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api/internal/brainlifts/slug-a/deliverables?planId=3');
    expect(options.method).toBe('GET');
  });

  it('propagates API errors for sprint methods', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Deliverable not found'),
    }));

    const client = makeClient();
    await expect(client.readDeliverable('slug-a', 999)).rejects.toThrow(/404/);
  });
});
