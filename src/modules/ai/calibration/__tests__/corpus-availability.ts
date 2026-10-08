// ============================================
// Calibration corpus availability (test-only)
// ============================================
//
// Several calibration suites are EVIDENCE suites: they ingest the owner-supplied sources
// under materials/ (HKEAA scored scripts, extracted booklets, level descriptors).
//
// That corpus is deliberately NOT in the repository — it is local-only and excluded from
// the deploy image — so a CI checkout has none of it. Without this gate those suites fail
// with "source file missing", which reports a missing LOCAL corpus as a broken evidence
// pipeline. They now SKIP explicitly when the corpus is absent; when it is present they run
// unchanged and still fail loudly if the corpus is malformed or an assertion stops holding.
// ============================================

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const MATERIALS_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', 'materials');

/** materials/_hkeaa_scored_scripts — published-level / criterion-marked student scripts. */
export const HAS_SCORED_SCRIPTS = existsSync(join(MATERIALS_ROOT, '_hkeaa_scored_scripts'));

/** materials/_extracted — parsed booklet text consumed by the exemplar ingestion. */
export const HAS_EXTRACTED_MATERIALS = existsSync(join(MATERIALS_ROOT, '_extracted'));

/** materials/_hkeaa_descriptors — level descriptor documents. */
export const HAS_LEVEL_DESCRIPTORS = existsSync(join(MATERIALS_ROOT, '_hkeaa_descriptors'));
