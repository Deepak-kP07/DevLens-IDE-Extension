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
          .card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 12px;
            background: color-mix(in srgb, var(--vscode-editor-background) 86%, var(--vscode-panel-background));
          }
          .title { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
          .meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
          .source {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            padding: 3px 8px;
            border-radius: 6px;
          }
          .source--terminal {
            background: color-mix(in srgb, var(--vscode-terminal-ansiBlue) 22%, transparent);
            color: var(--vscode-terminal-ansiBrightBlue, var(--vscode-textLink-foreground));
          }
          .source--browser {
            background: color-mix(in srgb, var(--vscode-charts-purple) 22%, transparent);
            color: var(--vscode-charts-purple);
          }
          .badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
          .badge { font-size: 11px; border-radius: 999px; padding: 3px 9px; font-weight: 600; border: 1px solid transparent; }
          .badge-type {
            background: color-mix(in srgb, var(--vscode-symbolIcon-classForeground) 18%, var(--vscode-editor-background));
            color: var(--vscode-symbolIcon-classForeground);
            border-color: color-mix(in srgb, var(--vscode-symbolIcon-classForeground) 35%, transparent);
          }
          .badge-sev-high {
            background: color-mix(in srgb, var(--vscode-errorForeground) 18%, var(--vscode-editor-background));
            color: var(--vscode-errorForeground);
            border-color: color-mix(in srgb, var(--vscode-errorForeground) 40%, transparent);
          }
          .badge-sev-medium {
            background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 18%, var(--vscode-editor-background));
            color: var(--vscode-editorWarning-foreground);
            border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground) 40%, transparent);
          }
          .badge-sev-low {
            background: color-mix(in srgb, var(--vscode-editorInfo-foreground) 18%, var(--vscode-editor-background));
            color: var(--vscode-editorInfo-foreground);
            border-color: color-mix(in srgb, var(--vscode-editorInfo-foreground) 40%, transparent);
          }
          .badge-sev-unknown {
            background: color-mix(in srgb, var(--vscode-descriptionForeground) 15%, var(--vscode-editor-background));
            color: var(--vscode-descriptionForeground);
            border-color: var(--vscode-panel-border);
          }
          .code-context {
            margin: 4px 0 10px;
            padding: 8px 10px;
            border-radius: 6px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            line-height: 1.45;
            white-space: pre-wrap;
            overflow-x: auto;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-textCodeBlock-background, var(--vscode-editor-inactiveSelectionBackground));
            color: var(--vscode-editor-foreground);
          }
          .section {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 9px 10px;
            margin-top: 8px;
          }
          .section--what { background: color-mix(in srgb, var(--vscode-textLink-foreground) 6%, transparent); }
          .section--why { background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 6%, transparent); }
          .section--fix { background: color-mix(in srgb, var(--vscode-charts-green, var(--vscode-testing-iconPassed)) 7%, transparent); }
          .label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 5px; }
          .section--what .label { color: var(--vscode-textLink-foreground); }
          .section--why .label { color: var(--vscode-editorWarning-foreground); }
          .section--fix .label { color: var(--vscode-charts-green, var(--vscode-testing-iconPassed)); }
          .value { white-space: pre-wrap; line-height: 1.45; font-size: 12px; }
          .controls { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
          button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
          .ghost { background: transparent; border: 1px solid var(--vscode-panel-border); color: var(--vscode-foreground); }
          .fileline {
            margin-top: 8px;
            font-size: 12px;
            word-break: break-all;
            padding: 6px 8px;
            border-radius: 6px;
            background: color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
            color: var(--vscode-textLink-foreground);
            font-family: var(--vscode-editor-font-family);
          }
          .muted { opacity: 0.75; font-size: 12px; }
          .history-title { font-weight: 700; font-size: 13px; margin: 4px 0 8px; }
          ul { list-style: none; padding: 0; margin: 0; }
          .history-item {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 8px;
            margin-bottom: 6px;
            background: color-mix(in srgb, var(--vscode-editor-background) 86%, var(--vscode-panel-background));
          }
          .history-meta { font-size: 11px; opacity: 0.9; margin-bottom: 4px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
          .history-text { font-size: 12px; line-height: 1.35; color: var(--vscode-foreground); }
          details { margin-top: 8px; }
          summary { cursor: pointer; font-size: 12px; color: var(--vscode-descriptionForeground); }
        </style>
      </head>
      <body>
        <div id="status" class="status">There are no errors.</div>
        <div id="active"></div>
        <div class="history-title">Recent Errors</div>
        <ul id="history"></ul>
        <div id="history-toggle"></div>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          let activeError = null;
          let loading = false;
          let history = [];
          let statusText = "There are no errors.";
          let showAllHistory = false;

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

          function severityLevel(sev) {
            const s = String(sev ?? "").toLowerCase();
            if (/critical|high|error|severe|fatal/.test(s)) return "high";
            if (/medium|warn|moderate/.test(s)) return "medium";
            if (/low|info|minor|hint/.test(s)) return "low";
            return "unknown";
          }

          function render() {
            const status = document.getElementById("status");
            const active = document.getElementById("active");
            const historyRoot = document.getElementById("history");
            const historyToggleRoot = document.getElementById("history-toggle");

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
              const sev = severityLevel(activeError.severity);
              const src = (activeError.source || "").toLowerCase() === "browser" ? "browser" : "terminal";
              const codeCtx = activeError.codeContext
                ? \`<pre class="code-context" role="region" aria-label="Code context">\${escapeHtml(activeError.codeContext)}</pre>\`
                : "";
              active.innerHTML = \`
                <div class="card">
                  <div class="meta">
                    <span class="source source--\${src}">\${escapeHtml(activeError.source || "error")}</span>
                    <div class="badges">
                      <span class="badge badge-type" title="Classifier type">\${escapeHtml(activeError.type || "UnknownType")}</span>
                      <span class="badge badge-sev-\${sev}" title="Severity">\${escapeHtml(activeError.severity || "UnknownSeverity")}</span>
                    </div>
                  </div>
                  \${codeCtx}
                  <div class="section section--what">
                    <div class="label">What happened</div>
                    <div class="value">\${escapeHtml(activeError.what)}</div>
                  </div>
                  <div class="section section--why">
                    <div class="label">Why it happened</div>
                    <div class="value">\${escapeHtml(activeError.why)}</div>
                  </div>
                  <div class="section section--fix">
                    <div class="label">Fix prompt</div>
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

            const visibleHistory = showAllHistory ? history : history.slice(0, 5);
            historyRoot.innerHTML = visibleHistory.map((item) => {
              const hSev = severityLevel(item.severity);
              const hSrc = (item.source || "").toLowerCase() === "browser" ? "browser" : "terminal";
              return \`
                <li class="history-item">
                  <div class="history-meta">
                    <span class="source source--\${hSrc}">\${escapeHtml(item.source || "?")}</span>
                    <span class="badge badge-type">\${escapeHtml(item.type || "UnknownType")}</span>
                    <span class="badge badge-sev-\${hSev}">\${escapeHtml(item.severity || "UnknownSeverity")}</span>
                  </div>
                  <div class="history-text">\${escapeHtml(shortText(item.message, 140))}</div>
                </li>
              \`;
            }).join("");

            if (history.length > 5) {
              historyToggleRoot.innerHTML = \`<button class="ghost" id="history-toggle-btn">\${showAllHistory ? "View less" : "View more"}</button>\`;
              document.getElementById("history-toggle-btn")?.addEventListener("click", () => {
                showAllHistory = !showAllHistory;
                render();
              });
            } else {
              historyToggleRoot.innerHTML = "";
            }
          }

          window.addEventListener("message", (event) => {
            const msg = event.data;
            if (msg.type === "setLoading") loading = msg.value;
            if (msg.type === "setActiveError") activeError = msg.value;
            if (msg.type === "setHistory") {
              history = Array.isArray(msg.value) ? msg.value : [];
              showAllHistory = false;
            }
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
