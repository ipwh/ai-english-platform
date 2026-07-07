'use client';

// ============================================
// 教師導入頁面 — 批量導入學生 / 教師資料
// ============================================

import { useState, useCallback } from 'react';
import { Upload, Download, CheckCircle, XCircle, AlertTriangle, FileText, Users, GraduationCap } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

interface ImportDetail {
  email: string;
  nameZh: string;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
}

interface ImportResult {
  total: number;
  success: number;
  skipped: number;
  errors: string[];
  details: ImportDetail[];
}

export default function ImportPage() {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleImport = useCallback(async (dryRun = false) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('role', role);
      formData.append('dryRun', String(dryRun));

      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || '導入失敗');
        return;
      }
      setResult(json);
    } catch {
      setError('網絡錯誤，請重試。');
    } finally {
      setLoading(false);
    }
  }, [file, role]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.csv') || droppedFile.name.endsWith('.xlsx'))) {
      setFile(droppedFile);
    }
  }, []);

  const downloadTemplate = (type: 'student' | 'teacher') => {
    const headers = type === 'student'
      ? 'nameZh,nameEn,email,password,class,classNumber,level'
      : 'nameZh,nameEn,email,password,classes,subjects,formTeacherOf';

    const examples = type === 'student'
      ? '陳家明,Chan Ka Ming,student@school.hk,student123,4A,15,S4\n李志偉,Lee Chi Wai,student2@school.hk,student123,4A,20,S4'
      : '黃淑儀,Wong Suk Yee,teacher@school.hk,teacher123,4A|4B|5C,English Language,4A';

    const csv = `${headers}\n${examples}`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* 頁面標題 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.import.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          通過 CSV 檔案批量導入學生或教師帳號
        </p>
      </div>

      {/* 角色選擇 */}
      <div className="flex gap-4">
        <button
          onClick={() => { setRole('student'); setResult(null); }}
          className={`flex-1 p-4 rounded-xl border-2 transition ${
            role === 'student'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
          }`}
        >
          <Users className={`w-6 h-6 mb-2 ${role === 'student' ? 'text-blue-600' : 'text-gray-400'}`} />
          <div className="font-semibold">學生</div>
          <div className="text-sm text-gray-500">導入學生帳號及班級資料</div>
        </button>
        <button
          onClick={() => { setRole('teacher'); setResult(null); }}
          className={`flex-1 p-4 rounded-xl border-2 transition ${
            role === 'teacher'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
          }`}
        >
          <GraduationCap className={`w-6 h-6 mb-2 ${role === 'teacher' ? 'text-blue-600' : 'text-gray-400'}`} />
          <div className="font-semibold">教師</div>
          <div className="text-sm text-gray-500">導入教師帳號及任教班級</div>
        </button>
      </div>

      {/* CSV 格式說明 */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            CSV 格式要求（{role === 'student' ? '學生' : '教師'}）
          </h3>
          <button
            onClick={() => downloadTemplate(role)}
            className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> 下載範本
          </button>
        </div>
        {role === 'student' ? (
          <div className="space-y-1 text-sm">
            <p><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">nameZh, nameEn, email, password, class, classNumber, level</code></p>
            <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 text-xs space-y-0.5">
              <li><strong>nameZh</strong>: 中文姓名（必填）</li>
              <li><strong>nameEn</strong>: 英文姓名</li>
              <li><strong>email</strong>: 學校電郵（必填，不可重複）</li>
              <li><strong>password</strong>: 初始密碼（預設 student123）</li>
              <li><strong>class</strong>: 班級名稱，如 4A、5C（必填）</li>
              <li><strong>classNumber</strong>: 班號，如 15</li>
              <li><strong>level</strong>: 年級，如 S4、S5（若不填則由班級名稱推斷）</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <p><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">nameZh, nameEn, email, password, classes, subjects, formTeacherOf</code></p>
            <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 text-xs space-y-0.5">
              <li><strong>classes</strong>: 任教班級，以 <code>|</code> 分隔，如 <code>4A|4B|5C</code></li>
              <li><strong>subjects</strong>: 任教科目，以 <code>|</code> 分隔，如 <code>English Language</code></li>
              <li><strong>formTeacherOf</strong>: 班主任班級（可選）</li>
            </ul>
          </div>
        )}
      </div>

      {/* 檔案上傳區 */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
          dragOver
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        {file ? (
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            <button
              onClick={() => setFile(null)}
              className="mt-2 text-sm text-red-500 hover:text-red-600"
            >
              移除檔案
            </button>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 dark:text-gray-400">
              拖放 CSV 檔案至此處，或
              <label className="mx-1 text-blue-600 hover:text-blue-700 cursor-pointer">
                瀏覽檔案
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setFile(f);
                  }}
                />
              </label>
            </p>
            <p className="text-xs text-gray-400 mt-1">支援 .csv 檔案（UTF-8 編碼）</p>
          </div>
        )}
      </div>

      {/* 操作按鈕 */}
      <div className="flex gap-3">
        <button
          onClick={() => handleImport(true)}
          disabled={!file || loading}
          className="flex-1 py-3 px-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition"
        >
          🔍 預覽（不實際導入）
        </button>
        <button
          onClick={() => handleImport(false)}
          disabled={!file || loading}
          className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="animate-spin">⏳</span>
          ) : (
            <Upload className="w-4 h-4" />
          )}
          確認導入
        </button>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 導入結果 */}
      {result && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold">導入結果</h3>
          </div>

          {/* 統計摘要 */}
          <div className="grid grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{result.total}</div>
              <div className="text-xs text-gray-500">總數</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{result.success}</div>
              <div className="text-xs text-gray-500">成功</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{result.skipped}</div>
              <div className="text-xs text-gray-500">跳過（已存在）</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{result.errors.length}</div>
              <div className="text-xs text-gray-500">錯誤</div>
            </div>
          </div>

          {/* 詳細列表 */}
          {result.details.length > 0 && (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="text-left p-3 font-medium">姓名</th>
                    <th className="text-left p-3 font-medium">電郵</th>
                    <th className="text-left p-3 font-medium">狀態</th>
                    <th className="text-left p-3 font-medium">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {result.details.map((d, i) => (
                    <tr key={i}>
                      <td className="p-3">{d.nameZh}</td>
                      <td className="p-3 text-gray-500">{d.email}</td>
                      <td className="p-3">
                        {d.status === 'created' && (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3 h-3" /> 已導入
                          </span>
                        )}
                        {d.status === 'skipped' && (
                          <span className="inline-flex items-center gap-1 text-yellow-600">
                            <AlertTriangle className="w-3 h-3" /> 已跳過
                          </span>
                        )}
                        {d.status === 'error' && (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <XCircle className="w-3 h-3" /> 錯誤
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-gray-500 text-xs">{d.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
