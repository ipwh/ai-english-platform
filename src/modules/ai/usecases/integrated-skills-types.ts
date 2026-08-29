// Sprint 94: Integrated Skills shared types
export interface IntegratedSkillsTask {
  listeningContent: string; listeningTopicZh: string;
  dataFile?: { sources: Array<{ type: string; title: string; content: string; relevantFor: number[]; sourceDate?: string }> };
  noteTakingGuide: { question: string; hint: string; questionZh?: string; hintZh?: string }[]; writingTask: string;
  taskType: string; wordLimit: number; expectedContentPoints: string[];
  listeningAnswers: { question: string; answer: string }[];
}
export interface AnalyzeIntegratedSkillsInput {
  userId?: string; listeningContent: string;
  noteTakingGuide: { question: string; hint: string; questionZh?: string; hintZh?: string }[]; expectedContentPoints: string[];
  writingTask: string; taskType: string; studentNotes: string; studentWriting: string; gradeLevel?: string;
  /** Data File sources the student worked from — grounds data-manipulation feedback in real material */
  dataFileSources?: { type: string; title: string; content: string; relevantFor?: number[]; sourceDate?: string }[];
}
export interface IntegratedSkillsAnalysis {
  overallScore: number; listeningAccuracy: number; writingQuality: number;
  contentCompleteness: number; languageAccuracy: number; organizationClarity: number;
  capturedPoints: string[]; missedPoints: string[];
  overCopyWarnings: { original: string; suggestion: string }[];
  chinglishWarnings?: { original: string; suggestion: string; explanation: string }[];
  grammarErrors: { original: string; correction: string; explanation: string }[];
  vocabularySuggestions: { original: string; suggestion: string; reason: string }[];
  structureFeedback: string; generalComment: string; improvementTips: string[]; estimatedLevel: string;
  /** AI 參考範文（平台教學參考，非官方評分樣本） */
  modelAnswer?: string;
  /** Note-taking / Data manipulation 評語（英文原文） */
  noteTakingFeedback?: string;
  dataManipulationFeedback?: string;
  /** 雙語欄位 — 繁體中文（供英文能力稍遜的學生自學） */
  generalCommentZh?: string;
  structureFeedbackZh?: string;
  improvementTipsZh?: string[];
  noteTakingFeedbackZh?: string;
  dataManipulationFeedbackZh?: string;
}
