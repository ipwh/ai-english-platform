// ============================================
// LifecycleEngine Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { LifecycleEngine } from '../lifecycle/lifecycle-engine';

type States = 'draft' | 'review' | 'published' | 'archived';

function createEngine(initialState: States = 'draft') {
  return new LifecycleEngine<States>({
    initialState,
    transitions: {
      draft: ['review', 'archived'],
      review: ['published', 'draft'],
      published: ['archived'],
      archived: ['draft'],
    },
    labels: {
      draft: 'Draft',
      review: 'In Review',
      published: 'Published',
      archived: 'Archived',
    },
  });
}

describe('LifecycleEngine', () => {
  // ── State ──

  it('should start at the initial state', () => {
    const engine = createEngine();
    expect(engine.state).toBe('draft');
  });

  it('should return the label for the current state', () => {
    const engine = createEngine();
    expect(engine.label()).toBe('Draft');
  });

  it('should return the label for any state', () => {
    const engine = createEngine();
    expect(engine.label('published')).toBe('Published');
  });

  it('should return the raw state string when no label exists', () => {
    const engine = createEngine('review');
    expect(engine.label()).toBe('In Review');
  });

  // ── Valid Transition ──

  it('should allow valid transition', () => {
    const engine = createEngine();
    const result = engine.transition('review');
    expect(result.success).toBe(true);
    expect(result.state).toBe('review');
  });

  it('should record transition in history', () => {
    const engine = createEngine();
    engine.transition('review');
    const history = engine.history();
    expect(history).toHaveLength(1);
    expect(history[0].from).toBe('draft');
    expect(history[0].to).toBe('review');
  });

  it('should record transition timestamp', () => {
    const engine = createEngine();
    const result = engine.transition('review');
    expect(result.transition!.timestamp).toBeTruthy();
  });

  it('should record actor and reason', () => {
    const engine = createEngine();
    const result = engine.transition('review', {}, 'admin', 'Ready for review');
    expect(result.transition!.actor).toBe('admin');
    expect(result.transition!.reason).toBe('Ready for review');
  });

  // ── Invalid Transition ──

  it('should reject invalid transition', () => {
    const engine = createEngine();
    const result = engine.transition('published'); // draft → published is invalid
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should NOT change state on invalid transition', () => {
    const engine = createEngine();
    const before = engine.state;
    engine.transition('published');
    expect(engine.state).toBe(before);
  });

  it('should NOT record history on invalid transition', () => {
    const engine = createEngine();
    engine.transition('published');
    expect(engine.history()).toHaveLength(0);
  });

  // ── Can Transition ──

  it('should check if transition is allowed', () => {
    const engine = createEngine();
    expect(engine.canTransition('review')).toBe(true);
    expect(engine.canTransition('published')).toBe(false);
  });

  it('should list allowed transitions', () => {
    const engine = createEngine();
    const allowed = engine.allowedTransitions();
    expect(allowed).toContain('review');
    expect(allowed).toContain('archived');
    expect(allowed).not.toContain('published');
  });

  // ── Multi-step ──

  it('should allow multi-step transitions', () => {
    const engine = createEngine();
    engine.transition('review');
    engine.transition('published');
    expect(engine.state).toBe('published');
    expect(engine.history()).toHaveLength(2);
  });

  // ── Rollback ──

  it('should rollback to previous state', () => {
    const engine = createEngine();
    engine.transition('review');
    const result = engine.rollback();
    expect(result.success).toBe(true);
    expect(engine.state).toBe('draft');
  });

  it('should fail rollback with no history', () => {
    const engine = createEngine();
    const result = engine.rollback();
    expect(result.success).toBe(false);
    expect(result.error).toContain('No previous state');
  });

  it('should rollbackTo a specific state in history', () => {
    const engine = createEngine();
    // draft → review → draft (allowed: review → draft is a valid transition)
    engine.transition('review');
    const result = engine.rollbackTo('draft');
    expect(result.success).toBe(true);
    expect(engine.state).toBe('draft');
  });

  // ── Reset ──

  it('should reset to initial state and clear history', () => {
    const engine = createEngine();
    engine.transition('review');
    engine.reset();
    expect(engine.state).toBe('draft');
    expect(engine.history()).toHaveLength(0);
  });

  // ── Transition Count ──

  it('should track transition count', () => {
    const engine = createEngine();
    expect(engine.transitionCount).toBe(0);
    engine.transition('review');
    expect(engine.transitionCount).toBe(1);
    engine.transition('published');
    expect(engine.transitionCount).toBe(2);
  });

  // ── Validation Hooks ──

  it('should run validators on transition', () => {
    const engine = new LifecycleEngine<States>({
      initialState: 'draft',
      transitions: { draft: ['review'], review: [], published: [], archived: [] },
      validators: {
        'draft→review': (ctx) => {
          if (!ctx.metadata['approved']) return 'Approval required';
          return null;
        },
      },
    });

    // Without approval
    const fail = engine.transition('review');
    expect(fail.success).toBe(false);
    expect(fail.error).toBe('Approval required');

    // With approval
    const pass = engine.transition('review', { approved: true });
    expect(pass.success).toBe(true);
  });

  // ── Different initial state ──

  it('should accept different initial state', () => {
    const engine = createEngine('review');
    expect(engine.state).toBe('review');
    expect(engine.canTransition('published')).toBe(true);
    expect(engine.canTransition('archived')).toBe(false);
  });
});
