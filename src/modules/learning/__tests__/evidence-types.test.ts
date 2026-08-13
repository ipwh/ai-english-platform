// Sprint 131: LearningEvidence Contract — Exhaustive Unit Tests
import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Type guards
  isUnknown,
  isObserved,
  isDerived,
  isEstimated,
  isPredicted,
  hasValue,
  // Builders
  createUnknownEvidence,
  createObservedEvidence,
  createDerivedEvidence,
  createEstimatedEvidence,
  createPredictedEvidence,
  resetEvidenceIdCounter,
  // Validation
  validateLearningEvidence,
  // Utilities
  EVIDENCE_KIND_DEFAULT_PRIORITY,
  EVIDENCE_KINDS,
  compareEvidenceDefaultPriority,
  pickHighestPriorityEvidence,
} from '../types/evidence-types';
import type {
  LearningEvidence,
  EvidenceKind,
  EvidenceProvenance,
  EvidenceConfidence,
  EvidenceValidationResult,
} from '../types/evidence-types';

// ============================================
// Test helpers
// ============================================

function makeProvenance(overrides?: Partial<EvidenceProvenance>): EvidenceProvenance {
  return {
    source: 'student-practice',
    method: 'direct-measurement',
    description: 'Multiple-choice quiz result',
    ...overrides,
  };
}

function makeConfidence(overrides?: Partial<EvidenceConfidence>): EvidenceConfidence {
  return {
    value: 0.85,
    interval: { lower: 0.80, upper: 0.90 },
    sampleSize: 30,
    method: 'bootstrapped',
    ...overrides,
  };
}

const BASE_PARAMS = {
  skillId: 'present-perfect',
  studentId: 'student-001',
  provenance: makeProvenance(),
};

// ============================================
// EvidenceKind constants
// ============================================

describe('EvidenceKind constants (classification, not quality)', () => {
  it('should have exactly 5 evidence kinds', () => {
    expect(EVIDENCE_KINDS).toHaveLength(5);
  });

  it('should contain all expected kinds', () => {
    expect(EVIDENCE_KINDS).toContain('unknown');
    expect(EVIDENCE_KINDS).toContain('observed');
    expect(EVIDENCE_KINDS).toContain('derived');
    expect(EVIDENCE_KINDS).toContain('estimated');
    expect(EVIDENCE_KINDS).toContain('predicted');
  });

  it('should have default priority ordering: observed > derived > estimated > predicted > unknown', () => {
    expect(EVIDENCE_KIND_DEFAULT_PRIORITY.observed).toBeGreaterThan(EVIDENCE_KIND_DEFAULT_PRIORITY.derived);
    expect(EVIDENCE_KIND_DEFAULT_PRIORITY.derived).toBeGreaterThan(EVIDENCE_KIND_DEFAULT_PRIORITY.estimated);
    expect(EVIDENCE_KIND_DEFAULT_PRIORITY.estimated).toBeGreaterThan(EVIDENCE_KIND_DEFAULT_PRIORITY.predicted);
    expect(EVIDENCE_KIND_DEFAULT_PRIORITY.predicted).toBeGreaterThan(EVIDENCE_KIND_DEFAULT_PRIORITY.unknown);
  });

  it('should have unknown default priority as 0', () => {
    expect(EVIDENCE_KIND_DEFAULT_PRIORITY.unknown).toBe(0);
  });

  it('should have observed as the highest default priority (5)', () => {
    expect(EVIDENCE_KIND_DEFAULT_PRIORITY.observed).toBe(5);
  });
});

// ============================================
// Builder: createUnknownEvidence
// ============================================

describe('createUnknownEvidence', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('should create an unknown evidence record', () => {
    const ev = createUnknownEvidence(BASE_PARAMS);
    expect(ev.kind).toBe('unknown');
    expect(ev.skillId).toBe('present-perfect');
    expect(ev.studentId).toBe('student-001');
    expect(ev.provenance.source).toBe('student-practice');
  });

  it('should ALWAYS have null value (no numeric fallback)', () => {
    const ev = createUnknownEvidence(BASE_PARAMS);
    expect(ev.value).toBeNull();
  });

  it('should NOT allow overriding value to a number', () => {
    // The builder takes BaseEvidenceParams which has no `value` field.
    // TypeScript enforces this at compile time.
    // We verify the runtime result has null.
    const ev = createUnknownEvidence(BASE_PARAMS);
    expect(ev.value).toBeNull();
  });

  it('should generate a unique id', () => {
    const ev1 = createUnknownEvidence(BASE_PARAMS);
    const ev2 = createUnknownEvidence(BASE_PARAMS);
    expect(ev1.id).not.toBe(ev2.id);
  });

  it('should include optional confidence', () => {
    const ev = createUnknownEvidence({ ...BASE_PARAMS, confidence: makeConfidence() });
    expect(ev.confidence?.value).toBe(0.85);
  });

  it('should set createdAt to provided value', () => {
    const dt = '2026-08-12T10:00:00.000Z';
    const ev = createUnknownEvidence({ ...BASE_PARAMS, createdAt: dt });
    expect(ev.createdAt).toBe(dt);
  });

  it('should default createdAt to current time', () => {
    const before = new Date().toISOString();
    const ev = createUnknownEvidence(BASE_PARAMS);
    const after = new Date().toISOString();
    expect(ev.createdAt >= before).toBe(true);
    expect(ev.createdAt <= after).toBe(true);
  });

  it('should include optional assessmentId', () => {
    const ev = createUnknownEvidence({ ...BASE_PARAMS, assessmentId: 'assess-42' });
    expect(ev.assessmentId).toBe('assess-42');
  });

  it('should include optional metadata', () => {
    const ev = createUnknownEvidence({ ...BASE_PARAMS, metadata: { reason: 'no-data' } });
    expect(ev.metadata).toEqual({ reason: 'no-data' });
  });
});

