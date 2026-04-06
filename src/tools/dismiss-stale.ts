/**
 * dismiss_stale MCP tool.
 *
 * Dismisses the stale flag on an item after the agent reviews it.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatDismissStale, formatErrorGuidance } from '../utils/formatters';

interface ToolEnv {
  DOK1GRADER_BASE_URL: string;
  DOK1GRADER_SERVICE_KEY: string;
}

interface ToolProps {
  email: string;
  name: string;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
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
    const client = new DOK1GraderClient(env.DOK1GRADER_BASE_URL, env.DOK1GRADER_SERVICE_KEY)
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
    'Dismiss the stale flag on an item after reviewing it. Use this when you have read the item and determined it is still valid despite a foundation item being edited or deleted. If the item IS affected by the change, use edit_dok_item to update it instead of dismissing.',
    {
      slug: z.string().describe('Brainlift slug'),
      dok: z.number().min(1).max(4).describe('DOK level: 1=Facts, 2=Summaries, 3=Insights, 4=SPOVs'),
      itemId: z.number().describe('Item ID to dismiss stale flag for (from get_stale_items output)'),
    },
    async (args) => handleDismissStale(args, env, props),
  );
}
