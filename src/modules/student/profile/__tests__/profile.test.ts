// Sprint 8: Student Learning Profile Tests
import { describe, it, expect } from 'vitest';
import { generateProfile } from '../services/profile-service';
import { aggregateSkillStats, mapToDimension, type PracticeRecord } from '../services/skill-tracker';
import { analyzeTopicPreferences, type TopicEngagement } from '../services/topic-preferences';
import { calculateLearningSpeed, type SessionRecord } from '../services/learning-speed';

// ============================================
// Skill Tracker Tests
// ============================================

describe('SkillTracker', () => {
  it('should map skills to correct dimensions', () => {
    expect(mapToDimension('tenses-simple')).toBe('grammar');
    expect(mapToDimension('passive-voice')).toBe('grammar');
    expect(mapToDimension('vocabulary')).toBe('vocabulary');
    expect(mapToDimension('writing')).toBe('writing');
    expect(mapToDimension('reading')).toBe('reading');
    expect(mapToDimension('speaking')).toBe('speaking');
    expect(mapToDimension('listening')).toBe('listening');
  });

  it('should aggregate practice records into dimension stats', () => {
    const records: PracticeRecord[] = [
      { skillId: 'tenses-simple', skillName: 'Simple Tenses', skillNameZh: '簡單時態', correct: true, practicedAt: new Date() },
      { skillId: 'tenses-simple', skillName: 'Simple Tenses', skillNameZh: '簡單時態', correct: false, practicedAt: new Date() },
      { skillId: 'present-perfect', skillName: 'Present Perfect', skillNameZh: '現在完成式', correct: true, practicedAt: new Date() },
      { skillId: 'writing', skillName: 'Writing', skillNameZh: '寫作', correct: true, practicedAt: new Date() },
      { skillId: 'vocabulary', skillName: 'Vocab', skillNameZh: '詞彙', correct: false, practicedAt: new Date() },
    ];
    const stats = aggregateSkillStats(records);

    expect(stats.grammar.totalAttempts).toBe(3);
    expect(stats.grammar.correctAttempts).toBe(2);
    expect(stats.grammar.accuracy).toBeCloseTo(2 / 3);
    expect(stats.grammar.subSkills.length).toBe(2);

    expect(stats.writing.totalAttempts).toBe(1);
    expect(stats.writing.accuracy).toBe(1);

    expect(stats.vocabulary.totalAttempts).toBe(1);
    expect(stats.vocabulary.accuracy).toBe(0);

    expect(stats.reading.totalAttempts).toBe(0);
  });

  it('should handle empty records', () => {
    const stats = aggregateSkillStats([]);
    for (const dim of ['grammar', 'vocabulary', 'writing', 'reading', 'speaking', 'listening'] as const) {
      expect(stats[dim].totalAttempts).toBe(0);
      expect(stats[dim].accuracy).toBe(0);
    }
  });
});

// ============================================
// Topic Preferences Tests
// ============================================

describe('TopicPreferences', () => {
  it('should rank topics by engagement count', () => {
    const engagements: TopicEngagement[] = [
      { topic: 'school club election', score: 80, engagedAt: new Date() },
      { topic: 'school club election', score: 90, engagedAt: new Date() },
      { topic: 'school club election', score: 70, engagedAt: new Date() },
      { topic: 'AI technology', score: 85, engagedAt: new Date() },
      { topic: 'AI technology', score: 95, engagedAt: new Date() },
      { topic: 'plastic ban', score: 60, engagedAt: new Date() },
    ];
    const prefs = analyzeTopicPreferences(engagements);

    expect(prefs.length).toBe(3);
    expect(prefs[0].topic).toBe('school club election');
    expect(prefs[0].engagementCount).toBe(3);
    expect(prefs[0].averageScore).toBe(80);
    expect(prefs[0].category).toBe('school');

    expect(prefs[1].topic).toBe('AI technology');
    expect(prefs[1].category).toBe('technology');

    expect(prefs[2].topic).toBe('plastic ban');
    expect(prefs[2].category).toBe('environment');
  });

  it('should classify topics correctly', () => {
    const engagements: TopicEngagement[] = [
      { topic: 'cyberbullying', score: 50, engagedAt: new Date() },
      { topic: 'summer internship', score: 70, engagedAt: new Date() },
      { topic: 'hong kong hiking', score: 80, engagedAt: new Date() },
    ];
    const prefs = analyzeTopicPreferences(engagements);
    expect(prefs[0].category).toBe('society');
    expect(prefs[1].category).toBe('career');
    expect(prefs[2].category).toBe('hk-local');
  });

  it('should handle empty engagements', () => {
    const prefs = analyzeTopicPreferences([]);
    expect(prefs.length).toBe(0);
  });
});

