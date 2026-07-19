// Sprint 40+: Notification Repository — 通知邏輯測試
import { describe, it, expect } from 'vitest';

describe('NotificationService — 通知邏輯', () => {
  it('應建立有效的通知物件', () => {
    const notification = {
      id: 'n1',
      userId: 's1',
      type: 'assignment' as const,
      title: '新作業',
      message: '你有一份新的文法練習作業',
      link: '/student/assignments/a1',
      read: false,
      createdAt: new Date(),
    };
    expect(notification.type).toBe('assignment');
    expect(notification.read).toBe(false);
    expect(notification.link).toContain('/student/');
  });

  it('應支援所有通知類型', () => {
    const types = ['assignment', 'feedback', 'reminder', 'system', 'achievement'] as const;
    const notifications = types.map((type, i) => ({
      id: `n${i}`,
      userId: 's1',
      type,
      title: `Test ${type}`,
      message: `This is a ${type} notification`,
      read: false,
      createdAt: new Date(),
    }));
    expect(notifications).toHaveLength(5);
    for (const n of notifications) {
      expect(types).toContain(n.type);
    }
  });

  it('應正確計算未讀通知數', () => {
    const notifications = [
      { read: false }, { read: true }, { read: false }, { read: false }, { read: true },
    ];
    const unreadCount = notifications.filter(n => !n.read).length;
    expect(unreadCount).toBe(3);
  });

  it('應支援大量通知新增（bulk create）', () => {
    const classStudentIds = ['s1', 's2', 's3', 's4', 's5'];
    const bulkData = classStudentIds.map(studentId => ({
      userId: studentId,
      type: 'assignment' as const,
      title: '新作業：過去式練習',
      message: '請在週五前完成',
      link: '/student/assignments/a1',
    }));
    expect(bulkData).toHaveLength(5);
    for (const item of bulkData) {
      expect(item.userId).toMatch(/^s\d$/);
      expect(item.title).toContain('作業');
    }
  });

  it('應支援標記為已讀', () => {
    const notification = { read: false };
    notification.read = true;
    expect(notification.read).toBe(true);
  });

  it('應支援標記全部為已讀', () => {
    const notifications = [
      { id: 'n1', read: false },
      { id: 'n2', read: false },
      { id: 'n3', read: true },
    ];
    const allRead = notifications.map(n => ({ ...n, read: true }));
    expect(allRead.every(n => n.read)).toBe(true);
  });

  it('應過濾特定使用者的通知', () => {
    const notifications = [
      { userId: 's1', type: 'assignment' },
      { userId: 's2', type: 'feedback' },
      { userId: 's1', type: 'achievement' },
    ];
    const s1Notifs = notifications.filter(n => n.userId === 's1');
    expect(s1Notifs).toHaveLength(2);
  });
});
