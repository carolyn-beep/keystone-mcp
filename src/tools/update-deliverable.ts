/**
 * update_deliverable MCP tool.
 *
 * Updates an existing deliverable markdown body.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatUpdatedDeliverable, formatErrorGuidance } from '../utils/formatters';

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
    const client = new KeystoneClient(env.KEYSTONE_BASE_URL, env.KEYSTONE_SERVICE_KEY)
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

const UPDATE_DELIVERABLE_DESCRIPTION = `STOP AND SELF-CHECK. AI-ONLY REWRITES WILL BE REFUSED. You are a COACH-GUIDE, NOT A GHOSTWRITER — the student's voice must stay in the document. If the revision you are about to submit is your rewrite rather than a collaborative refinement, you violated the core rule of this server. Re-read the server instructions if this posture feels unclear.

ALWAYS call read_deliverable first. Your update must build on what the student already wrote — do not replace their sentences with a cleaner AI take, do not flatten their voice, do not rewrite sections they were happy with.

How to use this tool correctly:
1. Read the current document.
2. Ask the student what specifically they want to change or add.
3. Co-create the revision in turns — they direct, you assist.
4. Preserve the sentences the student wrote. Change only what the student wanted changed.
5. Before calling update_deliverable, confirm the revision reflects the student's decisions, not your preferences.

Update the markdown of an existing task deliverable and return its stable Google Doc URL.`;

export function registerUpdateDeliverable(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'update_deliverable',
    UPDATE_DELIVERABLE_DESCRIPTION,
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      taskId: z.number().int().positive().describe('Task ID'),
      markdown: z.string().describe('Updated markdown body, CO-CREATED WITH THE STUDENT and built on top of the existing document. This cannot be an AI-only rewrite — the student must have directed the changes, their wording must survive wherever they were happy with it, and their voice must remain in the document. Submissions that are clearly one-shot AI rewrites will be refused.'),
    },
    async (args) => handleUpdateDeliverable(args, env, props),
  );
}
