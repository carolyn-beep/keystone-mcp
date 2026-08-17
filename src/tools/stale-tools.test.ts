/**
 * Tests for get_stale_items and dismiss_stale MCP tool handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetStaleItems } from './get-stale-items';
import { handleDismissStale } from './dismiss-stale';

const mockGetStaleItems = vi.fn();
const mockDismissStale = vi.fn();

vi.mock('../utils/keystone-client', () => ({
  KeystoneClient: vi.fn().mockImplementation(() => ({
    withUser: vi.fn().mockReturnThis(),
    getStaleItems: mockGetStaleItems,
    dismissStale: mockDismissStale,
  })),
}));

const env = { KEYSTONE_BASE_URL: 'https://api.test.com', KEYSTONE_SERVICE_KEY: 'key' };
const props = { email: 'user@test.com', name: 'Test' };

describe('handleGetStaleItems', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns formatted stale items', async () => {
    mockGetStaleItems.mockResolvedValueOnce({
      dok1: [], dok2: [{ id: 10, displayTitle: 'Sum', staleReason: 'edited' }],
      dok3: [], dok4: [],
    });

    const result = await handleGetStaleItems({ slug: 's' }, env, props);

    expect(mockGetStaleItems).toHaveBeenCalledWith('s');
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('#10');
  });
});

describe('handleDismissStale', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client and returns confirmation', async () => {
    mockDismissStale.mockResolvedValueOnce({ dismissed: true });

    const result = await handleDismissStale({ slug: 's', dok: 2, itemId: 10 }, env, props);

    expect(mockDismissStale).toHaveBeenCalledWith('s', 2, 10);
    expect(result.isError).toBeUndefined();
  });
});
