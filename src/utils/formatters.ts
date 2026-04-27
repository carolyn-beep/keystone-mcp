/**
 * Response formatters for MCP tool outputs.
 *
 * Converts DOK1Grader API JSON into human-readable text.
 * AI agents consume text better than raw JSON.
 */

import type {
  GradeResponse,
  ListBrainliftsResponse,
  StatusResponse,
  Pagination,
  ExpertRecord,
  EditResponse,
  DeletePreviewResponse,
  DeleteResultResponse,
  CreateResponse,
  StaleResponse,
  LinkResponse,
  GeneratedPlanResponse,
  TaskListItem,
  CrossBrainliftTaskListItem,
  TaskDetailResponse,
  ReadDeliverableResponse,
  DeliverableListResponse,
} from './dok1grader-client';

// ── Grade response ──

export function formatGradeResponse(result: GradeResponse): string {
  return [
    `Brainlift created with slug: ${result.slug}`,
    '',
    'Grading has started. You MUST wait and poll for results autonomously -- do not ask the user to check back later.',
    '',
    'Follow this workflow:',
    `1. Wait ${result.retryAfter} seconds (use bash sleep ${result.retryAfter} or equivalent)`,
    '2. Call get_brainlift_assessment with statusOnly=true and dok=1 to check progress',
    '3. If status is not "complete", sleep again for the retryAfter seconds in the response, then re-poll',
    '4. Once complete, call get_brainlift_assessment with dok=1 through dok=4 to read per-level feedback',
    '5. Present the full assessment results to the user',
  ].join('\n');
}

// ── List brainlifts ──

export function formatBrainliftList(result: ListBrainliftsResponse): string {
  if (result.brainlifts.length === 0) {
    return 'No brainlifts found. Use grade_brainlift to submit your first one.';
  }

  const { pagination } = result;
  const lines: string[] = [
    `Your Brainlifts (Page ${pagination.page} of ${pagination.totalPages}, ${pagination.totalItems} total)`,
    '',
  ];

  for (let i = 0; i < result.brainlifts.length; i++) {
    const b = result.brainlifts[i];
    const status = capitalize(b.status);
    const score = b.score !== null ? ` | Score: ${b.score}/5` : '';
    const date = b.createdAt.split('T')[0];

    lines.push(`${i + 1}. ${b.title} [slug: ${b.slug}]`);
    lines.push(`   Status: ${status}${score} | Created: ${date}`);
    lines.push('');
  }

  lines.push(`Page ${pagination.page} of ${pagination.totalPages}.`);
  if (pagination.page < pagination.totalPages) {
    lines.push(`Use page=${pagination.page + 1} to see more.`);
  }

  return lines.join('\n');
}

// ── Status ──

export function formatStatus(result: StatusResponse): string {
  const isComplete = result.status === 'complete';
  const statusLabel = isComplete ? 'Complete' : 'Grading in progress';

  const lines: string[] = [
    `Brainlift: ${result.title}`,
    `Status: ${statusLabel}`,
    '',
    'Progress:',
  ];

  const dokLabels = ['DOK1 Facts', 'DOK2 Summaries', 'DOK3 Insights', 'DOK4 SPOVs'];
  const dokKeys = ['dok1', 'dok2', 'dok3', 'dok4'] as const;

  for (let i = 0; i < dokKeys.length; i++) {
    const p = result.progress[dokKeys[i]];
    lines.push(`- ${dokLabels[i]}: ${p.graded}/${p.total} graded`);
  }

  // Scores section
  const { score } = result;
  const scoreLines: string[] = [];
  if (score.dok1Mean !== null) scoreLines.push(`- DOK1 Mean: ${score.dok1Mean}/5`);
  if (score.dok2Mean !== null) scoreLines.push(`- DOK2 Mean: ${score.dok2Mean}/5`);
  if (score.dok3Mean !== null) scoreLines.push(`- DOK3 Mean: ${score.dok3Mean}/5`);
  if (score.dok4Mean !== null) scoreLines.push(`- DOK4 Mean: ${score.dok4Mean}/5`);

  if (scoreLines.length > 0) {
    lines.push('');
    lines.push(isComplete ? 'Scores:' : 'Scores (so far):');
    lines.push(...scoreLines);
    if (score.overall !== null) {
      lines.push(`- Overall: ${score.overall}/5`);
    }
  }

  if (isComplete) {
    lines.push('');
    lines.push('Next: Read the per-DOK feedback (dok=1 through dok=4), then use edit_dok_item to improve individual items. Check get_stale_items for downstream items that may need updating too.');
  } else if (result.retryAfter > 0) {
    lines.push('');
    lines.push(`Grading still in progress. Sleep ${result.retryAfter} seconds (use bash sleep ${result.retryAfter}), then re-poll with statusOnly=true. Do not ask the user to wait -- handle this autonomously.`);
  }

  return lines.join('\n');
}

// ── Assessment by DOK level ──

