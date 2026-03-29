const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Extract WHAT / WHY / FIX from Gemini output.
 * The previous regex used (?=\n[A-Z ]+:) which broke on lines like "ERROR:" or "[diagnostic:ts]"
 * inside section bodies — those were treated as the next section header.
 */
function extractDevLensSections(raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n");
  const lower = text.toLowerCase();

  function findHeaderRange(label) {
    const needle = `${label}:`;
    const n = needle.toLowerCase();
    let pos = 0;
    while (pos <= text.length) {
      const i = lower.indexOf(n, pos);
      if (i < 0) {
        return null;
      }
      const lineStart = i === 0 ? 0 : text.lastIndexOf("\n", i - 1) + 1;
      const before = text.slice(lineStart, i);
      if (/^[\s#*\-]*$/i.test(before)) {
        return { labelStart: i, afterColon: i + needle.length };
      }
      pos = i + 1;
    }
    return null;
  }

  const W = findHeaderRange("WHAT HAPPENED");
  const Y = findHeaderRange("WHY IT HAPPENED");
  const F = findHeaderRange("FIX PROMPT");

  let what = "";
  let why = "";
  let fixPrompt = "";

  if (W && Y && Y.labelStart > W.afterColon) {
    what = text.slice(W.afterColon, Y.labelStart).trim();
  }
  if (Y && F && F.labelStart > Y.afterColon) {
    why = text.slice(Y.afterColon, F.labelStart).trim();
  }
  if (F) {
    fixPrompt = text.slice(F.afterColon).trim();
  }

  return { what, why, fixPrompt };
}

/** When headings are missing but the model still returned useful text, don't throw away the reply. */
function softFallbackFromGeminiBody(text, payload) {
  const t = String(text).replace(/\r\n/g, "\n").trim();
  if (t.length < 30) {
    return null;
  }
  const msg = String(payload.message ?? "").trim();
  const shortMsg = msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
  return {
    what: `An error was reported (${payload.source ?? "unknown"}): ${shortMsg || "see details below."}`,
    why: "The model reply did not use the exact DevLens section labels; the guidance below is still from the assistant.",
    fixPrompt: t,
  };
}

/** Remove markdown clutter models often add (**bold**, ## headers, etc.) for copy-paste friendly text. */
function stripMarkdownNoise(text) {
  if (!text || typeof text !== "string") {
    return "";
  }
  let t = text.replace(/\r\n/g, "\n");
  let prev;
  do {
    prev = t;
    t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  } while (t !== prev);
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^\s*([-*_])\1{2,}\s*$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

const FIX_PROMPT_MAX_CHARS = 2200;

function clampFixPrompt(text) {
  const s = stripMarkdownNoise(text);
  if (s.length <= FIX_PROMPT_MAX_CHARS) {
    return s;
  }
  const cut = s.slice(0, FIX_PROMPT_MAX_CHARS);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  const head = lastBreak > FIX_PROMPT_MAX_CHARS * 0.65 ? cut.slice(0, lastBreak) : cut;
  return `${head.trim()}\n…`;
}

function polishSections(what, why, fixPrompt) {
  return {
    what: stripMarkdownNoise(what),
    why: stripMarkdownNoise(why),
    fixPrompt: clampFixPrompt(fixPrompt),
  };
}

function fallbackAnalysis(message) {
  return {
    what: "DevLens could not parse a structured Gemini response.",
    why: "The model response format differed from expected section headings.",
    fixPrompt: `Analyze and fix this error with minimal changes:\n${message}`,
  };
}

function fallbackFromGeminiFailure(message, reason) {
  return {
    what: "DevLens could not call Gemini for this error.",
    why: reason,
    fixPrompt: `Analyze and fix this error with minimal changes:\n${message}`,
  };
}

async function discoverSupportedModels(apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    );
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    const models = Array.isArray(payload.models) ? payload.models : [];
    const supported = models
      .filter((item) => Array.isArray(item.supportedGenerationMethods))
      .filter((item) => item.supportedGenerationMethods.includes("generateContent"))
      .map((item) => String(item.name || ""))
      .map((name) => name.replace(/^models\//, ""))
      .filter(Boolean);
    return supported;
  } catch (_error) {
    return [];
  }
}

function buildModelPreferenceList(discoveredModels) {
  const preferredOrder = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
  ];

  const merged = [];
  for (const modelName of preferredOrder) {
    if (discoveredModels.includes(modelName)) {
      merged.push(modelName);
    }
  }
  for (const modelName of discoveredModels) {
    if (!merged.includes(modelName) && modelName.startsWith("gemini-")) {
      merged.push(modelName);
    }
  }
  if (merged.length === 0) {
    return preferredOrder;
  }
  return merged;
}

async function callGemini(apiKey, payload) {
  if (!apiKey) {
    return {
      what: "Gemini API key is missing.",
      why: "DevLens did not receive x-gemini-api-key header for this request.",
      fixPrompt: "Set your Gemini API key using the command: DevLens: Update API Key",
    };
  }

  const prompt = `
You are DevLens, a debugging assistant for IDE users.

Output plain text only — no markdown: do NOT use **, __, # headings, horizontal rules, or decorative bullets.
Use "-" at line start only when listing separate steps. Keep wording tight and scannable.

Return exactly these sections (labels verbatim):

WHAT HAPPENED:
One or two short sentences in everyday language (what broke and where).

WHY IT HAPPENED:
One or two short sentences on the root cause (no repetition of WHAT).

FIX PROMPT:
Concise, actionable instructions the user can paste into an AI assistant or follow directly.
- Order: most important fix first, then 2–6 supporting steps if needed.
- Mention real file paths, line numbers, or symbol names from the error when useful.
- Prefer imperative lines ("Do X…", "Verify Y…") over long paragraphs.
- Aim under ~1800 characters; omit filler and redundant explanations.

Error source: ${payload.source}
Error message:
${payload.message}

File: ${payload.file ?? "unknown"}
Line: ${payload.line ?? "unknown"}
Code Context:
${payload.codeContext ?? "not provided"}
`;

  const client = new GoogleGenerativeAI(apiKey);
  const discoveredModels = await discoverSupportedModels(apiKey);
  const modelCandidates = buildModelPreferenceList(discoveredModels);
  let lastError = null;

  for (const modelName of modelCandidates) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      let { what, why, fixPrompt } = extractDevLensSections(text);

      if (!what || !why || !fixPrompt) {
        const soft = softFallbackFromGeminiBody(text, payload);
        if (soft) {
          what = what || soft.what;
          why = why || soft.why;
          fixPrompt = fixPrompt || soft.fixPrompt;
        }
      }

      if (!what || !why || !fixPrompt) {
        return fallbackAnalysis(payload.message);
      }

      return polishSections(what, why, fixPrompt);
    } catch (error) {
      lastError = error;
    }
  }

  const reason =
    lastError instanceof Error
      ? `${lastError.message}\nTried models: ${modelCandidates.join(", ")}`
      : "Gemini request failed because no supported model could be used.";
  return fallbackFromGeminiFailure(payload.message, reason);
}

module.exports = {
  callGemini,
};
