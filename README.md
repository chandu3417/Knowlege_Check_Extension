# Knowledge Check Extension

A Chrome extension that generates multiple-choice quizzes from educational webpages using Groq models.

## Features

- Extracts readable content from the active page.
- Generates topic-focused MCQs (single and multi-answer).
- Avoids boilerplate-based questions (ads, author/publisher, navigation metadata).
- Tracks attempt history and basic performance trends.
- Supports privacy mode and configurable question count/difficulty.

## Tech Stack

- TypeScript
- Vite
- Chrome Extension Manifest V3
- Groq Chat Completions API (OpenAI-compatible endpoint)

## Project Structure

- `src/content/contentScript.ts`: content extraction and page summary collection.
- `src/background/serviceWorker.ts`: runtime messaging, quiz generation, storage orchestration.
- `src/ui/popup.ts`: quiz flow UI.
- `src/ui/options.ts`: settings page UI.
- `src/shared/quiz.ts`: prompt building, validation, scoring, suggestions.
- `src/shared/storage.ts`: settings/history/cache persistence helpers.

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Build the extension

```bash
npm run build
```

### 3) Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project `dist` output as applicable for your setup

## Configure API

1. Open extension **Options**
2. Add your Groq API key
3. Set model (default: `llama-3.3-70b-versatile`)
4. Save settings

## Development Commands

```bash
npm run typecheck
npm run build
```

## Notes

- API keys are stored in extension storage and should never be hardcoded.
- `.gitignore` is configured to avoid committing local secrets and build artifacts.
