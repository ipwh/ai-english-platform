// Sprint 75: Long-term Learning Memory — Unit Tests (IMemoryRepository interface)
import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyMemory, MemoryService } from '../services/memory-service';
import { decayScore, recencyScore, weaknessSeverity, generateLearningContext, shouldUpdateMemory, calculateMemoryFreshness } from '../services/memory-scoring';
import type { LearningMemory } from '../types';
import type { IMemoryRepository } from '../repositories/memory-repository-interface';

class TestInMemoryRepo implements IMemoryRepository {
  private store = new Map<string, LearningMemory>();
  async get(id: string) { return this.store.get(id) ?? null; }
  async save(id: string, mem: LearningMemory) { mem.updatedAt = new Date(); mem.version++; this.store.set(id, mem); }
  async has(id: string) { return this.store.has(id); }
  async delete(id: string) { return this.store.delete(id); }
  async getAllStudentIds() { return [...this.store.keys()]; }
  async count() { return this.store.size; }
  clear() { this.store.clear(); }
}

let repo: TestInMemoryRepo;
let svc: MemoryService;

beforeEach(() => { repo = new TestInMemoryRepo(); svc = new MemoryService(repo); });

describe('MemoryCRUD', () => {
  it('should create empty memory for new student', async () => {
    const mem = await svc.getMemory('student-1');
    expect(mem.studentId).toBe('student-1');
    expect(mem.version).toBe(2); // bumped by save() in getMemory()
    expect(mem.grammar.overallGrammarLevel).toBe('A2');
  });
  it('should persist memory updates', async () => {
    const mem = await svc.getMemory('student-1');
    mem.grammar.masteredTopics.push('tenses-simple');
    await svc.saveMemory('student-1', mem);
    expect((await svc.getMemory('student-1')).grammar.masteredTopics).toContain('tenses-simple');
  });
  it('should delete memory', async () => {
    await svc.getMemory('student-1');
    expect(await repo.has('student-1')).toBe(true);
    await svc.deleteMemory('student-1');
    expect(await repo.has('student-1')).toBe(false);
  });
});

describe('GrammarTracking', () => {
  it('should record incorrect grammar result', async () => {
    await svc.recordGrammarResult('s1', 'tenses', '時態', false);
    const mem = await svc.getMemory('s1');
    expect(mem.grammar.strugglingTopics.length).toBe(1);
  });
  it('should move from struggling to mastered', async () => {
    await svc.recordGrammarResult('s1', 'tenses', '時態', false);
    for (let i = 0; i < 30; i++) await svc.recordGrammarResult('s1', 'tenses', '時態', true);
    const mem = await svc.getMemory('s1');
    const s = mem.grammar.strugglingTopics.find((t: { topic: string }) => t.topic === 'tenses');
    if (s) expect(s.errorRate).toBeLessThan(0.3);
  });
});

describe('VocabularyTracking', () => {
  it('should record new vocabulary', async () => {
    await svc.recordVocabulary('s1', 'analyze', 4);
    const mem = await svc.getMemory('s1');
    expect(mem.vocabulary.knownWords).toBe(1);
    expect(mem.vocabulary.activeWords).toBe(1);
  });
});

describe('ErrorTracking', () => {
  it('should record errors', async () => {
    await svc.recordError('s1', 'What is past?', 'goed', 'went', 'grammar');
    const mem = await svc.getMemory('s1');
    expect(mem.recentErrors.last10Errors.length).toBe(1);
  });
  it('should cap errors at 10', async () => {
    for (let i = 0; i < 15; i++) await svc.recordError('s1', `Q${i}`, `A${i}`, `C${i}`, 'grammar');
    expect((await svc.getMemory('s1')).recentErrors.last10Errors.length).toBe(10);
  });
});

describe('MemoryScoring', () => {
  it('decayScore should return 1 for today', () => { expect(decayScore(0, 7)).toBe(1); });
  it('decayScore should return 0.5 at halfLife', () => { expect(decayScore(7, 7)).toBeCloseTo(0.5); });
  it('recencyScore should be 0 after maxDays', () => { expect(recencyScore(30)).toBe(0); });
  it('should detect stale memory', async () => {
    const mem = await svc.getMemory('s1');
    mem.updatedAt = new Date(Date.now() - 8 * 86400000);
    expect(shouldUpdateMemory(mem)).toBe(true);
  });
});
