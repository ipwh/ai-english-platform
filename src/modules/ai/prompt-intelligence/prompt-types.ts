// ============================================
// Sprint 109: Prompt Intelligence Types
// ============================================

/** Component parts of a constructed prompt */
export interface PromptComponents {
  systemPrompt: string;
  domainPrompt?: string;       // Reading/Writing/Listening/Grammar specific
  difficultyPrompt?: string;    // Remedial/Core/Challenge level rules
  questionTypePrompt?: string;  // MCQ/Fill-blank/Short-answer specific
  skillPrompt?: string;         // Grammar/Vocabulary/Comprehension focus
  studentContext?: string;      // Grade level, CEFR, weak areas
  qualityRequirements?: string; // Must-have constraints
}

/** Full assembled prompt */
export interface AssembledPrompt {
  system: string;
  user: string;
  metadata: {
    componentCount: number;
    totalLength: number;
    constraintCount: number;
    hasDSEContext: boolean;
  };
}

/** Prompt validation result */
export interface PromptValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100
}

/** Optimization constraints injected into prompts */
export interface PromptConstraints {
  alwaysIncludeAnswer: boolean;
  mcqExactFourOptions: boolean;
  onlyOneCorrectAnswer: boolean;
  explanationRequired: boolean;
  noPlaceholders: boolean;
  noTodo: boolean;
  avoidDuplicateOptions: boolean;
  readingAnswerableFromPassage: boolean;
  listeningReferenceTranscript: boolean;
  writingRequiresTask: boolean;
  writingRequiresAudience: boolean;
  writingRequiresPurpose: boolean;
  writingRequiresWordLimit: boolean;
}

export const DEFAULT_CONSTRAINTS: PromptConstraints = {
  alwaysIncludeAnswer: true, mcqExactFourOptions: true, onlyOneCorrectAnswer: true,
  explanationRequired: true, noPlaceholders: true, noTodo: true,
  avoidDuplicateOptions: true, readingAnswerableFromPassage: true,
  listeningReferenceTranscript: true, writingRequiresTask: true,
  writingRequiresAudience: true, writingRequiresPurpose: true, writingRequiresWordLimit: true,
};

/** Self-reflection result after LLM response */
export interface ReflectionResult {
  score: number;        // 0-100
  passed: boolean;
  checks: ReflectionCheck[];
  warnings: string[];
  improvementSuggestions: string[];
}

export interface ReflectionCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

/** Prompt optimization result */
export interface OptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  constraintsAdded: string[];
  lengthChange: number;
}
