// ============================================
// Execution Context — metadata for AI request tracing
// Carried through the pipeline but not yet used for logging/telemetry.
// Future: enable tracing, telemetry, caching without changing use cases.
// ============================================

/**
 * Metadata describing an AI execution for future telemetry/tracing.
 * Passed through executeAI() → callLLM() → providerRegistry.
 */
export interface ExecutionContext {
  /** High-level feature area (e.g. "Reading", "Writing", "Speaking") */
  feature: string;
  /** Specific use case (e.g. "AnalyzeWriting", "GenerateQuestions") */
  useCase: string;
  /** Prompt name (e.g. "WritingAnalysis", "MistakeExplanation") */
  promptName: string;
  /** Prompt version (e.g. "v1", "v2") */
  promptVersion?: string;
}
