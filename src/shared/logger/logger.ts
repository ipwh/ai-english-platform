// ============================================
// 結構化日誌系統 — AI English Platform
// 基於 Pino 的集中式日誌管理，取代分散的 console.log
//
// 使用方式：
//   import { logger } from '@/shared/logger/logger';
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

  const mod = (meta.module as string) || 'app';
  delete meta.module;
  const event = (meta.event as string) || undefined;
  if (event) delete meta.event;

  const logEntry: StructuredLog = {
    level,
    time: new Date().toISOString(),
    module: mod,
    event,
    msg: message,
    ...meta,
  };

  const output = formatLog(logEntry);

  switch (level) {
    case 'trace':
    case 'debug':
      _origConsole.log(output);
      break;
    case 'info':
      _origConsole.log(output);
      break;
    case 'warn':
      _origConsole.warn(output);
      break;
    case 'error':
    case 'fatal':
      _origConsole.error(output);
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

// ============================================
// Console Patching — 自動將 console.log/error/warn
// 路由至結構化 logger（生產環境），消滅技術債
// ============================================

const _origConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
};

let _consolePatched = false;

/**
 * 在生產環境中攔截 console.log/error/warn，自動路由至結構化 logger。
 * 開發環境保留原生 console 以便除錯。
 * 
 * 呼叫此函數後，所有現有的 console.log() 呼叫會自動轉為
 * logger.info()，無需逐檔遷移。
 */
export function patchConsole(): void {
  if (_consolePatched) return;
  _consolePatched = true;

  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  if (!isProd) {
    _origConsole.log('[logger] Console patching skipped (dev mode — native console preserved)');
    return;
  }

  console.log = (...args: unknown[]) => {
    try {
      const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      logger.info({ module: 'console' }, msg);
    } catch {
      // Fallback: if structured logging fails, use original console directly
      _origConsole.log(...args);
    }
  };

  console.error = (...args: unknown[]) => {
    try {
      const msg = args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        return typeof a === 'string' ? a : JSON.stringify(a);
      }).join(' ');
      logger.error({ module: 'console' }, msg);
    } catch {
      _origConsole.error(...args);
    }
  };

  console.warn = (...args: unknown[]) => {
    try {
      const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      logger.warn({ module: 'console' }, msg);
    } catch {
      _origConsole.warn(...args);
    }
  };

  _origConsole.log('[logger] Console patched — all console.* calls now route through structured logger');
}

/**
 * 恢復原生 console（用於測試或特殊情境）
 */
export function unpatchConsole(): void {
  if (!_consolePatched) return;
  console.log = _origConsole.log;
  console.error = _origConsole.error;
  console.warn = _origConsole.warn;
  _consolePatched = false;
}

// 模組載入時自動在生產環境啟用 console patching
patchConsole();
