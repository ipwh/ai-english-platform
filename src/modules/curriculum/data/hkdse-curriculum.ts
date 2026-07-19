// Sprint 26: HKDSE Curriculum — structured S1-S6 data
import type { Curriculum, Course, Unit, Lesson } from '../types';

function lesson(id: string, name: string, nameZh: string, type: Lesson['type'], minutes: number): Lesson {
  return {
    id, name, nameZh, type, estimatedMinutes: minutes,
    learningObjectives: [{ id: `${id}-lo`, description: `Master ${name}`, descriptionZh: `掌握${nameZh}`, bloomLevel: 'apply', measurable: true }],
    knowledgeMapping: [{ knowledgeNodeId: id, weight: 1, relationship: 'practices' }],
    completionRule: { type: 'all-lessons' },
    content: { instructions: `Complete ${name}`, instructionsZh: `完成${nameZh}`, examples: [], examplesZh: [], keyPoints: [], keyPointsZh: [], commonMistakes: [], commonMistakesZh: [] },
  };
}

function unit(id: string, name: string, nameZh: string, order: number, lessons: Lesson[]): Unit {
  return {
    id, name, nameZh, description: name, descriptionZh: nameZh, order, lessons,
    estimatedHours: Math.round(lessons.reduce((s, l) => s + l.estimatedMinutes, 0) / 60),
    learningObjectives: [], knowledgeMapping: [], prerequisites: [],
  };
}

function course(id: string, name: string, nameZh: string, order: number, skill: string, grade: string, cefr: string, units: Unit[]): Course {
  return {
    id, name, nameZh, description: name, descriptionZh: nameZh, order,
    skillFocus: skill as Course['skillFocus'], gradeLevel: grade as Course['gradeLevel'],
    cefrLevel: cefr as Course['cefrLevel'],
    estimatedHours: units.reduce((s, u) => s + u.estimatedHours, 0),
    units, prerequisites: [], knowledgeNodeIds: [],
    completionRule: { type: 'all-lessons' },
    masteryRule: { type: 'accuracy', threshold: 70 },
  };
}

export const HKDSE_CURRICULUM: Curriculum = {
  id: 'hkdse-english',
  name: 'HKDSE English Language',
  nameZh: 'HKDSE 英國語文',
  type: 'hkdse',
  description: 'Hong Kong Diploma of Secondary Education English Language curriculum (S1-S6)',
  descriptionZh: '香港中學文憑英國語文課程（中一至中六）',
  gradeLevels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
  cefrRange: { from: 'A2', to: 'B2' },
  courses: [
    course('hkdse-s1-foundation', 'S1 English Foundation', '中一英文基礎', 1, 'grammar', 'S1', 'A2', [
      unit('s1-u1', 'Basic Grammar', '基礎文法', 1, [
        lesson('tenses-simple', 'Simple Tenses', '簡單時態', 'instruction', 45),
        lesson('parts-of-speech', 'Parts of Speech', '詞性', 'instruction', 40),
        lesson('s1-grammar-practice', 'Grammar Practice 1', '文法練習一', 'practice', 30),
      ]),
      unit('s1-u2', 'Reading Basics', '閱讀基礎', 2, [
        lesson('reading-skimming', 'Skimming & Scanning', '略讀與掃讀', 'instruction', 35),
        lesson('s1-reading-practice', 'Reading Practice 1', '閱讀練習一', 'practice', 30),
      ]),
    ]),
    course('hkdse-s2-intermediate', 'S2 English Intermediate', '中二英文進階', 2, 'grammar', 'S2', 'B1', [
      unit('s2-u1', 'Tenses & Structures', '時態與結構', 1, [
        lesson('tenses-continuous', 'Continuous Tenses', '進行時態', 'instruction', 45),
        lesson('present-perfect', 'Present Perfect', '現在完成式', 'instruction', 50),
        lesson('s2-grammar-practice', 'Grammar Practice 2', '文法練習二', 'practice', 30),
      ]),
    ]),
    course('hkdse-s3-writing', 'S3 Writing Skills', '中三寫作技巧', 3, 'writing', 'S3', 'B1', [
      unit('s3-u1', 'Paragraph & Essay', '段落與文章', 1, [
        lesson('writing-paragraph', 'Paragraph Structure', '段落結構', 'instruction', 40),
        lesson('writing-essay-structure', 'Essay Structure', '文章結構', 'instruction', 50),
      ]),
    ]),
    course('hkdse-s4-advanced', 'S4 Advanced English', '中四進階英文', 4, 'writing', 'S4', 'B2', [
      unit('s4-u1', 'Argumentative Writing', '議論文寫作', 1, [
        lesson('writing-argumentative', 'Argumentative Writing', '議論文', 'instruction', 60),
        lesson('writing-discursive', 'Discursive Writing', '討論文', 'instruction', 55),
      ]),
    ]),
    course('hkdse-s5-dse-prep', 'S5 DSE Preparation', '中五文憑試預備', 5, 'reading', 'S5', 'B2', [
      unit('s5-u1', 'Advanced Reading', '進階閱讀', 1, [
        lesson('reading-inference', 'Making Inferences', '推論技巧', 'instruction', 50),
        lesson('reading-critical-analysis', 'Critical Analysis', '批判分析', 'instruction', 55),
      ]),
    ]),
    course('hkdse-s6-exam', 'S6 Exam Readiness', '中六考試備戰', 6, 'writing', 'S6', 'B2', [
      unit('s6-u1', 'Exam Techniques', '考試技巧', 1, [
        lesson('writing-advanced-composition', 'Advanced Composition', '進階寫作', 'instruction', 60),
        lesson('speaking-dse-exam', 'DSE Speaking Exam', 'DSE口試', 'instruction', 50),
      ]),
    ]),
  ],
  metadata: {
    version: '1.0.0', totalCourses: 6, totalUnits: 7, totalLessons: 18,
    totalEstimatedHours: 14, lastUpdated: '2026-07-19',
    standardsAlignment: ['ELE KLACG 2017', 'HKDSE English Language Level Descriptors'],
  },
};