export function formatAssessmentDOK1(result: {
  items: any[];
  pagination: Pagination;
}): string {
  if (result.items.length === 0) {
    return 'No DOK1 items found for this brainlift.';
  }

  const { pagination } = result;
  const lines: string[] = [
    `DOK1 Assessment (Page ${pagination.page} of ${pagination.totalPages}, ${pagination.totalItems} total facts)`,
    '',
  ];

  for (let i = 0; i < result.items.length; i++) {
    const item = result.items[i];
    if (item.gradingStatus === 'regrading' || item.gradingStatus === 'grading') {
      lines.push(`${i + 1}. [ID: ${item.id}] [REGRADING] "${item.fact}"`);
    } else {
      lines.push(`${i + 1}. [ID: ${item.id}] [Score: ${item.score}/5] "${item.fact}"`);
    }
    if (item.source) lines.push(`   Source: ${item.source}`);
    if (item.note) lines.push(`   Note: ${item.note}`);
    lines.push('');
  }

  lines.push(...paginationFooter(pagination));
  return lines.join('\n');
}

export function formatAssessmentDOK2(result: {
  items: any[];
  pagination: Pagination;
}): string {
  if (result.items.length === 0) {
    return 'No DOK2 items found for this brainlift.';
  }

  const { pagination } = result;
  const lines: string[] = [
    `DOK2 Assessment (Page ${pagination.page} of ${pagination.totalPages}, ${pagination.totalItems} total summaries)`,
    '',
  ];

  for (let i = 0; i < result.items.length; i++) {
    const item = result.items[i];
    if (item.gradingStatus === 'regrading' || item.gradingStatus === 'grading') {
      lines.push(`${i + 1}. [ID: ${item.id}] [REGRADING] ${item.displayTitle}`);
    } else {
      lines.push(`${i + 1}. [ID: ${item.id}] [Grade: ${item.grade}/5] ${item.displayTitle}`);
    }
    lines.push(`   Source: ${item.sourceName}`);
    if (item.points.length > 0) {
      lines.push(`   Points: ${item.points.join('; ')}`);
    }
    if (item.diagnosis) lines.push(`   Diagnosis: ${item.diagnosis}`);
    if (item.feedback) lines.push(`   Feedback: ${item.feedback}`);
    if (item.failReason) lines.push(`   Fail Reason: ${item.failReason}`);
    lines.push('');
  }

  lines.push(...paginationFooter(pagination));
  return lines.join('\n');
}

export function formatAssessmentDOK3(
  result: { items: any[]; pagination: Pagination },
  detail: 'summary' | 'full' = 'summary',
): string {
  if (result.items.length === 0) {
    return 'No DOK3 items found for this brainlift.';
  }

  const { pagination } = result;
  const lines: string[] = [
    `DOK3 Assessment (Page ${pagination.page} of ${pagination.totalPages}, ${pagination.totalItems} total insights)`,
    '',
  ];

  for (let i = 0; i < result.items.length; i++) {
    const item = result.items[i];
    if (item.status === 'grading' || item.status === 'regrading') {
      lines.push(`${i + 1}. [ID: ${item.id}] [REGRADING] "${item.text}"`);
    } else {
      lines.push(`${i + 1}. [ID: ${item.id}] [Score: ${item.score}/5] "${item.text}"`);
    }
    if (item.linkedSources.length > 0) {
      lines.push(`   Linked Sources: ${item.linkedSources.join(', ')}`);
    }
    if (item.rationale) lines.push(`   Rationale: ${item.rationale}`);
    if (item.feedback) lines.push(`   Feedback: ${item.feedback}`);
    if (item.foundationIntegrityIndex != null) {
      lines.push(`   Foundation Integrity: ${item.foundationIntegrityIndex}`);
    }
    if (item.criteriaSummary) lines.push(`   Criteria: ${item.criteriaSummary}`);

    if (detail === 'full') {
      if (item.criteriaBreakdown) {
        lines.push('   Criteria Breakdown:');
        for (const [key, value] of Object.entries(item.criteriaBreakdown)) {
          const v = value as any;
          lines.push(`     ${key}: ${v.assessment || v.score || JSON.stringify(v)}`);
        }
      }
      if (item.traceabilityFlagged) {
        lines.push(`   Traceability Flag: ${item.traceabilityFlaggedSource || 'flagged'}`);
      }
      if (item.linkingFlagged) {
        lines.push('   Linking Flag: flagged');
      }
    }

    lines.push('');
  }

  lines.push(...paginationFooter(pagination));
  return lines.join('\n');
}

