import type {
  HistoryRecord,
  PageSummary,
  QuizAttempt,
  Settings,
  StorageState,
} from "../types";

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "llama-3.3-70b-versatile",
  numQuestions: 5,
  difficultyPreference: "auto",
  privacyMode: false,
  autosuggestEnabled: true,
};

const STORAGE_DEFAULTS: StorageState = {
  settings: DEFAULT_SETTINGS,
  history: {},
  cache: {},
};

export async function getStorageState(): Promise<StorageState> {
  const result = await chrome.storage.local.get(["settings", "history", "cache"]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(result.settings ?? {}) },
    history: (result.history as StorageState["history"] | undefined) ?? {},
    cache: (result.cache as StorageState["cache"] | undefined) ?? {},
  };
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getStorageState();
  const next = { ...current.settings, ...partial };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function savePageSummary(summary: PageSummary): Promise<void> {
  await chrome.storage.session.set({
    [`page:${summary.url}`]: summary,
  });
}

export async function getPageSummary(url: string): Promise<PageSummary | null> {
  const result = await chrome.storage.session.get(`page:${url}`);
  return (result[`page:${url}`] as PageSummary | undefined) ?? null;
}

export async function saveAttempt(attempt: QuizAttempt): Promise<HistoryRecord> {
  const state = await getStorageState();
  const currentRecord = state.history[attempt.sourceUrl] ?? {
    sourceUrl: attempt.sourceUrl,
    title: attempt.title,
    attempts: [],
  };

  const nextRecord: HistoryRecord = {
    ...currentRecord,
    title: attempt.title,
    attempts: [attempt, ...currentRecord.attempts].slice(0, 25),
  };

  await chrome.storage.local.set({
    history: {
      ...state.history,
      [attempt.sourceUrl]: nextRecord,
    },
  });

  return nextRecord;
}
