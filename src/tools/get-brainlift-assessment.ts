/**
 * get_brainlift_assessment MCP tool.
 *
 * Retrieves grading status (statusOnly mode) or paginated assessment
 * results by DOK level (items mode).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOK1GraderClient } from '../utils/dok1grader-client';
import { formatStatus, formatAssessment } from '../utils/formatters';

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
 * Handle the get_brainlift_assessment tool invocation.
 * Exported separately for testing.
 */
export async function handleGetBrainliftAssessment(
  args: {
    slug: string;
    dok: number;
    page?: number;
    pageSize?: number;
    statusOnly?: boolean;
    detail?: 'summary' | 'full';
  },
  env: ToolEnv,
  props: ToolProps,
): Promise<ToolResult> {
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

    if (args.statusOnly) {
      const status = await client.getStatus(args.slug);
      return {
        content: [{ type: 'text', text: formatStatus(status) }],
      };
    }

    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 20;
    const detail = args.detail ?? 'summary';

    const result = await client.getAssessment(
      args.slug,
      args.dok,
      page,
      pageSize,
      detail,
    );

    return {
      content: [{ type: 'text', text: formatAssessment(result, args.dok, detail) }],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get assessment: ${message}. Please try again later.`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Register the get_brainlift_assessment tool on the MCP server.
 */
export function registerGetBrainliftAssessment(
  server: McpServer,
  env: ToolEnv,
  props: ToolProps,
): void {
  server.tool(
    'get_brainlift_assessment',
    'Get grading status or assessment results for a brainlift. Use statusOnly=true to poll progress (lightweight). Use dok=1-4 to get per-level results: 1=Facts, 2=Summaries, 3=Insights, 4=SPOVs. Wait ~30 seconds between status polls.',
    {
      slug: z.string().describe(
        'The brainlift slug returned by grade_brainlift or list_brainlifts.',
      ),
      dok: z.number().int().min(1).max(4).describe(
        'DOK level to retrieve: 1=Facts, 2=Summaries, 3=Insights, 4=SPOVs',
      ),
      page: z.number().int().min(1).default(1).optional().describe(
        'Page number for pagination. Default: 1',
      ),
      pageSize: z.number().int().min(1).max(50).default(20).optional().describe(
        'Items per page. Default: 20, max: 50',
      ),
      statusOnly: z.boolean().default(false).optional().describe(
        'If true, returns only grading status and progress without items. Use this for polling before grading completes.',
      ),
      detail: z.enum(['summary', 'full']).default('summary').optional().describe(
        "Level of detail for DOK3/DOK4 items. 'summary' returns scores + rationale + feedback. 'full' adds per-criterion breakdown, traceability, and divergence analysis. Default: 'summary'.",
      ),
    },
    async (args) => handleGetBrainliftAssessment(args, env, props),
  );
}
