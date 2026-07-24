// ============================================
// Sprint 103: ReferenceConsistencyRule
// Validates paragraph/line/speaker/section references exist.
// Detects: paragraph 5 in a 3-paragraph passage, line 38 in 20-line text.
// Category: deterministic
// ============================================

import { BaseQualityRule } from '../../quality-rule';
import type { RuleCheckResult } from '../../quality-types';

interface HasReferences {
  paragraphRef?: number;
  lineRef?: string;
  questionText?: string;
  question?: string;
  prompt?: string;
  readingContent?: string;
  listeningContent?: string;
  choices?: string[];
}

export class ReferenceConsistencyRule extends BaseQualityRule<HasReferences> {
  readonly id = 'content:reference-consistency';
  readonly name = 'Reference Consistency';
  readonly description = 'Validates paragraph, line, speaker, and section references exist';
  readonly priority = 'high' as const;
  readonly supportedTypes = ['GeneratedQuestion'];
  readonly category = 'deterministic' as const;
  readonly dimension = 'consistency' as const;

  validate(input: HasReferences): RuleCheckResult {
    const warnings: string[] = [];
    const failures: Array<{ ruleId: string; message: string }> = [];

    // Check paragraph reference
    if (input.paragraphRef !== undefined && input.paragraphRef !== null) {
      if (input.readingContent) {
        const paraCount = (input.readingContent.match(/\n\n+/g) || []).length + 1;
        if (input.paragraphRef > paraCount) {
          failures.push({
            ruleId: this.id,
            message: `Paragraph reference ${input.paragraphRef} exceeds passage paragraph count (${paraCount})`,
          });
        }
      } else if (input.paragraphRef > 10) {
        warnings.push(`Paragraph reference ${input.paragraphRef} seems high without passage context`);
      }
    }

    // Check line references in question text
    const questionText = input.questionText || input.question || input.prompt || '';
    const lineRefs = questionText.match(/lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?/gi);
    if (lineRefs) {
      for (const ref of lineRefs) {
        const nums = ref.match(/\d+/g);
        if (nums && input.readingContent) {
          const maxLine = input.readingContent.split('\n').length;
          for (const n of nums) {
            if (parseInt(n, 10) > maxLine + 5) { // +5 tolerance
              warnings.push(`Line reference "${ref}" exceeds estimated passage line count (~${maxLine})`);
            }
          }
        }
      }
    }

    // Check paragraph references in question text
    const paraRefs = questionText.match(/paragraph\s+(\d+)/gi);
    if (paraRefs && input.readingContent) {
      const paraCount = (input.readingContent.match(/\n\n+/g) || []).length + 1;
      for (const ref of paraRefs) {
        const num = parseInt(ref.match(/\d+/)![0], 10);
        if (num > paraCount + 1) {
          warnings.push(`Paragraph reference "${ref}" exceeds passage paragraph count (${paraCount})`);
        }
      }
    }

    // Check speaker references in listening content
    if (questionText.match(/speaker\s+[A-C]/i) || questionText.match(/boy|girl|man|woman/i)) {
      if (!input.listeningContent) {
        warnings.push('Question references speakers but no listeningContent provided');
      } else {
        // Verify speakers exist in transcript
        const speakers = new Set<string>();
        const lines = input.listeningContent.split('\n');
        for (const line of lines) {
          const m = line.match(/^([A-Za-z]+)\s*:/);
          if (m) speakers.add(m[1].toLowerCase());
        }
        const mentionedSpeakers = questionText.match(/speaker\s+[A-C]/gi) || [];
        const mentionedRoles = questionText.match(/\b(boy|girl|man|woman)\b/gi) || [];
        for (const s of [...mentionedSpeakers, ...mentionedRoles]) {
          if (!speakers.has(s.toLowerCase()) && !input.listeningContent.toLowerCase().includes(s.toLowerCase())) {
            warnings.push(`Question references "${s}" but not found in transcript speakers: ${[...speakers].join(', ')}`);
          }
        }
      }
    }

    if (failures.length > 0) {
      return { passed: false, failures, warnings };
    }
    if (warnings.length > 0) {
      return { passed: true, failures: [], warnings };
    }
    return this.pass();
  }
}
