/**
 * get_template MCP tool.
 *
 * Returns the Brainlift markdown template with quality guidelines.
 * No parameters required -- uses authenticated user context from props.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';

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

/**
 * Handle the get_template tool invocation.
 * Exported separately for testing.
 */
export async function handleGetTemplate(
  env: ToolEnv,
  props: ToolProps,
): Promise<ToolResult> {
  // Validate authentication
  if (!props?.email) {
    return {
      content: [
        {
          type: 'text',
          text: 'Authentication required. Please connect with Google OAuth before using this tool.',
        },
      ],
      isError: true,
    };
  }

  try {
    const client = new DOK1GraderClient(
      env.DOK1GRADER_BASE_URL,
      env.DOK1GRADER_SERVICE_KEY,
    ).withUser(props.email, props.name);

    const template = await client.getTemplate();

    return {
      content: [{ type: 'text', text: template }],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [
        {
          type: 'text',
          text: `Failed to fetch template: ${message}. Please try again later.`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Register the get_template tool on the MCP server.
 */
export function registerGetTemplate(
  server: McpServer,
  env: ToolEnv,
  props: ToolProps,
): void {
  server.tool(
    'get_template',
    'Get the Brainlift markdown template with format rules and quality guidelines. Call this FIRST before creating any Brainlift content.',
    {},
    async () => handleGetTemplate(env, props),
  );
}
