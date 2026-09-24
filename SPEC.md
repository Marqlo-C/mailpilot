# MailPilot System Specification

A personal, real-time email automation dashboard deployed to Vercel. MailPilot aggregates multiple Gmail inboxes to parse newsletter subscriptions for one-click unsubscription and triages job application responses with intelligent classification and action tracking.

---

## 1. System Architecture & Data Flow

```
[Inbound Email]
       │
       ▼
[Gmail API Engine] ──(Push Event)──► [Google Cloud Pub/Sub]
                                            │
                                            ▼ HTTPS POST (Immediate 200 OK)
                               [Next.js Route: /api/webhooks/gmail]
                                            │
                                  (next/server `after()`)
                                            │
                       ┌────────────────────┴────────────────────┐
                       ▼                                         ▼
            [RFC 8058 Header Parser]                  [Job Triage Pipeline]
            - List-Unsubscribe                        - Filter: subject keywords
            - List-Unsubscribe-Post                   - Text sanitization (1,200 chars)
                       │                                         │
                       ▼                                         ▼
            [DB: Subscriptions Table]                 [Resilient LLM Dispatcher]
                                                      1. Local Ollama (if active)
                                                      2. OpenRouter Free Fallback Chain
                                                                 │
                                                                 ▼
                                                      [Action Engine]
                                                      - Labeling / Auto-trash
                                                      - DB: JobApplications Table
```

---

## 2. Security & Privacy Architecture

### 2.1 Token Encryption (AES-256-GCM)
OAuth access and refresh tokens must never exist as plain text in the PostgreSQL database. Implement `lib/crypto.ts`:
- **Cipher:** `aes-256-gcm`
- **Key:** 32-byte binary key derived from `process.env.TOKEN_ENCRYPTION_KEY`
- **Storage Format:** Single string containing `iv:authTag:encryptedData` (all hex-encoded).

### 2.2 Pub/Sub Webhook Authentication
Protect `/api/webhooks/gmail` against forged notifications:
- Configure the Google Cloud Pub/Sub Push Subscription with a secret verification token: `https://your-domain.vercel.app/api/webhooks/gmail?token=YOUR_WEBHOOK_SECRET`
- The endpoint must compare `req.nextUrl.searchParams.get("token")` against `process.env.GMAIL_WEBHOOK_SECRET` using `crypto.timingSafeEqual`. Return 401 on mismatch.

### 2.3 SSRF Mitigation (Outbound Unsubscribe Calls)
When firing HTTP requests to execute unsubscriptions (`unsub_post_url` or `unsub_http_url`):
- Ensure URL protocol is strictly `https:`.
- Resolve the target hostname using `dns.promises.lookup` and verify the returned IP is not in:
  - Loopback (`127.0.0.0/8`, `::1`)
  - Private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - Link-local cloud metadata (`169.254.169.254`)

### 2.4 Prompt Injection & Token Pruning
Sanitize content passed to LLMs:
- Strip HTML tags, markdown links, and tracking pixels using a regex/sanitizer.
- Hard truncate body text to the first 1,200 characters.
- System prompt instructs strict JSON schema conformance, preventing prompt leakage or instructions embedded within the email body from overriding triage rules.

---

## 3. Database Schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Account {
  id               String           @id @default(cuid())
  email            String           @unique
  encryptedAccess  String           // AES-256-GCM encrypted
  encryptedRefresh String           // AES-256-GCM encrypted
  tokenExpiry      DateTime
  historyId        String?
  isActive         Boolean          @default(true)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  settings        AccountSettings?
  subscriptions   Subscription[]
  jobApplications JobApplication[]

  @@index([email])
}

model AccountSettings {
  id             String   @id @default(cuid())
  accountId      String   @unique
  account        Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  
  llmProvider    String   @default("OPENROUTER") // "OPENROUTER" | "LOCAL_OLLAMA"
  localOllamaUrl String?  @default("http://localhost:11434")
  
  // Dynamic rules validated via Zod schema (accountRulesSchema)
  // Default values:
  // {
  //   "rejectionMode": "LABEL_ONLY", // "LABEL_ONLY" | "AUTO_TRASH"
  //   "rejectionLabelName": "Job Search/Rejections",
  //   "rejectionLabelId": null,
  //   "autoCleanAfterUnsub": "NONE"   // "NONE" | "TRASH" | "ARCHIVE"
  // }
  rules          Json     @default("{}")

  updatedAt      DateTime @updatedAt
}

model Subscription {
  id             String    @id @default(cuid())
  accountId      String
  account        Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  
  senderName     String?
  senderEmail    String
  unsubHttpUrl   String?
  unsubPostUrl   String?
  unsubPostBody  String?
  unsubMailto    String?
  status         String    @default("ACTIVE") // "ACTIVE" | "UNSUBSCRIBED" | "FAILED"
  emailCount     Int       @default(1)
  lastReceivedAt DateTime?

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@unique([accountId, senderEmail])
  @@index([accountId, status])
}

