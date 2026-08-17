/**
 * read_deliverable MCP tool.
 *
 * Reads the current deliverable markdown for a task.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatReadDeliverable, formatErrorGuidance } from '../utils/formatters';

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

export async function handleReadDeliverable(
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
    const result = await client.readDeliverable(args.brainliftSlug, args.taskId);

    return {
      content: [{ type: 'text', text: formatReadDeliverable(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to read deliverable: ${message}\n\n${formatErrorGuidance(message, 'read_deliverable')}` }],
      isError: true,
    };
  }
}

export function registerReadDeliverable(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'read_deliverable',
    'Read the current deliverable markdown and Doc URL for a task.',
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      taskId: z.number().int().positive().describe('Task ID'),
    },
    async (args) => handleReadDeliverable(args, env, props),
  );
}
