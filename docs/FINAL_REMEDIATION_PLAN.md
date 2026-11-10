# MailPilot Compliance Verification Audit & Remediation Plan

**Audit Target:** `AGENTS.md` Specification  
**Mode:** Compliance Audit & Implementation Roadmap  
**Evaluator:** Staff Software Architect  

---

## 1. Compliance Scorecard

| AGENTS.md Section | Status | Key Evaluation Findings |
| :--- | :---: | :--- |
| **Tech Stack & Architecture** | **PASS** | Next.js 15 App Router, Prisma ORM, Tailwind + shadcn primitives, official `googleapis`, OpenRouter, and Ollama integration strictly aligned. |
| **Critical Patterns & Constraints** | **PASS** | `accountRulesSchema` backs dynamic JSON settings; Gmail webhook acknowledges 200 immediately and leverages Next.js 15 `after()`; OAuth offline scopes respected. |
| **Architectural Consolidation & SSOT** | **FAIL** | Core logic split between duplicate domains (e.g., `lib/ai/classifier.ts` 689 lines vs. `lib/llm/classification.ts` 1,212 lines); legacy top-level forwarders stranded at `lib/` root (`lib/auth.ts`, `lib/data.ts`, `lib/dispatch.ts`, `lib/app-content-center.ts`). |
| **100% Career Agnosticism & Neutrality** | **PASS** | Deduplication heuristics utilize universal stopwords (`UNIVERSAL_STOPWORDS`, `GENERIC_ORG_TOKENS`); Stage B tailoring prompts strictly enforce universal 4-dimensional impact taxonomies without discipline bias. |
| **Safe Escalation & Intent Confirmation** | **PASS** | Architectural escalation patterns established. |
| **Zero Hardcoding** | **WARN** | Candidate/developer-specific deployment URL hardcoded in `extension/src/lib/api-client.ts` (`mailpilot-marquiseclott-1600s-projects.vercel.app`); fallback personal GitHub URLs present in `lib/constants/branding.ts`. |
| **File Length & Modular Ceilings** | **FAIL** | **45+ non-test source files** exceed the ~400–500 line soft ceiling, with **10 monolithic files exceeding 900–1,740 lines** (e.g. `extension/src/content/extractor.ts` at 1,741 lines, `lib/profile/deduplication.ts` at 1,379 lines, and `components/subscriptions/subscriptions-view.tsx` at 1,299 lines). |
| **Zero Artificial Compression** | **WARN** | Multiple core files employ dense nested ternary expressions (up to 42 chained ternaries in `lib/github/lens.ts`, 22 in `lib/ai/classifier.ts`, 20 in `lib/opportunities/context/dom-extractor.ts`) rather than declarative dispatch maps or guard clauses. |
| **Target Directory Blueprint** | **FAIL** | Feature presentation trees are stranded at the root of `components/` (`components/opportunities/`, `components/subscriptions/`, `components/settings/`, `components/profile/`) instead of inside `components/features/`; unapproved top-level folders exist under `lib/` (`lib/dnd/`, `lib/extension/`, `lib/llm/`, `lib/navigation/`, `lib/ui/`). |
| **Server Actions & Mutation Boundaries** | **FAIL** | `dispatch.ts` (514 lines), `email.ts` (511 lines), and `subscriptions.ts` (323 lines) exceed the 250-line boundary; actions execute direct Prisma database mutations (13 calls in `dispatch.ts`, 13 in `email.ts`, 10 in `subscriptions.ts`) instead of delegating strictly to `lib/services/`; ad-hoc inline Zod schemas exist across actions and route handlers. |
| **Strict Naming Conventions** | **WARN** | `components/settings/ai-models/ollama-bridge/index.tsx` violates barrel rules (must be `index.ts` with named component file); eight `*.ssot.ts` files violate `*.schema.ts` naming; legacy extensionless `.ts` forwarders remain in `lib/validations/`. Test co-location (`__tests__/`) strictly passes. |
| **Inline Documentation & JSDoc** | **PASS** | High-level orchestration services, schemas, and public utilities feature comprehensive JSDoc explaining constraints and contracts without decorative ASCII art. |
| **Commit Guidelines** | **PASS** | Read-only audit mode — zero commits executed. |

