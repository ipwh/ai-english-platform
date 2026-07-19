-- CreateTable: StudentMastery
CREATE TABLE "StudentMastery" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "subSkill" TEXT NOT NULL,
    "masteryScore" INTEGER NOT NULL DEFAULT 0,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "retentionScore" INTEGER NOT NULL DEFAULT 0,
    "lastPracticedAt" TIMESTAMP(3),
    "practiceCount" INTEGER NOT NULL DEFAULT 0,
    "mistakeCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentMastery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentMastery_studentId_skill_subSkill_key" ON "StudentMastery"("studentId", "skill", "subSkill");

-- CreateIndex
CREATE INDEX "StudentMastery_studentId_idx" ON "StudentMastery"("studentId");

-- CreateIndex
CREATE INDEX "StudentMastery_studentId_skill_idx" ON "StudentMastery"("studentId", "skill");
