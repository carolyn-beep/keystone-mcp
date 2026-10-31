/**
 * Shared zod schemas for MCP tool inputs.
 */

import { z } from 'zod';

/**
 * Brainlift slug: lowercase alphanumeric segments joined by single hyphens
 * (e.g. `my-brainlift-2`). Keystone generates slugs in this shape, so anything
 * else (path separators, dots, encoded characters) is rejected before it can
 * reach an upstream URL path.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .regex(SLUG_PATTERN, 'Slug must be lowercase letters, digits, and single hyphens (e.g. my-brainlift-2)');
