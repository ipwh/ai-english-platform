// ============================================
// Sprint 104: Repair Actions & Types
// Defines all possible repair actions and their costs.
// ============================================

/** Categorised repair actions available to the self-healing layer. */
export enum RepairAction {
  /** No repair needed */
  NONE = 'NONE',
  /** Whitespace trimming, Unicode normalization, casing */
  NORMALIZE = 'NORMALIZE',
  /** Replace a single field (prompt, questionText, etc.) with corrected value */
  PATCH_FIELD = 'PATCH_FIELD',
  /** Fix MCQ options (pad, truncate, deduplicate) */
  PATCH_OPTIONS = 'PATCH_OPTIONS',
  /** Fix answer field (normalize letter, map text to choice) */
  PATCH_ANSWER = 'PATCH_ANSWER',
  /** Fix or generate explanation fields */
  PATCH_EXPLANATION = 'PATCH_EXPLANATION',
  /** Fix paragraph/line/speaker references */
  PATCH_REFERENCE = 'PATCH_REFERENCE',
  /** Adjust vocabulary/grammar to match difficulty */
  PATCH_DIFFICULTY = 'PATCH_DIFFICULTY',
  /** Regenerate a single field via LLM */
  REGENERATE_FIELD = 'REGENERATE_FIELD',
  /** Regenerate entire question via LLM */
  REGENERATE_QUESTION = 'REGENERATE_QUESTION',
  /** Cannot repair — reject the output */
  REJECT = 'REJECT',
}

/** Cost of a repair action. Planner prefers lowest safe cost. */
export enum RepairCost {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  VERY_HIGH = 'VERY_HIGH',
}

/** Map each repair action to its estimated cost. */
export const REPAIR_ACTION_COST: Record<RepairAction, RepairCost> = {
  [RepairAction.NONE]: RepairCost.LOW,
  [RepairAction.NORMALIZE]: RepairCost.LOW,
  [RepairAction.PATCH_FIELD]: RepairCost.LOW,
  [RepairAction.PATCH_OPTIONS]: RepairCost.LOW,
  [RepairAction.PATCH_ANSWER]: RepairCost.LOW,
  [RepairAction.PATCH_EXPLANATION]: RepairCost.MEDIUM,
  [RepairAction.PATCH_REFERENCE]: RepairCost.MEDIUM,
  [RepairAction.PATCH_DIFFICULTY]: RepairCost.MEDIUM,
  [RepairAction.REGENERATE_FIELD]: RepairCost.HIGH,
  [RepairAction.REGENERATE_QUESTION]: RepairCost.VERY_HIGH,
  [RepairAction.REJECT]: RepairCost.VERY_HIGH,
};

/** Priority order for repair actions (lower = execute first). */
export const REPAIR_PRIORITY_ORDER: RepairAction[] = [
  RepairAction.NORMALIZE,
  RepairAction.PATCH_FIELD,
  RepairAction.PATCH_OPTIONS,
  RepairAction.PATCH_ANSWER,
  RepairAction.PATCH_EXPLANATION,
  RepairAction.PATCH_REFERENCE,
  RepairAction.PATCH_DIFFICULTY,
  RepairAction.REGENERATE_FIELD,
  RepairAction.REGENERATE_QUESTION,
  RepairAction.REJECT,
];

/** Priority comparison: returns negative if a should execute before b. */
export function compareRepairPriority(a: RepairAction, b: RepairAction): number {
  const ia = REPAIR_PRIORITY_ORDER.indexOf(a);
  const ib = REPAIR_PRIORITY_ORDER.indexOf(b);
  return ia - ib;
}

/** Check if a repair action is deterministic (no LLM dependency). */
export function isDeterministicRepair(action: RepairAction): boolean {
  return action !== RepairAction.REGENERATE_FIELD &&
         action !== RepairAction.REGENERATE_QUESTION;
}
