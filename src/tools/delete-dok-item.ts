/**
 * delete_dok_item MCP tool.
 *
 * Deletes a DOK item. First call (confirm=false) shows impact preview.
 * Second call (confirm=true) executes deletion.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import type { DeletePreviewResponse, DeleteResultResponse } from '../utils/dok1grader-client';
import { formatDeletePreview, formatDeleteResult, formatErrorGuidance } from '../utils/formatters';

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
    const client = new DOK1GraderClient(env.DOK1GRADER_BASE_URL, env.DOK1GRADER_SERVICE_KEY)
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
    'Delete a DOK item. Returns impact preview showing what will be affected. Call again with confirm=true to execute.',
    {
      slug: z.string().describe('Brainlift slug'),
      dok: z.number().min(1).max(4).describe('DOK level (1-4)'),
      itemId: z.number().describe('Item ID to delete'),
      confirm: z.boolean().default(false).describe('Set true to execute deletion. False returns preview only.'),
    },
    async (args) => handleDeleteDokItem(args, env, props),
  );
}
