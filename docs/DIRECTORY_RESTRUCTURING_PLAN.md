# MailPilot Project Architecture & Directory Layout Evaluation & Restructuring Plan

**Document Version:** 1.0.0  
**Status:** Approved for Execution  
**Target Architecture:** Next.js 15 App Router Enterprise Architecture  
**Verification Baseline:** Type-check Clean (`npx tsc --noEmit` = 0 errors); Test Suite Clean (48 test files, 649 tests passing)

---

## Executive Summary & Architecture Thesis

MailPilot's codebase is functionally capable and thoroughly tested, but structurally it carries **transitional architectural sediment**: artifacts of evolutionary migrations left coexisting alongside new patterns.

1. **Parallel Domain Hierarchies:** Domain logic lives simultaneously in root-level god-files and domain subdirectories (e.g. `lib/resume-draft.ts` coexisting with `lib/resume-draft/`; `lib/dispatch.ts` coexisting with `lib/opportunities/dispatch/`).
2. **Boundary Inversions & Route Pollution:** Route components in `app/components/console-digest/` violate root `components/` boundaries; entity naming is split between `/jobs` (URL route & legacy database model) and `/opportunities` (domain logic, UI, and actions).
3. **Fragmented UI Slices:** Profile UI components are duplicated across `components/profile/` and `components/settings/profile/`; one-off dialogs float unanchored in `components/` root and `components/dialogs/`.
4. **Subsystem Ambiguity:** AI/LLM operations are split across `lib/ai/` and `lib/llm/`, with circular re-exports and facade shims.

This document serves as the permanent record and interactive progress tracker for migrating MailPilot to a professional, scalable enterprise directory structure.

---

## 1. Forensic Diagnosis of Directory Sprawl & Anti-Patterns

### 1.1 Root Directory Clutter
- **Untracked / Orphan Artifacts:** `Test Outputs/`, `Delete/`, `mailpilot-extension.zip`, and `repomix-output.xml` clutter the project root. These are local build/test residues that must be excluded via `.gitignore`.
- **Chrome Extension Placement:** `extension/` sits at root with its own Vite build chain. While keeping it in-repo is acceptable for a monorepo-lite workflow, its boundaries with `lib/extension/` and `app/api/extension/` need explicit isolation.

### 1.2 `app/` Directory Violations & Route Disharmony
- **`app/components/console-digest/` Anti-Pattern:** Next.js enterprise convention reserves `app/` strictly for routing (pages, layouts, route handlers, loading/error states) and Server Actions (`app/actions/`). Placing a full component directory inside `app/components/` while 95% of UI components live in root `components/` creates confusion.
- **Route / Domain Identity Crisis (`jobs` vs `opportunities`):**
  - URL route: `app/jobs/page.tsx`
  - UI components: `components/opportunities/`
  - Domain engine: `lib/opportunities/`
  - Server actions: Split between `app/actions/jobs.ts` (rejection cleanup) and `app/actions/opportunities.ts` (drafts/resumes).
- **Inconsistent Route Co-location:**
  - `app/login/` co-locates presentation files (`google-sign-in-button.tsx`, `login-trust-footer.tsx`, `login-background-video.tsx`).
  - `app/settings/`, `app/subscriptions/`, and `app/jobs/` co-locate nothing, delegating 100% to `components/`.

### 1.3 `components/` Sprawl & Domain Splintering
- **Root-Level Orphan Components:**
  - `components/scan-inbox-dialog.tsx`: A 14-line legacy deprecated wrapper around `SyncControls`.
  - `components/sender-avatar.tsx`: Primitive presentation atom sitting in root `components/` rather than `components/ui/` or `components/ui/composites/`.
- **Fragmented Dialog Architecture:**
  - `components/dialogs/view-email-dialog.tsx` is the sole file in `components/dialogs/`.
  - Other dialogs are scattered across domain trees:
    - `components/opportunities/dialogs/`
    - `components/subscriptions/parts/unsubscribe-cleanup-dialog.tsx`
    - `components/subscriptions/parts/snapshot-preview-dialog.tsx`
    - `components/subscriptions/snapshot-dialog.tsx`
    - `components/subscriptions/email-preview-dialog.tsx`
    - `components/profile/resume-upload-dialog.tsx`
- **Duplicate Profile UI Hierarchy:**
  - `components/profile/manual-editor/` (experience, skills, education sections).
  - `components/settings/profile/sections/` (profile-skills-card, profile-experience-card, etc.).
  - Both serve the exact same user profile configuration in the Settings view.
