# AI English Platform — Architecture v5

> Generated: 2026-07-23 | v5 Reprioritization — Learning Impact First
> See also: [ARCHITECTURE_V4.md](ARCHITECTURE_V4.md) | [DOMAIN_AUDIT.md](DOMAIN_AUDIT.md) | [ARCHITECTURE.md](ARCHITECTURE.md)

---

## v5 Mission

Build the best AI English self-learning platform for one Hong Kong secondary school.

**Principles (in priority order):**
1. Learning effectiveness > AI sophistication
2. Teacher productivity > Technical novelty
3. Architecture quality > Feature quantity

---

## v5 Priority Roadmap

```
P0 (NOW)          P1 (NEXT)              P2 (LATER)
─────────         ─────────              ──────────
Route→db fix      Recommendation         TeacherFacade
Student Twin      Explainability         PlatformFacade
Learning Engine   Knowledge Graph        -v2 naming cleanup
                  Teacher Dashboard      Analytics deepening
```

---

## P0 — Critical (Learning Impact)

### P0-1: Eliminate Route → db Direct Access

**Problem**: 52 API routes import `db` from `@/shared/db/db` directly, bypassing the service → repository → database architecture.

**Why P0**: Every other improvement (Student Twin, Learning Engine, Recommendations) depends on clean data access. Routes that bypass services cannot update the Twin, cannot trigger learning events, and cannot contribute to analytics.

**Categorization**:

| Domain | Route Count | Has Service? | Has Repo? |
|--------|------------|-------------|-----------|
| Vocabulary | 6 | ✅ vocabulary-service | ✅ vocabulary-repo |
| Mistakes | 1 | ✅ mistake-tracker | ✅ mistake-repo |
| Writing | 1 | ✅ writing-coach | ❌ needs repo |
| Exercise | 1 | ✅ exercise-service | ✅ practice-repo |
| Diagnostic | 2 | ❌ needs service | ❌ needs repo |
| Feedback | 1 | ✅ assessment-service | ✅ assessment-repo |
| Reviews/SRS | 3 | ❌ needs service | ❌ needs repo |
| Assignments | 2 | ❌ needs service | ❌ needs repo |
| Materials | 1 | ❌ needs service | ✅ material-repo (in ai/) |
| Auth/Profile | 4 | ❌ needs service | ❌ needs repo |
| Classes/Groups | 2 | ❌ needs service | ❌ needs repo |
| Progress/Gamification | 2 | ✅ progress-service | ✅ progress-repo |
| Notifications | 2 | ❌ needs service | ✅ notification-repo |
| Admin (misc) | 16 | N/A (admin-only) | N/A |
| Teacher | 2 | ✅ teacher-copilot | ❌ |
| AI/Analytics | 1 | ✅ learning-analytics | ❌ |
| **Total** | **52** | | |

**Migration Strategy**: Batch by domain, highest learning impact first.
- Batch 1: Vocabulary + Writing + Mistakes + Exercise + Diagnostic (11 routes) — core learning path
- Batch 2: Reviews/SRS + Feedback + Assignments + Materials (8 routes) — practice loop
- Batch 3: Auth/Profile + Progress + Notifications (8 routes) — user state
- Batch 4: Classes/Groups + Teacher + AI (5 routes) — teacher tools
- Batch 5: Admin routes (16 routes) — lowest learning impact

### P0-2: Student Digital Twin — Single Learning State

**Problem**: The Student Twin (`student-twin/`) has most components but is missing the ForgetCurve, and is not consistently updated after every learning activity.

**v5 Required Components**:

| Component | Status | Action |
|-----------|--------|--------|
| Current Ability | ✅ `KnowledgeState.currentMastery` | — |
| Predicted Ability | ✅ `KnowledgeState.predictedMastery` (7d/30d/90d) | — |
| Grammar Mastery | ✅ Via SkillRank | — |
| Vocabulary Mastery | ✅ Via SkillRank | — |
| Writing Mastery | ✅ Via SkillRank | — |
| Reading Mastery | ✅ Via SkillRank | — |
| Listening Mastery | ✅ Via SkillRank | — |
| Weakness | ✅ `KnowledgeState.weakSkills` | — |
| Learning Memory | ✅ `retentionRate` | — |
| Confidence | ✅ `ConfidenceState` | — |
| Motivation | ✅ `MotivationState` | — |
| Learning Habit | ✅ `LearningHabit` | — |
| **Retention** | ⚠️ Scalar only | Add `RetentionState` component |
| **Forget Curve** | ❌ Missing | Add `ForgetCurve` component using Ebbinghaus from `learning-science` |
| Goals | ✅ `LearningGoals` | — |
| Recommendation History | ✅ `RecommendationSummary[]` | — |

**Implementation**:
1. Add `ForgetCurve` interface to `student-twin/types.ts`
2. Add `RetentionState` interface
3. Wire `studentTwinService` to compute forget curves from `learning-science` Ebbinghaus model
4. Ensure every route that modifies learning state also triggers a Twin update

### P0-3: Learning Engine — Sole Strategy Decider

