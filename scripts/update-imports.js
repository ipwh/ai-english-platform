// Sprint 1: Batch import path updater
// Replaces old import paths with new module-based paths
const fs = require('fs');
const path = require('path');
const { globSync } = require('glob') || { globSync: null };

// Use manual file walking if glob isn't available
function walk(dir, exts) {
  const results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
      results.push(...walk(full, exts));
    } else if (exts.some(e => item.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

const replacements = [
  // Components
  ['@/components/vocabulary/', '@/modules/vocabulary/components/'],
  ['@/components/student/', '@/modules/student/components/'],
  ['@/components/teacher/', '@/modules/teacher/components/'],
  ['@/components/integrated-skills/', '@/modules/assessment/components/'],
  
  // Repositories
  ['@/lib/repositories/student-repo', '@/modules/student/repositories/student-repo'],
  ['@/lib/repositories/vocabulary-repo', '@/modules/vocabulary/repositories/vocabulary-repo'],
  ['@/lib/repositories/class-repo', '@/modules/teacher/repositories/class-repo'],
  ['@/lib/repositories/assignment-repo', '@/modules/assessment/repositories/assignment-repo'],
  
  // Shared: config, db, types, utils, logger, i18n, nav, api-response
  ["'@/lib/config'", "'@/shared/config/config'"],
  ['"@/lib/config"', '"@/shared/config/config"'],
  ["'@/lib/db'", "'@/shared/db/db'"],
  ['"@/lib/db"', '"@/shared/db/db"'],
  ['"./db"', '"./db"'], // skip local imports within shared/db
  ["'@/lib/types'", "'@/shared/types/types'"],
  ['"@/lib/types"', '"@/shared/types/types"'],
  ['"./types"', '"./types"'], // skip local
  ["'@/lib/utils'", "'@/shared/utils/utils'"],
  ['"@/lib/utils"', '"@/shared/utils/utils"'],
  ["'@/lib/i18n'", "'@/shared/utils/i18n'"],
  ['"@/lib/i18n"', '"@/shared/utils/i18n"'],
  ["'@/lib/logger'", "'@/shared/logger/logger'"],
  ['"@/lib/logger"', '"@/shared/logger/logger"'],
  ["'@/lib/api-response'", "'@/shared/utils/api-response'"],
  ['"@/lib/api-response"', '"@/shared/utils/api-response"'],
  ["'@/lib/nav'", "'@/shared/utils/nav'"],
  ['"@/lib/nav"', '"@/shared/utils/nav"'],
  ["'@/lib/rate-limiter'", "'@/shared/utils/rate-limiter'"],
  ['"@/lib/rate-limiter"', '"@/shared/utils/rate-limiter"'],
  ["'@/lib/notifications'", "'@/shared/utils/notifications'"],
  ['"@/lib/notifications"', '"@/shared/utils/notifications"'],
  ["'@/lib/import-utils'", "'@/shared/utils/import-utils'"],
  ['"@/lib/import-utils"', '"@/shared/utils/import-utils"'],
  ["'@/lib/vercel-kv'", "'@/shared/db/vercel-kv'"],
  ['"@/lib/vercel-kv"', '"@/shared/db/vercel-kv"'],
  
  // Auth
  ["'@/lib/jwt'", "'@/shared/auth/jwt'"],
  ['"@/lib/jwt"', '"@/shared/auth/jwt"'],
  ["'@/lib/auth'", "'@/shared/auth/auth'"],
  ['"@/lib/auth"', '"@/shared/auth/auth"'],
  ["'@/lib/auth-next'", "'@/shared/auth/auth-next'"],
  ['"@/lib/auth-next"', '"@/shared/auth/auth-next"'],
  ["'@/lib/api-auth'", "'@/shared/auth/api-auth'"],
  ['"@/lib/api-auth"', '"@/shared/auth/api-auth"'],
  ["'@/lib/admin-auth'", "'@/shared/auth/admin-auth'"],
  ['"@/lib/admin-auth"', '"@/shared/auth/admin-auth"'],
  ["'@/lib/auth-cookies'", "'@/shared/auth/auth-cookies'"],
  ['"@/lib/auth-cookies"', '"@/shared/auth/auth-cookies"'],
  ["'@/lib/auth-health'", "'@/shared/auth/auth-health'"],
  ['"@/lib/auth-health"', '"@/shared/auth/auth-health"'],
  ["'@/lib/crypto'", "'@/shared/auth/crypto'"],
  ['"@/lib/crypto"', '"@/shared/auth/crypto"'],
  
  // AI core
  ["'@/lib/ai-service'", "'@/modules/ai/services/ai-service'"],
  ['"@/lib/ai-service"', '"@/modules/ai/services/ai-service"'],
  ["'@/lib/ai-schema'", "'@/modules/ai/schemas/ai-schema'"],
  ['"@/lib/ai-schema"', '"@/modules/ai/schemas/ai-schema"'],
  ["'@/lib/ai-cache'", "'@/modules/ai/services/ai-cache'"],
  ['"@/lib/ai-cache"', '"@/modules/ai/services/ai-cache"'],
  ["'@/lib/rag-service'", "'@/modules/ai/services/rag-service'"],
  ['"@/lib/rag-service"', '"@/modules/ai/services/rag-service"'],
  ["'@/lib/gcp-auth'", "'@/modules/ai/services/gcp-auth'"],
  ['"@/lib/gcp-auth"', '"@/modules/ai/services/gcp-auth"'],
  ["'@/lib/tts-service'", "'@/modules/ai/services/tts-service'"],
  ['"@/lib/tts-service"', '"@/modules/ai/services/tts-service"'],
  ["'@/lib/vertex-embeddings'", "'@/modules/ai/services/vertex-embeddings'"],
  ['"@/lib/vertex-embeddings"', '"@/modules/ai/services/vertex-embeddings"'],
  
  // AI sub-modules
  ["'@/lib/ai/sanitizer'", "'@/modules/ai/services/sanitizer'"],
  ['"@/lib/ai/sanitizer"', '"@/modules/ai/services/sanitizer"'],
  ["'./ai/sanitizer'", "'../services/sanitizer'"],
  ['"./ai/sanitizer"', '"../services/sanitizer"'],
  ["'@/lib/ai/dse-topics'", "'@/modules/ai/services/dse-topics'"],
  ['"@/lib/ai/dse-topics"', '"@/modules/ai/services/dse-topics"'],
  ["'./ai/dse-topics'", "'../services/dse-topics'"],
  ['"./ai/dse-topics"', '"../services/dse-topics"'],
  ["'@/lib/ai/dse-writing-data'", "'@/modules/ai/services/dse-writing-data'"],
  ['"@/lib/ai/dse-writing-data"', '"@/modules/ai/services/dse-writing-data"'],
  ["'./ai/dse-writing-data'", "'../services/dse-writing-data'"],
  ['"./ai/dse-writing-data"', '"../services/dse-writing-data"'],
  ["'@/lib/ai/mcq-filters'", "'@/modules/ai/services/mcq-filters'"],
  ['"@/lib/ai/mcq-filters"', '"@/modules/ai/services/mcq-filters"'],
  ["'./ai/mcq-filters'", "'../services/mcq-filters'"],
  ['"./ai/mcq-filters"', '"../services/mcq-filters"'],
  ["'@/lib/ai/topic-selector'", "'@/modules/ai/services/topic-selector'"],
  ['"@/lib/ai/topic-selector"', '"@/modules/ai/services/topic-selector"'],
  ["'./ai/topic-selector'", "'../services/topic-selector'"],
  ['"./ai/topic-selector"', '"../services/topic-selector"'],
  ["'@/lib/ai/integrated-skills-config'", "'@/modules/ai/services/integrated-skills-config'"],
  ['"@/lib/ai/integrated-skills-config"', '"@/modules/ai/services/integrated-skills-config"'],
  ["'./ai/integrated-skills-config'", "'../services/integrated-skills-config'"],
  ['"./ai/integrated-skills-config"', '"../services/integrated-skills-config"'],
  ["'@/lib/ai/question-validator'", "'@/modules/ai/services/question-validator'"],
  ['"@/lib/ai/question-validator"', '"@/modules/ai/services/question-validator"'],
  ["'@/lib/ai/listening-normalizer'", "'@/modules/ai/services/listening-normalizer'"],
  ['"@/lib/ai/listening-normalizer"', '"@/modules/ai/services/listening-normalizer"'],
  ["'@/lib/ai/json-utils'", "'@/modules/ai/services/json-utils'"],
  ['"@/lib/ai/json-utils"', '"@/modules/ai/services/json-utils"'],
  
  // AI prompts
  ["'@/lib/ai/prompts/", "'@/modules/ai/prompts/"],
  ['"@/lib/ai/prompts/', '"@/modules/ai/prompts/'],
  ["'./ai/prompts/", "'../prompts/"],
  ['"./ai/prompts/', '"../prompts/'],
  
  // Feature services
  ["'@/lib/chinglish'", "'@/modules/assessment/services/chinglish'"],
  ['"@/lib/chinglish"', '"@/modules/assessment/services/chinglish"'],
  ['"./chinglish"', '"./chinglish"'], // skip
  ["'@/lib/plagiarism'", "'@/modules/assessment/services/plagiarism'"],
  ['"@/lib/plagiarism"', '"@/modules/assessment/services/plagiarism"'],
  ["'@/lib/gamification'", "'@/modules/progress/services/gamification'"],
  ['"@/lib/gamification"', '"@/modules/progress/services/gamification"'],
  ["'@/lib/srs'", "'@/modules/vocabulary/services/srs'"],
  ['"@/lib/srs"', '"@/modules/vocabulary/services/srs"'],
  ["'@/lib/streak-service'", "'@/modules/progress/services/streak-service'"],
  ['"@/lib/streak-service"', '"@/modules/progress/services/streak-service"'],
];

const srcDir = path.join(__dirname, '..', 'src');
const files = walk(srcDir, ['.ts', '.tsx']);
let totalModified = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  
  for (const [oldStr, newStr] of replacements) {
    if (content.includes(oldStr)) {
      content = content.split(oldStr).join(newStr);
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    totalModified++;
  }
}

console.log(`Updated ${totalModified} files with new import paths.`);
