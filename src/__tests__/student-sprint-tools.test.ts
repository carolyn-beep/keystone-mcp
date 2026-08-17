import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGeneratePlan } from '../tools/generate-plan';
import { handleGetPlan } from '../tools/get-plan';
import { handleListTasks } from '../tools/list-tasks';
import { handleGetTask } from '../tools/get-task';
import { handleSaveDeliverable } from '../tools/save-deliverable';
import { handleReadDeliverable } from '../tools/read-deliverable';
import { handleUpdateDeliverable } from '../tools/update-deliverable';
import { handleListDeliverables } from '../tools/list-deliverables';

const mockGeneratePlan = vi.fn();
const mockGetPlan = vi.fn();
const mockListTasks = vi.fn();
const mockGetTask = vi.fn();
const mockSaveDeliverable = vi.fn();
const mockReadDeliverable = vi.fn();
const mockUpdateDeliverable = vi.fn();
const mockListDeliverables = vi.fn();

vi.mock('../utils/keystone-client', () => ({
  KeystoneClient: vi.fn().mockImplementation(() => ({
    withUser: vi.fn().mockReturnThis(),
    generatePlan: mockGeneratePlan,
    getPlan: mockGetPlan,
    listTasks: mockListTasks,
    getTask: mockGetTask,
    saveDeliverable: mockSaveDeliverable,
    readDeliverable: mockReadDeliverable,
    updateDeliverable: mockUpdateDeliverable,
    listDeliverables: mockListDeliverables,
  })),
}));

const env = { KEYSTONE_BASE_URL: 'https://api.test.com', KEYSTONE_SERVICE_KEY: 'key' };
const props = { email: 'student@test.com', name: 'Student' };
const noAuth = { email: '', name: '' };

