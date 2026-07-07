// ============================================
// AudioPlayer — 文字轉語音元件
// 使用瀏覽器 Web Speech API，無需外部錄音檔
// 自動清除對話角色標籤（Woman:/Man: 等）
// ============================================
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Volume2, Pause, Loader2 } from 'lucide-react';

interface AudioPlayerProps {
  text: string;
  label?: string;
  autoPlay?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onPlayEnd?: () => void;
}

/** 清除對話角色標籤，避免 TTS 讀出 "Woman:" "Man:" 等 */
function cleanDialogueText(text: string): string {
  return text
    .replace(/^(Woman|Man|Boy|Girl|Speaker\s*\d|A|B)\s*[:：]\s*/gim, '')
    .replace(/\n(Woman|Man|Boy|Girl|Speaker\s*\d|A|B)\s*[:：]\s*/gim, '\n')
    .trim();
}

export default function AudioPlayer({
  text,
  label = '播放',
  autoPlay = false,
  size = 'md',
  className = '',
  onPlayEnd,
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 檢查瀏覽器支援
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setSupported(false);
    }
  }, []);

  /** 檢測文字主要語言：含有 CJK 字符則判定為中文 */
  const detectLang = useCallback((text: string): 'en' | 'zh' => {
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && cjkCount / totalChars > 0.3 ? 'zh' : 'en';
  }, []);

  const getVoice = useCallback((lang: 'en' | 'zh', preferFemale?: boolean): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    if (lang === 'zh') {
      // 中文語音：優先繁體中文（zh-HK / zh-TW），其次任何中文
      const zhVoices = voices.filter(v => v.lang.startsWith('zh-HK') || v.lang.startsWith('zh-TW'));
      if (zhVoices.length > 0) return zhVoices[0];
      const anyZh = voices.filter(v => v.lang.startsWith('zh'));
      return anyZh[0] || null;
    }
    // 英文語音
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    if (enVoices.length === 0) return null;
    if (preferFemale) {
      return enVoices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Karen'))
        || enVoices[enVoices.length - 1] || enVoices[0] || null;
    }
    return enVoices.find(v => v.name.includes('Google') || v.name.includes('Daniel') || v.name.includes('Tom'))
      || enVoices[0] || null;
  }, []);

  const handlePlay = useCallback(() => {
    if (!supported || !text) return;

    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }

    setLoading(true);

    // Chrome 修復：先取消再恢復，避免 speech 卡住
    window.speechSynthesis.cancel();

    const voices = window.speechSynthesis.getVoices();
    const doSpeak = () => {
      const cleanedText = cleanDialogueText(text);
      const utterance = new SpeechSynthesisUtterance(cleanedText);
      const lang = detectLang(cleanedText);
      const voice = getVoice(lang);
      if (voice) utterance.voice = voice;
      utterance.lang = lang === 'zh' ? 'zh-HK' : 'en-US';
      utterance.rate = lang === 'zh' ? 0.95 : 0.9;
      utterance.pitch = 1;

      // 防止 Chrome GC 回收 utterance
      utteranceRef.current = utterance;

      utterance.onstart = () => {
        setLoading(false);
        setPlaying(true);
      };
      utterance.onend = () => {
        setPlaying(false);
        utteranceRef.current = null;
        onPlayEnd?.();
      };
      utterance.onerror = (e) => {
        // 忽略取消導致的錯誤
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('TTS error:', e.error);
        }
        setPlaying(false);
        setLoading(false);
        utteranceRef.current = null;
      };

      // Chrome 修復：長文本需要 keep-alive
      const keepAlive = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(keepAlive);
          return;
        }
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }, 5000);

      utterance.onend = () => {
        clearInterval(keepAlive);
        setPlaying(false);
        utteranceRef.current = null;
        onPlayEnd?.();
      };

      window.speechSynthesis.speak(utterance);
    };

    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        doSpeak();
      };
    } else {
      doSpeak();
    }
  }, [text, playing, supported, detectLang, getVoice, onPlayEnd]);

  // 組件卸載時停止播放
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!supported) {
    return (
      <span className={`text-xs text-gray-400 ${className}`}>
        🔇 瀏覽器不支援語音播放
      </span>
    );
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2.5 text-base gap-2',
  };

  const iconSize = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' };

  return (
    <button
      onClick={handlePlay}
      disabled={loading}
      className={`inline-flex items-center rounded-lg font-medium transition-colors disabled:opacity-50 ${
        playing
          ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      } ${sizeClasses[size]} ${className}`}
      title={playing ? '停止播放' : `播放：${label}`}
    >
      {loading ? (
        <Loader2 className={`${iconSize[size]} animate-spin`} />
      ) : playing ? (
        <Pause className={iconSize[size]} />
      ) : (
        <Volume2 className={iconSize[size]} />
      )}
      {playing ? '停止' : label}
    </button>
  );
}
