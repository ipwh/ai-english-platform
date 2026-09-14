// ============================================
// OpenTelemetry 整合設定
// 提供與 Cloud Trace / Cloud Logging 相容的 tracing
// 可逐步替代自訂 observability 模組
// ============================================

import { logger } from '@/shared/logger/logger';

// ============================================
// OpenTelemetry API 抽象層
// 當 OpenTelemetry SDK 可用時使用，否則 fallback 到自訂實作
// ============================================

let otelAvailable = false;

try {
  // Dynamic import — 只有在安裝了 @opentelemetry/api 時啟用
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (typeof require !== 'undefined') {
    require('@opentelemetry/api');
    otelAvailable = true;
  }
} catch {
  otelAvailable = false;
}

export function isOtelAvailable(): boolean {
  return otelAvailable;
}

// ============================================
// Span 包裝 — 與自訂 tracer 相容的介面
// ============================================

export interface OtelSpan {
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(error: Error): void;
}

const noopSpan: OtelSpan = {
  end: () => {},
  setAttribute: () => {},
  setStatus: () => {},
  recordException: () => {},
};

/**
 * 開始一個 OpenTelemetry span（如果可用）
 * 否則使用自訂 tracer 的 startSpan
 */
export function startOtelSpan(
  name: string,
  attributes?: Record<string, string | number | boolean>
): OtelSpan {
  if (otelAvailable) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const api = require('@opentelemetry/api');
      const tracer = api.trace.getTracer('english-platform');
      const span = tracer.startSpan(name);
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          span.setAttribute(key, value);
        }
      }
      return {
        end: () => span.end(),
        setAttribute: (key, value) => span.setAttribute(key, value),
        setStatus: (status) => span.setStatus(status),
        recordException: (error) => span.recordException(error),
      };
    } catch (err) {
      logger.warn({ module: 'otel', error: (err as Error).message }, 'OpenTelemetry span creation failed, using noop');
      return noopSpan;
    }
  }
  return noopSpan;
}

/**
 * OpenTelemetry abstraction layer for AI English Platform.
 * Falls back to noop when OTEL is not configured.
 *
 * v4.1: Removed fallback to modules/observability/ (deprecated).
 * If OTEL is not configured, all operations are noops.
 */

/**
 * 在 span 中執行 async 函數
 */
export async function traceOtelAsync<T>(
  name: string,
  fn: (span: OtelSpan) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = startOtelSpan(name, attributes);
  try {
    const result = await fn(span);
    span.setStatus({ code: 1 }); // OK
    return result;
  } catch (err) {
    if (err instanceof Error) {
      span.recordException(err);
    }
    span.setStatus({ code: 2, message: (err as Error).message }); // ERROR
    throw err;
  } finally {
    span.end();
  }
}
