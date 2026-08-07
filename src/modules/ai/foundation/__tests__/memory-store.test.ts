// ============================================
// MemoryStore Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../storage/memory-store';

interface TestEntity {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

function makeEntity(id: string, name: string, data: Record<string, unknown> = {}): TestEntity {
  return { id, name, data };
}

describe('MemoryStore', () => {
  it('should save and load an item', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'Alpha', { x: 1 }));
    const loaded = await store.load('a');
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Alpha');
    expect(loaded!.data).toEqual({ x: 1 });
  });

  it('should return undefined for missing item', async () => {
    const store = new MemoryStore<TestEntity>();
    expect(await store.load('nonexistent')).toBeUndefined();
  });

  it('should overwrite on duplicate save', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'Alpha'));
    await store.save(makeEntity('a', 'Alpha2'));
    expect((await store.load('a'))!.name).toBe('Alpha2');
  });

  it('should delete an item', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'Alpha'));
    expect(await store.delete('a')).toBe(true);
    expect(await store.load('a')).toBeUndefined();
  });

  it('should return false when deleting nonexistent', async () => {
    const store = new MemoryStore<TestEntity>();
    expect(await store.delete('nonexistent')).toBe(false);
  });

  it('should check existence', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'Alpha'));
    expect(await store.exists('a')).toBe(true);
    expect(await store.exists('b')).toBe(false);
  });

  it('should list all items', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'A'));
    await store.save(makeEntity('b', 'B'));
    const items = await store.list();
    expect(items).toHaveLength(2);
  });

  it('should list with filter', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'Alpha'));
    await store.save(makeEntity('b', 'Beta'));
    await store.save(makeEntity('c', 'Alpha2'));
    const items = await store.list({
      filter: (item) => item.name.startsWith('Alpha'),
    });
    expect(items).toHaveLength(2);
  });

  it('should list with sort', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('c', 'C'));
    await store.save(makeEntity('a', 'A'));
    await store.save(makeEntity('b', 'B'));
    const items = await store.list({
      sort: (a, b) => a.name.localeCompare(b.name),
    });
    expect(items.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('should list with limit and offset', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'A'));
    await store.save(makeEntity('b', 'B'));
    await store.save(makeEntity('c', 'C'));
    const items = await store.list({ limit: 2, offset: 1 });
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('b');
  });

  it('should count items', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'A'));
    await store.save(makeEntity('b', 'B'));
    expect(await store.count()).toBe(2);
  });

  it('should clear all items', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'A'));
    await store.save(makeEntity('b', 'B'));
    store.clear();
    expect(await store.count()).toBe(0);
  });

  it('should saveAll multiple items', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.saveAll([
      makeEntity('a', 'A'),
      makeEntity('b', 'B'),
      makeEntity('c', 'C'),
    ]);
    expect(await store.count()).toBe(3);
  });

  it('should deleteWhere matching items', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'Alpha'));
    await store.save(makeEntity('b', 'Beta'));
    await store.save(makeEntity('c', 'Alpha2'));
    const deleted = await store.deleteWhere(item => item.name.startsWith('Alpha'));
    expect(deleted).toBe(2);
    expect(await store.count()).toBe(1);
  });

  // ── Immutability ──

  it('load() should return a copy — mutation does not affect store', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'Original', { key: 'value' }));
    const loaded = (await store.load('a'))!;
    loaded.name = 'MUTATED';
    loaded.data.key = 'MUTATED';
    expect((await store.load('a'))!.name).toBe('Original');
    expect((await store.load('a'))!.data.key).toBe('value');
  });

  it('list() should return copies', async () => {
    const store = new MemoryStore<TestEntity>();
    await store.save(makeEntity('a', 'Original'));
    const items = await store.list();
    items[0].name = 'MUTATED';
    expect((await store.load('a'))!.name).toBe('Original');
  });
});