---

## 2. Remaining Egregious Violations Inventory

### A. Monolithic Files Exceeding Soft Ceiling (~400–500 Lines)

#### Tier 1: Severe Monoliths (> 900 Lines)
1. `extension/src/content/extractor.ts` — **1,741 lines** (multi-platform scraping heuristics in a single script)
2. `extension/src/sidepanel/sidepanel.tsx` — **1,701 lines** (monolithic extension UI with embedded state, tabs, and network calls)
3. `lib/profile/deduplication.ts` — **1,379 lines** (bundles entity similarity, project reconciliation, experience matching, bullet typologies, and coursework merging)
4. `components/subscriptions/subscriptions-view.tsx` — **1,299 lines** (contains table state, bulk action modals, filter popovers, sender stats, and row renders)
5. `lib/github/lens.ts` — **1,287 lines** (densely chained AST/NLP sanitization, verb inflection dictionaries, and hallucination filters)
6. `lib/llm/classification.ts` — **1,212 lines** (LLM prompting, salary normalization, heuristic fallbacks, and circular cross-imports with `lib/ai/classifier.ts`)
7. `lib/profile/resume-parser.ts` — **1,156 lines** (narrative placement, date disambiguation, Latin honors, degree level parsing, and coursework consolidation)
8. `components/opportunities/drawer/resume-draft-sheet.tsx` — **1,053 lines** (drawer state machine, sheet tabs, PDF generation triggers, and bullet editing)
9. `lib/opportunities/context/json-ld.ts` — **1,000 lines** (JSON-LD schema parser and compensation/location extraction heuristics)
10. `lib/gmail/ingestion-pipeline.ts` — **990 lines** (orchestrates batch processing, mime decoding, thread deduplication, and database persistence)
11. `components/opportunities/dialogs/opportunity-draft-dialog.tsx` — **946 lines** (dialog state, draft form inputs, custom validation, and status transitions)
12. `components/opportunities/cards/opportunity-card.tsx` — **944 lines** (card layout, action dispatch buttons, gesture handling, and status badges)
13. `lib/opportunities/context/dom-extractor.ts` — **904 lines** (DOM tree walker, semantic tag stripper, and job board selector maps)

#### Tier 2: Monolithic Files (500–900 Lines)
- `components/ui/tactile/nested-settings-card.tsx` — **897 lines**
- `lib/services/profile-snapshot.service.ts` — **895 lines**
- `components/opportunities/views/opportunities-view.tsx` — **863 lines**
- `hooks/use-card-list-gestures.ts` — **842 lines**
- `components/settings/ai-models/ai-models-card.tsx` — **840 lines**
- `components/opportunities/toolbar/jobs-radar.tsx` — **810 lines**
- `lib/opportunities/sync/processor.ts` — **808 lines**
- `lib/services/opportunity-draft.service.ts` — **714 lines**
- `lib/utils/format.ts` — **712 lines**
- `lib/ai/classifier.ts` — **689 lines**
- `components/opportunities/toolbar/pipeline-toolbar-primitives.tsx` — **685 lines**
- `lib/dnd/interactive.ts` — **682 lines**
- `components/profile/resume-upload-dialog.tsx` — **641 lines**
- `lib/opportunities/sync/index.ts` — **636 lines**
- `lib/subscriptions/digest.ts` — **634 lines**
- `lib/opportunities/dispatch/resume.ts` — **629 lines**
- `lib/document/pdf-generator.tsx` — **619 lines**
- `lib/llm/local-ollama.ts` — **610 lines**
- `lib/ai/prefilter.ts` — **605 lines**
- `components/settings/ai-models/bot-bypass-card.tsx` — **599 lines**
- `lib/resume-draft/composer.ts` — **592 lines**
- `lib/matching/evaluator.ts` — **581 lines**
- `components/layout/sidebar-nav.tsx` — **575 lines**
- `components/settings/outbound/canonical-section-layout-card.tsx` — **569 lines**
- `components/settings/ai-models/cloud-provider-card.tsx` — **565 lines**
- `lib/validations/profile.schema.ts` — **564 lines**
- `lib/logging/index.ts` — **559 lines**
- `lib/profile/skill-groups.ts` — **537 lines**
- `components/settings/profile/professional-profile-snapshot.tsx` — **527 lines**
- `components/opportunities/sync-telemetry.tsx` — **525 lines**
- `lib/services/settings-rules.service.ts` — **524 lines**
- `lib/services/application-dispatch.service.ts` — **522 lines**
- `app/actions/dispatch.ts` — **514 lines**
- `app/actions/email.ts` — **511 lines**

