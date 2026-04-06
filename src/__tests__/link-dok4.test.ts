/**
 * Tests for link_dok4 MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLinkDok4 = vi.fn();
const mockWithUser = vi.fn().mockReturnThis();

vi.mock('../utils/dok1grader-client', () => ({
  DOK1GraderClient: vi.fn().mockImplementation(() => ({
    withUser: mockWithUser,
    linkDok4: mockLinkDok4,
  })),
}));

vi.mock('../utils/formatters', () => ({
  formatLinkResponse: vi.fn((result: any, dok: number) => `Linked ${result.addedLinks} to DOK${dok} #${result.id}`),
  formatErrorGuidance: vi.fn(() => 'Try again later.'),
}));

import { handleLinkDok4 } from '../tools/link-dok4';

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

describe('link_dok4 tool handler', () => {
  it('calls linkDok4 with correct params', async () => {
    mockLinkDok4.mockResolvedValue({ id: 7, addedLinks: 2, status: 'regrading' });

    const result = await handleLinkDok4(
      { slug: 'my-slug', spovId: 7, dok3Ids: [20, 21] },
      validEnv,
      validProps,
    );

    expect(mockLinkDok4).toHaveBeenCalledWith('my-slug', 7, [20, 21], undefined);
    expect(result.content[0].text).toContain('Linked 2');
    expect(result.isError).toBeUndefined();
  });

  it('passes newPrimaryDok3Id when provided', async () => {
    mockLinkDok4.mockResolvedValue({ id: 7, addedLinks: 1, status: 'regrading' });

    await handleLinkDok4(
      { slug: 'my-slug', spovId: 7, dok3Ids: [20], newPrimaryDok3Id: 20 },
      validEnv,
      validProps,
    );

    expect(mockLinkDok4).toHaveBeenCalledWith('my-slug', 7, [20], 20);
  });

  it('returns auth error when email missing', async () => {
    const result = await handleLinkDok4(
      { slug: 's', spovId: 1, dok3Ids: [20] },
      validEnv,
      { email: '', name: '' },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/auth/i);
  });

  it('returns error on API failure', async () => {
    mockLinkDok4.mockRejectedValue(new Error('DOK1Grader API error: 400 - Invalid DOK3 IDs'));

    const result = await handleLinkDok4(
      { slug: 'bad', spovId: 999, dok3Ids: [20] },
      validEnv,
      validProps,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/400/);
  });
});
