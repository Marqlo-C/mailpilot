# MailPilot

MailPilot is a Next.js dashboard that connects to Gmail, detects newsletter subscriptions for one-click unsubscribe, and triages job-related emails into actionable workflows.

## Features

- **Multi-account Gmail linking** with Google OAuth
- **Subscription management** with RFC 8058 one-click unsubscribe, mailto fallback, and cleanup options
- **Job radar** that classifies inbox activity into leads, interviews, assessments, offers, and rejections
- **AI-assisted processing** with multi-provider routing (OpenRouter, OpenAI, Groq, DeepSeek, Anthropic, Gemini, or local Ollama)
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

## Multi-Tier Core Architectures

MailPilot utilizes three distinct, complementary 3-tier engines to guarantee reliability, zero duplicate data, and token efficiency:

### 1. Inbound Signal Triage Engine (`lib/ai/prefilter.ts`)
Filters noise (promotions, deals, DevOps alerts, newsletters) before ingestion without hardcoded brand whitelists:
* **Tier 1 (Ironclad Lifecycle Pass):** Application confirmations, interview invitations, assessments, and rejections bypass commercial filtering with 100% priority.
* **Tier 2 (Vector Balance Scoring):** Computes competing scores for Hiring Intent ($+H$) and Commercial/System Noise ($+N$). Clear commercial noise ($N \ge 2, H = 0$) drops in 0ms; clear hiring ($H \ge 2, N = 0$) advances directly.
* **Tier 3 (Structural Reality Gate):** Borderline messages ($H > 0, N > 0$) must demonstrate concrete evidence—an ATS URL, compensation range, or authenticated recruiter sender—to enter the classification pipeline.

### 2. LLM Provider Failover Chain (`lib/llm/dispatcher.ts`)
Ensures resilient, cost-effective inference with circuit-breaker protection:
* **Tier 1 (Local Ollama):** Executes private, zero-cost inference. If the endpoint is offline or fails health checks, an in-memory circuit breaker opens, bypassing network timeouts on subsequent messages in 0ms.
* **Tier 2 (Cloud LLM / BYOK Fallback):** When Ollama is offline or times out (and `allowCloudFallback: true` or a valid API key exists), execution transparently escalates to account-configured cloud models (OpenRouter, Gemini, Groq, OpenAI, Anthropic) with candidate rotation on HTTP 429/403.
* **Tier 3 (Grand Heuristic Engine):** If cloud providers rate-limit, fail, or lack API keys, processing drops synchronously to the zero-token in-memory deterministic parser (`< 2ms`), ensuring sync passes never deadlock or fail.

### 3. Opportunity Deduplication Engine (`lib/opportunity-sync.ts`)
Prevents pipeline card duplication across rescans and multi-job digests:
* **Tier 1 (Same-Origin Match):** Matches against existing opportunities tied to the same `emailMessageId` via `applyUrl` or normalized title. Updates the existing opportunity in place.
* **Tier 2 (Cross-Email Entity Match):** Matches across different emails by checking `Company + Role Title + Location` compatibility. Attaches to and updates the active card.
* **Tier 3 (Deterministic Insert):** Executes `prisma.jobOpportunity.create` only when Tier 1 and Tier 2 yield no existing record.

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Database:** PostgreSQL + Prisma
- **UI:** Tailwind CSS + Radix UI
- **Integrations:** Gmail API, Google Pub/Sub, Vercel Blob, Multi-Provider LLM Engine (BYOK: OpenRouter, OpenAI, Groq, DeepSeek, Anthropic, Gemini), optional Ollama

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
- Cloud LLM API key (OpenRouter, OpenAI, Groq, DeepSeek, Anthropic, or Gemini configured per-account in Settings → AI & Models, or local Ollama)

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
- `OPENROUTER_API_KEY` – optional development fallback (production customer keys are managed securely per-account in Settings → AI & Models)
- `BLOB_READ_WRITE_TOKEN` – Vercel Blob token used by server routes for private object access
- `CRON_SECRET` – bearer token for protected cron endpoints
- `GITHUB_TOKEN` – optional (higher API limits for sync flows)

## Scripts

- `npm run dev` – start local dev server
- `npm run build` – Run Vitest unit tests + Next.js production build
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

## Modular Multi-Provider LLM Engine & Account-Scoped BYOK

MailPilot provides a decoupled, multi-provider LLM domain (`lib/llm/`) with account-scoped customer API keys (BYOK). Reliance on global server-wide API keys is removed in favor of per-account AES-256-GCM encrypted credentials stored in `AccountSettings.rules`.

### Multi-Provider Architecture & Flow

