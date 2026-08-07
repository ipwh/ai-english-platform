// ============================================
// VersionedRegistry Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { VersionedRegistry, type VersionedEntity } from '../registry/versioned-registry';

interface TestVersioned extends VersionedEntity {
  name: string;
  version: string;
  groupKey?: string;
  data: string;
}

function makeVersioned(id: string, name: string, version: string, data: string): TestVersioned {
  return { id, name, version, groupKey: name, data };
}

describe('VersionedRegistry', () => {
  // ── Registration ──

  it('should register versioned items', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    expect(registry.size()).toBe(2);
  });

  it('should throw on duplicate id', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    expect(() => registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1')))
      .toThrow(/already registered/);
  });

  // ── Latest ──

  it('should return the latest version', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    const latest = registry.latest('p');
    expect(latest).toBeDefined();
    expect(latest!.version).toBe('2.0.0');
  });

  it('should handle latest after out-of-order registration', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    expect(registry.latest('p')!.version).toBe('2.0.0');
  });

  it('should return undefined for unknown group', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    expect(registry.latest('unknown')).toBeUndefined();
  });

  // ── Previous ──

  it('should return the previous version', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@1.1.0', 'p', '1.1.0', 'v1.1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    const prev = registry.previous('p');
    expect(prev).toBeDefined();
    expect(prev!.version).toBe('1.1.0');
  });

  it('should return undefined for previous when only one version', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    expect(registry.previous('p')).toBeUndefined();
  });

  // ── Get Version ──

  it('should get a specific version', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    const v1 = registry.getVersion('p', '1.0.0');
    expect(v1).toBeDefined();
    expect(v1!.data).toBe('v1');
  });

  // ── Version History ──

  it('should return version history sorted newest first', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@1.1.0', 'p', '1.1.0', 'v1.1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    const history = registry.versionHistory('p');
    expect(history.map(v => v.version)).toEqual(['2.0.0', '1.1.0', '1.0.0']);
  });

  // ── Version Count ──

  it('should count versions per group', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    expect(registry.versionCount('p')).toBe(2);
  });

  // ── List Groups ──

  it('should list all groups', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('a@1.0.0', 'alpha', '1.0.0', 'a'));
    registry.register(makeVersioned('b@1.0.0', 'beta', '1.0.0', 'b'));
    const groups = registry.listGroups();
    expect(groups).toHaveLength(2);
    expect(groups).toContain('alpha');
    expect(groups).toContain('beta');
  });

  // ── List Latest ──

  it('should list latest of all groups', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('a@1.0.0', 'alpha', '1.0.0', 'a1'));
    registry.register(makeVersioned('a@1.1.0', 'alpha', '1.1.0', 'a1.1'));
    registry.register(makeVersioned('b@2.0.0', 'beta', '2.0.0', 'b2'));
    const latest = registry.listLatest();
    expect(latest).toHaveLength(2);
    const alphaLatest = latest.find(v => v.groupKey === 'alpha');
    expect(alphaLatest!.version).toBe('1.1.0');
  });

  // ── Rollback ──

  it('should return rollback target (previous version)', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    const target = registry.rollbackTarget('p');
    expect(target).toBeDefined();
    expect(target!.version).toBe('1.0.0');
  });

  // ── Remove ──

  it('should remove an item and update indexes', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    registry.remove('p@2.0.0');
    expect(registry.latest('p')!.version).toBe('1.0.0');
  });

  // ── SemVer Ordering ──

  it('should correctly order versions: 1.0.0 < 1.1.0 < 1.2.0 < 2.0.0', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.1.0', 'p', '1.1.0', 'b'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'd'));
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'a'));
    registry.register(makeVersioned('p@1.2.0', 'p', '1.2.0', 'c'));
    const history = registry.versionHistory('p');
    expect(history.map(v => v.version)).toEqual(['2.0.0', '1.2.0', '1.1.0', '1.0.0']);
    expect(registry.latest('p')!.version).toBe('2.0.0');
    expect(registry.previous('p')!.version).toBe('1.2.0');
  });

  // ── Immutability ──

  it('should return immutable copies from listLatest()', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    const items = registry.listLatest();
    items[0].data = 'MUTATED';
    expect(registry.latest('p')!.data).toBe('v1');
  });

  it('should return immutable copies from versionHistory()', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    const history = registry.versionHistory('p');
    history[0].data = 'MUTATED';
    expect(registry.latest('p')!.data).toBe('v1');
  });

  it('should return immutable copies from latest()', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    const latest = registry.latest('p')!;
    latest.data = 'MUTATED';
    expect(registry.latest('p')!.data).toBe('v1');
  });

  it('should return immutable copies from previous()', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    const prev = registry.previous('p')!;
    prev.data = 'MUTATED';
    expect(registry.previous('p')!.data).toBe('v1');
  });

  it('should return immutable copies from getVersion()', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    const v = registry.getVersion('p', '1.0.0')!;
    v.data = 'MUTATED';
    expect(registry.getVersion('p', '1.0.0')!.data).toBe('v1');
  });

  it('should return immutable copies from rollbackTarget()', () => {
    const registry = new VersionedRegistry<TestVersioned>();
    registry.register(makeVersioned('p@1.0.0', 'p', '1.0.0', 'v1'));
    registry.register(makeVersioned('p@2.0.0', 'p', '2.0.0', 'v2'));
    const target = registry.rollbackTarget('p')!;
    target.data = 'MUTATED';
    expect(registry.rollbackTarget('p')!.data).toBe('v1');
  });
});
