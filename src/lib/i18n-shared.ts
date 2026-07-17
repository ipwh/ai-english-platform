// ============================================
// i18n — Shared/Common Domain Translations
// Split from i18n.ts for domain-specific maintainability
//
// Contains keys prefixed with:
//   nav.*, common.*, login.*, role.*, layout.*,
//   generic.*, risk.*, difficulty.*, status.*,
//   familiarity.*, pos.*, unit.*, ocr.*, is.*
// ============================================

// Re-export the main translation function for backward compatibility
// In Phase 4 refactoring, this file will contain its own translations object
export { t } from '@/lib/i18n';