- **Misleading Directory Name:**
  - `components/settings/ui/` holds settings cards for configuring tactile UI preferences (`tactile-controls-card.tsx`, `wavy-meter-preference.ts`), but naming it `ui/` collides conceptually with design system primitives in `components/ui/`.
- **Non-Component Code in Components:**
  - `components/settings/settings-chrome.ts`: Pure TypeScript navigation definitions and layout configurations living in a JSX component tree.
- **Barrel Extension Inconsistency:**
  - Some barrels use `.tsx` (`components/settings/ai-models/index.tsx`, `components/settings/automation/index.tsx`), while others use `.ts` (`components/settings/profile/index.ts`, `components/settings/outbound/index.ts`).

### 1.4 `lib/` Sprawl, Duplication & Circularities
- **The Coexisting File vs Folder Problem:**
  - `lib/resume-draft.ts` (724 lines) sits in `lib/` root while `lib/resume-draft/` exists. Worse: `lib/resume-draft/index.ts` executes `export * from "../resume-draft";`.
  - `lib/dispatch.ts` (551 lines) sits in `lib/` root duplicating logic and types with `lib/opportunities/dispatch/`.
- **The Monolithic `lib/data.ts` (548 lines):**
  - Acts as a global God-file for data queries across accounts, subscriptions, opportunities, and navigation tab counts, bypassing domain boundaries.
- **Root-Level Utility & Facade Sprawl:**
  - `lib/resume-tailor.ts`: 17-line shim re-exporting `lib/tailor`.
  - `lib/github-sync.ts`: 6-line shim re-exporting `lib/github`.
  - `lib/app-content-center.ts`: CSS calculation helper sitting directly at `lib/` root.
  - `lib/auth.ts`: Session cookie utility disconnected from `lib/core/`.
- **Subsystem Redundancy (`lib/ai/` vs `lib/llm/`):**
  - `lib/ai/persona.ts` is an alias forwarding to `lib/persona`.
  - `lib/ai/revision-namer.ts` is a diff title helper calling `lib/profile/revision-diff.ts`—it contains no AI logic.
  - `lib/ai/classifier.ts` (prompts & heuristics) and `lib/llm/classification.ts` (execution) are tightly coupled across two disjoint folders.
- **Single-File Orphan Directories:**
  - `lib/parsers/`: Contains only `application-parser.ts`, while all other parsers live in `lib/document/`, `lib/profile/`, and `lib/opportunities/context/`.
  - `lib/types/`: Contains only `resume-draft.ts`, which is a 1-line re-export of `lib/resume-draft/schema.ssot.ts`.

### 1.5 Suffix & Naming Inconsistencies
| Category | Inconsistent Examples Currently in Codebase | Standard Enterprise Convention |
| :--- | :--- | :--- |
| **Services** | `lib/services/api-keys.service.ts` vs `lib/opportunities/sync/processor.ts` vs `lib/tailor/ranker.ts` | All service orchestration classes/modules must use `.service.ts`. |
| **Contracts & Schemas** | `lib/resume-draft/schema.ssot.ts`, `lib/matching/schema.ssot.ts`, `lib/llm/provider.ssot.ts` vs `lib/validations/profile.ts`, `lib/validations/rules.ts` | All runtime Zod validation contracts belong in `lib/validations/` with `.schema.ts` suffix or consolidated domain validation modules. |
| **Test Locations** | 17 files in centralized `lib/__tests__/` vs 10+ domain-co-located `lib/<domain>/__tests__/` | Standardize on **co-located** `__tests__/` alongside the domain files they test. |
| **Component Barrels** | `components/settings/ai-models/index.tsx` vs `components/settings/profile/index.ts` | Re-export-only barrels must use `.ts` (they do not render JSX elements). |

---

## 2. Target Directory Blueprint

