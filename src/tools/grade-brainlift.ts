/**
 * grade_brainlift MCP tool.
 *
 * Submits markdown for grading and returns a slug for tracking.
 * Fire-and-forget pattern: grading runs asynchronously.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatGradeResponse, formatErrorGuidance } from '../utils/formatters';

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

/**
 * Handle the grade_brainlift tool invocation.
 * Exported separately for testing.
 */
export async function handleGradeBrainlift(
  args: { markdown: string; title?: string },
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
    const client = new KeystoneClient(
      env.KEYSTONE_BASE_URL,
      env.KEYSTONE_SERVICE_KEY,
    ).withUser(props.email, props.name);

    const result = await client.gradeBrainlift(args.markdown, args.title);

    return {
      content: [{ type: 'text', text: formatGradeResponse(result) }],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [
        {
          type: 'text',
          text: `Failed to submit brainlift: ${message}\n\n${formatErrorGuidance(message, 'grade_brainlift')}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Register the grade_brainlift tool on the MCP server.
 */
export function registerGradeBrainlift(
  server: McpServer,
  env: ToolEnv,
  props: ToolProps,
): void {
  server.tool(
    'grade_brainlift',
    'Create a new Brainlift by submitting its full markdown for grading. This is the primary way to create brainlifts -- no separate "create" tool exists. Returns a slug to track progress. Call get_template FIRST to see the required format -- structural mistakes silently drop content.',
    {
      markdown: z.string().describe(
        'Complete Brainlift in markdown format. Use get_template first to see the required format.',
      ),
      title: z.string().optional().describe(
        'Optional title override. If omitted, extracted from the # heading in the markdown.',
      ),
    },
    async (args) => handleGradeBrainlift(args, env, props),
  );
}
