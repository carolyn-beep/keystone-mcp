/**
 * Tests for CRUD response formatters.
 *
 * Verifies human-readable text output for edit, delete, create,
 * stale items, and error guidance for new tool names.
 */

import { describe, it, expect } from 'vitest';
import {
  formatExpertsList,
  formatCreatedExperts,
  formatDeletedExpert,
  formatEditResponse,
  formatDeletePreview,
  formatDeleteResult,
  formatCreateResponse,
  formatStaleItems,
  formatDismissStale,
  formatErrorGuidance,
  formatAssessmentDOK2,
  formatAssessmentDOK3,
  formatAssessmentDOK4,
} from './formatters';
import { BRAINLIFT_MCP_INSTRUCTIONS } from '../instructions/brainlift';

describe('formatEditResponse', () => {
  it('includes previous score, message, and polling instructions', () => {
    const result = formatEditResponse({
      id: 42, dokLevel: 1, status: 'regrading', previousScore: 3, message: 'Consider citing the specific study',
    });

    expect(result).toContain('42');
    expect(result).toContain('DOK1');
    expect(result).toContain('3');
    expect(result).toContain('Regrading');
    expect(result).toContain('Consider citing the specific study');
    expect(result).toContain('get_brainlift_assessment');
  });

  it('handles null previous score', () => {
    const result = formatEditResponse({
      id: 10, dokLevel: 2, status: 'regrading', previousScore: null, message: '',
    });

    expect(result).toContain('10');
    expect(result).toContain('DOK2');
    expect(result).not.toContain('null');
  });
});

describe('formatDeletePreview', () => {
  it('includes item details, impact, and confirmation instructions', () => {
    const result = formatDeletePreview({
      item: { id: 42, text: 'Water boils at 100C', score: 4 },
      unlinkedItems: [
        { id: 10, dokLevel: 2, text: 'Summary A' },
        { id: 15, dokLevel: 2, text: 'Summary B' },
      ],
      staleDok2Ids: [10, 15],
      staleDok3Ids: [30],
      staleDok4Ids: [],
    });

    expect(result).toContain('42');
    expect(result).toContain('Water boils at 100C');
    expect(result).toContain('2');  // unlinked
    expect(result).toContain('3');  // markedStale
    expect(result).toContain('DOK2 #10');
    expect(result).toContain('confirm=true');
  });
});

describe('formatDeleteResult', () => {
  it('confirms deletion with impact summary', () => {
    const result = formatDeleteResult({
      deleted: true, impactSummary: { unlinked: 2, markedStale: 3 },
    });

    expect(result).toContain('Deleted');
    expect(result).toContain('2');
    expect(result).toContain('3');
  });
});

describe('formatCreateResponse', () => {
  it('includes item ID, DOK level, and polling instructions', () => {
    const result = formatCreateResponse({ id: 88, status: 'grading' }, 3);

    expect(result).toContain('88');
    expect(result).toContain('DOK3');
    expect(result).toContain('Grading');
    expect(result).toContain('get_brainlift_assessment');
  });
});

describe('formatStaleItems', () => {
  it('groups items by DOK level with reasons', () => {
    const result = formatStaleItems({
      dok1: [],
      dok2: [{ id: 10, text: 'Summary A', staleReason: 'DOK1 #42 was edited' }],
      dok3: [{ id: 30, text: 'Insight X', staleReason: 'linked DOK2 #10 is stale' }],
      dok4: [],
    });

    expect(result).toContain('DOK2');
    expect(result).toContain('#10');
    expect(result).toContain('DOK1 #42 was edited');
    expect(result).toContain('DOK3');
    expect(result).toContain('#30');
    expect(result).toContain('linked DOK2 #10 is stale');
  });

  it('returns "no stale items" for empty response', () => {
    const result = formatStaleItems({
      dok1: [], dok2: [], dok3: [], dok4: [],
    });

    expect(result.toLowerCase()).toContain('no stale items');
  });
});

describe('formatDismissStale', () => {
  it('confirms dismissal', () => {
    const result = formatDismissStale();
    expect(result.toLowerCase()).toContain('dismiss');
  });
});

