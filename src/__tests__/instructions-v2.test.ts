/**
 * Regression tests locking in v2 SPOV vocabulary across agent-facing strings.
 *
 * v1 framing (defensible / possibly contrarian / cross-source evidence) was
 * replaced in spec 08-mcp-agent-strings-v2. These tests fail loudly if anyone
 * reintroduces v1 vocabulary or em dashes.
 *
 * Captures the strings registered with `server.tool(name, description, ...)`
 * via a minimal structural stub of the McpServer interface, and reads the
 * exported instructions constant directly.
 */

import { describe, it, expect } from 'vitest';
import { BRAINLIFT_MCP_INSTRUCTIONS } from '../instructions/brainlift';
import { registerCreateDok4 } from '../tools/create-dok4';
import { registerLinkDok4 } from '../tools/link-dok4';
import { registerEditDokItem } from '../tools/edit-dok-item';

const EM_DASH = '—';

interface CapturedTool {
  name: string;
  description: string;
  // The Zod schema shape (record of fields with `.describe(...)` calls).
  schema: Record<string, { _def?: { description?: string } } & { description?: string }>;
}

function makeFakeServer() {
  const calls: CapturedTool[] = [];
  const server = {
    // The signature mirrors `McpServer.tool(name, description, schema, handler)`.
    tool: (name: string, description: string, schema: Record<string, unknown>, _handler: unknown) => {
      calls.push({ name, description, schema: schema as CapturedTool['schema'] });
    },
  };
  return { server, calls };
}

const env = { DOK1GRADER_BASE_URL: 'https://api.test.com', DOK1GRADER_SERVICE_KEY: 'k' };
const props = { email: 'u@test.com', name: 'U' };

function getZodDescription(field: { _def?: { description?: string }; description?: string }): string {
  // Zod stores `.describe(...)` text on `_def.description` in v3.
  return field._def?.description ?? field.description ?? '';
}

describe('BRAINLIFT_MCP_INSTRUCTIONS (server instructions)', () => {
  it('does not contain v1 vocabulary', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).not.toContain('defensible');
    expect(BRAINLIFT_MCP_INSTRUCTIONS).not.toContain('possibly contrarian');
  });

  it('contains v2 vocabulary in the DOK4 bullet', () => {
    // At least one of these v2 markers must show up.
    const hasV2 =
      BRAINLIFT_MCP_INSTRUCTIONS.includes('punchy') ||
      BRAINLIFT_MCP_INSTRUCTIONS.includes('single line') ||
      BRAINLIFT_MCP_INSTRUCTIONS.includes('commits to a stance');
    expect(hasV2).toBe(true);
  });

  it('contains "chain is the justification" framing', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).toContain('chain is the justification');
  });

  it('contains no em dashes', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).not.toContain(EM_DASH);
  });
});

describe('create_dok4 tool description and text param describe', () => {
  const { server, calls } = makeFakeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerCreateDok4(server as any, env, props);
  const tool = calls.find((c) => c.name === 'create_dok4');

  it('registers create_dok4', () => {
    expect(tool).toBeDefined();
  });

  it('tool description excludes v1 vocabulary', () => {
    expect(tool!.description).not.toContain('defensible');
    expect(tool!.description).not.toContain('possibly contrarian');
  });

  it('tool description contains v2 vocabulary', () => {
    const desc = tool!.description;
    const hasV2 =
      desc.includes('punchy') ||
      desc.includes('takes a side') ||
      desc.includes('single') && desc.includes('line');
    expect(hasV2).toBe(true);
  });

  it('tool description contains no em dashes', () => {
    expect(tool!.description).not.toContain(EM_DASH);
  });

  it('text param describe excludes v1 vocabulary', () => {
    const textDesc = getZodDescription(tool!.schema.text);
    expect(textDesc).not.toContain('defensible');
    expect(textDesc).not.toContain('possibly contrarian');
  });

  it('text param describe contains v2 vocabulary', () => {
    const textDesc = getZodDescription(tool!.schema.text);
    const hasV2 =
      textDesc.includes('punchy') ||
      textDesc.includes('takes a side') ||
      textDesc.includes('chain is the justification');
    expect(hasV2).toBe(true);
  });

  it('text param describe contains no em dashes', () => {
    const textDesc = getZodDescription(tool!.schema.text);
    expect(textDesc).not.toContain(EM_DASH);
  });
});

describe('link_dok4 tool description', () => {
  const { server, calls } = makeFakeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerLinkDok4(server as any, env, props);
  const tool = calls.find((c) => c.name === 'link_dok4');

  it('registers link_dok4', () => {
    expect(tool).toBeDefined();
  });

  it('description excludes v1 framing', () => {
    expect(tool!.description).not.toContain('cross-source evidence');
  });

  it('description contains v2 grounding language', () => {
    const desc = tool!.description;
    const hasV2 = desc.includes('S3 Grounded') || desc.includes('grounding');
    expect(hasV2).toBe(true);
  });

  it('description contains no em dashes', () => {
    expect(tool!.description).not.toContain(EM_DASH);
  });
});

describe('edit_dok_item tool description', () => {
  const { server, calls } = makeFakeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerEditDokItem(server as any, env, props);
  const tool = calls.find((c) => c.name === 'edit_dok_item');

  it('registers edit_dok_item', () => {
    expect(tool).toBeDefined();
  });

  it('description contains no em dashes', () => {
    expect(tool!.description).not.toContain(EM_DASH);
  });
});
