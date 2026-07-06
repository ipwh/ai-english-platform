// ============================================
// Style Guide — 設計系統展示頁面
// ============================================
'use client';

import KpiCard from '@/components/shared/KpiCard';
import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import EmptyState from '@/components/shared/EmptyState';
import AdvancedSettings from '@/components/shared/AdvancedSettings';
import { CardSkeleton, ListSkeleton } from '@/components/shared/Skeleton';
import { BookOpen, Filter } from 'lucide-react';
import type { KpiData } from '@/lib/types';

const sampleKpi: KpiData = { label: '本週練習量', value: 32, unit: '題', trend: 'up', change: 12 };

export default function StyleGuidePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10 py-8 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🎨 設計系統</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">AI 英語學習平台 · UI 元件展示</p>
      </div>

      {/* 色彩系統 */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">色彩系統</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {[
            { name: 'Teal 500', color: 'bg-teal-500', hex: '#14b8a6' },
            { name: 'Blue 500', color: 'bg-blue-500', hex: '#3b82f6' },
            { name: 'Green 500', color: 'bg-green-500', hex: '#22c55e' },
            { name: 'Orange 500', color: 'bg-orange-500', hex: '#f97316' },
            { name: 'Red 500', color: 'bg-red-500', hex: '#ef4444' },
            { name: 'Purple 500', color: 'bg-purple-500', hex: '#a855f7' },
            { name: 'Gray 500', color: 'bg-gray-500', hex: '#6b7280' },
          ].map((c) => (
            <div key={c.name} className="text-center">
              <div className={`w-full h-16 ${c.color} rounded-xl mb-2`} />
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.name}</p>
              <p className="text-[10px] text-gray-400">{c.hex}</p>
            </div>
          ))}
        </div>
      </section>

      {/* KPI Card */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">KPI 卡片</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard data={sampleKpi} />
          <KpiCard data={{ label: '正確率', value: 68, unit: '%', trend: 'up', change: 3 }} />
          <KpiCard data={{ label: '連續學習', value: 7, unit: '天', trend: 'stable', change: 0 }} />
        </div>
      </section>

      {/* Progress Bar */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">進度條</h2>
        <div className="space-y-4 max-w-md">
          <ProgressBar value={85} size="lg" label="高掌握度" />
          <ProgressBar value={55} size="md" label="中等掌握度" />
          <ProgressBar value={25} size="sm" label="低掌握度" />
        </div>
      </section>

      {/* Skill Chip */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">技能標籤</h2>
        <div className="flex gap-3 flex-wrap">
          <SkillChip skill="grammar" subSkill="時態 (Tenses)" />
          <SkillChip skill="vocabulary" />
          <SkillChip difficulty="remedial" />
          <SkillChip difficulty="core" />
          <SkillChip difficulty="challenge" />
        </div>
      </section>

      {/* Empty State */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">空白狀態</h2>
        <EmptyState
          icon={<Filter className="w-10 h-10" />}
          title="暫無資料"
          description="此處目前沒有任何內容，請稍後再試。"
          action={{ label: '重新整理', onClick: () => {} }}
        />
      </section>

      {/* Loading Skeleton */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">載入骨架</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <ListSkeleton rows={3} />
      </section>

      {/* Advanced Settings */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">進階設定面板</h2>
        <AdvancedSettings title="進階 AI 服務設定">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">AI 模型選擇</label>
              <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                <option>GPT-4o（推薦）</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">API 金鑰</label>
              <input type="password" value="••••••••" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none" readOnly />
            </div>
          </div>
        </AdvancedSettings>
      </section>

      {/* 按鈕狀態 */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">按鈕</h2>
        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-medium">主要按鈕</button>
          <button className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium">次要按鈕</button>
          <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">一般按鈕</button>
          <button className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium">危險按鈕</button>
          <button className="px-4 py-2 border-2 border-dashed border-gray-300 text-gray-400 rounded-xl text-sm font-medium">虛線按鈕</button>
        </div>
      </section>
    </div>
  );
}
