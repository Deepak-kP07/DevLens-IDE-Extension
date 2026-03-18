import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import * as vscode from "vscode";
import { ErrorPayload } from "./types";

const ERROR_PATTERNS = [
  /error/i,
  /exception/i,
  /failed/i,
  /TypeError/i,
  /ReferenceError/i,
  /SyntaxError/i,
];
const VITE_PATTERN = /\[plugin:vite:|vite:/i;

export interface TerminalCaptureHandle {
  dispose(): void;
}

function isErrorOutput(output: string): boolean {
  return ERROR_PATTERNS.some((pattern) => pattern.test(output)) || VITE_PATTERN.test(output);
}

function parseFileAndLine(output: string): { file?: string; line?: number } {
  const stackMatch = output.match(/(?:at|in)\s+([^\s:]+\.[a-zA-Z]+):(\d+)(?::\d+)?/);
  if (!stackMatch) {
    return {};
  }

  return {
    file: stackMatch[1],
    line: Number(stackMatch[2]),
  };
}

export function startTerminalCapture(
  outputChannel: vscode.OutputChannel,
  onError: (payload: ErrorPayload) => void,
  onDevServerUrl?: (url: string) => void,
): TerminalCaptureHandle {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) {
    outputChannel.appendLine("[DevLens] No workspace folder available for terminal capture.");
    return { dispose: () => undefined };
  }

  let lastReportedError = "";
  const recentUrls = new Set<string>();
  const process: ChildProcessWithoutNullStreams = spawn("npm", ["run", "dev"], {
    cwd: folder,
    shell: true,
  });

  const maybeReportTerminalError = (text: string): void => {
    if (!isErrorOutput(text)) {
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || trimmed === lastReportedError) {
      return;
    }
    lastReportedError = trimmed;
    const location = parseFileAndLine(trimmed);
    outputChannel.appendLine(
      `[DevLens] Captured terminal error: ${trimmed.slice(0, 140)}`,
    );
    onError({
      source: "terminal",
      message: trimmed,
      file: location.file,
      line: location.line,
      timestamp: new Date().toISOString(),
    });
  };

  process.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    outputChannel.appendLine(`[dev] ${text.trimEnd()}`);
    const urlMatch = text.match(/https?:\/\/localhost:\d+/i);
    if (urlMatch && onDevServerUrl && !recentUrls.has(urlMatch[0])) {
      recentUrls.add(urlMatch[0]);
      onDevServerUrl(urlMatch[0]);
    }
    maybeReportTerminalError(text);
  });

  process.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    outputChannel.appendLine(`[stderr] ${text.trimEnd()}`);
    maybeReportTerminalError(text);
  });

  process.on("exit", (code) => {
    outputChannel.appendLine(`[DevLens] npm run dev exited with code ${code ?? -1}.`);
  });

  return {
    dispose: () => {
      if (!process.killed) {
        process.kill();
      }
    },
  };
}
