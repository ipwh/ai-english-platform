// ============================================
// API: /api/preferences/topics — 學生主題偏好設定
// GET:  讀取偏好
// PATCH: 更新偏好
// 前端可在練習頁加入「感興趣的主題」選項
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';

// 10 個主題類別（雙語）
export const TOPIC_CATEGORIES = [
  { id: 'school', zh: '🏫 校園生活', en: 'School Life' },
  { id: 'society', zh: '🌍 社會議題', en: 'Social Issues' },
  { id: 'technology', zh: '💻 科技', en: 'Technology' },
  { id: 'environment', zh: '🌱 環境', en: 'Environment' },
  { id: 'culture', zh: '🎭 文化', en: 'Culture' },
  { id: 'health', zh: '💊 健康', en: 'Health' },
  { id: 'career', zh: '💼 就業', en: 'Career' },
  { id: 'science', zh: '🔬 科學', en: 'Science' },
  { id: 'hk-local', zh: '🇭🇰 香港本地', en: 'Hong Kong' },
  { id: 'daily-life', zh: '🏠 日常生活', en: 'Daily Life' },
] as const;

export type TopicCategoryId = typeof TOPIC_CATEGORIES[number]['id'];

// PREFERENCES stored as JSON string on User model (or separate table)
// Using a simple approach: store in a Settings-like JSON column

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || authResult.userId;

  try {
    // For now, preferences are client-side managed via localStorage
    // This API provides the categories and acts as a future server-side sync point
    return NextResponse.json({
      categories: TOPIC_CATEGORIES,
      // preferences stored client-side for now via localStorage key 'topic-preferences'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