---

### B. Directory Blueprint & Placement Violations
1. **Mislocated UI Features:**
   - Under `components/`:
     - `components/opportunities/` ➔ belongs in `components/features/opportunities/`
     - `components/subscriptions/` ➔ belongs in `components/features/subscriptions/`
     - `components/settings/` ➔ belongs in `components/features/settings/`
     - `components/profile/` ➔ belongs in `components/features/profile/`
     - `components/dnd/` ➔ belongs in `components/ui/tactile/` or `components/ui/`
     - `components/icons/` ➔ belongs in `components/brand/` or `components/ui/`
2. **Stranded Root Files & Unapproved Root Folders in `lib/`:**
   - Stranded shims at `lib/` root:
     - `lib/app-content-center.ts` (re-exports `utils/layout`)
     - `lib/auth.ts` (re-exports `core/auth`)
     - `lib/data.ts` (re-exports `data/index`)
     - `lib/dispatch.ts` (re-exports `services/application-dispatch.service`)
   - Non-blueprint top-level engine directories:
     - `lib/dnd/` (interaction logic; should reside in `lib/utils/` or `components/`)
     - `lib/extension/` (extension support; should reside in `extension/` or domain service)
     - `lib/llm/` (duplicated engine alongside `lib/ai/`)
     - `lib/navigation/` (should reside in `lib/utils/` or `lib/data/`)
     - `lib/ui/` (theme/dom helpers; should reside in `lib/utils/`)

---

### C. Server Action & SSOT Breaches
1. **Action Size & Business Logic Leakage:**
   - `app/actions/dispatch.ts`: 514 lines (limit: <250) + **13 direct `prisma.*` invocations**.
   - `app/actions/email.ts`: 511 lines (limit: <250) + **13 direct `prisma.*` invocations**.
   - `app/actions/subscriptions.ts`: 323 lines (limit: <250) + **10 direct `prisma.*` invocations**.
   - `app/actions/accounts.ts`: **8 direct `prisma.*` invocations**.
   - `app/actions/scan.ts`: **6 direct `prisma.*` invocations**.
   - `app/actions/jobs.ts`: **3 direct `prisma.*` invocations**.
2. **Inline & Duplicate Zod Schemas:**
   - `app/actions/subscriptions.ts`: Lines 27, 153–154, 246–247 define ad-hoc `z.enum` and `z.object` validations.
   - `app/actions/dispatch.ts`: Lines 35 & 41 declare `recipientEmailSchema` and `statusSchema` inline.
   - `app/actions/email.ts`: Line 446 defines `flushAccountSchema = z.string().min(1);`.
   - `app/api/webhooks/gmail/route.ts`: Lines 10 & 21 define `pubSubBodySchema` and `gmailNotificationSchema` inline.
   - `app/api/settings/ollama-bridge/route.ts`: Line 18 defines `bridgeBodySchema` inline.
   - `app/api/subscriptions/digest/route.ts`: Line 17 defines `bodySchema` inline.
   - `app/api/subscriptions/digest/delete/route.ts`: Line 10 defines `bodySchema` inline.
   - `app/api/profile/history/route.ts`: Line 11 defines `querySchema` inline.

