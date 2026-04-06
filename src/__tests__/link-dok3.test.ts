/**
 * Tests for link_dok3 MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLinkDok3 = vi.fn();
const mockWithUser = vi.fn().mockReturnThis();

vi.mock('../utils/dok1grader-client', () => ({
  DOK1GraderClient: vi.fn().mockImplementation(() => ({
    withUser: mockWithUser,
    linkDok3: mockLinkDok3,
  })),
}));

vi.mock('../utils/formatters', () => ({
  formatLinkResponse: vi.fn((result: any, dok: number) => `Linked ${result.addedLinks} to DOK${dok} #${result.id}`),
  formatErrorGuidance: vi.fn(() => 'Try again later.'),
}));

import { handleLinkDok3 } from '../tools/link-dok3';

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

describe('link_dok3 tool handler', () => {
  it('calls linkDok3 with correct params', async () => {
    mockLinkDok3.mockResolvedValue({ id: 5, addedLinks: 2, status: 'regrading' });

    const result = await handleLinkDok3(
      { slug: 'my-slug', insightId: 5, dok2Ids: [10, 11] },
      validEnv,
      validProps,
    );

    expect(mockLinkDok3).toHaveBeenCalledWith('my-slug', 5, [10, 11]);
    expect(result.content[0].text).toContain('Linked 2');
    expect(result.isError).toBeUndefined();
  });

  it('returns auth error when email missing', async () => {
    const result = await handleLinkDok3(
      { slug: 's', insightId: 1, dok2Ids: [10] },
      validEnv,
      { email: '', name: '' },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/auth/i);
  });

  it('returns error on API failure', async () => {
    mockLinkDok3.mockRejectedValue(new Error('DOK1Grader API error: 404 - Not found'));

    const result = await handleLinkDok3(
      { slug: 'bad', insightId: 999, dok2Ids: [10] },
      validEnv,
      validProps,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/404/);
  });
});
