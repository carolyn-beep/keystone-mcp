/**
 * Tests for FR4: get_template MCP tool
 *
 * Tests happy path, missing props, and DOK1Grader connection errors.
 * Mocks: DOK1GraderClient
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOK1GraderClient
const mockGetTemplate = vi.fn();
const mockWithUser = vi.fn().mockReturnThis();

vi.mock('../utils/dok1grader-client', () => ({
  DOK1GraderClient: vi.fn().mockImplementation(() => ({
    withUser: mockWithUser,
    getTemplate: mockGetTemplate,
  })),
}));

import { DOK1GraderClient } from '../utils/dok1grader-client';
import { handleGetTemplate } from '../tools/get-template';

const MockedDOK1GraderClient = vi.mocked(DOK1GraderClient);

beforeEach(() => {
  vi.clearAllMocks();
  mockWithUser.mockReturnThis();
});

describe('get_template tool handler', () => {
  const validEnv = {
    DOK1GRADER_BASE_URL: 'https://example.com',
    DOK1GRADER_SERVICE_KEY: 'sk-test-123',
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

  it('creates DOK1GraderClient with env values', async () => {
    mockGetTemplate.mockResolvedValue('# T');

    await handleGetTemplate(validEnv, validProps);

    expect(MockedDOK1GraderClient).toHaveBeenCalledWith(
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

  it('returns error with retry suggestion when DOK1Grader is unreachable', async () => {
    mockGetTemplate.mockRejectedValue(new Error('fetch failed'));

    const result = await handleGetTemplate(validEnv, validProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/try again/i);
  });

  it('returns error with status when DOK1Grader returns non-200', async () => {
    mockGetTemplate.mockRejectedValue(new Error('DOK1Grader API error: 500 - Internal Server Error'));

    const result = await handleGetTemplate(validEnv, validProps);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/500/);
  });
});
