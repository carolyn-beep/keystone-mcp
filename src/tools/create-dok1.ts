/**
 * create_dok1 MCP tool.
 *
 * Adds a new DOK1 fact to an existing brainlift. Triggers verification grading.
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

export async function handleCreateDok1(
  args: { slug: string; fact: string; source: string; category?: string },
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

    const result = await client.createDok1(args.slug, {
      fact: args.fact,
      source: args.source,
      category: args.category,
    });

    return {
      content: [{ type: 'text', text: formatCreateResponse(result, 1) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to create DOK1 fact: ${message}\n\n${formatErrorGuidance(message, 'create_dok1')}` }],
      isError: true,
    };
  }
}

export function registerCreateDok1(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'create_dok1',
    'Add a new DOK1 fact to an existing brainlift. Review quality guidelines from get_template first. Sharp, well-sourced facts beat vague ones -- volume dilutes, it does not strengthen. Triggers async verification grading. Poll get_brainlift_assessment to check when grading completes (item shows [REGRADING] until done).',
    {
      slug: z.string().describe('Brainlift slug'),
      fact: z.string().describe('An atomic, verifiable factual claim tied to the source'),
      source: z.string().describe('A real, reachable source URL (e.g., https://example.com/article). Must be a valid URL the grader can fetch -- hallucinated URLs will fail verification.'),
      category: z.string().optional().describe('Topic category'),
    },
    async (args) => handleCreateDok1(args, env, props),
  );
}
