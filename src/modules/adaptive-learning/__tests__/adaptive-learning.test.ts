// Sprint 39: Adaptive Learning Engine — integration + performance tests
import { describe, it, expect } from 'vitest';
import type { PipelineInput, AdaptiveLearningResult, PipelineStage } from '../types';
import { pipelineInputSchema } from '../schemas';

// ============================================
// Type & Schema Validation
// ============================================

describe('Adaptive Learning — 型別 & Schema', () => {
  it('PipelineInput 結構', () => {
    const input: PipelineInput = {
      studentId: 's1',
      gradeLevel: 'S4',
      maxRecommendations: 5,
    };
    expect(input.studentId).toBe('s1');
  });

  it('pipelineInputSchema 應接受有效輸入', () => {
    expect(pipelineInputSchema.safeParse({ studentId: 's1', gradeLevel: 'S4' }).success).toBe(true);
  });

  it('pipelineInputSchema 預設值', () => {
    const r = pipelineInputSchema.parse({ studentId: 's1', gradeLevel: 'S4' });
    expect(r.maxRecommendations).toBe(5);
    expect(r.gradeLevel).toBe('S4');
  });

  it('AdaptiveLearningResult 結構', () => {
    const result: AdaptiveLearningResult = {
      studentId: 's1',
      stages: [],
      mastery: { overallMastery: 65, bySkill: { grammar: 60 } },
      weaknesses: [],
      recommendations: [],
      nextSkills: [],
      totalTimeMs: 100,
      generatedAt: new Date(),
    };
    expect(result.mastery.overallMastery).toBe(65);
  });
});

// ============================================
// Pipeline Stage Validation
// ============================================

describe('Pipeline Stage — 階段狀態', () => {
  it('應追蹤執行時間', () => {
    const stage: PipelineStage = {
      name: 'mastery',
      status: 'completed',
      durationMs: 42,
      summary: { overallMastery: 75 },
    };
    expect(stage.durationMs).toBeGreaterThan(0);
    expect(stage.status).toBe('completed');
  });

  it('失敗階段應有錯誤訊息', () => {
    const stage: PipelineStage = {
      name: 'mistakes',
      status: 'failed',
      durationMs: 10,
      summary: {},
      error: 'DB connection timeout',
    };
    expect(stage.status).toBe('failed');
    expect(stage.error).toBeDefined();
  });

  it('階段名稱應為固定集合', () => {
    const validNames = ['mastery', 'mistakes', 'knowledge-graph', 'recommendations', 'exercise-gen'];
    const stage: PipelineStage = {
      name: 'mastery',
      status: 'completed',
      durationMs: 1,
      summary: {},
    };
    expect(validNames).toContain(stage.name);
  });
});

// ============================================
// Performance Requirements
// ============================================

describe('Adaptive Learning — 效能', () => {
  it('PipelineInput 建立應 < 1ms', () => {
    const start = performance.now();
    const input: PipelineInput = { studentId: 's1', gradeLevel: 'S4' };
    expect(performance.now() - start).toBeLessThan(1);
    expect(input.studentId).toBeDefined();
  });

  it('結構序列化應 < 5ms', () => {
    const result: AdaptiveLearningResult = {
      studentId: 's1',
      stages: Array.from({ length: 5 }, (_, i) => ({
        name: `stage-${i}` as PipelineStage['name'],
        status: 'completed' as const,
        durationMs: 10,
        summary: {},
      })),
      mastery: { overallMastery: 65, bySkill: {} },
      weaknesses: Array.from({ length: 10 }, (_, i) => ({
        category: `cat-${i}`, categoryZh: `類別${i}`,
        masteryScore: 50, mistakeCount: i,
      })),
      recommendations: Array.from({ length: 5 }, (_, i) => ({
        action: `act-${i}`, actionZh: `行動${i}`,
        priority: 'medium' as const, type: 'grammar' as const,
      })),
      nextSkills: [],
      totalTimeMs: 500,
      generatedAt: new Date(),
    };

    const start = performance.now();
    JSON.stringify(result);
    expect(performance.now() - start).toBeLessThan(5);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Adaptive Learning — 邊界情況', () => {
  it('focusSkill 可選', () => {
    const without = pipelineInputSchema.parse({ studentId: 's1', gradeLevel: 'S4' });
    expect(without.focusSkill).toBeUndefined();

    const withSkill = pipelineInputSchema.parse({ studentId: 's1', gradeLevel: 'S4', focusSkill: 'grammar' });
    expect(withSkill.focusSkill).toBe('grammar');
  });

  it('maxRecommendations 範圍', () => {
    expect(pipelineInputSchema.safeParse({ studentId: 's1', gradeLevel: 'S4', maxRecommendations: 0 }).success).toBe(false);
    expect(pipelineInputSchema.safeParse({ studentId: 's1', gradeLevel: 'S4', maxRecommendations: 11 }).success).toBe(false);
    expect(pipelineInputSchema.safeParse({ studentId: 's1', gradeLevel: 'S4', maxRecommendations: 5 }).success).toBe(true);
  });
});