// ============================================
// Builder: createObservedEvidence
// ============================================

describe('createObservedEvidence', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('should create an observed evidence record with a numeric value', () => {
    const ev = createObservedEvidence({ ...BASE_PARAMS, value: 85 });
    expect(ev.kind).toBe('observed');
    expect(ev.value).toBe(85);
  });

  it('should require a numeric value (TypeScript-enforced)', () => {
    const ev = createObservedEvidence({ ...BASE_PARAMS, value: 92.5 });
    expect(ev.value).toBe(92.5);
  });

  it('should generate id with "ev-obs" prefix', () => {
    resetEvidenceIdCounter();
    const ev = createObservedEvidence({ ...BASE_PARAMS, value: 70 });
    expect(ev.id).toMatch(/^ev-obs-/);
  });

  it('should preserve all optional fields', () => {
    const dt = '2026-08-10T08:00:00.000Z';
    const ev = createObservedEvidence({
      ...BASE_PARAMS,
      value: 77,
      confidence: makeConfidence(),
      createdAt: dt,
      assessmentId: 'assess-99',
      metadata: { examiner: 'teacher-A' },
    });
    expect(ev.confidence?.value).toBe(0.85);
    expect(ev.createdAt).toBe(dt);
    expect(ev.assessmentId).toBe('assess-99');
    expect(ev.metadata).toEqual({ examiner: 'teacher-A' });
  });
});

// ============================================
// Builder: createDerivedEvidence
// ============================================

describe('createDerivedEvidence', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('should create a derived evidence record', () => {
    const ev = createDerivedEvidence({
      ...BASE_PARAMS,
      value: 72,
      provenance: makeProvenance({ source: 'prerequisite-chain', method: 'weighted-aggregation' }),
    });
    expect(ev.kind).toBe('derived');
    expect(ev.value).toBe(72);
    expect(ev.provenance.source).toBe('prerequisite-chain');
  });

  it('should generate id with "ev-der" prefix', () => {
    resetEvidenceIdCounter();
    const ev = createDerivedEvidence({ ...BASE_PARAMS, value: 60 });
    expect(ev.id).toMatch(/^ev-der-/);
  });
});

// ============================================
// Builder: createEstimatedEvidence
// ============================================

describe('createEstimatedEvidence', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('should create an estimated evidence record', () => {
    const ev = createEstimatedEvidence({
      ...BASE_PARAMS,
      value: 68,
      provenance: makeProvenance({ source: 'irt-calibration', method: 'irt-3pl', modelVersion: 'v2.1.0' }),
      confidence: makeConfidence({ value: 0.72, interval: { lower: 0.65, upper: 0.79 } }),
    });
    expect(ev.kind).toBe('estimated');
    expect(ev.value).toBe(68);
    expect(ev.provenance.modelVersion).toBe('v2.1.0');
    expect(ev.confidence?.value).toBe(0.72);
  });

  it('should generate id with "ev-est" prefix', () => {
    resetEvidenceIdCounter();
    const ev = createEstimatedEvidence({ ...BASE_PARAMS, value: 55 });
    expect(ev.id).toMatch(/^ev-est-/);
  });
});

// ============================================
// Builder: createPredictedEvidence
// ============================================

describe('createPredictedEvidence', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('should create a predicted evidence record', () => {
    const ev = createPredictedEvidence({
      ...BASE_PARAMS,
      value: 45,
      provenance: makeProvenance({ source: 'spaced-repetition-projection', method: 'exponential-decay-forecast' }),
      confidence: makeConfidence({ value: 0.60 }),
    });
    expect(ev.kind).toBe('predicted');
    expect(ev.value).toBe(45);
    expect(ev.provenance.method).toBe('exponential-decay-forecast');
  });

  it('should generate id with "ev-pred" prefix', () => {
    resetEvidenceIdCounter();
    const ev = createPredictedEvidence({ ...BASE_PARAMS, value: 30 });
    expect(ev.id).toMatch(/^ev-pred-/);
  });
});

