// ============================================
// Version Resolver — deterministic version selection
//
// Resolves which prompt version to use based on:
// - Latest (default)
// - Specific version pin
// - Evaluation baseline
// - A/B testing (future)
// ============================================

import type { SemVer } from './prompt-metadata';

/** Resolution strategy */
export type ResolutionStrategy =
  | { type: 'latest' }
  | { type: 'pinned'; version: SemVer }
  | { type: 'baseline'; baselineId: string }
  | { type: 'rollback'; targetVersion: SemVer };

/** Result of version resolution */
export interface ResolvedVersion {
  version: SemVer;
  strategy: ResolutionStrategy['type'];
  resolvedAt: string;
  reason: string;
}

/**
 * Resolve which version of a prompt to use.
 *
 * Resolution priority:
 * 1. Explicit pin (from ExecutionContext)
 * 2. Rollback (from incident response)
 * 3. Baseline (from evaluation)
 * 4. Latest (default)
 */
export function resolveVersion(
  availableVersions: SemVer[],
  strategy: ResolutionStrategy = { type: 'latest' },
): ResolvedVersion {
  const sorted = [...availableVersions].sort(compareSemVer).reverse();

  if (sorted.length === 0) {
    throw new Error('No versions available for resolution');
  }

  switch (strategy.type) {
    case 'pinned':
      if (!sorted.includes(strategy.version)) {
        throw new Error(
          `Pinned version ${strategy.version} not found. Available: ${sorted.join(', ')}`,
        );
      }
      return {
        version: strategy.version,
        strategy: 'pinned',
        resolvedAt: new Date().toISOString(),
        reason: `Explicitly pinned to ${strategy.version}`,
      };

    case 'rollback':
      if (!sorted.includes(strategy.targetVersion)) {
        throw new Error(
          `Rollback target ${strategy.targetVersion} not found`,
        );
      }
      return {
        version: strategy.targetVersion,
        strategy: 'rollback',
        resolvedAt: new Date().toISOString(),
        reason: `Rollback to ${strategy.targetVersion}`,
      };

    case 'baseline':
      return {
        version: sorted[0], // use latest; baseline comparison happens in evaluation
        strategy: 'baseline',
        resolvedAt: new Date().toISOString(),
        reason: `Using latest (${sorted[0]}) against baseline ${strategy.baselineId}`,
      };

    case 'latest':
    default:
      return {
        version: sorted[0],
        strategy: 'latest',
        resolvedAt: new Date().toISOString(),
        reason: `Latest available version: ${sorted[0]}`,
      };
  }
}

/** Check if a version string is valid SemVer */
export function isSemVer(version: string): version is SemVer {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/** Parse a version string into {major, minor, patch} */
export function parseSemVer(version: SemVer): { major: number; minor: number; patch: number } {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

/** Compare two SemVer strings. Returns negative if a < b, positive if a > b, 0 if equal */
export function compareSemVer(a: SemVer, b: SemVer): number {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/** Bump a SemVer string */
export function bumpVersion(
  current: SemVer,
  bump: 'major' | 'minor' | 'patch',
): SemVer {
  const p = parseSemVer(current);
  switch (bump) {
    case 'major': return `${p.major + 1}.0.0` as SemVer;
    case 'minor': return `${p.major}.${p.minor + 1}.0` as SemVer;
    case 'patch': return `${p.major}.${p.minor}.${p.patch + 1}` as SemVer;
  }
}
