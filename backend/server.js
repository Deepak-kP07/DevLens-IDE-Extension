require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
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

app.listen(port, () => {
  console.log(`[devlens-backend] listening on http://localhost:${port}`);
  void connectMongoWithRetry();
});
