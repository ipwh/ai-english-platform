# AI English Platform — Architecture

> Generated: 2026-07-18 | 17 Sprints | 328 tests | 18 modules

## Architecture Diagram

```mermaid
graph TB
    subgraph "Presentation Layer"
        ROUTES[API Routes<br/>83 route files]
        PAGES[Pages<br/>Next.js App Router]
    end

    subgraph "Validation Layer"
        ZOD[Zod Schemas<br/>17 validated routes]
    end

    subgraph "Service Layer"
        AI[AI Services<br/>20 services]
        LEARNING[Learning Engine<br/>6 services]
        PROFILE[Student Profile<br/>5 services]
        MISTAKE[Mistake DB<br/>4 services]
        VOCAB[Vocab Graph<br/>5 services]
        EVENTS[Domain Events<br/>pub/sub]
    end

    subgraph "Repository Layer"
        REPO[Repositories<br/>7 repos]
    end

    subgraph "Data Layer"
        DB[(PostgreSQL<br/>Neon)]
    end

    subgraph "Cross-Cutting"
        CACHE[Caching<br/>TTL Map]
        COST[AI Cost<br/>tracking]
        PERF[Performance<br/>optimization]
        SEC[Security<br/>sanitization]
        OBS[Observability<br/>metrics/tracing]
    end

    ROUTES --> ZOD
    ZOD --> AI
    ZOD --> LEARNING
    ZOD --> PROFILE
    ZOD --> MISTAKE
    ZOD --> VOCAB
    AI --> REPO
    LEARNING --> REPO
    PROFILE --> REPO
    MISTAKE --> REPO
    VOCAB --> REPO
    REPO --> DB

    EVENTS -.-> PROFILE
    EVENTS -.-> MISTAKE
    CACHE -.-> AI
    COST -.-> AI
    SEC -.-> ROUTES
    OBS -.-> AI
    OBS -.-> DB
```

## Module Dependency Diagram

```mermaid
graph LR
    AI[ai<br/>20 svc] --> PROMPTS[prompts<br/>v1.ts]
    AI --> RAG[rag-service]
    AI --> PROVIDERS[providers<br/>5 models]

    LEARNING[learning<br/>6 svc] --> PROFILE[profile<br/>5 svc]
    LEARNING --> MISTAKE[mistake-db<br/>4 svc]

    PROFILE --> STUDENT[student<br/>1 svc]
    PROFILE --> VOCAB[vocabulary<br/>2 svc]
    PROFILE --> PROGRESS[progress<br/>3 svc]

    MISTAKE --> ASSESS[assessment<br/>3 svc]
    MISTAKE --> EXERCISE[exercise<br/>1 svc]

    VOCAB_GRAPH[vocab-graph<br/>5 svc] --> VOCAB

    EVENTS[events<br/>pub/sub] -.-> PROFILE
    EVENTS -.-> PROGRESS

    CACHE[cache] -.-> AI
    COST[ai-cost] -.-> AI
    PERF[perf] -.-> DB
    SEC[security] -.-> ROUTES
    OBS[observability] -.-> AI
```

## Sequence Diagram — Practice Flow

```mermaid
sequenceDiagram
    actor S as Student
    participant R as API Route
    participant Z as Zod Schema
    participant ES as ExerciseService
    participant ER as ExerciseRepo
    participant DB as Database
    participant EB as EventBus
    participant PH as ProgressHandler
    participant AH as AchievementHandler

    S->>R: POST /api/practice
    R->>Z: validateRequest()
    Z-->>R: parsed body
    R->>ES: recordPractice()
    ES->>ER: createPracticeSession()
    ER->>DB: INSERT
    DB-->>ER: session
    ER-->>ES: session
    ES->>EB: emit('exercise:completed')
    EB->>PH: update stats
    EB->>AH: check achievements
    ES-->>R: session
    R-->>S: 200 OK
```

## Sprint History

| # | Sprint | Tests | Modules |
|---|--------|-------|---------|
| 1 | Folder Refactor | — | 8 |
| 2 | Repository Pattern | — | — |
| 3 | AI Provider DI | — | — |
| 4 | Service Layer | — | +6 |
| 5 | Prompt Management | — | — |
| 6 | Validation (Zod) | — | — |
| 7 | Learning Engine | +21 | `learning/` |
| 8 | Student Profile | +9 | `profile/` |
| 9 | Mistake Database | +12 | `mistake-db/` |
| 10 | Vocabulary Graph | +20 | `vocab-graph/` |
| 11 | Domain Events | +13 | `events/` |
| 12 | Caching | +14 | `cache/` |
| 13 | AI Cost Optimization | +16 | `ai-cost/` |
| 14 | Performance | +9 | `perf/` |
| 15 | Security | +15 | `security/` |
| 16 | Testing | +10 | 100% coverage |
| 17 | Observability | +11 | `observability/` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (Turbopack) |
| Language | TypeScript 5 (strict) |
| Database | PostgreSQL (Neon) + Prisma 7 |
| Auth | JWT (jose) + NextAuth v5 |
| AI | DeepSeek → Vertex Gemini → Gemini API |
| Validation | Zod v4 |
| Testing | Vitest 4 + Playwright |
| State | Zustand |
| CSS | Tailwind 4 |
