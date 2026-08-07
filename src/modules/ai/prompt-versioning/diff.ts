// ============================================
// Prompt Diff Utility — compare prompt versions
//
// Compares prompt text, variables, instructions, output
// schema, and evaluation scores between two versions.
// ============================================

import type { PromptMetadata, SemVer } from './prompt-metadata';

/** Result of comparing two prompt versions */
export interface PromptDiff {
  /** The two versions being compared */
  versions: { from: SemVer; to: SemVer };
  /** Text differences */
  textDiff?: TextDiff;
  /** Added variables */
  addedVariables: string[];
  /** Removed variables */
  removedVariables: string[];
  /** Modified instructions */
  instructionChanges: string[];
  /** Output schema changes */
  schemaChanges: string[];
  /** Evaluation score delta */
  evaluationDelta?: {
    overall: number;
    rubric: number;
    semantic: number;
    structural: number;
  };
  /** Summary of the diff */
  summary: string;
}

interface TextDiff {
  addedLines: number;
  removedLines: number;
  changedLines: number;
}

/**
 * Compare two prompt versions.
 */
export function diffPrompts(
  from: PromptMetadata,
  to: PromptMetadata,
  fromText?: string,
  toText?: string,
): PromptDiff {
  const diff: PromptDiff = {
    versions: { from: from.version, to: to.version },
    addedVariables: [],
    removedVariables: [],
    instructionChanges: [],
    schemaChanges: [],
    summary: '',
  };

  // Text diff
  if (fromText && toText) {
    const fromLines = fromText.split('\n');
    const toLines = toText.split('\n');
    diff.textDiff = {
      addedLines: Math.max(0, toLines.length - fromLines.length),
      removedLines: Math.max(0, fromLines.length - toLines.length),
      changedLines: countChangedLines(fromLines, toLines),
    };
  }

  // Variable diff (extract {variable} patterns)
  if (fromText && toText) {
    const fromVars = extractVariables(fromText);
    const toVars = extractVariables(toText);
    diff.addedVariables = toVars.filter(v => !fromVars.includes(v));
    diff.removedVariables = fromVars.filter(v => !toVars.includes(v));
  }

  // Changelog diff
  if (from.changelog && to.changelog) {
    diff.instructionChanges = to.changelog.filter(c => !from.changelog!.includes(c));
  }

  // Schema diff
  if (from.expectedJsonSchema !== to.expectedJsonSchema) {
    diff.schemaChanges.push(
      `Schema changed from "${from.expectedJsonSchema || 'none'}" to "${to.expectedJsonSchema || 'none'}"`,
    );
  }

  // Evaluation delta
  if (from.evaluationScores && to.evaluationScores) {
    diff.evaluationDelta = {
      overall: to.evaluationScores.overall - from.evaluationScores.overall,
      rubric: to.evaluationScores.rubric - from.evaluationScores.rubric,
      semantic: to.evaluationScores.semantic - from.evaluationScores.semantic,
      structural: to.evaluationScores.structural - from.evaluationScores.structural,
    };
  }

  // Summary
  const parts: string[] = [];
  if (diff.textDiff) {
    parts.push(`${diff.textDiff.addedLines > 0 ? '+' + diff.textDiff.addedLines : ''}${diff.textDiff.removedLines > 0 ? ' -' + diff.textDiff.removedLines : ''} lines`);
  }
  if (diff.addedVariables.length > 0) parts.push(`+${diff.addedVariables.length} variables`);
  if (diff.removedVariables.length > 0) parts.push(`-${diff.removedVariables.length} variables`);
  if (diff.evaluationDelta) {
    const d = diff.evaluationDelta;
    parts.push(`Score: ${d.overall >= 0 ? '+' : ''}${d.overall}`);
  }
  diff.summary = parts.join(' | ') || 'No changes detected';

  return diff;
}

/** Generate a Markdown diff report */
export function formatDiffMarkdown(diff: PromptDiff): string {
  const lines: string[] = [];
  lines.push(`# Prompt Diff: ${diff.versions.from} → ${diff.versions.to}`);
  lines.push('');
  lines.push(`**Summary**: ${diff.summary}`);
  lines.push('');

  if (diff.textDiff) {
    lines.push('## Text Changes');
    lines.push(`- Lines added: +${diff.textDiff.addedLines}`);
    lines.push(`- Lines removed: -${diff.textDiff.removedLines}`);
    lines.push(`- Lines modified: ~${diff.textDiff.changedLines}`);
    lines.push('');
  }

  if (diff.addedVariables.length > 0) {
    lines.push('## Added Variables');
    for (const v of diff.addedVariables) lines.push(`- \`${v}\``);
    lines.push('');
  }

  if (diff.removedVariables.length > 0) {
    lines.push('## Removed Variables');
    for (const v of diff.removedVariables) lines.push(`- \`${v}\``);
    lines.push('');
  }

  if (diff.instructionChanges.length > 0) {
    lines.push('## Instruction Changes');
    for (const c of diff.instructionChanges) lines.push(`- ${c}`);
    lines.push('');
  }

  if (diff.schemaChanges.length > 0) {
    lines.push('## Schema Changes');
    for (const c of diff.schemaChanges) lines.push(`- ${c}`);
    lines.push('');
  }

  if (diff.evaluationDelta) {
    lines.push('## Evaluation Delta');
    const d = diff.evaluationDelta;
    lines.push(`| Metric | Delta |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Overall | ${d.overall >= 0 ? '+' : ''}${d.overall} |`);
    lines.push(`| Rubric | ${d.rubric >= 0 ? '+' : ''}${d.rubric} |`);
    lines.push(`| Semantic | ${d.semantic >= 0 ? '+' : ''}${d.semantic} |`);
    lines.push(`| Structural | ${d.structural >= 0 ? '+' : ''}${d.structural} |`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Helpers ──

function countChangedLines(from: string[], to: string[]): number {
  let changed = 0;
  const maxLen = Math.max(from.length, to.length);
  for (let i = 0; i < maxLen; i++) {
    if (from[i] !== to[i]) changed++;
  }
  return changed;
}

function extractVariables(text: string): string[] {
  const matches = text.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}
