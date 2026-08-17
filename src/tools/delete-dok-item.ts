/**
 * delete_dok_item MCP tool.
 *
 * Deletes a DOK item. First call (confirm=false) shows impact preview.
 * Second call (confirm=true) executes deletion.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import type { DeletePreviewResponse, DeleteResultResponse } from '../utils/keystone-client';
import { formatDeletePreview, formatDeleteResult, formatErrorGuidance } from '../utils/formatters';

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
  [key: string]: unknown;
}

export async function handleDeleteDokItem(
  args: { slug: string; dok: number; itemId: number; confirm: boolean },
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

    // confirm=false means we want a preview (preview=true on the API)
    const preview = !args.confirm;
    const result = await client.deleteDokItem(args.slug, args.dok, args.itemId, preview);

    if ('deleted' in result) {
      return {
        content: [{ type: 'text', text: formatDeleteResult(result as DeleteResultResponse) }],
      };
    }

    return {
      content: [{ type: 'text', text: formatDeletePreview(result as DeletePreviewResponse) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to delete item: ${message}\n\n${formatErrorGuidance(message, 'delete_dok_item')}` }],
      isError: true,
    };
  }
}

export function registerDeleteDokItem(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'delete_dok_item',
    `Delete a DOK item. Deletion is a curation tool -- use it alongside editing to shape a BrainLift toward quality, not just volume.

EDIT vs DELETE -- it depends on context:
- If the feedback points to fixable text problems (imprecise language, missing connection to purpose), edit.
- If the problem is structural (wrong source URL, irrelevant source, weak claim that can't be salvaged), delete.
- A source that has nothing to do with the rest of the BrainLift should be trimmed entirely -- delete its DOK1 facts and DOK2 summaries.
- Low-scoring items drag down foundation scores for everything built on top. A swollen BrainLift with hundreds of weak facts benefits more from pruning than from editing each one. A small BrainLift might need every item, so edit first.
- Scores improve not just by making items better, but by removing items that dilute quality. Use get_brainlift_assessment with sortBy=score&order=asc to find the weakest items and assess whether they're worth the effort.

Common workflows:
- DOK1 has a wrong or broken source URL: delete it, create_dok1 with the correct source.
- DOK2 is dragging a DOK3 score down: delete the weak DOK2, build a better one, link_dok3 to attach it.
- DOK3/DOK4 needs stronger foundation: don't delete the DOK3/DOK4 -- prune weak items underneath, build better ones, then link_dok3 or link_dok4 to connect them. This preserves version history and feedback continuity.
- An entire source is irrelevant: delete all DOK1 facts from that source, then delete the DOK2 summary. The cascade will mark dependent DOK3/DOK4 items stale for review.

First call (confirm=false) returns an impact preview showing what will be affected. Review the cascade, then call again with confirm=true to execute.`,
    {
      slug: z.string().describe('Brainlift slug'),
      dok: z.number().min(1).max(4).describe('DOK level: 1=Facts, 2=Summaries, 3=Insights, 4=SPOVs'),
      itemId: z.number().describe('Item ID (from get_brainlift_assessment output)'),
      confirm: z.boolean().default(false).describe('false = preview impact only (safe). true = execute deletion (irreversible).'),
    },
    async (args) => handleDeleteDokItem(args, env, props),
  );
}