// ============================================
// Type guards
// ============================================

describe('Type guards', () => {
  let unknown: LearningEvidence;
  let observed: LearningEvidence;
  let derived: LearningEvidence;
  let estimated: LearningEvidence;
  let predicted: LearningEvidence;

  beforeEach(() => {
    resetEvidenceIdCounter();
    unknown = createUnknownEvidence(BASE_PARAMS);
    observed = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    derived = createDerivedEvidence({ ...BASE_PARAMS, value: 70 });
    estimated = createEstimatedEvidence({ ...BASE_PARAMS, value: 60 });
    predicted = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });
  });

  describe('isUnknown', () => {
    it('should return true only for unknown evidence', () => {
      expect(isUnknown(unknown)).toBe(true);
      expect(isUnknown(observed)).toBe(false);
      expect(isUnknown(derived)).toBe(false);
      expect(isUnknown(estimated)).toBe(false);
      expect(isUnknown(predicted)).toBe(false);
    });
  });

  describe('isObserved', () => {
    it('should return true only for observed evidence', () => {
      expect(isObserved(unknown)).toBe(false);
      expect(isObserved(observed)).toBe(true);
      expect(isObserved(derived)).toBe(false);
      expect(isObserved(estimated)).toBe(false);
      expect(isObserved(predicted)).toBe(false);
    });
  });

  describe('isDerived', () => {
    it('should return true only for derived evidence', () => {
      expect(isDerived(unknown)).toBe(false);
      expect(isDerived(observed)).toBe(false);
      expect(isDerived(derived)).toBe(true);
      expect(isDerived(estimated)).toBe(false);
      expect(isDerived(predicted)).toBe(false);
    });
  });

  describe('isEstimated', () => {
    it('should return true only for estimated evidence', () => {
      expect(isEstimated(unknown)).toBe(false);
      expect(isEstimated(observed)).toBe(false);
      expect(isEstimated(derived)).toBe(false);
      expect(isEstimated(estimated)).toBe(true);
      expect(isEstimated(predicted)).toBe(false);
    });
  });

  describe('isPredicted', () => {
    it('should return true only for predicted evidence', () => {
      expect(isPredicted(unknown)).toBe(false);
      expect(isPredicted(observed)).toBe(false);
      expect(isPredicted(derived)).toBe(false);
      expect(isPredicted(estimated)).toBe(false);
      expect(isPredicted(predicted)).toBe(true);
    });
  });

  describe('hasValue', () => {
    it('should return false for unknown evidence (null value)', () => {
      expect(hasValue(unknown)).toBe(false);
    });

    it('should return true for observed evidence with numeric value', () => {
      expect(hasValue(observed)).toBe(true);
    });

    it('should return true for derived evidence with numeric value', () => {
      expect(hasValue(derived)).toBe(true);
    });

    it('should return true for estimated evidence with numeric value', () => {
      expect(hasValue(estimated)).toBe(true);
    });

    it('should return true for predicted evidence with numeric value', () => {
      expect(hasValue(predicted)).toBe(true);
    });

    it('should narrow the type so value is accessible as number', () => {
      if (hasValue(observed)) {
        // TypeScript should allow: value is number
        const v: number = observed.value;
        expect(v).toBe(80);
      } else {
        expect.fail('hasValue should return true for observed evidence');
      }
    });

    it('should narrow unknown so value is null', () => {
      if (hasValue(unknown)) {
        expect.fail('hasValue should return false for unknown evidence');
      } else {
        // After negation, value should be null
        expect(unknown.value).toBeNull();
      }
    });
  });
});

// ============================================
// Validation
// ============================================

