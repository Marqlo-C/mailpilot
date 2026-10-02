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

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Database:** PostgreSQL + Prisma
- **UI:** Tailwind CSS + Radix UI
- **Integrations:** Gmail API, Google Pub/Sub, Vercel Blob, OpenRouter, optional Ollama

## Project Structure

- `/app` – pages, API routes, and server actions
- `/components` – UI components and feature views
- `/lib` – core domain logic (sync, Gmail, LLM routing, validations)
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
- `npm run cleanup:duplicates` – clean duplicate records
- `npm run ollama:bridge` – run local Ollama bridge helper

## Production Notes

- Secure `/api/webhooks/gmail` with `?token=` matching `GMAIL_WEBHOOK_SECRET`
- Protect cron routes with `Authorization: ******
- Ensure all OAuth tokens are encrypted via `TOKEN_ENCRYPTION_KEY`

## Status

MailPilot is currently in early access.
