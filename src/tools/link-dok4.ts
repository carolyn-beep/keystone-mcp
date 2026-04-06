/**
 * link_dok4 MCP tool.
 *
 * Adds DOK3 insight links to an existing DOK4 SPOV and triggers regrading.
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

export async function handleLinkDok4(
  args: { slug: string; spovId: number; dok3Ids: number[]; newPrimaryDok3Id?: number },
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

    const result = await client.linkDok4(args.slug, args.spovId, args.dok3Ids, args.newPrimaryDok3Id);

    return {
      content: [{ type: 'text', text: formatLinkResponse(result, 4) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to link DOK3s to DOK4 SPOV: ${message}\n\n${formatErrorGuidance(message, 'link_dok4')}` }],
      isError: true,
    };
  }
}

export function registerLinkDok4(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'link_dok4',
    'Attach additional DOK3 insights to an existing DOK4 SPOV to strengthen its analytical foundation. Use this when the grading feedback says the SPOV needs broader support or more cross-source evidence -- go build new DOK3 insights first, then link them here. This preserves the SPOV\'s version history and feedback continuity (unlike delete + recreate). Triggers an automatic regrade so the score reflects the expanded foundation. The SPOV text stays the same -- only the supporting insights change. Optionally update which DOK3 is the primary insight. Ensure the DOK3s are fully graded (not grading or regrading) before linking to avoid failures.',
    {
      slug: z.string().describe('Brainlift slug'),
      spovId: z.number().int().describe('ID of the existing DOK4 SPOV (from get_brainlift_assessment)'),
      dok3Ids: z.array(z.number().int()).min(1).describe('IDs of DOK3 insights to link. Must be graded and belong to the same brainlift. Already-linked DOK3s are silently skipped.'),
      newPrimaryDok3Id: z.number().int().optional().describe('If provided, updates which DOK3 is the primary insight for this SPOV. Must be in the combined set of existing + new links.'),
    },
    async (args) => handleLinkDok4(args, env, props),
  );
}
