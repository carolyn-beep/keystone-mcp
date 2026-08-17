/**
 * create_dok4 MCP tool.
 *
 * Adds a new DOK4 SPOV to an existing brainlift.
 * Must link to DOK3 insights with one designated as primary.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatCreateResponse, formatErrorGuidance } from '../utils/formatters';

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

export async function handleCreateDok4(
  args: { slug: string; text: string; linkedDok3Ids: number[]; primaryDok3Id: number },
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

    const result = await client.createDok4(args.slug, {
      text: args.text,
      linkedDok3Ids: args.linkedDok3Ids,
      primaryDok3Id: args.primaryDok3Id,
    });

    return {
      content: [{ type: 'text', text: formatCreateResponse(result, 4) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to create DOK4 SPOV: ${message}\n\n${formatErrorGuidance(message, 'create_dok4')}` }],
      isError: true,
    };
  }
}

export function registerCreateDok4(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'create_dok4',
    "Add a new DOK4 SPOV (Spiky Point of View) to an existing brainlift. A SPOV is a single punchy line that takes a side; observations and hedged takes get rejected. Review quality guidelines from get_template first. Linked DOK3 insights must be in 'graded' status. Triggers async grading; poll get_brainlift_assessment to check completion.",
    {
      slug: z.string().describe('Brainlift slug'),
      text: z.string().describe('A single punchy, quotable line that takes a side. Not a paragraph, not a hedged take. The DOK1-2-3 chain is the justification; the SPOV itself does not explain itself.'),
      linkedDok3Ids: z.array(z.number()).min(1).describe('IDs of DOK3 insights supporting this SPOV (must be graded, not pending)'),
      primaryDok3Id: z.number().describe('ID of the primary DOK3 insight (must be in linkedDok3Ids)'),
    },
    async (args) => handleCreateDok4(args, env, props),
  );
}
