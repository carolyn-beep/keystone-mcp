/**
 * generate_plan MCP tool.
 *
 * Generates a 30-day sprint plan for a brainlift.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeystoneClient, type GeneratePlanInput } from '../utils/keystone-client';
import { formatGeneratedPlan, formatErrorGuidance } from '../utils/formatters';

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

export async function handleGeneratePlan(
  args: {
    brainliftSlug: string;
    localDate: string;
    diagnosis: {
      goalRaw: string;
      currentState: string;
    };
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
    const input: GeneratePlanInput = {
      localDate: args.localDate,
      diagnosis: args.diagnosis,
    };
    const result = await client.generatePlan(args.brainliftSlug, input);

    return {
      content: [{
        type: 'text',
        text: formatGeneratedPlan(result, {
          slug: args.brainliftSlug,
          baseUrl: env.KEYSTONE_BASE_URL,
          localDate: args.localDate,
        }),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: 'text', text: `Failed to generate plan: ${message}\n\n${formatErrorGuidance(message, 'generate_plan')}` }],
      isError: true,
    };
  }
}

const GENERATE_PLAN_DESCRIPTION = `Generate a 30-day sprint plan for a brainlift. The plan moves through four stages (Exploration, Thesis, Validation, Execution) and produces four flagship deliverables plus daily tasks.

This tool returns immediately with a plan id and status='generating'. The actual generation runs in the background and typically takes 3-5 minutes. After calling this tool:
  1. Tell the student plan generation has started and usually takes a few minutes.
  2. Wait ~60 seconds, then call get_plan to check status.
  3. Keep polling get_plan every 30-60 seconds until status is 'active' (ready) or 'failed' (retry recommended).
  4. Only call generate_plan again if the previous plan failed or the student explicitly wants to regenerate.

BEFORE calling this tool:
1. Read the brainlift context via list_brainlifts and get_brainlift_assessment. If that material answers the diagnosis fields, use it.
2. Run a short, targeted diagnosis conversation with the student — only where the brainlift is silent. Do not re-ask obvious things. Most students will be very early; that is fine.
3. Populate goalRaw and currentState honestly. Vague or invented diagnoses produce vague or wrong plans.

Do not call this tool cold. The diagnosis is how the planner adapts the plan to this specific student.`;

export function registerGeneratePlan(server: McpServer, env: ToolEnv, props: ToolProps): void {
  server.tool(
    'generate_plan',
    GENERATE_PLAN_DESCRIPTION,
    {
      brainliftSlug: z.string().min(1).describe('Brainlift slug'),
      localDate: z.string().describe("Student's local date in YYYY-MM-DD format. The backend uses this to schedule task dates."),
      diagnosis: z.object({
        goalRaw: z.string().min(1).max(2000).describe(
          "The student's business ambition in their own words. Preserve their vagueness; do not polish or restate in your voice. If the BrainLift states a goal clearly, use it; otherwise ask the student for their ambition directly.",
        ),
        currentState: z.string().min(1).max(4000).describe(
          "Describe where the student's BUSINESS stands right now — what they believe about the market, what they've validated with real people, what they've built or sketched, what they're still unsure about. Write it the way a startup advisor would describe a founder's situation to another advisor. Keep to 2-5 sentences.",
        ),
      }).describe('Pre-generation diagnosis. Required. Populate after reading the brainlift and, if needed, a short conversation with the student.'),
    },
    async (args) => handleGeneratePlan(args, env, props),
  );
}
