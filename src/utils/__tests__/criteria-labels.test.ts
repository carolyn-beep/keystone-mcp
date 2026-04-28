import { describe, it, expect } from 'vitest';
import { labelForCriterion, CRITERIA_LABELS_BY_LEVEL } from '../criteria-labels';

describe('labelForCriterion', () => {
  it('labels v2 DOK4 keys with their human-readable name', () => {
    expect(labelForCriterion('S1', 4)).toBe('S1 (Contested)');
    expect(labelForCriterion('S4', 4)).toBe('S4 (Clear Side)');
    expect(labelForCriterion('P1', 4)).toBe('P1 (Punchiness)');
    expect(labelForCriterion('S2', 4)).toBe('S2 (LLM Divergence)');
    expect(labelForCriterion('S3', 4)).toBe('S3 (Grounded & Traceable)');
    expect(labelForCriterion('O2', 4)).toBe('O2 (Distinct Voice)');
  });

  it('annotates legacy DOK4 keys with [legacy]', () => {
    expect(labelForCriterion('S5', 4)).toBe('S5 (Cross-Domain Synthesis [legacy])');
    expect(labelForCriterion('O1', 4)).toBe('O1 (Causal Reasoning [legacy])');
  });

  it('labels DOK3 keys', () => {
    expect(labelForCriterion('V1', 3)).toBe('V1 (Framework Identifiable)');
    expect(labelForCriterion('V2', 3)).toBe('V2 (Framework Distinct)');
    expect(labelForCriterion('V3', 3)).toBe('V3 (Framework Domain-Specific)');
    expect(labelForCriterion('C1', 3)).toBe('C1 (Evidence Supports)');
    expect(labelForCriterion('C2', 3)).toBe('C2 (Internally Consistent)');
    expect(labelForCriterion('P2', 3)).toBe('P2 (Advances Purpose)');
  });

  it('disambiguates the P1 collision: DOK3 P1 and DOK4 P1 render different names', () => {
    const dok3 = labelForCriterion('P1', 3);
    const dok4 = labelForCriterion('P1', 4);
    expect(dok3).toBe('P1 (Adds Explanatory Power)');
    expect(dok4).toBe('P1 (Punchiness)');
    expect(dok3).not.toBe(dok4);
  });

  it('returns the raw key for unknown keys', () => {
    expect(labelForCriterion('UNKNOWN', 4)).toBe('UNKNOWN');
    expect(labelForCriterion('Z9', 4)).toBe('Z9');
  });

  it('returns the raw key when querying a key at the wrong level', () => {
    // V1 lives only under level 3; DOK4 lookup falls through to raw key.
    expect(labelForCriterion('V1', 4)).toBe('V1');
    // S1 lives only under level 4; DOK3 lookup falls through to raw key.
    expect(labelForCriterion('S1', 3)).toBe('S1');
  });

  it('returns empty string for empty input', () => {
    expect(labelForCriterion('', 4)).toBe('');
  });

  it('exposes CRITERIA_LABELS_BY_LEVEL for inspection', () => {
    expect(CRITERIA_LABELS_BY_LEVEL[4].S1.name).toBe('Contested');
    expect(CRITERIA_LABELS_BY_LEVEL[4].S5.isLegacy).toBe(true);
    expect(CRITERIA_LABELS_BY_LEVEL[4].S1.isLegacy).toBeUndefined();
    expect(CRITERIA_LABELS_BY_LEVEL[3].P1.name).toBe('Adds Explanatory Power');
    expect(CRITERIA_LABELS_BY_LEVEL[4].P1.name).toBe('Punchiness');
  });
});