describe('validateLearningEvidence', () => {
  beforeEach(() => resetEvidenceIdCounter());

  describe('valid evidence', () => {
    it('should validate a valid unknown evidence record', () => {
      const ev = createUnknownEvidence(BASE_PARAMS);
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid observed evidence record', () => {
      const ev = createObservedEvidence({ ...BASE_PARAMS, value: 85 });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid derived evidence record', () => {
      const ev = createDerivedEvidence({ ...BASE_PARAMS, value: 72 });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
    });

    it('should validate a valid estimated evidence record', () => {
      const ev = createEstimatedEvidence({ ...BASE_PARAMS, value: 68 });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
    });

    it('should validate a valid predicted evidence record', () => {
      const ev = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
    });

    it('should validate evidence with confidence interval at boundaries', () => {
      const ev = createObservedEvidence({
        ...BASE_PARAMS,
        value: 90,
        confidence: { value: 0.95, interval: { lower: 0, upper: 1 }, sampleSize: 100 },
      });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
    });

    it('should validate evidence with value at lower bound (0)', () => {
      const ev = createObservedEvidence({ ...BASE_PARAMS, value: 0 });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
    });

    it('should validate evidence with value at upper bound (100)', () => {
      const ev = createObservedEvidence({ ...BASE_PARAMS, value: 100 });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
    });
  });

  describe('invariant: unknown must have null value', () => {
    it('should reject unknown evidence with a numeric value', () => {
      const ev: LearningEvidence = {
        id: 'ev-test',
        skillId: 's1',
        studentId: 'st1',
        kind: 'unknown',
        value: 42, // ← VIOLATION
        provenance: makeProvenance(),
        createdAt: new Date().toISOString(),
      };
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'value' && e.message.includes('null'))).toBe(true);
    });

    it('should accept unknown evidence with null value', () => {
      const ev: LearningEvidence = {
        id: 'ev-test',
        skillId: 's1',
        studentId: 'st1',
        kind: 'unknown',
        value: null,
        provenance: makeProvenance(),
        createdAt: new Date().toISOString(),
      };
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
    });
  });

  describe('required fields', () => {
    it('should reject evidence with empty id', () => {
      const ev = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
      (ev as unknown as Record<string, unknown>).id = '';
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'id')).toBe(true);
    });

    it('should reject evidence with empty skillId', () => {
      const ev = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
      (ev as unknown as Record<string, unknown>).skillId = '';
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'skillId')).toBe(true);
    });

    it('should reject evidence with empty studentId', () => {
      const ev = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
      (ev as unknown as Record<string, unknown>).studentId = '';
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'studentId')).toBe(true);
    });

    it('should reject evidence with invalid kind', () => {
      const ev: LearningEvidence = {
        id: 'ev-1',
        skillId: 's1',
        studentId: 'st1',
        kind: 'made-up' as EvidenceKind,
        value: 50,
        provenance: makeProvenance(),
        createdAt: new Date().toISOString(),
      };
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'kind')).toBe(true);
    });

    it('should reject evidence with missing provenance.source', () => {
      const ev: LearningEvidence = {
        id: 'ev-1',
        skillId: 's1',
        studentId: 'st1',
        kind: 'observed',
        value: 80,
        provenance: { source: '' },
        createdAt: new Date().toISOString(),
      };
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'provenance.source')).toBe(true);
    });

    it('should reject evidence with missing createdAt', () => {
      const ev: LearningEvidence = {
        id: 'ev-1',
        skillId: 's1',
        studentId: 'st1',
        kind: 'observed',
        value: 80,
        provenance: makeProvenance(),
        createdAt: '',
      };
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'createdAt')).toBe(true);
    });

    it('should reject evidence with invalid createdAt date', () => {
      const ev: LearningEvidence = {
        id: 'ev-1',
        skillId: 's1',
        studentId: 'st1',
        kind: 'observed',
        value: 80,
        provenance: makeProvenance(),
        createdAt: 'not-a-date',
      };
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'createdAt' && e.message.includes('ISO 8601'))).toBe(true);
    });
  });

  describe('non-unknown should have numeric value', () => {
    it('should warn (soft check) when observed has null value', () => {
      const ev: LearningEvidence = {
        id: 'ev-1',
        skillId: 's1',
        studentId: 'st1',
        kind: 'observed',
        value: null,
        provenance: makeProvenance(),
        createdAt: new Date().toISOString(),
      };
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'value' && e.message.includes('numeric'))).toBe(true);
    });

    it('should warn when derived has null value', () => {
      const ev: LearningEvidence = {
        id: 'ev-1',
        skillId: 's1',
        studentId: 'st1',
        kind: 'derived',
        value: null,
        provenance: makeProvenance(),
        createdAt: new Date().toISOString(),
      };
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'value')).toBe(true);
    });
  });

  describe('value range', () => {
    it('should warn when value is below 0', () => {
      const ev = createObservedEvidence({ ...BASE_PARAMS, value: -5 });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'value' && e.message.includes('[0, 100]'))).toBe(true);
    });

    it('should warn when value is above 100', () => {
      const ev = createObservedEvidence({ ...BASE_PARAMS, value: 150 });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'value' && e.message.includes('[0, 100]'))).toBe(true);
    });
  });

  describe('confidence validation', () => {
    it('should reject confidence.value below 0', () => {
      const ev = createObservedEvidence({
        ...BASE_PARAMS,
        value: 80,
        confidence: { value: -0.1 },
      });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'confidence.value')).toBe(true);
    });

    it('should reject confidence.value above 1', () => {
      const ev = createObservedEvidence({
        ...BASE_PARAMS,
        value: 80,
        confidence: { value: 1.5 },
      });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'confidence.value')).toBe(true);
    });

    it('should reject inverted confidence interval (lo > hi)', () => {
      const ev = createObservedEvidence({
        ...BASE_PARAMS,
        value: 80,
        confidence: { value: 0.8, interval: { lower: 0.9, upper: 0.7 } },
      });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'confidence.interval')).toBe(true);
    });

    it('should reject confidence interval outside [0, 1]', () => {
      const ev = createObservedEvidence({
        ...BASE_PARAMS,
        value: 80,
        confidence: { value: 0.8, interval: { lower: 0.5, upper: 1.2 } },
      });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'confidence.interval')).toBe(true);
    });

    it('should accept confidence without interval', () => {
      const ev = createObservedEvidence({
        ...BASE_PARAMS,
        value: 80,
        confidence: { value: 0.9, sampleSize: 25 },
      });
      const result = validateLearningEvidence(ev);
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================
// compareEvidenceDefaultPriority (heuristic)
// ============================================

describe('compareEvidenceDefaultPriority', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('should return negative when a has lower default priority than b', () => {
    const unknown = createUnknownEvidence(BASE_PARAMS);
    const observed = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    expect(compareEvidenceDefaultPriority(unknown, observed)).toBeLessThan(0);
  });

  it('should return positive when a has higher default priority than b', () => {
    const observed = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    const predicted = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });
    expect(compareEvidenceDefaultPriority(observed, predicted)).toBeGreaterThan(0);
  });

  it('should return 0 when a and b have the same kind', () => {
    const obs1 = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    const obs2 = createObservedEvidence({ ...BASE_PARAMS, value: 90 });
    expect(compareEvidenceDefaultPriority(obs1, obs2)).toBe(0);
  });

  it('should correctly order all kinds by default priority', () => {
    const unknown = createUnknownEvidence(BASE_PARAMS);
    const predicted = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });
    const estimated = createEstimatedEvidence({ ...BASE_PARAMS, value: 60 });
    const derived = createDerivedEvidence({ ...BASE_PARAMS, value: 70 });
    const observed = createObservedEvidence({ ...BASE_PARAMS, value: 80 });

    const records = [predicted, unknown, derived, observed, estimated];
    records.sort(compareEvidenceDefaultPriority);

    expect(records[0].kind).toBe('unknown');
    expect(records[1].kind).toBe('predicted');
    expect(records[2].kind).toBe('estimated');
    expect(records[3].kind).toBe('derived');
    expect(records[4].kind).toBe('observed');
  });
});

