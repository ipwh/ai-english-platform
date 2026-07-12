// ============================================
// POST /api/admin/ensure-admin — 確保管理員帳號存在
// 一次性使用：在生產環境建立 admin 帳號
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { simpleHash } from '@/lib/crypto';

export async function GET() {
  return POST();
}

export async function POST(_request?: NextRequest) {
  try {
    const adminEmail = 'ipwh@pochiu.edu.hk';
    const adminPassword = 'admin123';

    const existing = await db.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, role: true },
    });

    if (existing) {
      // 確保 role 為 admin，並補設定密碼（若之前是 Google OAuth 建立則無密碼）
      await db.user.update({
        where: { email: adminEmail },
        data: {
          role: 'admin',
          passwordHash: simpleHash(adminPassword),
        },
      });
      return NextResponse.json({
        message: '管理員帳號已存在，role 及密碼已更新',
        email: adminEmail,
        password: adminPassword,
      });
    }

    // 建立 admin 帳號
    await db.user.create({
      data: {
        email: adminEmail,
        passwordHash: simpleHash(adminPassword),
        name: 'Admin',
        nameEn: 'System Admin',
        role: 'admin',
        level: undefined,
      },
    });

    return NextResponse.json({
      message: '管理員帳號已建立',
      email: adminEmail,
      password: adminPassword,
      loginMethod: '使用上述 email 和 password 在登入頁面以密碼登入，或使用 Google OAuth 登入',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
