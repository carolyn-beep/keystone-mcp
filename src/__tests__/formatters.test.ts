/**
 * Tests for FR2: Response formatters
 *
 * Tests all format functions produce human-readable text.
 * No mocks needed -- pure functions.
 */

import { describe, it, expect } from 'vitest';
import {
  formatGradeResponse,
  formatBrainliftList,
  formatStatus,
  formatAssessmentDOK1,
  formatAssessmentDOK2,
  formatAssessmentDOK3,
  formatAssessmentDOK4,
  formatAssessment,
} from '../utils/formatters';

describe('formatGradeResponse', () => {
  it('returns slug and guidance text', () => {
    const result = formatGradeResponse({
      slug: 'my-brainlift',
      brainliftId: 1,
      status: 'grading',
      retryAfter: 30,
    });

    expect(result).toContain('my-brainlift');
    expect(result).toContain('get_brainlift_assessment');
    expect(result).toContain('30');
  });
});

describe('formatBrainliftList', () => {
  it('formats list with items', () => {
    const result = formatBrainliftList({
      brainlifts: [
        { slug: 'nil-athletics', title: 'NIL in College Athletics', status: 'complete', score: 3.8, createdAt: '2026-03-31T00:00:00Z' },
        { slug: 'ai-ethics', title: 'AI Ethics Framework', status: 'grading', score: null, createdAt: '2026-03-31T12:00:00Z' },
      ],
      pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
    });

    expect(result).toContain('NIL in College Athletics');
    expect(result).toContain('nil-athletics');
    expect(result).toContain('3.8');
    expect(result).toContain('Complete');
    expect(result).toContain('AI Ethics Framework');
    expect(result).toContain('Grading');
    expect(result).toContain('Page 1 of 1');
  });

  it('shows pagination hint when more pages', () => {
    const result = formatBrainliftList({
      brainlifts: [
        { slug: 'test', title: 'Test', status: 'complete', score: 4.0, createdAt: '2026-03-31T00:00:00Z' },
      ],
      pagination: { page: 1, pageSize: 1, totalItems: 3, totalPages: 3 },
    });

    expect(result).toContain('page=2');
  });

  it('returns empty message for no brainlifts', () => {
    const result = formatBrainliftList({
      brainlifts: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });

    expect(result).toMatch(/no brainlifts/i);
  });
});

describe('formatStatus', () => {
  it('formats in-progress status with progress and retry hint', () => {
    const result = formatStatus({
      slug: 'my-slug',
      title: 'My Brainlift',
      status: 'grading',
      progress: {
        dok1: { total: 42, graded: 35, pending: 7, error: 0 },
        dok2: { total: 8, graded: 8, pending: 0, error: 0 },
        dok3: { total: 5, graded: 2, pending: 3, error: 0 },
        dok4: { total: 3, graded: 0, pending: 3, error: 0 },
      },
      score: { overall: null, dok1Mean: 3.8, dok2Mean: 4.1, dok3Mean: null, dok4Mean: null },
      retryAfter: 15,
      createdAt: '2026-03-31T00:00:00Z',
    });

    expect(result).toContain('My Brainlift');
    expect(result).toContain('Grading in progress');
    expect(result).toContain('35/42');
    expect(result).toContain('8/8');
    expect(result).toContain('3.8');
    expect(result).toContain('4.1');
    expect(result).toContain('15 seconds');
  });

  it('formats complete status without retry hint', () => {
    const result = formatStatus({
      slug: 'done-slug',
      title: 'Done Brainlift',
      status: 'complete',
      progress: {
        dok1: { total: 10, graded: 10, pending: 0, error: 0 },
        dok2: { total: 5, graded: 5, pending: 0, error: 0 },
        dok3: { total: 3, graded: 3, pending: 0, error: 0 },
        dok4: { total: 2, graded: 2, pending: 0, error: 0 },
      },
      score: { overall: 4.2, dok1Mean: 4.0, dok2Mean: 4.5, dok3Mean: 4.1, dok4Mean: 4.2 },
      retryAfter: 0,
      createdAt: '2026-03-31T00:00:00Z',
    });

    expect(result).toContain('Complete');
    expect(result).toContain('4.2');
    expect(result).not.toContain('Check again');
  });
});