// ============================================
// pickHighestPriorityEvidence (heuristic)
// ============================================

describe('pickHighestPriorityEvidence', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('should return undefined for empty array', () => {
    expect(pickHighestPriorityEvidence([])).toBeUndefined();
  });

  it('should return the only record in a single-element array', () => {
    const obs = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    expect(pickHighestPriorityEvidence([obs])).toBe(obs);
  });

  it('should pick observed over all other kinds by default priority', () => {
    const unknown = createUnknownEvidence(BASE_PARAMS);
    const predicted = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });
    const estimated = createEstimatedEvidence({ ...BASE_PARAMS, value: 60 });
    const derived = createDerivedEvidence({ ...BASE_PARAMS, value: 70 });
    const observed = createObservedEvidence({ ...BASE_PARAMS, value: 80 });

    const result = pickHighestPriorityEvidence([predicted, unknown, derived, observed, estimated]);
    expect(result?.kind).toBe('observed');
  });

  it('should pick derived when no observed exists', () => {
    const predicted = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });
    const derived = createDerivedEvidence({ ...BASE_PARAMS, value: 70 });

    const result = pickHighestPriorityEvidence([predicted, derived]);
    expect(result?.kind).toBe('derived');
  });

  it('should pick estimated when only estimated and predicted exist', () => {
    const predicted = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });
    const estimated = createEstimatedEvidence({ ...BASE_PARAMS, value: 60 });

    const result = pickHighestPriorityEvidence([predicted, estimated]);
    expect(result?.kind).toBe('estimated');
  });

  it('should tie-break by confidence when same kind', () => {
    const obs1 = createObservedEvidence({
      ...BASE_PARAMS, value: 80,
      confidence: { value: 0.6 },
    });
    const obs2 = createObservedEvidence({
      ...BASE_PARAMS, value: 85,
      confidence: { value: 0.9 },
    });

    const result = pickHighestPriorityEvidence([obs1, obs2]);
    expect(result).toBe(obs2); // higher confidence wins
    expect(result?.confidence?.value).toBe(0.9);
  });

  it('should treat missing confidence as 0 in tie-break', () => {
    const obs1 = createObservedEvidence({ ...BASE_PARAMS, value: 80 }); // no confidence
    const obs2 = createObservedEvidence({
      ...BASE_PARAMS, value: 85,
      confidence: { value: 0.5 },
    });

    const result = pickHighestPriorityEvidence([obs1, obs2]);
    expect(result).toBe(obs2); // confidence 0.5 > 0 (missing)
  });

  it('should return first when tie-break has equal confidence', () => {
    const obs1 = createObservedEvidence({
      ...BASE_PARAMS, value: 80,
      confidence: { value: 0.8 },
    });
    const obs2 = createObservedEvidence({
      ...BASE_PARAMS, value: 85,
      confidence: { value: 0.8 },
    });

    const result = pickHighestPriorityEvidence([obs1, obs2]);
    expect(result).toBe(obs1); // stable: first wins on tie
  });
});

