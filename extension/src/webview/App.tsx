import React from "react";
import { PersistedError } from "../types";
import { ErrorCard } from "./ErrorCard";
import { HistoryList } from "./HistoryList";

interface Props {
  activeError: PersistedError | null;
  history: PersistedError[];
  loading: boolean;
}

export function App({ activeError, history, loading }: Props): JSX.Element {
  return (
    <div>
      <p>{loading ? "Analyzing with Gemini..." : "DevLens Sidebar"}</p>
      <ErrorCard error={activeError} />
      <HistoryList errors={history} />
    </div>
  );
}
