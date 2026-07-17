# Changelog

All notable changes to the AI English Platform are documented here.
This file is extracted from `README.md` for better maintainability.

---

## 2026-07-17 — Security Hardening & Production Readiness

### 🔒 Authorization Fixes (Critical)
- **`api-auth.ts`**: Fixed `role=undefined` bypass bug — allowedRoles check no longer short-circuits when role is missing
- **`api-auth.ts`**: Added `assertOwnership()` and `verifyOwnership()` helper functions for consistent resource-level authorization
- **`mistakes/route.ts`**: Added ownership checks to all CRUD operations (POST/GET/PATCH/DELETE) — students can only access their own mistakes
- **`vocabulary/route.ts`**: Added ownership checks to POST/GET — students can only access their own vocabulary
- **`assignments/[id]/route.ts`**: Teacher view (`?teacher=true`) now requires JWT authentication + teacher/admin role (was completely unauthenticated)
- **`teacher/students/[id]/route.ts`**: Non-admin teachers can only view students in their own classes (via `TeacherClass` check)
- **`gamification/route.ts`**: Added ownership checks to GET/POST — students can only view/record their own gamification data
- **`daily-challenge/route.ts`**: Added ownership check — students can only access their own daily challenge
- **`vocabulary/spelling/route.ts`**: Added ownership checks to GET/POST
- **`vocabulary/review-suggestions/route.ts`**: Added authentication + ownership check (was completely unauthenticated)
- **`vocabulary/suggest/route.ts`**: Added authentication + ownership check (was completely unauthenticated)

### 🐛 Bug Fixes
- **`AudioPlayer.tsx`**: Fixed React Rules of Hooks violation — moved `typeof window === 'undefined'` early return after all hooks, replaced with `isClient` state pattern; `handlePlayWebSpeech` no longer depends on closure `synth` variable
- **`ai-service.test.ts`**: Fixed 2 failing `WritingAnalysisSchema` tests — added required `dseLevel` field to test fixture
- **`logger.ts`**: Renamed `module` variable to `mod` to avoid Next.js `no-assign-module-variable` warning

### ⚙️ DevOps
- **`vercel-build.js`**: Switched from `prisma db push` to `prisma migrate deploy` for production builds; production now fails fast if migration fails
- **`db.ts`**: Added `@typescript-eslint/no-require-imports` to ESLint disable comments (intentional — require() needed for sync singleton init)
- **`rate-limiter.ts`**: Updated outdated comment (30 → 60 req/60s to match config)
- **`vercel.json`**: Fixed CORS `Access-Control-Allow-Origin` from non-interpolated `${VERCEL_URL}` to actual deployment URL
- **`.github/workflows/ci.yml`**: Added CI pipeline (typecheck + test + lint with PostgreSQL service)

### 📊 Summary
- **Modified files**: 17
- **New files**: 2 (`.github/workflows/ci.yml`, `CHANGELOG.md`)
- **Tests**: 178 passed / 0 failed
- **TypeScript errors**: 0

---

## 2026-07-16 — Code Quality Upgrade v2

### RAG pgvector + AI Cache + Structured Logging + Test Expansion

#### 🔴 High Priority
| # | Item | Files |
|---|------|-------|
| 1 | **RAG pgvector upgrade**: Added `MaterialChunk.embeddingVector` column (`vector(1536)`), `rag-service.ts` auto-detects pgvector extension and uses `$queryRaw` for DB-level cosine similarity search (`<=>` operator), falls back to in-memory when not installed | `prisma/schema.prisma`, `rag-service.ts`, `prisma/migrations/pgvector-setup.sql` |
| 2 | **AI Response Cache** (`AI_CACHE_ENABLED=true`): New `src/lib/ai-cache.ts`, SHA-256 hash key + Vercel KV / in-memory dual-mode backend, TTL default 1 hour (`AI_CACHE_TTL_MS`), auto-caches low temperature (≤0.3) requests | `src/lib/ai-cache.ts`, `ai-service.ts` |
| 3 | **Unit test expansion**: 3 new test files — `gamification.test.ts` (35 tests), `rate-limiter.test.ts` (9 tests), `i18n.test.ts` (11 tests), all passing | `src/lib/__tests__/` × 3 |

#### 🟡 Medium Priority
| # | Item | Files |
|---|------|-------|
| 4 | **Structured logging**: New `src/lib/logger.ts`, 6 log levels (`LOG_LEVEL` env var), production JSON output (Vercel Log Drain compatible), dev human-readable format, `createModuleLogger()` factory | `src/lib/logger.ts`, `ai-service.ts`, `rag-service.ts` |
| 5 | **Unified API response type `ApiResponse<T>`**: New `src/lib/api-response.ts`, `success()`/`error()`/`jsonSuccess()`/`jsonError()` helpers, 10 standard error codes with auto HTTP status mapping | `src/lib/api-response.ts` |
| 6 | **ai-service.ts modularization**: Chinglish rules extracted to `chinglish-rules.json` (12 rules + `enabled` toggle) + `chinglish.ts`; AI cache extracted to `ai-cache.ts`; logging migrated to `logger.ts` | `chinglish-rules.json`, `chinglish.ts`, `ai-cache.ts`, `logger.ts` |