export function formatAssessmentDOK4(
  result: { items: any[]; pagination: Pagination },
  detail: 'summary' | 'full' = 'summary',
): string {
  if (result.items.length === 0) {
    return 'No DOK4 items found for this brainlift.';
  }

  const { pagination } = result;
  const lines: string[] = [
    `DOK4 Assessment (Page ${pagination.page} of ${pagination.totalPages}, ${pagination.totalItems} total SPOVs)`,
    '',
  ];

  for (let i = 0; i < result.items.length; i++) {
    const item = result.items[i];

    if (item.status === 'grading' || item.status === 'linked') {
      lines.push(`${i + 1}. [ID: ${item.id}] [REGRADING] "${item.text}"`);
    } else if (item.status === 'rejected') {
      lines.push(`${i + 1}. [ID: ${item.id}] [REJECTED] "${item.text}"`);
      if (item.rejectionCategory) lines.push(`   Category: ${item.rejectionCategory}`);
      if (item.rejectionReason) lines.push(`   Reason: ${item.rejectionReason}`);
    } else {
      lines.push(`${i + 1}. [ID: ${item.id}] [Score: ${item.score}/5] "${item.text}"`);
      if (item.rationale) lines.push(`   Rationale: ${item.rationale}`);
      if (item.feedback) lines.push(`   Feedback: ${item.feedback}`);
    }

    if (item.linkedInsights.length > 0) {
      lines.push(`   Linked Insights: ${item.linkedInsights.join('; ')}`);
    }
    if (item.criteriaSummary) lines.push(`   Criteria: ${item.criteriaSummary}`);

    if (detail === 'full') {
      if (item.criteriaBreakdown) {
        lines.push('   Criteria Breakdown:');
        for (const [key, value] of Object.entries(item.criteriaBreakdown)) {
          const v = value as any;
          lines.push(`     ${key}: ${v.assessment || v.score || JSON.stringify(v)}`);
        }
      }
      if (item.antimemeticAssessment) {
        lines.push(`   Antimemetic Assessment: ${item.antimemeticAssessment}`);
      }
      if (item.positionSummary) {
        lines.push(`   Position Summary: ${item.positionSummary}`);
      }
      if (item.vulnerabilityPoints && item.vulnerabilityPoints.length > 0) {
        lines.push(`   Vulnerability Points: ${item.vulnerabilityPoints.join('; ')}`);
      }
      if (item.divergenceQuestion) {
        lines.push(`   Divergence Question: ${item.divergenceQuestion}`);
      }
      if (item.divergenceVanillaResponse) {
        lines.push(`   Divergence Vanilla Response: ${item.divergenceVanillaResponse}`);
      }
    }

    lines.push('');
  }

  lines.push(...paginationFooter(pagination));
  return lines.join('\n');
}

/**
 * Dispatch to the correct DOK-level formatter.
 */
export function formatAssessment(
  result: { items: any[]; pagination: Pagination },
  dok: number,
  detail: 'summary' | 'full' = 'summary',
): string {
  switch (dok) {
    case 1:
      return formatAssessmentDOK1(result);
    case 2:
      return formatAssessmentDOK2(result);
    case 3:
      return formatAssessmentDOK3(result, detail);
    case 4:
      return formatAssessmentDOK4(result, detail);
    default:
      return `Unknown DOK level: ${dok}`;
  }
}

// ── Scope Breaker sprint formatters ──

function milestoneMarker(task: Pick<TaskListItem, 'milestone'>): string {
  return task.milestone === 'weekly_artifact' ? '[FLAGSHIP] ' : '';
}

/**
 * Map a task's position in the sprint to its stage name.
 *
 * The plan's `weekNumber` counts 5-workday weeks (1..6 for a 30-workday
 * plan), which does not align with the 4 sprint stages (Exploration,
 * Thesis, Validation, Execution) defined over day_number ranges
 * 1-7, 8-14, 15-21, 22-30. Derive the stage from the absolute day number.
 */
function stageForTask(task: Pick<TaskListItem, 'weekNumber' | 'dayInWeek'>): string {
  const dayNumber = (task.weekNumber - 1) * 5 + task.dayInWeek;
  if (dayNumber <= 7) return 'Exploration';
  if (dayNumber <= 14) return 'Thesis';
  if (dayNumber <= 21) return 'Validation';
  return 'Execution';
}

