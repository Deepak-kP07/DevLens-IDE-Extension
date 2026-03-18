import React from "react";
import { PersistedError } from "../types";

interface Props {
  errors: PersistedError[];
}

export function HistoryList({ errors }: Props): JSX.Element {
  if (!errors.length) {
    return <div>No history yet.</div>;
  }

  return (
    <div>
      <h3>Recent Errors</h3>
      <ul>
        {errors.map((entry) => (
          <li key={entry._id ?? `${entry.timestamp}-${entry.message.slice(0, 12)}`}>
            {entry.source} - {entry.type ?? "UnknownType"} - {entry.severity ?? "UnknownSeverity"}
          </li>
        ))}
      </ul>
    </div>
  );
}