```
┌──────────────────────────────────────────────┐
│  Inference Request (dispatcher.ts)           │
└──────────────────────┬───────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌──────────────────┐        ┌──────────────────┐
│  LOCAL_OLLAMA    │        │  Cloud Provider  │
│  - 2s tag probe  │        │  (BYOK)          │
│  - Adaptive time │        └─────────┬────────┘
│  - Stream decode │                  │
└───────┬──────────┘                  ▼
        │ (failover if      ┌──────────────────┐
        │  allowed)         │  Account Vault   │
        └──────────────────►│  (vault.ts)      │
                            │  - AES-256-GCM   │
                            │  - Masked UI     │
                            └─────────┬────────┘
                                      │
            ┌─────────────────────────┴────────────────────────┐
            ▼                                                  ▼
┌───────────────────────────────┐              ┌───────────────────────────────┐
│  OpenAI-Compatible Client     │              │  Anthropic Native Client      │
│  (/chat/completions)          │              │  (/messages)                  │
│  - OpenRouter                 │              │  - Claude 3.5 Haiku / Sonnet  │
│  - OpenAI                     │              │  - x-api-key headers          │
│  - Groq                       │              └───────────────────────────────┘
│  - DeepSeek                   │
│  - Gemini (OpenAI-compat)     │
└───────────────────────────────┘
```

### Module Layout & Roles

| File | Role | Description |
| :--- | :--- | :--- |
| `lib/llm/provider.ssot.ts` | **Single Source of Truth** | Defines all supported providers (`OPENROUTER`, `OPENAI`, `GROQ`, `DEEPSEEK`, `ANTHROPIC`, `GEMINI`, `LOCAL_OLLAMA`), endpoints, default models, and Zod contracts. |
| `lib/llm/vault.ts` | **Credential Vault** | Encrypts customer API keys with AES-256-GCM, generates safe UI display masks (`sk-...1234`), and decrypts credentials with zero plaintext leaks. |
| `lib/llm/local-ollama.ts` | **Local Inference** | Encapsulates `/api/tags` health check pings, adaptive payload timeouts, and stream parsing. |
| `lib/llm/client.ts` | **Multi-Cloud Client** | Standardizes outbound requests across OpenAI-compatible endpoints (`/chat/completions`) and Anthropic's native Messages API (`/messages`). |
| `lib/llm/dispatcher.ts` | **Router & Dispatcher** | Core routing logic: tries local Ollama first when configured, fails over to BYOK cloud provider if permitted, and resolves account credentials. |
| `lib/llm/classification.ts` | **Job Classifier** | Profile-aware email classification, job extraction, and heuristic application confirmation. |
| `lib/llm/index.ts` | **Public Barrel** | Backwards-compatible facade re-exporting the entire LLM domain. |

### BYOK Configuration & Security

- Customer API keys are managed per-account via **Settings → AI & Models**.
- Server actions `updateCustomLlmKey` and `clearCustomLlmKey` encrypt keys before persistence and only expose masked versions to the client.
- Global `OPENROUTER_API_KEY` is not required for production; it is only checked as an optional fallback in local development or test runners.

## Security & Encryption at Rest

MailPilot protects vaulted credentials and sensitive candidate contact data using authenticated symmetric encryption:

* **Engine:** AES-256-GCM (`lib/crypto.ts`)
* **Key Derivation:** Single master `TOKEN_ENCRYPTION_KEY` (64-character hex / 32-byte secret)
* **Mechanics:** 12-byte random initialization vector (IV) per invocation and 16-byte authentication tag
* **Storage Format:** Stored strictly as `iv:authTag:ciphertext` in PostgreSQL

### Encrypted Assets

| Asset | Location | Storage Type | Decryption / Verification Boundary |
| :--- | :--- | :--- | :--- |
| **Google OAuth Access & Refresh Tokens** | `Account.encryptedAccess`, `Account.encryptedRefresh` | Database column | Decrypted in memory by serverless workers during Gmail sync / push renewal. |
| **BYOK Cloud LLM API Keys** | `AccountSettings.rules.encryptedApiKey` | Vaulted JSON field | Decrypted in server memory per inference request; never serialized to client UI (masked as `sk-...[last4]`). |
| **Local Ollama Bridge CLI Secret** | `AccountSettings.rules.encryptedBridgeSecret` | Vaulted JSON field | Decrypted in memory and validated against terminal pings using constant-time `crypto.timingSafeEqual`. |
| **Candidate Phone Number** | `UserProfile.phone` | Database column | Encrypted at rest; decrypted on demand when viewing profile editor or generating tailored resume exports. |

### Verification Principles
* **Timing-Safe Authentication:** Incoming verification tokens are never stored or matched via raw ciphertext lookups; secrets are decrypted into backend memory and compared with timing-safe buffers (`crypto.timingSafeEqual`) to eliminate side-channel timing attacks.

## Ingestion, Classification & Decoupled Opportunity Pipeline

