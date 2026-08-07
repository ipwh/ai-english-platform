// ============================================
// Changelog Generator — automated prompt version history
//
// Generates CHANGELOG.md entries from version metadata
// and evaluation score deltas.
// ============================================

import type { PromptMetadata, SemVer } from './prompt-metadata';

/** A single changelog entry for a prompt version */
export interface ChangelogEntry {
  version: SemVer;
  date: string;
  changes: string[];
  evaluationDelta?: {
    overall: number;
    rubric: number;
    semantic: number;
    structural: number;
  };
  author?: string;
  gitCommit?: string;
}

/** Generate a Markdown changelog for a prompt's history */
export function generateChangelog(
  promptName: string,
  history: PromptMetadata[],
): string {
  const sorted = [...history].sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  );

  const lines: string[] = [];
  lines.push(`# Changelog: ${promptName}`);
  lines.push('');

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i + 1]; // next in sorted (chronologically previous)

    lines.push(`## ${current.version}`);
    lines.push('');
    lines.push(`- **Date**: ${current.lastModified}`);
    if (current.gitCommit) lines.push(`- **Commit**: \`${current.gitCommit}\``);
    if (current.owner) lines.push(`- **Owner**: ${current.owner}`);
    lines.push('');

    // Changes
    if (current.changelog && current.changelog.length > 0) {
      lines.push('### Changes');
      for (const change of current.changelog) {
        lines.push(`- ${change}`);
      }
      lines.push('');
    }

    // Evaluation delta
    if (current.evaluationScores && previous?.evaluationScores) {
      const delta = {
        overall: current.evaluationScores.overall - previous.evaluationScores.overall,
        rubric: current.evaluationScores.rubric - previous.evaluationScores.rubric,
        semantic: current.evaluationScores.semantic - previous.evaluationScores.semantic,
        structural: current.evaluationScores.structural - previous.evaluationScores.structural,
      };
      lines.push('### Evaluation');
      lines.push(`| Metric | Previous (${previous.version}) | Current (${current.version}) | Delta |`);
      lines.push('|--------|------|------|-------|');
      const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
      lines.push(`| Overall | ${previous.evaluationScores.overall} | ${current.evaluationScores.overall} | ${fmt(delta.overall)} |`);
      lines.push(`| Rubric | ${previous.evaluationScores.rubric} | ${current.evaluationScores.rubric} | ${fmt(delta.rubric)} |`);
      lines.push(`| Semantic | ${previous.evaluationScores.semantic} | ${current.evaluationScores.semantic} | ${fmt(delta.semantic)} |`);
      lines.push(`| Structural | ${previous.evaluationScores.structural} | ${current.evaluationScores.structural} | ${fmt(delta.structural)} |`);
      lines.push('');
    } else if (current.evaluationScores) {
      lines.push('### Evaluation');
      lines.push(`- Overall: **${current.evaluationScores.overall}** | Rubric: ${current.evaluationScores.rubric} | Semantic: ${current.evaluationScores.semantic} | Structural: ${current.evaluationScores.structural}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/** Generate a summary changelog across all prompts */
export function generateMasterChangelog(
  allHistory: Map<string, PromptMetadata[]>,
): string {
  const lines: string[] = [];
  lines.push('# Prompt Version Changelog');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  for (const [name, history] of allHistory) {
    lines.push(`## ${name}`);
    lines.push('');
    const latest = history.sort((a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true }),
    )[0];
    if (latest) {
      lines.push(`- **Latest**: ${latest.version} (${latest.lastModified})`);
      lines.push(`- **Versions**: ${history.length}`);
      if (latest.evaluationScores) {
        lines.push(`- **Score**: ${latest.evaluationScores.overall}/100`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