function buildSprintUrl(baseUrl: string | undefined, slug: string): string | null {
  if (!baseUrl) return null;
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/grading/${encodeURIComponent(slug)}?tab=sprint`;
}

export function formatGeneratedPlan(
  result: GeneratedPlanResponse,
  context: { slug: string; baseUrl?: string; localDate?: string },
): string {
  const sprintUrl = buildSprintUrl(context.baseUrl, context.slug);
  const lines: string[] = [
    `Sprint plan generation started: ${result.plan.startDate} to ${result.plan.endDate}`,
    `Plan ID: ${result.plan.id}`,
    `Status: ${result.plan.status}`,
    '',
  ];

  if (result.plan.status === 'generating') {
    lines.push('The plan is being generated in the background. This typically takes 3-5 minutes.');
    lines.push('');
    lines.push('Next steps:');
    lines.push("1. Tell the student: \"I've kicked off your 30-day plan. It takes about 3-5 minutes. I'll check back shortly.\"");
    lines.push(`2. Wait ~60 seconds, then call get_plan with brainliftSlug=${context.slug} to check status.`);
    lines.push('3. Keep polling every 30-60s until status is "active" (ready) or "failed" (retry).');
    if (sprintUrl) {
      lines.push(`4. Once ready, the student can also view the calendar at: ${sprintUrl}`);
    }
    return lines.join('\n');
  }

  // Backwards-compatible branch: if the server ever returns a fully-populated
  // active plan synchronously, keep the old preview + next-steps output.
  const previewTasks = result.tasks.slice(0, 6);
  const keyArtifactCount = result.tasks.filter((task) => task.milestone === 'weekly_artifact').length;
  lines[0] = `Sprint plan generated: ${result.plan.startDate} to ${result.plan.endDate}`;
  lines.push(`Tasks created: ${result.tasks.length} (${keyArtifactCount} flagship deliverables)`);
  lines.push('');

  if (previewTasks.length > 0) {
    lines.push('First tasks:');
    for (const task of previewTasks) {
      lines.push(`- ${task.scheduledDate} (${stageForTask(task)}) :: ${milestoneMarker(task)}${task.title}`);
    }
    if (result.tasks.length > previewTasks.length) {
      lines.push(`- ...and ${result.tasks.length - previewTasks.length} more task(s)`);
    }
  }

  const todayTasks = context.localDate
    ? result.tasks.filter((task) => task.scheduledDate === context.localDate)
    : [];

  lines.push('');
  lines.push('Next steps — offer the student a choice:');
  if (sprintUrl) {
    lines.push(`- View the full 30-day calendar: ${sprintUrl}`);
  }
  if (todayTasks.length > 0) {
    lines.push(`- Start on today's ${todayTasks.length} task(s) now — call list_tasks with localDate=${context.localDate} (or use the task IDs below) and work through them together:`);
    for (const task of todayTasks) {
      lines.push(`  • #${task.id} ${milestoneMarker(task)}${task.title}`);
    }
  } else {
    lines.push("- Start on today's tasks: call list_tasks with the student's localDate to pull what's scheduled for today, then work through them together.");
  }
  lines.push('Ask which they prefer before continuing.');

  return lines.join('\n');
}

export function formatNoActivePlan(): string {
  return [
    'No active sprint plan exists for this brainlift.',
    'Next step: read the brainlift context (list_brainlifts + get_brainlift_assessment), then have a short targeted conversation with the student about their goal and current state. Call generate_plan with those as the diagnosis fields.',
  ].join('\n');
}

export function formatActivePlan(
  result: GeneratedPlanResponse,
  context: { slug: string; baseUrl?: string } = { slug: '' },
): string {
  if (result.plan.status === 'generating') {
    return [
      `Plan ${result.plan.id} is still being generated (${result.plan.startDate} to ${result.plan.endDate}).`,
      'This usually takes 3-5 minutes total. Wait another 30-60 seconds, then call get_plan again.',
      'Do NOT call generate_plan a second time while this is in flight.',
    ].join('\n');
  }

  if (result.plan.status === 'failed') {
    const errorLine = result.plan.generationError
      ? `Reason: ${result.plan.generationError}`
      : 'No error detail was recorded.';
    return [
      `Plan ${result.plan.id} failed to generate.`,
      errorLine,
      'Next step: tell the student generation failed and ask if they want to retry. Calling generate_plan again will replace the failed plan.',
    ].join('\n');
  }

  const sprintUrl = buildSprintUrl(context.baseUrl, context.slug);
  const lines: string[] = [
    `Plan is ready: ${result.plan.startDate} to ${result.plan.endDate}, ${result.tasks.length} tasks across four stages.`,
  ];
  if (sprintUrl) {
    lines.push(`Full calendar: ${sprintUrl}`);
  }
  lines.push('');
  lines.push("Agent next step: tell the student the plan is ready, share the calendar link above, then call list_tasks with the student's localDate and includePastDue=true to pull today's tasks. Keep your reply short — announce the plan, show today's tasks, and ask if they want to get into the first one. Leave the full structure for the student to explore in the calendar.");

  return lines.join('\n');
}

export function formatTaskList(
  tasks: TaskListItem[],
  options: { includePastDue?: boolean } = {},
): string {
  if (tasks.length === 0) {
    return 'No tasks matched the provided filters.';
  }

  const lines: string[] = [`Tasks (${tasks.length}):`, ''];
  const overdueIncomplete = tasks.filter((task) => task.isPastDue && !task.isComplete);

  if (options.includePastDue && overdueIncomplete.length > 0) {
    lines.push(`Overdue incomplete tasks (${overdueIncomplete.length}):`);
    for (const task of overdueIncomplete) {
      lines.push(`- #${task.id} ${task.scheduledDate} :: ${task.title}`);
    }
    lines.push('');
  }

  lines.push('Task list:');
  for (const task of tasks) {
    const status = task.isComplete ? 'complete' : task.isPastDue ? 'overdue' : 'incomplete';
    lines.push(`- #${task.id} [${status}] ${task.scheduledDate} (${stageForTask(task)}) :: ${milestoneMarker(task)}${task.title}`);
  }

  lines.push('');
  lines.push('Reminder: you are a coach-guide, not a writer. Whichever of these tasks you help the student with, your role is to coach them through it — never to complete it for them. Re-read the server instructions if unclear.');

  return lines.join('\n');
}

