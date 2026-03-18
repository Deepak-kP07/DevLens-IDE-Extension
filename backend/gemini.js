const { GoogleGenerativeAI } = require("@google/generative-ai");

function extractSection(text, heading) {
  const regex = new RegExp(`${heading}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
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
Return exactly these sections:
WHAT HAPPENED:
WHY IT HAPPENED:
FIX PROMPT:

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
      const what = extractSection(text, "WHAT HAPPENED");
      const why = extractSection(text, "WHY IT HAPPENED");
      const fixPrompt = extractSection(text, "FIX PROMPT");

      if (!what || !why || !fixPrompt) {
        return fallbackAnalysis(payload.message);
      }

      return { what, why, fixPrompt };
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
