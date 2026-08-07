// ============================================
// EvaluationStore — Persistent storage for
// EvaluationRecord lifecycle state.
//
// Wraps the Foundation MemoryStore / Repository
// abstraction. Used by Monitor for durable
// evaluation tracking and crash recovery.
// ============================================

import { MemoryStore } from '../foundation/storage/memory-store';
import type { Repository } from '../foundation/storage/repository';
import type { Identifiable } from '../foundation/types';
import type { EvaluationRecord, EvaluationStatus } from './evaluation-record';
import { isTerminalStatus, canTransition } from './evaluation-record';

// ── Adaptor: EvaluationRecord ↔ Identifiable ──

/**
 * Internal wrapper that makes EvaluationRecord compatible with
 * Repository<T extends Identifiable>. The `id` maps to `evaluationId`.
 */
interface StoredEvaluationRecord extends Identifiable {
  /** Maps to evaluationRecord.evaluationId */
  id: string;
  /** The actual evaluation record */
  record: EvaluationRecord;
}

// ── Evaluation Store ──

export class EvaluationStore {
  private repo: Repository<StoredEvaluationRecord>;

  constructor(repo?: Repository<StoredEvaluationRecord>) {
    this.repo = repo ?? new MemoryStore<StoredEvaluationRecord>();
  }

  /** Persist a new evaluation record. Rejects duplicate evaluationId. */
  async create(record: EvaluationRecord): Promise<void> {
    // Guard: prevent silent overwrite of existing records
    if (await this.repo.exists(record.evaluationId)) {
      console.error(
        `[EvaluationStore] Duplicate create blocked: ${record.evaluationId} already exists. ` +
        'This indicates a duplicate evaluationId generation or caller bug.'
      );
      return;
    }
    await this.repo.save({ id: record.evaluationId, record });
  }

  /** Load an evaluation record by evaluationId */
  async get(evaluationId: string): Promise<EvaluationRecord | undefined> {
    const stored = await this.repo.load(evaluationId);
    return stored ? structuredClone(stored.record) : undefined;
  }

  /**
   * Update an existing evaluation record (partial merge).
   * Only writes the provided fields — does NOT overwrite the entire record.
   * Rejects invalid status transitions (terminal → anything).
   */
  async update(
    evaluationId: string,
    update: Partial<EvaluationRecord>,
  ): Promise<void> {
    const stored = await this.repo.load(evaluationId);
    if (!stored) return;

    // Validate status transition
    if (update.status && stored.record.status !== update.status) {
      if (isTerminalStatus(stored.record.status)) {
        // Terminal status cannot transition — silently ignore the update
        return;
      }
      if (!canTransition(stored.record.status, update.status)) {
        return; // Invalid transition — silently ignore
      }
    }

    const merged: EvaluationRecord = {
      ...stored.record,
      ...update,
      // Deep-merge sideEffects
      sideEffects: {
        ...stored.record.sideEffects,
        ...(update.sideEffects ?? {}),
      },
      // Deep-merge error
      error: update.error !== undefined
        ? update.error
        : stored.record.error,
    };

    await this.repo.save({ id: evaluationId, record: merged });
  }

  /** List all pending evaluations */
  async listPending(): Promise<EvaluationRecord[]> {
    const all = await this.repo.list({
      filter: s => s.record.status === 'pending',
    });
    return all.map(s => structuredClone(s.record));
  }

  /** List all finalized (non-pending) evaluations */
  async listFinalized(): Promise<EvaluationRecord[]> {
    const all = await this.repo.list({
      filter: s => s.record.status !== 'pending',
    });
    return all.map(s => structuredClone(s.record));
  }

  /** List evaluations matching a status */
  async listByStatus(status: EvaluationStatus): Promise<EvaluationRecord[]> {
    const all = await this.repo.list({
      filter: s => s.record.status === status,
    });
    return all.map(s => structuredClone(s.record));
  }

  /** Delete an evaluation record */
  async delete(evaluationId: string): Promise<boolean> {
    return this.repo.delete(evaluationId);
  }

  /** Check if an evaluation record exists */
  async exists(evaluationId: string): Promise<boolean> {
    return this.repo.exists(evaluationId);
  }

  /** Get the total number of stored records */
  async count(): Promise<number> {
    if ('count' in this.repo && typeof (this.repo as unknown as { count: () => Promise<number> }).count === 'function') {
      return (this.repo as unknown as { count: () => Promise<number> }).count();
    }
    return (await this.repo.list()).length;
  }

  /** Clear all evaluation records */
  async clear(): Promise<void> {
    if ('clear' in this.repo && typeof (this.repo as unknown as { clear: () => void }).clear === 'function') {
      (this.repo as unknown as { clear: () => void }).clear();
      return;
    }
    const all = await this.repo.list();
    for (const s of all) {
      await this.repo.delete(s.id);
    }
  }
}
