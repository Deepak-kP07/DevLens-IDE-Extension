# DevLens

DevLens is a Cursor/VS Code extension that captures development errors in real time and explains them in simple language with ready-to-use fix prompts.
It combines an extension host, a local backend, Gemini analysis, and persistent error history so debugging stays inside the IDE.

## What It Does

- Captures errors from:
  - terminal output (`npm run dev` flow)
  - browser runtime via local proxy injection
  - editor diagnostics (`Problems`)
- Sends structured error context to backend for:
  - plain-language explanation (`What happened`, `Why it happened`)
  - fix prompt generation
  - type + severity classification
- Renders results in the DevLens sidebar with:
  - active error card
  - history list
  - copy/open/dismiss actions

## Tech Stack

- Extension: TypeScript + VS Code/Cursor Extension API
- Backend: Node.js + Express
- AI: Google Gemini (`@google/generative-ai`)
- Database: MongoDB Atlas (with in-memory fallback when DB unavailable)
- Classification: Python + scikit-learn

## Setup

1. Create environment file:
   - copy `backend/.env.example` -> `backend/.env`
   - set `MONGODB_URI` and `MONGODB_DB`
2. Install workspace dependencies:
   - `npm install`
3. Install Python dependencies:
   - `python3 -m pip install -r backend/requirements.txt`
4. Train classifier models:
   - `python3 backend/classifier/train.py`

## Run (Development)

1. Start backend:
   - `npm run dev:backend`
2. Build extension:
   - `npm run build:extension`
3. Start extension debug host:
   - open Run and Debug
   - run `Run DevLens Extension`
4. In extension host window:
   - open your app workspace
   - run app dev server
   - DevLens opens proxy/browser tab automatically when dev URL is detected

## Default Ports

- Backend API: `http://localhost:3001`
- DevLens browser proxy: `http://localhost:3002`
- App dev server: auto-detected from terminal output (for example `5173/5174`)

## Key Commands

- `DevLens: Update API Key`
- `DevLens: Reset API Key`
- `DevLens: Send Test Error`

## Notes

- Gemini key is stored securely in extension secret storage (`context.secrets`), not in source files.
- If Atlas is unavailable (IP whitelist/network), backend continues in memory fallback mode.
- Sidebar now shows explicit status states such as no errors, analyzing, and backend-unavailable.

## Repository Structure

- `extension/` — extension runtime and sidebar UI
- `backend/` — API, Gemini integration, storage/classification
- `docs/PRD.md` — product and implementation spec

## Troubleshooting

- **No analysis in sidebar**
  - ensure backend is running: `npm run dev:backend`
  - run `DevLens: Send Test Error` to verify end-to-end path
- **Gemini model error**
  - update API key with `DevLens: Update API Key`
  - backend now auto-tries supported models and falls back gracefully
- **Proxy page not loading**
  - wait until DevLens logs detected dev URL
  - ensure app dev server is running in extension host window
