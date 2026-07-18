// ============================================
// API 回應型別統一包裝 — AI English Platform
// 所有 API routes 應使用此型別以確保前後端一致
//
// 使用方式：
//   import { success, error, ApiResponse } from '@/shared/utils/api-response';
//   return success({ questions });
//   return error('NOT_FOUND', 'User not found', 404);
// ============================================

/**
 * 統一 API 回應包裝型別。
 * 所有 API route 的回應都應遵循此格式。
 *
 * @typeParam T - 成功時的資料型別
 *
 * @example
 * // 成功回應
 * { success: true, data: { questions: [...] } }
 *
 * // 錯誤回應
 * { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }
 */
export type ApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: ApiErrorBody };

export interface ApiErrorBody {
  /** 機器可讀錯誤碼 */
  code: ApiErrorCode | (string & {});
  /** 人類可讀錯誤訊息 */
  message: string;
  /** 可選：詳細錯誤資訊 */
  details?: Record<string, unknown>;
}

/**
 * 常用 API 錯誤碼
 */
export type ApiErrorCode =
  | 'BAD_REQUEST'           // 400 — 請求格式錯誤
  | 'UNAUTHORIZED'          // 401 — 未登入
  | 'FORBIDDEN'             // 403 — 無權限
  | 'NOT_FOUND'             // 404 — 資源不存在
  | 'CONFLICT'              // 409 — 資源衝突
  | 'RATE_LIMITED'          // 429 — 請求過於頻繁
  | 'VALIDATION_ERROR'      // 422 — 輸入驗證失敗
  | 'AI_SERVICE_UNAVAILABLE' // 503 — AI 服務不可用
  | 'AI_TIMEOUT'            // 504 — AI 服務超時
  | 'INTERNAL_ERROR';       // 500 — 伺服器內部錯誤

/**
 * 建立成功回應
 */
export function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

/**
 * 建立錯誤回應
 */
export function error(
  code: ApiErrorCode | (string & {}),
  message: string,
  details?: Record<string, unknown>
): ApiResponse<never> {
  return {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  };
}

/**
 * 將 HTTP status code 對應到 ApiErrorCode
 */
export function httpStatusToCode(status: number): ApiErrorCode | string {
  const map: Record<number, ApiErrorCode> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    503: 'AI_SERVICE_UNAVAILABLE',
    504: 'AI_TIMEOUT',
  };
  return map[status] || 'INTERNAL_ERROR';
}

/**
 * 將 ApiErrorCode 對應到 HTTP status code
 */
export function errorCodeToStatus(code: ApiErrorCode | string): number {
  const map: Record<string, number> = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    VALIDATION_ERROR: 422,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    AI_SERVICE_UNAVAILABLE: 503,
    AI_TIMEOUT: 504,
  };
  return map[code] || 500;
}

/**
 * Next.js NextResponse 輔助函式：建立成功 JSON 回應
 *
 * @example
 * return jsonSuccess({ questions }, 201);
 */
export function jsonSuccess<T>(data: T, status = 200): Response {
  return Response.json(
    success(data),
    { status }
  );
}

/**
 * Next.js NextResponse 輔助函式：建立錯誤 JSON 回應
 *
 * @example
 * return jsonError('NOT_FOUND', 'User not found', 404);
 */
export function jsonError(
  code: ApiErrorCode | (string & {}),
  message: string,
  status?: number,
  details?: Record<string, unknown>
): Response {
  return Response.json(
    error(code, message, details),
    { status: status ?? errorCodeToStatus(code) }
  );
}
