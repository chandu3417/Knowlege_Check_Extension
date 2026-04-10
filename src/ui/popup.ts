import "./styles.css";

import { buildAttempt, buildQuizResult, buildSuggestions } from "../shared/quiz";
import type { HistoryRecord, PageSummary, Quiz, QuizAttempt, RuntimeMessage } from "../types";

interface RuntimeResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function sendMessage<T>(message: RuntimeMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error ?? "Request failed"));
        return;
      }
      resolve(response.data as T);
    });
  });
}

async function getCurrentTab(): Promise<{ id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.id === undefined) {
    throw new Error("No active tab URL found.");
  }
  return { id: tab.id, url: tab.url };
}

async function collectPageSummaryFromTab(tabId: number): Promise<PageSummary | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "COLLECT_PAGE_SUMMARY" },
      (response: PageSummary | null | undefined) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      },
    );
  });
}

function renderLoading(app: HTMLElement, message: string): void {
  app.innerHTML = `<div class="shell"><div class="card"><p>${message}</p></div></div>`;
}

function renderError(app: HTMLElement, message: string): void {
  app.innerHTML = `<div class="shell"><div class="card"><p class="error">${message}</p></div></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHome(
  app: HTMLElement,
  summary: PageSummary,
  history: HistoryRecord | null,
  onGenerate: () => void,
): void {
  const lastAttempt = history?.attempts[0];
  const suggestions = buildSuggestions(history?.attempts ?? []);

  app.innerHTML = `
    <div class="shell">
      <div class="card">
        <h2>Knowledge Check</h2>
        <p class="muted">${escapeHtml(summary.title)}</p>
        <div class="badgeRow">
          <span class="badge">Level: ${summary.detectedLevel}</span>
          <span class="badge">Learning score: ${Math.round(summary.learningScore * 100)}%</span>
          <span class="badge">${summary.suggested ? "Suggested for quiz" : "Manual generation"}</span>
        </div>
      </div>

      <div class="card">
        <h3>Start a quiz</h3>
        <p class="muted">Generate MCQs from this page and test your understanding.</p>
        <div class="actions">
          <button id="generateQuiz">Generate quiz</button>
          <button id="openOptions" class="secondary">Settings</button>
        </div>
      </div>

      <div class="card">
        <h3>Recent performance</h3>
        ${
          lastAttempt
            ? `<div class="stats">
                <span class="badge">Score: ${lastAttempt.score}</span>
                <span class="badge">Accuracy: ${Math.round(lastAttempt.accuracy * 100)}%</span>
                <span class="badge">Time: ${lastAttempt.timeTakenSec}s</span>
              </div>`
            : '<p class="muted">No quiz attempts yet for this page.</p>'
        }
      </div>

      <div class="card">
        <h3>Suggestions</h3>
        ${suggestions
          .map(
            (suggestion) => `
              <div class="suggestion">
                <strong>${escapeHtml(suggestion.title)}</strong>
                <p class="muted">${escapeHtml(suggestion.detail)}</p>
              </div>`,
          )
          .join("")}
      </div>

      ${
        history?.attempts.length
          ? `<div class="card">
              <h3>History</h3>
              ${history.attempts
                .slice(0, 5)
                .map(
                  (attempt) => `
                    <div class="historyItem">
                      <strong>${new Date(attempt.createdAt).toLocaleString()}</strong>
                      <p class="muted">Score ${attempt.score}/${attempt.perQuestionStats.length} • Accuracy ${Math.round(attempt.accuracy * 100)}% • ${attempt.level}</p>
                    </div>`,
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;

  document.getElementById("generateQuiz")?.addEventListener("click", onGenerate);
  document.getElementById("openOptions")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

function renderQuiz(app: HTMLElement, quiz: Quiz, summary: PageSummary): Promise<Record<string, string[]>> {
  return new Promise((resolve) => {
    app.innerHTML = `
      <div class="shell">
        <div class="card">
          <h2>${escapeHtml(quiz.title)}</h2>
          <div class="badgeRow">
            <span class="badge">${quiz.level}</span>
            <span class="badge">${quiz.questions.length} questions</span>
            <span class="badge">${summary.suggested ? "Auto-suggested page" : "Manual page"}</span>
          </div>
        </div>
        <form id="quizForm" class="card">
          ${quiz.questions
            .map((question, index) => {
              const type = question.correctOptionIds.length > 1 ? "checkbox" : "radio";
              return `
                <div class="question">
                  <h3>Q${index + 1}. ${escapeHtml(question.prompt)}</h3>
                  <p class="muted">${type === "checkbox" ? "Select all that apply" : "Select one answer"}</p>
                  ${question.options
                    .map(
                      (option) => `
                        <label class="option">
                          <input type="${type}" name="${question.id}" value="${option.id}" />
                          <span>${escapeHtml(option.text)}</span>
                        </label>`,
                    )
                    .join("")}
                </div>`;
            })
            .join("")}
          <div class="actions">
            <button type="submit">Submit answers</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById("quizForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const answers: Record<string, string[]> = {};
      quiz.questions.forEach((question) => {
        const selector = `input[name="${question.id}"]:checked`;
        const selected = Array.from(document.querySelectorAll<HTMLInputElement>(selector)).map(
          (input) => input.value,
        );
        answers[question.id] = selected;
      });
      resolve(answers);
    });
  });
}

