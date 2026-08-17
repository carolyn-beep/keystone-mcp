/**
 * list_experts MCP tool.
 *
 * Lists imported experts for an existing brainlift.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatErrorGuidance, formatExpertsList } from '../utils/formatters';

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

export async function handleListExperts(
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
    const client = new KeystoneClient(env.KEYSTONE_BASE_URL, env.KEYSTONE_SERVICE_KEY)
      .withUser(props.email, props.name);

    const experts = await client.listExperts(args.slug);

    return {
      content: [{ type: 'text', text: formatExpertsList(experts) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to list experts: ${message}\n\n${formatErrorGuidance(message, 'list_experts')}` }],
      isError: true,
    };
  }
}

export function registerListExperts(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'list_experts',
    'List experts for an existing brainlift, including structured fields and current ranking.',
    {
      slug: z.string().describe('Brainlift slug'),
    },
    async (args) => handleListExperts(args, env, props),
  );
}
