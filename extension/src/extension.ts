import * as vscode from "vscode";
import { fetchErrorHistory, isBackendHealthy, sendErrorToBackend } from "./apiClient";
import { checkApiKey, hasApiKey, resetApiKey, updateApiKey } from "./secrets";
import { registerSidebar } from "./sidebarProvider";
import { startBrowserProxy } from "./proxyMiddleware";
import { startTerminalCapture, TerminalCaptureHandle } from "./terminalCapture";
import { BrowserProxyHandle } from "./proxyMiddleware";
import { ErrorPayload } from "./types";
import { ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { DiagnosticCaptureHandle, startDiagnosticCapture } from "./diagnosticCapture";

let terminalCapture: TerminalCaptureHandle | undefined;
let browserProxy: BrowserProxyHandle | undefined;
let browserTargetUrl: string | undefined;
let hasDetectedDevServer = false;
let browserPanel: vscode.WebviewPanel | undefined;
let backendProcess: ChildProcess | undefined;
let diagnosticCapture: DiagnosticCaptureHandle | undefined;

function getEmbeddedBrowserHtml(url: string): string {
  const nonce = `${Date.now()}`;
  const safeUrl = JSON.stringify(url);
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; connect-src http: https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DevLens Browser</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #111; color: #ddd; font-family: var(--vscode-font-family); }
      .bar { padding: 6px 10px; font-size: 12px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); display: flex; justify-content: space-between; gap: 8px; }
      iframe { width: 100%; height: calc(100% - 34px); border: 0; display: block; }
      a { color: var(--vscode-textLink-foreground); }
      .status-ok { color: #4caf50; }
      .status-warn { color: #ffb74d; }
    </style>
  </head>
  <body>
    <div class="bar">
      <div>DevLens Proxy: <a href="${url}">${url}</a></div>
      <div id="status" class="status-ok">Auto-restart: connected</div>
    </div>
    <iframe id="app-frame" src="${url}" allow="clipboard-read; clipboard-write"></iframe>
    <script nonce="${nonce}">
      const proxyUrl = ${safeUrl};
      const frame = document.getElementById("app-frame");
      const status = document.getElementById("status");
      let lastHealthy = true;

      function setStatus(healthy) {
        if (healthy) {
          status.textContent = "Auto-restart: connected";
          status.className = "status-ok";
        } else {
          status.textContent = "Auto-restart: waiting for dev server...";
          status.className = "status-warn";
        }
      }

      async function checkProxy() {
        try {
          const response = await fetch(proxyUrl, { method: "GET", cache: "no-store" });
          const healthy = response.ok;
          setStatus(healthy);
          if (healthy && !lastHealthy) {
            frame.src = proxyUrl + (proxyUrl.includes("?") ? "&" : "?") + "r=" + Date.now();
          }
          lastHealthy = healthy;
        } catch (_error) {
          setStatus(false);
          lastHealthy = false;
        }
      }

      setInterval(checkProxy, 2000);
      checkProxy();
    </script>
  </body>
  </html>`;
}

async function openInBrowserTab(
  context: vscode.ExtensionContext,
  url: string,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const commands = await vscode.commands.getCommands(true);

  if (commands.includes("simpleBrowser.show")) {
    await vscode.commands.executeCommand("simpleBrowser.show", url);
    outputChannel.appendLine(`[DevLens] Browser Tab opened via simpleBrowser.show: ${url}`);
    return;
  }

  if (!browserPanel) {
    browserPanel = vscode.window.createWebviewPanel(
      "devlens.browser",
      "DevLens Browser",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    context.subscriptions.push(browserPanel);
    browserPanel.onDidDispose(() => {
      browserPanel = undefined;
    });
  }
  browserPanel.webview.html = getEmbeddedBrowserHtml(url);
  browserPanel.reveal(vscode.ViewColumn.Beside);
  outputChannel.appendLine(`[DevLens] Browser Tab opened via embedded webview: ${url}`);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("DevLens");
  outputChannel.appendLine("[DevLens] Activating extension...");
  const cfg = vscode.workspace.getConfiguration("devlens");
  const autoOpenBrowserTab = cfg.get<boolean>("autoOpenBrowserTab", true);

  const sidebar = registerSidebar(context);
  sidebar.setStatus("There are no errors.");

  const ensureBackend = async (): Promise<void> => {
    const healthy = await isBackendHealthy();
    if (healthy) {
      outputChannel.appendLine("[DevLens] Backend health check: OK");
      return;
    }

    const backendDir = path.resolve(context.extensionPath, "..", "backend");
    outputChannel.appendLine(`[DevLens] Backend not reachable. Attempting auto-start from ${backendDir}`);
    backendProcess = spawn("npm", ["run", "dev"], {
      cwd: backendDir,
      shell: true,
    });
    backendProcess.stdout?.on("data", (chunk) => {
      outputChannel.appendLine(`[backend] ${chunk.toString().trimEnd()}`);
    });
    backendProcess.stderr?.on("data", (chunk) => {
      outputChannel.appendLine(`[backend:stderr] ${chunk.toString().trimEnd()}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 2200));
    const afterStart = await isBackendHealthy();
    if (!afterStart) {
      sidebar.setStatus("Backend is not running. Start it with npm run dev:backend");
      outputChannel.appendLine("[DevLens] Backend health check failed after auto-start attempt.");
      void vscode.window.showWarningMessage(
        "DevLens backend is not reachable. Start backend with: npm run dev:backend",
      );
    } else {
      outputChannel.appendLine("[DevLens] Backend auto-start successful.");
    }
  };

  const restartBrowserProxy = async (): Promise<void> => {
    try {
      if (browserProxy) {
        await browserProxy.dispose();
      }
      browserProxy = await startBrowserProxy(
        outputChannel,
        (payload) => {
          void handleCapturedError(payload);
        },
        browserTargetUrl,
      );
      outputChannel.appendLine(`[DevLens] Open browser app through: ${browserProxy.url}`);
      if (autoOpenBrowserTab && hasDetectedDevServer) {
        try {
          await openInBrowserTab(context, browserProxy.url, outputChannel);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          outputChannel.appendLine(`[DevLens] Auto-open Browser Tab failed: ${message}`);
          const action = await vscode.window.showInformationMessage(
            "DevLens could not auto-open Browser Tab.",
            "Open Proxy URL",
          );
          if (action === "Open Proxy URL") {
            await vscode.env.openExternal(vscode.Uri.parse(browserProxy.url));
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`[DevLens] Browser proxy failed: ${message}`);
    }
  };

  const handleCapturedError = async (payload: ErrorPayload): Promise<void> => {
    try {
      sidebar.setLoading(true);
      sidebar.setStatus("Analyzing latest error...");
      const analyzed = await sendErrorToBackend(context, payload);
      sidebar.setActiveError(analyzed);
      const history = await fetchErrorHistory();
      sidebar.setHistory(history);
      sidebar.setStatus("Latest analyzed error");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`[DevLens] Failed to analyze error: ${message}`);
      sidebar.setStatus(`Could not analyze error: ${message}`);
      void vscode.window.showErrorMessage(`DevLens: ${message}`);
    } finally {
      sidebar.setLoading(false);
    }
  };

  await ensureBackend();
  await checkApiKey(context);
  const keyExists = await hasApiKey(context);
  outputChannel.appendLine(`[DevLens] Gemini API key present: ${keyExists ? "yes" : "no"}`);

  context.subscriptions.push(
    vscode.commands.registerCommand("devlens.updateApiKey", async () => {
      await updateApiKey(context);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("devlens.resetApiKey", async () => {
      await resetApiKey(context);
      await checkApiKey(context);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("devlens.sendTestError", async () => {
      outputChannel.appendLine("[DevLens] Sending test error...");
      await handleCapturedError({
        source: "terminal",
        message: "TypeError: DevLens test error",
        file: "/tmp/devlens-test.ts",
        line: 1,
        codeContext: "const result = undefined.call();",
        timestamp: new Date().toISOString(),
      });
    }),
  );

  terminalCapture = startTerminalCapture(
    outputChannel,
    (payload) => {
      outputChannel.appendLine(`[DevLens] Processing ${payload.source} error...`);
      void handleCapturedError(payload);
    },
    (url) => {
      if (browserTargetUrl === url) {
        return;
      }
      hasDetectedDevServer = true;
      browserTargetUrl = url;
      outputChannel.appendLine(`[DevLens] Detected dev server URL: ${url}`);
      void restartBrowserProxy();
    },
  );
  diagnosticCapture = startDiagnosticCapture(outputChannel, (payload) => {
    outputChannel.appendLine(`[DevLens] Processing ${payload.source} error from diagnostics...`);
    void handleCapturedError(payload);
  });

  outputChannel.appendLine(
    "[DevLens] Waiting for dev-server URL detection before auto-opening Browser Tab.",
  );
  await restartBrowserProxy();

  const history = await fetchErrorHistory();
  sidebar.setHistory(history);
}

export function deactivate(): void {
  terminalCapture?.dispose();
  terminalCapture = undefined;
  if (browserProxy) {
    void browserProxy.dispose();
    browserProxy = undefined;
  }
  diagnosticCapture?.dispose();
  diagnosticCapture = undefined;
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = undefined;
  }
}
