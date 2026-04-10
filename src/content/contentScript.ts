import type { PageSummary, QuizLevel, RuntimeMessage } from "../types";
import { getLevelFromContentLength } from "../shared/quiz";

type ContentScriptMessage = { type: "COLLECT_PAGE_SUMMARY" };

const BOILERPLATE_PATTERNS = [
  /cookie/i,
  /privacy policy/i,
  /terms of use/i,
  /all rights reserved/i,
  /follow us/i,
  /subscribe/i,
  /sign in/i,
  /log in/i,
  /advertisement/i,
  /\bads?\b/i,
  /sponsored/i,
  /author/i,
  /published/i,
  /last updated/i,
  /share this/i,
  /read more/i,
];

function isLikelyBoilerplate(text: string): boolean {
  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text));
}

function getNodeTextLength(node: Element): number {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

function pickBestContentRoot(): Element {
  const selectors = [
    "article",
    "main",
    "[role='main']",
    ".article-content",
    ".post-content",
    ".entry-content",
    ".content",
    "#content",
    "section",
  ];
  const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  const best = candidates.sort((a, b) => getNodeTextLength(b) - getNodeTextLength(a))[0];
  return best ?? document.body;
}

function getVisibleText(): string {
  const source = pickBestContentRoot();

  const blocks = Array.from(source.querySelectorAll("h1, h2, h3, h4, p, li, td, th, blockquote, figcaption"))
    .map((node) => node.textContent?.trim() ?? "")
    .filter((text) => text.length > 20 && !isLikelyBoilerplate(text));

  const combined = blocks.join("\n").replace(/\s+/g, " ").trim();
  if (combined.length >= 250) {
    return combined;
  }

  // Fallback for pages that do not use semantic article/main wrappers.
  return (document.body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 12000);
}

function getLearningScore(text: string, headings: string[]): number {
  const lengthScore = Math.min(text.length / 4000, 1);
  const headingScore = Math.min(headings.length / 8, 1);
  const sentenceScore = Math.min((text.split(/[.!?]/).length - 1) / 40, 1);
  return Number(((lengthScore * 0.45) + (headingScore * 0.3) + (sentenceScore * 0.25)).toFixed(2));
}

async function buildHash(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function collectPageSummary(): Promise<PageSummary> {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean)
    .slice(0, 12);
  const extractedText = getVisibleText();
  const detectedLevel: QuizLevel = getLevelFromContentLength(extractedText.length);
  const learningScore = getLearningScore(extractedText, headings);
  const suggested = learningScore >= 0.42 && extractedText.length >= 500;

  return {
    url: location.href,
    origin: location.origin,
    title: document.title || "Untitled page",
    extractedText,
    headings,
    detectedLevel,
    learningScore,
    suggested,
    contentHash: await buildHash(`${location.href}:${extractedText.slice(0, 2000)}`),
  };
}

async function sendSummary(): Promise<void> {
  const summary = await collectPageSummary();
  const message: RuntimeMessage = { type: "PAGE_SUMMARY", payload: summary };
  await chrome.runtime.sendMessage(message);
}

chrome.runtime.onMessage.addListener(
  (message: ContentScriptMessage, _, sendResponse: (response: PageSummary | null) => void) => {
    if (message.type !== "COLLECT_PAGE_SUMMARY") {
      return false;
    }
    void collectPageSummary()
      .then((summary) => {
        sendResponse(summary);
      })
      .catch(() => {
        sendResponse(null);
      });
    return true;
  },
);

function scheduleSummarySends(): void {
  void sendSummary();
  setTimeout(() => {
    void sendSummary();
  }, 1200);
  setTimeout(() => {
    void sendSummary();
  }, 3000);
}

if (document.readyState === "complete") {
  scheduleSummarySends();
} else {
  window.addEventListener("load", scheduleSummarySends, { once: true });
}
