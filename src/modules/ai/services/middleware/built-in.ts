// ============================================
// Built-in middlewares — the default pipeline steps
//
// 1. CallLLMMiddleware      → context.rawResponse = await callLLM(...)
// 2. ParseMiddleware        → context.parsed = parseAIJSON(rawResponse)
// 3. ValidationMiddleware   → context.validated = validateAIResponse(schema, parsed)
//                           → context.result = validated.data
//
// Each middleware has exactly ONE responsibility.
// Order is critical — they form a linear chain.
// ============================================

import type { AIExecutionMiddleware } from './middleware';
import { callLLM } from '../llm-call';
import { parseAIJSON } from '../json-utils';
import { validateAIResponse } from '../../schemas/ai-schema';

// ============================================
// 1. CallLLM — invoke the AI provider
// ============================================

export const CallLLMMiddleware: AIExecutionMiddleware = {
  async execute(context, next) {
    context.rawResponse = await callLLM(context.messages, context.options);
    await next();
  },
};

// ============================================
// 2. Parse — extract JSON from raw LLM output
// ============================================

export const ParseMiddleware: AIExecutionMiddleware = {
  async execute(context, next) {
    context.parsed = parseAIJSON(context.rawResponse!);
    await next();
  },
};

// ============================================
// 3. Validate — Zod-validate parsed data & set result
// ============================================

export const ValidationMiddleware: AIExecutionMiddleware = {
  async execute(context, next) {
    const validated = validateAIResponse(context.schema, context.parsed);
    if (!validated.success) {
      throw new Error(validated.error);
    }
    context.validated = validated;
    context.result = validated.data;
    await next();
  },
};
