// ============================================
// Prompt Versioning — Barrel Export
// ============================================

export type {
  SemVer, PromptCategory, PromptMetadata, PromptMetadataFile,
} from './prompt-metadata';

export {
  resolveVersion, isSemVer, parseSemVer, compareSemVer, bumpVersion,
} from './version-resolver';
export type { ResolutionStrategy, ResolvedVersion } from './version-resolver';

export { promptVersionRegistry } from './prompt-registry';

export {
  snapshotStore, generateSnapshotId, getGitCommit,
} from './snapshot';
export type { PromptSnapshot, SnapshotSummary } from './snapshot';

export {
  generateChangelog, generateMasterChangelog,
} from './changelog';
export type { ChangelogEntry } from './changelog';

export {
  diffPrompts, formatDiffMarkdown,
} from './diff';
export type { PromptDiff } from './diff';
