const express = require("express");
const mongoose = require("mongoose");
const ErrorModel = require("../models/Error");
const { callGemini } = require("../gemini");
const { classifyError } = require("../classifier/classify");

const router = express.Router();
const memoryErrors = [];

function normalizeIncomingPayload(body) {
  return {
    source: body.source === "browser" ? "browser" : "terminal",
    message: typeof body.message === "string" ? body.message.slice(0, 20000) : "",
    file: typeof body.file === "string" ? body.file : undefined,
    line: Number.isFinite(body.line) ? Number(body.line) : undefined,
    codeContext: typeof body.codeContext === "string" ? body.codeContext.slice(0, 10000) : undefined,
  };
}

router.post("/error", async (req, res) => {
  try {
    const payload = normalizeIncomingPayload(req.body ?? {});
    if (!payload.message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const apiKey = req.header("x-gemini-api-key");
    const [analysis, classification] = await Promise.all([
      callGemini(apiKey, payload),
      Promise.resolve(classifyError(payload.message)),
    ]);

    const enriched = {
      ...payload,
      what: analysis.what,
      why: analysis.why,
      fixPrompt: analysis.fixPrompt,
      type: classification.type,
      severity: classification.severity,
    };

    if (mongoose.connection.readyState !== 1) {
      const inMemoryRecord = {
        _id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...enriched,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryErrors.unshift(inMemoryRecord);
      if (memoryErrors.length > 200) {
        memoryErrors.length = 200;
      }
      res.status(201).json(inMemoryRecord);
      return;
    }

    const created = await ErrorModel.create(enriched);

    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

router.get("/errors", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    if (mongoose.connection.readyState !== 1) {
      res.json(memoryErrors.slice(0, limit));
      return;
    }
    const records = await ErrorModel.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json(records);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

router.delete("/errors/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      const index = memoryErrors.findIndex((entry) => entry._id === req.params.id);
      if (index !== -1) {
        memoryErrors.splice(index, 1);
      }
      res.status(204).send();
      return;
    }
    await ErrorModel.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

module.exports = router;