// ============================================
// Learning Speed Tests
// ============================================

describe('LearningSpeed', () => {
  it('should calculate speed metrics from sessions', () => {
    const now = new Date();
    const sessions: SessionRecord[] = [
      { questionCount: 10, correctCount: 7, durationMs: 600000, startedAt: now, wordsWritten: 200 },
      { questionCount: 15, correctCount: 10, durationMs: 900000, startedAt: new Date(now.getTime() - 86400000), vocabAdded: 5 },
      { questionCount: 8, correctCount: 6, durationMs: 480000, startedAt: new Date(now.getTime() - 2 * 86400000) },
    ];
    const speed = calculateLearningSpeed(sessions);

    expect(speed.questionsPerSession).toBe(11); // (10+15+8)/3 = 11
    expect(speed.totalSessions).toBe(3);
    expect(speed.sessionsLast7Days).toBe(3);
    expect(speed.vocabPerWeek).toBeGreaterThan(0);
    expect(speed.consistencyScore).toBeGreaterThan(0);
  });

  it('should return zeros for no sessions', () => {
    const speed = calculateLearningSpeed([]);
    expect(speed.totalSessions).toBe(0);
    expect(speed.questionsPerSession).toBe(0);
    expect(speed.consistencyScore).toBe(0);
  });
});

// ============================================
// Profile Service Tests
// ============================================

describe('ProfileService', () => {
  it('should generate a complete profile', () => {
    const now = new Date();
    const practiceRecords: PracticeRecord[] = [
      { skillId: 'tenses-simple', skillName: 'Simple Tenses', skillNameZh: '簡單時態', correct: true, practicedAt: now },
      { skillId: 'tenses-simple', skillName: 'Simple Tenses', skillNameZh: '簡單時態', correct: true, practicedAt: now },
      { skillId: 'present-perfect', skillName: 'Present Perfect', skillNameZh: '現在完成式', correct: false, practicedAt: now },
      { skillId: 'writing', skillName: 'Writing', skillNameZh: '寫作', correct: true, practicedAt: now },
    ];
    const sessions: SessionRecord[] = [
      { questionCount: 10, correctCount: 7, durationMs: 600000, startedAt: now, wordsWritten: 200 },
    ];
    const topicEngagements: TopicEngagement[] = [
      { topic: 'school club', score: 80, engagedAt: now },
      { topic: 'AI technology', score: 90, engagedAt: now },
    ];

    const profile = generateProfile({
      studentId: 'student-1',
      gradeLevel: 'S3',
      practiceRecords,
      sessions,
      topicEngagements,
      streakDays: 5,
      vocabularyStats: { total: 50, mastered: 30, learning: 15, dueForReview: 5 },
      weakAreaIds: ['present-perfect'],
      recommendedSkillIds: ['passive-voice', 'relative-clauses'],
    });

    expect(profile.studentId).toBe('student-1');
    expect(profile.gradeLevel).toBe('S3');
    expect(profile.totalQuestionsAnswered).toBe(4);
    expect(profile.overallAccuracy).toBe(0.75);
    expect(profile.totalPracticeSessions).toBe(1);
    expect(profile.currentStreak).toBe(5);

    // Skills
    expect(profile.skills.grammar.totalAttempts).toBe(3);
    expect(profile.skills.writing.totalAttempts).toBe(1);
    expect(profile.skills.reading.totalAttempts).toBe(0);

    // Topics
    expect(profile.preferredTopics.length).toBe(2);
    expect(profile.preferredTopics[0].topic).toBe('school club');

    // Learning speed
    expect(profile.learningSpeed.questionsPerSession).toBe(10);

    // Weak areas + recommendations
    expect(profile.weakAreas).toContain('present-perfect');
    expect(profile.recommendedSkills).toContain('passive-voice');

    // Vocabulary
    expect(profile.vocabulary.total).toBe(50);
    expect(profile.vocabulary.mastered).toBe(30);
    expect(profile.vocabulary.dueForReview).toBe(5);
  });
});
