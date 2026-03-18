export type ErrorSource = "terminal" | "browser";

export interface ErrorPayload {
  source: ErrorSource;
  message: string;
  file?: string;
  line?: number;
  codeContext?: string;
  timestamp?: string;
}

export interface ErrorAnalysis {
  what: string;
  why: string;
  fixPrompt: string;
  type?: string;
  severity?: string;
}

export interface PersistedError extends ErrorPayload, ErrorAnalysis {
  _id?: string;
  createdAt?: string;
}
