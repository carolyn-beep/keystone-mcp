/**
 * create_dok3 MCP tool.
 *
 * Adds a new DOK3 insight to an existing brainlift.
 * Must link to >= 2 DOK2 summaries from >= 2 different sources.
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

export async function handleCreateDok3(
  args: { slug: string; text: string; linkedDok2Ids: number[] },
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

    const result = await client.createDok3(args.slug, {
      text: args.text,
      linkedDok2Ids: args.linkedDok2Ids,
    });

    return {
      content: [{ type: 'text', text: formatCreateResponse(result, 3) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to create DOK3 insight: ${message}\n\n${formatErrorGuidance(message, 'create_dok3')}` }],
      isError: true,
    };
  }
}

export function registerCreateDok3(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'create_dok3',
    'Add a new DOK3 insight to an existing brainlift. Review quality guidelines from get_template first. DOK3 insights must be cross-source analytical claims -- not just restating DOK2 summaries side by side. Genuine synthesis across sources is required. Must link to >= 2 DOK2 summaries from >= 2 different sources. Triggers async grading pipeline. Poll get_brainlift_assessment to check when grading completes.',
    {
      slug: z.string().describe('Brainlift slug'),
      text: z.string().describe('A cross-source analytical claim that synthesizes findings across multiple sources into a novel insight'),
      linkedDok2Ids: z.array(z.number()).min(2).describe('IDs of DOK2 summaries this insight synthesizes (>= 2 IDs, from >= 2 different sources)'),
    },
    async (args) => handleCreateDok3(args, env, props),
  );
}
