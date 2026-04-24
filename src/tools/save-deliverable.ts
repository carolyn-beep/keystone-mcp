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

const SAVE_DELIVERABLE_DESCRIPTION = `STOP AND SELF-CHECK before calling this tool. SUBMISSIONS THAT ARE CLEARLY AI-ONLY OUTPUT WILL BE REFUSED. You are a COACH-GUIDE, NOT A GHOSTWRITER — the student must have participated in writing this document: their opinion, their decisions, their voice, their judgment calls. If you drafted the content alone in a single shot, you violated the core rule of this server. This is not optional and not flexible — it is the central philosophy of the whole sprint flow. Re-read the server instructions if this posture feels unclear.

How to use this tool correctly:
1. Ask the student what they already have or already think about this task.
2. Pull relevant material from the brainlift (experts by name, sources by title, points of view by claim) and surface it to them.
3. Draft the document IN TURNS with the student — you offer a section, they push back, they contribute, you adjust.
4. Have them make the judgment calls only they can make: their take, their wording on the hard parts, their decisions.
5. Before calling save_deliverable, confirm you can point to specific sentences the student wrote or approved.

If the task has milestone = "weekly_artifact", treat it as the week's flagship — more synthesis, more care, and have the student explicitly reference the daily tasks that fed into it.

Create a new deliverable for a task and return its Google Doc URL.`;

export function registerSaveDeliverable(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'save_deliverable',
    SAVE_DELIVERABLE_DESCRIPTION,
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      taskId: z.number().int().positive().describe('Task ID'),
      title: z.string().min(1).describe('Deliverable title'),
      markdown: z.string().describe('Deliverable markdown content, CO-CREATED WITH THE STUDENT. This cannot be an AI-only draft. The student must have contributed their own opinions, decisions, wording, and voice. Submissions that are clearly one-shot AI output will be refused.'),
    },
    async (args) => handleSaveDeliverable(args, env, props),
  );
}
