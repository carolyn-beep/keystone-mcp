/**
 * edit_dok_item MCP tool.
 *
 * Edits the text of a DOK item and triggers regrading.
 * Response includes previous feedback for context.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatEditResponse, formatErrorGuidance } from '../utils/formatters';

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

export async function handleEditDokItem(
  args: { slug: string; dok: number; itemId: number; text: string },
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

    const result = await client.editDokItem(args.slug, args.dok, args.itemId, args.text);

    return {
      content: [{ type: 'text', text: formatEditResponse(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to edit item: ${message}\n\n${formatErrorGuidance(message, 'edit_dok_item')}` }],
      isError: true,
    };
  }
}

export function registerEditDokItem(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'edit_dok_item',
    `Edit the text of a DOK item and trigger context-aware regrading. You MUST read grading feedback first via get_brainlift_assessment -- your edit should directly address the feedback the grader gave. After editing, the item enters async regrading (status shows [REGRADING] in assessment). Poll get_brainlift_assessment to check when regrading completes. Editing a foundation item (DOK1/DOK2) marks dependent higher-level items as stale -- check get_stale_items afterward. For DOK2: put each summary point on its own line (the server splits by newlines into the points array).

NOTE: This tool only changes text. It cannot change source URLs or linked items. If the problem is a wrong source URL on a DOK1 fact, use delete_dok_item to remove it and create_dok1 to add a corrected one. If a DOK3 or DOK4 has weak foundation items dragging its score down, delete those bad DOK1s or DOK2s underneath it, build better ones, then use link_dok3 or link_dok4 to attach the stronger evidence.`,
    {
      slug: z.string().describe('Brainlift slug'),
      dok: z.number().min(1).max(4).describe('DOK level: 1=Facts, 2=Summaries, 3=Insights, 4=SPOVs'),
      itemId: z.number().describe('Item ID (the numeric ID shown in brackets in get_brainlift_assessment output, e.g. [ID: 24288])'),
      text: z.string().describe('New text that addresses the grading feedback. For DOK2: one summary point per line, separated by newlines.'),
    },
    async (args) => handleEditDokItem(args, env, props),
  );
}