describe('student sprint tool handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleGeneratePlan kicks off generation and returns a polling instruction', async () => {
    mockGeneratePlan.mockResolvedValueOnce({
      plan: { id: 1, startDate: '2026-04-21', endDate: '2026-05-20', status: 'generating', taskCount: 0, completedTaskCount: 0 },
      tasks: [],
    });

    const diagnosis = {
      goalRaw: 'Build a pitch deck and close three pilots.',
      currentState: 'Early thesis, no interviews yet, no pricing model.',
    };

    const result = await handleGeneratePlan(
      { brainliftSlug: 'scope-breaker', localDate: '2026-04-21', diagnosis },
      env,
      props,
    );

    expect(mockGeneratePlan).toHaveBeenCalledWith('scope-breaker', {
      localDate: '2026-04-21',
      diagnosis,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Sprint plan generation started');
    expect(result.content[0].text).toContain('Status: generating');
    expect(result.content[0].text).toContain('call get_plan');
    expect(result.content[0].text).toContain('https://api.test.com/grading/scope-breaker?tab=sprint');
  });

  it('handleGetPlan returns no-active-plan messaging when API normalizes to null', async () => {
    mockGetPlan.mockResolvedValueOnce(null);

    const result = await handleGetPlan({ brainliftSlug: 'scope-breaker' }, env, props);

    expect(mockGetPlan).toHaveBeenCalledWith('scope-breaker');
    expect(result.content[0].text).toContain('No active sprint plan exists');
  });

  it('handleGetPlan tells the agent to wait when plan is still generating', async () => {
    mockGetPlan.mockResolvedValueOnce({
      plan: { id: 9, startDate: '2026-04-21', endDate: '2026-05-20', status: 'generating', taskCount: 0, completedTaskCount: 0 },
      tasks: [],
    });

    const result = await handleGetPlan({ brainliftSlug: 'scope-breaker' }, env, props);

    expect(result.content[0].text).toContain('still being generated');
    expect(result.content[0].text).toContain('call get_plan again');
  });

  it('handleGetPlan surfaces the failure reason when plan status is failed', async () => {
    mockGetPlan.mockResolvedValueOnce({
      plan: {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-20',
        status: 'failed',
        taskCount: 0,
        completedTaskCount: 0,
        generationError: 'All models failed: anthropic/claude-opus-4.6',
      },
      tasks: [],
    });

    const result = await handleGetPlan({ brainliftSlug: 'scope-breaker' }, env, props);

    expect(result.content[0].text).toContain('failed to generate');
    expect(result.content[0].text).toContain('All models failed');
  });

  it('handleListTasks highlights overdue tasks when includePastDue=true', async () => {
    mockListTasks.mockResolvedValueOnce([
      {
        id: 5,
        planId: 2,
        scheduledDate: '2026-04-18',
        weekNumber: 1,
        dayInWeek: 3,
        title: 'Late task',
        description: 'late',
        milestone: null,
        isComplete: false,
        isPastDue: true,
        deliverable: null,
      },
    ]);

    const result = await handleListTasks(
      { brainliftSlug: 'scope-breaker', includePastDue: true, localDate: '2026-04-21' },
      env,
      props,
    );

    expect(mockListTasks).toHaveBeenCalledWith('scope-breaker', {
      date: undefined,
      week: undefined,
      state: undefined,
      includePastDue: true,
      localDate: '2026-04-21',
    });
    expect(result.content[0].text).toContain('Overdue incomplete tasks');
    expect(result.content[0].text).toContain('Late task');
  });

  it('handleGetTask returns formatted task detail with deliverable metadata', async () => {
    mockGetTask.mockResolvedValueOnce({
      id: 99,
      planId: 3,
      scheduledDate: '2026-04-25',
      weekNumber: 1,
      dayInWeek: 5,
      title: 'Draft deliverable',
      description: 'Write first draft',
      milestone: null,
      isComplete: true,
      isPastDue: false,
      deliverable: {
        id: 88,
        title: 'Draft',
        docUrl: 'https://docs.google.com/document/d/abc',
        createdAt: '2026-04-25T00:00:00Z',
      },
      plan: {
        id: 3,
        startDate: '2026-04-21',
        endDate: '2026-05-20',
        status: 'active',
      },
    });

    const result = await handleGetTask({ brainliftSlug: 'scope-breaker', taskId: 99 }, env, props);

    expect(mockGetTask).toHaveBeenCalledWith('scope-breaker', 99);
    expect(result.content[0].text).toContain('Task #99');
    expect(result.content[0].text).toContain('Doc URL');
  });

  it('handleSaveDeliverable returns doc URL output', async () => {
    mockSaveDeliverable.mockResolvedValueOnce({ docUrl: 'https://docs.google.com/document/d/new' });

    const result = await handleSaveDeliverable(
      { brainliftSlug: 'scope-breaker', taskId: 5, title: 'Title', markdown: '# body' },
      env,
      props,
    );

    expect(mockSaveDeliverable).toHaveBeenCalledWith('scope-breaker', 5, { title: 'Title', markdown: '# body' });
    expect(result.content[0].text).toContain('Deliverable created successfully');
    expect(result.content[0].text).toContain('docs.google.com');
  });

  it('handleReadDeliverable returns title, doc URL, and markdown body', async () => {
    mockReadDeliverable.mockResolvedValueOnce({
      title: 'Deliverable A',
      contentMarkdown: '# Updated Body',
      docUrl: 'https://docs.google.com/document/d/a',
    });

    const result = await handleReadDeliverable(
      { brainliftSlug: 'scope-breaker', taskId: 5 },
      env,
      props,
    );

    expect(mockReadDeliverable).toHaveBeenCalledWith('scope-breaker', 5);
    expect(result.content[0].text).toContain('Deliverable: Deliverable A');
    expect(result.content[0].text).toContain('Markdown:');
    expect(result.content[0].text).toContain('# Updated Body');
  });

  it('handleUpdateDeliverable returns doc URL output', async () => {
    mockUpdateDeliverable.mockResolvedValueOnce({ docUrl: 'https://docs.google.com/document/d/a' });

    const result = await handleUpdateDeliverable(
      { brainliftSlug: 'scope-breaker', taskId: 5, markdown: '# revised' },
      env,
      props,
    );

    expect(mockUpdateDeliverable).toHaveBeenCalledWith('scope-breaker', 5, { markdown: '# revised' });
    expect(result.content[0].text).toContain('Deliverable updated successfully');
  });

  it('handleListDeliverables returns list with plan/task context', async () => {
    mockListDeliverables.mockResolvedValueOnce({
      plans: [{ id: 2, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active', taskCount: 1, completedTaskCount: 1 }],
      deliverables: [
        {
          id: 1,
          taskId: 5,
          planId: 2,
          title: 'Draft',
          taskTitle: 'Write Draft',
          scheduledDate: '2026-04-22',
          createdAt: '2026-04-22T00:00:00Z',
          docUrl: 'https://docs.google.com/document/d/abc',
        },
      ],
    });

    const result = await handleListDeliverables(
      { brainliftSlug: 'scope-breaker', planId: 2 },
      env,
      props,
    );

    expect(mockListDeliverables).toHaveBeenCalledWith('scope-breaker', { planId: 2 });
    expect(result.content[0].text).toContain('Deliverables (1)');
    expect(result.content[0].text).toContain('Write Draft');
  });

  it('returns auth error when OAuth props are missing', async () => {
    const result = await handleGetPlan({ brainliftSlug: 'scope-breaker' }, env, noAuth);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Authentication required/i);
  });

  it('returns tool-specific conflict guidance for save deliverable', async () => {
    mockSaveDeliverable.mockRejectedValueOnce(new Error('Keystone API error: 409 - A deliverable already exists for this task'));

    const result = await handleSaveDeliverable(
      { brainliftSlug: 'scope-breaker', taskId: 5, title: 'Title', markdown: '# body' },
      env,
      props,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('update_deliverable');
  });
});