describe('expert formatters', () => {
  it('formats expert list with structured fields and rank guidance', () => {
    const result = formatExpertsList([
      {
        id: 12,
        name: 'Andrew Huberman',
        who: 'Stanford neuroscientist',
        why: 'Explains the sleep mechanisms',
        focus: 'sleep',
        where: '@hubermanlab',
        rankScore: 4.25,
        rationale: 'Highly relevant to the topic',
        twitterHandle: 'hubermanlab',
        source: 'manual',
        isFollowing: false,
      },
    ]);

    expect(result).toContain('Andrew Huberman');
    expect(result).toContain('Stanford neuroscientist');
    expect(result).toContain('4.25');
    expect(result).toContain('sleep');
    expect(result).toContain('Use the expert ID');
  });

  it('handles an empty expert list', () => {
    const result = formatExpertsList([]);
    expect(result).toContain('No experts found');
    expect(result).toContain('create_expert');
  });

  it('formats created experts with async rerank guidance', () => {
    const result = formatCreatedExperts([
      {
        id: 13,
        name: 'Cal Newport',
        who: 'Computer science professor',
        why: 'Frames attention and focus tradeoffs',
        focus: null,
        where: '@CalNewportMedia',
        rankScore: null,
        rationale: null,
        twitterHandle: 'CalNewportMedia',
        source: 'manual',
        isFollowing: false,
      },
    ]);

    expect(result).toContain('Created 1 expert');
    expect(result).toContain('Cal Newport');
    expect(result).toContain('Ranking refresh has been queued asynchronously');
    expect(result).toContain('list_experts');
  });

  it('formats deleted expert confirmation with follow-up guidance', () => {
    const result = formatDeletedExpert(44);
    expect(result).toContain('44');
    expect(result).toContain('list_experts');
    expect(result).toContain('queued asynchronously');
  });
});

