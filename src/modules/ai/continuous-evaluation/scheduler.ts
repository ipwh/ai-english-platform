// ============================================
// Scheduler — cron-like scheduling for continuous
// evaluation.
//
// Supports: hourly, daily, weekly, manual, onRelease,
// onProviderChange.
//
// Tracks last run times per schedule type to prevent
// duplicate executions.
// ============================================

import type { EvaluationSchedule } from './config';
import { SCHEDULE_LABELS } from './config';

// ── Types ──

/** Schedule entry tracking when each schedule last ran */
export interface ScheduleEntry {
  schedule: EvaluationSchedule;
  promptName: string;
  lastRunAt: string;
  nextRunAt: string;
  runCount: number;
  enabled: boolean;
}

/** Callback type for scheduled evaluation */
export type ScheduledEvalCallback = (
  promptName: string,
  triggerType: string,
) => Promise<void>;

// ── Scheduler ──

class Scheduler {
  /** Schedule entries per prompt */
  private schedules = new Map<string, ScheduleEntry[]>();

  /** Active intervals for recurring schedules */
  private intervals: ReturnType<typeof setInterval>[] = [];

  // ── Schedule Management ──

  /**
   * Schedule a prompt for continuous evaluation.
   */
  schedule(
    promptName: string,
    schedules: EvaluationSchedule[],
  ): ScheduleEntry[] {
    const entries: ScheduleEntry[] = [];

    for (const schedule of schedules) {
      const entry: ScheduleEntry = {
        schedule,
        promptName,
        lastRunAt: '',
        nextRunAt: this.computeNextRun(schedule),
        runCount: 0,
        enabled: true,
      };
      entries.push(entry);
    }

    this.schedules.set(promptName, entries);
    return entries;
  }

  /** Unschedule a prompt */
  unschedule(promptName: string): void {
    this.schedules.delete(promptName);
  }

  /** Get schedules for a prompt */
  getSchedules(promptName: string): ScheduleEntry[] {
    return this.schedules.get(promptName) ?? [];
  }

  /** Get all scheduled prompts */
  getAllScheduled(): Map<string, ScheduleEntry[]> {
    return new Map(this.schedules);
  }

  // ── Execution ──

  /**
   * Check which prompts are due for evaluation.
   */
  getDuePrompts(type?: EvaluationSchedule): Array<{ promptName: string; schedule: EvaluationSchedule }> {
    const now = new Date();
    const due: Array<{ promptName: string; schedule: EvaluationSchedule }> = [];

    for (const [promptName, entries] of this.schedules) {
      for (const entry of entries) {
        if (!entry.enabled) continue;
        if (type && entry.schedule !== type) continue;

        // Manual schedules are always due when requested
        if (entry.schedule === 'manual') continue;

        // onRelease and onProviderChange are event-driven, not time-based
        if (entry.schedule === 'onRelease' || entry.schedule === 'onProviderChange') continue;

        if (!entry.lastRunAt || new Date(entry.nextRunAt) <= now) {
          due.push({ promptName, schedule: entry.schedule });
        }
      }
    }

    return due;
  }

  /**
   * Mark a schedule as having run.
   */
  markRun(promptName: string, schedule: EvaluationSchedule): void {
    const entries = this.schedules.get(promptName);
    if (!entries) return;

    const entry = entries.find(e => e.schedule === schedule);
    if (!entry) return;

    const now = new Date();
    entry.lastRunAt = now.toISOString();
    entry.nextRunAt = this.computeNextRun(schedule, now);
    entry.runCount++;
  }

  /**
   * Trigger event-driven schedules (onRelease, onProviderChange).
   */
  getEventDrivenPrompts(event: 'onRelease' | 'onProviderChange'): string[] {
    const prompts: string[] = [];

    for (const [promptName, entries] of this.schedules) {
      for (const entry of entries) {
        if (entry.schedule === event && entry.enabled) {
          prompts.push(promptName);
          break;
        }
      }
    }

    return prompts;
  }

  // ── Auto-Run ──

  /**
   * Start auto-running scheduled evaluations.
   * Calls the callback for each due prompt.
   */
  startAutoRun(
    callback: ScheduledEvalCallback,
    checkIntervalMs: number = 60_000, // Check every minute
  ): void {
    this.stopAutoRun(); // Stop existing intervals

    const interval = setInterval(async () => {
      const due = this.getDuePrompts();

      for (const { promptName, schedule } of due) {
        try {
          await callback(promptName, schedule);
          this.markRun(promptName, schedule);
        } catch (err) {
          console.error(`Scheduled eval failed for ${promptName} (${schedule}):`, err);
        }
      }
    }, checkIntervalMs);

    this.intervals.push(interval);
  }

  /** Stop all auto-run intervals */
  stopAutoRun(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
  }

  /** Whether auto-run is active */
  isRunning(): boolean {
    return this.intervals.length > 0;
  }

  // ── Helpers ──

  private computeNextRun(schedule: EvaluationSchedule, from: Date = new Date()): string {
    const next = new Date(from);

    switch (schedule) {
      case 'hourly':
        next.setHours(next.getHours() + 1, 0, 0, 0);
        break;
      case 'daily':
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        next.setHours(0, 0, 0, 0);
        break;
      default:
        // manual, onRelease, onProviderChange — no automatic next run
        next.setFullYear(2099);
        break;
    }

    return next.toISOString();
  }
}

/** Singleton scheduler */
export const scheduler = new Scheduler();
