/**
 * create_dok4 MCP tool.
 *
 * Adds a new DOK4 SPOV to an existing brainlift.
 * Must link to DOK3 insights with one designated as primary.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatCreateResponse, formatErrorGuidance } from '../utils/formatters';

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
    const client = new DOK1GraderClient(env.DOK1GRADER_BASE_URL, env.DOK1GRADER_SERVICE_KEY)
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
    'Add a new DOK4 SPOV (Spiky Point of View) to an existing brainlift. Must link to DOK3 insights with one designated as primary. Triggers DOK4 grading pipeline.',
    {
      slug: z.string().describe('Brainlift slug'),
      text: z.string().describe('Your spiky point of view -- a defensible position where informed people disagree'),
      linkedDok3Ids: z.array(z.number()).min(1).describe('IDs of DOK3 insights supporting this SPOV'),
      primaryDok3Id: z.number().describe('ID of the primary DOK3 insight (must be in linkedDok3Ids)'),
    },
    async (args) => handleCreateDok4(args, env, props),
  );
}
