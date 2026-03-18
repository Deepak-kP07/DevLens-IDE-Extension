const mongoose = require("mongoose");

const errorSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["terminal", "browser"],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    file: {
      type: String,
    },
    line: {
      type: Number,
    },
    codeContext: {
      type: String,
    },
    what: {
      type: String,
      default: "",
    },
    why: {
      type: String,
      default: "",
    },
    fixPrompt: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      default: "UnknownType",
    },
    severity: {
      type: String,
      default: "UnknownSeverity",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Error", errorSchema);