```
mailpilot/
├── app/                                    # Next.js 15 App Router (Thin Orchestration)
│   ├── (auth)/                             # Route grouping for public auth
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/                        # Authenticated app routes
│   │   ├── page.tsx                        # Home / Console Digest
│   │   ├── jobs/                           # Radar / Opportunities view
│   │   │   └── page.tsx
│   │   ├── subscriptions/                  # Subscriptions & Newsletters
│   │   │   └── page.tsx
│   │   └── settings/                       # System & Profile Settings
│   │       └── page.tsx
│   ├── actions/                            # Server Actions (thin mutation boundaries)
│   │   ├── accounts.ts
│   │   ├── auth.ts
│   │   ├── dispatch.ts
│   │   ├── email.ts
│   │   ├── opportunities.ts
│   │   ├── profile.ts
│   │   ├── scan.ts
│   │   ├── settings.ts
│   │   └── subscriptions.ts
│   ├── api/                                # REST Route Handlers & Webhooks
│   │   ├── account/
│   │   ├── auth/
│   │   ├── bridge/
│   │   ├── cron/
│   │   ├── extension/
│   │   ├── gmail/
│   │   ├── ollama/
│   │   ├── profile/
│   │   ├── subscriptions/
│   │   └── webhooks/
│   ├── globals.css
│   └── layout.tsx                          # Root App Layout
│
├── components/                             # UI Presentation Layer
│   ├── ui/                                 # Low-level design system primitives (shadcn-based)
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── sender-avatar.tsx               # (Moved from components/ root)
│   │   ├── tactile/                        # Tactile UI design elements (waves, meters)
│   │   │   ├── wavy-meter.tsx
│   │   │   ├── wavy-slider.tsx
│   │   │   └── index.ts
│   │   ├── composites/                     # Higher-order reusable UI blocks
│   │   │   ├── action-dialog-shell.tsx
│   │   │   ├── confirm-action-dialog.tsx
│   │   │   ├── bulk-actions-flyout.tsx
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── layout/                             # Shell, navigation, drawers, global sync
│   │   ├── app-shell.tsx
│   │   ├── sidebar-nav.tsx
│   │   ├── account-switcher.tsx
│   │   └── sync-status-provider.tsx
│   ├── features/                           # Feature domain components
│   │   ├── console-digest/                 # (Relocated from app/components/console-digest)
│   │   │   ├── console-digest-cards.tsx
│   │   │   ├── console-metrics-grid.tsx
│   │   │   └── index.ts
│   │   ├── login/                          # Presentation components for /login
│   │   │   ├── google-sign-in-button.tsx
│   │   │   ├── login-background-video.tsx
│   │   │   └── login-trust-footer.tsx
│   │   ├── opportunities/                  # Job radar, pipeline, cards, draft sheets
│   │   │   ├── cards/
│   │   │   ├── dialogs/
│   │   │   ├── drawer/
│   │   │   ├── toolbar/
│   │   │   └── index.ts
│   │   ├── subscriptions/                  # Subscriptions table, archive, metrics bar
│   │   │   ├── dialogs/
│   │   │   ├── parts/
│   │   │   └── index.ts
│   │   └── settings/                       # Settings tabs & control panels
│   │       ├── accounts/
│   │       ├── ai-models/
│   │       ├── automation/
│   │       ├── outbound/
│   │       ├── profile/                    # Unified profile & resume cards
│   │       │   ├── editor/                 # Consolidated manual editor
│   │       │   ├── sections/               # Card views
│   │       │   └── index.ts
│   │       ├── tactile-preferences/        # Renamed from components/settings/ui
│   │       ├── scraping/
│   │       └── index.ts
│   └── brand/                              # Logos and company branding marks
│
├── hooks/                                  # Pure custom React hooks (strict `use-*.ts`)
│   ├── use-card-list-gestures.ts
│   ├── use-draft-pdf.ts
│   ├── use-draft-split-pane.ts
│   ├── use-last-clicked-id.ts
│   ├── use-pagination.ts
│   ├── use-subscriptions-reorder.ts
│   ├── use-subscriptions-selection.ts
│   └── use-task-abort-manager.ts
│
├── lib/                                    # Core Business Logic & Infrastructure
│   ├── core/                               # Foundational primitives (Zero domain dependencies)
│   │   ├── auth.ts                         # (Relocated from lib/auth.ts)
│   │   ├── constants.ts                    # Auth, cookie, session constants
│   │   ├── crypto.ts                       # Encryption & token utilities
│   │   ├── prisma.ts                       # Database client singleton
│   │   ├── ratelimit.ts                    # In-memory & Redis rate limiters
│   │   ├── ssrf.ts                         # SSRF validation protection
│   │   └── index.ts
│   ├── services/                           # Pure Orchestration Services (.service.ts)
│   │   ├── api-keys.service.ts
│   │   ├── application-dispatch.service.ts # (Consolidated from lib/dispatch.ts)
│   │   ├── opportunity-draft.service.ts
│   │   ├── opportunity-lifecycle.service.ts
│   │   ├── profile-diff.service.ts
│   │   ├── profile-snapshot.service.ts
│   │   ├── profile-sync.service.ts
│   │   └── settings-rules.service.ts
│   ├── data/                               # Domain-segregated data access (replaces lib/data.ts)
│   │   ├── accounts.data.ts
│   │   ├── opportunities.data.ts
│   │   ├── subscriptions.data.ts
│   │   ├── navigation.data.ts
│   │   └── index.ts                        # Backward-compatible facade
│   ├── validations/                        # Single Source of Truth Zod Schemas
│   │   ├── classification.schema.ts
│   │   ├── extension.schema.ts
│   │   ├── matching.schema.ts              # (Moved from lib/matching/schema.ssot.ts)
│   │   ├── opportunity.schema.ts
│   │   ├── persona.schema.ts               # (Moved from lib/persona/schema.ssot.ts)
│   │   ├── profile.schema.ts
│   │   ├── resume-draft.schema.ts          # (Moved from lib/resume-draft/schema.ssot.ts)
│   │   ├── rules.schema.ts
│   │   ├── settings.schema.ts
│   │   ├── sync.schema.ts
│   │   └── tailor.schema.ts                # (Moved from lib/tailor/schema.ssot.ts)
│   ├── utils/                              # Stateless pure helper functions
│   │   ├── company-logo.ts
│   │   ├── date.ts
│   │   ├── domain.ts
│   │   ├── format.ts
│   │   ├── layout.ts                       # (Relocated from lib/app-content-center.ts)
│   │   ├── location.ts
│   │   ├── url.ts
│   │   └── index.ts
│   ├── logging/                            # Telemetry & Structured Logging
│   │   ├── logger.ts
│   │   ├── telemetry-table.ts
│   │   └── index.ts
│   └── domains/                            # Heavy Domain Engines
│       ├── ai/                             # Unified AI, LLM, Ollama, BYOK Triage
│       │   ├── classifier.ts
│       │   ├── client.ts
│       │   ├── dispatcher.ts
│       │   ├── email-cleaner.ts
│       │   ├── local-ollama.ts
│       │   ├── vault.ts
│       │   └── index.ts
│       ├── document/                       # PDF/DOCX compilation & parsing
│       ├── github/                         # GitHub ingestion, topologies, metrics
│       ├── gmail/                          # Ingestion pipeline, sync, Google OAuth
│       ├── matching/                       # Score computation & heuristic evaluators
│       ├── opportunities/                  # Context extraction, dispatch, deduping
│       ├── persona/                        # Multi-tone synthesis & seniority matrix
│       ├── profile/                        # Master profile reconciliation & LinkedIn parsing
│       ├── resume-draft/                   # Elastic node tree, physics, budgeting
│       ├── scraping/                       # ScrapingAnt & HasData bot-wall bypass
│       ├── subscriptions/                  # Newsletter clustering & digest renderers
│       └── tailor/                         # ATS co-ranking & Google XYZ reframe engine
│
├── extension/                              # Independent Chrome Extension Workspace
├── prisma/                                 # Database Schema & Migrations
└── public/                                 # Static Assets & Fonts
```