#### 📊 Stats
- **New files**: 9 | **Modified files**: 5 | **New tests**: 55 | **TypeScript errors**: 0

### DeepSeek Rate Limit Optimization
- **Rate Limiter**: `AI_RATE_LIMIT` increased from 30→60 req/60s/IP, supports 2 classes simultaneously
- **DeepSeek `user_id` isolation**: `callDeepSeek()` request body includes `user_id` for per-user scheduling isolation
- **Global userId propagation**: All 13 `LLMCallOptions` include `userId` field; 11 AI API routes extract `userId` from `verifyApiAuth()`
- **Security fix**: `analyze-integrated-skills` route had missing `verifyApiAuth()` — now fixed

---

## 2026-07-15 — Vocabulary 3.0 & Infrastructure Refactoring

### 📚 Vocabulary 3.0 — Spelling Practice + Seamless Add + Mobile Audit
- **Spelling Practice**: `SpellingSession` + `SpellingAttempt` DB models; `GET/POST /api/vocabulary/spelling` API (4 modes: new/random/weakest/due); `SpellingPractice` UI component
- **Inline Add-to-Vocab**: `InlineWordBadge`, `TextSelectionPopup`, `VocabEnabledText`, `AddToVocabButton` components
- **Mobile Audit**: 26 files / 20 fixes (flex-wrap, long-press, touch targets, modal constraints, iOS keyboard)

### 🏗️ Infrastructure Refactoring — Centralized Config + Security
- **Centralized config**: New `src/lib/config.ts` — unified DeepSeek/Gemini/Vertex/JWT/RateLimit/Upload/DB/Cache settings
- **Middleware security**: Removed `'default-secret-change-me'` hardcoded fallback; production throws on missing secrets
- **Legacy hash migration tracking**: `trackLegacyUsage()` counter + monitoring API
- **Body Size Validation**: Materials route: 10MB limit + extension whitelist + Zod validation
- **API Cache Headers**: `GET /api/materials` now includes `ETag` + `Cache-Control`
- **Refactored 6 modules** to use centralized config

### 🔐 Pre-Deployment Security Audit + Quality Fixes (P0-P2)
- **P0 Critical**: API auth for 15 routes (classes/vocabulary/admin-login-logs + 12 AI routes), notification i18n, DSE topic validation, Materials CRUD
- **P1 High**: Global Error Boundary, Integrated Skills draft persistence, AudioPlayer fallback indicator, UI bug fixes, writing `alert()`→Toast
- **P2 Medium**: DSE blacklist persistence, QuickAddVocab close button, writing auto-save indicator, vocab PDF export
- **Stats**: 65 files modified, 60+ new i18n keys, 19 API routes secured, 0 TypeScript errors

---

## 2026-07-14 — DSE Topic Diversity v2.1 & Pre-Deployment Fixes

### DSE Empirical Topic Database
- **Writing (Paper 2)**: 12 categories × 48+ topics
- **Reading (Paper 1)**: 9 categories × 45+ topics
- **Listening (Paper 3)**: 6 categories × 42+ topics
- All topics derived from real DSE past papers (2012-2024)

### New Features (6)
- Grammar Diagnostic (40 grammar points radar chart)
- Daily Challenge (streak bonus + XP)
- Reading Comprehension (Literal→Inferential→Evaluative)
- AI Writing Model Essays (L3/L4/L5 sample essays)
- Student Topic Preferences (10 categories bilingual)
- Vocabulary Real PDF Export (pdfkit)

### Must-Fix (12 items, all fixed before deployment)
- Vercel Serverless Timeout: 30s→8s default (configurable via `AI_TIMEOUT_MS`)
- Admin/Debug endpoint production guards
- All sensitive APIs authenticated via `verifyApiAuth()`
- Listening Audio stability (retry race condition + onvoiceschanged clobbering)
- Integrated Skills step locking, Data Persistence, Notification i18n
- Teacher Dashboard real KPIs, error states, alert→inline messages

### Should-Fix (15 items) & Nice-to-Have (15 items)
See full CHANGELOG for detailed tables of all 30 items covering Zod validation, error UI consistency, rate limiter upgrade, CSP headers, streak service, speaking practice, parent reports, SSE notifications, pgvector migration, and more.

---

## 2026-07-14 — Security Hardening + Integrated Skills v4 + E2E Test Plan

