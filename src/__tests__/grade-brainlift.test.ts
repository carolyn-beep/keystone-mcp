/**
 * Tests for FR3: grade_brainlift MCP tool
 *
 * Tests happy path, auth errors, and Keystone errors.
 * Mocks: KeystoneClient
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGradeBrainlift = vi.fn();
const mockWithUser = vi.fn().mockReturnThis();

vi.mock('../utils/keystone-client', () => ({
  KeystoneClient: vi.fn().mockImplementation(() => ({
    withUser: mockWithUser,
    gradeBrainlift: mockGradeBrainlift,
  })),
}));

vi.mock('../utils/formatters', () => ({
  formatGradeResponse: vi.fn((result: any) => `Slug: ${result.slug}, retry: ${result.retryAfter}s`),
  formatErrorGuidance: vi.fn(() => 'Try again later.'),
}));

import { KeystoneClient } from '../utils/keystone-client';
import { handleGradeBrainlift } from '../tools/grade-brainlift';

const MockedClient = vi.mocked(KeystoneClient);

beforeEach(() => {
  vi.clearAllMocks();
  mockWithUser.mockReturnThis();
});

const validEnv = {
  KEYSTONE_BASE_URL: 'https://example.com',
  KEYSTONE_SERVICE_KEY: 'sk-test-123',
};

const validProps = {
  email: 'user@example.com',
  name: 'Test User',
};

describe('grade_brainlift tool handler', () => {
  it('returns formatted response on success', async () => {
    mockGradeBrainlift.mockResolvedValue({
      slug: 'my-slug', brainliftId: 1, status: 'grading', retryAfter: 30,
    });

    const result = await handleGradeBrainlift(
      { markdown: '# My Brainlift', title: 'Title' },
      validEnv,
      validProps,
    );

    expect(result.content[0].text).toContain('my-slug');
    expect(result.isError).toBeUndefined();
  });

  it('creates client with env values', async () => {
    mockGradeBrainlift.mockResolvedValue({ slug: 's', brainliftId: 1, status: 'grading', retryAfter: 30 });

    await handleGradeBrainlift({ markdown: '# M' }, validEnv, validProps);

    expect(MockedClient).toHaveBeenCalledWith('https://example.com', 'sk-test-123');
    expect(mockWithUser).toHaveBeenCalledWith('user@example.com', 'Test User');
  });

  it('passes title to gradeBrainlift', async () => {
    mockGradeBrainlift.mockResolvedValue({ slug: 's', brainliftId: 1, status: 'grading', retryAfter: 30 });

    await handleGradeBrainlift({ markdown: '# M', title: 'Custom' }, validEnv, validProps);

    expect(mockGradeBrainlift).toHaveBeenCalledWith('# M', 'Custom');
  });

  it('returns auth error when email missing', async () => {
    const result = await handleGradeBrainlift({ markdown: '# M' }, validEnv, { email: '', name: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/auth/i);
  });

  it('returns auth error when props null', async () => {
    const result = await handleGradeBrainlift({ markdown: '# M' }, validEnv, null as any);

    expect(result.isError).toBe(true);
  });

  it('returns user-friendly error on Keystone failure', async () => {
    mockGradeBrainlift.mockRejectedValue(new Error('Keystone API error: 400 - Markdown content is required'));

    const result = await handleGradeBrainlift({ markdown: '' }, validEnv, validProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/400/);
  });

  it('returns retry suggestion on network error', async () => {
    mockGradeBrainlift.mockRejectedValue(new Error('fetch failed'));

    const result = await handleGradeBrainlift({ markdown: '# M' }, validEnv, validProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/try again/i);
  });
});
