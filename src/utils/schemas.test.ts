/**
 * Tests for shared tool input schemas.
 */

import { describe, it, expect } from 'vitest';
import { slugSchema, idSchema, dokLevelSchema, isoDateSchema } from './schemas';

describe('slugSchema', () => {
  it('accepts well-formed slugs', () => {
    for (const slug of ['a', 'my-brainlift', 'my-brainlift-2', 'abc123', '2024-plan']) {
      expect(slugSchema.safeParse(slug).success, slug).toBe(true);
    }
  });

  it('rejects path traversal and path separators', () => {
    for (const slug of ['../tasks', '..', 'a/b', 'my-slug/..', '/tasks', 'a\\b']) {
      expect(slugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });

  it('rejects characters that could alter an upstream URL', () => {
    for (const slug of ['a?x=1', 'a#frag', 'a%2F..', 'a b', 'a.b', 'a_b', 'a@b']) {
      expect(slugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });

  it('rejects empty, uppercase, and malformed hyphenation', () => {
    for (const slug of ['', 'My-Slug', '-leading', 'trailing-', 'double--hyphen']) {
      expect(slugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });
});

describe('idSchema and dokLevelSchema', () => {
  it('reject fractional, zero and negative values', () => {
    for (const value of [1.5, 0, -3]) {
      expect(idSchema.safeParse(value).success, String(value)).toBe(false);
    }
    for (const value of [2.5, 0, 5]) {
      expect(dokLevelSchema.safeParse(value).success, String(value)).toBe(false);
    }
  });

  it('accept positive integers / levels 1-4', () => {
    expect(idSchema.safeParse(24288).success).toBe(true);
    expect([1, 2, 3, 4].every((dok) => dokLevelSchema.safeParse(dok).success)).toBe(true);
  });
});

describe('isoDateSchema', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(isoDateSchema.safeParse('2026-11-22').success).toBe(true);
    for (const value of ['11/22/2026', '2026-11-22T00:00:00Z', 'tomorrow', '../../x']) {
      expect(isoDateSchema.safeParse(value).success, value).toBe(false);
    }
  });
});
