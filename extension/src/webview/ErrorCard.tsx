import React from "react";
import { PersistedError } from "../types";

interface Props {
  error: PersistedError | null;
}

export function ErrorCard({ error }: Props): JSX.Element {
  if (!error) {
    return <div>No active error.</div>;
  }

  return (
    <div>
      <h3>What happened</h3>
      <p>{error.what}</p>
      <h3>Why</h3>
      <p>{error.why}</p>
      <h3>Fix prompt</h3>
      <pre>{error.fixPrompt}</pre>
    </div>
  );
}
import React from "react";
import { PersistedError } from "../types";

interface Props {
  error: PersistedError | null;
}

export function ErrorCard({ error }: Props): JSX.Element {
  if (!error) {
    return <div>No active error.</div>;
  }

  return (
    <div>
      <h3>What happened</h3>
      <p>{error.what}</p>
      <h3>Why</h3>
      <p>{error.why}</p>
      <h3>Fix prompt</h3>
      <pre>{error.fixPrompt}</pre>
    </div>
  );
}
