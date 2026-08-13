// ============================================
// Seed Data — registers existing prompts into the new registry
//
// Reads existing prompts from prompt-registry.ts and
// populates the version-aware PromptVersionRegistry.
// Run once at startup to bridge old and new systems.
// ============================================

import { listPrompts } from '../prompts/prompt-registry';
import { promptVersionRegistry } from './prompt-registry';
import type { PromptMetadata, SemVer, PromptCategory } from './prompt-metadata';
import { logger } from '@/shared/logger/logger';

/** Category mapping from existing feature strings */
function inferCategory(feature: string): PromptCategory {
  const map: Record<string, PromptCategory> = {
    'Reading': 'reading',
    'Writing': 'writing',
    'Grammar': 'grammar',
    'Vocabulary': 'vocabulary',
    'Listening': 'listening',
    'Speaking': 'speaking',
    'IntegratedSkills': 'integrated-skills',
    'Learning': 'learning',
    'Assessment': 'assessment',
  };
  return map[feature] || 'reading';
}

/** Normalize version string to SemVer */
function toSemVer(version: string): SemVer {
  // "v1" → "1.0.0", "v2" → "2.0.0", "1.2.3" → "1.2.3"
  const cleaned = version.replace(/^v/, '');
  if (/^\d+\.\d+\.\d+$/.test(cleaned)) return cleaned as SemVer;
  if (/^\d+$/.test(cleaned)) return `${cleaned}.0.0` as SemVer;
  return '1.0.0';
}

/**
 * Seed the version registry from the existing simple prompt registry.
 * Call once during app initialization.
 */
export function seedPromptVersionRegistry(): void {
  const existing = listPrompts();

  for (const prompt of existing) {
    const version = toSemVer(prompt.version);
    const id = `${prompt.name}@${version}`;

    const meta: PromptMetadata = {
      id,
      name: prompt.name,
      version,
      owner: 'AI English Platform',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      category: inferCategory(prompt.feature),
      supportedProviders: ['deepseek', 'gemini', 'grok'],
      description: prompt.description,
      builderName: prompt.build?.name || undefined,
      expectedJsonSchema: undefined,
      changelog: ['Initial version migrated from legacy prompt registry'],
    };

    promptVersionRegistry.register(meta);
  }

  logger.info(
    { module: 'prompt-versioning' },
    `Seeded ${promptVersionRegistry.count} prompts ` +
    `(${promptVersionRegistry.totalVersions} total versions)`,
  );
}
