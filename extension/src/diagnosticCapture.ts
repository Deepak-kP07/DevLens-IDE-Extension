import * as vscode from "vscode";
import { ErrorPayload } from "./types";

export interface DiagnosticCaptureHandle {
  dispose(): void;
}

export function startDiagnosticCapture(
  outputChannel: vscode.OutputChannel,
  onError: (payload: ErrorPayload) => void,
): DiagnosticCaptureHandle {
  const seen = new Set<string>();

  const emitDiagnostics = (uri: vscode.Uri): void => {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity !== vscode.DiagnosticSeverity.Error) {
        continue;
      }

      const signature = `${uri.fsPath}:${diagnostic.range.start.line}:${diagnostic.message}`;
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      if (seen.size > 500) {
        const first = seen.values().next().value as string | undefined;
        if (first) {
          seen.delete(first);
        }
      }

      const message = `[diagnostic${diagnostic.source ? `:${diagnostic.source}` : ""}] ${diagnostic.message}`;
      outputChannel.appendLine(`[DevLens] Captured editor error: ${message}`);
      onError({
        source: "terminal",
        message,
        file: uri.fsPath,
        line: diagnostic.range.start.line + 1,
        timestamp: new Date().toISOString(),
      });
    }
  };

  for (const [uri] of vscode.languages.getDiagnostics()) {
    emitDiagnostics(uri);
  }

  const disposable = vscode.languages.onDidChangeDiagnostics((event) => {
    for (const uri of event.uris) {
      emitDiagnostics(uri);
    }
  });

  return {
    dispose: () => disposable.dispose(),
  };
}
