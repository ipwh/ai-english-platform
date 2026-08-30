// ============================================
// 2026-08-30 audit — word-presence validation for vocab suggestions
// ============================================

import { describe, expect, it } from 'vitest';
import { wordAppearsInText } from '../services/word-presence';

describe('wordAppearsInText — anti-hallucination guard', () => {
  it('accepts an exact word present in the text', () => {
    expect(wordAppearsInText('environment', 'We must protect the environment.')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(wordAppearsInText('Environment', 'the ENVIRONMENT matters')).toBe(true);
  });

  it('rejects a word that never appears in the text', () => {
    expect(wordAppearsInText('ubiquitous', 'We must protect the environment.')).toBe(false);
  });

  it('rejects substring-only matches (word boundaries required)', () => {
    expect(wordAppearsInText('car', 'The character walked home.')).toBe(false);
  });

  it('accepts light inflections (plural/ed/ing)', () => {
    expect(wordAppearsInText('recycle', 'Schools should promote recycling.')).toBe(true);
    expect(wordAppearsInText('pollute', 'Factories pollute the river.')).toBe(true);
    expect(wordAppearsInText('damage', 'The storm damaged many homes.')).toBe(true);
    expect(wordAppearsInText('study', 'Students study hard.')).toBe(true);
  });

  it('accepts -e and -y spelling variants', () => {
    expect(wordAppearsInText('cycle', 'Cycling is healthy.')).toBe(true);
    expect(wordAppearsInText('supply', 'The company supplies water.')).toBe(true);
  });

  it('rejects empty or trivial words', () => {
    expect(wordAppearsInText('', 'Some text.')).toBe(false);
    expect(wordAppearsInText('a', 'Some text.')).toBe(false);
  });

  it('handles punctuation around the word', () => {
    expect(wordAppearsInText('environment', '"environment", he said.')).toBe(true);
  });
});
