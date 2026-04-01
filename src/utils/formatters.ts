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
  AssessmentResponse,
  Pagination,
} from './dok1grader-client';

// ── Grade response ──

export function formatGradeResponse(result: GradeResponse): string {
  return [
    `Brainlift created with slug: ${result.slug}`,
    '',
    'Grading has started. Use get_brainlift_assessment with this slug to check results.',
    `First results should be available in ~${result.retryAfter} seconds.`,
    '',
    'Recommended workflow:',
    '1. Call get_brainlift_assessment with statusOnly=true to check progress',
    '2. Wait ~30 seconds between polls',
    '3. Once complete, call with dok=1 through dok=4 to read per-level feedback',
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

  if (!isComplete && result.retryAfter > 0) {
    lines.push('');
    lines.push(`Check again in ${result.retryAfter} seconds.`);
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
    lines.push(`${i + 1}. [Score: ${item.score}/5] "${item.fact}"`);
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
    lines.push(`${i + 1}. [Grade: ${item.grade}/5] ${item.displayTitle}`);
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
    lines.push(`${i + 1}. [Score: ${item.score}/5] "${item.text}"`);
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

    if (item.status === 'rejected') {
      lines.push(`${i + 1}. [REJECTED] "${item.text}"`);
      if (item.rejectionCategory) lines.push(`   Category: ${item.rejectionCategory}`);
      if (item.rejectionReason) lines.push(`   Reason: ${item.rejectionReason}`);
    } else {
      lines.push(`${i + 1}. [Score: ${item.score}/5] "${item.text}"`);
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
