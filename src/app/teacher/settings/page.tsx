// ============================================
// 教師端 — 設定頁面
// 進階 AI 設定收納於 AdvancedSettings 摺疊面板
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Save, Bell, Shield, BookOpen, Users, Sparkles, Loader2, CheckCircle, XCircle } from 'lucide-react';
import AdvancedSettings from '@/components/shared/AdvancedSettings';
import { GRAMMAR_ITEM_LABELS } from '@/lib/types';
import { useT } from '@/hooks/use-i18n';

export default function TeacherSettingsPage() {
  const { t } = useT();
  const [saved, setSaved] = useState(false);
  const [aiStatus, setAiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  // 檢查 AI 服務連線狀態
  useEffect(() => {
    fetch('/api/ai/status')
      .then(r => r.json())
      .then(d => setAiStatus(d.configured ? 'connected' : 'disconnected'))
      .catch(() => setAiStatus('disconnected'));
  }, []);

  const handleSave = async () => {
    try {
      await fetch('/api/auth/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch { /* ignore */ }
    setSaved(true);
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

      {/* 文法項目啟用設定（對應 ELE KLACG 2017） */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-green-500" /> 文法項目設定（ELE KLACG 2017）
        </h2>
        <p className="text-xs text-gray-500 mb-3">選擇在練習中啟用的文法項目（共 22 項）</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(GRAMMAR_ITEM_LABELS).map(([key, val]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked className="rounded" /> {val.zh}
            </label>
          ))}
        </div>
      </section>

      {/* 評分規則設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-orange-500" /> 評分規則設定
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">及格分數 (%)</label>
            <input type="number" defaultValue={50} className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mastery 門檻 (%)</label>
            <input type="number" defaultValue={80} className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
          </div>
        </div>
      </section>

      {/* 進階 AI 服務設定 */}
      <AdvancedSettings title="進階 AI 服務設定">
        <div className="space-y-4">
          {/* AI 連線狀態 */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">AI 服務狀態</p>
              <p className="text-xs">
                {aiStatus === 'checking' && <span className="text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 檢查中...</span>}
                {aiStatus === 'connected' && <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> DeepSeek Chat 已連線</span>}
                {aiStatus === 'disconnected' && <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3" /> 未連線 — 請設定 DEEPSEEK_API_KEY</span>}
              </p>
            </div>
          </div>

          {/* 模型資訊 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">AI 模型</label>
            <input type="text" value="DeepSeek Chat (deepseek-chat)" readOnly className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-400 outline-none cursor-not-allowed" />
            <p className="text-[10px] text-gray-400 mt-1">目前平台使用 DeepSeek API 提供 AI 服務。</p>
          </div>

          {/* 自適應難度 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">自適應難度調整</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option>啟用（根據學生表現自動調整）</option>
              <option>停用（固定難度）</option>
            </select>
          </div>

          {/* 提示層級 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">提示層級上限</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option>4 層（完整提示）</option>
              <option>3 層</option>
              <option>2 層（最少提示）</option>
            </select>
          </div>

          {/* API Key 狀態 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">API 金鑰狀態</label>
            <input
              type="text"
              value={aiStatus === 'connected' ? '已設定（隱藏）' : '未設定'}
              readOnly
              className={`w-full px-3 py-2 border rounded-lg text-sm outline-none cursor-not-allowed ${
                aiStatus === 'connected'
                  ? 'border-green-300 bg-green-50 dark:bg-green-900/20 text-green-700'
                  : 'border-red-300 bg-red-50 dark:bg-red-900/20 text-red-600'
              }`}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              {aiStatus === 'connected'
                ? 'API 金鑰已設定，AI 功能正常運作中。'
                : '請在 Vercel 環境變數中設定 DEEPSEEK_API_KEY。'}
            </p>
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
          <p className="text-xs text-gray-400">
            根據香港《個人資料（私隱）條例》，學校須確保學生資料妥善保存及適時銷毁。
          </p>
        </div>
      </section>

      {/* 儲存按鈕 */}
      <button
        onClick={handleSave}
        className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
      >
        {saved ? <><CheckCircle className="w-4 h-4" /> 已儲存</> : <><Save className="w-4 h-4" /> 儲存設定</>}
      </button>
    </div>
  );
}