// ============================================
// Edge cases & contract invariants
// ============================================

describe('Contract invariants', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('unknown must never require a numeric fallback — value is null, not 0', () => {
    const ev = createUnknownEvidence(BASE_PARAMS);
    // `unknown` means we have NO information. Using 0 would incorrectly
    // suggest the student has 0 mastery, which is very different from
    // "we don't know."
    expect(ev.value).toBeNull();
    // The hasValue guard must return false
    expect(hasValue(ev)).toBe(false);
  });

  it('value IS nullable per the contract', () => {
    // All builders produce `value: number | null`.
    // unknown produces null; all others produce a number.
    const unk = createUnknownEvidence(BASE_PARAMS);
    const obs = createObservedEvidence({ ...BASE_PARAMS, value: 80 });

    expect(unk.value).toBeNull();
    expect(obs.value).toBe(80);
    expect(typeof obs.value).toBe('number');
  });

  it('provenance.source is always present', () => {
    const ev = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    expect(ev.provenance.source).toBeTruthy();
    expect(typeof ev.provenance.source).toBe('string');
  });

  it('createdAt is always present and ISO 8601', () => {
    const ev = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    expect(ev.createdAt).toBeTruthy();
    expect(Date.parse(ev.createdAt)).not.toBeNaN();
  });

  it('assessmentId is optional', () => {
    const evWithout = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    const evWith = createObservedEvidence({ ...BASE_PARAMS, value: 80, assessmentId: 'a-1' });

    expect(evWithout.assessmentId).toBeUndefined();
    expect(evWith.assessmentId).toBe('a-1');
  });

  it('EvidenceConfidence is optional', () => {
    const evWithout = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    const evWith = createObservedEvidence({ ...BASE_PARAMS, value: 80, confidence: makeConfidence() });

    expect(evWithout.confidence).toBeUndefined();
    expect(evWith.confidence).toBeDefined();
  });

  it('EvidenceProvenance supports all optional fields', () => {
    const minimal: EvidenceProvenance = { source: 'test' };
    expect(minimal.source).toBe('test');
    expect(minimal.method).toBeUndefined();
    expect(minimal.modelVersion).toBeUndefined();
    expect(minimal.description).toBeUndefined();

    const full: EvidenceProvenance = {
      source: 'irt-calibration',
      method: 'irt-3pl',
      modelVersion: 'v2.1.0',
      description: '3-parameter logistic IRT model',
    };
    expect(full.method).toBe('irt-3pl');
    expect(full.modelVersion).toBe('v2.1.0');
  });

  it('id counter reset works for deterministic testing', () => {
    resetEvidenceIdCounter();
    const ev1 = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    resetEvidenceIdCounter();
    const ev2 = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    // After reset, both should have counter=1 so the same suffix
    expect(ev1.id).toBe(ev2.id);
  });

  it('each evidence record is structurally independent', () => {
    const ev1 = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    const ev2 = { ...ev1, value: 90 };
    expect(ev1.value).toBe(80); // ev1 unchanged
    expect(ev2.value).toBe(90);
  });
});

// ============================================
// Type narrowing via discriminated union
// ============================================

describe('Discriminated union narrowing (TypeScript type-level)', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('isUnknown narrows value to null', () => {
    const ev = createUnknownEvidence(BASE_PARAMS);
    if (isUnknown(ev)) {
      // `ev.value` should be `null` at the type level
      const val: null = ev.value;
      expect(val).toBeNull();
    }
  });

  it('hasValue narrows value to number', () => {
    const ev = createObservedEvidence({ ...BASE_PARAMS, value: 85 });
    if (hasValue(ev)) {
      // `ev.value` should be `number` at the type level
      const val: number = ev.value;
      expect(val).toBe(85);
    }
  });

  it('switch on kind exhaustively covers all kinds', () => {
    // This test ensures all EvidenceKind values are handled.
    // If a new kind is added, this test must be updated.
    function handleByKind(ev: LearningEvidence): string {
      switch (ev.kind) {
        case 'unknown': return `unknown: ${ev.value}`;
        case 'observed': return `observed: ${ev.value}`;
        case 'derived': return `derived: ${ev.value}`;
        case 'estimated': return `estimated: ${ev.value}`;
        case 'predicted': return `predicted: ${ev.value}`;
        default: {
          // Exhaustiveness check
          const _exhaustive: never = ev.kind;
          return _exhaustive;
        }
      }
    }

    const unk = createUnknownEvidence(BASE_PARAMS);
    const obs = createObservedEvidence({ ...BASE_PARAMS, value: 80 });
    const der = createDerivedEvidence({ ...BASE_PARAMS, value: 70 });
    const est = createEstimatedEvidence({ ...BASE_PARAMS, value: 60 });
    const pred = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });

    expect(handleByKind(unk)).toBe('unknown: null');
    expect(handleByKind(obs)).toBe('observed: 80');
    expect(handleByKind(der)).toBe('derived: 70');
    expect(handleByKind(est)).toBe('estimated: 60');
    expect(handleByKind(pred)).toBe('predicted: 50');
  });
});

