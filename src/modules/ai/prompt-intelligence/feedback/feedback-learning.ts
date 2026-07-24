// ============================================
// Sprint 110: Feedback Learning Engine
// Converts patterns into knowledge. Deterministic only.
// ============================================

import type { DetectedPattern } from './feedback-types';
import { DEFAULT_ACTIVATION_THRESHOLD } from './feedback-types';
import { upsertKnowledge, activateKnowledge, findKnowledgeByRule, expireInactiveKnowledge } from './feedback-knowledge';
import { detectPatterns } from './feedback-pattern';

/** Learning result */
interface LearningResult {
  patternsDetected: number;
  knowledgeCreated: number;
  knowledgeUpdated: number;
  knowledgeSkipped: number;
  knowledgeExpired: number;
  events: Array<{
    pattern: DetectedPattern;
    action: 'created' | 'updated' | 'skipped' | 'expired';
    reason: string;
  }>;
}

interface LearningEvent {
  pattern: DetectedPattern;
  action: 'created' | 'updated' | 'skipped' | 'expired';
  reason: string;
  timestamp: string;
}

const learningHistory: LearningEvent[] = [];
const MAX_HISTORY = 500;

function recordEvent(pattern: DetectedPattern, action: LearningEvent['action'], reason: string): void {
  learningHistory.push({ pattern, action, reason, timestamp: new Date().toISOString() });
  if (learningHistory.length > MAX_HISTORY) learningHistory.shift();
}

/** Run a learning cycle: detect patterns → convert to knowledge */
export function runLearningCycle(options?: {
  activationThreshold?: number;
  autoExpire?: boolean;
}): LearningResult {
  const threshold = options?.activationThreshold ?? DEFAULT_ACTIVATION_THRESHOLD;
  const autoExpire = options?.autoExpire ?? true;

  const result: LearningResult = {
    patternsDetected: 0,
    knowledgeCreated: 0,
    knowledgeUpdated: 0,
    knowledgeSkipped: 0,
    knowledgeExpired: 0,
    events: [],
  };

  // 1. Detect patterns
  const patterns = detectPatterns({ activationThreshold: threshold });
  result.patternsDetected = patterns.length;

  // 2. Convert patterns to knowledge
  for (const pattern of patterns) {
    // Skip low-confidence patterns
    if (pattern.confidence < 0.3) {
      result.knowledgeSkipped++;
      result.events.push({
        pattern,
        action: 'skipped',
        reason: `Confidence too low (${Math.round(pattern.confidence * 100)}% < 30%)`,
      });
      recordEvent(pattern, 'skipped', `Confidence too low (${Math.round(pattern.confidence * 100)}% < 30%)`);
      continue;
    }

    // Check if knowledge already exists for this rule
    const existingRule = pattern.rule ? findKnowledgeByRule(pattern.rule) : undefined;

    const priority = Math.round(Math.min(100, pattern.confidence * 100));
    const constraint = pattern.suggestedConstraint;

    if (existingRule) {
      // Update existing knowledge
      upsertKnowledge({
        rule: pattern.rule!,
        trigger: pattern.type,
        constraint,
        priority,
        confidence: pattern.confidence,
        activationThreshold: threshold,
        enabled: true,
        category: pattern.category || 'structure',
      });
      result.knowledgeUpdated++;
      result.events.push({
        pattern,
        action: 'updated',
        reason: `Updated existing knowledge for rule "${pattern.rule}" (confidence: ${Math.round(pattern.confidence * 100)}%)`,
      });
      recordEvent(pattern, 'updated', `Updated existing knowledge for rule "${pattern.rule}"`);
    } else if (pattern.rule) {
      // Create new knowledge
      upsertKnowledge({
        rule: pattern.rule,
        trigger: pattern.type,
        constraint,
        priority,
        confidence: pattern.confidence,
        activationThreshold: threshold,
        enabled: true,
        category: pattern.category || 'structure',
      });
      result.knowledgeCreated++;
      result.events.push({
        pattern,
        action: 'created',
        reason: `Created new knowledge for rule "${pattern.rule}" (confidence: ${Math.round(pattern.confidence * 100)}%)`,
      });
      recordEvent(pattern, 'created', `Created new knowledge for rule "${pattern.rule}"`);
    } else {
      // Pattern without a rule (category/dimension-level), still create knowledge
      const ruleId = `category:${pattern.category || 'unknown'}`;
      const existingCat = findKnowledgeByRule(ruleId);
      if (!existingCat) {
        upsertKnowledge({
          rule: ruleId,
          trigger: pattern.type,
          constraint,
          priority,
          confidence: pattern.confidence,
          activationThreshold: threshold,
          enabled: true,
          category: pattern.category || 'structure',
        });
        result.knowledgeCreated++;
        result.events.push({
          pattern,
          action: 'created',
          reason: `Created category knowledge for "${pattern.category}"`,
        });
        recordEvent(pattern, 'created', `Created category knowledge for "${pattern.category}"`);
      }
    }
  }

  // 3. Expire inactive knowledge
  if (autoExpire) {
    const expired = expireInactiveKnowledge();
    result.knowledgeExpired = expired.length;
    for (const item of expired) {
      result.events.push({
        pattern: {
          type: 'RepeatedFailure',
          occurrenceCount: item.activationCount,
          confidence: item.confidence,
          suggestedConstraint: item.constraint,
          detectedAt: new Date().toISOString(),
        },
        action: 'expired',
        reason: `Knowledge "${item.rule}" expired after ${Math.round((Date.now() - new Date(item.lastTriggered!).getTime()) / (1000 * 60 * 60 * 24))} days inactive`,
      });
    }
  }

  return result;
}

/** Get learning history */
export function getLearningHistory(limit?: number): LearningEvent[] {
  const result = [...learningHistory].reverse();
  return limit ? result.slice(0, limit) : result;
}

/** Clear learning history */
export function clearLearningHistory(): void {
  learningHistory.length = 0;
}