---

## 3. Migration Action Plan (Interactive Progress Checklist)

### Batch 1: Shims, Barrel Modernization & Root Cleanup (Lowest Risk)
- [x] **1.1 Exclude & Prune Root Build Residues:**
  - Add `/Test Outputs/`, `/Delete/`, `*.zip`, and `repomix-output.xml` to `.gitignore`.
  - Remove root-level dangling artifacts (`Test Outputs/`, `Delete/`, `mailpilot-extension.zip`, `repomix-output.xml`).
- [x] **1.2 Deprecate & Inline 1-Line Re-Export Shims:**
  - Update all consumers of `@/lib/resume-tailor` to import directly from `@/lib/tailor`.
  - Safely remove `lib/resume-tailor.ts`.
  - Update all consumers of `@/lib/github-sync` to import directly from `@/lib/github`.
  - Safely remove `lib/github-sync.ts`.
  - Update all consumers of `@/lib/types/resume-draft` to import directly from `@/lib/resume-draft`.
  - Safely remove `lib/types/resume-draft.ts` and prune empty directory `lib/types/`.
- [x] **1.3 Replace Deprecated Component Aliases:**
  - Replace occurrences of `ScanInboxDialog` in `app/jobs/page.tsx` with direct `SyncControls` import.
  - Safely remove `components/scan-inbox-dialog.tsx`.
