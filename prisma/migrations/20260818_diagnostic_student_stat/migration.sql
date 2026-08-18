-- R3.10-L: per-student diagnostic contribution tracking.
-- Each student's LATEST diagnostic score per (gradeLevel, skill) is stored,
-- so the peer aggregate (DiagnosticStats) is updated by the delta and
-- repeated submissions can no longer inflate the peer average.
CREATE TABLE "DiagnosticStudentStat" (
    "id" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lastScore" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticStudentStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiagnosticStudentStat_gradeLevel_skill_studentId_key"
    ON "DiagnosticStudentStat"("gradeLevel", "skill", "studentId");
