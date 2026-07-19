// ============================================
// GCP Credential Manager — 統一 GCP Service Account 憑證管理
// 取代在 ai-service.ts / tts-service.ts / vertex-embeddings.ts 中的重複實作
// ============================================

import { GoogleAuth } from 'google-auth-library';
import fs from 'node:fs';
import path from 'node:path';

// ============================================
// 憑證來源偵測
// ============================================

/** 檢查是否有任何可用的 service account 憑證來源 */
export function hasServiceAccountSource(): boolean {
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  const localCredPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
  return fs.existsSync(localCredPath);
}

/**
 * 載入 GCP service account 憑證物件
 * 優先級：1. GCP_SERVICE_ACCOUNT_JSON env var  2. GOOGLE_APPLICATION_CREDENTIALS file  3. local file
 */
export function loadServiceAccountCredentials(): object | null {
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(credPath)) return null;
    return JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  }
  const localPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  }
  return null;
}

// ============================================
// GoogleAuth 實例管理（singleton）
// ============================================

let cachedAuth: GoogleAuth | null = null;

/**
 * 建立或取得快取的 GoogleAuth 實例
 * 可在 options 中指定 scopes 以適應不同 GCP 服務
 */
export function getGoogleAuth(options?: {
  scopes?: string[];
  keyFile?: string;
  credentials?: object;
}): GoogleAuth {
  const hasCustomOptions = options?.scopes || options?.keyFile || options?.credentials;
  if (!hasCustomOptions && cachedAuth) return cachedAuth;

  const authOptions: ConstructorParameters<typeof GoogleAuth>[0] = {
    scopes: options?.scopes || ['https://www.googleapis.com/auth/cloud-platform'],
  };

  if (options?.credentials) {
    authOptions.credentials = options.credentials;
  } else if (options?.keyFile) {
    authOptions.keyFile = options.keyFile;
  } else if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    authOptions.credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (fs.existsSync(credPath)) {
      authOptions.keyFile = credPath;
    } else {
      // Fallback: try local materials file if env var path doesn't exist
      const localCredPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
      if (fs.existsSync(localCredPath)) {
        authOptions.keyFile = localCredPath;
      } else {
        throw new Error(`GOOGLE_APPLICATION_CREDENTIALS 指向的憑證檔案不存在：${credPath}，且 materials/gcp-service-account.json 也不存在。`);
      }
    }
  } else {
    const localCredPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
    if (fs.existsSync(localCredPath)) {
      authOptions.keyFile = localCredPath;
    }
  }

  const auth = new GoogleAuth(authOptions);
  if (!hasCustomOptions) cachedAuth = auth;
  return auth;
}
