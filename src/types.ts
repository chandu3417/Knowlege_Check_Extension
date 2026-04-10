export type QuizLevel = "beginner" | "intermediate" | "advanced";

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionIds: string[];
  explanation: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface Quiz {
  id: string;
  sourceUrl: string;
  title: string;
  createdAt: string;
  level: QuizLevel;
  questions: QuizQuestion[];
}

export interface PageSummary {
  url: string;
  origin: string;
  title: string;
  extractedText: string;
  headings: string[];
  detectedLevel: QuizLevel;
  learningScore: number;
  suggested: boolean;
  contentHash: string;
}

export interface Settings {
  apiKey: string;
  model: string;
  numQuestions: number;
  difficultyPreference: "auto" | QuizLevel;
  privacyMode: boolean;
  autosuggestEnabled: boolean;
}

export interface PerQuestionStats {
  questionId: string;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean;
  precision: number;
  recall: number;
  tags: string[];
}

export interface QuizAttempt {
  quizId: string;
  sourceUrl: string;
  title: string;
  createdAt: string;
  score: number;
  accuracy: number;
  level: QuizLevel;
  timeTakenSec: number;
  perQuestionStats: PerQuestionStats[];
  tagsBreakdown: Record<string, { correct: number; total: number }>;
}

export interface HistoryRecord {
  sourceUrl: string;
  title: string;
  attempts: QuizAttempt[];
}

export interface CacheEntry {
  quiz: Quiz;
  createdAt: string;
}

export interface StorageState {
  settings: Settings;
  history: Record<string, HistoryRecord>;
  cache: Record<string, CacheEntry>;
}

export interface QuizResult {
  score: number;
  accuracy: number;
  timeTakenSec: number;
  perQuestionStats: PerQuestionStats[];
  tagsBreakdown: Record<string, { correct: number; total: number }>;
}

export interface ImprovementSuggestion {
  title: string;
  detail: string;
}

export type RuntimeMessage =
  | { type: "PAGE_SUMMARY"; payload: PageSummary }
  | { type: "GET_PAGE_SUMMARY"; url: string }
  | { type: "GENERATE_QUIZ"; payload: PageSummary }
  | { type: "SAVE_ATTEMPT"; payload: QuizAttempt }
  | { type: "GET_HISTORY"; url?: string }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; payload: Partial<Settings> };
