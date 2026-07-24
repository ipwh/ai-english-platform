// ============================================
// Sprint 106: Assessment Context & Policy
// ============================================

import type { AssessmentContext } from './assessment-types';

/** Pre-built assessment contexts for common scenarios */
export const assessmentContexts = {
  /** Standard DSE Paper 1 Reading assessment */
  reading(gradeLevel: string, passageContent?: string): AssessmentContext {
    return { questionType: 'reading', targetLevel: gradeLevel, targetCEFR: gradeToCEFR(gradeLevel), passageContent };
  },
  /** DSE Paper 3 Listening assessment */
  listening(gradeLevel: string, transcriptContent?: string): AssessmentContext {
    return { questionType: 'listening', targetLevel: gradeLevel, targetCEFR: gradeToCEFR(gradeLevel), transcriptContent };
  },
  /** Grammar practice assessment */
  grammar(gradeLevel: string): AssessmentContext {
    return { questionType: 'grammar', targetLevel: gradeLevel, targetCEFR: gradeToCEFR(gradeLevel) };
  },
  /** Vocabulary practice assessment */
  vocabulary(gradeLevel: string): AssessmentContext {
    return { questionType: 'vocabulary', targetLevel: gradeLevel, targetCEFR: gradeToCEFR(gradeLevel) };
  },
  /** Writing prompt assessment */
  writing(gradeLevel: string): AssessmentContext {
    return { questionType: 'writing', targetLevel: gradeLevel, targetCEFR: gradeToCEFR(gradeLevel) };
  },
};

function gradeToCEFR(grade: string): string {
  const map: Record<string, string> = {
    S1: 'A1', S2: 'A2', S3: 'B1', S4: 'B2', S5: 'C1', S6: 'C1',
  };
  return map[grade] || 'B1';
}
