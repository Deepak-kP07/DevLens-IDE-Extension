import * as vscode from "vscode";

const SECRET_KEY = "devlens.geminiApiKey";
/**
 * Mirror storage when `SecretStorage` (OS keychain) fails or does not persist across sessions,
 * which happens in some Cursor / Extension Development Host setups.
 * Less ideal than the keychain but avoids prompting on every launch.
 */
const GLOBAL_MIRROR_KEY = "devlens.geminiApiKey.mirror";

/** Prefer OS secret storage; fall back to extension globalState if empty. */
export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const fromSecret = await context.secrets.get(SECRET_KEY);
  const trimmed = fromSecret?.trim();
  if (trimmed) {
    return trimmed;
  }
  const fromGlobal = context.globalState.get<string>(GLOBAL_MIRROR_KEY);
  return fromGlobal?.trim() || undefined;
}

async function writeApiKey(context: vscode.ExtensionContext, value: string): Promise<void> {
  const v = value.trim();
  await context.globalState.update(GLOBAL_MIRROR_KEY, v);
  try {
    await context.secrets.store(SECRET_KEY, v);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void vscode.window.showWarningMessage(
      `DevLens: could not save API key to OS keychain (${msg}). Using extension storage only.`,
    );
  }
}

async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(GLOBAL_MIRROR_KEY, undefined);
  try {
    await context.secrets.delete(SECRET_KEY);
  } catch {
    /* ignore */
  }
}

export async function hasApiKey(context: vscode.ExtensionContext): Promise<boolean> {
  return Boolean(await getApiKey(context));
}

export async function checkApiKey(context: vscode.ExtensionContext): Promise<void> {
  if (await getApiKey(context)) {
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

  await writeApiKey(context, entered);
  void vscode.window.showInformationMessage("DevLens API key saved.");
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

  await writeApiKey(context, entered);
  void vscode.window.showInformationMessage("DevLens API key updated.");
}

export async function resetApiKey(context: vscode.ExtensionContext): Promise<void> {
  await clearApiKey(context);
  void vscode.window.showInformationMessage(
    "DevLens API key removed. Run 'DevLens: Update API Key' to set it again.",
  );
}
