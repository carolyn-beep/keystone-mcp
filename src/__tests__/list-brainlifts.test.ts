/**
 * Tests for FR4: list_brainlifts MCP tool
 *
 * Tests happy path, auth errors, and DOK1Grader errors.
 * Mocks: DOK1GraderClient, formatters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListBrainlifts = vi.fn();
const mockWithUser = vi.fn().mockReturnThis();

vi.mock('../utils/dok1grader-client', () => ({
  DOK1GraderClient: vi.fn().mockImplementation(() => ({
    withUser: mockWithUser,
    listBrainlifts: mockListBrainlifts,
  })),
}));

vi.mock('../utils/formatters', () => ({
  formatBrainliftList: vi.fn((result: any) => `${result.brainlifts.length} brainlifts`),
}));

import { DOK1GraderClient } from '../utils/dok1grader-client';
import { handleListBrainlifts } from '../tools/list-brainlifts';

const MockedClient = vi.mocked(DOK1GraderClient);

beforeEach(() => {
  vi.clearAllMocks();
  mockWithUser.mockReturnThis();
});

const validEnv = {
  DOK1GRADER_BASE_URL: 'https://example.com',
  DOK1GRADER_SERVICE_KEY: 'sk-test-123',
};

const validProps = {
  email: 'user@example.com',
  name: 'Test User',
};

describe('list_brainlifts tool handler', () => {
  it('returns formatted list on success', async () => {
    mockListBrainlifts.mockResolvedValue({
      brainlifts: [{ slug: 's', title: 'T', status: 'complete', score: 4.0, createdAt: '2026-03-31' }],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });

    const result = await handleListBrainlifts({ page: 1, pageSize: 10 }, validEnv, validProps);

    expect(result.content[0].text).toContain('1 brainlifts');
    expect(result.isError).toBeUndefined();
  });

  it('passes page and pageSize to client', async () => {
    mockListBrainlifts.mockResolvedValue({
      brainlifts: [],
      pagination: { page: 2, pageSize: 5, totalItems: 0, totalPages: 0 },
    });

    await handleListBrainlifts({ page: 2, pageSize: 5 }, validEnv, validProps);

    expect(mockListBrainlifts).toHaveBeenCalledWith(2, 5);
  });

  it('returns auth error when email missing', async () => {
    const result = await handleListBrainlifts({}, validEnv, { email: '', name: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/auth/i);
  });

  it('returns user-friendly error on DOK1Grader failure', async () => {
    mockListBrainlifts.mockRejectedValue(new Error('DOK1Grader API error: 500 - Internal error'));

    const result = await handleListBrainlifts({}, validEnv, validProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/try again/i);
  });
});
