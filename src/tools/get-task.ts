/**
 * get_task MCP tool.
 *
 * Fetches details for a single sprint task.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatTaskDetail, formatErrorGuidance } from '../utils/formatters';

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
}

export async function handleGetTask(
  args: { brainliftSlug: string; taskId: number },
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
    const result = await client.getTask(args.brainliftSlug, args.taskId);

    return {
      content: [{ type: 'text', text: formatTaskDetail(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to get task: ${message}\n\n${formatErrorGuidance(message, 'get_task')}` }],
      isError: true,
    };
  }
}

export function registerGetTask(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'get_task',
    'Get full details for one sprint task, including deliverable metadata when present.',
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      taskId: z.number().int().positive().describe('Task ID'),
    },
    async (args) => handleGetTask(args, env, props),
  );
}
