import "./styles.css";

import { DEFAULT_SETTINGS } from "../shared/storage";
import type { RuntimeMessage, Settings } from "../types";

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

function renderForm(settings: Settings): string {
  return `
    <div class="shell options">
      <div class="card">
        <h1>Quiz Extension Settings</h1>
        <p class="muted">Add your model credentials and control how quizzes are generated.</p>
      </div>
      <form id="settingsForm" class="card">
        <label for="apiKey">API key</label>
        <input id="apiKey" name="apiKey" type="password" value="${settings.apiKey}" placeholder="gsk_..." />

        <label for="model">Model</label>
        <input id="model" name="model" value="${settings.model}" placeholder="llama-3.3-70b-versatile" />

        <label for="numQuestions">Questions per quiz</label>
        <select id="numQuestions" name="numQuestions">
          ${[5, 7, 10]
            .map(
              (value) =>
                `<option value="${value}" ${value === settings.numQuestions ? "selected" : ""}>${value}</option>`,
            )
            .join("")}
        </select>

        <label for="difficultyPreference">Difficulty preference</label>
        <select id="difficultyPreference" name="difficultyPreference">
          ${["auto", "beginner", "intermediate", "advanced"]
            .map(
              (value) =>
                `<option value="${value}" ${value === settings.difficultyPreference ? "selected" : ""}>${value}</option>`,
            )
            .join("")}
        </select>

        <label for="privacyMode">Privacy mode</label>
        <select id="privacyMode" name="privacyMode">
          <option value="false" ${!settings.privacyMode ? "selected" : ""}>Off</option>
          <option value="true" ${settings.privacyMode ? "selected" : ""}>On</option>
        </select>

        <label for="autosuggestEnabled">Auto-suggest quiz on learning pages</label>
        <select id="autosuggestEnabled" name="autosuggestEnabled">
          <option value="true" ${settings.autosuggestEnabled ? "selected" : ""}>Enabled</option>
          <option value="false" ${!settings.autosuggestEnabled ? "selected" : ""}>Disabled</option>
        </select>

        <div class="actions">
          <button type="submit">Save settings</button>
        </div>
        <p id="saveStatus" class="muted"></p>
      </form>
    </div>
  `;
}

async function initializeOptions(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) {
    return;
  }

  const settings = await sendMessage<Settings>({ type: "GET_SETTINGS" }).catch(() => DEFAULT_SETTINGS);
  app.innerHTML = renderForm(settings);

  document.getElementById("settingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    const payload: Partial<Settings> = {
      apiKey: String(formData.get("apiKey") ?? ""),
      model: String(formData.get("model") ?? DEFAULT_SETTINGS.model),
      numQuestions: Number(formData.get("numQuestions") ?? DEFAULT_SETTINGS.numQuestions),
      difficultyPreference: String(formData.get("difficultyPreference") ?? "auto") as Settings["difficultyPreference"],
      privacyMode: String(formData.get("privacyMode")) === "true",
      autosuggestEnabled: String(formData.get("autosuggestEnabled")) === "true",
    };

    const status = document.getElementById("saveStatus");
    try {
      await sendMessage<Settings>({ type: "SAVE_SETTINGS", payload });
      if (status) {
        status.textContent = "Settings saved successfully.";
        status.className = "success";
      }
    } catch (error) {
      if (status) {
        status.textContent = error instanceof Error ? error.message : "Failed to save settings.";
        status.className = "error";
      }
    }
  });
}

void initializeOptions();
