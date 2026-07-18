// ============================================
// 教師端 — 教材中心（支援 PDF/DOCX/TXT 文字提取 + OCR + RAG）
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, File as FileIcon, Image, Sparkles, Search, Tag, ChevronDown, ChevronUp, Loader2, Link2, Pencil, Trash2, Check, X } from 'lucide-react';

import { formatDate } from '@/shared/utils/utils';
import { useT } from '@/hooks/use-i18n';

const typeIcons: Record<string, React.ElementType> = {
  'pdf': FileText,
  'docx': FileIcon,
  'image': Image,
  'ppt': FileIcon,
};

export default function TeacherMaterialsPage() {
  const { t } = useT();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // === AI 教材分析 ===
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<Record<string, string>>({});
  const [driveUrl, setDriveUrl] = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveMessage, setDriveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [aiResults, setAiResults] = useState<Record<string, {
    summary: string;
    keyVocabulary: { word: string; meaningZh: string }[];
    keyGrammarPoints: { point: string; explanationZh: string }[];
    suggestedQuestions: { type: string; prompt: string; answer: string }[];
    difficultyLevel: string;
    suggestedGrade: string;
  } | null>>({});

  // === Edit/Delete state ===
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const handleEdit = (m: any) => {
    setEditingId(m.id);
    setEditTitle(m.title);
    setEditDesc(m.description || '');
    setEditTags((m.tags || []).join(', '));
    setEditGrade(m.gradeLevel || '');
    setSuccessMsg('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    setEditLoading(true);
    setUploadError('');
    try {
      const tagList = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
      const body: Record<string, unknown> = { id: editingId, title: editTitle.trim(), tags: tagList };
      if (editDesc) body.description = editDesc.trim();
      if (editGrade) body.gradeLevel = editGrade;

      await fetch('/api/materials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setEditingId(null);
      setSuccessMsg(t('common.success'));
      setTimeout(() => setSuccessMsg(''), 3000);
      loadMaterials();
    } catch (e) {
      console.error('[Materials] Edit failed:', e);
      setUploadError(t('teacher.materials.saveFailed'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setUploadError('');
    try {
      await fetch('/api/materials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setDeleteConfirm(null);
      setExpandedId(null);
      setSuccessMsg(t('common.success'));
      setTimeout(() => setSuccessMsg(''), 3000);
      loadMaterials();
    } catch (e) {
      console.error('[Materials] Delete failed:', e);
      setUploadError(t('teacher.materials.deleteFailed'));
    }
    finally { setDeletingId(null); }
  };

  const handleAIAnalyze = async (materialId: string, title: string, extractedText?: string, fileType?: string) => {
    setAnalyzingId(materialId);
    setAnalyzeError(prev => ({ ...prev, [materialId]: '' }));
    try {
      const content = extractedText && extractedText.length > 50
        ? extractedText
        : `教材名稱：${title}\n類型：${fileType || '未知'}\n請根據教材名稱與類型推測可能的教學內容，並提供相關的詞彙、文法點及建議題目。`;
      const res = await fetch('/api/ai/analyze-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          gradeLevel: 'S4',
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiResults(prev => ({ ...prev, [materialId]: json.analysis }));
      } else {
        setAnalyzeError(prev => ({ ...prev, [materialId]: json.error || 'AI 分析失敗' }));
      }
    } catch {
      setAnalyzeError(prev => ({ ...prev, [materialId]: 'AI 分析連接失敗，請稍後再試' }));
    }
    finally { setAnalyzingId(null); }
  };

  // RAG 索引
  const handleRagIndex = async (materialId: string) => {
    setIndexingId(materialId);
    setAnalyzeError(prev => ({ ...prev, [materialId]: '' }));
    try {
      await fetch('/api/rag?action=index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId }),
      });
    } catch {
      setAnalyzeError(prev => ({ ...prev, [materialId]: 'RAG 索引建立失敗' }));
    }
    finally { setIndexingId(null); }
  };

  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadMaterials = () => {
    setLoading(true); setLoadError(false);
    fetch('/api/materials')
      .then(r => r.json())
      .then(d => setMaterials(d.materials || []))
      .catch((e) => { console.error('Failed to load materials:', e); setLoadError(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMaterials(); }, []);

  const filtered = materials.filter(m => {
    if (search && !m.title.includes(search)) return false;
    return true;
  });

  const statusLabel: Record<string, { label: string; color: string }> = {
    'pending': { label: '待處理', color: 'bg-gray-100 text-gray-600' },
    'processing': { label: '處理中', color: 'bg-yellow-100 text-yellow-700' },
    'completed': { label: '已完成', color: 'bg-green-100 text-green-700' },
    'failed': { label: '失敗', color: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.materials.title')}</h1>

      {/* 上傳錯誤提示 */}
      {uploadError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2">
          <p className="text-sm text-red-600 dark:text-red-400 flex-1">{uploadError}</p>
          <button onClick={() => setUploadError('')} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* 上傳區 */}
      <label className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer block ${uploading ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10 opacity-70' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'}`}>
        {uploading ? (
          <>
            <Loader2 className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">{t('teacher.materials.uploading')}</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-gray-300 dark:text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('teacher.materials.dropzone')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('teacher.materials.dropzoneHint')}</p>
          </>
        )}
        <input
          type="file"
          accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.txt"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            const fileSizeKB = (file.size / 1024).toFixed(0);

            if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
              const text = await file.text();
              try {
                const res = await fetch('/api/materials', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: file.name.replace('.txt', ''),
                    type: 'text',
                    content: text.slice(0, 50000),
                    fileSize: file.size,
                  }),
                });
                if (res.ok) {
                  // Refresh materials list
                  const mRes = await fetch('/api/materials');
                  const mData = await mRes.json();
                  setMaterials(mData.materials || []);
                } else {
                  setUploadError(t('teacher.materials.uploadFailed'));
                }
              } catch (e) {
                console.error('[Materials] Text upload failed:', e);
                setUploadError(t('teacher.materials.uploadFailed'));
              }
            } else if (file.type.startsWith('image/')) {
              // OCR: 使用 Vision API 提取文字
              const formData = new FormData();
              formData.append('file', file);
              try {
                const res = await fetch('/api/ocr/essay', { method: 'POST', body: formData });
                if (res.ok) {
                  const data = await res.json();
                  await fetch('/api/materials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: file.name, type: 'image',
                      content: data.text || '', fileSize: file.size,
                    }),
                  });
                  const mRes = await fetch('/api/materials');
                  const mData = await mRes.json();
                  setMaterials(mData.materials || []);
                } else {
                  setUploadError(t('teacher.materials.ocrFailed'));
                }
              } catch (e) {
                console.error('[Materials] OCR upload failed:', e);
                setUploadError(t('teacher.materials.uploadFailed'));
              }
            } else {
              // PDF、DOCX、PPTX：上傳檔案由伺服器端提取文字
              const formData = new FormData();
              formData.append('file', file);
              try {
                const res = await fetch('/api/materials', { method: 'POST', body: formData });
                if (res.ok) {
                  const mRes = await fetch('/api/materials');
                  const mData = await mRes.json();
                  setMaterials(mData.materials || []);
                } else {
                  const errData = await res.json().catch(() => ({}));
                  setUploadError(errData.error || t('teacher.materials.uploadFailed'));
                }
              } catch {
                setUploadError(t('teacher.materials.connectionFailed'));
              }
            }
            e.target.value = '';
            setUploading(false);
          }}
          className="hidden"
        />
      </label>

      {/* Google Drive 匯入 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('teacher.materials.driveImport')}</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder={t('teacher.materials.drivePlaceholder')}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={async () => {
              if (!driveUrl) return;
              setDriveLoading(true);
              setDriveMessage(null);
              try {
                const res = await fetch('/api/drive/download', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: driveUrl }),
                });
                const data = await res.json();
                if (data.success) {
                  setDriveMessage({ type: 'success', text: t('teacher.materials.imported', { name: data.file.name, length: String(data.file.contentLength) }) });
                  setDriveUrl('');
                  loadMaterials();
                } else {
                  setDriveMessage({ type: 'error', text: data.error || t('teacher.materials.importFailed') });
                }
              } catch {
                setDriveMessage({ type: 'error', text: t('teacher.materials.connectionFailed') });
              }
              finally { setDriveLoading(false); }
            }}
            disabled={driveLoading || !driveUrl}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium flex items-center gap-1"
          >
            {driveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {t('teacher.materials.importBtn')}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('teacher.materials.driveHint')}</p>
        {driveMessage && (
          <div className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-2 ${
            driveMessage.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
          }`}>
            <span className="flex-1">{driveMessage.text}</span>
            <button onClick={() => setDriveMessage(null)} className="opacity-50 hover:opacity-100">&times;</button>
          </div>
        )}
      </div>

      {/* 搜尋 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('teacher.materials.searchPlaceholder')}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 教材列表 */}
      <div className="space-y-3">
        {filtered.map((m) => {
            const Icon = typeIcons[m.type] || FileIcon;
          const isExpanded = expandedId === m.id;
          return (
            <div key={m.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {m.tags.map((tag: string) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 flex items-center gap-1">
                        <Tag className="w-2 h-2" /> {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                  {/* Edit button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(m); }}
                    className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-500 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(m.id); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span>{m.fileSize}</span>
                  <span>{formatDate(m.uploadedAt)}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* 展開詳情 */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-gray-400">OCR 狀態</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${statusLabel[m.ocrStatus].color}`}>{statusLabel[m.ocrStatus].label}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">RAG 狀態</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${statusLabel[m.ragStatus].color}`}>{statusLabel[m.ragStatus].label}</span>
                    </div>
                  </div>

                  {/* AI 教材分析 */}
                  {!aiResults[m.id] ? (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                      <Sparkles className="w-6 h-6 text-purple-300 mx-auto mb-2" />
                      <p className="text-xs text-gray-500 mb-3">使用 AI 分析教材內容，提取關鍵詞彙及文法點</p>
                      {analyzeError[m.id] && <p className="text-xs text-red-500 mb-2">{analyzeError[m.id]}</p>}
                      <button
                        onClick={() => handleAIAnalyze(m.id, m.title, m.extractedText, m.fileType)}
                        disabled={analyzingId === m.id}
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium inline-flex items-center gap-2"
                      >
                        {analyzingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {analyzingId === m.id ? 'AI 分析中...' : 'AI 分析教材'}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 space-y-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="font-medium text-purple-700 dark:text-purple-300">AI 分析結果</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400">{aiResults[m.id]!.summary}</p>
                      {aiResults[m.id]!.keyVocabulary.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {aiResults[m.id]!.keyVocabulary.slice(0, 5).map((v, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-white dark:bg-gray-800 rounded-full text-gray-600">
                              {v.word} — {v.meaningZh}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 從教材建立練習 */}
                  <button
                    onClick={() => router.push(`/teacher/assignments/new?materialId=${m.id}&materialTitle=${encodeURIComponent(m.title)}`)}
                    className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> 從此教材生成練習題目
                  </button>

                  {/* RAG 語義索引 */}
                  {m.ragStatus !== 'done' && (
                    <button
                      onClick={() => handleRagIndex(m.id)}
                      disabled={indexingId === m.id}
                      className="w-full py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 hover:bg-purple-200 text-sm rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                      <Loader2 className={`w-4 h-4 ${indexingId === m.id ? 'animate-spin' : ''}`} />
                      {indexingId === m.id ? '索引建立中...' : '建立語義索引 (RAG)'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingId(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 z-10 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('common.edit')} {t('teacher.materials.title')}</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.edit')} {t('teacher.review.scoreCorrection')}</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('teacher.review.commentCorrection')}</label>
              <input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder={t('groups.descPlaceholder')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.users.level')}</label>
              <select
                value={editGrade}
                onChange={(e) => setEditGrade(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">—</option>
                {['S1','S2','S3','S4','S5','S6'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('teacher.review.commentCorrection')} ({t('common.edit')})</label>
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="e.g. reading, S4, science"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 border rounded-lg text-sm">{t('groups.cancel')}</button>
              <button
                onClick={handleSaveEdit}
                disabled={editLoading || !editTitle.trim()}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-1"
              >
                {editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editLoading ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 z-10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{t('groups.delete')} {t('teacher.materials.title')}</h2>
                <p className="text-sm text-gray-500">{t('groups.deleteConfirm')}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border rounded-lg text-sm">{t('groups.cancel')}</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deletingId === deleteConfirm}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-1"
              >
                {deletingId === deleteConfirm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deletingId === deleteConfirm ? t('groups.deleting') : t('groups.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 inline mr-1" /> {successMsg}
        </div>
      )}
    </div>
  );
}
