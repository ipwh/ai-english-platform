// Extracted from ai-service.ts (Sprint 4)
import { callLLM } from './ai-service';
import { parseAIJSON } from './json-utils';
import { logger } from '@/shared/logger/logger';
import { MaterialAnalysisSchema } from '@/modules/ai/schemas/ai-schema';
import { validateAIResponse } from '@/modules/ai/schemas/ai-schema';


