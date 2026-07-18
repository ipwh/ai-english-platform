// Extracted from ai-service.ts (Sprint 4)
import { callLLM } from './ai-service';
import { parseAIJSON } from './json-utils';
import { isDSERAGEnabled, retrievePastPaperContent, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '@/modules/ai/services/rag-service';
import { logger } from '@/shared/logger/logger';
import { ProgressAnalysisSchema } from '@/modules/ai/schemas/ai-schema';
import { validateAIResponse } from '@/modules/ai/schemas/ai-schema';
import { getProgressAnalysisSystemPrompt, buildProgressAnalysisUserPrompt } from '@/modules/ai/prompts/progress-analysis';


