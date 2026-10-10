# MailPilot

MailPilot is a Next.js dashboard that connects to Gmail, detects newsletter subscriptions for one-click unsubscribe, and triages job-related emails into actionable workflows.

## Features

- **Multi-account Gmail linking** with Google OAuth
- **Subscription management** with RFC 8058 one-click unsubscribe, mailto fallback, and cleanup options
- **Job radar** that classifies inbox activity into leads, interviews, assessments, offers, and rejections
- **AI-assisted processing** with provider routing (OpenRouter and optional local Ollama)
- **Persistent profile + automation settings** for account-level and profile-level behavior
- **Background inbox sync** through Gmail watch notifications and webhook processing
- **Object storage via Vercel Blob** for serving login background media

## Inbox sync pipeline

MailPilot uses **two Gmail bookmarks** for different jobs:

| Watermark | Owner | Purpose |
| --- | --- | --- |
| `Account.historyId` | Gmail History API (`processInboxDelta`) | “What changed in the mailbox since this tip?” — subscriptions + classification on added messages |
| `Account.lastSyncedAt` | Sync Inbox (`syncInboxOpportunities`) | Time cursor for the job-oriented search query (`after:…` + 10‑minute overlap) |

### Automatic path (Pub/Sub)

1. Gmail watch → Pub/Sub → `POST /api/webhooks/gmail`
2. `processInboxDelta(email, notificationHistoryId)` digests `messageAdded` history, upserts subscriptions, classifies job mail, advances **`historyId` only**
3. Does **not** stamp `lastSyncedAt` (avoids shrinking the Sync Inbox window when a webhook finishes mid-flight)

### Sync Inbox path (Job Radar → Sync Inbox)

Runs in `after()` from `syncInboxOpportunities` (**delta-first**):

1. Snapshot `runStartedAt = new Date()` (not written yet)
2. **`processInboxDelta`** — catch missed Pub/Sub, update subscriptions / `historyId`
   - If History API returns **404** (expired `historyId`), renew the watch and set `historyExpired` so the job query uses a **lookback** window (default 14 days) instead of a thin incremental `after:`
3. **Job Gmail search** + ≤10 `PENDING_AI` drain — dedupe against delta ids, `EmailMessage` (keep `PENDING_AI`), and `JobApplication`
4. Classify / persist (heartbeat renewed per AI chunk; stale-lock constants unchanged)
5. On **success only**, commit `lastSyncedAt = runStartedAt` so mail that arrived during the run stays inside the next incremental window (+ overlap)

Settings → **Sync** still calls `triggerManualSync` → `processInboxDelta` alone (kept for isolated delta testing). Prefer Sync Inbox for day-to-day recovery.

### Opportunity dedupe (ingest)

`persistClassifiedEmail` (used by delta, Sync Inbox, and historical scan) matches jobs in order:

1. **Same email** (`emailMessageId`) — `applyUrl` match, else title + `isLocationCompatible`
2. **Cross-email** — same company + title + compatible location; **suppress** (no update/create) if DISMISSED or user-archived
3. **Insert** — only when neither tier matches

Location helpers live in `lib/utils/location.ts` (`parseLocation`, `isLocationCompatible`).

## Email Ingestion, Deduplication & Retention Lifecycle

### Dual watermarks and the ingestion window

Two bookmarks cover different jobs:

- **`historyId`** is the Gmail History API tip. Delta sync asks “what was added since this id?” and advances `historyId` when that pass finishes. It does not move `lastSyncedAt`.
- **`lastSyncedAt`** is the time cursor for the job-oriented Gmail search. An incremental sweep uses `after:lastSyncedAt` plus a short overlap so mail near the boundary is not skipped.

`lastSyncedAt` advances only when the whole Sync Inbox pass succeeds. The handler snapshots `runStartedAt` before digestion and writes that snapshot at the end. Mail that arrives while the run is in flight stays inside the next incremental window. A failed pass leaves the previous cursor in place so the same mail is tried again.

### Manual AI queue flush

Messages waiting on a model are stored as `PENDING_AI`, including the extracted `rawBody`. Deleting those rows while they are still inside the Gmail query window makes the next sync treat them as new: the `messageId` dedupe shield is gone, so Gmail is fetched again and the queue refills.

The flush does not delete the row and does not touch `lastSyncedAt` or `historyId`. `flushPendingAiMessages` sets `emailCategory` to `IRRELEVANT` and `rawBody` to null on `PENDING_AI` messages that have no `JobOpportunity`. The raw text is released immediately, classification stops, and the `messageId` row still blocks re-ingestion.

