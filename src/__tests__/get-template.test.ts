/**
 * Tests for FR4: get_template MCP tool
 *
 * Tests happy path, missing props, and Keystone connection errors.
 * Mocks: KeystoneClient
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock KeystoneClient
const mockGetTemplate = vi.fn();
const mockWithUser = vi.fn().mockReturnThis();

vi.mock('../utils/keystone-client', () => ({
  KeystoneClient: vi.fn().mockImplementation(() => ({
    withUser: mockWithUser,
    getTemplate: mockGetTemplate,
  })),
}));

import { KeystoneClient } from '../utils/keystone-client';
import { handleGetTemplate } from '../tools/get-template';

const MockedKeystoneClient = vi.mocked(KeystoneClient);

beforeEach(() => {
  vi.clearAllMocks();
  mockWithUser.mockReturnThis();
});

describe('get_template tool handler', () => {
  const validEnv = {
    KEYSTONE_BASE_URL: 'https://example.com',
    KEYSTONE_SERVICE_KEY: 'sk-test-123',
  };

  const validProps = {
    email: 'user@example.com',
    name: 'Test User',
    accessToken: 'tok-123',
    tokenType: 'Bearer',
    expiresAt: Date.now() + 3600000,
  };

  it('returns template content on success', async () => {
    const templateContent = '# Brainlift Template\n\nContent.';
    mockGetTemplate.mockResolvedValue(templateContent);

    const result = await handleGetTemplate(validEnv, validProps);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe(templateContent);
  });

  it('creates KeystoneClient with env values', async () => {
    mockGetTemplate.mockResolvedValue('# T');

    await handleGetTemplate(validEnv, validProps);

    expect(MockedKeystoneClient).toHaveBeenCalledWith(
      'https://example.com',
      'sk-test-123',
    );
  });

  it('calls withUser with props email and name', async () => {
    mockGetTemplate.mockResolvedValue('# T');

    await handleGetTemplate(validEnv, validProps);

    expect(mockWithUser).toHaveBeenCalledWith('user@example.com', 'Test User');
  });

  it('returns error when props are missing (not authenticated)', async () => {
    const result = await handleGetTemplate(validEnv, null as any);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toMatch(/auth/i);
    expect(result.isError).toBe(true);
  });

  it('returns error when props.email is missing', async () => {
    const result = await handleGetTemplate(validEnv, { ...validProps, email: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/auth/i);
  });

  it('returns error with retry suggestion when Keystone is unreachable', async () => {
    mockGetTemplate.mockRejectedValue(new Error('fetch failed'));

    const result = await handleGetTemplate(validEnv, validProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/try again/i);
  });

  it('returns error with status when Keystone returns non-200', async () => {
    mockGetTemplate.mockRejectedValue(new Error('Keystone API error: 500 - Internal Server Error'));

    const result = await handleGetTemplate(validEnv, validProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/500/);
  });
});
