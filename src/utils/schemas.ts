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

/** Database IDs for DOK items, experts, tasks and plans. */
export const idSchema = z.number().int().positive();

/** DOK level 1-4. */
export const dokLevelSchema = z.number().int().min(1).max(4);

/** Calendar date as YYYY-MM-DD. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/**
 * Size caps for free-text inputs. They are well above what a real document
 * or item needs; they stop a single call from shipping megabytes of text
 * into Keystone's grading pipeline.
 */
export const MAX_MARKDOWN_LENGTH = 500_000;
export const MAX_ITEM_TEXT_LENGTH = 20_000;
export const MAX_URL_LENGTH = 2_048;
export const MAX_IDS_PER_CALL = 200;
