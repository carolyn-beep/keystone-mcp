/**
 * dismiss_stale MCP tool.
 *
 * Dismisses the stale flag on an item after the agent reviews it.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatDismissStale, formatErrorGuidance } from '../utils/formatters';

interface ToolEnv {
  KEYSTONE_BASE_URL: string;
  KEYSTONE_SERVICE_KEY: string;
}

interface ToolProps {
  email: string;
  name: string;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export async function handleDismissStale(
  args: { slug: string; dok: number; itemId: number },
  env: ToolEnv,
  props: ToolProps,
): Promise<ToolResult> {
  if (!props?.email) {
    return {
      content: [{ type: 'text', text: 'Authentication required. Please connect with Google OAuth before using this tool.' }],
      isError: true,
    };
  }

  try {
    const client = new KeystoneClient(env.KEYSTONE_BASE_URL, env.KEYSTONE_SERVICE_KEY)
      .withUser(props.email, props.name);

    await client.dismissStale(args.slug, args.dok, args.itemId);

    return {
      content: [{ type: 'text', text: formatDismissStale() }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to dismiss stale flag: ${message}\n\n${formatErrorGuidance(message, 'dismiss_stale')}` }],
      isError: true,
    };
  }
}

export function registerDismissStale(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'dismiss_stale',
    `Dismiss the stale flag on an item. A stale item's grade was calculated on foundation data that has since changed -- its score and feedback are frozen on outdated inputs. Dismissing clears the flag without triggering a regrade.

Before deciding, read the item's current feedback via get_brainlift_assessment and consider what changed underneath (the stale reason tells you). If the foundation change means the current feedback no longer makes sense for this item, use edit_dok_item to address the feedback while incorporating the updated foundation -- the context-aware regrading system will recognize the improvement. If the item still stands on its own despite the change below, dismissing is the right call.`,
    {
      slug: z.string().describe('Brainlift slug'),
      dok: z.number().min(1).max(4).describe('DOK level: 1=Facts, 2=Summaries, 3=Insights, 4=SPOVs'),
      itemId: z.number().describe('Item ID to dismiss stale flag for (from get_stale_items output)'),
    },
    async (args) => handleDismissStale(args, env, props),
  );
}
