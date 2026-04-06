/**
 * get_stale_items MCP tool.
 *
 * Lists all stale items in a brainlift grouped by DOK level.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatStaleItems, formatErrorGuidance } from '../utils/formatters';

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

export async function handleGetStaleItems(
  args: { slug: string },
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

    const result = await client.getStaleItems(args.slug);

    return {
      content: [{ type: 'text', text: formatStaleItems(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to get stale items: ${message}\n\n${formatErrorGuidance(message, 'get_stale_items')}` }],
      isError: true,
    };
  }
}

export function registerGetStaleItems(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'get_stale_items',
    'List all stale items in a brainlift. An item is "stale" when a foundation item it depends on (lower DOK level) was edited or deleted, meaning its grading may be based on outdated content. Call this after any edit_dok_item or delete_dok_item to see what was affected. For each stale item, decide: use edit_dok_item to update it if the content is affected by the change, or dismiss_stale if it is still valid despite the foundation change.',
    {
      slug: z.string().describe('Brainlift slug'),
    },
    async (args) => handleGetStaleItems(args, env, props),
  );
}
