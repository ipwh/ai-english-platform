-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "nameZh" TEXT,
    "nameEn" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "avatar" TEXT,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "classId" TEXT,
    "classNumber" TEXT,
    "level" TEXT,
    "overallAccuracy" DOUBLE PRECISION,
    "academicYear" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "badgeIds" TEXT NOT NULL DEFAULT '[]',
    "subjects" TEXT,
    "department" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "darkMode" BOOLEAN NOT NULL DEFAULT false,
    "sidebarOpen" BOOLEAN NOT NULL DEFAULT true,
    "notifAssignment" BOOLEAN NOT NULL DEFAULT true,
    "notifSubmission" BOOLEAN NOT NULL DEFAULT true,
    "notifFeedback" BOOLEAN NOT NULL DEFAULT true,
    "notifAchievement" BOOLEAN NOT NULL DEFAULT true,
    "notifSystem" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL DEFAULT '2026-2027',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherClass" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "isFormTeacher" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TeacherClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentClass" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "className" TEXT,
    "classId" TEXT,
    "targetType" TEXT NOT NULL DEFAULT 'class',
    "gradeLevel" TEXT NOT NULL,
    "strand" TEXT NOT NULL,
    "grammarItem" TEXT,
    "languageSkill" TEXT,
    "difficulty" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 5,
    "timeLimit" INTEGER,
    "dueDate" TIMESTAMP(3),
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentGroup" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "AssignmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentStudent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "AssignmentStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentQuestion" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssignmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "humanReviewedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionAttempt" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "clientSubmissionId" TEXT,
    "score" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "awardedScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "countsTowardScore" BOOLEAN NOT NULL,
    "evaluator" TEXT NOT NULL,
    "scoringMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionSummary" TEXT NOT NULL DEFAULT '',
    "studentAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "mistakeType" TEXT NOT NULL,
    "languageSkill" TEXT,
    "grammarItem" TEXT,
    "questionType" TEXT,
    "skillSource" TEXT,
    "aiExplanation" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "inReviewList" BOOLEAN NOT NULL DEFAULT false,
    "nextReviewDate" TIMESTAMP(3),
    "reviewInterval" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabItem" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "partOfSpeech" TEXT NOT NULL,
    "allPartOfSpeech" TEXT,
    "meaningZh" TEXT NOT NULL,
    "secondaryMeaningZh" TEXT,
    "exampleSentence" TEXT,
    "exampleZh" TEXT,
    "synonyms" TEXT,
    "antonyms" TEXT,
    "collocations" TEXT,
    "familiarity" TEXT NOT NULL DEFAULT 'new',
    "masteryLevel" INTEGER NOT NULL DEFAULT 0,
    "nextReviewDate" TIMESTAMP(3),
    "reviewInterval" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingDraft" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "draft" TEXT NOT NULL,
    "revisedVersion" TEXT,
    "revisions" TEXT,
    "aiSuggestions" TEXT,
    "chinglishWarnings" TEXT,
    "teacherComment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegratedSkillsDraft" (
    "userId" TEXT NOT NULL,
    "studentNotes" TEXT NOT NULL DEFAULT '',
    "studentWriting" TEXT NOT NULL DEFAULT '',
    "taskData" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'config',
    "activeStep" INTEGER NOT NULL DEFAULT 1,
    "listeningCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegratedSkillsDraft_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT,
    "content" TEXT,
    "tags" TEXT,
    "gradeLevel" TEXT,
    "strand" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "ocrStatus" TEXT NOT NULL DEFAULT 'none',
    "ragStatus" TEXT NOT NULL DEFAULT 'none',
    "fileSize" INTEGER,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialChunk" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" TEXT,
    "embeddingVector" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "skillZh" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "masteryAppliedAt" TIMESTAMP(3),
    "clientSubmissionId" TEXT,

    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "questionId" TEXT,
    "questionType" TEXT NOT NULL,
    "questionPrompt" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "studentAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "result" TEXT,
    "awardedScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "countsTowardScore" BOOLEAN DEFAULT true,
    "scoredBy" TEXT,
    "scoringMethod" TEXT,
    "timeSpent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingQuestion" (
    "id" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "dseType" TEXT,
    "questionText" TEXT NOT NULL,
    "choices" TEXT,
    "answer" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "passageTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarQuestion" (
    "id" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptZh" TEXT,
    "choices" TEXT,
    "answer" TEXT NOT NULL,
    "acceptedAnswers" TEXT,
    "grammarItem" TEXT,
    "languageSkill" TEXT,
    "difficulty" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "explanationZh" TEXT,
    "explanationEn" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'ai-generated',
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT,
    "questionPrompt" TEXT NOT NULL,
    "studentAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT,
    "aiScore" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "teacherScore" DOUBLE PRECISION,
    "teacherFeedback" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "LoginLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userName" TEXT,
    "role" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,

    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sessionsCount" INTEGER NOT NULL DEFAULT 0,
    "xpGained" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "wordsLearned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticResult" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "skillZh" TEXT NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weakAreas" TEXT NOT NULL,
    "recommendedGrammar" TEXT,
    "recommendedSkill" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "xpAmount" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabMasteryLog" (
    "id" TEXT NOT NULL,
    "vocabId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromLevel" TEXT NOT NULL,
    "toLevel" TEXT NOT NULL,
    "fromMastery" INTEGER NOT NULL,
    "toMastery" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabMasteryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MistakeReviewLog" (
    "id" TEXT NOT NULL,
    "mistakeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MistakeReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListeningQuestion" (
    "id" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "listeningType" TEXT,
    "questionText" TEXT NOT NULL,
    "choices" TEXT,
    "answer" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "dialogue" TEXT,
    "dialogueZh" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'ai-generated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListeningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpellingSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "totalWords" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'in-progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SpellingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpellingAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "vocabId" TEXT,
    "word" TEXT NOT NULL,
    "meaningZh" TEXT NOT NULL,
    "explanationEn" TEXT,
    "studentInput" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpellingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningMemory" (
    "studentId" TEXT NOT NULL,
    "memoryJson" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningMemory_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE "LearningReviewSchedule" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "skillDimension" TEXT,
    "title" TEXT,
    "titleZh" TEXT,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "quality" INTEGER NOT NULL DEFAULT 0,
    "estimatedMastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masteryConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "isMastered" BOOLEAN NOT NULL DEFAULT false,
    "currentDifficulty" TEXT NOT NULL DEFAULT 'core',
    "difficultyAdjustment" TEXT NOT NULL DEFAULT 'maintain',
    "adaptiveFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "retrievalStrength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "timesIncorrect" INTEGER NOT NULL DEFAULT 0,
    "reviewStrength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "retentionProbability" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastReflection" TEXT,
    "reflectionNotes" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewPriority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewUrgency" TEXT NOT NULL DEFAULT 'low',
    "recommendationReason" TEXT,
    "recommendationReasonZh" TEXT,
    "recommendedStrategy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningReviewSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "DiagnosticStats" (
    "id" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticStudentStat" (
    "id" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lastScore" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticStudentStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDailyUsage" (
    "dayKey" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiDailyUsage_pkey" PRIMARY KEY ("dayKey")
);

-- CreateTable
CREATE TABLE "IeltsTest" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "origin" TEXT NOT NULL DEFAULT 'CATALOGUE',
    "ownerUserId" TEXT,
    "contentSource" TEXT NOT NULL DEFAULT '{"type":"ORIGINAL_GENERATED"}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IeltsTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsSection" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "instructions" TEXT,
    "passageText" TEXT,
    "transcriptText" TEXT,
    "wordCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsQuestion" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "sectionId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "questionType" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT,
    "answerKey" TEXT,
    "acceptedAnswers" TEXT,
    "wordLimit" TEXT,
    "evidence" TEXT,
    "explanation" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "difficultyModel" TEXT,
    "contentSource" TEXT NOT NULL DEFAULT '{"type":"ORIGINAL_GENERATED"}',
    "generatorVersion" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'QA_REQUIRED',
    "validationNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "activeKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "rawScore" INTEGER,
    "totalItems" INTEGER,
    "bandEstimate" TEXT,
    "metadata" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IeltsAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "rawAnswer" TEXT NOT NULL,
    "verdict" TEXT,
    "scoringDetail" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsGenerationQuota" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IeltsGenerationQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPracticeSet" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "interpretation" TEXT,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT,
    "verificationMeta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomPracticeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPracticeQuestion" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "questionType" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answerKey" TEXT NOT NULL,
    "acceptedAnswers" TEXT NOT NULL DEFAULT '[]',
    "rejectedAnswers" TEXT NOT NULL DEFAULT '[]',
    "rubric" TEXT NOT NULL,
    "targetRule" TEXT NOT NULL,
    "explanationZh" TEXT,
    "explanationEn" TEXT NOT NULL,
    "misconceptionTags" TEXT NOT NULL DEFAULT '[]',
    "maxMarks" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CustomPracticeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPracticeSubmission" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),
    "awardedMarks" INTEGER,
    "totalMarks" INTEGER,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "overallFeedback" TEXT,
    "overallFeedbackZh" TEXT,
    "gradingModel" TEXT,
    "gradingPromptVersion" TEXT,

    CONSTRAINT "CustomPracticeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPracticeResponse" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "awardedMarks" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "rationaleZh" TEXT,
    "referenceAnswer" TEXT NOT NULL,
    "acceptedAlternatives" TEXT NOT NULL DEFAULT '[]',
    "improvement" TEXT,
    "improvementZh" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomPracticeResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsAssessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT,
    "skill" TEXT NOT NULL,
    "taskType" TEXT,
    "promptVersion" TEXT NOT NULL,
    "rubricVersion" TEXT,
    "assessmentSource" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "failureCode" TEXT,
    "estimatedBand" DOUBLE PRECISION,
    "languageBandEstimate" DOUBLE PRECISION,
    "criteria" TEXT,
    "taskCoverage" TEXT,
    "taskTypeAnalysis" TEXT,
    "prepContent" TEXT,
    "evidence" TEXT,
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "pronunciation" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "usage" TEXT,
    "promptHash" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsCalibrationRecord" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "aiBand" DOUBLE PRECISION NOT NULL,
    "humanBand" DOUBLE PRECISION,
    "humanMarkerRef" TEXT,
    "pairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsCalibrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_classId_idx" ON "User"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_name_key" ON "Class"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherClass_teacherId_classId_key" ON "TeacherClass"("teacherId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentClass_studentId_classId_key" ON "StudentClass"("studentId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_studentId_key" ON "GroupMember"("groupId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentGroup_assignmentId_groupId_key" ON "AssignmentGroup"("assignmentId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentStudent_assignmentId_studentId_key" ON "AssignmentStudent"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

-- CreateIndex
CREATE INDEX "Submission_assignmentId_idx" ON "Submission"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_key" ON "Submission"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "SubmissionAttempt_submissionId_idx" ON "SubmissionAttempt"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAttempt_submissionId_attemptNumber_key" ON "SubmissionAttempt"("submissionId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAttempt_submissionId_clientSubmissionId_key" ON "SubmissionAttempt"("submissionId", "clientSubmissionId");

-- CreateIndex
CREATE INDEX "SubmissionAnswer_attemptId_idx" ON "SubmissionAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "SubmissionAnswer_questionId_idx" ON "SubmissionAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAnswer_attemptId_questionId_key" ON "SubmissionAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Mistake_studentId_idx" ON "Mistake"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_studentId_questionId_key" ON "Mistake"("studentId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabItem_word_studentId_key" ON "VocabItem"("word", "studentId");

-- CreateIndex
CREATE INDEX "PracticeSession_studentId_idx" ON "PracticeSession"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSession_studentId_clientSubmissionId_key" ON "PracticeSession"("studentId", "clientSubmissionId");

-- CreateIndex
CREATE INDEX "PracticeAnswer_sessionId_idx" ON "PracticeAnswer"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAnswer_sessionId_questionId_key" ON "PracticeAnswer"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "ReadingQuestion_createdAt_idx" ON "ReadingQuestion"("createdAt");

-- CreateIndex
CREATE INDEX "GrammarQuestion_createdAt_idx" ON "GrammarQuestion"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "LoginLog_userId_idx" ON "LoginLog"("userId");

-- CreateIndex
CREATE INDEX "LoginLog_loginAt_idx" ON "LoginLog"("loginAt");

-- CreateIndex
CREATE INDEX "WeeklySnapshot_userId_idx" ON "WeeklySnapshot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySnapshot_userId_weekStart_key" ON "WeeklySnapshot"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "DiagnosticResult_studentId_idx" ON "DiagnosticResult"("studentId");

-- CreateIndex
CREATE INDEX "DiagnosticResult_completedAt_idx" ON "DiagnosticResult"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "XpTransaction_idempotencyKey_key" ON "XpTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "XpTransaction_userId_idx" ON "XpTransaction"("userId");

-- CreateIndex
CREATE INDEX "XpTransaction_createdAt_idx" ON "XpTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "VocabMasteryLog_vocabId_idx" ON "VocabMasteryLog"("vocabId");

-- CreateIndex
CREATE INDEX "VocabMasteryLog_studentId_idx" ON "VocabMasteryLog"("studentId");

-- CreateIndex
CREATE INDEX "MistakeReviewLog_mistakeId_idx" ON "MistakeReviewLog"("mistakeId");

-- CreateIndex
CREATE INDEX "MistakeReviewLog_studentId_idx" ON "MistakeReviewLog"("studentId");

-- CreateIndex
CREATE INDEX "ListeningQuestion_createdAt_idx" ON "ListeningQuestion"("createdAt");

-- CreateIndex
CREATE INDEX "SpellingSession_studentId_idx" ON "SpellingSession"("studentId");

-- CreateIndex
CREATE INDEX "SpellingAttempt_sessionId_idx" ON "SpellingAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "SpellingAttempt_vocabId_idx" ON "SpellingAttempt"("vocabId");

-- CreateIndex
CREATE INDEX "LearningReviewSchedule_studentId_idx" ON "LearningReviewSchedule"("studentId");

-- CreateIndex
CREATE INDEX "LearningReviewSchedule_studentId_nextReviewAt_idx" ON "LearningReviewSchedule"("studentId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "LearningReviewSchedule_studentId_itemType_idx" ON "LearningReviewSchedule"("studentId", "itemType");

-- CreateIndex
CREATE UNIQUE INDEX "LearningReviewSchedule_studentId_itemId_key" ON "LearningReviewSchedule"("studentId", "itemId");

-- CreateIndex
CREATE INDEX "StudentMastery_studentId_idx" ON "StudentMastery"("studentId");

-- CreateIndex
CREATE INDEX "StudentMastery_studentId_skill_idx" ON "StudentMastery"("studentId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "StudentMastery_studentId_skill_subSkill_key" ON "StudentMastery"("studentId", "skill", "subSkill");

-- CreateIndex
CREATE INDEX "StudentMistakeSummary_studentId_idx" ON "StudentMistakeSummary"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentMistakeSummary_studentId_grammarCategory_key" ON "StudentMistakeSummary"("studentId", "grammarCategory");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticStats_gradeLevel_skill_key" ON "DiagnosticStats"("gradeLevel", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticStudentStat_gradeLevel_skill_studentId_key" ON "DiagnosticStudentStat"("gradeLevel", "skill", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsTest_slug_key" ON "IeltsTest"("slug");

-- CreateIndex
CREATE INDEX "IeltsTest_testType_skill_status_idx" ON "IeltsTest"("testType", "skill", "status");

-- CreateIndex
CREATE INDEX "IeltsTest_origin_ownerUserId_createdAt_idx" ON "IeltsTest"("origin", "ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsSection_testId_orderIndex_key" ON "IeltsSection"("testId", "orderIndex");

-- CreateIndex
CREATE INDEX "IeltsQuestion_testId_orderIndex_idx" ON "IeltsQuestion"("testId", "orderIndex");

-- CreateIndex
CREATE INDEX "IeltsQuestion_skill_validationStatus_idx" ON "IeltsQuestion"("skill", "validationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsAttempt_activeKey_key" ON "IeltsAttempt"("activeKey");

-- CreateIndex
CREATE INDEX "IeltsAttempt_userId_skill_idx" ON "IeltsAttempt"("userId", "skill");

-- CreateIndex
CREATE INDEX "IeltsAttempt_userId_startedAt_idx" ON "IeltsAttempt"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsResponse_attemptId_questionId_key" ON "IeltsResponse"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsGenerationQuota_ownerUserId_dayKey_bucket_key" ON "IeltsGenerationQuota"("ownerUserId", "dayKey", "bucket");

-- CreateIndex
CREATE INDEX "CustomPracticeSet_ownerUserId_createdAt_idx" ON "CustomPracticeSet"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPracticeQuestion_setId_orderIndex_key" ON "CustomPracticeQuestion"("setId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPracticeSubmission_setId_key" ON "CustomPracticeSubmission"("setId");

-- CreateIndex
CREATE INDEX "CustomPracticeSubmission_ownerUserId_submittedAt_idx" ON "CustomPracticeSubmission"("ownerUserId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPracticeResponse_submissionId_questionId_key" ON "CustomPracticeResponse"("submissionId", "questionId");

-- CreateIndex
CREATE INDEX "IeltsAssessment_userId_skill_createdAt_idx" ON "IeltsAssessment"("userId", "skill", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsCalibrationRecord_assessmentId_key" ON "IeltsCalibrationRecord"("assessmentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClass" ADD CONSTRAINT "StudentClass_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClass" ADD CONSTRAINT "StudentClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentGroup" ADD CONSTRAINT "AssignmentGroup_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentGroup" ADD CONSTRAINT "AssignmentGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentStudent" ADD CONSTRAINT "AssignmentStudent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentStudent" ADD CONSTRAINT "AssignmentStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQuestion" ADD CONSTRAINT "AssignmentQuestion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAnswer" ADD CONSTRAINT "SubmissionAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SubmissionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabItem" ADD CONSTRAINT "VocabItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingDraft" ADD CONSTRAINT "WritingDraft_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegratedSkillsDraft" ADD CONSTRAINT "IntegratedSkillsDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialChunk" ADD CONSTRAINT "MaterialChunk_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAnswer" ADD CONSTRAINT "PracticeAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpellingSession" ADD CONSTRAINT "SpellingSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpellingAttempt" ADD CONSTRAINT "SpellingAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpellingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsSection" ADD CONSTRAINT "IeltsSection_testId_fkey" FOREIGN KEY ("testId") REFERENCES "IeltsTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsQuestion" ADD CONSTRAINT "IeltsQuestion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "IeltsTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsQuestion" ADD CONSTRAINT "IeltsQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "IeltsSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAttempt" ADD CONSTRAINT "IeltsAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAttempt" ADD CONSTRAINT "IeltsAttempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "IeltsTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsResponse" ADD CONSTRAINT "IeltsResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "IeltsAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsResponse" ADD CONSTRAINT "IeltsResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "IeltsQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeSet" ADD CONSTRAINT "CustomPracticeSet_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeQuestion" ADD CONSTRAINT "CustomPracticeQuestion_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CustomPracticeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeSubmission" ADD CONSTRAINT "CustomPracticeSubmission_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CustomPracticeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeResponse" ADD CONSTRAINT "CustomPracticeResponse_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CustomPracticeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeResponse" ADD CONSTRAINT "CustomPracticeResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CustomPracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAssessment" ADD CONSTRAINT "IeltsAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAssessment" ADD CONSTRAINT "IeltsAssessment_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "IeltsAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsCalibrationRecord" ADD CONSTRAINT "IeltsCalibrationRecord_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "IeltsAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
