// Sprint 99: Release Registry — tracks all releases with version, git SHA, flags, rollback info
import type { Release, ReleaseComparison } from './release-types';
import { listFlags } from './feature-flags';

const releases: Release[] = [];
let counter = 0;

export function registerRelease(release: Omit<Release, 'id'>): Release {
  const r: Release = { id: `REL-${++counter}`, ...release };
  releases.push(r);
  return r;
}

export function getRelease(id: string): Release | undefined {
  return releases.find(r => r.id === id);
}

export function latestRelease(): Release | undefined {
  return releases[releases.length - 1];
}

export function listReleases(limit = 20): Release[] {
  return releases.slice(-limit).reverse();
}

export function compareReleases(fromId: string, toId: string): ReleaseComparison {
  const from = getRelease(fromId);
  const to = getRelease(toId);
  if (!from || !to) throw new Error('Release not found');

  const fromFlags = new Set(from.featureFlags);
  const toFlags = new Set(to.featureFlags);
  const flagChanges: ReleaseComparison['flagChanges'] = [];

  for (const f of from.featureFlags) {
    if (!toFlags.has(f)) flagChanges.push({ flagId: f, from: true, to: false });
  }
  for (const f of to.featureFlags) {
    if (!fromFlags.has(f)) flagChanges.push({ flagId: f, from: false, to: true });
  }

  return {
    from, to, flagChanges,
    diffSummary: `${flagChanges.length} flag changes between ${from.version} and ${to.version}`,
  };
}

// Register initial release on module load
registerRelease({
  version: '1.0.0',
  gitSha: 'HEAD',
  timestamp: new Date().toISOString(),
  author: 'platform',
  featureFlags: listFlags().map(f => f.id),
  deploymentResult: 'success',
  notes: 'Initial platform release with Sprint 99 release governance',
});
