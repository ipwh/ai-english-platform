// ============================================
// Shared base class for rule engines
// Extracted from QualityEngine, EvaluationEngine, AssessmentEngine.
// Reduces duplicated initialization pattern.
//
// Each engine subclass:
//   1. Registers its own rules in registerRules()
//   2. Implements its own execution method
//   3. Inherits idempotent init() from base
// ============================================

/**
 * Base class for rule-based AI quality engines.
 * Provides idempotent initialization — registerRules() is called only once.
 *
 * Subclasses: QualityEngine, EvaluationEngine, AssessmentEngine
 */
export abstract class BaseRuleEngine {
  private _initialized = false;

  /** Register all built-in rules. Idempotent — safe to call multiple times. */
  init(): this {
    if (this._initialized) return this;
    this.registerRules();
    this._initialized = true;
    return this;
  }

  /** Override in subclass to register engine-specific rules. */
  protected abstract registerRules(): void;

  /** Check if engine has been initialized. */
  protected get isInitialized(): boolean {
    return this._initialized;
  }
}
