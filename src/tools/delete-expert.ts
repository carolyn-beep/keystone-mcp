/**
 * delete_expert MCP tool.
 *
 * Deletes one imported expert from an existing brainlift.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatDeletedExpert, formatErrorGuidance } from '../utils/formatters';

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

export async function handleDeleteExpert(
  args: { slug: string; expertId: number },
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

    await client.deleteExpert(args.slug, args.expertId);

    return {
      content: [{ type: 'text', text: formatDeletedExpert(args.expertId) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to delete expert: ${message}\n\n${formatErrorGuidance(message, 'delete_expert')}` }],
      isError: true,
    };
  }
}

export function registerDeleteExpert(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'delete_expert',
    'Delete one expert from an existing brainlift. Ranking refresh runs asynchronously after deletion.',
    {
      slug: z.string().describe('Brainlift slug'),
      expertId: z.number().describe('Expert ID from list_experts'),
    },
    async (args) => handleDeleteExpert(args, env, props),
  );
}
