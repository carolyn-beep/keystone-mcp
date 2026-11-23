/**
 * Registers every tool on a real McpServer and talks to it through the SDK
 * client over an in-memory transport. This covers the SDK + zod integration
 * that the handler-level tests bypass: schema conversion for tools/list and
 * input validation on tools/call.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerGetTemplate } from '../tools/get-template';
import { registerGradeBrainlift } from '../tools/grade-brainlift';
import { registerListBrainlifts } from '../tools/list-brainlifts';
import { registerGetBrainliftAssessment } from '../tools/get-brainlift-assessment';
import { registerEditDokItem } from '../tools/edit-dok-item';
import { registerDeleteDokItem } from '../tools/delete-dok-item';
import { registerCreateDok1 } from '../tools/create-dok1';
import { registerCreateDok2 } from '../tools/create-dok2';
import { registerCreateDok3 } from '../tools/create-dok3';
import { registerCreateDok4 } from '../tools/create-dok4';
import { registerListExperts } from '../tools/list-experts';
import { registerCreateExpert } from '../tools/create-expert';
import { registerDeleteExpert } from '../tools/delete-expert';
import { registerGetStaleItems } from '../tools/get-stale-items';
import { registerDismissStale } from '../tools/dismiss-stale';
import { registerLinkDok3 } from '../tools/link-dok3';
import { registerLinkDok4 } from '../tools/link-dok4';
import { registerGeneratePlan } from '../tools/generate-plan';
import { registerGetPlan } from '../tools/get-plan';
import { registerListTasks } from '../tools/list-tasks';
import { registerGetTask } from '../tools/get-task';
import { registerSaveDeliverable } from '../tools/save-deliverable';
import { registerReadDeliverable } from '../tools/read-deliverable';
import { registerUpdateDeliverable } from '../tools/update-deliverable';
import { registerListDeliverables } from '../tools/list-deliverables';

const env = { KEYSTONE_BASE_URL: 'https://keystone.invalid', KEYSTONE_SERVICE_KEY: 'svc' };
const props = { email: 'ada@example.com', name: 'Ada' };

const registrations = [
  registerGetTemplate, registerGradeBrainlift, registerListBrainlifts,
  registerGetBrainliftAssessment, registerEditDokItem, registerDeleteDokItem,
  registerCreateDok1, registerCreateDok2, registerCreateDok3, registerCreateDok4,
  registerListExperts, registerCreateExpert, registerDeleteExpert,
  registerGetStaleItems, registerDismissStale, registerLinkDok3, registerLinkDok4,
  registerGeneratePlan, registerGetPlan, registerListTasks, registerGetTask,
  registerSaveDeliverable, registerReadDeliverable, registerUpdateDeliverable,
  registerListDeliverables,
];

let client: Client;

beforeAll(async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { instructions: 'test instructions' });
  for (const register of registrations) register(server, env, props);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

describe('tool registration through the MCP SDK', () => {
  it('delivers server instructions in the initialize result', () => {
    expect(client.getInstructions()).toBe('test instructions');
  });

  it('lists every registered tool with an object input schema', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(registrations.length);
    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(tool.description, tool.name).toBeTruthy();
    }
  });

  it('rejects arguments that fail the zod schema before the handler runs', async () => {
    const result = await client.callTool({ name: 'edit_dok_item', arguments: { slug: 'x' } });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toMatch(/invalid/i);
  });

  it('rejects fractional DOK levels and item IDs before they reach an upstream URL path', async () => {
    const result = await client.callTool({
      name: 'delete_dok_item',
      arguments: { slug: 'my-brainlift', dok: 2.5, itemId: 1.5, confirm: false },
    });
    expect(result.isError).toBe(true);
  });

  it('rejects oversized markdown', async () => {
    const result = await client.callTool({
      name: 'grade_brainlift',
      arguments: { markdown: 'x'.repeat(500_001) },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toMatch(/invalid|too big|500000/i);
  });
});
