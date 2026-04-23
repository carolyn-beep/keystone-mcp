/**
 * list_tasks MCP tool.
 *
 * Lists tasks for a brainlift with optional filters.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatTaskList, formatErrorGuidance } from '../utils/formatters';

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

export async function handleListTasks(
  args: {
    brainliftSlug: string;
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
    const client = new DOK1GraderClient(env.DOK1GRADER_BASE_URL, env.DOK1GRADER_SERVICE_KEY)
      .withUser(props.email, props.name);

    const result = await client.listTasks(args.brainliftSlug, {
      date: args.date,
      week: args.week,
      state: args.state,
      includePastDue: args.includePastDue,
      localDate: args.localDate,
    });

    return {
      content: [{ type: 'text', text: formatTaskList(result, { includePastDue: args.includePastDue }) }],
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
    'List sprint tasks for a brainlift, with optional filters for date/week/state and overdue inclusion.',
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      date: z.string().optional().describe('Filter by scheduled date (YYYY-MM-DD)'),
      week: z.number().int().min(1).max(5).optional().describe('Filter by sprint week number (1-5)'),
      state: z.enum(['all', 'complete', 'incomplete']).optional().describe('Filter by completion state'),
      includePastDue: z.boolean().optional().describe('Include overdue incomplete tasks in results'),
      localDate: z.string().optional().describe('Local date (YYYY-MM-DD), required when includePastDue=true by backend validation'),
    },
    async (args) => handleListTasks(args, env, props),
  );
}
