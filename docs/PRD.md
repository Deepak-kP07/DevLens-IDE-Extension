# DevLens — Product Requirements Document (Implementation-Aligned)

Version: 1.1  
Status: Active  
Last Updated: 2026-03-18

---

## 1) Product Summary

DevLens is an IDE-first debugging assistant for Cursor/VS Code.

It captures developer errors (terminal, browser runtime, editor diagnostics), sends them to a local backend for AI analysis, and renders plain-language guidance in a sidebar with actionable fix prompts.

---

## 2) Scope

### In Scope (Current)

- One **IDE extension** (TypeScript) for Cursor/VS Code.
- One **local backend** (Node + Express).
- Gemini-based explanation pipeline with resilient fallback.
- Error history storage using MongoDB Atlas when available.
- In-memory fallback storage when DB is unavailable.
- Browser error capture via local proxy script injection.
- Sidebar UI inside IDE for active error + history.

### Out of Scope (Current)

- Separate Chrome/Firefox browser extension.
- Building a standalone custom IDE.
- Multi-user cloud sync.
- Team/shared project analytics.

> Important: DevLens is implemented as an **IDE extension only**.  
> No separate browser extension is required.

---

## 3) Goals

1. Keep debugging flow inside the IDE.
2. Convert noisy errors into clear explanations.
3. Provide copyable fix prompts quickly.
4. Preserve recent error history for context.
5. Remain usable even when Atlas/Gemini are temporarily unavailable.

---

## 4) High-Level Architecture

### Components

- `extension/` (TypeScript)
  - activation, commands, captures, sidebar, proxy browser tab behavior
- `backend/` (Node/Express)
  - API routes, Gemini integration, persistence/classification
- `backend/classifier/` (Python)
  - simple ML model for type/severity labeling

### Data Flow

1. Error captured in extension (`terminal` / `browser` / `diagnostic`).
2. Extension posts payload to `POST /api/error`.
3. Backend enriches with Gemini + classifier.
4. Backend stores to Atlas (or memory fallback).
5. Extension renders active error + refreshes history from `GET /api/errors`.

---

## 5) Functional Requirements

## FR-A: Extension Activation and Commands

- On activation, extension must:
  - initialize sidebar
  - check backend health
  - prompt for Gemini key on first run
  - start terminal + diagnostics capture
  - start browser proxy
- Commands:
  - `DevLens: Update API Key`
  - `DevLens: Reset API Key`
  - `DevLens: Send Test Error`

## FR-B: API Key Management

- Gemini key is stored in `context.secrets`.
- Key is never written to repo files.
- Key can be updated or reset via commands.

## FR-C: Error Capture

- Terminal capture:
  - watch spawned `npm run dev` output
  - detect common error patterns
  - parse optional file/line if present
- Diagnostic capture:
  - listen to IDE diagnostics change events
  - capture `Error` severity entries
- Browser capture:
  - local proxy injects script for `console.error`, `window.onerror`, `unhandledrejection`

## FR-D: Sidebar UX

- Show status states:
  - `There are no errors.`
  - analyzing/loading
  - backend unavailable
  - latest analyzed error
- Active error card includes:
  - source
  - type/severity badges
  - what/why/fix prompt
  - file:line
  - actions: copy prompt, open file, dismiss
- History list shows recent analyzed errors.

## FR-E: Browser Tab Behavior

- DevLens should open app in IDE tab automatically once real dev URL is detected.
- Auto-open should not happen too early (before dev server URL detection).
- Embedded browser tab should auto-recover when dev server restarts.

## FR-F: Backend API

- `GET /health`
  - returns service status and mongo connection state
- `POST /api/error`
  - accepts normalized error payload
  - enriches with Gemini + classifier
  - stores to Atlas or memory fallback
  - returns enriched record
- `GET /api/errors`
  - returns latest records (default 20, max 50)
- `DELETE /api/errors/:id`
  - delete by id

## FR-G: Gemini Integration

- Backend attempts supported models dynamically (via list-model discovery) plus preferred ordering.
- If model/API call fails:
  - backend must return graceful fallback text (not crash pipeline)
  - sidebar still gets a meaningful response

## FR-H: Persistence and Resilience

- Preferred store: MongoDB Atlas.
- If Atlas is unreachable:
  - backend remains up
  - routes use in-memory fallback
  - periodic reconnect attempts continue.

## FR-I: Classification

- Classifier labels each error with:
  - type: Syntax | Runtime | Logic | Unknown
  - severity: Critical | High | Medium | Low | Unknown

---

## 6) Non-Functional Requirements

- Fast UI feedback for captured errors.
- Graceful degradation:
  - backend down -> clear UI status
  - Gemini unavailable -> fallback explanation
  - Atlas unavailable -> memory fallback
- Secrets safety:
  - no Gemini key in source files.
- Local-first behavior:
  - all core flows run on local machine.

---

## 7) Configuration

### Extension Settings

- `devlens.backendUrl` (default: `http://localhost:3001`)
- `devlens.proxyPort` (default: `3002`)
- `devlens.browserTargetUrl` (default: `http://localhost:3000`)
- `devlens.autoOpenBrowserTab` (default: `true`)

### Backend Env

`backend/.env`

- `PORT=3001`
- `MONGODB_URI=...`
- `MONGODB_DB=devlens`

---

## 8) Acceptance Criteria

1. **Capture + Analyze**
   - A deliberate syntax error appears in DevLens sidebar with explanation fields.
2. **No-Error State**
   - Sidebar clearly shows `There are no errors.` when idle.
3. **Browser Flow**
   - App opens in IDE browser tab through proxy and recovers after dev restart.
4. **Backend Resilience**
   - DevLens still returns analysis when Atlas is unavailable.
5. **API Key Flow**
   - First run asks key; reset/update commands work.
6. **History**
   - Recent errors appear in list and update as new issues occur.

---

## 9) Current Repository Map

```
Devlens-Extention/
├── extension/
│   ├── src/
│   │   ├── extension.ts
│   │   ├── terminalCapture.ts
│   │   ├── diagnosticCapture.ts
│   │   ├── proxyMiddleware.ts
│   │   ├── sidebarProvider.ts
│   │   ├── apiClient.ts
│   │   ├── secrets.ts
│   │   └── types.ts
│   └── package.json
├── backend/
│   ├── server.js
│   ├── routes/errors.js
│   ├── gemini.js
│   ├── models/Error.js
│   ├── classifier/
│   │   ├── classify.js
│   │   ├── classifier.py
│   │   ├── train.py
│   │   └── training_data.json
│   └── requirements.txt
└── README.md
```

---

## 10) Future Enhancements (Post-v1.1)

- Better AI output templates by error category.
- Richer history filters and search.
- Retry queue for failed Gemini calls.
- Optional telemetry/analytics (opt-in).
- Better source attribution (`terminal` vs `diagnostic` vs `browser`) badges/icons.

---

## 11) Implementation Note

This PRD intentionally reflects **what is implemented now** and should remain synchronized with code changes.
If architecture changes, update this file in the same PR.
