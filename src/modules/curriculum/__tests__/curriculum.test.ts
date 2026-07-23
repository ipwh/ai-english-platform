// Sprint 26: Curriculum Engine — Unit Tests
import { describe, it, expect } from 'vitest';
import { curriculumEngine } from '../services/curriculum-engine';
import { HKDSE_CURRICULUM } from '../data/hkdse-curriculum';
import {
  CEFR_GLOBAL_SCALE, CEFR_CAN_DO_DESCRIPTORS,
  getCEFRDescriptors, getCEFRLevelProfile,
} from '../data/cefr-descriptors';
import {
  DSE_PAPER_WEIGHTINGS, DSE_LEVEL_DESCRIPTORS, DSE_TEXT_TYPES,
  DSE_PAPER3_TASK_TYPES, DSE_COMMON_TOPICS,
  HKDSE_CEFR_ALIGNMENT, GRADE_EXPECTATIONS,
} from '../data/hkdse-enhanced';

describe('CurriculumEngine', () => {
  it('should list available curricula', () => {
    const list = curriculumEngine.listCurricula();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(c => c.id === 'hkdse-english')).toBe(true);
  });

  it('should get HKDSE curriculum', () => {
    const c = curriculumEngine.getCurriculum('hkdse-english');
    expect(c).toBeDefined();
    expect(c!.name).toBe('HKDSE English Language');
    expect(c!.courses.length).toBe(6);
  });

  it('should get course by ID', () => {
    const course = curriculumEngine.getCourse('hkdse-english', 'hkdse-s1-foundation');
    expect(course).toBeDefined();
    expect(course!.name).toBe('S1 English Foundation');
    expect(course!.units.length).toBe(2);
  });

  it('should get unit by ID', () => {
    const unit = curriculumEngine.getUnit('hkdse-english', 's1-u1');
    expect(unit).toBeDefined();
    expect(unit!.lessons.length).toBe(3);
  });

  it('should filter courses by grade', () => {
    const courses = curriculumEngine.getCoursesByGrade('hkdse-english', 'S1');
    expect(courses.length).toBe(1);
    expect(courses[0].gradeLevel).toBe('S1');
  });

  it('should get next course in sequence', () => {
    const next = curriculumEngine.getNextCourse('hkdse-english', 'hkdse-s1-foundation');
    expect(next).toBeDefined();
    expect(next!.id).toBe('hkdse-s2-intermediate');
  });

  it('should return undefined for last course', () => {
    const next = curriculumEngine.getNextCourse('hkdse-english', 'hkdse-s6-exam');
    expect(next).toBeUndefined();
  });

  it('should calculate progress with no completed lessons', () => {
    const progress = curriculumEngine.calculateProgress('hkdse-english', 's1', [], [], '2026-07-01');
    expect(progress.overallProgress).toBe(0);
    expect(progress.courseProgress.length).toBe(6);
  });

  it('should calculate progress with some completed lessons', () => {
    const completed = ['tenses-simple', 'parts-of-speech', 's1-grammar-practice'];
    const progress = curriculumEngine.calculateProgress('hkdse-english', 's1', completed, [], '2026-07-01');
    expect(progress.overallProgress).toBeGreaterThan(0);
  });

  it('should generate recommendations for incomplete lessons', () => {
    const recs = curriculumEngine.generateRecommendations('hkdse-english', [], []);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].type).toBe('next-lesson');
  });

  it('should recommend next lesson after completing previous', () => {
    const completed = ['tenses-simple', 'parts-of-speech', 's1-grammar-practice'];
    const recs = curriculumEngine.generateRecommendations('hkdse-english', completed, []);
    const nextRec = recs.find(r => r.type === 'next-lesson');
    expect(nextRec).toBeDefined();
  });

  it('should get knowledge node IDs from curriculum', () => {
    const ids = curriculumEngine.getKnowledgeNodeIds('hkdse-english');
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain('tenses-simple');
  });

  it('should check prerequisites — no prerequisites = met', () => {
    const met = curriculumEngine.arePrerequisitesMet('hkdse-english', 'hkdse-s1-foundation', []);
    expect(met).toBe(true);
  });

  it('should handle unknown curriculum gracefully', () => {
    expect(curriculumEngine.getCurriculum('unknown')).toBeUndefined();
    expect(curriculumEngine.getCourse('unknown', 'x')).toBeUndefined();
    expect(curriculumEngine.listCurricula().length).toBeGreaterThan(0);
  });

  it('should return undefined for non-existent course/unit', () => {
    expect(curriculumEngine.getCourse('hkdse-english', 'nope')).toBeUndefined();
    expect(curriculumEngine.getUnit('hkdse-english', 'nope')).toBeUndefined();
  });
});

