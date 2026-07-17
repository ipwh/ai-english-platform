// ============================================
// POST /api/admin/ensure-admin — 確保管理員帳號存在
// ⚠️ 僅供開發/初始化使用，生產環境自動禁用
// 密碼由環境變數 ADMIN_INIT_PASSWORD 提供，無設定時不允許建立
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPasswordSync } from '@/lib/crypto';

export async function GET() {
  return POST();
}

export async function POST(_request?: NextRequest) {
  // 🔒 Production guard — this endpoint must never be accessible in production
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  // 🔒 Password must be provided via environment variable — no hardcoded default
  const adminPassword = process.env.ADMIN_INIT_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    return NextResponse.json({
      error: 'ADMIN_INIT_PASSWORD environment variable must be set (min 8 characters)',
    }, { status: 400 });
  }

  try {
    const adminEmail = 'ipwh@pochiu.edu.hk';

    const existing = await db.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, role: true },
    });

    if (existing) {
      // 確保 role 為 admin，並更新密碼
      await db.user.update({
        where: { email: adminEmail },
        data: {
          role: 'admin',
          passwordHash: hashPasswordSync(adminPassword),
        },
      });
      return NextResponse.json({
        message: '管理員帳號已存在，role 及密碼已更新',
        email: adminEmail,
        // 不回傳密碼明文
      });
    }

    // 建立 admin 帳號
    await db.user.create({
      data: {
        email: adminEmail,
        passwordHash: hashPasswordSync(adminPassword),
        name: 'Admin',
        nameEn: 'System Admin',
        role: 'admin',
        level: undefined,
      },
    });

    return NextResponse.json({
      message: '管理員帳號已建立',
      email: adminEmail,
      // 不回傳密碼明文
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