describe('formatErrorGuidance for CRUD tools', () => {
  it('accepts edit_dok_item tool name', () => {
    const result = formatErrorGuidance('API error: 400 - Invalid text', 'edit_dok_item');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('accepts delete_dok_item tool name', () => {
    const result = formatErrorGuidance('API error: 404 - Not found', 'delete_dok_item');
    expect(result).toContain('not found');
  });

  it('accepts create tool names', () => {
    const result = formatErrorGuidance('API error: 400 - Bad request', 'create_dok1');
    expect(result).toBeTruthy();
  });

  it('returns rate limit guidance for 429', () => {
    const result = formatErrorGuidance('API error: 429 - retry-after: 30', 'edit_dok_item');
    expect(result).toContain('30');
  });

  it('accepts get_stale_items and dismiss_stale tool names', () => {
    expect(formatErrorGuidance('API error: 404', 'get_stale_items')).toBeTruthy();
    expect(formatErrorGuidance('API error: 400', 'dismiss_stale')).toBeTruthy();
  });

  it('accepts expert tool names', () => {
    expect(formatErrorGuidance('API error: 400 - Bad request', 'create_expert')).toContain('name, who, and why');
    expect(formatErrorGuidance('API error: 404 - Not found', 'delete_expert')).toContain('list_experts');
    expect(formatErrorGuidance('API error: 404 - Not found', 'list_experts')).toContain('Brainlift not found');
  });
});

// ── AI Writing Signal (Spec 04) ──

describe('AI Writing Signal in assessment formatters', () => {
  const pagination = { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 };

  function dok2Item(signal: string | null) {
    return {
      id: 1,
      grade: 4,
      displayTitle: 'Summary X',
      sourceName: 'Source A',
      points: ['point one', 'point two'],
      diagnosis: null,
      feedback: null,
      failReason: null,
      ai_writing_signal: signal,
    };
  }

  function dok3Item(signal: string | null) {
    return {
      id: 7,
      score: 4,
      text: 'An insight',
      linkedSources: ['Source A'],
      rationale: 'why',
      feedback: 'fb',
      foundationIntegrityIndex: null,
      criteriaSummary: null,
      ai_writing_signal: signal,
    };
  }

  function dok4Item(signal: string | null) {
    return {
      id: 11,
      score: 4,
      status: 'graded',
      text: 'A SPOV',
      linkedInsights: ['#7'],
      rationale: 'why',
      feedback: 'fb',
      criteriaSummary: null,
      ai_writing_signal: signal,
    };
  }

  describe('formatAssessmentDOK2', () => {
    it("renders 'AI Writing Signal: human' for human", () => {
      const out = formatAssessmentDOK2({ items: [dok2Item('human')], pagination });
      expect(out).toContain('AI Writing Signal: human');
    });

    it("renders 'AI Writing Signal: ai-assisted' for ai-assisted", () => {
      const out = formatAssessmentDOK2({ items: [dok2Item('ai-assisted')], pagination });
      expect(out).toContain('AI Writing Signal: ai-assisted');
    });

    it("renders 'AI Writing Signal: mixed' for mixed", () => {
      const out = formatAssessmentDOK2({ items: [dok2Item('mixed')], pagination });
      expect(out).toContain('AI Writing Signal: mixed');
    });

    it("renders 'AI Writing Signal: ai' for ai", () => {
      const out = formatAssessmentDOK2({ items: [dok2Item('ai')], pagination });
      expect(out).toContain('AI Writing Signal: ai');
    });

    it("renders 'not analyzed' for null", () => {
      const out = formatAssessmentDOK2({ items: [dok2Item(null)], pagination });
      expect(out).toContain('AI Writing Signal: not analyzed');
    });

    it('attaches one line per item across a mixed batch', () => {
      const out = formatAssessmentDOK2({
        items: [dok2Item('human'), dok2Item('ai'), dok2Item(null)],
        pagination: { ...pagination, totalItems: 3 },
      });
      // Three independent lines, each correctly attached to its item.
      expect(out.match(/AI Writing Signal:/g)?.length).toBe(3);
      expect(out).toContain('AI Writing Signal: human');
      expect(out).toContain('AI Writing Signal: ai');
      expect(out).toContain('AI Writing Signal: not analyzed');
    });
  });

  describe('formatAssessmentDOK3', () => {
    it('renders the line in summary mode', () => {
      const out = formatAssessmentDOK3({ items: [dok3Item('ai-assisted')], pagination });
      expect(out).toContain('AI Writing Signal: ai-assisted');
    });

    it('renders the line in full mode', () => {
      const out = formatAssessmentDOK3({ items: [dok3Item('mixed')], pagination }, 'full');
      expect(out).toContain('AI Writing Signal: mixed');
    });

    it("renders 'not analyzed' for null in summary mode", () => {
      const out = formatAssessmentDOK3({ items: [dok3Item(null)], pagination });
      expect(out).toContain('AI Writing Signal: not analyzed');
    });

    it("renders 'not analyzed' for null in full mode", () => {
      const out = formatAssessmentDOK3({ items: [dok3Item(null)], pagination }, 'full');
      expect(out).toContain('AI Writing Signal: not analyzed');
    });
  });

  describe('formatAssessmentDOK4', () => {
    it('renders the line in summary mode', () => {
      const out = formatAssessmentDOK4({ items: [dok4Item('human')], pagination });
      expect(out).toContain('AI Writing Signal: human');
    });

    it('renders the line in full mode', () => {
      const out = formatAssessmentDOK4({ items: [dok4Item('ai')], pagination }, 'full');
      expect(out).toContain('AI Writing Signal: ai');
    });

    it("renders 'not analyzed' for null", () => {
      const out = formatAssessmentDOK4({ items: [dok4Item(null)], pagination });
      expect(out).toContain('AI Writing Signal: not analyzed');
    });
  });

  describe('negative assertion: external label is "AI Writing Signal", never "Pangram"', () => {
    it('does not leak the internal codename in DOK2 formatter output', () => {
      const out = formatAssessmentDOK2({ items: [dok2Item('human')], pagination });
      expect(out).not.toContain('Pangram');
      expect(out).not.toContain('pangram');
    });

    it('does not leak the internal codename in DOK3 formatter output (summary or full)', () => {
      const summary = formatAssessmentDOK3({ items: [dok3Item('human')], pagination });
      const full = formatAssessmentDOK3({ items: [dok3Item('human')], pagination }, 'full');
      expect(summary).not.toContain('Pangram');
      expect(full).not.toContain('Pangram');
    });

    it('does not leak the internal codename in DOK4 formatter output', () => {
      const out = formatAssessmentDOK4({ items: [dok4Item('human')], pagination });
      expect(out).not.toContain('Pangram');
    });
  });

  describe('renders an unknown signal value defensively', () => {
    // The transform layer normally collapses unknown values to null before
    // they reach the formatter. This guards against a future code path that
    // hands an item to the formatter without going through the client.
    it("falls back to 'not analyzed' for an unknown label value", () => {
      const out = formatAssessmentDOK2({
        items: [dok2Item('hyper-synthetic')],
        pagination,
      });
      expect(out).toContain('AI Writing Signal: not analyzed');
    });
  });
});

describe('BRAINLIFT_MCP_INSTRUCTIONS: AI Writing Signal framing (Spec 04)', () => {
  it('mentions the ai_writing_signal field by name', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).toContain('ai_writing_signal');
  });

  it('frames the signal as informational only', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).toContain('informational only');
  });

  it('mentions reviewers may apply their own policies off-platform', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).toContain('off-platform');
  });

  it('does not use the internal codename "Pangram"', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).not.toContain('Pangram');
    expect(BRAINLIFT_MCP_INSTRUCTIONS).not.toContain('pangram');
  });

  it('does not contain EM dashes (U+2014)', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).not.toContain('—');
  });
});
