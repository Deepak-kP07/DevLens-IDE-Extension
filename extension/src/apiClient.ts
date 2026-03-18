import * as vscode from "vscode";
import { ErrorPayload, PersistedError } from "./types";

const DEFAULT_BACKEND_URL = "http://localhost:3001";

function getBackendBaseUrl(): string {
  const cfg = vscode.workspace.getConfiguration("devlens");
  return cfg.get<string>("backendUrl", DEFAULT_BACKEND_URL);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function sendErrorToBackend(
  context: vscode.ExtensionContext,
  payload: ErrorPayload,
): Promise<PersistedError> {
  const apiKey = await context.secrets.get("devlens.geminiApiKey");
  const response = await fetch(`${getBackendBaseUrl()}/api/error`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gemini-api-key": apiKey ?? "",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  return (await response.json()) as PersistedError;
}

export async function fetchErrorHistory(): Promise<PersistedError[]> {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/errors?limit=20`);
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as PersistedError[];
  } catch (error) {
    console.warn(`Failed to fetch DevLens history: ${toErrorMessage(error)}`);
    return [];
  }
}

export async function isBackendHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/health`);
    return response.ok;
  } catch (_error) {
    return false;
  }
}