model JobApplication {
  id             String    @id @default(cuid())
  accountId      String
  account        Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  
  messageId      String
  threadId       String
  companyName    String?
  roleTitle      String?
  status         String    // "REJECTION" | "INTERVIEW" | "OA" | "RECEIVED" | "OTHER"
  actionRequired Boolean   @default(false)
  actionSummary  String?
  actionUrl      String?
  deadlineAt     DateTime?
  emailDate      DateTime
  isTrashed      Boolean   @default(false)
  isArchived     Boolean   @default(false)

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@unique([accountId, messageId])
  @@index([accountId, status])
  @@index([actionRequired])
}
```

---

## 4. Core Implementation Logic

### 4.1 RFC 8058 Header Parsing & Unsubscribe Engine
- Look for `List-Unsubscribe` and `List-Unsubscribe-Post`.
- Extract targets via regex: `<(https?://[^>]+)>` and `<(mailto:[^>]+)>`.
- Priority of execution:
  1. **One-Click POST (RFC 8058):** If `List-Unsubscribe-Post` includes `List-Unsubscribe=One-Click`, dispatch an HTTPS POST to `unsubPostUrl` with header `Content-Type: application/x-www-form-urlencoded` and body `List-Unsubscribe=One-Click`.
  2. **Mailto:** If no POST target is available, parse recipient and subject from `mailto:`, then construct and send an empty email using `gmail.users.messages.send`.
  3. **HTTP GET Fallback:** If only `unsubHttpUrl` exists, perform an SSRF-validated GET request with standard browser headers and no credentials.
- **Batch Cleanup Action:** If the user opts to clean up past emails upon unsubscribing, fetch message IDs matching `from:{senderEmail}` and invoke `gmail.users.messages.batchDelete` (for trash) or batch-remove the `INBOX` label (for archive).

### 4.2 Pub/Sub Webhook & Delta Sync (`/api/webhooks/gmail`)
```typescript
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { processInboxDelta } from "@/lib/sync";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("token");
  if (secret !== process.env.GMAIL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const rawData = body.message?.data;
  if (!rawData) {
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  const { emailAddress, historyId } = JSON.parse(
    Buffer.from(rawData, "base64").toString("utf-8")
  );

  // Acknowledge immediately to Google Pub/Sub
  after(async () => {
    await processInboxDelta(emailAddress, historyId);
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
```

### 4.3 Fallback LLM Classification Pipeline (`lib/llm.ts`)
1. **Pre-Filter:** Inbound emails must have subject keywords matching: `application`, `applied`, `interview`, `thank you for your interest`, `status`, `assessment`, `hackerrank`, `coderpad`, or `next steps`. Non-matching emails skip LLM processing.
2. **Input Preparation:** Strip HTML, remove tracking artifacts, slice to 1,200 characters.
3. **Structured Schema Output (Zod):**
   ```typescript
   export const jobClassificationSchema = z.object({
     is_job_related: z.boolean(),
     company_name: z.string().nullable(),
     role_title: z.string().nullable(),
     status: z.enum(["REJECTION", "INTERVIEW", "OA", "RECEIVED", "OTHER"]),
     action_required: z.boolean(),
     action_summary: z.string().nullable(),
     action_url: z.string().nullable(),
     deadline_iso: z.string().nullable(),
   });
   ```
4. **Execution Flow:**
   - Check `accountSettings.llmProvider`: If `LOCAL_OLLAMA`, POST to `localOllamaUrl/api/generate` with `format: "json"`.
   - On Ollama failure or if provider is `OPENROUTER`, cycle through free-tier models:
     1. `meta-llama/llama-3.3-70b-instruct:free`
     2. `mistralai/mistral-small-3.1-24b-instruct:free`
     3. `google/gemini-2.0-flash-exp:free`
   - Handle HTTP 429 status codes by proceeding to the next model in the fallback chain.
5. **Action Routing:**
   - If `status === "REJECTION"`:
     - Check `rules.rejectionMode`. If `AUTO_TRASH`, call `gmail.users.messages.trash`.
     - If `LABEL_ONLY`, call `gmail.users.messages.modify` to attach the custom label ID and remove `INBOX`.
   - If `status === "INTERVIEW"` or `"OA"`: Flag `actionRequired = true` and populate deadline and URL fields.

### 4.4 Watch Renewal Cron (`vercel.json`)
Google's `watch()` expiration is 7 days. Configure Vercel Cron to refresh subscriptions every 5 days:
```json
{
  "crons": [
    {
      "path": "/api/cron/renew-watch",
      "schedule": "0 0 */5 * *"
    }
  ]
}
```

---

## 5. UI Layout & Unified Settings Hub

### 5.1 Layout & Navigation
- **Desktop (≥768px):** Collapsible left sidebar containing logo, navigation links (`Overview`, `Subscriptions`, `Job Radar`, `Settings`), active Account Switcher dropdown, and a live sync badge.
- **Mobile (<768px):** Header containing Account Switcher; persistent bottom bar for section navigation.

### 5.2 Views
- **Dashboard (`/`):** Summary metrics (Active Interviews, Pending Assessments, Subscriptions Detected, Cleaned Rejections) and quick triage queues.
- **Subscriptions (`/subscriptions`):**
  - Data table (desktop) / card stack (mobile) with Sender, Email, Volume, Method badge (One-Click, Email, Link).
  - Unsubscribe action triggers a modal offering:
    1. Unsubscribe only
    2. Unsubscribe and trash past emails from sender
    3. Unsubscribe and archive past emails from sender
- **Job Radar (`/jobs`):**
  - **Tab 1: Action Required:** Cards displaying Company, Role, Badge (Interview vs OA), countdown clock to deadline, and direct action buttons (e.g., "Schedule Calendly" or "Take Assessment").
  - **Tab 2: Applications:** Chronological table of `RECEIVED` statuses.
  - **Tab 3: Rejections:** Log of detected rejections with a prominent button: **"Trash All Rejections in Gmail"**.
- **Unified Settings (`/settings`):**
  - **Connected Accounts Card:** Link new accounts via Google OAuth, view active accounts, trigger manual syncs, or remove accounts.
  - **Automation Rules Card:**
    - Rejection Handling: Radio options for "Apply Label (Job Search/Rejections)" vs. "Auto-Trash Immediately".
    - Post-Unsubscribe Default: Dropdown for default cleanup action.
  - **AI & Models Card:**
    - Provider Switch: Toggle between OpenRouter and Local Ollama.
    - Ollama Configuration: Input for endpoint URL with a "Ping Connection" test button.

---

## 6. Phased Implementation Plan (For Cursor Sessions)

Follow these phases sequentially using Cursor Composer.

### Phase 1: Foundations & Schema
1. Initialize Next.js 15 project with App Router, TypeScript, Tailwind CSS, and shadcn/ui.
2. Install Prisma, `@prisma/client`, and initialize `prisma/schema.prisma` matching Section 3.
3. Build `lib/crypto.ts` implementing AES-256-GCM encryption and decryption helpers.
4. Set up Zod schemas in `lib/validations/rules.ts` for account automation preferences.

### Phase 2: Google OAuth & Client Services
1. Configure `googleapis` in `lib/google.ts`.
2. Implement Route Handlers:
   - `/api/auth/google`: Redirect to Google OAuth consent screen with `gmail.modify` and `gmail.readonly` scopes.
   - `/api/auth/callback/google`: Exchange auth code for tokens, encrypt tokens with `lib/crypto.ts`, find-or-create the `Job Search/Rejections` label, register `gmail.users.watch()`, and save records to `Account` and `AccountSettings`.
3. Implement `/api/cron/renew-watch` with bearer-secret protection to re-invoke `watch()` on all active accounts.

### Phase 3: Pub/Sub Webhooks & Ingestion Engine
1. Implement Route Handler `/api/webhooks/gmail` with secret token verification and immediate 200 response.
2. In `lib/sync.ts`, implement `processInboxDelta()` utilizing Next.js 15 `after()`:
   - Call `gmail.users.history.list` using the stored `historyId`.
   - Iterate newly added messages and parse RFC 8058 headers (`List-Unsubscribe`, `List-Unsubscribe-Post`).
   - Upsert records into the `Subscription` table.

### Phase 4: LLM Engine & Unsubscribe Services
1. In `lib/ssrf.ts`, write IP validation logic to reject loopback, link-local, and private addresses.
2. In `lib/unsubscribe.ts`, implement the execution chain: RFC 8058 POST $\to$ mailto dispatch $\to$ SSRF-safe GET.
3. In `lib/llm.ts`, implement the text cleaner and the OpenRouter fallback chain (`Llama 3.3 70B` $\to$ `Mistral Small 24B` $\to$ `Gemini Flash Exp`) with optional local Ollama routing.
4. Integrate job classification inside `processInboxDelta()`: apply labels or call `trash()` based on `AccountSettings.rules`.

### Phase 5: Server Actions & Backend Operations
1. `app/actions/settings.ts`: Implement `updateRule(accountId, key, value)` using generic JSON patching.
2. `app/actions/subscriptions.ts`: Implement `unsubscribeSender(subscriptionId, cleanupAction)` handling remote unsubscribe and batch email cleanup.
3. `app/actions/jobs.ts`: Implement `emptyRejections(accountId)` to query and batch-trash all emails tagged with the rejection label.

### Phase 6: Responsive UI & Unified Settings
1. Build root layout (`app/layout.tsx`) featuring the desktop sidebar, mobile bottom navigation, and top Account Switcher.
2. Build `/settings`: Stacked card sections for Accounts, Automation Rules, and AI Models connected to Server Actions.
3. Build `/subscriptions`: Responsive TanStack Table / card view with the Unsubscribe modal.
4. Build `/jobs`: Tabbed radar layout (`Action Required`, `Applications`, `Rejections`) with rich countdown cards and batch-trash actions.
5. Build `/`: Dashboard overview featuring active metric counters and direct navigation triggers.