MailPilot features a resilient, decoupled ingestion and matching pipeline built around three domain contracts (`lib/persona/`, `lib/opportunities/context/`, and `lib/matching/`). Anti-corruption adapter lenses isolate external ingestion sources and database models from downstream evaluation and UI rendering.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Gmail Webhook / Sync Trigger                          │
│               (/api/webhooks/gmail · runOpportunitySync)                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Serial Ingestion Loop                             │
│                  - Throttled Pacing: 350ms delay/message                    │
│                  - 3 Modes: AI_WITH_HEURISTIC_FALLBACK, AI_ONLY,            │
│                             HEURISTIC_ONLY                                  │
└──────────────────┬──────────────────────────────────────┬───────────────────┘
                   │                                      │
                   ▼                                      ▼
      ┌─────────────────────────┐            ┌─────────────────────────┐
      │   Primary Classifier    │            │  Grand Heuristic Engine │
      │   (Local / Cloud LLM)   │──[Fail]───▶│   (Zero-Token Regex &   │
      │                         │            │     JSON-LD Scraper)    │
      └────────────┬────────────┘            └────────────┬────────────┘
                   │                                      │
                   └──────────────────┬───────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Persistence & Deduplication Engine                       │
│    - Transient Storage Policy: EmailMessage.rawBody = null                  │
│    - Smart Snippet Extraction: Min 500, Max 1,500 chars (Sentence Ramp-Up)  │
│    - 3-Tier Deduplication:                                                  │
│        Tier 1: Same email + applyUrl or normalized title                    │
│        Tier 2: Same company + roleTitle + location-compatible               │
│        Tier 3: Insert new JobOpportunity (AI or [Heuristic])                │
│    - Sync Watermark: Commit lastSyncedAt ONLY on pass completion            │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Anti-Corruption Lens Layer                          │
│                                                                             │
│   resolveJobOpportunity()            extractMatchCandidateLens()            │
│   (lib/opportunities/context/lens.ts) (lib/matching/lens.ts)                │
└──────────────────┬──────────────────────────────────────┬───────────────────┘
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Decoupled Domain Consumers                        │
│                                                                             │
│   1. Standardized 2-Pill Job Card UI (`components/opportunities/`)          │
│   2. Match Scoring Evaluator (`lib/matching/evaluator.ts`)                  │
│   3. Resume Tailoring Engine (`lib/resume-tailor.ts`)                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sizing Boundaries & Content Scrubber

To protect LLM context windows and maximize inference speed, MailPilot enforces strict character boundaries on inbound content:

* **Inbound Snippet (Smart Ramp-Up):**
  - Managed by `extractCleanSnippet()` in `lib/opportunities/context/scrubber.ts`.
  - Enforces a minimum of 500 characters and a ceiling of 1,500 characters.
  - Automatically ramps up to natural sentence boundaries (`[.!?]`), avoiding abrupt word chops.
* **Job Description Scrubber:**
  - Managed by `sanitizeJobDescription()` in `lib/opportunities/context/scrubber.ts`.
  - Strips legal disclaimers, Equal Opportunity Employer (EEO) statements, benefits headers, and company culture boilerplate.
  - Hard caps payload between 4,000 and 6,000 characters (default 4,000) at clean paragraph or section boundaries.

### Transient Email Storage Policy

In accordance with strict privacy principles and storage limits:
- **`EmailMessage.rawBody` is set to `null`:** Inbound email bodies are scrubbed in memory during classification and never permanently retained in the database.
- **On-Demand Email Fetching:** When viewing original email threads in the UI (e.g. "View Original Email" modal), live message text is fetched on the fly via `GET /api/gmail/message?id=<messageId>` using transient Google OAuth tokens.

### Architecture Modification Guide

Future developers should make edits within the designated Single Source of Truth (SSOT) files and adapter lenses:

| Domain | Contract (SSOT) | Adapter Lens | Purpose & Future Developer Guidelines |
| :--- | :--- | :--- | :--- |
| **Persona** | `lib/persona/schema.ssot.ts` | `lib/persona/lens.ts` | Edit when adding candidate persona dimensions (archetypes, tone guidance, seniority tiers). Never import raw Prisma models into tailor logic. |
| **Job Context** | `lib/opportunities/context/schema.ssot.ts` | `lib/opportunities/context/lens.ts` | Edit when updating canonical job opportunity representations. `resolveJobOpportunity()` is the sole entrypoint mapping DB rows to the pipeline. |
| **Match Scoring** | `lib/matching/schema.ssot.ts` | `lib/matching/lens.ts` | Edit when adjusting matching criteria, fit tiers (`HIGH`, `MID`, `LOW`), or seniority alignment. Evaluators consume `MatchCandidateLens`. |
| **AI Classification** | `lib/llm/classification.ts` | N/A | 2-Tier AI classification pipeline (Tier 1: Local Ollama, Tier 2: Cloud BYOK) parsing opportunities without regex/footer guessing. |