describe('formatAssessmentDOK1', () => {
  it('formats facts with score, source, and note', () => {
    const result = formatAssessmentDOK1({
      items: [
        { id: 1, fact: 'The Supreme Court ruled unanimously in Alston v. NCAA', source: 'NCAA Policy', sourceUrl: null, category: 'legal', score: 4, note: 'Verified against source.' },
        { id: 2, fact: 'Over 30 states enacted NIL legislation', source: 'State Records', sourceUrl: null, category: 'policy', score: 3, note: 'Count varies by source.' },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
    });

    expect(result).toContain('[Score: 4/5]');
    expect(result).toContain('Alston v. NCAA');
    expect(result).toContain('NCAA Policy');
    expect(result).toContain('Verified against source');
    expect(result).toContain('[Score: 3/5]');
    expect(result).toContain('Page 1 of 1');
  });

  it('returns empty message for no items', () => {
    const result = formatAssessmentDOK1({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    expect(result).toMatch(/no.*items/i);
  });
});

describe('formatAssessmentDOK2', () => {
  it('formats summaries with grade, diagnosis, feedback', () => {
    const result = formatAssessmentDOK2({
      items: [
        {
          id: 1, displayTitle: 'NCAA Guidelines Summary', sourceName: 'NCAA Policy',
          points: ['Point A', 'Point B'], grade: 4, diagnosis: 'Strong synthesis',
          feedback: 'Good source engagement', failReason: null,
        },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });

    expect(result).toContain('NCAA Guidelines Summary');
    expect(result).toContain('[Grade: 4/5]');
    expect(result).toContain('Strong synthesis');
    expect(result).toContain('Good source engagement');
  });

  it('shows fail reason when present', () => {
    const result = formatAssessmentDOK2({
      items: [
        {
          id: 1, displayTitle: 'Bad Summary', sourceName: 'Source',
          points: [], grade: 1, diagnosis: 'Copy-paste', feedback: null,
          failReason: 'Direct copy from source',
        },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });

    expect(result).toContain('Direct copy from source');
  });
});

describe('formatAssessmentDOK3', () => {
  it('formats insights with score, rationale, linked sources (summary)', () => {
    const result = formatAssessmentDOK3(
      {
        items: [
          {
            id: 1, text: 'Cross-source insight', status: 'graded', score: 4,
            rationale: 'Strong analytical claim', feedback: 'Well connected',
            foundationIntegrityIndex: 0.9, linkedSources: ['Source A', 'Source B'],
            criteriaSummary: 'analytical_depth: Strong',
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'summary',
    );

    expect(result).toContain('[Score: 4/5]');
    expect(result).toContain('Cross-source insight');
    expect(result).toContain('Source A');
    expect(result).toContain('Strong analytical claim');
  });

  it('includes full detail fields', () => {
    const result = formatAssessmentDOK3(
      {
        items: [
          {
            id: 1, text: 'Insight', status: 'graded', score: 3,
            rationale: 'OK', feedback: 'Needs work',
            foundationIntegrityIndex: 0.7, linkedSources: ['S1'],
            criteriaSummary: 'depth: OK',
            criteriaBreakdown: { analytical_depth: { assessment: 'Moderate', score: 3 } },
            traceabilityFlagged: true,
            traceabilityFlaggedSource: 'Source A',
            linkingFlagged: false,
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'full',
    );

    expect(result).toContain('Criteria Breakdown');
    expect(result).toContain('analytical_depth');
    expect(result).toContain('Traceability Flag');
  });
});

describe('formatAssessmentDOK4', () => {
  it('formats SPOVs with score and linked insights', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'A spiky point of view', status: 'graded', score: 4,
            rationale: 'Original position', feedback: 'Well defended',
            rejectionReason: null, rejectionCategory: null,
            linkedInsights: ['Insight about X...'], criteriaSummary: 'spikiness: High',
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'summary',
    );

    expect(result).toContain('[Score: 4/5]');
    expect(result).toContain('A spiky point of view');
    expect(result).toContain('Insight about X');
  });

  it('shows rejection info for rejected SPOVs', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'Not a real position', status: 'rejected', score: 0,
            rationale: null, feedback: null,
            rejectionReason: 'This is an observation, not a position',
            rejectionCategory: 'observation',
            linkedInsights: [], criteriaSummary: null,
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'summary',
    );

    expect(result).toContain('REJECTED');
    expect(result).toContain('observation');
    expect(result).toContain('not a position');
  });

  it('renders v2 criteria breakdown with labels and evidence lines', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'SPOV', status: 'graded', score: 5,
            rationale: 'Excellent', feedback: 'Original',
            rejectionReason: null, rejectionCategory: null,
            linkedInsights: ['I1'],
            criteriaSummary: 'S1 (Contested): strong; P1 (Punchiness): weak',
            criteriaBreakdown: {
              S1: { assessment: 'strong', evidence: 'Practitioners take genuinely different sides.' },
              S4: { assessment: 'strong', evidence: 'Names a clear side.' },
              P1: { assessment: 'weak', evidence: 'Two sentences with parenthetical hedging.' },
              S2: { assessment: 'strong', evidence: 'Commits where vanilla LLM hedges.' },
              S3: { assessment: 'strong', evidence: 'Cites three sources directly.' },
              O2: { assessment: 'strong', evidence: 'Voice is recognizably the author.' },
            },
            antimemeticAssessment: 'Hard to forget',
            positionSummary: 'A bold claim',
            divergenceQuestion: 'What would mainstream say?',
            divergenceVanillaResponse: 'Mainstream would hedge.',
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'full',
    );

    expect(result).toContain('Criteria Breakdown');
    expect(result).toContain('S1 (Contested): strong');
    expect(result).toContain('P1 (Punchiness): weak');
    expect(result).toContain('S2 (LLM Divergence): strong');
    expect(result).toContain('S3 (Grounded & Traceable): strong');
    expect(result).toContain('O2 (Distinct Voice): strong');
    // Evidence rendered on a second indented line beneath each row.
    expect(result).toContain('Practitioners take genuinely different sides.');
    expect(result).toContain('Two sentences with parenthetical hedging.');
    expect(result).toContain('Antimemetic Assessment');
    expect(result).toContain('Position Summary');
    expect(result).toContain('Divergence');
  });

  it('does not render Vulnerability Points even when payload includes the field', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'SPOV', status: 'graded', score: 5,
            rationale: 'r', feedback: 'f',
            rejectionReason: null, rejectionCategory: null,
            linkedInsights: [],
            criteriaSummary: null,
            criteriaBreakdown: { S1: { assessment: 'strong', evidence: 'e' } },
            // Legacy field still on the wire pre-spec-07. Formatter must ignore it.
            vulnerabilityPoints: ['old data point'],
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'full',
    );

    expect(result).not.toContain('Vulnerability Points');
    expect(result).not.toContain('old data point');
  });

  it('annotates legacy criteria keys with [legacy]', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'SPOV', status: 'graded', score: 4,
            rationale: 'r', feedback: 'f',
            rejectionReason: null, rejectionCategory: null,
            linkedInsights: [],
            criteriaSummary: null,
            criteriaBreakdown: {
              S5: { assessment: 'partial', evidence: 'Synthesizes two domains.' },
              O1: { assessment: 'weak', evidence: 'Causal chain not made explicit.' },
            },
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'full',
    );

    expect(result).toContain('S5 (Cross-Domain Synthesis [legacy]): partial');
    expect(result).toContain('O1 (Causal Reasoning [legacy]): weak');
  });

  it('appends S2 interpretive nudge when both divergence fields are present', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'SPOV', status: 'graded', score: 5,
            rationale: 'r', feedback: 'f',
            rejectionReason: null, rejectionCategory: null,
            linkedInsights: [],
            criteriaSummary: null,
            divergenceQuestion: 'Q',
            divergenceVanillaResponse: 'A',
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'full',
    );

    expect(result).toContain('S2 (LLM Divergence) measures whether the SPOV diverges');
    expect(result).toContain('Stylistic difference alone is not enough.');
  });

  it('omits S2 nudge when only divergenceQuestion is present', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'SPOV', status: 'graded', score: 5,
            rationale: 'r', feedback: 'f',
            rejectionReason: null, rejectionCategory: null,
            linkedInsights: [],
            criteriaSummary: null,
            divergenceQuestion: 'Q',
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'full',
    );

    expect(result).not.toContain('S2 (LLM Divergence) measures');
  });

  it('omits S2 nudge when only divergenceVanillaResponse is present', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'SPOV', status: 'graded', score: 5,
            rationale: 'r', feedback: 'f',
            rejectionReason: null, rejectionCategory: null,
            linkedInsights: [],
            criteriaSummary: null,
            divergenceVanillaResponse: 'A',
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'full',
    );

    expect(result).not.toContain('S2 (LLM Divergence) measures');
  });

  it('omits S2 nudge in summary detail mode even when both fields present', () => {
    const result = formatAssessmentDOK4(
      {
        items: [
          {
            id: 1, text: 'SPOV', status: 'graded', score: 5,
            rationale: 'r', feedback: 'f',
            rejectionReason: null, rejectionCategory: null,
            linkedInsights: [],
            criteriaSummary: null,
            divergenceQuestion: 'Q',
            divergenceVanillaResponse: 'A',
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      'summary',
    );

    expect(result).not.toContain('S2 (LLM Divergence) measures');
  });
});

describe('formatAssessment', () => {
  it('dispatches to DOK1 formatter', () => {
    const result = formatAssessment(
      {
        items: [{ id: 1, fact: 'A fact', source: 'S', sourceUrl: null, category: 'c', score: 4, note: 'N' }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      1,
      'summary',
    );

    expect(result).toContain('[Score: 4/5]');
    expect(result).toContain('A fact');
  });

  it('dispatches to DOK2 formatter', () => {
    const result = formatAssessment(
      {
        items: [{ id: 1, displayTitle: 'T', sourceName: 'S', points: [], grade: 3, diagnosis: 'D', feedback: 'F', failReason: null }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      2,
      'summary',
    );

    expect(result).toContain('[Grade: 3/5]');
  });

  it('dispatches to DOK3 formatter', () => {
    const result = formatAssessment(
      {
        items: [{ id: 1, text: 'Insight', status: 'graded', score: 4, rationale: 'R', feedback: 'F', foundationIntegrityIndex: 0.8, linkedSources: [], criteriaSummary: null }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      3,
      'summary',
    );

    expect(result).toContain('[Score: 4/5]');
    expect(result).toContain('Insight');
  });

  it('dispatches to DOK4 formatter', () => {
    const result = formatAssessment(
      {
        items: [{ id: 1, text: 'SPOV', status: 'graded', score: 5, rationale: 'R', feedback: 'F', rejectionReason: null, rejectionCategory: null, linkedInsights: [], criteriaSummary: null }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
      4,
      'summary',
    );

    expect(result).toContain('[Score: 5/5]');
    expect(result).toContain('SPOV');
  });

  it('handles empty items', () => {
    const result = formatAssessment(
      { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } },
      1,
      'summary',
    );

    expect(result).toMatch(/no.*items/i);
  });
});
