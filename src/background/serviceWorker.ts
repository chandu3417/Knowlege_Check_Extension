import {
  buildQuizPrompt,
  parseQuizResponse,
  sanitizePageText,
} from "../shared/quiz";
import {
  getPageSummary,
  getStorageState,
  saveAttempt,
  savePageSummary,
  saveSettings,
} from "../shared/storage";
import type { PageSummary, Quiz, RuntimeMessage, Settings } from "../types";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

async function generateQuiz(summary: PageSummary): Promise<Quiz> {
  const state = await getStorageState();
  const { settings, cache } = state;
  const cached = cache[summary.contentHash];
  if (cached) {
    return cached.quiz;
  }

  if (!settings.apiKey) {
    throw new Error("Missing API key. Add one in the extension settings.");
  }

  const sanitizedSummary: PageSummary = {
    ...summary,
    extractedText: sanitizePageText(summary, settings.privacyMode),
    url: settings.privacyMode ? "about:blank" : summary.url,
    origin: settings.privacyMode ? "redacted" : summary.origin,
  };

  const preferredLevel =
    settings.difficultyPreference === "auto"
      ? sanitizedSummary.detectedLevel
      : settings.difficultyPreference;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You create structured multiple-choice quizzes from webpage content. Return valid JSON only.",
        },
        {
          role: "user",
          content: buildQuizPrompt(sanitizedSummary, settings.numQuestions, preferredLevel),
        },
      ],
    }),
  });

  const data = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `Quiz generation failed with status ${response.status}.`,
    );
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("The model returned an empty quiz response.");
  }

  let quiz = parseQuizResponse(content, sanitizedSummary);

  if (quiz.questions.length < settings.numQuestions) {
    throw new Error("The generated quiz did not include enough questions.");
  }

  quiz = {
    ...quiz,
    questions: quiz.questions.slice(0, settings.numQuestions),
    sourceUrl: summary.url,
    title: summary.title,
  };

  await chrome.storage.local.set({
    cache: {
      ...cache,
      [summary.contentHash]: {
        quiz,
        createdAt: new Date().toISOString(),
      },
    },
  });

  return quiz;
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _, sendResponse) => {
  void (async () => {
    try {
      switch (message.type) {
        case "PAGE_SUMMARY": {
          const state = await getStorageState();
          await savePageSummary({
            ...message.payload,
            suggested:
              state.settings.autosuggestEnabled &&
              !state.settings.privacyMode &&
              message.payload.suggested,
          });
          sendResponse({ ok: true });
          return;
        }
        case "GET_PAGE_SUMMARY": {
          const summary = await getPageSummary(message.url);
          sendResponse({ ok: true, data: summary });
          return;
        }
        case "GENERATE_QUIZ": {
          const quiz = await generateQuiz(message.payload);
          sendResponse({ ok: true, data: quiz });
          return;
        }
        case "SAVE_ATTEMPT": {
          const record = await saveAttempt(message.payload);
          sendResponse({ ok: true, data: record });
          return;
        }
        case "GET_HISTORY": {
          const state = await getStorageState();
          const history = message.url ? state.history[message.url] ?? null : state.history;
          sendResponse({ ok: true, data: history });
          return;
        }
        case "GET_SETTINGS": {
          const state = await getStorageState();
          sendResponse({ ok: true, data: state.settings });
          return;
        }
        case "SAVE_SETTINGS": {
          const settings = await saveSettings(message.payload as Partial<Settings>);
          sendResponse({ ok: true, data: settings });
          return;
        }
        default:
          sendResponse({ ok: false, error: "Unsupported message type." });
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })();

  return true;
});