The status pill that reads “N emails awaiting classification” has a circled **X** beside that label (`Dismiss awaiting emails`). It runs the flush for the active account and drops the counter as soon as the update succeeds.

### Automated retention purge

`dismissedRetentionDays` on account rules (default 30) is the hard age boundary. During sync housekeeping, `purgeExpiredDismissed`:

1. Deletes `DISMISSED` opportunities whose `dismissedAt` is older than that window. User-archived History cards are not dismissed, so they stay.
2. Deletes `EmailMessage` rows older than the same cutoff when they are `IRRELEVANT` or `JOB_BOARD_DIGEST` and no `JobOpportunity` points at them.

After a dismissed opportunity is removed, its source email becomes eligible for that second delete only if it is unlinked and in one of those two categories.

Active pipeline cards (`Leads`, `Action Required`, `Applied`) and user-archived cards in **History** keep their source `EmailMessage`. The email delete requires `opportunities: { none: {} }`, so any linked opportunity — including one that is still inside the retention window — blocks deletion.

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Database:** PostgreSQL + Prisma
- **UI:** Tailwind CSS + Radix UI
- **Integrations:** Gmail API, Google Pub/Sub, Vercel Blob, OpenRouter, optional Ollama

## Project Structure

- `/app` – pages, API routes, and server actions
- `/components` – UI components and feature views
- `/lib` – core domain logic (sync, Gmail, LLM routing, validations)
- `/lib/logging` – Pino logger + scoped helpers (`syncLog`, `dedupeLog`, `syncLockLog`, `logStory`)
- `/prisma` – Prisma schema
- `/scripts` – maintenance scripts

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL database
- Google Cloud project with Gmail API and Pub/Sub configured
- OpenRouter API key (or local Ollama for local inference)

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in all required values in `.env.local`.

4. Generate Prisma client / apply schema:

   ```bash
   npx prisma db push
   ```

5. Start development server:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`.

## Logging

Server logs use **Pino** (`lib/logging/`).

| Environment | Default level | Sync / Dedupe stories |
| --- | --- | --- |
| `production` (`VERCEL_ENV=production`) | `warn` | hidden |
| `preview` | `debug` | shown |
| local `next dev` | `debug` (+ pretty) | shown |

Override with `LOG_LEVEL`. Scoped helpers: `syncLog`, `dedupeLog`, `syncLockLog`, plus `logStory()` for plain-English multi-line lines.

## Environment Variables

Use `.env.example` as the source of truth. Key variables:

- `DATABASE_URL` – PostgreSQL connection string
- `TOKEN_ENCRYPTION_KEY` – 64-char hex key for token encryption
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` – Google OAuth config
- `GMAIL_PUBSUB_TOPIC` – Gmail watch topic (`projects/{project}/topics/{topic}`)
- `GMAIL_WEBHOOK_SECRET` – shared secret for `/api/webhooks/gmail`
- `OPENROUTER_API_KEY` – cloud LLM fallback key
- `BLOB_READ_WRITE_TOKEN` – Vercel Blob token used by server routes for private object access
- `CRON_SECRET` – bearer token for protected cron endpoints
- `GITHUB_TOKEN` – optional (higher API limits for sync flows)

## Scripts

- `npm run dev` – start local dev server
- `npm run build` – Prisma generate + production build
- `npm run start` – run production server
- `npm run lint` – run ESLint
- `npm test` – run Vitest unit test suite (zero-token, offline)
- `npm run test:watch` – run Vitest in interactive watch mode
- `npm run cleanup:duplicates` – clean duplicate records
- `npm run ollama:bridge` – run local Ollama bridge helper

## Testing & CI/CD

