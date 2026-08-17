/**
 * create_expert MCP tool.
 *
 * Adds one or more experts to an existing brainlift.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatCreatedExperts, formatErrorGuidance } from '../utils/formatters';

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

const expertInputSchema = z.object({
  name: z.string().min(1).describe('Expert name'),
  who: z.string().min(1).describe('One-line description of who they are'),
  why: z.string().min(1).describe('Why this expert matters for the brainlift'),
  focus: z.string().min(1).optional().describe('Optional topic focus'),
  where: z.string().min(1).optional().describe('Optional handle or location, e.g. @hubermanlab'),
});

export async function handleCreateExpert(
  args: { slug: string; experts: Array<z.infer<typeof expertInputSchema>> },
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

    const experts = await client.createExperts(args.slug, args.experts);

    return {
      content: [{ type: 'text', text: formatCreatedExperts(experts) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to create expert: ${message}\n\n${formatErrorGuidance(message, 'create_expert')}` }],
      isError: true,
    };
  }
}

export function registerCreateExpert(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'create_expert',
    'Add one or more experts to an existing brainlift. Ranking refresh runs asynchronously after creation.',
    {
      slug: z.string().describe('Brainlift slug'),
      experts: z.array(expertInputSchema).min(1).describe('Experts to add'),
    },
    async (args) => handleCreateExpert(args, env, props),
  );
}
