/**
 * list_tasks MCP tool.
 *
 * Lists tasks. If brainliftSlug is provided, scopes to that brainlift;
 * otherwise returns tasks across every brainlift the user has access to.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient } from '../utils/keystone-client';
import { formatTaskList, formatCrossBrainliftTaskList, formatErrorGuidance } from '../utils/formatters';

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

export async function handleListTasks(
  args: {
    brainliftSlug?: string;
    date?: string;
    week?: number;
    state?: 'all' | 'complete' | 'incomplete';
    includePastDue?: boolean;
    localDate?: string;
  },
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

    const query = {
      date: args.date,
      week: args.week,
      state: args.state,
      includePastDue: args.includePastDue,
      localDate: args.localDate,
    };

    if (args.brainliftSlug) {
      const result = await client.listTasks(args.brainliftSlug, query);
      return {
        content: [{ type: 'text', text: formatTaskList(result, { includePastDue: args.includePastDue }) }],
      };
    }

    const result = await client.listAllTasks(query);
    return {
      content: [{ type: 'text', text: formatCrossBrainliftTaskList(result, { includePastDue: args.includePastDue }) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to list tasks: ${message}\n\n${formatErrorGuidance(message, 'list_tasks')}` }],
      isError: true,
    };
  }
}

export function registerListTasks(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'list_tasks',
    "List sprint tasks. Omit brainliftSlug to see tasks across every brainlift the student has access to (useful for 'what's on my plate today?'). Pass brainliftSlug to scope to a single brainlift. Combine with includePastDue=true + localDate to get today's tasks plus any overdue incompletes.",
    {
      brainliftSlug: z.string().min(1).optional().describe('Brainlift slug. Omit to list tasks across all brainlifts the student has access to.'),
      date: z.string().optional().describe('Filter by scheduled date (YYYY-MM-DD)'),
      week: z.number().int().min(1).max(5).optional().describe('Filter by sprint week number (1-5). Only meaningful when brainliftSlug is provided.'),
      state: z.enum(['all', 'complete', 'incomplete']).optional().describe('Filter by completion state'),
      includePastDue: z.boolean().optional().describe('Include overdue incomplete tasks in results'),
      localDate: z.string().optional().describe('Local date (YYYY-MM-DD), required when includePastDue=true'),
    },
    async (args) => handleListTasks(args, env, props),
  );
}