---

### D. Naming Conventions & SSOT Forwarders
1. **Barrel Violation:**
   - `components/settings/ai-models/ollama-bridge/index.tsx` contains a React component; barrels must be `index.ts` re-exporting from `ollama-bridge-card.tsx`.
2. **Non-Standard `*.ssot.ts` Files:**
   - `lib/matching/schema.ssot.ts`
   - `lib/opportunities/context/schema.ssot.ts`
   - `lib/resume-draft/schema.ssot.ts`
   - `lib/resume-draft/layout.ssot.ts`
   - `lib/tailor/schema.ssot.ts`
   - `lib/github/schema.ssot.ts`
   - `lib/persona/schema.ssot.ts`
   - `lib/llm/provider.ssot.ts`
3. **Legacy Forwarders in `lib/validations/`:**
   - `lib/validations/tailor.ts`, `opportunity.ts`, `settings.ts`, `resume-draft.ts`, `extension.ts`, `matching.ts`, `persona.ts`, `rules.ts`, `profile.ts`, `classification.ts`, `sync.ts` exist as un-suffixed forwarders alongside their `.schema.ts` counterparts.

---

### E. Zero-Hardcoding Violations
1. **Developer Tenant Hostname:**
   - `extension/src/lib/api-client.ts` (Line 15): `"mailpilot-marquiseclott-1600s-projects.vercel.app"` in `KNOWN_PROD_HOSTNAMES`.
2. **Personal Portfolio Links:**
   - `lib/constants/branding.ts` (Lines 7–10): hardcoded fallbacks `"https://github.com/marqlo-c"` and `"https://github.com/Marqlo-C/mailpilot"`.

---

## 3. Final Remediation Plan

### Phase 1: Directory Restructuring & Architectural Alignment
- [x] Move UI domain folders into `components/features/`:
  - `components/opportunities/` ➔ `components/features/opportunities/`
  - `components/subscriptions/` ➔ `components/features/subscriptions/`
  - `components/settings/` ➔ `components/features/settings/`
  - `components/profile/` ➔ `components/features/profile/`
- [x] Move `components/dnd/` into `components/ui/tactile/` or `components/ui/dnd/`.
- [x] Move `components/icons/` into `components/brand/icons/` or `components/ui/icons/`.
- [x] Delete legacy forwarders at `lib/` root (`lib/app-content-center.ts`, `lib/auth.ts`, `lib/data.ts`, `lib/dispatch.ts`) and update any lingering import sites to `@/lib/core/auth`, `@/lib/data`, `@/lib/services/application-dispatch.service`, and `@/lib/utils/layout`.
- [x] Consolidate `lib/llm/` into `lib/ai/` (eliminate duplicate domains and circular dependencies between `lib/ai/classifier.ts` and `lib/llm/classification.ts`).
- [x] Migrate `lib/dnd/`, `lib/extension/`, `lib/navigation/`, and `lib/ui/` into appropriate submodules under `lib/utils/` or `lib/data/`.

### Phase 2: Server Actions & SSOT Schema Extraction
- [x] Extract all direct `prisma.*` calls out of Server Actions into domain services:
  - Migrate application dispatch and timeline updates from `app/actions/dispatch.ts` into `lib/services/application-dispatch.service.ts`.
  - Migrate email thread flushing and status sync from `app/actions/email.ts` into a dedicated `lib/services/email-ingestion.service.ts`.
  - Migrate subscription digest cleanup and sender blocks from `app/actions/subscriptions.ts` into a dedicated `lib/services/subscription-digest.service.ts`.
  - Migrate account linking/unlinking from `app/actions/accounts.ts` into `lib/services/account-lifecycle.service.ts`.
