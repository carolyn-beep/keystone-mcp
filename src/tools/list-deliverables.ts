/**
 * list_deliverables MCP tool.
 *
 * Lists deliverables for a brainlift, optionally filtered by plan.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatDeliverables, formatErrorGuidance } from '../utils/formatters';

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

export async function handleListDeliverables(
  args: { brainliftSlug: string; planId?: number },
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
    const result = await client.listDeliverables(args.brainliftSlug, {
      planId: args.planId,
    });

    return {
      content: [{ type: 'text', text: formatDeliverables(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to list deliverables: ${message}\n\n${formatErrorGuidance(message, 'list_deliverables')}` }],
      isError: true,
    };
  }
}

export function registerListDeliverables(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'list_deliverables',
    'List deliverables for a brainlift, optionally filtered to one plan via planId.',
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      planId: z.number().int().positive().optional().describe('Optional plan ID filter'),
    },
    async (args) => handleListDeliverables(args, env, props),
  );
}