describe('HKDSE_Curriculum', () => {
  it('should have correct metadata', () => {
    expect(HKDSE_CURRICULUM.metadata.totalCourses).toBe(6);
    expect(HKDSE_CURRICULUM.type).toBe('hkdse');
    expect(HKDSE_CURRICULUM.gradeLevels).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
  });

  it('every course should have at least one unit', () => {
    for (const course of HKDSE_CURRICULUM.courses) {
      expect(course.units.length).toBeGreaterThan(0);
    }
  });

  it('every unit should have at least one lesson', () => {
    for (const course of HKDSE_CURRICULUM.courses) {
      for (const unit of course.units) {
        expect(unit.lessons.length).toBeGreaterThan(0);
      }
    }
  });

  it('every lesson should have knowledge mapping', () => {
    for (const course of HKDSE_CURRICULUM.courses) {
      for (const unit of course.units) {
        for (const lesson of unit.lessons) {
          expect(lesson.knowledgeMapping.length).toBeGreaterThan(0);
          expect(lesson.learningObjectives.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ============================================
// Enhanced CEFR Data Tests
// ============================================

describe('CEFR_Descriptors', () => {
  it('should have 6 levels in global scale', () => {
    expect(CEFR_GLOBAL_SCALE.length).toBe(6);
    expect(CEFR_GLOBAL_SCALE[0].level).toBe('C2');
    expect(CEFR_GLOBAL_SCALE[5].level).toBe('A1');
  });

  it('every level should have a non-empty description', () => {
    for (const d of CEFR_GLOBAL_SCALE) {
      expect(d.description.length).toBeGreaterThan(50);
    }
  });

  it('should have Can-Do descriptors for all 5 skills × 6 levels', () => {
    const skills = new Set(CEFR_CAN_DO_DESCRIPTORS.map(d => d.skill));
    expect(skills.size).toBe(5);
    expect(CEFR_CAN_DO_DESCRIPTORS.length).toBe(30); // 6 levels × 5 skills
  });

  it('getCEFRDescriptors should return descriptors for B2 writing', () => {
    const desc = getCEFRDescriptors('B2', 'writing');
    expect(desc.length).toBeGreaterThan(0);
    expect(desc[0]).toContain('clear');
  });

  it('getCEFRLevelProfile should return all 5 skills', () => {
    const profile = getCEFRLevelProfile('B1');
    expect(Object.keys(profile).length).toBe(5);
    expect(profile.listening.length).toBeGreaterThan(0);
    expect(profile.writing.length).toBeGreaterThan(0);
  });

  it('each Can-Do entry should have at least 1 descriptor', () => {
    for (const entry of CEFR_CAN_DO_DESCRIPTORS) {
      expect(entry.descriptors.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ============================================
// Enhanced HKDSE Data Tests
// ============================================

describe('HKDSE_Enhanced', () => {
  it('DSE paper weightings should sum to 1.0', () => {
    const sum = Object.values(DSE_PAPER_WEIGHTINGS).reduce((s, p) => s + p.weight, 0);
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('should have 5 DSE papers/components', () => {
    expect(Object.keys(DSE_PAPER_WEIGHTINGS).length).toBe(5);
  });

  it('should have 7 DSE level descriptors (1 to 5**)', () => {
    expect(DSE_LEVEL_DESCRIPTORS.length).toBe(7);
    expect(DSE_LEVEL_DESCRIPTORS[0].level).toBe(1);
    expect(DSE_LEVEL_DESCRIPTORS[6].level).toBe(7);
  });

  it('DSE level descriptors should have UCAS tariff points', () => {
    const level3 = DSE_LEVEL_DESCRIPTORS.find(d => d.level === 3);
    expect(level3?.ucasPoints).toBe(16);
    const level5Star = DSE_LEVEL_DESCRIPTORS.find(d => d.level === 7);
    expect(level5Star?.ucasPoints).toBe(64);
  });

  it('should have 12+ DSE text types', () => {
    expect(DSE_TEXT_TYPES.length).toBeGreaterThanOrEqual(12);
  });

  it('every text type should have common features', () => {
    for (const tt of DSE_TEXT_TYPES) {
      expect(tt.commonFeatures.length).toBeGreaterThan(0);
      expect(tt.papers.length).toBeGreaterThan(0);
    }
  });

  it('should have 6 DSE Paper 3 task types', () => {
    expect(DSE_PAPER3_TASK_TYPES.length).toBe(6);
  });

  it('should have 10 DSE common topics', () => {
    expect(DSE_COMMON_TOPICS.length).toBe(18);
  });

  it('HKDSE-CEFR alignment should map all 7 levels', () => {
    expect(Object.keys(HKDSE_CEFR_ALIGNMENT).length).toBe(7);
    expect(HKDSE_CEFR_ALIGNMENT[3]).toBe('B1');
    expect(HKDSE_CEFR_ALIGNMENT[7]).toBe('C1');
  });

  it('should have grade expectations for all 6 grade levels', () => {
    expect(GRADE_EXPECTATIONS.length).toBe(6);
    expect(GRADE_EXPECTATIONS[0].gradeLevel).toBe('S1');
    expect(GRADE_EXPECTATIONS[5].gradeLevel).toBe('S6');
  });

  it('grade expectations should increase per grade', () => {
    const s1Grammar = GRADE_EXPECTATIONS[0].expectedSkills.grammar?.targetAccuracy || 0;
    const s6Grammar = GRADE_EXPECTATIONS[5].expectedSkills.grammar?.targetAccuracy || 0;
    expect(s6Grammar).toBeGreaterThan(s1Grammar);
  });
});