**Problem**: While `adaptive-learning/pipeline` exists as an orchestrator, there's no hard enforcement that ALL exercise generation goes through it. Cross-module bypasses exist.

**v5 Rule**: "LLM never decides learning strategy. Learning Engine decides."

**Implementation**:
1. Fix cross-module bypasses (adaptive-learning → student-mastery, mistake-intelligence, knowledge-graph should go through facades)
2. Ensure all exercise generation routes delegate to `LearningFacade.executePipeline()`
3. Add architecture tests that verify no AI provider import exists in learning modules
4. Document the pipeline as the ONLY path for exercise generation

---

## P1 — High Priority (Explainability & Insights)

### P1-4: Recommendation Explainability

**Problem**: `RecommendationResult` outputs scored candidates but doesn't explain WHY in natural language.

**Missing fields**:

| Field | Type | Purpose |
|-------|------|---------|
| `reason` | `{ en: string; zh: string }` | Why this was recommended |
| `teacherExplanation` | `{ en: string; zh: string }` | Teacher-facing explanation |
| `studentExplanation` | `{ en: string; zh: string }` | Student-facing explanation |
| `expectedImprovement` | `number` | Estimated mastery gain (0-100) |
| `masteryBefore` | `number` | Current mastery score |
| `masteryAfter` | `number` | Predicted mastery after completion |

### P1-5: Knowledge Graph Expansion

**Problem**: `KnowledgeNode` is grammar-focused. Missing cross-skill relationships.

**New fields**:

| Field | Type | Purpose |
|-------|------|---------|
| `examFrequency` | `'annual' \| 'biennial' \| 'occasional' \| 'rare'` | DSE exam appearance frequency |
| `relatedVocabulary` | `string[]` | Vocabulary node IDs related to this grammar topic |
| `relatedWritingSkills` | `string[]` | Writing skill node IDs related to this topic |
| `relatedReadingSkills` | `string[]` | Reading skill node IDs related to this topic |

### P1-6: Proactive Teacher Dashboard

**Problem**: Teacher dashboard displays data but doesn't actively surface insights.

**New capabilities**:

| Question | Implementation |
|----------|---------------|
| Who needs intervention? | Risk threshold alert system |
| Which students improved? | Trend comparison over time |
| Which students stopped learning? | Inactivity detection (>7 days) |
| Which assignment next? | Ranked by class weakness × DSE importance |

---

## P2 — Later (Architecture Polish)

### P2-7: TeacherFacade + PlatformFacade

Create the two missing facade barrel files:
- `src/modules/teacher/index.ts` — wraps Copilot, Analytics, Dashboard
- `src/modules/platform/index.ts` — wraps Cache, Reliability, FeatureFlags, Health, Experiment, Notification

### P2-8: Module Naming Cleanup

- Merge `recommendation-v2/` into `recommendation/` (remove dead v1)
- Merge `writing-coach-v2/` into `writing-coach/`

### P2-9: Analytics Metrics Deepening

- Trend computation
- Prediction confidence intervals
- Learning Gain per recommendation
- Recommendation Success Rate

---

## Non-Negotiable Rules (Carried Forward)

1. Never break existing features
2. Never remove tests
3. Never bypass architecture (Route → Facade → Service → Repository → Database)
4. Never duplicate business logic
5. Never introduce `module-v2` or `service-v3` naming
6. Always refactor instead of duplicating
7. Always keep backward compatibility

## Dependency Rules (Enforced)

```
Allowed:
  Route → Facade → Service → Repository → Database

Forbidden:
  Route → Repository
  Route → Prisma (db.)
  Service → Another Domain's Repository
  Teacher → StudentRepository
  Learning → TeacherRepository
```

## Facade Architecture

```
API Routes (120+)
    ↓
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Student  │ Learning │ Teacher  │    AI    │ Platform │
│ Facade   │ Facade   │ Facade   │  Facade  │  Facade  │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ Profile  │ Engine   │ Copilot  │Providers │ Cache    │
│ Mastery  │ Rec V2   │ Analytics│Generate  │Reliable  │
│ Memory   │ KGraph   │ Dashboard│Analysis  │Features  │
│ Progress │ Science  │          │ RAG      │ Health   │
│ Twin     │MistakeI  │          │ TTS      │ Notify   │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

---

## Product Success Metrics (KPIs)

Every implementation should improve at least one:

- Student Weekly Learning Time
- Student Retention Rate
- Vocabulary Growth Rate
- Grammar Mastery Rate
- Writing Improvement Rate
- Teacher Time Saved
- Recommendation Accuracy
- Exercise Completion Rate

---

## v5 Sprint Plan

| Sprint | Focus | Effort |
|--------|-------|--------|
| **43** | P0-1 Batch 1-2: Core learning path routes → service layer | 16h |
| **44** | P0-1 Batch 3-4 + P0-2: Student Twin ForgetCurve | 14h |
| **45** | P0-3: Learning Engine hardening + P0-1 Batch 5 (admin) | 12h |
| **46** | P1-4, P1-5: Recommendation Explainability + KG expansion | 10h |
| **47** | P1-6: Proactive Teacher Dashboard | 10h |
| **48** | P2: Facades, naming cleanup, analytics deepening | 12h |
