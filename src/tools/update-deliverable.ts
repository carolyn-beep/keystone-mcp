/**
 * update_deliverable MCP tool.
 *
 * Updates an existing deliverable markdown body.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatUpdatedDeliverable, formatErrorGuidance } from '../utils/formatters';

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

export async function handleUpdateDeliverable(
  args: { brainliftSlug: string; taskId: number; markdown: string },
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
    const result = await client.updateDeliverable(args.brainliftSlug, args.taskId, {
      markdown: args.markdown,
    });

    return {
      content: [{ type: 'text', text: formatUpdatedDeliverable(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to update deliverable: ${message}\n\n${formatErrorGuidance(message, 'update_deliverable')}` }],
      isError: true,
    };
  }
}

const UPDATE_DELIVERABLE_DESCRIPTION = `Update the markdown for an existing task deliverable and return the stable Doc URL.

ALWAYS call read_deliverable first. Your update must build on what the student already has — do not rewrite their voice out of the document or replace their work with a fresh AI take.

Same coach-guide posture as save_deliverable: you are not a ghostwriter. Co-create the revision with the student, pull from the brainlift, and have them make the judgment calls.`;

export function registerUpdateDeliverable(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'update_deliverable',
    UPDATE_DELIVERABLE_DESCRIPTION,
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      taskId: z.number().int().positive().describe('Task ID'),
      markdown: z.string().describe('Updated markdown body, co-created with the student and built on top of the existing Doc content'),
    },
    async (args) => handleUpdateDeliverable(args, env, props),
  );
}
