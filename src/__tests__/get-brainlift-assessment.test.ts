/**
 * Tests for FR5: get_brainlift_assessment MCP tool
 *
 * Tests statusOnly vs items mode, auth errors, and DOK1Grader errors.
 * Mocks: DOK1GraderClient, formatters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetStatus = vi.fn();
const mockGetAssessment = vi.fn();
const mockWithUser = vi.fn().mockReturnThis();

vi.mock('../utils/dok1grader-client', () => ({
  DOK1GraderClient: vi.fn().mockImplementation(() => ({
    withUser: mockWithUser,
    getStatus: mockGetStatus,
    getAssessment: mockGetAssessment,
  })),
}));

vi.mock('../utils/formatters', () => ({
  formatStatus: vi.fn((result: any) => `Status: ${result.status}`),
  formatAssessment: vi.fn((_result: any, dok: number) => `DOK${dok} assessment`),
  formatErrorGuidance: vi.fn(() => 'Try again later.'),
}));

import { DOK1GraderClient } from '../utils/dok1grader-client';
import { handleGetBrainliftAssessment } from '../tools/get-brainlift-assessment';

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

describe('get_brainlift_assessment tool handler', () => {
  describe('statusOnly mode', () => {
    it('calls getStatus when statusOnly=true', async () => {
      mockGetStatus.mockResolvedValue({
        slug: 'my-slug', title: 'T', status: 'grading',
        progress: {}, score: {}, retryAfter: 15,
      });

      const result = await handleGetBrainliftAssessment(
        { slug: 'my-slug', dok: 1, statusOnly: true },
        validEnv,
        validProps,
      );

      expect(mockGetStatus).toHaveBeenCalledWith('my-slug');
      expect(mockGetAssessment).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('Status');
    });
  });

  describe('items mode', () => {
    it('calls getAssessment when statusOnly=false', async () => {
      mockGetAssessment.mockResolvedValue({
        slug: 'my-slug', dok: 1, items: [], pagination: {},
      });

      const result = await handleGetBrainliftAssessment(
        { slug: 'my-slug', dok: 1, page: 1, pageSize: 20, statusOnly: false },
        validEnv,
        validProps,
      );

      expect(mockGetAssessment).toHaveBeenCalledWith('my-slug', 1, 1, 20, 'summary');
      expect(mockGetStatus).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('DOK1');
    });

    it('passes detail parameter', async () => {
      mockGetAssessment.mockResolvedValue({
        slug: 's', dok: 3, items: [], pagination: {},
      });

      await handleGetBrainliftAssessment(
        { slug: 's', dok: 3, detail: 'full' },
        validEnv,
        validProps,
      );

      expect(mockGetAssessment).toHaveBeenCalledWith('s', 3, 1, 20, 'full');
    });

    it('defaults page=1, pageSize=20, detail=summary', async () => {
      mockGetAssessment.mockResolvedValue({
        slug: 's', dok: 2, items: [], pagination: {},
      });

      await handleGetBrainliftAssessment(
        { slug: 's', dok: 2 },
        validEnv,
        validProps,
      );

      expect(mockGetAssessment).toHaveBeenCalledWith('s', 2, 1, 20, 'summary');
    });
  });

  describe('error handling', () => {
    it('returns auth error when email missing', async () => {
      const result = await handleGetBrainliftAssessment(
        { slug: 's', dok: 1 },
        validEnv,
        { email: '', name: '' },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/auth/i);
    });

    it('returns user-friendly error on 404', async () => {
      mockGetAssessment.mockRejectedValue(new Error('DOK1Grader API error: 404 - Brainlift not found'));

      const result = await handleGetBrainliftAssessment(
        { slug: 'bad', dok: 1 },
        validEnv,
        validProps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/404|not found/i);
    });

    it('returns retry suggestion on network error', async () => {
      mockGetStatus.mockRejectedValue(new Error('fetch failed'));

      const result = await handleGetBrainliftAssessment(
        { slug: 's', dok: 1, statusOnly: true },
        validEnv,
        validProps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/try again/i);
    });
  });
});