- [x] **1.4 Normalize Barrel Extensions:**
  - Rename `components/settings/ai-models/index.tsx` to `index.ts`.
  - Rename `components/settings/automation/index.tsx` to `index.ts`.
- [x] **1.5 Batch 1 Verification Gate:**
  - Run `npx tsc --noEmit` to verify type safety.
  - Run `npx vitest run` to ensure zero regressions across all 48 test suites.

---

### Batch 2: UI & Component Topology Realignment
- [x] **2.1 Evict Route Components from App Router:**
  - Relocate `app/components/console-digest/` to `components/features/console-digest/`.
  - Update imports in `app/page.tsx` and verify tree rendering.
  - Remove empty `app/components/` directory.
- [x] **2.2 Relocate Root Orphan Presentation Components:**
  - Move `components/sender-avatar.tsx` into `components/ui/sender-avatar.tsx`.
  - Re-export `SenderAvatar` from `components/ui/index.ts`.
  - Update imports in consumers (`components/subscriptions/parts/subscriptions-desktop-table.tsx`, `components/subscriptions/parts/subscriptions-mobile-cards.tsx`).
- [x] **2.3 Clarify Settings Feature Naming:**
  - Rename `components/settings/ui/` to `components/settings/tactile-preferences/`.
  - Update imports across `components/settings/settings-view.tsx`.
- [x] **2.4 Evict Non-Component TS Files from UI Folders:**
  - Relocate `components/settings/settings-chrome.ts` to `lib/navigation/settings-chrome.ts`.
  - Update navigation consumers in settings views and tabs.
- [x] **2.5 Consolidate Profile Editor UI Trees:**
  - Unify `components/profile/manual-editor/` and `components/settings/profile/sections/` into `components/features/settings/profile/`.
  - Eliminate duplicate section definitions and consolidate shared styling hooks.
- [x] **2.6 Consolidate Disconnected Dialogs:**
  - Relocate `components/dialogs/view-email-dialog.tsx` into `components/features/subscriptions/dialogs/` or `components/ui/composites/`.
  - Remove empty `components/dialogs/` folder.
- [x] **2.7 Batch 2 Verification Gate:**
  - Run `npx tsc --noEmit`.
  - Run `npx vitest run`.

---

### Batch 3: Core Lib Domain Consolidation & Action Decoupling
- [x] **3.1 Relocate Core Auth & Layout Primitives:**
  - Move `lib/auth.ts` to `lib/core/auth.ts` and re-export via `lib/core/index.ts`.
  - Move `lib/app-content-center.ts` to `lib/utils/layout.ts` and re-export via `lib/utils/index.ts`.
- [x] **3.2 Eliminate `lib/resume-draft.ts` Root God-File & Circularity:**
  - Extract the 724-line implementation functions from `lib/resume-draft.ts` (`draftToPdfInput`, `touchDraft`, `activeResumeNodes`, etc.) into modular files inside `lib/resume-draft/` (e.g. `composer.ts`, `node-ops.ts`).
  - Export them cleanly through `lib/resume-draft/index.ts`.
  - Remove the root `lib/resume-draft.ts` file and eliminate `export * from "../resume-draft";`.
- [x] **3.3 Consolidate Dispatch Logic & Eliminate Duplication:**
  - Reconcile `lib/dispatch.ts` with `lib/opportunities/dispatch/` and `lib/services/opportunity-draft.service.ts`.
  - Remove duplicated `countSendsToday` and `getDailySendLimit` implementations.
  - Convert `lib/dispatch.ts` into a thin service `lib/services/application-dispatch.service.ts`.
- [x] **3.4 Domain-Slice Monolithic `lib/data.ts` (548 lines):**
  - Extract account queries into `lib/data/accounts.data.ts`.
  - Extract opportunity queries into `lib/data/opportunities.data.ts`.
  - Extract subscription queries into `lib/data/subscriptions.data.ts`.
  - Extract tab count queries into `lib/data/navigation.data.ts`.
  - Maintain `lib/data.ts` as a clean SSOT re-export barrel during migration to preserve backward compatibility.
