-- 2026-09-18: AiDailyUsage — global daily AI usage ledger.
--
-- Makes the LLM budget gate (ai/runtime/budget-policy.ts) durable and global:
-- before this table the counters were per-process module state, so with
-- Cloud Run minScale 0 / maxScale 20 each instance enforced its own quota
-- (same day: one instance returned 503 for every AI call while another was
-- still fresh) and every cold start reset the daily cap.
--
-- One row per UTC calendar day. `tokens`/`costUsd` are estimates used only
-- for budget accounting, never for billing.
CREATE TABLE "AiDailyUsage" (
    "dayKey" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiDailyUsage_pkey" PRIMARY KEY ("dayKey")
);
