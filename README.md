# DocuIntel frontend

The web interface for [DocuIntel](https://github.com/mmiskatul/DocuIntel-backend), an AI document-intelligence system that reads invoices and
other business documents, extracts structured data, validates it and makes it searchable. **Start with the backend README**: it has the
project overview, architecture, API reference, evaluation and the AI disclosure. This repository is only the website.

Live: https://docuintel-five.vercel.app (its backend runs on the author's computer behind a tunnel, so it can be offline; run it locally with the steps below).

## What you can do

| Page | Purpose |
|---|---|
| **Documents** | Upload many files at once, watch each one move through processing, filter by status or file type, search, export a CSV, delete. |
| **A document** | The original page (drawn by the backend) next to the extracted fields, a reconciliation of subtotal + tax against the total, line items, validation issues, and the processing history. Correct values, approve, reject, or read the document again. |
| **Search** | Ask a question and get an answer with its sources, find documents by meaning and keyword together, or filter. |
| **Cross-verify** | Choose two documents (for example a supplier PDF and your Excel list) and see which invoices agree and which do not. |

## Run it

You need Node.js 20 or newer and a running backend (see the backend README, "Quick start").

```bash
git clone https://github.com/mmiskatul/DocuIntel-frontend.git
cd DocuIntel-frontend
npm install
```

Create `.env.local`:

```
BACKEND_URL=http://localhost:8000
BACKEND_API_KEY=<the same value as API_KEY in the backend .env>
```

```bash
npm run dev          # http://localhost:3000
npm run build        # production build
npm run start        # serve the production build
npm run typecheck    # TypeScript check
npm test             # unit tests (Vitest)
```

### Environment variables

| Variable | Meaning |
|---|---|
| `BACKEND_URL` | Address of the backend API, no trailing slash. Read on the server only. |
| `BACKEND_API_KEY` | The backend's `API_KEY`. The server adds it to every request, so the browser never sees it. Never prefix it with `NEXT_PUBLIC_`. |

Do **not** set `NEXT_PUBLIC_API_URL`: the browser must talk to the site's own `/api` route, not to the backend directly.

### Deploying on Vercel

Set `BACKEND_URL` and `BACKEND_API_KEY` in the project's environment variables, then redeploy. Changing a variable does nothing for a deployment that
is already live. Requests above about 4.5 MB are refused by Vercel itself, so very large uploads should go to a self-hosted copy.

## Tests

`npm test` runs 41 unit tests (Vitest) against the real Redux store with the API client replaced by a stand-in, so they need no backend. They cover the
behaviour that is easy to get wrong: actions that update the screen at once and are undone when the server refuses, a slow older answer not overwriting
a newer one, searches that start from a clean page, delete and its overlay, comparing documents without changing them, the confirmation popup, saved
preferences, and the formatting helpers.

## How it is built

- **Next.js 16 (App Router), React 19, TypeScript.** Styling is one hand-written stylesheet (`app/globals.css`) with design tokens; icons come from lucide.
- **API proxy.** `app/api/[...path]/route.ts` forwards `/api/*` to the backend and adds the key. Streaming keeps large uploads and downloads out of memory.
- **State in one Redux Toolkit store** (`store/`):
  - a single sync loop keeps the document list and statistics fresh (fast while documents are processing, slow when idle, paused in a hidden tab), so moving between pages never shows an empty list;
  - opened documents are cached and refreshed quietly;
  - actions (approve, reject, delete, upload) update the screen at once and are undone from the server's answer if they fail;
  - one toast system for confirmations and errors, a centred confirmation popup for destructive actions, and a "Deleting…" overlay;
  - filters, search mode, recent searches and viewer zoom are remembered in `localStorage` (preferences only, never documents).
- **Accessible by default:** keyboard focus is visible, dialogs trap focus and close with Escape, status is never shown by colour alone, and motion respects `prefers-reduced-motion`.

```
app/            pages: documents list, document page, search, cross-verify, and the /api proxy
components/     Nav, DocTable, UploadZone, FilePreview, StatusBadge, Toaster, ConfirmDialog, BusyOverlay, Sync
store/          Redux slices: documents, search, verify, notifications, ui, and saved preferences
lib/            API client, types, formatting helpers, confirmation helper
```
