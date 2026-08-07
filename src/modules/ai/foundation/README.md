# Shared PromptOps Foundation

The reusable infrastructure layer that every PromptOps module builds upon.

## 1. Purpose

The Foundation eliminates duplicated patterns across all PromptOps modules (prompt-versioning, regression, experiments, continuous-evaluation). It provides generic, strongly-typed, dependency-free primitives for:

- **Registry operations** — CRUD, versioning, history, immutable reads
- **Runner lifecycle** — beforeRun → execute → afterRun → error → cleanup
- **Pipeline execution** — validate → prepare → execute → aggregate → persist → report
- **State machines** — configurable lifecycle with transition validation and rollback
- **Report generation** — pluggable Markdown/JSON/Console renderers
- **Event-driven communication** — typed event bus with priority ordering
- **Metrics collection** — counters, gauges, histograms, timers, rolling averages
- **Persistent storage** — abstract Repository with in-memory implementation
- **Validation** — composable validation rules with error collection

## 2. Dependency Direction

```
PromptOps Modules (prompt-versioning, regression, experiments, continuous-evaluation)
        ↓
Foundation (this module)
```

Foundation must NEVER import from PromptOps modules. The dependency direction is strictly one-way.

## 3. Module Map

| Module | Location | Primary Class |
|--------|----------|---------------|
| Registry | `registry/` | `BaseRegistry<T>`, `VersionedRegistry<T>`, `HistoryRegistry<T>` |
| Runner | `runner/` | `BaseRunner<TInput, TOutput>`, `PipelineRunner` |
| Lifecycle | `lifecycle/` | `LifecycleEngine<S>`, `StandardLifecycleState` |
| Report | `report/` | `ReportBuilder<TData>`, `MarkdownRenderer`, `JSONRenderer` |
| Events | `events/` | `EventBus`, `EventDispatcher`, typed events |
| Metrics | `metrics/` | `MetricsCollector`, `Counter`, `Gauge`, `Histogram`, `Timer` |
| Storage | `storage/` | `Repository<T>`, `MemoryStore<T>` |
| Validation | `validation/` | `validate()`, `assert()`, `collectErrors()` |

## 4. BaseRegistry Usage

```ts
import { BaseRegistry } from '@/modules/ai/foundation';

interface MyItem { id: string; name: string; }
const registry = new BaseRegistry<MyItem>();
registry.register({ id: 'a', name: 'Alpha' });
registry.get('a');            // { id: 'a', name: 'Alpha' } (defensive copy)
registry.list();              // all items (defensive copies)
registry.find(item => ...);   // filtered search
registry.exists('a');         // true
registry.update('a', { name: 'Beta' });
registry.remove('a');
registry.size();              // number of items
registry.clear();
```

**Important**: `list()`, `get()`, and `find()` return deep copies via `structuredClone`. Mutating returned objects does NOT affect the stored state.

## 5. VersionedRegistry Usage

```ts
import { VersionedRegistry, type VersionedEntity } from '@/modules/ai/foundation';

interface PromptVersion extends VersionedEntity {
  name: string;
  version: string;
  groupKey?: string;  // set to 'name' for version grouping
  template: string;
}

const registry = new VersionedRegistry<PromptVersion>();
registry.register({ id: 'reading@1.0.0', name: 'reading', version: '1.0.0', groupKey: 'reading', template: '...' });
registry.register({ id: 'reading@2.0.0', name: 'reading', version: '2.0.0', groupKey: 'reading', template: '...' });

registry.latest('reading');          // v2.0.0
registry.previous('reading');        // v1.0.0
registry.versionHistory('reading');  // [v2.0.0, v1.0.0]
registry.getVersion('reading', '1.0.0');  // exact version lookup
registry.listLatest();               // latest of all groups
```

## 6. BaseRunner Usage

```ts
import { BaseRunner, type RunnerContext } from '@/modules/ai/foundation';

class MyRunner extends BaseRunner<MyInput, MyOutput, MyOptions> {
  protected async execute(ctx: RunnerContext, input: MyInput, options?: MyOptions): Promise<MyOutput> {
    // Core logic here
    return { ... };
  }

  protected async afterRun(ctx: RunnerContext, output: MyOutput): Promise<void> {
    // Post-processing (optional override)
  }

  protected async onError(ctx: RunnerContext, error: {...}): Promise<void> {
    // Error handling (optional override)
  }
}

const runner = new MyRunner();
const result = await runner.run({ input: myInput });
// result.success, result.data, result.durationMs
```

**Guarantees**:
- `cleanup()` always executes, even if `execute()` throws
- `afterRun()` does NOT execute after a failed `execute()`
- Lifecycle order: beforeRun → execute → afterRun → cleanup (success) or beforeRun → execute → onError → cleanup (failure)

## 7. LifecycleEngine Usage

