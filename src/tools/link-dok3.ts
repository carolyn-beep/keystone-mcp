/**
 * link_dok3 MCP tool.
 *
 * Adds DOK2 summary links to an existing DOK3 insight and triggers regrading.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatLinkResponse, formatErrorGuidance } from '../utils/formatters';

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

export async function handleLinkDok3(
  args: { slug: string; insightId: number; dok2Ids: number[] },
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

    const result = await client.linkDok3(args.slug, args.insightId, args.dok2Ids);

    return {
      content: [{ type: 'text', text: formatLinkResponse(result, 3) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to link DOK2s to DOK3 insight: ${message}\n\n${formatErrorGuidance(message, 'link_dok3')}` }],
      isError: true,
    };
  }
}

export function registerLinkDok3(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'link_dok3',
    'Attach additional DOK2 summaries to an existing DOK3 insight to strengthen its evidence base. Use this when the grading feedback says the insight needs more research or stronger foundation -- go build new DOK1 facts and DOK2 summaries first, then link those DOK2s here. This preserves the insight\'s version history and feedback continuity (unlike delete + recreate). Triggers an automatic regrade so the score reflects the expanded foundation. The insight text stays the same -- only the supporting evidence changes. Ensure the DOK2s are fully graded (not grading or regrading) before linking to avoid failures.',
    {
      slug: z.string().describe('Brainlift slug'),
      insightId: z.number().int().describe('ID of the existing DOK3 insight (from get_brainlift_assessment)'),
      dok2Ids: z.array(z.number().int()).min(1).describe('IDs of DOK2 summaries to link. These must belong to the same brainlift. Already-linked DOK2s are silently skipped.'),
    },
    async (args) => handleLinkDok3(args, env, props),
  );
}
