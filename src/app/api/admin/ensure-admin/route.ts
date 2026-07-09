// ============================================
// POST /api/admin/ensure-admin — 確保管理員帳號存在
// 一次性使用：在生產環境建立 admin 帳號
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
}

export async function POST(request: NextRequest) {
  try {
    const adminEmail = 'ipwh@pochiu.edu.hk';
    const adminPassword = 'admin123';

    const existing = await db.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, role: true },
    });

    if (existing) {
      // 確保 role 為 admin
      if (existing.role !== 'admin') {
        await db.user.update({
          where: { email: adminEmail },
          data: { role: 'admin' },
        });
        return NextResponse.json({
          message: `管理員帳號已存在，role 已更新為 admin`,
          email: adminEmail,
        });
      }
      return NextResponse.json({
        message: '管理員帳號已存在，無需建立',
        email: adminEmail,
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
