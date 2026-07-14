// ============================================
// Zustand Store — Integrated Skills Task State
// 管理「聽→記→寫」全流程狀態
// ============================================
import { create } from 'zustand';

export type TaskStage = 'config' | 'listening' | 'writing' | 'result';

export interface NoteGuideItem {
  question: string;
  hint: string;
}

export interface IntegratedTaskData {
  listeningContent: string;
  listeningContentZh?: string;
  noteTakingGuide: NoteGuideItem[];
  writingTask: string;
  writingTaskZh?: string;
  expectedContentPoints: string[];
  wordLimit?: number;
}

export interface IntegratedSkillsResult {
  overallScore: number;
  estimatedLevel?: string;
  listeningAccuracy: number;
  writingQuality: number;
  contentCompleteness: number;
  languageAccuracy: number;
  organizationClarity: number;
  generalComment?: string;
  capturedPoints?: string[];
  missedPoints?: string[];
  overCopyWarnings?: { original: string; suggestion: string }[];
}

interface IntegratedSkillsState {
  // 設定
  stage: TaskStage;
  gradeLevel: string;
  difficulty: string;
  taskType: string;

  // 任務資料
  task: IntegratedTaskData | null;

  // 使用者輸入
  studentNotes: string;
  studentWriting: string;

  // 狀態
  loading: boolean;
  error: string;
  aiLoading: boolean;
  showListeningText: boolean;
  showNotesGuide: boolean;
  showContentPoints: boolean;
  draftSaved: boolean;
  showNotesWarning: boolean;

  // 結果
  analysis: IntegratedSkillsResult | null;

  // 動作
  setStage: (stage: TaskStage) => void;
  setConfig: (grade: string, diff: string, type: string) => void;
  setTask: (task: IntegratedTaskData | null) => void;
  setStudentNotes: (notes: string) => void;
  setStudentWriting: (writing: string) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string) => void;
  setAiLoading: (v: boolean) => void;
  toggleListeningText: () => void;
  toggleNotesGuide: () => void;
  toggleContentPoints: () => void;
  setDraftSaved: (v: boolean) => void;
  setShowNotesWarning: (v: boolean) => void;
  setAnalysis: (a: IntegratedSkillsResult | null) => void;
  reset: () => void;
}

const initialState = {
  stage: 'config' as TaskStage,
  gradeLevel: 'S4',
  difficulty: 'core',
  taskType: 'summary',
  task: null as IntegratedTaskData | null,
  studentNotes: '',
  studentWriting: '',
  loading: false,
  error: '',
  aiLoading: false,
  showListeningText: false,
  showNotesGuide: true,
  showContentPoints: true,
  draftSaved: false,
  showNotesWarning: false,
  analysis: null as IntegratedSkillsResult | null,
};

export const useIntegratedSkillsStore = create<IntegratedSkillsState>((set) => ({
  ...initialState,

  setStage: (stage) => set({ stage }),
  setConfig: (gradeLevel, difficulty, taskType) => set({ gradeLevel, difficulty, taskType }),
  setTask: (task) => set({ task }),
  setStudentNotes: (studentNotes) => set({ studentNotes }),
  setStudentWriting: (studentWriting) => set({ studentWriting }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setAiLoading: (aiLoading) => set({ aiLoading }),
  toggleListeningText: () => set(s => ({ showListeningText: !s.showListeningText })),
  toggleNotesGuide: () => set(s => ({ showNotesGuide: !s.showNotesGuide })),
  toggleContentPoints: () => set(s => ({ showContentPoints: !s.showContentPoints })),
  setDraftSaved: (draftSaved) => set({ draftSaved }),
  setShowNotesWarning: (showNotesWarning) => set({ showNotesWarning }),
  setAnalysis: (analysis) => set({ analysis }),
  reset: () => set(initialState),
}));
