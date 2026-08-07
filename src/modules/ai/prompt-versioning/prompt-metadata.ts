// ============================================
// Prompt Metadata — canonical identity for every AI prompt
//
// Every prompt must have a unique identity. Every generated
// output must be traceable back to prompt version, builder,
// commit, provider, model, and evaluation report.
// ============================================

/** Semantic version following semver.org */
export type SemVer = `${number}.${number}.${number}`;

/** Category of prompt — maps to platform feature areas */
export type PromptCategory =
  | 'reading'
  | 'writing'
  | 'grammar'
  | 'vocabulary'
  | 'listening'
  | 'speaking'
  | 'integrated-skills'
  | 'learning'
  | 'assessment';

/** Complete metadata for a prompt version */
export interface PromptMetadata {
  /** Unique identifier: {name}@{version}, e.g. "reading-summary@v1.2.0" */
  id: string;
  /** Human-readable prompt name */
  name: string;
  /** Semantic version */
  version: SemVer;
  /** Who maintains this prompt */
  owner: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last modification */
  lastModified: string;
  /** Category */
  category: PromptCategory;
  /** Providers this prompt is optimized for */
  supportedProviders: string[];
  /** Name of the expected Zod schema for output validation */
  expectedJsonSchema?: string;
  /** ID of the baseline evaluation report */
  evaluationBaseline?: string;
  /** Human-readable description */
  description: string;
  /** Git commit SHA when this version was created */
  gitCommit?: string;
  /** Builder function reference (type-erased for registry storage) */
  builderName?: string;
  /** Previous version, for diffing */
  previousVersion?: SemVer;
  /** Changelog entries for this version */
  changelog?: string[];
  /** Evaluation scores for this version */
  evaluationScores?: {
    overall: number;
    rubric: number;
    semantic: number;
    structural: number;
  };
}

/** Serialization format for prompt metadata storage */
export interface PromptMetadataFile {
  /** Schema version of the metadata format */
  schemaVersion: '1.0.0';
  prompts: PromptMetadata[];
}
