/**
 * edit_dok_item MCP tool.
 *
 * Edits the text of a DOK item and triggers regrading.
 * Response includes previous feedback for context.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatEditResponse, formatErrorGuidance } from '../utils/formatters';

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
    const client = new DOK1GraderClient(env.DOK1GRADER_BASE_URL, env.DOK1GRADER_SERVICE_KEY)
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
    'Edit the text of a DOK item and trigger regrading. Read the assessment feedback first to understand what to improve.',
    {
      slug: z.string().describe('Brainlift slug'),
      dok: z.number().min(1).max(4).describe('DOK level (1-4)'),
      itemId: z.number().describe('Item ID from assessment'),
      text: z.string().describe('New text content (DOK2: join points with newlines)'),
    },
    async (args) => handleEditDokItem(args, env, props),
  );
}