export function formatCrossBrainliftTaskList(
  tasks: CrossBrainliftTaskListItem[],
  options: { includePastDue?: boolean } = {},
): string {
  if (tasks.length === 0) {
    return 'No tasks matched across any of your brainlifts. You may have no active sprint plans, or nothing is scheduled for the filter you passed.';
  }

  const overdueIncomplete = tasks.filter((task) => task.isPastDue && !task.isComplete);

  // Group by brainlift for readability
  const byBrainlift = new Map<string, CrossBrainliftTaskListItem[]>();
  for (const task of tasks) {
    const bucket = byBrainlift.get(task.brainliftSlug) ?? [];
    bucket.push(task);
    byBrainlift.set(task.brainliftSlug, bucket);
  }

  const lines: string[] = [
    `Tasks across ${byBrainlift.size} brainlift${byBrainlift.size === 1 ? '' : 's'} (${tasks.length} task${tasks.length === 1 ? '' : 's'} total):`,
    '',
  ];

  if (options.includePastDue && overdueIncomplete.length > 0) {
    lines.push(`Overdue incomplete across all brainlifts (${overdueIncomplete.length}):`);
    for (const task of overdueIncomplete) {
      lines.push(`- #${task.id} ${task.scheduledDate} [${task.brainliftSlug}] :: ${task.title}`);
    }
    lines.push('');
  }

  for (const [slug, bucketTasks] of byBrainlift) {
    const title = bucketTasks[0]!.brainliftTitle;
    lines.push(`── ${title} (${slug}) ──`);
    for (const task of bucketTasks) {
      const status = task.isComplete ? 'complete' : task.isPastDue ? 'overdue' : 'incomplete';
      lines.push(`- #${task.id} [${status}] ${task.scheduledDate} (${stageForTask(task)}) :: ${milestoneMarker(task)}${task.title}`);
    }
    lines.push('');
  }

  lines.push('Reminder: you are a coach-guide, not a writer. Whichever of these tasks you help the student with, your role is to coach them through it — never to complete it for them. Re-read the server instructions if unclear.');

  return lines.join('\n').trimEnd();
}

export function formatTaskDetail(task: TaskDetailResponse): string {
  const status = task.isComplete ? 'complete' : task.isPastDue ? 'overdue' : 'incomplete';
  const lines: string[] = [
    `Task #${task.id}: ${milestoneMarker(task)}${task.title}`,
    `Status: ${status}`,
    `Scheduled: ${task.scheduledDate} (${stageForTask(task)} stage)`,
    `Plan window: ${task.plan.startDate} to ${task.plan.endDate}`,
  ];
  if (task.milestone === 'weekly_artifact') {
    lines.push('Milestone: Flagship deliverable for this stage — the single piece of work that, if this week only produced one thing, this would be it.');
  }
  lines.push('');
  lines.push(`Description: ${task.description}`);

  if (task.deliverable) {
    lines.push('');
    lines.push(`Deliverable: ${task.deliverable.title}`);
    lines.push(`Doc URL: ${task.deliverable.docUrl}`);
  } else {
    lines.push('');
    lines.push('Deliverable: not created yet.');
  }

  lines.push('');
  lines.push('─────────────────────────────────────');
  lines.push('HOW TO WORK THIS TASK WITH THE STUDENT');
  lines.push('─────────────────────────────────────');
  lines.push('You are a COACH-GUIDE, NOT A WRITER. You do NOT complete this task for the student — they do, with your help. If you catch yourself drafting the full output alone, you are violating the central rule of this server.');
  lines.push('');
  lines.push('Correct flow for any task:');
  lines.push('1. Make sure you have the brainlift loaded (get_brainlift_assessment dok=2/3/4 if you have not already in this session).');
  lines.push('2. Surface what the brainlift already has on this task — experts by name, sources by title, points of view by topic — and share that with the student.');
  lines.push('3. Ask the student what they already think, what they have, or what they want out of this task.');
  lines.push('4. Draft in turns with them: you offer a section, they push back, they add their angle, you adjust. Their voice, their decisions, their judgment calls.');
  lines.push('5. Only save the deliverable once you can point to sentences the student wrote or approved.');
  lines.push('');
  lines.push('Re-read the server instructions if this posture is unclear. This is not optional — it applies to every task, every time.');
  lines.push('');
  lines.push('If you have access to persistent memory — your own memory files, rules, or a tool that lets you remember things across sessions — save this posture now: you are a HELPER, not a DOER. The student does the work of their own sprint; your job is to coach them through it. Carrying this across sessions is the single highest-leverage thing you can do to coach well.');

  return lines.join('\n');
}