```ts
import { LifecycleEngine } from '@/modules/ai/foundation';

type States = 'draft' | 'review' | 'published' | 'archived';

const engine = new LifecycleEngine<States>({
  initialState: 'draft',
  transitions: {
    draft: ['review', 'archived'],
    review: ['published', 'draft'],
    published: ['archived'],
    archived: ['draft'],
  },
  validators: {
    'review→published': (ctx) => {
      if (!ctx.metadata.approved) return 'Approval required';
      return null;
    },
  },
});

engine.transition('review', { approved: true });  // succeeds
engine.canTransition('published');                  // true
engine.rollback();                                  // back to previous state
engine.history();                                   // full transition history
```

## 8. ReportBuilder Usage

```ts
import { ReportBuilder, MarkdownRenderer, JSONRenderer } from '@/modules/ai/foundation';

const builder = new ReportBuilder<MyData>()
  .register(new MarkdownRenderer((data) => [`## ${data.title}`, `Score: ${data.score}`]))
  .register(new JSONRenderer());

builder.build('markdown', myData);    // RenderedReport
builder.render('json', myData);       // raw string
builder.export('json', myData);       // alias for render
builder.buildAll(myData);             // all formats at once
```

## 9. EventBus Usage

```ts
import { EventBus } from '@/modules/ai/foundation';

const bus = new EventBus();

// Subscribe
bus.on('experiment:completed', (event) => {
  console.log(`Experiment ${event.experimentName} completed`);
});

// Once
bus.once('prompt:released', (event) => {
  deployPrompt(event.version);
});

// Wildcard
bus.onAny((event) => {
  logger.info(`Event: ${event.type}`);
});

// Publish
bus.emit({
  type: 'experiment:completed',
  timestamp: new Date().toISOString(),
  experimentId: 'exp-1',
  experimentName: 'Reading V12',
  hasWinner: true,
  winnerVariantId: 'B',
  confidenceScore: 95,
  durationMs: 12000,
});
```

## 10. MetricsCollector Usage

```ts
import { MetricsCollector } from '@/modules/ai/foundation';

const collector = new MetricsCollector();

// Counter (monotonically increasing)
const evals = collector.counter('evaluations_total');
evals.inc();

// Gauge (up/down)
const active = collector.gauge('active_runs');
active.set(5);

// Histogram (distribution)
const latency = collector.histogram('eval_latency_ms');
latency.observe(150);

// Timer (duration measurement)
const timer = collector.timer('response_time');
const { result, durationMs } = await timer.timeAsync(() => runEval());

// Rolling average
const avg = collector.rollingAverage('score_avg', 50);
avg.push(92);

// Export all
const snapshots = collector.export();
```

## 11. Repository Usage

```ts
import { MemoryStore } from '@/modules/ai/foundation';

const store = new MemoryStore<MyEntity>();
await store.save({ id: 'a', name: 'Alpha' });
await store.load('a');                            // defensive copy
await store.list({ filter: e => e.name === 'Alpha' });
await store.exists('a');
await store.delete('a');
await store.count();
store.clear();
```

To create a production backend (e.g., Prisma), extend `Repository<T>` and implement `save`, `load`, `delete`, `exists`, `list`.

## 12. Validator Usage

```ts
import { validate, assert, required, minLength, range } from '@/modules/ai/foundation';

const result = validate(myObject, [
  required('name'),
  minLength('name', 3),
  range('age', 0, 120),
]);

if (!result.valid) {
  console.error(result.errors);
}

// Or throw on failure:
assert(myObject, [required('name')]);
```

## 13. Rules for Extending Foundation

1. **Compose, don't inherit** — prefer delegating to a Foundation primitive over extending it, unless inheritance is explicitly the intended pattern (e.g., `BaseRunner`)
2. **Preserve immutability** — if you override `cloneItem()`, maintain deep cloning semantics
3. **Follow SOLID** — single responsibility per class, open for extension via hooks
4. **No external dependencies** — Foundation stays pure TypeScript
5. **Export from barrel** — add new symbols to `index.ts`

## 14. Rules for PromptOps Modules Consuming Foundation

1. **Import from `@/modules/ai/foundation`** — use the barrel export, not deep imports
2. **Do not reimplement Foundation patterns** — no custom Maps for registry, no custom state machines, no custom event emitters
3. **Use composition** — wrap Foundation primitives in your module's class, don't expose them directly unless it makes semantic sense
4. **Preserve your public API** — Foundation integration should be internal; your callers should not know about it

## 15. When NOT to Create a New Abstraction

**Do not introduce a new abstraction merely because two modules share similar code.** Prefer composition with an existing Foundation primitive only when the behavior is genuinely the same.

Signs you should NOT abstract:
- The two implementations have different edge cases
- The two implementations will diverge in the next sprint
- The "shared" behavior is coincidental, not fundamental
- The abstraction would require parameterizing more than 3 things

Signs you SHOULD use Foundation:
- The same Map/CRUD/state/event pattern appears verbatim in 3+ modules
- The behavior contract is identical across all consumers
- There's a clear, stable interface boundary
- Tests for the pattern are duplicated across modules

Abstraction-for-abstraction's-sake is the root of over-engineering. Foundation exists to remove genuine duplication, not to create architectural ceremonies.
