import type {
  ImprovementSuggestion,
  PageSummary,
  PerQuestionStats,
  Quiz,
  QuizAttempt,
  QuizLevel,
  QuizQuestion,
  QuizResult,
} from "../types";

export function sanitizePageText(summary: PageSummary, privacyMode: boolean): string {
  const cleaned = summary.extractedText
    .split(/[.\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter(
      (part) =>
        !/cookie|privacy policy|terms of use|all rights reserved|subscribe|sign in|log in|advertisement|\bads?\b|sponsored|follow us|author|published by|publisher|share this/i.test(
          part,
        ),
    )
    .join(". ");

  const baseText = privacyMode
    ? cleaned
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .slice(0, 6000)
    : cleaned.slice(0, 10000);
  return baseText.trim();
}

export function getLevelFromContentLength(length: number): QuizLevel {
  if (length < 1600) {
    return "beginner";
  }
  if (length < 4500) {
    return "intermediate";
  }
  return "advanced";
}

function isQuizLevel(value: unknown): value is QuizLevel {
  return value === "beginner" || value === "intermediate" || value === "advanced";
}

function isDifficulty(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === "number" && value >= 1 && value <= 5;
}

function isQuestion(question: unknown): question is QuizQuestion {
  if (!question || typeof question !== "object") {
    return false;
  }

  const item = question as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.prompt === "string" &&
    Array.isArray(item.options) &&
    item.options.length >= 2 &&
    item.options.every(
      (option) =>
        option &&
        typeof option === "object" &&
        typeof (option as Record<string, unknown>).id === "string" &&
        typeof (option as Record<string, unknown>).text === "string",
    ) &&
    Array.isArray(item.correctOptionIds) &&
    item.correctOptionIds.length >= 1 &&
    item.correctOptionIds.every((id) => typeof id === "string") &&
    typeof item.explanation === "string" &&
    isDifficulty(item.difficulty) &&
    Array.isArray(item.tags) &&
    item.tags.every((tag) => typeof tag === "string")
  );
}

export function validateQuiz(raw: unknown, summary: PageSummary): Quiz {
  if (!raw || typeof raw !== "object") {
    throw new Error("Quiz payload is not an object.");
  }

  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    throw new Error("Quiz must contain questions.");
  }

  const questions = value.questions.filter(isQuestion);
  if (questions.length !== value.questions.length) {
    throw new Error("Quiz contains malformed questions.");
  }

  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : summary.url,
    title: typeof value.title === "string" ? value.title : summary.title,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    level: isQuizLevel(value.level) ? value.level : summary.detectedLevel,
    questions,
  };
}

export function parseQuizResponse(responseText: string, summary: PageSummary): Quiz {
  const fencedMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const rawJson = fencedMatch ? fencedMatch[1] : responseText;
  return validateQuiz(JSON.parse(rawJson), summary);
}

export function buildQuizPrompt(summary: PageSummary, numQuestions: number, preferredLevel: string): string {
  return [
    "You generate strict JSON only.",
    "Create an MCQ knowledge-check quiz from the webpage content below.",
    `Return exactly ${numQuestions} questions.`,
    "Include both single-answer and multi-answer questions when appropriate.",
    "Each question must have 4 options whenever possible.",
    `Use the requested quiz level: ${preferredLevel}.`,
    "Focus only on the main technical/academic concepts from the content.",
    "Do not ask about page metadata or website details.",
    "Never create questions about author names, publisher/site name, publication date, navigation, popups, ads, or subscription prompts.",
    "Questions should test understanding of definitions, mechanisms, comparisons, examples, edge cases, and applications.",
    "If content is mixed, prioritize the dominant topic and ignore unrelated snippets.",
    "JSON shape:",
    JSON.stringify(
      {
        id: "string",
        sourceUrl: summary.url,
        title: summary.title,
        createdAt: new Date().toISOString(),
        level: summary.detectedLevel,
        questions: [
          {
            id: "q1",
            prompt: "string",
            options: [
              { id: "a", text: "string" },
              { id: "b", text: "string" },
            ],
            correctOptionIds: ["a"],
            explanation: "string",
            difficulty: 2,
            tags: ["concept"],
          },
        ],
      },
      null,
      2,
    ),
    "Webpage content:",
    summary.extractedText,
  ].join("\n\n");
}