### 🔐 Security Must-Fix
- `/api/admin/ensure-admin`: production guard (404 in production)
- `/api/auth/debug`: production guard
- `/api/admin/login-logs` POST: dual auth (JWT + NextAuth fallback)
- `/api/auth/login`: rate limiting (5 req/60s/IP, 429 + Retry-After)
- All sensitive APIs now use unified `verifyApiAuth()` (diagnostic, mistakes, vocabulary, practice, gamification, srs/review, classes)
- New `src/lib/api-auth.ts`: unified API auth helper supporting JWT + NextAuth dual verification

### 🎧✍️ Integrated Skills v4 — Full Rewrite
- Step locking system (Step 2 unlocked after listening; Step 3 unlocked after notes)
- StepIndicator component (3-step ring indicator with active/done/disabled states)
- Auto-save upgrade: 5s→15s interval, 2.5s visual feedback
- ResultView rewrite: dual-dimension scores + 3-dimension progress bars + Captured/Missed Points + Over-copy Warnings
- Return-to-edit: one-click return to writing stage after grading
- Mobile bottom tabs + Desktop sidebar
- Zustand Store v4: new `listeningCompleted`/`activeStep`/`playbackProgress`/`playbackSpeed` state + 6 new actions

---

## 2026-07-13 — AudioPlayer Controls & Listening Stability

### ⏯️ AudioPlayer Playback Controls
- **Pause/Resume**: `handlePause()`/`handleResume()` — Cloud TTS uses `Audio.pause()`/`Audio.play()`, Web Speech uses `speechSynthesis.pause()`/`speechSynthesis.resume()`
- **Stop button**: Independent ■ stop button visible during play/pause, full audio resource cleanup
- **Three-state UI**: Idle (▶️) → Playing (⏸️ + ■) → Paused (▶️ + ■)

### 🔧 Integrated Skills Fixes
- React Error #31: `noteTakingGuide` type fixed from `string[]` to `{ question: string; hint: string }[]`
- "Wo Man" text split: regex now includes `\b` word boundary
- Listening text collapsed by default (`showListeningText` toggle)
- Grading result rewrite: now uses actual AI response fields

### 🎧 Listening Audio Stability (Rounds 1-3)
- Playback state machine refactored with unified `cleanupAllPlayback()` helper
- Session ID guard `sessionIdRef` prevents stale callback triggers
- `parseDialogue()` rewritten: regex-based line-by-line speaker+text extraction
- Voice Cache `voicesRef`: caches female/male/default voice on mount
- Complete event listener cleanup in all cleanup paths
- Frontend-backend consistency fix (`/api/tts` `multiSpeaker` default)
- AI generation safety nets: `sanitizeListeningLine()`, `validateListeningContent()`, `normalizeListeningContent()`, `cleanListeningContent()`

---

## 2026-07-12 — Cloud TTS, Integrated Skills Frontend, Data Architecture

### ☁️ Google Cloud Text-to-Speech Integration
- Server-side TTS using `@google-cloud/text-to-speech` + GCP service account
- Multi-speaker dialogue: per-segment independent synthesis + MP3 `Buffer.concat()` concatenation
- Dual-mode AudioPlayer: `useCloudTTS` prop for listening questions, Web Speech for vocabulary
- Auto-fallback: Cloud TTS failure → browser Web Speech API

### 🆕 Integrated Skills Frontend
- New page `/student/integrated-skills` — DSE Paper 3 Part B "Listen→Note→Write" 4-stage workflow
- Stages: Config → Listening+Notes → Writing → Result

### 🗄️ Data Architecture Upgrade
- New models: `PracticeAnswer`, `XpTransaction`, `VocabMasteryLog`, `MistakeReviewLog`, `DiagnosticResult`, `ListeningSession`, `ListeningAnswer`, `WeeklySnapshot`
- Teacher student detail page upgrade: XP/badges/skill accuracy bar chart/mistake type distribution/weekly progress trends

### 🔍 DSE RAG Integration
- Past paper import script (`scripts/import-past-papers.ts`): 20 OCR-extracted DSE papers + Marking Schemes
- Enhanced RAG retrieval: `retrieveDSERelevantChunks()`, `retrieveMarkingScheme()`, `retrievePastPaperContent()`, `buildDSEContextPrompt()`
- 5 core AI flows connected: generateQuestions, analyzeAnswer, analyzeWriting, explainMistake, answerStudyHelp
- Feature flag: `DSE_RAG_ENABLED=true`

