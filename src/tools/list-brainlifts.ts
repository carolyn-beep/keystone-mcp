/**
 * list_brainlifts MCP tool.
 *
 * Returns a paginated list of the user's brainlifts with status and scores.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatBrainliftList } from '../utils/formatters';

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

/**
 * Handle the list_brainlifts tool invocation.
 * Exported separately for testing.
 */
export async function handleListBrainlifts(
  args: { page?: number; pageSize?: number },
  env: ToolEnv,
  props: ToolProps,
): Promise<ToolResult> {
  if (!props?.email) {
    return {
      content: [
        {
          type: 'text',
          text: 'Authentication required. Please connect with Google OAuth before using this tool.',
        },
      ],
      isError: true,
    };
  }

  try {
    const client = new DOK1GraderClient(
      env.DOK1GRADER_BASE_URL,
      env.DOK1GRADER_SERVICE_KEY,
    ).withUser(props.email, props.name);

    const result = await client.listBrainlifts(args.page, args.pageSize);

    return {
      content: [{ type: 'text', text: formatBrainliftList(result) }],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [
        {
          type: 'text',
          text: `Failed to list brainlifts: ${message}. Please try again later.`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Register the list_brainlifts tool on the MCP server.
 */
export function registerListBrainlifts(
  server: McpServer,
  env: ToolEnv,
  props: ToolProps,
): void {
  server.tool(
    'list_brainlifts',
    'List your brainlifts with their slugs, grading status, and scores. Use the slug from the response to call get_brainlift_assessment.',
    {
      page: z.number().int().min(1).default(1).optional().describe(
        'Page number. Default: 1',
      ),
      pageSize: z.number().int().min(1).max(20).default(10).optional().describe(
        'Items per page. Default: 10, max: 20',
      ),
    },
    async (args) => handleListBrainlifts(args, env, props),
  );
}
