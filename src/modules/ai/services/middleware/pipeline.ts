// ============================================
// AIExecutionPipeline — composable middleware runner
//
// Composes AIExecutionMiddleware[] into a single async chain.
// Standard middleware pattern: each step calls next() to proceed.
// ============================================

import type { AIExecutionContext, AIExecutionMiddleware } from './middleware';

export class AIExecutionPipeline {
  constructor(private readonly middlewares: AIExecutionMiddleware[]) {}

  /**
   * Run the pipeline: invoke each middleware in order.
   * Each middleware receives (context, next) where next() advances
   * to the next middleware in the chain.
   */
  async run(context: AIExecutionContext): Promise<void> {
    const dispatch = async (index: number): Promise<void> => {
      if (index >= this.middlewares.length) return;
      const middleware = this.middlewares[index];
      await middleware.execute(context, () => dispatch(index + 1));
    };
    await dispatch(0);
  }
}
