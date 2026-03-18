import * as vscode from "vscode";
import { PersistedError } from "./types";

type SidebarMessage =
  | { type: "setLoading"; value: boolean }
  | { type: "setActiveError"; value: PersistedError | null }
  | { type: "setHistory"; value: PersistedError[] }
  | { type: "setStatus"; value: string };

export class DevLensSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "devlens.sidebar";
  private view?: vscode.WebviewView;
  private activeError: PersistedError | null = null;
  private history: PersistedError[] = [];
  private isLoading = false;
  private status = "There are no errors.";

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    this.post({ type: "setLoading", value: this.isLoading });
    this.post({ type: "setActiveError", value: this.activeError });
    this.post({ type: "setHistory", value: this.history });
    this.post({ type: "setStatus", value: this.status });

    webviewView.webview.onDidReceiveMessage(async (message: { type: string; value?: string }) => {
      if (message.type === "copyFixPrompt" && this.activeError?.fixPrompt) {
        await vscode.env.clipboard.writeText(this.activeError.fixPrompt);
        void vscode.window.showInformationMessage("DevLens fix prompt copied.");
      }

      if (message.type === "openFile" && this.activeError?.file && this.activeError.line) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(this.activeError.file));
        const editor = await vscode.window.showTextDocument(doc);
        const target = new vscode.Position(Math.max(this.activeError.line - 1, 0), 0);
        editor.selection = new vscode.Selection(target, target);
        editor.revealRange(new vscode.Range(target, target));
      }

      if (message.type === "dismiss") {
        this.setActiveError(null);
      }
    });
  }

  setLoading(value: boolean): void {
    this.isLoading = value;
    this.post({ type: "setLoading", value });
  }

  setActiveError(value: PersistedError | null): void {
    this.activeError = value;
    if (!value && !this.isLoading) {
      this.status = "There are no errors.";
      this.post({ type: "setStatus", value: this.status });
    }
    this.post({ type: "setActiveError", value });
  }

  setHistory(value: PersistedError[]): void {
    this.history = value;
    this.post({ type: "setHistory", value });
  }

  setStatus(value: string): void {
    this.status = value;
    this.post({ type: "setStatus", value });
  }

  private post(message: SidebarMessage): void {
    this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = `${Date.now()}`;
    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      "style-src 'unsafe-inline'",
    ].join("; ");

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>DevLens</title>
        <style>
          body { font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); margin: 0; }
          .status { font-size: 12px; opacity: 0.85; margin-bottom: 10px; }
          .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 12px; margin-bottom: 12px; background: color-mix(in srgb, var(--vscode-editor-background) 86%, var(--vscode-panel-background)); }
          .title { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
          .meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
          .source { font-size: 12px; font-weight: 600; text-transform: uppercase; opacity: 0.9; }
          .badges { display: flex; flex-wrap: wrap; gap: 6px; }
          .badge { font-size: 11px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 8px; }
          .section { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 8px; margin-top: 8px; }
          .label { font-size: 11px; opacity: 0.75; text-transform: uppercase; margin-bottom: 4px; }
          .value { white-space: pre-wrap; line-height: 1.4; }
          .controls { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
          button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
          .ghost { background: transparent; border: 1px solid var(--vscode-panel-border); color: var(--vscode-foreground); }
          .fileline { margin-top: 8px; font-size: 12px; opacity: 0.8; word-break: break-all; }
          .muted { opacity: 0.75; font-size: 12px; }
          .history-title { font-weight: 700; font-size: 13px; margin: 4px 0 8px; }
          ul { list-style: none; padding: 0; margin: 0; }
          .history-item { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 8px; margin-bottom: 6px; }
          .history-meta { font-size: 11px; opacity: 0.85; margin-bottom: 3px; }
          .history-text { font-size: 12px; line-height: 1.35; }
          details { margin-top: 8px; }
          summary { cursor: pointer; font-size: 12px; opacity: 0.85; }
        </style>
      </head>
      <body>
        <div id="status" class="status">There are no errors.</div>
        <div id="active"></div>
        <div class="history-title">Recent Errors</div>
        <ul id="history"></ul>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          let activeError = null;
          let loading = false;
          let history = [];
          let statusText = "There are no errors.";

          function escapeHtml(value) {
            return String(value ?? "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;");
          }

          function shortText(value, max) {
            const text = String(value ?? "");
            if (text.length <= max) return text;
            return text.slice(0, max) + "...";
          }

          function render() {
            const status = document.getElementById("status");
            const active = document.getElementById("active");
            const historyRoot = document.getElementById("history");

            if (loading) {
              status.textContent = "Analyzing with Gemini...";
            } else if (!activeError && statusText) {
              status.textContent = statusText;
            } else if (!activeError) {
              status.textContent = "There are no errors.";
            } else {
              status.textContent = "Latest analyzed error";
            }

            if (!activeError) {
              active.innerHTML = \`
                <div class="card muted">
                  No active error to analyze right now.
                </div>
              \`;
            } else {
              active.innerHTML = \`
                <div class="card">
                  <div class="meta">
                    <div class="source">\${escapeHtml(activeError.source || "error")}</div>
                    <div class="badges">
                      <span class="badge">\${escapeHtml(activeError.type || "UnknownType")}</span>
                      <span class="badge">\${escapeHtml(activeError.severity || "UnknownSeverity")}</span>
                    </div>
                  </div>
                  <div class="section">
                    <div class="label">What Happened</div>
                    <div class="value">\${escapeHtml(activeError.what)}</div>
                  </div>
                  <div class="section">
                    <div class="label">Why It Happened</div>
                    <div class="value">\${escapeHtml(activeError.why)}</div>
                  </div>
                  <div class="section">
                    <div class="label">Fix Prompt</div>
                    <div class="value">\${escapeHtml(shortText(activeError.fixPrompt, 260))}</div>
                    <details>
                      <summary>Show full fix prompt</summary>
                      <div class="value">\${escapeHtml(activeError.fixPrompt)}</div>
                    </details>
                  </div>
                  <div class="fileline">\${escapeHtml(activeError.file || "")}\${activeError.line ? ":" + activeError.line : ""}</div>
                  <div class="controls">
                    <button id="copy-btn">Copy Fix Prompt</button>
                    <button class="ghost" id="open-btn">Open File</button>
                    <button class="ghost" id="dismiss-btn">Dismiss</button>
                  </div>
                </div>
              \`;
              document.getElementById("copy-btn")?.addEventListener("click", () => vscode.postMessage({ type: "copyFixPrompt" }));
              document.getElementById("open-btn")?.addEventListener("click", () => vscode.postMessage({ type: "openFile" }));
              document.getElementById("dismiss-btn")?.addEventListener("click", () => vscode.postMessage({ type: "dismiss" }));
            }

            historyRoot.innerHTML = history.map((item) => {
              const meta = \`\${escapeHtml(item.source)} • \${escapeHtml(item.type || "UnknownType")} • \${escapeHtml(item.severity || "UnknownSeverity")}\`;
              return \`
                <li class="history-item">
                  <div class="history-meta">\${meta}</div>
                  <div class="history-text">\${escapeHtml(shortText(item.message, 140))}</div>
                </li>
              \`;
            }).join("");
          }

          window.addEventListener("message", (event) => {
            const msg = event.data;
            if (msg.type === "setLoading") loading = msg.value;
            if (msg.type === "setActiveError") activeError = msg.value;
            if (msg.type === "setHistory") history = Array.isArray(msg.value) ? msg.value : [];
            if (msg.type === "setStatus") statusText = typeof msg.value === "string" ? msg.value : statusText;
            render();
          });

          render();
        </script>
      </body>
      </html>`;
  }
}

export function registerSidebar(context: vscode.ExtensionContext): DevLensSidebarProvider {
  const provider = new DevLensSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DevLensSidebarProvider.viewType, provider),
  );
  return provider;
}
