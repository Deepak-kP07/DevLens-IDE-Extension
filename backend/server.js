require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const errorRoutes = require("./routes/errors");

const app = express();
const port = Number(process.env.PORT || 3001);
const mongoUri = process.env.MONGODB_URI;
const mongoDb = process.env.MONGODB_DB || "devlens";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mongoConnected: mongoose.connection.readyState === 1,
  });
});

app.use("/api", errorRoutes);

async function connectMongoWithRetry() {
  if (!mongoUri) {
    console.warn("[devlens-backend] MONGODB_URI is missing. Running in in-memory fallback mode.");
    return;
  }

  try {
    await mongoose.connect(mongoUri, { dbName: mongoDb });
    console.log("[devlens-backend] MongoDB connected.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[devlens-backend] MongoDB connection failed: ${message}`);
    console.warn("[devlens-backend] Running with in-memory fallback. Retrying in 15s.");
    setTimeout(() => {
      void connectMongoWithRetry();
    }, 15000);
  }
}

function checkExistingBackend() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/health",
        method: "GET",
        timeout: 1200,
      },
      (res) => {
        resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

const server = app.listen(port, () => {
  console.log(`[devlens-backend] listening on http://localhost:${port}`);
  void connectMongoWithRetry();
});

server.on("error", async (error) => {
  if (error && error.code === "EADDRINUSE") {
    const alreadyRunning = await checkExistingBackend();
    if (alreadyRunning) {
      console.log(
        `[devlens-backend] port ${port} already in use by a running backend. Reusing existing instance.`,
      );
      process.exit(0);
      return;
    }
    console.error(
      `[devlens-backend] port ${port} is in use by another process. Stop that process or change PORT in backend/.env.`,
    );
    process.exit(1);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[devlens-backend] startup failed: ${message}`);
  process.exit(1);
});