async function renderResults(
  app: HTMLElement,
  quiz: Quiz,
  attempt: QuizAttempt,
  answers: Record<string, string[]>,
  history: HistoryRecord,
): Promise<void> {
  const suggestions = buildSuggestions(history.attempts);

  app.innerHTML = `
    <div class="shell">
      <div class="card">
        <h2>Results</h2>
        <div class="stats">
          <span class="badge">Score: ${attempt.score}/${quiz.questions.length}</span>
          <span class="badge">Accuracy: ${Math.round(attempt.accuracy * 100)}%</span>
          <span class="badge">Level: ${attempt.level}</span>
          <span class="badge">Time: ${attempt.timeTakenSec}s</span>
        </div>
      </div>

      <div class="card">
        <h3>Question review</h3>
        ${quiz.questions
          .map((question, index) => {
            const stats = attempt.perQuestionStats.find((item) => item.questionId === question.id);
            const selected = new Set(answers[question.id] ?? []);
            return `
              <div class="question">
                <h3>Q${index + 1}. ${escapeHtml(question.prompt)}</h3>
                ${question.options
                  .map((option) => {
                    const isCorrect = question.correctOptionIds.includes(option.id);
                    const isSelected = selected.has(option.id);
                    const className = isCorrect ? "option correct" : isSelected ? "option incorrect" : "option";
                    return `
                      <div class="${className}">
                        <span>${isSelected ? "Selected" : ""} ${isCorrect ? "Correct" : ""}</span>
                        <span>${escapeHtml(option.text)}</span>
                      </div>`;
                  })
                  .join("")}
                <p class="${stats?.isCorrect ? "success" : "warning"}">${stats?.isCorrect ? "Correct answer." : "Needs review."}</p>
                <p class="muted">${escapeHtml(question.explanation)}</p>
              </div>`;
          })
          .join("")}
      </div>

      <div class="card">
        <h3>How to improve</h3>
        ${suggestions
          .map(
            (suggestion) => `
              <div class="suggestion">
                <strong>${escapeHtml(suggestion.title)}</strong>
                <p class="muted">${escapeHtml(suggestion.detail)}</p>
              </div>`,
          )
          .join("")}
      </div>

      <div class="card">
        <button id="restartQuiz">Back to page summary</button>
      </div>
    </div>
  `;

  document.getElementById("restartQuiz")?.addEventListener("click", () => {
    void initializePopup();
  });
}

async function initializePopup(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) {
    return;
  }

  renderLoading(app, "Loading page summary...");

  try {
    const tab = await getCurrentTab();
    const cachedSummary = await sendMessage<PageSummary | null>({
      type: "GET_PAGE_SUMMARY",
      url: tab.url,
    });
    let summary = cachedSummary;
    if (!summary || summary.extractedText.length < 180) {
      const freshSummary = await collectPageSummaryFromTab(tab.id);
      if (freshSummary) {
        summary = freshSummary;
        await sendMessage<void>({ type: "PAGE_SUMMARY", payload: freshSummary });
      }
    }

    if (!summary || summary.extractedText.length < 180) {
      renderError(app, "This page does not contain enough readable learning content yet. Wait a moment for the page to finish loading, then reopen the popup.");
      return;
    }

    const history = await sendMessage<HistoryRecord | null>({ type: "GET_HISTORY", url: tab.url });
    renderHome(app, summary, history, async () => {
      try {
        renderLoading(app, "Generating quiz from page content...");
        const startedAt = Date.now();
        const quiz = await sendMessage<Quiz>({ type: "GENERATE_QUIZ", payload: summary });
        const answers = await renderQuiz(app, quiz, summary);
        const timeTakenSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const result = buildQuizResult(quiz, answers, timeTakenSec);
        const attempt = buildAttempt(quiz, result);
        const updatedHistory = await sendMessage<HistoryRecord>({
          type: "SAVE_ATTEMPT",
          payload: attempt,
        });
        await renderResults(app, quiz, attempt, answers, updatedHistory);
      } catch (error) {
        renderError(app, error instanceof Error ? error.message : "Failed to generate quiz.");
      }
    });
  } catch (error) {
    renderError(app, error instanceof Error ? error.message : "Unable to load the popup.");
  }
}

void initializePopup();
