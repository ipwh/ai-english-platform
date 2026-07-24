// ============================================
// Sprint 104: Repair Strategy
// Maps quality rule failures to recommended repair actions.
// Centralizes repair logic — rules declare intent, planner executes.
// ============================================

import { RepairAction } from './repair-action';

/**
 * Strategy mapping: which repair action should be attempted for each rule.
 * Rules that can't be safely repaired map to REJECT.
 */
export const DEFAULT_REPAIR_STRATEGY: Record<string, RepairAction> = {
  // Sprint 102 — Structural rules
  'question:answer-field': RepairAction.PATCH_ANSWER,
  'question:structure': RepairAction.PATCH_FIELD,
  'mcq:options': RepairAction.PATCH_OPTIONS,
  'mcq:answer': RepairAction.PATCH_ANSWER,
  'question:duplicate-options': RepairAction.PATCH_OPTIONS,
  'question:explanation': RepairAction.PATCH_EXPLANATION,
  'question:empty-fields': RepairAction.NORMALIZE,

  // Sprint 103 — Content consistency rules
  'content:answer-consistency': RepairAction.PATCH_ANSWER,
  'content:option-consistency': RepairAction.PATCH_OPTIONS,
  'content:passage-consistency': RepairAction.REGENERATE_QUESTION,
  'content:transcript-consistency': RepairAction.REGENERATE_QUESTION,
  'content:reference-consistency': RepairAction.PATCH_REFERENCE,
  'content:fact-consistency': RepairAction.PATCH_FIELD,
  'content:difficulty-consistency': RepairAction.PATCH_DIFFICULTY,

  // Generic fallbacks
  'repair-engine': RepairAction.NORMALIZE,
};

/** Look up the recommended repair action for a rule. */
export function getRepairAction(ruleId: string): RepairAction {
  return DEFAULT_REPAIR_STRATEGY[ruleId] || RepairAction.REJECT;
}

/** Map of rule IDs to their target field for patching. */
export const RULE_TARGET_FIELDS: Record<string, string> = {
  'question:answer-field': 'answer',
  'question:structure': 'prompt',
  'mcq:options': 'choices',
  'mcq:answer': 'answer',
  'question:duplicate-options': 'choices',
  'question:explanation': 'explanation',
  'question:empty-fields': '*',
  'content:answer-consistency': 'answer',
  'content:option-consistency': 'choices',
  'content:reference-consistency': 'questionText',
  'content:fact-consistency': 'explanation',
  'content:difficulty-consistency': 'questionText',
};

/** Get the target field for a rule's repair action. */
export function getRuleTarget(ruleId: string): string {
  return RULE_TARGET_FIELDS[ruleId] || 'unknown';
}

/**
 * Determine the most appropriate repair action by taking the safest (lowest priority)
 * among multiple possible actions.
 */
export function resolveRepairAction(ruleIds: string[]): RepairAction {
  if (ruleIds.length === 0) return RepairAction.NONE;
  if (ruleIds.length === 1) return getRepairAction(ruleIds[0]);

  // If any rule needs REJECT, the whole plan rejects
  const actions = ruleIds.map(id => getRepairAction(id));
  if (actions.includes(RepairAction.REJECT)) return RepairAction.REJECT;

  // If any rule needs REGENERATE_QUESTION, that overrides everything else
  if (actions.includes(RepairAction.REGENERATE_QUESTION)) return RepairAction.REGENERATE_QUESTION;

  // Take the highest-priority (most impactful) action
  // Check from most impactful to least
  if (actions.includes(RepairAction.REJECT)) return RepairAction.REJECT;
  if (actions.includes(RepairAction.REGENERATE_QUESTION)) return RepairAction.REGENERATE_QUESTION;
  if (actions.includes(RepairAction.REGENERATE_FIELD)) return RepairAction.REGENERATE_FIELD;
  if (actions.includes(RepairAction.PATCH_DIFFICULTY)) return RepairAction.PATCH_DIFFICULTY;
  if (actions.includes(RepairAction.PATCH_REFERENCE)) return RepairAction.PATCH_REFERENCE;
  if (actions.includes(RepairAction.PATCH_EXPLANATION)) return RepairAction.PATCH_EXPLANATION;
  if (actions.includes(RepairAction.PATCH_ANSWER)) return RepairAction.PATCH_ANSWER;
  if (actions.includes(RepairAction.PATCH_OPTIONS)) return RepairAction.PATCH_OPTIONS;
  if (actions.includes(RepairAction.PATCH_FIELD)) return RepairAction.PATCH_FIELD;
  if (actions.includes(RepairAction.NORMALIZE)) return RepairAction.NORMALIZE;
  return RepairAction.NONE;
}
