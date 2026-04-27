/**
 * Tests for expert MCP tool handlers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleListExperts } from './list-experts';
import { handleCreateExpert } from './create-expert';
import { handleDeleteExpert } from './delete-expert';

const mockListExperts = vi.fn();
const mockCreateExperts = vi.fn();
const mockDeleteExpert = vi.fn();

vi.mock('../utils/dok1grader-client', () => ({
  DOK1GraderClient: vi.fn().mockImplementation(() => ({
    withUser: vi.fn().mockReturnThis(),
    listExperts: mockListExperts,
    createExperts: mockCreateExperts,
    deleteExpert: mockDeleteExpert,
  })),
}));

const env = { DOK1GRADER_BASE_URL: 'https://api.test.com', DOK1GRADER_SERVICE_KEY: 'key' };
const props = { email: 'user@test.com', name: 'Test User' };
const noAuth = { email: '', name: '' };

describe('handleListExperts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client.listExperts and formats the result', async () => {
    mockListExperts.mockResolvedValueOnce([
      {
        id: 10,
        name: 'Andrew Huberman',
        who: 'Stanford neuroscientist',
        why: 'Explains the sleep mechanisms',
        focus: 'sleep',
        where: '@hubermanlab',
        rankScore: 4.2,
        rationale: 'High relevance',
        twitterHandle: 'hubermanlab',
        source: 'manual',
        isFollowing: false,
      },
    ]);

    const result = await handleListExperts({ slug: 'sleep-brainlift' }, env, props);

    expect(mockListExperts).toHaveBeenCalledWith('sleep-brainlift');
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Andrew Huberman');
    expect(result.content[0].text).toContain('Use the expert ID');
  });

  it('returns auth error when email is missing', async () => {
    const result = await handleListExperts({ slug: 'sleep-brainlift' }, env, noAuth);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication required');
  });

  it('formats backend errors with guidance', async () => {
    mockListExperts.mockRejectedValueOnce(new Error('DOK1Grader API error: 404 - Brainlift not found'));

    const result = await handleListExperts({ slug: 'missing' }, env, props);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to list experts');
    expect(result.content[0].text).toContain('Brainlift not found');
  });
});

describe('handleCreateExpert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client.createExperts and formats async rerank guidance', async () => {
    mockCreateExperts.mockResolvedValueOnce([
      {
        id: 11,
        name: 'Cal Newport',
        who: 'Computer science professor',
        why: 'Frames attention tradeoffs',
        focus: null,
        where: '@CalNewportMedia',
        rankScore: null,
        rationale: null,
        twitterHandle: 'CalNewportMedia',
        source: 'manual',
        isFollowing: false,
      },
    ]);

    const result = await handleCreateExpert({
      slug: 'focus-brainlift',
      experts: [{
        name: 'Cal Newport',
        who: 'Computer science professor',
        why: 'Frames attention tradeoffs',
        where: '@CalNewportMedia',
      }],
    }, env, props);

    expect(mockCreateExperts).toHaveBeenCalledWith('focus-brainlift', [{
      name: 'Cal Newport',
      who: 'Computer science professor',
      why: 'Frames attention tradeoffs',
      where: '@CalNewportMedia',
    }]);
    expect(result.content[0].text).toContain('Created 1 expert');
    expect(result.content[0].text).toContain('list_experts');
  });

  it('returns auth error when email is missing', async () => {
    const result = await handleCreateExpert({
      slug: 'focus-brainlift',
      experts: [{ name: 'Cal Newport', who: 'Professor', why: 'Useful' }],
    }, env, noAuth);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication required');
  });

  it('formats backend errors with guidance', async () => {
    mockCreateExperts.mockRejectedValueOnce(new Error('DOK1Grader API error: 400 - Invalid payload'));

    const result = await handleCreateExpert({
      slug: 'focus-brainlift',
      experts: [{ name: 'Cal Newport', who: 'Professor', why: 'Useful' }],
    }, env, props);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to create expert');
    expect(result.content[0].text).toContain('name, who, and why');
  });
});

describe('handleDeleteExpert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls client.deleteExpert and formats follow-up guidance', async () => {
    mockDeleteExpert.mockResolvedValueOnce(undefined);

    const result = await handleDeleteExpert({ slug: 'focus-brainlift', expertId: 12 }, env, props);

    expect(mockDeleteExpert).toHaveBeenCalledWith('focus-brainlift', 12);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Deleted expert #12');
    expect(result.content[0].text).toContain('list_experts');
  });

  it('returns auth error when email is missing', async () => {
    const result = await handleDeleteExpert({ slug: 'focus-brainlift', expertId: 12 }, env, noAuth);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication required');
  });

  it('formats backend errors with guidance', async () => {
    mockDeleteExpert.mockRejectedValueOnce(new Error('DOK1Grader API error: 404 - Expert not found'));

    const result = await handleDeleteExpert({ slug: 'focus-brainlift', expertId: 999 }, env, props);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to delete expert');
    expect(result.content[0].text).toContain('list_experts');
  });
});
