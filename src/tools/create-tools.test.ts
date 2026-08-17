/**
 * Tests for create_dok1-4 MCP tool handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateDok1 } from './create-dok1';
import { handleCreateDok2 } from './create-dok2';
import { handleCreateDok3 } from './create-dok3';
import { handleCreateDok4 } from './create-dok4';

const mockCreateDok1 = vi.fn();
const mockCreateDok2 = vi.fn();
const mockCreateDok3 = vi.fn();
const mockCreateDok4 = vi.fn();

vi.mock('../utils/keystone-client', () => ({
  KeystoneClient: vi.fn().mockImplementation(() => ({
    withUser: vi.fn().mockReturnThis(),
    createDok1: mockCreateDok1,
    createDok2: mockCreateDok2,
    createDok3: mockCreateDok3,
    createDok4: mockCreateDok4,
  })),
}));

const env = { KEYSTONE_BASE_URL: 'https://api.test.com', KEYSTONE_SERVICE_KEY: 'key' };
const props = { email: 'user@test.com', name: 'Test' };
const noAuth = { email: '', name: '' };

describe('handleCreateDok1', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client.createDok1 and formats response', async () => {
    mockCreateDok1.mockResolvedValueOnce({ id: 100, status: 'grading' });

    const result = await handleCreateDok1(
      { slug: 's', fact: 'Water boils at 100C', source: 'Physics', category: 'Science' },
      env, props,
    );

    expect(mockCreateDok1).toHaveBeenCalledWith('s', {
      fact: 'Water boils at 100C', source: 'Physics', category: 'Science',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('100');
    expect(result.content[0].text).toContain('DOK1');
  });

  it('returns auth error when email missing', async () => {
    const result = await handleCreateDok1(
      { slug: 's', fact: 'f', source: 's' }, env, noAuth,
    );
    expect(result.isError).toBe(true);
  });
});

describe('handleCreateDok2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client.createDok2 and formats response', async () => {
    mockCreateDok2.mockResolvedValueOnce({ id: 50, status: 'grading' });

    const result = await handleCreateDok2(
      { slug: 's', sourceName: 'Paper', points: ['P1'], relatedFactIds: [1] },
      env, props,
    );

    expect(mockCreateDok2).toHaveBeenCalledWith('s', {
      sourceName: 'Paper', sourceUrl: undefined, points: ['P1'], relatedFactIds: [1],
    });
    expect(result.content[0].text).toContain('DOK2');
  });

  it('returns auth error when email missing', async () => {
    const result = await handleCreateDok2(
      { slug: 's', sourceName: 'P', points: ['p'], relatedFactIds: [1] }, env, noAuth,
    );
    expect(result.isError).toBe(true);
  });
});

describe('handleCreateDok3', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client.createDok3 and formats response', async () => {
    mockCreateDok3.mockResolvedValueOnce({ id: 30, status: 'grading' });

    const result = await handleCreateDok3(
      { slug: 's', text: 'Cross-source insight', linkedDok2Ids: [10, 15] },
      env, props,
    );

    expect(mockCreateDok3).toHaveBeenCalledWith('s', {
      text: 'Cross-source insight', linkedDok2Ids: [10, 15],
    });
    expect(result.content[0].text).toContain('DOK3');
  });

  it('returns auth error when email missing', async () => {
    const result = await handleCreateDok3(
      { slug: 's', text: 't', linkedDok2Ids: [1, 2] }, env, noAuth,
    );
    expect(result.isError).toBe(true);
  });
});

describe('handleCreateDok4', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client.createDok4 and formats response', async () => {
    mockCreateDok4.mockResolvedValueOnce({ id: 20, status: 'grading' });

    const result = await handleCreateDok4(
      { slug: 's', text: 'Spiky take', linkedDok3Ids: [30], primaryDok3Id: 30 },
      env, props,
    );

    expect(mockCreateDok4).toHaveBeenCalledWith('s', {
      text: 'Spiky take', linkedDok3Ids: [30], primaryDok3Id: 30,
    });
    expect(result.content[0].text).toContain('DOK4');
  });

  it('returns auth error when email missing', async () => {
    const result = await handleCreateDok4(
      { slug: 's', text: 't', linkedDok3Ids: [1], primaryDok3Id: 1 }, env, noAuth,
    );
    expect(result.isError).toBe(true);
  });
});
