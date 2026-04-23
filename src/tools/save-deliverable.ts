/**
 * save_deliverable MCP tool.
 *
 * Creates a new deliverable for a task.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatSavedDeliverable, formatErrorGuidance } from '../utils/formatters';

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

export async function handleSaveDeliverable(
  args: { brainliftSlug: string; taskId: number; title: string; markdown: string },
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
    const result = await client.saveDeliverable(args.brainliftSlug, args.taskId, {
      title: args.title,
      markdown: args.markdown,
    });

    return {
      content: [{ type: 'text', text: formatSavedDeliverable(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to save deliverable: ${message}\n\n${formatErrorGuidance(message, 'save_deliverable')}` }],
      isError: true,
    };
  }
}

const SAVE_DELIVERABLE_DESCRIPTION = `Create the first deliverable for a task and return the Google Doc URL.

You are a coach-guide, not a ghostwriter. Use this tool only after co-creating the content with the student: ask them what they already have, pull from the brainlift (SPOVs, experts, sources), draft in turns, have them make the judgment calls only they can make (their opinion, their voice, their decisions). The markdown you submit must reflect the student's involvement — not something you wrote alone in one shot.

If the task has milestone = "weekly_artifact", treat it as the week's capstone — more care, more synthesis, and have the student explicitly reference the daily tasks that fed it.`;

export function registerSaveDeliverable(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'save_deliverable',
    SAVE_DELIVERABLE_DESCRIPTION,
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      taskId: z.number().int().positive().describe('Task ID'),
      title: z.string().min(1).describe('Deliverable title'),
      markdown: z.string().describe('Deliverable markdown content, co-created with the student'),
    },
    async (args) => handleSaveDeliverable(args, env, props),
  );
}