MailPilot uses [Vitest](https://vitest.dev/) for fast, deterministic unit testing. All test suites run completely offline without requiring a live database connection or network calls (~200ms total runtime).

### Test Commands

```bash
# Run all unit tests once
npm test

# Run tests in watch mode during development
npm run test:watch
```

All pushes and pull requests to `main` are automatically validated by GitHub Actions (`.github/workflows/ci.yml`) across typecheck, lint, Vitest unit tests, and a dry-run production build.

## Production Notes

- Secure `/api/webhooks/gmail` with `?token=` matching `GMAIL_WEBHOOK_SECRET`
- Protect cron routes with `Authorization: ******
- Ensure all OAuth tokens are encrypted via `TOKEN_ENCRYPTION_KEY`

## Tailored Resume Architecture: Intermediate Document Tree Flow

Tailoring used to digest a job and immediately freeze the result into a base64 PDF. That buffer could not be edited line by line, and a later model pass had to see the whole document, which drifted unrelated bullets. The draft is now a line-addressable tree stored on `JobOpportunity.tailoredResumeData`. PDF and DOCX compilation happens only when you export or send.

1. **Digestion.** `tailorResumeForJob` still chooses summary, skills, experiences, and projects. `digestTailoredResume` maps that result plus the master profile into a `TailoredResumeDraft` (`lib/types/resume-draft.ts`) and saves it. This step does not render a PDF.
2. **Draft workspace.** The review dialog shows a Letter sheet (8.5in by at least 11in, with the same padding, type size, and section rules as the PDF). Each node is click-to-edit. A checkbox sets `selected` so a line stays in the tree but drops out of export. Up and down reorder sibling nodes.
3. **Surgical AI refinement.** `refineSingleResumeNode` sends only that node's `content` and the instruction to the model, then writes the returned string back onto that one node.
4. **Export compilation.** `compileResumeDocument` keeps nodes with `selected === true` whose parent is also selected, then builds a PDF (cached on `tailoredResumePdf`) or a DOCX download.

`ResumeDraftNode` fields: `id`, `type` (`header`, `summary`, `skill_group`, `experience_header`, `experience_bullet`, `project_header`, `project_bullet`, `education_item`), `section`, optional `parentId`, `content`, `selected`, and optional `metadata`. `TailoredResumeDraft` also stores `opportunityId`, `exportConfig` (`includeSummary`, `pageBudget`), and `updatedAt`.

## Status

MailPilot is currently in early access.

## Persona Engine Architecture

The MailPilot Persona Engine translates grounded candidate facts (`MasterProfileInput`) into multi-dimensional identity descriptors and prompt guardrails (`CandidatePersona`). It runs on deterministic, zero-token TypeScript heuristics without calling external LLMs.

### Decoupled Data Flow

```
┌──────────────────────────────────────────────┐
│  Ground Truth: MasterProfileInput (Database) │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Adapter Lens: PersonaFactLens (lens.ts)     │  <-- Buffers schema changes
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Interlocking Matrix (matrix.ts)             │
│  - Seniority Tier (6 tiers)                  │
│  - Disciplinary Archetype (4 archetypes)     │
│  - Leadership Scope (3 scopes)               │
│  - Distinction Anchor (3 anchors)            │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Tone Composer (tone-composer.ts)            │  <-- 4-Layer Modular Voice Stack
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Contract: CandidatePersona                  │
└───────────┬───────────────────┬──────────────┘
            │                   │
            ▼                   ▼
     [ Match Scoring ]   [ Email Responding ]   [ Resume Tailoring ]
```

### Module Layout & Modification Guide

| File | Role | When to Edit |
| :--- | :--- | :--- |
| `lib/persona/schema.ssot.ts` | **Single Source of Truth** | **First stop.** Edit when adding/modifying dimensions or altering fact requirements. |
| `lib/persona/lens.ts` | **Adapter Layer** | Edit when `MasterProfileInput` changes to update fact extraction. |
| `lib/persona/matrix.ts` | **Classification Heuristics** | Edit to refine tenure parsing, title-family grouping, or archetype classification rules. |
| `lib/persona/tone-composer.ts` | **Voice & Prompt Synthesis** | Edit to adjust LLM prompt phrasing, posture ceilings, or proof guardrails. |
| `lib/persona/cache.ts` | **Persistence & Staleness** | Edit to alter caching rules or decimal-tenure auto-healing checks. |
| `lib/persona/index.ts` | **Public Facade** | Exports the clean consumer API. |

### How to Edit LLM Prompt Guidance

To alter the tone or guardrails passed downstream to LLM generation:
1. Open **`lib/persona/tone-composer.ts`**.
2. Locate `composeToneGuidance()`.
3. Adjust the corresponding layer:
   - **Layer 1 (Seniority Guardrail):** Modifies base humility vs. peer posture.
   - **Layer 2 (Agency Dial):** Modifies task-level vs. autonomous founder voice.
   - **Layer 3 (Narrative Angle):** Modifies applied builder vs. hybrid vs. specialist angles.
   - **Layer 4 (Proof Anchor):** Modifies how the candidate substantiates claims (projects/certs vs. honors).

