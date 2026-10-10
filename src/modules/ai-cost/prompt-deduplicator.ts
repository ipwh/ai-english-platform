// Sprint 13: Prompt Deduplicator — hash-based duplicate detection
import type { AIModel, DedupResult } from './types';
import { getEntries } from './cost-tracker';
import { get } from '@/modules/cache/cache-service';

/** Simple hash function for prompt deduplication */
export function hashPrompt(prompt: string): string {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = ((h << 5) - h) + prompt.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

/** Normalize prompt for comparison (trim, collapse whitespace) */
export function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ');
}

/**
 * Check if a prompt is a duplicate of a recently sent one.
 * Search scope: last 1 hour, same model.
 */
export function checkDuplicate(prompt: string, model: AIModel): DedupResult {
  const normalized = normalizePrompt(prompt);
  const hash = hashPrompt(normalized);

  const oneHourAgo = Date.now() - 3600000;
  const entries = getEntries();
  const existing = entries.find(
    e => e.promptHash === hash && e.model === model && e.timestamp.getTime() > oneHourAgo
  );

  return { isDuplicate: !!existing, hash, existingEntry: existing };
}

/**
 * Check if a cached response exists for this prompt.
 * Integrates with Sprint 12's cache module.
 */
export function checkCache(prompt: string, model: AIModel): { cached: boolean; key: string } {
  const hash = hashPrompt(normalizePrompt(prompt));
  const key = `ai:dedup:${model}:${hash}`;
  const cached = get(key);
  return { cached: cached !== undefined, key };
}

/** Build a cache key for a deduplicated prompt */
export function dedupCacheKey(model: AIModel, prompt: string): string {
  return `ai:dedup:${model}:${hashPrompt(normalizePrompt(prompt))}`;
}

/** Group similar prompts for potential batching */
export function detectBatchCandidates(
  prompts: Array<{ prompt: string; model: AIModel }>
): Array<Array<{ prompt: string; model: AIModel; hash: string }>> {
  const groups = new Map<string, Array<{ prompt: string; model: AIModel; hash: string }>>();

  for (const p of prompts) {
    const normalized = normalizePrompt(p.prompt);
    // Use first 50 chars as grouping key for similar prompts
    const prefix = normalized.slice(0, 50);
    const key = `${p.model}:${hashPrompt(prefix)}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...p, hash: hashPrompt(normalized) });
  }

  return [...groups.values()].filter(g => g.length > 1);
}