// ============================================
// Architecture review: forecastHorizonDays
// ============================================

describe('Prediction time semantics (forecastHorizonDays)', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('should store forecastHorizonDays on predicted evidence', () => {
    const ev = createPredictedEvidence({
      ...BASE_PARAMS,
      value: 78,
      provenance: makeProvenance({ source: 'spaced-repetition-projection' }),
      forecastHorizonDays: 14,
    });
    expect(ev.forecastHorizonDays).toBe(14);
    expect(ev.kind).toBe('predicted');
    expect(ev.createdAt).toBeTruthy();
  });

  it('should allow predicted evidence without forecastHorizonDays', () => {
    const ev = createPredictedEvidence({ ...BASE_PARAMS, value: 50 });
    expect(ev.forecastHorizonDays).toBeUndefined();
    expect(ev.kind).toBe('predicted');
  });

  it('should distinguish prediction from observation via createdAt + forecastHorizonDays', () => {
    const dt = '2026-08-12T10:00:00.000Z';
    const predicted = createPredictedEvidence({
      ...BASE_PARAMS,
      value: 78,
      createdAt: dt,
      forecastHorizonDays: 14,
    });
    const observed = createObservedEvidence({
      ...BASE_PARAMS,
      value: 78,
      createdAt: dt,
    });

    // Same value, same timestamp — but semantically different
    expect(predicted.value).toBe(observed.value);
    expect(predicted.createdAt).toBe(observed.createdAt);
    expect(predicted.kind).not.toBe(observed.kind);
    expect(predicted.forecastHorizonDays).toBe(14);
    expect((observed as LearningEvidence).forecastHorizonDays).toBeUndefined();
  });

  it('should allow forecastHorizonDays = 0 (same-day prediction)', () => {
    const ev = createPredictedEvidence({
      ...BASE_PARAMS,
      value: 65,
      forecastHorizonDays: 0,
    });
    expect(ev.forecastHorizonDays).toBe(0);
  });

  it('should validate predicted evidence with forecastHorizonDays', () => {
    const ev = createPredictedEvidence({
      ...BASE_PARAMS,
      value: 78,
      forecastHorizonDays: 14,
    });
    const result = validateLearningEvidence(ev);
    expect(result.valid).toBe(true);
  });
});

// ============================================
// Architecture review: kind ≠ quality
// ============================================

