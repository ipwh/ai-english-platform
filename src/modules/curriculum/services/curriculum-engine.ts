// Sprint 26: CEFR Curriculum + Curriculum Engine
import type { Curriculum, Course, Unit, CurriculumProgress, CourseProgress, CurriculumRecommendation } from '../types';
import { hkToday } from '@/shared/utils/hk-date';
import { HKDSE_CURRICULUM } from '../data/hkdse-curriculum';
import type { MasteryData } from '@/modules/knowledge-graph/services/dependency-resolver';

const CEFR_CURRICULUM: Curriculum = {
  id: 'cefr-english', name: 'CEFR English', nameZh: 'CEFR 英語', type: 'cefr',
  description: 'Common European Framework of Reference for Languages',
  descriptionZh: '歐洲語言共同參考框架',
  gradeLevels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
  cefrRange: { from: 'A1', to: 'C1' },
  courses: [],
  metadata: { version: '1.0.0', totalCourses: 0, totalUnits: 0, totalLessons: 0, totalEstimatedHours: 0, lastUpdated: '2026-07-19', standardsAlignment: ['CEFR'] },
};

// ============================================
// Curriculum Engine
// ============================================

class CurriculumEngine {
  /** Get a curriculum by ID */
  getCurriculum(id: string): Curriculum | undefined {
    if (id === 'hkdse-english' || id === 'hkdse') return HKDSE_CURRICULUM;
    if (id === 'cefr-english' || id === 'cefr') return CEFR_CURRICULUM;
    return undefined;
  }

  /** List all available curricula */
  listCurricula(): Array<{ id: string; name: string; nameZh: string; type: string }> {
    return [HKDSE_CURRICULUM, CEFR_CURRICULUM].map(c => ({ id: c.id, name: c.name, nameZh: c.nameZh, type: c.type }));
  }

  /** Get a specific course */
  getCourse(curriculumId: string, courseId: string): Course | undefined {
    return this.getCurriculum(curriculumId)?.courses.find(c => c.id === courseId);
  }

  /** Get a specific unit */
  getUnit(curriculumId: string, unitId: string): Unit | undefined {
    for (const c of this.getCurriculum(curriculumId)?.courses || []) {
      const unit = c.units.find(u => u.id === unitId);
      if (unit) return unit;
    }
  }

  /** Get all courses for a grade level */
  getCoursesByGrade(curriculumId: string, grade: string): Course[] {
    return (this.getCurriculum(curriculumId)?.courses || []).filter(c => c.gradeLevel === grade);
  }

  /** Get next course in sequence */
  getNextCourse(curriculumId: string, currentCourseId: string): Course | undefined {
    const courses = this.getCurriculum(curriculumId)?.courses || [];
    const idx = courses.findIndex(c => c.id === currentCourseId);
    return idx >= 0 && idx < courses.length - 1 ? courses[idx + 1] : undefined;
  }

  /** Calculate student progress through a curriculum */
  calculateProgress(
    curriculumId: string,
    studentId: string,
    completedLessons: string[],
    masteryData: MasteryData[],
    startedAt: string,
  ): CurriculumProgress {
    const curriculum = this.getCurriculum(curriculumId);
    if (!curriculum) return { studentId, curriculumId, startedAt, lastActivityAt: startedAt, overallProgress: 0, courseProgress: [], recommendations: [] };

    const masteryMap = new Map(masteryData.map(m => [m.nodeId, m.currentMastery]));
    const courseProgress: CourseProgress[] = [];
    let totalLessons = 0, totalCompleted = 0;

    for (const course of curriculum.courses) {
      let courseCompleted = 0, courseTotal = 0;
      for (const unit of course.units) {
        for (const lesson of unit.lessons) {
          courseTotal++;
          if (completedLessons.includes(lesson.id)) courseCompleted++;
        }
      }
      totalLessons += courseTotal;
      totalCompleted += courseCompleted;

      const nodeIds = course.knowledgeNodeIds;
      const courseMastery = nodeIds.length > 0
        ? nodeIds.reduce((s, nid) => s + (masteryMap.get(nid) ?? 0), 0) / nodeIds.length : 0;

      courseProgress.push({
        courseId: course.id,
        completed: courseCompleted === courseTotal && courseTotal > 0,
        progress: courseTotal > 0 ? Math.round((courseCompleted / courseTotal) * 100) : 0,
        completedUnits: course.units.filter(u => u.lessons.every(l => completedLessons.includes(l.id))).length,
        totalUnits: course.units.length,
        completedLessons: courseCompleted,
        totalLessons: courseTotal,
        masteryScore: Math.round(courseMastery),
        timeSpentMinutes: 0,
      });
    }

    const recs = this.generateRecommendations(curriculumId, completedLessons, masteryData);

    return {
      studentId, curriculumId, startedAt, lastActivityAt: hkToday(),
      overallProgress: totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0,
      courseProgress, recommendations: recs,
    };
  }

  /** Generate what-to-do-next recommendations */
  generateRecommendations(
    curriculumId: string,
    completedLessons: string[],
    _masteryData: MasteryData[],
  ): CurriculumRecommendation[] {
    const curriculum = this.getCurriculum(curriculumId);
    if (!curriculum) return [];

    const recs: CurriculumRecommendation[] = [];
    const completedSet = new Set(completedLessons);

    for (const course of curriculum.courses) {
      for (const unit of course.units) {
        for (let i = 0; i < unit.lessons.length; i++) {
          const lesson = unit.lessons[i];
          if (!completedSet.has(lesson.id)) {
            const isNext = i === 0 || unit.lessons[i - 1] && completedSet.has(unit.lessons[i - 1].id);
            recs.push({
              type: isNext ? 'next-lesson' : 'review',
              courseId: course.id, unitId: unit.id, lessonId: lesson.id,
              reason: isNext ? `Next: ${lesson.name}` : `Review: ${lesson.name}`,
              reasonZh: isNext ? `下一課：${lesson.nameZh}` : `複習：${lesson.nameZh}`,
              priority: isNext ? 'must-do' : 'should-do',
            });
            if (recs.length >= 5) return recs;
          }
        }
      }
    }
    return recs;
  }

  /** Check if all prerequisites for a course are met */
  arePrerequisitesMet(curriculumId: string, courseId: string, completedCourses: string[]): boolean {
    const course = this.getCourse(curriculumId, courseId);
    if (!course || course.prerequisites.length === 0) return true;
    const completedSet = new Set(completedCourses);
    return course.prerequisites.every(p => completedSet.has(p));
  }

  /** Map curriculum knowledge to Knowledge Graph nodes */
  getKnowledgeNodeIds(curriculumId: string): string[] {
    const curriculum = this.getCurriculum(curriculumId);
    if (!curriculum) return [];
    const ids = new Set<string>();
    for (const course of curriculum.courses) {
      for (const unit of course.units) {
        for (const lesson of unit.lessons) {
          for (const mapping of lesson.knowledgeMapping) {
            ids.add(mapping.knowledgeNodeId);
          }
        }
      }
    }
    return [...ids];
  }
}

export const curriculumEngine = new CurriculumEngine();
