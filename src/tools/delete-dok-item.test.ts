/**
 * Tests for delete_dok_item MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDeleteDokItem } from './delete-dok-item';

const mockDeleteDokItem = vi.fn();

vi.mock('../utils/dok1grader-client', () => ({
  DOK1GraderClient: vi.fn().mockImplementation(() => ({
    withUser: vi.fn().mockReturnThis(),
    deleteDokItem: mockDeleteDokItem,
  })),
}));

const env = { DOK1GRADER_BASE_URL: 'https://api.test.com', DOK1GRADER_SERVICE_KEY: 'key' };
const props = { email: 'user@test.com', name: 'Test' };

describe('handleDeleteDokItem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns formatted preview when confirm=false', async () => {
    mockDeleteDokItem.mockResolvedValueOnce({
      item: { id: 42, text: 'fact', score: 3 },
      unlinkedItems: [
        { id: 10, dokLevel: 2, text: 'summary a' },
        { id: 11, dokLevel: 2, text: 'summary b' },
      ],
      staleDok2Ids: [10],
      staleDok3Ids: [],
      staleDok4Ids: [],
    });

    const result = await handleDeleteDokItem(
      { slug: 's', dok: 1, itemId: 42, confirm: false },
      env, props,
    );

    expect(mockDeleteDokItem).toHaveBeenCalledWith('s', 1, 42, true); // preview=true
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('confirm=true');
  });

  it('returns formatted result when confirm=true', async () => {
    mockDeleteDokItem.mockResolvedValueOnce({
      deleted: true, impactSummary: { unlinked: 2, markedStale: 1 },
    });

    const result = await handleDeleteDokItem(
      { slug: 's', dok: 1, itemId: 42, confirm: true },
      env, props,
    );

    expect(mockDeleteDokItem).toHaveBeenCalledWith('s', 1, 42, false); // preview=false
    expect(result.content[0].text).toContain('Deleted');
  });
});
