/**
 * Human-readable names for DOK3 and DOK4 criterion codes.
 *
 * Mirrors `server/lib/criteria-labels.ts` in DOK1GraderV3. Two repos = two
 * copies by design; keep them in sync manually when keys are added or renamed.
 *
 * Lookup is keyed on (dokLevel, criterion code). DOK3 and DOK4 use
 * overlapping keys (notably both register P1: DOK3 P1 = "Adds Explanatory
 * Power", DOK4 P1 = "Punchiness"), so a flat single-map lookup would mislabel
 * half the SPOVs. Always pass dokLevel.
 *
 * Legacy DOK4 v1 criteria (S5, O1) are kept under level 4 so historical SPOVs
 * continue to render. They are annotated `[legacy]` so agents do not waste
 * cycles trying to improve scores against a removed criterion.
 */

export interface CriterionLabel {
  name: string;
  isLegacy?: boolean;
}

export type LabelDokLevel = 3 | 4;

export const CRITERIA_LABELS_BY_LEVEL: Record<LabelDokLevel, Record<string, CriterionLabel>> = {
  3: {
    // Framework Visibility
    V1: { name: 'Framework Identifiable' },
    V2: { name: 'Framework Distinct' },
    V3: { name: 'Framework Domain-Specific' },
    // Framework Coherence
    C1: { name: 'Evidence Supports' },
    C2: { name: 'Internally Consistent' },
    // Framework Productivity
    P1: { name: 'Adds Explanatory Power' },
    P2: { name: 'Advances Purpose' },
  },
  4: {
    // v2 Spikiness (form)
    S1: { name: 'Contested' },
    S4: { name: 'Clear Side' },
    P1: { name: 'Punchiness' },
    // v2 Ownership (authenticity)
    S2: { name: 'LLM Divergence' },
    S3: { name: 'Grounded & Traceable' },
    O2: { name: 'Distinct Voice' },
    // v1 legacy
    S5: { name: 'Cross-Domain Synthesis', isLegacy: true },
    O1: { name: 'Causal Reasoning', isLegacy: true },
  },
};

/**
 * Render a criterion key with its human-readable name.
 *
 * - Known v2 key:   `('S1', 4)` -> `'S1 (Contested)'`
 * - Legacy key:     `('S5', 4)` -> `'S5 (Cross-Domain Synthesis [legacy])'`
 * - Unknown key:    `('X9', 4)` -> `'X9'` (raw key)
 * - Wrong level:    `('V1', 4)` -> `'V1'` (V1 lives only under level 3)
 * - Empty input:    `('',  4)`  -> `''`
 *
 * dokLevel is required because DOK3 and DOK4 share keys with different
 * meanings (e.g. P1).
 */
export function labelForCriterion(key: string, dokLevel: LabelDokLevel): string {
  if (!key) return key;
  const entry = CRITERIA_LABELS_BY_LEVEL[dokLevel]?.[key];
  if (!entry) return key;
  return entry.isLegacy
    ? `${key} (${entry.name} [legacy])`
    : `${key} (${entry.name})`;
}