- [x] **3.5 Consolidate Single-Consumer Parsers:**
  - Relocate `lib/parsers/application-parser.ts` to `lib/gmail/application-parser.ts`.
  - Update consumers in `lib/gmail/ingestion-pipeline.ts` and `lib/gmail/sync.ts`.
  - Remove orphaned `lib/parsers/` directory.
- [x] **3.6 Unify AI and LLM Subsystems:**
  - Remove backward-compat facade `lib/ai/persona.ts`; point consumers directly to `@/lib/persona`.
  - Relocate `lib/ai/revision-namer.ts` to `lib/profile/revision-namer.ts`.
  - Align prompt builders in `lib/ai/classifier.ts` with execution handlers in `lib/llm/classification.ts` into a unified `lib/ai/` domain engine.
- [x] **3.7 Batch 3 Verification Gate:**
  - Run `npx tsc --noEmit`.
  - Run `npx vitest run`.

---

### Batch 4: Validation Normalization & Test Co-location
- [x] **4.1 Centralize & Normalize Zod Validation Schemas:**
  - Move scattered domain schemas (`lib/tailor/schema.ssot.ts`, `lib/persona/schema.ssot.ts`, `lib/matching/schema.ssot.ts`, `lib/resume-draft/schema.ssot.ts`) into `lib/validations/` as `*.schema.ts` (or maintain clean re-exports via `lib/validations/index.ts`).
  - Standardize schema naming to camelCase with standard suffixes (e.g. `accountRulesSchema`, `resumeDraftNodeSchema`).
- [x] **4.2 Co-locate Orphan Tests from `lib/__tests__/`:**
  - Migrate `lib/__tests__/ratelimit.test.ts`, `lib/__tests__/crypto.test.ts`, `lib/__tests__/ssrf.test.ts`, `lib/__tests__/account-encryption.test.ts` into `lib/core/__tests__/`.
  - Migrate `lib/__tests__/scrapingant.test.ts`, `lib/__tests__/hasdata-usage.test.ts` into `lib/scraping/__tests__/`.
  - Migrate `lib/__tests__/company-logo.test.ts`, `lib/__tests__/bridge-scripts.test.ts` into `lib/utils/__tests__/`.
  - Migrate `lib/__tests__/persistent-profile.test.ts`, `lib/__tests__/deduplication.test.ts`, `lib/__tests__/dev-resume-cache.test.ts`, `lib/__tests__/resume-cached-versions.test.ts`, `lib/__tests__/master-profile-export.test.ts`, `lib/__tests__/temp-resume-llm-audit.test.ts`, `lib/__tests__/resume-reconciliation-run.test.ts` into `lib/profile/__tests__/`.
  - Migrate `lib/__tests__/github-metrics.test.ts`, `lib/__tests__/github-sync.test.ts` into `lib/github/__tests__/`.
  - Remove empty `lib/__tests__/` directory.
- [x] **4.3 Update `AGENTS.md` Standard:**
  - Document the unified directory blueprint, naming rules, and JSDoc guidelines in `AGENTS.md` to ensure future agents and developers conform to the established standard.
- [x] **4.4 Final Comprehensive Verification Gate:**
  - Run `npx tsc --noEmit` (full project type check).
  - Run `npx vitest run` (complete unit & integration test suite).
  - Run `npm run build` (full Next.js production compilation and asset generation).

---

## 4. Documentation & Coding Guardrails

### 4.1 Strict Naming Rules
1. **Directories & Files:** Strict `kebab-case` only. No camelCase or PascalCase files.
2. **Components:** Named exports matching `PascalCase` component name (`export function OpportunityCard(...)`).
3. **Hooks:** Strict `use-kebab-case.ts` naming matching `export function useKebabCase(...)`.
4. **Services:** Strict `*.service.ts` naming for business orchestration modules.
5. **Data Queries:** Strict `*.data.ts` naming for database read queries.
6. **Schemas:** Strict `*.schema.ts` for Zod schema definitions.
7. **Barrels:** Always use `index.ts` (never `index.tsx` for re-export only barrels).

### 4.2 Inline Documentation Standard
1. **Why, Not What:** Do not explain obvious TypeScript statements. Explain business constraints, third-party nuances, rate limits, or safety fallbacks.
2. **Standard JSDoc for Public APIs:** All public functions exported from services, core infrastructure, and data layers must specify clear intent, parameters, return types, and exceptions.
3. **Zero Decorative Clutter:** Do not use decorative ASCII art or multi-line comment delimiters.
