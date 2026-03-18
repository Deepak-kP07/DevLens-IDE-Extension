import * as vscode from "vscode";

const SECRET_KEY = "devlens.geminiApiKey";

export async function hasApiKey(context: vscode.ExtensionContext): Promise<boolean> {
  const existing = await context.secrets.get(SECRET_KEY);
  return Boolean(existing);
}

export async function checkApiKey(context: vscode.ExtensionContext): Promise<void> {
  const existing = await context.secrets.get(SECRET_KEY);
  if (existing) {
    return;
  }

  const entered = await vscode.window.showInputBox({
    prompt: "Enter your Gemini API key for DevLens",
    ignoreFocusOut: true,
    password: true,
    placeHolder: "AIza...",
    validateInput: (value) => (value.trim().length < 20 ? "Enter a valid API key." : undefined),
  });

  if (!entered) {
    void vscode.window.showWarningMessage(
      "DevLens API key is missing. You can add it later from 'DevLens: Update API Key'.",
    );
    return;
  }

  await context.secrets.store(SECRET_KEY, entered.trim());
  void vscode.window.showInformationMessage("DevLens API key saved securely.");
}

export async function updateApiKey(context: vscode.ExtensionContext): Promise<void> {
  const entered = await vscode.window.showInputBox({
    prompt: "Update Gemini API key for DevLens",
    ignoreFocusOut: true,
    password: true,
    placeHolder: "AIza...",
    validateInput: (value) => (value.trim().length < 20 ? "Enter a valid API key." : undefined),
  });

  if (!entered) {
    return;
  }

  await context.secrets.store(SECRET_KEY, entered.trim());
  void vscode.window.showInformationMessage("DevLens API key updated.");
}

export async function resetApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY);
  void vscode.window.showInformationMessage(
    "DevLens API key removed. Run 'DevLens: Update API Key' to set it again.",
  );
}
