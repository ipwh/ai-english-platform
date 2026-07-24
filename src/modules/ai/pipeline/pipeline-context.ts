// Sprint 83: Pipeline Context — canonical context for the AI request pipeline

import type { PipelineOptions } from './pipeline-types';

export interface PipelineContext {
  /** User identity */
  userId?: string;
  /** Student learning context (if available) */
  student?: {
    level: string;
    gradeLevel: string;
    weakSkills: string[];
    strongSkills: string[];
  };
  /** Curriculum alignment */
  curriculum?: {
    skill: string;
    skillZh: string;
    difficulty: 'remedial' | 'core' | 'challenge';
    gradeLevel: string;
    topic?: string;
    topicZh?: string;
  };
  /** DSE RAG context (past paper excerpts) */
  dseContext?: {
    pastPaperExcerpts: string[];
    markingSchemeExcerpts: string[];
  };
  /** Execution options */
  options: PipelineOptions;
  /** Safety flags */
  safety: {
    sanitizeInputs: boolean;
    language: 'zh' | 'en';
  };
}

/** Build a minimal pipeline context from use case parameters */
export function buildPipelineContext(params: {
  skill: string;
  skillZh: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  gradeLevel: string;
  userId?: string;
  topic?: string;
  topicZh?: string;
  options?: PipelineOptions;
}): PipelineContext {
  return {
    userId: params.userId,
    curriculum: {
      skill: params.skill,
      skillZh: params.skillZh,
      difficulty: params.difficulty,
      gradeLevel: params.gradeLevel,
      topic: params.topic,
      topicZh: params.topicZh,
    },
    options: params.options || {},
    safety: {
      sanitizeInputs: true,
      language: 'zh',
    },
  };
}
