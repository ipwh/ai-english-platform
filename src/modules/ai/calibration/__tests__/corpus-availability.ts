// ============================================
// Calibration corpus availability (test-only)
// ============================================
//
// Several calibration suites are EVIDENCE suites: they ingest the owner-supplied sources
// under materials/ (HKEAA scored scripts, extracted booklets).
//
// That corpus is deliberately NOT shipped: the repository commits only the small `.pdf.txt`
// extracts, while the source PDFs themselves are gitignored and excluded from the deploy
// image. So a CI checkout HAS the directory but not the files the ingestion needs, and a plain
// `existsSync(dir)` reports "corpus present" — which made these suites run in CI and fail with
// "source PDF missing" (2026-10-08, ADR-050).
//
// The flags below therefore require an actual usable FILE, not a directory. Without them the
// suites report a missing LOCAL corpus as a broken evidence pipeline; with them they SKIP
// explicitly, and when the corpus IS present they run unchanged and still fail loudly if it
// is malformed or an assertion stops holding.
// ============================================

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const MATERIALS_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', 'materials');

function hasFileMatching(dir: string, matches: (name: string) => boolean): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some(matches);
  } catch {
    return false;
  }
}

/**
 * materials/_hkeaa_scored_scripts — the PDF sources themselves (ingestion hashes their
 * bytes). The committed `.pdf.txt` extracts do NOT satisfy this.
 */
export const HAS_SCORED_SCRIPTS = hasFileMatching(
  join(MATERIALS_ROOT, '_hkeaa_scored_scripts'),
  (name) => name.toLowerCase().endsWith('.pdf'),
);

/** materials/_extracted — parsed booklet text consumed by the exemplar ingestion. */
export const HAS_EXTRACTED_MATERIALS = hasFileMatching(
  join(MATERIALS_ROOT, '_extracted'),
  (name) => name.toLowerCase().endsWith('.txt'),
);
