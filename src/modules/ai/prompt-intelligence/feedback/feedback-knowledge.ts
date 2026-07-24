// ============================================
// Sprint 110: Feedback Knowledge Base
// Deterministic knowledge store. Additive only.
// ============================================

import type { KnowledgeItem, KnowledgeState, DynamicConstraint, FeedbackCategory } from './feedback-types';
import { MAX_DYNAMIC_CONSTRAINTS, KNOWLEDGE_EXPIRY_DAYS } from './feedback-types';

const knowledgeBase = new Map<string, KnowledgeItem>();
let knowledgeCounter = 0;

// ═══ CRUD Operations ═══

/** Create or update a knowledge item */
export function upsertKnowledge(item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'activationCount' | 'lastTriggered'>): KnowledgeItem {
  const now = new Date().toISOString();

  // Check if knowledge already exists for this rule
  const existing = findKnowledgeByRule(item.rule);
  if (existing) {
    const updated: KnowledgeItem = {
      ...existing,
      confidence: Math.min(1, Math.max(existing.confidence, item.confidence)),
      priority: Math.max(existing.priority, item.priority),
      activationThreshold: item.activationThreshold,
      constraint: item.constraint,
      enabled: item.enabled,
      category: item.category,
      updatedAt: now,
    };
    knowledgeBase.set(existing.id, updated);
    return updated;
  }

  // Create new
  const id = `kn-${++knowledgeCounter}`;
  const knowledge: KnowledgeItem = {
    ...item,
    id,
    createdAt: now,
    updatedAt: now,
    activationCount: 0,
  };
  knowledgeBase.set(id, knowledge);
  return knowledge;
}

/** Get a knowledge item by ID */
export function getKnowledge(id: string): KnowledgeItem | undefined {
  return knowledgeBase.get(id);
}

/** Find knowledge by rule */
export function findKnowledgeByRule(rule: string): KnowledgeItem | undefined {
  for (const item of knowledgeBase.values()) {
    if (item.rule === rule) return item;
  }
  return undefined;
}

/** Get all knowledge items */
export function getAllKnowledge(): KnowledgeItem[] {
  return Array.from(knowledgeBase.values());
}

/** Get enabled knowledge items sorted by priority (highest first) */
export function getEnabledKnowledge(): KnowledgeItem[] {
  return Array.from(knowledgeBase.values())
    .filter(k => k.enabled)
    .sort((a, b) => b.priority - a.priority);
}

/** Get knowledge items by category */
export function getKnowledgeByCategory(category: FeedbackCategory): KnowledgeItem[] {
  return Array.from(knowledgeBase.values())
    .filter(k => k.category === category);
}

/** Activate a knowledge item (record usage) */
export function activateKnowledge(id: string): KnowledgeItem | undefined {
  const item = knowledgeBase.get(id);
  if (!item) return undefined;
  const updated: KnowledgeItem = {
    ...item,
    activationCount: item.activationCount + 1,
    lastTriggered: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  knowledgeBase.set(id, updated);
  return updated;
}

/** Disable a knowledge item */
export function disableKnowledge(id: string): boolean {
  const item = knowledgeBase.get(id);
  if (!item) return false;
  knowledgeBase.set(id, { ...item, enabled: false, updatedAt: new Date().toISOString() });
  return true;
}

/** Enable a knowledge item */
export function enableKnowledge(id: string): boolean {
  const item = knowledgeBase.get(id);
  if (!item) return false;
  knowledgeBase.set(id, { ...item, enabled: true, updatedAt: new Date().toISOString() });
  return true;
}

/** Remove a knowledge item */
export function removeKnowledge(id: string): boolean {
  return knowledgeBase.delete(id);
}

// ═══ Expiry ═══

/** Expire inactive knowledge items */
export function expireInactiveKnowledge(): KnowledgeItem[] {
  const now = new Date();
  const expired: KnowledgeItem[] = [];

  for (const [id, item] of knowledgeBase) {
    if (!item.lastTriggered) continue;
    const lastActive = new Date(item.lastTriggered);
    const daysSinceLast = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast > KNOWLEDGE_EXPIRY_DAYS) {
      knowledgeBase.set(id, { ...item, enabled: false, updatedAt: now.toISOString() });
      expired.push(item);
    }
  }

  return expired;
}

// ═══ Dynamic Constraints ═══

/** Convert enabled knowledge into dynamic constraints for prompt builder */
export function getDynamicConstraints(): DynamicConstraint[] {
  const enabled = getEnabledKnowledge();
  const constraints: DynamicConstraint[] = enabled.map(k => ({
    text: k.constraint,
    priority: k.priority,
    confidence: k.confidence,
    activationCount: k.activationCount,
    knowledgeId: k.id,
    addedAt: k.createdAt,
    lastActivated: k.lastTriggered,
  }));

  // Sort by priority → confidence → activation count
  constraints.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.activationCount - a.activationCount;
  });

  // Cap at MAX_DYNAMIC_CONSTRAINTS, remove oldest inactive first
  if (constraints.length > MAX_DYNAMIC_CONSTRAINTS) {
    return constraints.slice(0, MAX_DYNAMIC_CONSTRAINTS);
  }

  return constraints;
}

// ═══ State ═══

/** Get knowledge state snapshot */
export function getKnowledgeState(): KnowledgeState {
  const items = Array.from(knowledgeBase.values());
  const enabled = items.filter(k => k.enabled);
  return {
    items,
    totalCount: items.length,
    enabledCount: enabled.length,
    disabledCount: items.length - enabled.length,
    averageConfidence: items.length > 0
      ? Math.round(items.reduce((s, k) => s + k.confidence, 0) / items.length * 100) / 100
      : 0,
    averagePriority: items.length > 0
      ? Math.round(items.reduce((s, k) => s + k.priority, 0) / items.length)
      : 0,
    totalActivations: items.reduce((s, k) => s + k.activationCount, 0),
  };
}

/** Clear all knowledge */
export function clearKnowledge(): void {
  knowledgeBase.clear();
  knowledgeCounter = 0;
}