- [x] Centralize all ad-hoc Zod schemas into `lib/validations/*.schema.ts`:
  - Move Gmail Pub/Sub schemas from `app/api/webhooks/gmail/route.ts` to `lib/validations/gmail-webhook.schema.ts`.
  - Move Ollama bridge schema from `app/api/settings/ollama-bridge/route.ts` to `lib/validations/settings.schema.ts`.
  - Move subscription cleanup schemas from `app/actions/subscriptions.ts` to `lib/validations/subscriptions.schema.ts`.
  - Move dispatch status and email recipient schemas to `lib/validations/dispatch.schema.ts`.
- [x] Remove all legacy forwarder files in `lib/validations/` (`*.ts` shims) and update consumers to import directly from `*.schema.ts` or `lib/validations/index.ts`.
- [x] Rename all `schema.ssot.ts` files across domains to standard `*.schema.ts` or replace them with direct imports from `@/lib/validations/`.

### Phase 3: Monolith Decomposition & Guardrail Enforcement
- [x] Decompose `components/subscriptions/subscriptions-view.tsx` (1,299 lines):
  - Extract table layout and header into `subscription-table-header.tsx`.
  - Extract filter controls and toolbar into `subscription-table-toolbar.tsx`.
  - Extract bulk action modal into `subscription-bulk-dialog.tsx`.
  - Retain only core container orchestration in `subscriptions-view.tsx` (<300 lines).
- [x] Decompose `components/opportunities/dialogs/opportunity-draft-dialog.tsx` (946 lines):
  - Extract salary and compensation fields to `opportunity-draft-compensation-fields.tsx`.
  - Extract company and contact fields to `opportunity-draft-contact-fields.tsx`.
  - Extract lifecycle actions to `opportunity-draft-footer-actions.tsx`.
- [x] Decompose `lib/profile/deduplication.ts` (1,379 lines):
  - Extract project deduplication logic to `lib/profile/deduplication/project-reconciler.ts`.
  - Extract work experience deduplication to `lib/profile/deduplication/experience-reconciler.ts`.
  - Extract education, certifications, and awards to `lib/profile/deduplication/credentials-reconciler.ts`.
  - Keep string normalization and tokenization in `lib/profile/deduplication/token-similarity.ts`.
- [x] Decompose `lib/github/lens.ts` (1,287 lines):
  - Extract verb transformations and tense dictionaries to `lib/github/nlp/verb-harmonizer.ts`.
  - Extract AST bullet auditing and hallucination checks to `lib/github/nlp/bullet-auditor.ts`.
- [x] Decompose `lib/profile/resume-parser.ts` (1,156 lines):
  - Extract date normalization and status inference to `lib/profile/parser/date-disambiguator.ts`.
  - Extract institution, coursework, and narrative placement to `lib/profile/parser/narrative-parser.ts`.
- [x] Decompose `components/opportunities/drawer/resume-draft-sheet.tsx` (1,053 lines):
  - Extract resume tab rendering to `resume-draft-tab-content.tsx`.
  - Extract PDF preview panel to `resume-draft-preview-panel.tsx`.
  - Extract strategy rationale panel to `resume-draft-rationale-panel.tsx`.
- [x] Decompose `components/opportunities/cards/opportunity-card.tsx` (944 lines):
  - Extract card gestures and interaction wrapper to `opportunity-card-gestures.tsx`.
  - Extract card metrics, match score, and badge indicators to `opportunity-card-header.tsx`.
- [x] Refactor dense chained ternaries in `lib/github/lens.ts`, `lib/ai/classifier.ts`, and `lib/opportunities/context/dom-extractor.ts` into declarative lookup dictionaries or guard clauses.

### Phase 4: Zero-Hardcoding & Naming Cleanliness
- [x] Replace `"mailpilot-marquiseclott-1600s-projects.vercel.app"` in `extension/src/lib/api-client.ts` with generic environment resolution or `process.env.TARGET_HOST`.
- [x] Neutralize personal developer fallback links in `lib/constants/branding.ts` to generic repository URL placeholders or enforce configuration strictly through environment variables.
- [x] Rename `components/settings/ai-models/ollama-bridge/index.tsx` to `ollama-bridge-card.tsx` and create a standard `index.ts` re-export barrel.