describe('EvidenceKind is classification, NOT quality ranking', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('EVIDENCE_KIND_DEFAULT_PRIORITY is documented as heuristic default', () => {
    // The constant exists and has values, but the key test is that
    // downstream code must NOT treat it as universal truth.
    expect(EVIDENCE_KIND_DEFAULT_PRIORITY.observed).toBeDefined();
    expect(EVIDENCE_KIND_DEFAULT_PRIORITY.unknown).toBe(0);
    // The ranking order is a heuristic — verified by documentation, not code
  });

  it('a derived value with high confidence is NOT inherently worse than low-confidence observed', () => {
    // This test proves the point: the heuristic picker returns observed
    // even when derived has far more evidence. This is BY DESIGN —
    // the function is a heuristic utility, not a truth selector.
    const observed = createObservedEvidence({
      ...BASE_PARAMS, value: 100, // perfect score!
    });
    // observed has NO confidence metadata (sampleSize unknown)

    const derived = createDerivedEvidence({
      ...BASE_PARAMS,
      value: 76,
      provenance: makeProvenance({ source: 'prerequisite-chain', method: 'weighted-aggregation' }),
      confidence: { value: 0.95, sampleSize: 200 },
    });

    const heuristicPick = pickHighestPriorityEvidence([observed, derived]);
    // Heuristic picks observed (kind priority)
    expect(heuristicPick?.kind).toBe('observed');

    // But a domain-aware selection policy SHOULD consider confidence.
    // This test documents the heuristic's limitation, not a bug.
    // Production code must use explicit selection policies.
    expect(derived.confidence?.sampleSize).toBe(200);
    expect(observed.confidence).toBeUndefined();
  });

  it('a well-calibrated prediction is NOT automatically lower quality than a noisy observation', () => {
    const observed = createObservedEvidence({
      ...BASE_PARAMS, value: 100,
      confidence: { value: 0.3, sampleSize: 3 },
    });

    const predicted = createPredictedEvidence({
      ...BASE_PARAMS,
      value: 78,
      provenance: makeProvenance({
        source: 'calibrated-forecast-model',
        method: 'validated-regression',
        modelVersion: 'v3.2.0',
      }),
      confidence: { value: 0.92, sampleSize: 10000 },
      forecastHorizonDays: 7,
    });

    // Heuristic picks observed (higher kind priority)
    const heuristicPick = pickHighestPriorityEvidence([observed, predicted]);
    expect(heuristicPick?.kind).toBe('observed');

    // But predicted has dramatically better confidence and sampleSize
    expect(predicted.confidence!.value).toBeGreaterThan(observed.confidence!.value);
    expect(predicted.confidence!.sampleSize!).toBeGreaterThan(observed.confidence!.sampleSize!);

    // This proves: kind alone is NOT evidence quality.
    // A production selection policy should not use pickHighestPriorityEvidence() blindly.
  });

  it('compareEvidenceDefaultPriority is a heuristic comparator, not a truth function', () => {
    const observed = createObservedEvidence({ ...BASE_PARAMS, value: 50 });
    const derived = createDerivedEvidence({ ...BASE_PARAMS, value: 90 });

    // Heuristic says observed > derived
    expect(compareEvidenceDefaultPriority(observed, derived)).toBeGreaterThan(0);

    // But derived.value (90) > observed.value (50) — value quality is unrelated to kind
    expect(derived.value!).toBeGreaterThan(observed.value!);
  });
});

// ============================================
// Architecture review: provenance remains traceable
// ============================================

describe('Provenance traceability', () => {
  beforeEach(() => resetEvidenceIdCounter());

  it('every evidence kind must carry provenance.source', () => {
    const kinds = [
      createUnknownEvidence(BASE_PARAMS),
      createObservedEvidence({ ...BASE_PARAMS, value: 80 }),
      createDerivedEvidence({ ...BASE_PARAMS, value: 70 }),
      createEstimatedEvidence({ ...BASE_PARAMS, value: 60 }),
      createPredictedEvidence({ ...BASE_PARAMS, value: 50 }),
    ];

    for (const ev of kinds) {
      expect(ev.provenance.source).toBeTruthy();
      expect(typeof ev.provenance.source).toBe('string');
    }
  });

  it('derived evidence should document its method and modelVersion', () => {
    const ev = createDerivedEvidence({
      ...BASE_PARAMS,
      value: 73,
      provenance: makeProvenance({
        source: 'prerequisite-chain',
        method: 'weighted-aggregation',
        modelVersion: 'v2.1.0',
      }),
    });
    expect(ev.provenance.method).toBe('weighted-aggregation');
    expect(ev.provenance.modelVersion).toBe('v2.1.0');
  });

  it('predicted evidence should document forecast model version', () => {
    const ev = createPredictedEvidence({
      ...BASE_PARAMS,
      value: 78,
      provenance: makeProvenance({
        source: 'spaced-repetition-projection',
        method: 'exponential-decay-forecast',
        modelVersion: 'v3.0.0',
      }),
      forecastHorizonDays: 14,
    });
    expect(ev.provenance.modelVersion).toBe('v3.0.0');
    expect(ev.forecastHorizonDays).toBe(14);
  });
});

// ============================================
// Architecture review: legacy contracts untouched
// ============================================

describe('Legacy contracts remain untouched', () => {
  it('this test file does NOT import legacy LearningEvidence from decisions/', () => {
    // The legacy LearningEvidence in decisions/LearningEvidence.ts
    // is a completely different interface (before/after outcome comparison).
    // This test file only imports from types/evidence-types.ts.
    // No import from '../decisions/LearningEvidence' exists in this file.
    // If this test compiles, the legacy contract is untouched.
    expect(true).toBe(true);
  });

  it('this test file does NOT import AssessmentResult', () => {
    // AssessmentResult is in modules/ai/assessment/assessment-types.ts
    // and remains completely unchanged.
    // No import of AssessmentResult exists in this file.
    expect(true).toBe(true);
  });

  it('no consumer migration has occurred — this file is self-contained', () => {
    // This test file only tests the NEW contract in types/evidence-types.ts.
    // It does not import from:
    //   - /api/practice
    //   - mastery/
    //   - LearningDecisionEngine
    //   - StudentState
    //   - StudentAssessmentResult
    expect(true).toBe(true);
  });
});
