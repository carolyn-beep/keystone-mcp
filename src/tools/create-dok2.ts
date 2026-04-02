/**
 * create_dok2 MCP tool.
 *
 * Adds a new DOK2 summary to an existing brainlift. Triggers DOK2 grading.
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

export async function handleCreateDok2(
  args: {
    slug: string;
    sourceName: string;
    sourceUrl?: string;
    points: string[];
    relatedFactIds: number[];
  },
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

    const result = await client.createDok2(args.slug, {
      sourceName: args.sourceName,
      sourceUrl: args.sourceUrl,
      points: args.points,
      relatedFactIds: args.relatedFactIds,
    });

    return {
      content: [{ type: 'text', text: formatCreateResponse(result, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to create DOK2 summary: ${message}\n\n${formatErrorGuidance(message, 'create_dok2')}` }],
      isError: true,
    };
  }
}

export function registerCreateDok2(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'create_dok2',
    'Add a new DOK2 summary to an existing brainlift. Triggers DOK2 grading.',
    {
      slug: z.string().describe('Brainlift slug'),
      sourceName: z.string().describe('Name of the source being summarized'),
      sourceUrl: z.string().optional().describe('URL of the source'),
      points: z.array(z.string()).min(1).describe('Summary points (your synthesis, not copy-paste)'),
      relatedFactIds: z.array(z.number()).min(1).describe('IDs of DOK1 facts this summary draws from'),
    },
    async (args) => handleCreateDok2(args, env, props),
  );
}