### ✍️ DSE Writing Upgrade
- 6 text types with complete structure guides, mandatory elements, and common errors
- 10 common Chinglish patterns auto-detection
- 8 high-score strategies (PEEL, Show Don't Tell, Concession+Rebuttal, etc.)
- Real-time writing assistance: static + AI-adaptive mode

---

## 2026-07-12 — Code Review & Type Safety

### Code Review Fixes (50 findings: 5 Critical / 16 High / 17 Medium / 12 Low)
- **Critical**: Vocabulary API error codes (200→500), RAG vector search memory protection (`take: 500`), `isDeepSeekConfigured()` verification
- **High**: Vocabulary i18n completion, ErrorBoundary i18n
- **Medium**: `serializeVocab()` deduplication, RAG LIMIT additions

### Type Safety Enhancement
- Eliminated 48 instances of `: any`/`as any` across teacher dashboard, review, student detail, vocabulary, quiz, admin routes

### Test Expansion
- 29→123 tests (+94): SRS algorithm (27), serializeVocab (4), vocabulary schema+SRS (22), answer consistency (41)

---

## 2026-07-11 — Major Feature Update

### 📚 Vocabulary 2.0
- AI word analysis (`POST /api/ai/analyze-word`): auto-analyze POS, all POS variants, primary/secondary Chinese meanings, grade-adaptive example sentences
- Quick-add: floating ⊕ button, global right-click selection, mistake book integration, batch import (30 words/batch)
- Vocab cards: expandable details (synonyms/antonyms/collocations/POS variants), ★ mastery rating (0-5 stars), familiarity + SRS
- Advanced filtering: search + familiarity chips + POS dropdown + 3 sort modes (recent/alpha/mastery)
- Export: CSV, Anki TSV, PDF print
- AI review suggestions (`GET /api/vocabulary/review-suggestions`): SRS + mastery + mistake cross-analysis, priority categorization

### 🎮 Gamification System
- XP experience points, level system (Lv.1-20)
- Achievement badges (12 types: streak, accuracy, practice volume, writing, vocabulary)
- Anonymous class leaderboard
- Real-time XP notification toast with bounce animation

### ✨ Other Major Features
- Interactive writing revision: AI rewrite with side-by-side diff view
- Tiered writing feedback: concise/detailed modes
- SRS (Spaced Repetition System): SM-2 algorithm based daily review scheduling
- Skeleton loaders for practice and writing pages
- Profile gamification: XP progress bar, level badge, unlocked achievements, streak fire animation

### 🌐 Internationalization (i18n)
- 330+ i18n translation keys covering all student/teacher/admin pages
- Full bilingual support for all UI elements
- Core utility functions: `getGreeting(lang?)`, `getSkill/Difficulty/Grade/StatusLabel()` dual-language helpers
- 150+ additional keys in second review round

### 🐛 Bug Fixes
- Mistake book: fixed missing `studentId` causing mistakes to never load
- Vocabulary: fixed missing `studentId` causing words to never load
- React Error #300: fixed `useEffect` hook called after conditional early return
- LuvVoice/TTS removal: removed `edge-tts` dependency, simplified AudioPlayer to Web Speech API only
- API 500 errors: fixed gamification/mistakes/srs/review APIs failing due to un-pushed schema columns
- React Hydration Error #418/#300: fixed UTC vs local time mismatch, Zustand store SSR/CSR inconsistency
- Various UI fixes across 15+ pages

### 🧪 Testing
- 22 vocabulary tests: AI schema validation, SRS algorithm, serialization, deduplication
- All tests passing

---

## 2026-07-16 Update Log

### 🎤 Speaking Practice Enhancement (2 commits)
- Content-only analysis + customizable prep time
- Crash fix on submit + enforce Traditional Chinese

### 🚀 Platform Enhancement (1 commit)
- OnboardingGuard mandatory diagnostic flow
- Teacher route Middleware JWT/NextAuth dual protection
- New pages: `/student/speaking`, `/student/daily-challenge`, `/student/reading`
- Plagiarism detection (n-gram over-copy detection)

### 📝 Spelling & Vocabulary Enhancements (3 commits)
- Word selection support for spelling practice
- iPad tap-to-add touch event overhaul v3
- Vocab 3.1: selection mode + date sorting + selected word quiz

### 🧹 Code Quality (2 commits)
- Dead code cleanup + Reading page zh toggle
- Removed orphaned duplicate cleanup code

### 🧪 E2E Testing (5 commits)
- Comprehensive E2E test suite (6 scenarios, 22 tests)
- Import path fixes, playwright config relocation, Vitest exclusion

### 🔔 Notifications & Settings (1 commit)
- Notification preferences cross-device sync + unified settings page

### ⚙️ DevOps & Fixes (2 commits)
- Config defaults + devops-check.js
- Google Sheets env var name fix

### 📄 Documentation (1 commit)
- Staging smoke test checklist (44 checkpoints)

**Daily stats: 17 commits + 1 pending fix covering Speaking, Daily Challenge, Reading, Spelling, Vocabulary, E2E, Notifications, DevOps — 8 major domains**

---

*This changelog is maintained as part of the AI English Platform project. For the full README with setup instructions, architecture overview, and deployment guide, see [README.md](./README.md).*
