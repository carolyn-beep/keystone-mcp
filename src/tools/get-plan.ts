/**
 * get_plan MCP tool.
 *
 * Returns the current active sprint plan state.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatActivePlan, formatNoActivePlan, formatErrorGuidance } from '../utils/formatters';

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

export async function handleGetPlan(
  args: { brainliftSlug: string },
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
    const result = await client.getPlan(args.brainliftSlug);

    return {
      content: [{
        type: 'text',
        text: result
          ? formatActivePlan(result, {
              slug: args.brainliftSlug,
              baseUrl: env.DOK1GRADER_BASE_URL,
            })
          : formatNoActivePlan(),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to get plan: ${message}\n\n${formatErrorGuidance(message, 'get_plan')}` }],
      isError: true,
    };
  }
}

export function registerGetPlan(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'get_plan',
    'Get the active sprint plan for a brainlift. Returns a clear no-active-plan message when none exists.',
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
    },
    async (args) => handleGetPlan(args, env, props),
  );
}
