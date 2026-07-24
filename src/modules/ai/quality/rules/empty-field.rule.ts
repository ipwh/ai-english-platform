// ============================================
// Sprint 102: EmptyFieldRule
// Validates for empty strings, null, undefined across all fields.
// Repairs by trimming whitespace and removing invisible characters.
// Also normalizes Unicode (fullwidth → ASCII where appropriate).
// ============================================

import { BaseQualityRule } from '../quality-rule';
import type { RuleCheckResult } from '../quality-types';

// Invisible/zero-width characters that should be stripped
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00A0\u2028\u2029]/g;

// Fullwidth characters that can be normalized to ASCII
const FULLWIDTH_MAP: Record<string, string> = {
  '！': '!', '＂': '"', '＃': '#', '＄': '$', '％': '%',
  '＆': '&', '＇': "'", '（': '(', '）': ')', '＊': '*',
  '＋': '+', '，': ',', '－': '-', '．': '.', '／': '/',
  '：': ':', '；': ';', '＜': '<', '＝': '=', '＞': '>',
  '？': '?', '＠': '@', '［': '[', '＼': '\\', '］': ']',
  '＾': '^', '＿': '_', '｀': '`', '｛': '{', '｜': '|',
  '｝': '}', '～': '~', '　': ' ', // fullwidth space
};

interface AnyRecord {
  [key: string]: unknown;
}

export class EmptyFieldRule extends BaseQualityRule<AnyRecord> {
  readonly id = 'question:empty-fields';
  readonly name = 'Empty Field Detection';
  readonly description = 'Detects empty strings, null, undefined and normalizes Unicode/whitespace';
  readonly priority = 'low' as const;
  readonly supportedTypes = []; // applies to all types

  validate(input: AnyRecord): RuleCheckResult {
    const warnings: string[] = [];

    for (const [key, value] of Object.entries(input)) {
      if (value === null || value === undefined) {
        warnings.push(`Field "${key}" is ${value === null ? 'null' : 'undefined'}`);
      } else if (typeof value === 'string') {
        if (value.length === 0) {
          warnings.push(`Field "${key}" is an empty string`);
        } else if (value.trim().length === 0) {
          warnings.push(`Field "${key}" is whitespace-only`);
        }
        if (INVISIBLE_CHARS.test(value)) {
          warnings.push(`Field "${key}" contains invisible/zero-width characters`);
        }
        // Check for fullwidth characters
        for (const [fw, ascii] of Object.entries(FULLWIDTH_MAP)) {
          if (value.includes(fw)) {
            warnings.push(`Field "${key}" contains fullwidth character "${fw}"`);
            break;
          }
        }
      } else if (Array.isArray(value)) {
        const emptyCount = value.filter(v => v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0)).length;
        if (emptyCount > 0) {
          warnings.push(`Field "${key}" has ${emptyCount} null/undefined/empty elements`);
        }
      }
    }

    if (warnings.length > 0) {
      return { passed: true, failures: [], warnings };
    }
    return this.pass();
  }

  repair(input: AnyRecord): { repaired: boolean; output: AnyRecord; changes: string[] } {
    const repaired: AnyRecord = { ...input };
    const changes: string[] = [];
    let changed = false;

    for (const [key, value] of Object.entries(repaired)) {
      if (typeof value === 'string') {
        let cleaned = value;

        // Remove invisible characters
        if (INVISIBLE_CHARS.test(cleaned)) {
          cleaned = cleaned.replace(INVISIBLE_CHARS, '');
          changes.push(`Removed invisible chars from "${key}"`);
          changed = true;
        }

        // Normalize fullwidth characters
        for (const [fw, ascii] of Object.entries(FULLWIDTH_MAP)) {
          if (cleaned.includes(fw)) {
            cleaned = cleaned.replace(new RegExp(fw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ascii);
          }
        }
        if (cleaned !== value) {
          changes.push(`Normalized fullwidth chars in "${key}"`);
        }

        // Trim whitespace
        const trimmed = cleaned.trim();
        if (trimmed !== cleaned) {
          changes.push(`Trimmed whitespace in "${key}"`);
          changed = true;
        }

        (repaired as Record<string, unknown>)[key] = trimmed;
      }

      // Remove null values (convert to undefined)
      if (value === null) {
        delete (repaired as Record<string, unknown>)[key];
        changes.push(`Removed null value for "${key}"`);
        changed = true;
      }
    }

    return { repaired: changed, output: repaired, changes };
  }
}
