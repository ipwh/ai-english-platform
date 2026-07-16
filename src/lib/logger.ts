// ============================================
// 結構化日誌系統 — AI English Platform
// 基於 Pino 的集中式日誌管理，取代分散的 console.log
//
// 使用方式：
//   import { logger } from '@/lib/logger';
//   logger.info({ module: 'ai-service', latencyMs: 123 }, 'AI call succeeded');
//   logger.error({ module: 'rag-service', error: err.message }, 'Embedding failed');
// ============================================

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface StructuredLog {
  level: LogLevel;
  time: string;
  /** 模組名稱（如 'ai-service', 'rag-service', 'auth'） */
  module: string;
  /** 事件類型（如 'call_success', 'call_failed', 'fallback'） */
  event?: string;
  /** 人類可讀訊息 */
  msg: string;
  /** 結構化上下文資料 */
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function getLogLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LOG_LEVELS) return env as LogLevel;
  if (process.env.NODE_ENV === 'production' || !!process.env.VERCEL) return 'info';
  return 'debug';
}

const currentLevel = getLogLevel();
const currentLevelValue = LOG_LEVELS[currentLevel];

function formatLog(log: StructuredLog): string {
  // Vercel / 生產環境：輸出 JSON 以利 Log Drain 解析
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return JSON.stringify(log);
  }
  // 開發環境：人類可讀格式
  const { level, time, module, event, msg, ...meta } = log;
  const prefix = `[${module}]${event ? ` [${event}]` : ''}`;
  const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
  return `${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${prefix} ${msg}${metaStr}`;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevelValue;
}

function log(level: LogLevel, metaOrMsg: Record<string, unknown> | string, msg?: string): void {
  if (!shouldLog(level)) return;

  let meta: Record<string, unknown>;
  let message: string;

  if (typeof metaOrMsg === 'string') {
    meta = {};
    message = metaOrMsg;
  } else {
    meta = { ...metaOrMsg };
    message = (meta.msg as string) || msg || '';
    delete meta.msg;
  }

  const module = (meta.module as string) || 'app';
  delete meta.module;
  const event = (meta.event as string) || undefined;
  if (event) delete meta.event;

  const logEntry: StructuredLog = {
    level,
    time: new Date().toISOString(),
    module,
    event,
    msg: message,
    ...meta,
  };

  const output = formatLog(logEntry);

  switch (level) {
    case 'trace':
    case 'debug':
      console.debug(output);
      break;
    case 'info':
      console.info(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
    case 'fatal':
      console.error(output);
      break;
  }
}

/**
 * 結構化日誌器。
 *
 * 生產環境（Vercel）輸出 JSON 格式供 Log Drain 解析；
 * 開發環境輸出人類可讀格式。
 *
 * @example
 * logger.info({ module: 'ai-service', latencyMs: 450 }, 'DeepSeek call succeeded');
 * logger.warn({ module: 'ai-service', provider: 'deepseek' }, 'Falling back to Gemini');
 * logger.error({ module: 'rag-service', error: 'timeout' }, 'Embedding timed out');
 */
export const logger = {
  trace: (metaOrMsg: Record<string, unknown> | string, msg?: string) => log('trace', metaOrMsg, msg),
  debug: (metaOrMsg: Record<string, unknown> | string, msg?: string) => log('debug', metaOrMsg, msg),
  info: (metaOrMsg: Record<string, unknown> | string, msg?: string) => log('info', metaOrMsg, msg),
  warn: (metaOrMsg: Record<string, unknown> | string, msg?: string) => log('warn', metaOrMsg, msg),
  error: (metaOrMsg: Record<string, unknown> | string, msg?: string) => log('error', metaOrMsg, msg),
  fatal: (metaOrMsg: Record<string, unknown> | string, msg?: string) => log('fatal', metaOrMsg, msg),
};

/**
 * 建立帶 module 前綴的子 logger
 *
 * @example
 * const aiLogger = createModuleLogger('ai-service');
 * aiLogger.info({ latencyMs: 450 }, 'call succeeded');
 */
export function createModuleLogger(module: string) {
  return {
    trace: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('trace', { module, ...(typeof metaOrMsg === 'object' ? metaOrMsg : {}) }, typeof metaOrMsg === 'string' ? metaOrMsg : msg),
    debug: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('debug', { module, ...(typeof metaOrMsg === 'object' ? metaOrMsg : {}) }, typeof metaOrMsg === 'string' ? metaOrMsg : msg),
    info: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('info', { module, ...(typeof metaOrMsg === 'object' ? metaOrMsg : {}) }, typeof metaOrMsg === 'string' ? metaOrMsg : msg),
    warn: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('warn', { module, ...(typeof metaOrMsg === 'object' ? metaOrMsg : {}) }, typeof metaOrMsg === 'string' ? metaOrMsg : msg),
    error: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('error', { module, ...(typeof metaOrMsg === 'object' ? metaOrMsg : {}) }, typeof metaOrMsg === 'string' ? metaOrMsg : msg),
    fatal: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('fatal', { module, ...(typeof metaOrMsg === 'object' ? metaOrMsg : {}) }, typeof metaOrMsg === 'string' ? metaOrMsg : msg),
  };
}
