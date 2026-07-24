// ============================================
// Sprint 102: QuestionQualityRulePack
// Registers all question quality rules with the QualityRegistry.
// Called once at application startup to activate the rule pack.
// ============================================

import { qualityRegistry } from '../quality-registry';
import { AnswerFieldRule } from './answer-field.rule';
import { QuestionStructureRule } from './question-structure.rule';
import { MCQOptionRule } from './mcq-option.rule';
import { MCQAnswerRule } from './mcq-answer.rule';
import { DuplicateOptionRule } from './duplicate-option.rule';
import { ExplanationRule } from './explanation.rule';
import { EmptyFieldRule } from './empty-field.rule';

export class QuestionQualityRulePack {
  private registered = false;

  /** Register all question quality rules. Idempotent — safe to call multiple times. */
  register(): this {
    if (this.registered) return this;

    qualityRegistry
      .registerRule(new AnswerFieldRule())
      .registerRule(new QuestionStructureRule())
      .registerRule(new MCQOptionRule())
      .registerRule(new MCQAnswerRule())
      .registerRule(new DuplicateOptionRule())
      .registerRule(new ExplanationRule())
      .registerRule(new EmptyFieldRule());

    this.registered = true;
    return this;
  }

  /** Unregister all rules from this pack. */
  unregister(): this {
    if (!this.registered) return this;

    const ruleIds = [
      'question:answer-field',
      'question:structure',
      'mcq:options',
      'mcq:answer',
      'question:duplicate-options',
      'question:explanation',
      'question:empty-fields',
    ];

    for (const id of ruleIds) {
      qualityRegistry.unregisterRule(id);
    }

    this.registered = false;
    return this;
  }

  /** Check if this pack is currently registered. */
  get isRegistered(): boolean {
    return this.registered;
  }
}

/** Singleton instance */
export const questionQualityRulePack = new QuestionQualityRulePack();
