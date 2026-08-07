// ============================================
// OcrUpload — 圖片上傳 + OCR 辨識元件
// 用於學生拍照上傳手寫作文，支援連續拍攝多張照片
// ============================================
'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, Loader2, X, ImagePlus, Check } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

interface OcrUploadProps {
  onTextExtracted: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function OcrUpload({ onTextExtracted, disabled = false, className = '' }: OcrUploadProps) {
  const { t } = useT();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [photoCount, setPhotoCount] = useState(0); // 已拍攝張數計數
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    // 驗證
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      setError(t('ocr.invalidType'));
      setStatus('error');
      resetInput();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('ocr.fileTooLarge'));
      setStatus('error');
      resetInput();
      return;
    }

    // 預覽
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setError('');
    setStatus('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setStatus('processing');
      const res = await fetch('/api/ocr/essay', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('ocr.processingFailed'));
      }

      if (data.text) {
        setExtractedText(data.text);
        setPhotoCount(prev => prev + 1); // 成功辨識，計數 +1
        onTextExtracted(data.text);
        // 短暫顯示 done 狀態後自動回復 idle，讓用家可以繼續拍下一張
        setStatus('done');
        setPreview(null);
        setTimeout(() => {
          setStatus('idle');
          setExtractedText('');
          setError('');
        }, 1500);
      } else if (data.warning) {
        setError(data.warning);
        setStatus('error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('ocr.failed');
      setError(msg);
      setStatus('error');
    } finally {
      setUploading(false);
      // 釋放 preview URL
      URL.revokeObjectURL(previewUrl);
      // 重置 file input，讓用家可以立即拍攝下一張照片
      resetInput();
    }
  }, [onTextExtracted]);

  /** 重置 file input 的值，使同一張照片可被重新選取／相機可再次打開 */
  const resetInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clear = () => {
    setPreview(null);
    setExtractedText('');
    setPhotoCount(0);
    setStatus('idle');
    setError('');
    resetInput();
  };

  // 按鈕是否可點擊：只在 disabled 或正在上傳/辨識時禁用
  const buttonDisabled = disabled || uploading;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Upload button — 始終可點擊以連續拍攝 */}
      <label
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
          ${buttonDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${status === 'done'
            ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
            : status === 'processing' || status === 'uploading'
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30'
          }`}
      >
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : status === 'done' ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Camera className="w-3.5 h-3.5" />
        )}
        {uploading ? t('ocr.scanning')
          : status === 'done' ? t('ocr.done')
          : photoCount > 0
            ? `${t('ocr.uploadPhoto')} (${photoCount})`
            : t('ocr.uploadPhoto')}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp"
          capture="environment"
          className="hidden"
          disabled={buttonDisabled}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {/* Preview thumbnail */}
      {preview && (
        <div className="relative inline-flex">
          <img
            src={preview}
            alt="Preview"
            className="w-8 h-8 rounded object-cover border border-gray-200 dark:border-gray-600"
          />
          <button
            onClick={clear}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <span className="text-xs text-red-500 max-w-[200px] truncate" title={error}>
          {error}
        </span>
      )}

      {/* Extracted text summary + photo count */}
      {status === 'done' && extractedText && (
        <span className="text-xs text-green-600 dark:text-green-400">
          +{extractedText.length} {t('ocr.chars')}
        </span>
      )}

      {/* 已辨識張數計數（idle 狀態下持續顯示） */}
      {photoCount > 0 && status !== 'done' && !uploading && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {photoCount} {t('ocr.photos')}
        </span>
      )}
    </div>
  );
}
