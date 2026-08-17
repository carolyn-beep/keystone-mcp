/**
 * Tests for edit_dok_item MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleEditDokItem } from './edit-dok-item';

const mockEditDokItem = vi.fn();

vi.mock('../utils/keystone-client', () => ({
  KeystoneClient: vi.fn().mockImplementation(() => ({
    withUser: vi.fn().mockReturnThis(),
    editDokItem: mockEditDokItem,
  })),
}));

const env = { KEYSTONE_BASE_URL: 'https://api.test.com', KEYSTONE_SERVICE_KEY: 'key' };
const props = { email: 'user@test.com', name: 'Test' };

describe('handleEditDokItem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client and returns formatted response', async () => {
    mockEditDokItem.mockResolvedValueOnce({
      id: 42, dokLevel: 1, status: 'regrading', previousScore: 3, message: 'Feedback here',
    });

    const result = await handleEditDokItem(
      { slug: 'my-slug', dok: 1, itemId: 42, text: 'new text' },
      env, props,
    );

    expect(mockEditDokItem).toHaveBeenCalledWith('my-slug', 1, 42, 'new text');
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('42');
    expect(result.content[0].text).toContain('Regrading');
  });

  it('returns auth error when email is missing', async () => {
    const result = await handleEditDokItem(
      { slug: 's', dok: 1, itemId: 1, text: 't' },
      env, { email: '', name: '' },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication');
  });

  it('formats API errors with guidance', async () => {
    mockEditDokItem.mockRejectedValueOnce(new Error('Keystone API error: 404 - Not found'));

    const result = await handleEditDokItem(
      { slug: 's', dok: 1, itemId: 999, text: 't' },
      env, props,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('404');
  });
});
