// ============================================
// 教師端 — 設定頁面
// 進階 AI 設定必須收納於 AdvancedSettings 摺疊面板內
// TODO: connect to API
// ============================================
'use client';

import { useState } from 'react';
import { Save, Bell, Shield, BookOpen, Users } from 'lucide-react';
import AdvancedSettings from '@/components/shared/AdvancedSettings';

export default function TeacherSettingsPage() {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    // TODO: connect to API
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">⚙️ 系統設定</h1>

      {/* 年級與班別設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-500" /> 年級與班別設定
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">任教年級</label>
            <div className="flex gap-2 flex-wrap">
              {['S1','S2','S3','S4','S5','S6'].map(g => (
                <label key={g} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" defaultChecked={g === 'S4' || g === 'S5'} className="rounded" /> 中{g.slice(1)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">任教班別</label>
            <div className="flex gap-2 flex-wrap">
              {['4A','4B','5C','5D'].map(c => (
                <label key={c} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" defaultChecked className="rounded" /> {c}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 技能分類設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-green-500" /> 技能分類設定
        </h2>
        <p className="text-xs text-gray-500 mb-3">選擇在平台中啟用的技能範疇</p>
        <div className="space-y-2">
          {['文法 (Grammar)', '詞彙 (Vocabulary)', '閱讀 (Reading)', '寫作 (Writing)', '改錯 (Error Correction)'].map(s => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked className="rounded" /> {s}
            </label>
          ))}
        </div>
      </section>

      {/* 評分規則設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-orange-500" /> 評分規則設定
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">及格分數 (%)</label>
            <input type="number" defaultValue={50} className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block"> mastery 門檻 (%)</label>
            <input type="number" defaultValue={80} className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
          </div>
        </div>
      </section>

      {/* 進階設定：AI 服務設定 */}
      <AdvancedSettings title="進階 AI 服務設定">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">AI 模型選擇</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option>GPT-4o（推薦）</option>
              <option>GPT-4o-mini</option>
              <option>Claude 3.5 Sonnet</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">自適應難度調整</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option>啟用（根據學生表現自動調整）</option>
              <option>停用（固定難度）</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">提示層級上限</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option>4 層（完整提示）</option>
              <option>3 層</option>
              <option>2 層（最少提示）</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">AI API 金鑰</label>
            <input type="password" value="••••••••••••••••" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" readOnly />
            <p className="text-[10px] text-gray-400 mt-1">金鑰由系統管理員設定，如需更改請聯絡 IT 支援。</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">OCR 引擎</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option>Azure Document Intelligence</option>
              <option>Tesseract (離線)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">RAG 檢索設定</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option>啟用（教材內容向量檢索）</option>
              <option>停用</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">向量資料庫</label>
            <input type="text" defaultValue="pgvector (PostgreSQL)" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none text-gray-400" readOnly />
          </div>
        </div>
      </AdvancedSettings>

      {/* 通知設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-purple-500" /> 通知設定
        </h2>
        <div className="space-y-2">
          {['作業提交通知', '低完成率警示', '學生連續未登入提醒', '系統維護通知'].map(n => (
            <label key={n} className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked className="rounded" /> {n}
            </label>
          ))}
        </div>
      </section>

      {/* 私隱與資料保存 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-gray-500" /> 私隱與資料保存
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">學生練習數據保存期限</span>
            <select className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xs outline-none">
              <option>永久保存</option>
              <option>3 年</option>
              <option>1 年</option>
            </select>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">AI 分析數據匿名化</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            本平台遵守《個人資料（私隱）條例》（香港法例第486章）。所有學生數據僅用於教學用途，不會向第三方披露。
          </p>
        </div>
      </section>

      {/* 儲存 */}
      <button
        onClick={handleSave}
        className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
          saved ? 'bg-green-500 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
        }`}
      >
        <Save className="w-4 h-4" />
        {saved ? '已儲存！' : '儲存設定'}
      </button>
    </div>
  );
}
