# AI Experiment Platform — Documentation

**Sprint 42** | Module: `src/modules/experiment`

## Overview

The AI Experiment Platform enables controlled, systematic comparison of AI configurations in a production-safe manner. All experiments are gated behind a feature flag (`experiment: false` by default) to prevent accidental execution in production.

## Architecture

```
src/modules/experiment/
├── types.ts                              # All experiment types
├── services/
│   └── experiment-engine.ts              # ExperimentService (singleton)
├── __tests__/
│   └── experiment-engine.test.ts         # Vitest tests
├── index.ts                              # Barrel exports

src/app/api/experiment/route.ts           # POST /api/experiment
```

## Experiment Types

| Type | Purpose | Key Outputs |
|------|---------|-------------|
| **Prompt** | Compare prompt versions | Variant rankings, A/B winner, scoring breakdown |
| **Model** | Compare AI model providers | Provider rankings, model leaderboard, cost/speed |
| **Temperature** | Find optimal temperature setting | Creativity vs coherence curves, optimal temp |
| **Learning** | Measure learning interventions | Learning gain, mastery improvement, effect sizes |

## API Reference

**POST** `/api/experiment` (Teacher/Admin only, feature flag required)

### Prompt Experiments

```json
// Create
{ "action": "create-prompt", "name": "...", "description": "...", "variants": [...], "testCases": [...] }
// Run
{ "action": "run-prompt", "experimentId": "prompt_exp_..." }
```

### Model Experiments

```json
// Create
{ "action": "create-model", "name": "...", "description": "...", "models": [...], "testCases": [...] }
// Run
{ "action": "run-model", "experimentId": "model_exp_..." }
```

### Temperature Experiments

```json
// Create
{ "action": "create-temperature", "name": "...", "description": "...", "modelProvider": "...", "modelName": "...", "temperatures": [0.1, 0.3, 0.5], "testCases": [...] }
// Run
{ "action": "run-temperature", "experimentId": "temp_exp_..." }
```

### Learning Experiments

```json
// Create
{ "action": "create-learning", "name": "...", "description": "...", "groups": [...], "preTestId": "...", "postTestId": "...", "duration": "4 weeks" }
// Run
{ "action": "run-learning", "experimentId": "learn_exp_..." }
```

### A/B Testing

```json
{ "action": "ab-test", "testId": "...", "nameA": "...", "nameB": "...", "scoresA": [...], "scoresB": [...], "latencyA": [...], "latencyB": [...], "costA": [...], "costB": [...] }
```

### Reports & Cost

```json
{ "action": "compare-costs", "experimentId": "..." }
{ "action": "report", "experimentId": "..." }
{ "action": "recommendation-report", "experimentId": "..." }
```

### Management

```json
{ "action": "get", "experimentId": "..." }
{ "action": "list" }
{ "action": "cancel", "experimentId": "..." }
{ "action": "all-data" }
{ "action": "clear" }
```

## Feature Flag

```typescript
import { isFeatureEnabled, setFeatureFlag } from '@/modules/production/services/production-ready';

// Default: false (production-safe)
isFeatureEnabled('experiment'); // → false

// Enable for testing:
setFeatureFlag('experiment', true);
isFeatureEnabled('experiment'); // → true
```

## Metric Dimensions

### Prompt & Model Experiments
- **Score** (0-1): Overall quality
- **Latency** (ms): Response time
- **Cost** (USD): Per-run cost
- **Consistency** (0-1): Output stability
- **Hallucination Risk** (0-1): Inverse safety
- **Rubric Accuracy** (0-1): Match with reference

### Temperature Experiments
- **Creativity** (0-1): Higher temp → more creative
- **Coherence** (0-1): Lower temp → more coherent
- **Combined Score**: 50% score + 30% coherence + 20% creativity

### Learning Experiments
- **Normalized Gain**: (post − pre) / (max − pre)
- **Cohen's d**: effect size approximation
- **Mastery Improvement**: percentage points gained

## A/B Comparison

All pairwise comparisons produce:
- Winner (A/B/tie) with confidence score
- P-value and effect size (Cohen's d)
- Bilingual recommendations (English + Chinese)

## Edge Cases Handled

- Single variant experiments (no AB comparison)
- Empty test cases (sample size = 0)
- Single temperature / single group
- Non-existent experiment lookup (returns null)
- Wrong experiment type on run (throws descriptive error)
- Cancelled experiments persist with status

## Production Safety

1. **Feature flag gate**: All actions check `isFeatureEnabled('experiment')`
2. **Role gate**: Teacher/Admin only via `verifyApiAuth`
3. **Simulated data**: No real AI calls — operates on deterministic/stochastic simulation
4. **In-memory**: No database writes, data cleared on restart
5. **Idempotent**: Creating → running → reporting is a safe pipeline

## Usage Flow

```
1. Create experiment → returns config with draft status
2. Run experiment → returns results with winner
3. Generate report → returns comprehensive report
4. Generate recommendation report → actionable next steps
5. Optionally: cancel, list, clear
```