export function scoreQuestion(question: QuizQuestion, selectedOptionIds: string[]): PerQuestionStats {
  const selected = new Set(selectedOptionIds);
  const correct = new Set(question.correctOptionIds);
  const intersection = question.correctOptionIds.filter((id) => selected.has(id)).length;
  const precision = selected.size === 0 ? 0 : intersection / selected.size;
  const recall = correct.size === 0 ? 0 : intersection / correct.size;
  const isCorrect =
    selected.size === correct.size &&
    question.correctOptionIds.every((id) => selected.has(id));

  return {
    questionId: question.id,
    selectedOptionIds,
    correctOptionIds: question.correctOptionIds,
    isCorrect,
    precision,
    recall,
    tags: question.tags,
  };
}

export function buildQuizResult(
  quiz: Quiz,
  answers: Record<string, string[]>,
  timeTakenSec: number,
): QuizResult {
  const perQuestionStats = quiz.questions.map((question) =>
    scoreQuestion(question, answers[question.id] ?? []),
  );
  const score = perQuestionStats.filter((item) => item.isCorrect).length;
  const tagsBreakdown: QuizResult["tagsBreakdown"] = {};

  perQuestionStats.forEach((item) => {
    item.tags.forEach((tag) => {
      const current = tagsBreakdown[tag] ?? { correct: 0, total: 0 };
      current.total += 1;
      if (item.isCorrect) {
        current.correct += 1;
      }
      tagsBreakdown[tag] = current;
    });
  });

  return {
    score,
    accuracy: quiz.questions.length === 0 ? 0 : score / quiz.questions.length,
    timeTakenSec,
    perQuestionStats,
    tagsBreakdown,
  };
}

export function buildAttempt(quiz: Quiz, result: QuizResult): QuizAttempt {
  return {
    quizId: quiz.id,
    sourceUrl: quiz.sourceUrl,
    title: quiz.title,
    createdAt: new Date().toISOString(),
    score: result.score,
    accuracy: result.accuracy,
    level: quiz.level,
    timeTakenSec: result.timeTakenSec,
    perQuestionStats: result.perQuestionStats,
    tagsBreakdown: result.tagsBreakdown,
  };
}

export function buildSuggestions(attempts: QuizAttempt[]): ImprovementSuggestion[] {
  if (attempts.length === 0) {
    return [
      {
        title: "Start with one quiz",
        detail: "Complete your first quiz on a content-heavy page to unlock trend-based suggestions.",
      },
    ];
  }

  const recent = attempts.slice(0, 5);
  const tagPerformance = new Map<string, { correct: number; total: number }>();
  let lowPrecisionCount = 0;
  let lowRecallCount = 0;

  recent.forEach((attempt) => {
    attempt.perQuestionStats.forEach((item) => {
      if (item.precision < 1) {
        lowPrecisionCount += 1;
      }
      if (item.recall < 1) {
        lowRecallCount += 1;
      }
    });

    Object.entries(attempt.tagsBreakdown).forEach(([tag, stats]) => {
      const current = tagPerformance.get(tag) ?? { correct: 0, total: 0 };
      current.correct += stats.correct;
      current.total += stats.total;
      tagPerformance.set(tag, current);
    });
  });

  const weakestTags = [...tagPerformance.entries()]
    .map(([tag, stats]) => ({ tag, accuracy: stats.total === 0 ? 0 : stats.correct / stats.total }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 2)
    .map((item) => item.tag);

  const suggestions: ImprovementSuggestion[] = [];

  if (weakestTags.length > 0) {
    suggestions.push({
      title: "Review your weakest topics",
      detail: `Focus on ${weakestTags.join(" and ")} before attempting another quiz.`,
    });
  }

  if (lowRecallCount > lowPrecisionCount) {
    suggestions.push({
      title: "Look for missing correct options",
      detail: "Your answers suggest you may be under-selecting on multi-answer questions. Double-check whether more than one option applies.",
    });
  } else if (lowPrecisionCount > 0) {
    suggestions.push({
      title: "Be more selective",
      detail: "You often choose extra options on multi-answer questions. Eliminate weak choices before submitting.",
    });
  }

  const trend =
    recent.reduce((sum, attempt) => sum + attempt.accuracy, 0) / recent.length;
  suggestions.push({
    title: "Target accuracy goal",
    detail: `Your recent average accuracy is ${Math.round(trend * 100)}%. Aim for 80%+ on the next two quizzes.`,
  });

  return suggestions;
}
