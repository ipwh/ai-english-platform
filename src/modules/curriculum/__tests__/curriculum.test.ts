// Sprint 26: Curriculum Engine — Unit Tests
import { describe, it, expect } from 'vitest';
import { curriculumEngine } from '../services/curriculum-engine';
import { HKDSE_CURRICULUM } from '../data/hkdse-curriculum';

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
