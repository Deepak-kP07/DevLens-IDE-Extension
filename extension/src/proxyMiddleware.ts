import * as vscode from "vscode";
import express from "express";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";
import { Server } from "node:http";
import { ErrorPayload } from "./types";

const DEFAULT_TARGET = "http://localhost:3000";
const DEFAULT_PROXY_PORT = 3002;

export interface BrowserProxyHandle {
  url: string;
  dispose(): Promise<void>;
}

const injectionScript = `
<script>
  (function() {
    function report(payload) {
      fetch('/__devlens_browser_error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function() {});
    }

    const originalError = console.error;
    console.error = function() {
      try {
        report({ message: Array.from(arguments).map(String).join(' '), source: 'browser' });
      } catch (e) {}
      return originalError.apply(console, arguments);
    };

    window.addEventListener('error', function(event) {
      report({
        source: 'browser',
        message: event.message || 'Unhandled browser error',
        file: event.filename,
        line: event.lineno
      });
    });

    window.addEventListener('unhandledrejection', function(event) {
      const reason = event.reason ? String(event.reason) : 'Unhandled Promise rejection';
      report({ source: 'browser', message: reason });
    });
  })();
</script>
`;

export async function startBrowserProxy(
  outputChannel: vscode.OutputChannel,
  onError: (payload: ErrorPayload) => void,
  targetOverride?: string,
): Promise<BrowserProxyHandle> {
  const cfg = vscode.workspace.getConfiguration("devlens");
  const target = targetOverride ?? cfg.get<string>("browserTargetUrl", DEFAULT_TARGET);
  const port = cfg.get<number>("proxyPort", DEFAULT_PROXY_PORT);

  const app = express();
  app.use(express.json());
  app.post("/__devlens_browser_error", (req, res) => {
    const body = req.body as Partial<ErrorPayload>;
    if (typeof body.message === "string") {
      onError({
        source: "browser",
        message: body.message,
        file: body.file,
        line: body.line,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(204).send();
  });

  app.use(
    "/",
    createProxyMiddleware({
      target,
      changeOrigin: true,
      selfHandleResponse: true,
      onProxyRes: responseInterceptor(async (responseBuffer, proxyRes) => {
        const contentType = String(proxyRes.headers["content-type"] ?? "");
        if (!contentType.includes("text/html")) {
          return responseBuffer;
        }

        const html = responseBuffer.toString("utf8");
        if (html.includes("__devlens_browser_error")) {
          return html;
        }
        return html.replace("</body>", `${injectionScript}</body>`);
      }),
    }),
  );

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });

  const proxyUrl = `http://localhost:${port}`;
  outputChannel.appendLine(`[DevLens] Browser proxy started on ${proxyUrl} -> ${target}`);

  return {
    url: proxyUrl,
    dispose: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