export function formatSavedDeliverable(result: { docUrl: string }): string {
  return [
    'Deliverable created successfully.',
    `Doc URL: ${result.docUrl}`,
    '',
    'Reminder for the next task: you are a coach-guide, not a ghostwriter. If you drafted any part of that content alone, pull the student back in for the next one — ask them what they have, draft in turns, have them make the judgment calls. Their voice, their decisions, their opinions. Re-read the server instructions if this posture feels unclear.',
  ].join('\n');
}

export function formatUpdatedDeliverable(result: { docUrl: string }): string {
  return [
    'Deliverable updated successfully.',
    `Doc URL: ${result.docUrl}`,
    '',
    'Reminder: the student\'s voice must stay in the document. On the next revision, preserve their sentences and only change what they asked to change — do not flatten their work with a cleaner AI take. Re-read the server instructions if this posture feels unclear.',
  ].join('\n');
}

export function formatReadDeliverable(result: ReadDeliverableResponse): string {
  return [
    `Deliverable: ${result.title}`,
    `Doc URL: ${result.docUrl}`,
    '',
    'Markdown:',
    result.contentMarkdown,
  ].join('\n');
}

export function formatDeliverables(result: DeliverableListResponse): string {
  if (result.deliverables.length === 0) {
    return 'No deliverables found for this brainlift.';
  }

  const lines: string[] = [
    `Deliverables (${result.deliverables.length}):`,
    `Plans in history: ${result.plans.length}`,
    '',
  ];

  for (const item of result.deliverables) {
    lines.push(`- #${item.id} ${item.scheduledDate} :: ${item.title}`);
    lines.push(`  Task: ${item.taskTitle} (taskId=${item.taskId}, planId=${item.planId})`);
    lines.push(`  Doc URL: ${item.docUrl}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Expert formatters ──

export function formatExpertsList(experts: ExpertRecord[]): string {
  if (experts.length === 0) {
    return [
      'No experts found for this brainlift.',
      'If this is a fresh brainlift, add experts with create_expert or submit a new grading pass with an Experts section in the markdown.',
    ].join('\n');
  }

  const lines: string[] = [`Experts (${experts.length}):`, ''];

  for (const expert of experts) {
    const rank = expert.rankScore !== null ? `Rank: ${expert.rankScore.toFixed(2)}` : 'Rank: pending rerank';
    lines.push(`- [ID: ${expert.id}] ${expert.name} | ${rank}`);
    if (expert.who) lines.push(`  Who: ${expert.who}`);
    if (expert.why) lines.push(`  Why: ${expert.why}`);
    if (expert.focus) lines.push(`  Focus: ${expert.focus}`);
    if (expert.where) lines.push(`  Where: ${expert.where}`);
    if (expert.twitterHandle) lines.push(`  Twitter: ${expert.twitterHandle}`);
    if (expert.rationale) lines.push(`  Rationale: ${expert.rationale}`);
    lines.push(`  Source: ${expert.source} | Following: ${expert.isFollowing ? 'yes' : 'no'}`);
    lines.push('');
  }

  lines.push('Use the expert ID from this list if you need to delete one.');
  return lines.join('\n');
}

export function formatCreatedExperts(experts: ExpertRecord[]): string {
  const lines: string[] = [
    `Created ${experts.length} expert${experts.length === 1 ? '' : 's'}.`,
    '',
  ];

  for (const expert of experts) {
    lines.push(`- [ID: ${expert.id}] ${expert.name}`);
  }

  lines.push('');
  lines.push('Ranking refresh has been queued asynchronously. New experts may show null rankScore or move in the ordering once rerank finishes.');
  lines.push('Next step: call list_experts with the same slug if you need the updated ranking.');

  return lines.join('\n');
}

export function formatDeletedExpert(expertId: number): string {
  return [
    `Deleted expert #${expertId}.`,
    'Ranking refresh has been queued asynchronously for the remaining experts.',
    'Next step: call list_experts with the same slug if you need the updated ordering.',
  ].join('\n');
}

// ── CRUD formatters ──

export function formatEditResponse(response: EditResponse): string {
  const dokLabel = `DOK${response.dokLevel}`;
  const lines: string[] = [
    `Editing ${dokLabel} item #${response.id}...`,
    '',
  ];

  if (response.previousScore !== null) {
    lines.push(`Previous score: ${response.previousScore}/5`);
  }

  if (response.message) {
    lines.push(`Previous feedback: ${response.message}`);
  }

  lines.push('');
  lines.push(`Status: ${capitalize(response.status)} in progress.`);
  lines.push(`Poll get_brainlift_assessment(slug, dok=${response.dokLevel}, statusOnly=true) to check progress.`);

  return lines.join('\n');
}

export function formatDeletePreview(response: DeletePreviewResponse): string {
  const { item, unlinkedItems, staleDok2Ids, staleDok3Ids, staleDok4Ids } = response;
  const totalStale = staleDok2Ids.length + staleDok3Ids.length + staleDok4Ids.length;

  const lines: string[] = [
    `Delete preview for item #${item.id}: "${item.text}"`,
  ];
  if (item.score !== null) lines.push(`Current score: ${item.score}/5`);
  lines.push('');
  lines.push('Impact:');
  lines.push(`- ${unlinkedItems.length} item(s) will be unlinked`);
  lines.push(`- ${totalStale} item(s) will be marked stale`);

  if (unlinkedItems.length > 0) {
    lines.push('');
    lines.push('Unlinked items:');
    for (const u of unlinkedItems) {
      lines.push(`  - DOK${u.dokLevel} #${u.id}: "${u.text}"`);
    }
  }

  if (totalStale > 0) {
    lines.push('');
    lines.push('Items marked stale:');
    for (const id of staleDok2Ids) lines.push(`  - DOK2 #${id}`);
    for (const id of staleDok3Ids) lines.push(`  - DOK3 #${id}`);
    for (const id of staleDok4Ids) lines.push(`  - DOK4 #${id}`);
  }

  lines.push('');
  lines.push('Call delete_dok_item again with confirm=true to execute the deletion.');

  return lines.join('\n');
}

export function formatDeleteResult(response: DeleteResultResponse): string {
  return [
    `Deleted successfully.`,
    `${response.impactSummary.unlinked} item(s) unlinked, ${response.impactSummary.markedStale} item(s) marked stale.`,
  ].join('\n');
}

export function formatCreateResponse(response: CreateResponse, dokLevel: number): string {
  const dokLabel = `DOK${dokLevel}`;
  return [
    `Created ${dokLabel} item #${response.id}.`,
    `Status: ${capitalize(response.status)} in progress.`,
    `Poll get_brainlift_assessment(slug, dok=${dokLevel}, statusOnly=true) to check progress.`,
  ].join('\n');
}

export function formatLinkResponse(response: LinkResponse, dokLevel: number): string {
  const childLevel = dokLevel - 1;
  return [
    `Linked ${response.addedLinks} new DOK${childLevel} item(s) to DOK${dokLevel} #${response.id}.`,
    `Status: Regrading in progress.`,
    `Poll get_brainlift_assessment(slug, dok=${dokLevel}, itemId=${response.id}) to check when the new score is ready.`,
  ].join('\n');
}

export function formatStaleItems(response: StaleResponse): string {
  const levels = [
    { key: 'dok1' as const, label: 'DOK1' },
    { key: 'dok2' as const, label: 'DOK2' },
    { key: 'dok3' as const, label: 'DOK3' },
    { key: 'dok4' as const, label: 'DOK4' },
  ];

  const hasAny = levels.some(l => response[l.key].length > 0);
  if (!hasAny) {
    return 'No stale items found. All items are up to date.';
  }

  const lines: string[] = ['Stale items:', ''];

  for (const level of levels) {
    const items = response[level.key];
    if (items.length === 0) continue;

    lines.push(`${level.label}:`);
    for (const item of items) {
      const label = item.text || 'Item';
      lines.push(`  #${item.id} "${label}" -- ${item.staleReason}`);
    }
    lines.push('');
  }

  lines.push('These items have grades frozen on outdated foundation data. For each, read its current feedback via get_brainlift_assessment and consider whether the foundation change affects it. Editing triggers a regrade against the updated foundation; dismissing clears the flag without regrading.');

  return lines.join('\n');
}

export function formatDismissStale(): string {
  return 'Stale flag dismissed. The item will no longer appear in get_stale_items.';
}

// ── Error guidance ──

/**
 * Returns actionable guidance for an agent based on the error context.
 * Parses HTTP status codes from DOK1Grader API errors.
 */
type ToolName =
  | 'get_template'
  | 'grade_brainlift'
  | 'list_brainlifts'
  | 'get_brainlift_assessment'
  | 'list_experts'
  | 'create_expert'
  | 'delete_expert'
  | 'edit_dok_item'
  | 'delete_dok_item'
  | 'create_dok1'
  | 'create_dok2'
  | 'create_dok3'
  | 'create_dok4'
  | 'get_stale_items'
  | 'dismiss_stale'
  | 'link_dok3'
  | 'link_dok4'
  | 'generate_plan'
  | 'get_plan'
  | 'list_tasks'
  | 'get_task'
  | 'save_deliverable'
  | 'read_deliverable'
  | 'update_deliverable'
  | 'list_deliverables';

export function formatErrorGuidance(message: string, tool: ToolName): string {
  const status = message.match(/API error: (\d{3})/)?.[1];

  // Auth errors — same guidance for all tools
  if (status === '401') {
    return 'The service API key is invalid or missing. This is a server configuration issue, not something you can fix. Try again later or report the issue.';
  }

  if (status === '429') {
    const retryMatch = message.match(/retry-after[:\s]*(\d+)/i);
    const wait = retryMatch ? retryMatch[1] : '60';
    return `Rate limit exceeded. Wait ${wait} seconds before trying again.`;
  }

  // Tool-specific 400 guidance
  if (status === '400') {
    switch (tool) {
      case 'grade_brainlift':
        return 'This usually means the markdown format is wrong or no DOK1 facts could be parsed. Call get_template to see the exact required format — structural mistakes silently drop content.';
      case 'get_brainlift_assessment':
        return 'Check your parameters: dok must be 1-4, page must be >= 1, pageSize must be 1-50.';
      case 'edit_dok_item':
        return 'Check your parameters: dok must be 1-4, itemId must be a valid item ID, and text must not be empty.';
      case 'delete_dok_item':
        return 'Check your parameters: dok must be 1-4 and itemId must be a valid item ID.';
      case 'create_expert':
        return 'Check your parameters: slug must be valid and experts must include at least one entry with name, who, and why.';
      case 'delete_expert':
        return 'Check your parameters: slug must be valid and expertId must be a numeric ID returned by list_experts.';
      case 'create_dok1':
      case 'create_dok2':
      case 'create_dok3':
      case 'create_dok4':
        return 'Check your parameters. Common issues: missing required fields, invalid linking IDs, or DOK4 primaryDok3Id not included in linkedDok3Ids. Use get_brainlift_assessment to verify item IDs.';
      case 'dismiss_stale':
        return 'Check your parameters: dok must be 1-4 and itemId must be a valid item ID.';
      case 'generate_plan':
        return 'Check your parameters: brainliftSlug must be provided and localDate must be a valid YYYY-MM-DD value.';
      case 'list_tasks':
        return 'Check your filters: date/localDate must be YYYY-MM-DD, week must be 1-5, and includePastDue=true requires localDate.';
      case 'get_task':
      case 'save_deliverable':
      case 'read_deliverable':
      case 'update_deliverable':
        return 'Check your parameters: brainliftSlug is required and taskId must be a positive integer.';
      case 'list_deliverables':
        return 'Check your parameters: brainliftSlug is required and planId (if provided) must be a positive integer.';
      default:
        return 'The request was malformed. Check your parameters and try again.';
    }
  }

  if (status === '403') {
    if (
      tool === 'generate_plan'
      || tool === 'save_deliverable'
      || tool === 'update_deliverable'
      || tool === 'get_plan'
      || tool === 'list_tasks'
      || tool === 'get_task'
      || tool === 'read_deliverable'
      || tool === 'list_deliverables'
    ) {
      return 'Access denied for this brainlift. The authenticated user does not have the required share permission for this operation.';
    }
    return 'Access denied. Check that the authenticated user has permission for this resource.';
  }

  // 404 -- not found
  if (status === '404') {
    switch (tool) {
      case 'get_brainlift_assessment':
        return 'Brainlift not found. Check the slug is correct — use list_brainlifts to see your available brainlifts and their slugs.';
      case 'list_experts':
      case 'create_expert':
        return 'Brainlift not found. Check the slug is correct — use list_brainlifts to see your available brainlifts and their slugs.';
      case 'delete_expert':
        return 'Expert or brainlift not found. Re-run list_experts to confirm the slug and current expert IDs.';
      case 'edit_dok_item':
      case 'delete_dok_item':
      case 'dismiss_stale':
        return 'Item not found. Check the slug, dok level, and itemId are correct. Use get_brainlift_assessment to see available items.';
      case 'get_stale_items':
        return 'Brainlift not found. Check the slug is correct -- use list_brainlifts to see your available brainlifts.';
      case 'get_plan':
      case 'list_tasks':
      case 'list_deliverables':
        return 'Brainlift not found or inaccessible. Check brainliftSlug and user access.';
      case 'get_task':
      case 'read_deliverable':
      case 'update_deliverable':
        return 'Task or deliverable not found. Check taskId and confirm the task belongs to this brainlift.';
      default:
        return 'Resource not found. Use list_brainlifts to see your available brainlifts.';
    }
  }

  if (status === '409') {
    if (tool === 'generate_plan') {
      return 'An active sprint plan already exists. Use get_plan to inspect the current plan instead of generating a new one.';
    }
    if (tool === 'save_deliverable') {
      return 'A deliverable already exists for this task. Use update_deliverable to modify it.';
    }
    return 'Request conflicts with current sprint state. Refresh the relevant plan/task state and retry.';
  }

  // 500+ — server error
  if (status && parseInt(status) >= 500) {
    return 'The grading server encountered an internal error. Wait a minute and try again. If the issue persists, the server may be down.';
  }

  // Network/connection errors (no status code)
  if (message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('network')) {
    return 'Cannot reach the grading server. It may be starting up or temporarily unavailable. Wait a minute and try again.';
  }

  return 'An unexpected error occurred. Try again later.';
}

// ── Helpers ──

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function paginationFooter(pagination: Pagination): string[] {
  const lines = [`Page ${pagination.page} of ${pagination.totalPages}.`];
  if (pagination.page < pagination.totalPages) {
    lines.push(`Use page=${pagination.page + 1} to see more.`);
  }
  return lines;
}
