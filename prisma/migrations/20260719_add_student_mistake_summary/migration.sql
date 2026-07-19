-- CreateTable: StudentMistakeSummary
CREATE TABLE "StudentMistakeSummary" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "grammarCategory" TEXT NOT NULL,
    "mistakeCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "trend" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentMistakeSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentMistakeSummary_studentId_grammarCategory_key" ON "StudentMistakeSummary"("studentId", "grammarCategory");

-- CreateIndex
CREATE INDEX "StudentMistakeSummary_studentId_idx" ON "StudentMistakeSummary"("studentId");
