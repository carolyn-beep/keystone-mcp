/**
 * Tests for shared tool input schemas.
 */

import { describe, it, expect } from 'vitest';
import { slugSchema } from './schemas';

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
