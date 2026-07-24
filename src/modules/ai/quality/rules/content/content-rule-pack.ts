// ============================================
// Sprint 103: ContentConsistencyRulePack
// Registers all content consistency rules with QualityRegistry.
// ============================================

import { qualityRegistry } from '../../quality-registry';
import { AnswerConsistencyRule } from './answer-consistency.rule';
import { OptionConsistencyRule } from './option-consistency.rule';
import { PassageConsistencyRule } from './passage-consistency.rule';
import { TranscriptConsistencyRule } from './transcript-consistency.rule';
import { ReferenceConsistencyRule } from './reference-consistency.rule';
import { FactConsistencyRule } from './fact-consistency.rule';
import { DifficultyConsistencyRule } from './difficulty-consistency.rule';

export class ContentConsistencyRulePack {
  private registered = false;

  register(): this {
    if (this.registered) return this;

    qualityRegistry
      .registerRule(new AnswerConsistencyRule())
      .registerRule(new OptionConsistencyRule())
      .registerRule(new PassageConsistencyRule())
      .registerRule(new TranscriptConsistencyRule())
      .registerRule(new ReferenceConsistencyRule())
      .registerRule(new FactConsistencyRule())
      .registerRule(new DifficultyConsistencyRule());

    this.registered = true;
    return this;
  }

  unregister(): this {
    if (!this.registered) return this;

    for (const id of [
      'content:answer-consistency',
      'content:option-consistency',
      'content:passage-consistency',
      'content:transcript-consistency',
      'content:reference-consistency',
      'content:fact-consistency',
      'content:difficulty-consistency',
    ]) {
      qualityRegistry.unregisterRule(id);
    }

    this.registered = false;
    return this;
  }

  get isRegistered(): boolean { return this.registered; }
}

export const contentConsistencyRulePack = new ContentConsistencyRulePack();
