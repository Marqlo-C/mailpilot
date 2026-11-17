# ATS Handoff Drawer Removal Plan

**Document Version:** 1.0.0 (executed)  
**Status:** Executed & Verified (Phase A & B complete; Phase C deferred)  
**Scope:** Remove unreachable ATS Quick-Fill / portal handoff UI and its exclusive callers  
**Out of scope (v0.1 / v1.0):** Opportunity `applicationType` taxonomy (`DIRECT_EMAIL` | `EXTERNAL_LINK` | `QUICK_APPLY`); DB migrations for legacy `JobApplication` string columns

---

## 1. Why

- Opportunity classification **no longer includes a portal class**. Cards use `DIRECT_EMAIL` / `EXTERNAL_LINK` / `QUICK_APPLY`.
- `AtsHandoffDrawer` was mounted on Job Radar but **never opened** (`setPortalJob` was only used to clear).
- Related server actions were **drawer-only** and safe to delete with the UI.

Total surface removed: 233 LOC deleted (drawer 185 LOC + `markPortalAsApplied` 18 LOC + `downloadTailoredPdfAction` 21 LOC + Jobs Radar mount/state 8 LOC + barrel export 1 LOC), plus `markApplicationApplied` (29 LOC) in dispatch service.

---

## 2. Post-Refactor Audit & Execution Status

| Piece | Path | Status | Notes |
|-------|------|--------|--------|
| Drawer UI | `components/features/opportunities/drawer/ats-handoff-drawer.tsx` | **Removed** | Deleted (Phase A) |
| Barrel | `components/features/opportunities/index.ts` | **Removed** | Drop `export * from "./drawer/ats-handoff-drawer"` (Phase A) |
| Mount | `components/features/opportunities/toolbar/jobs-radar.tsx` | **Removed** | Dropped `portalJob` state + `<AtsHandoffDrawer />` mount + import (Phase A) |
| Action | `app/actions/dispatch.ts` → `markPortalAsApplied` | **Removed** | Deleted action wrapper (Phase B) |
| Action | `app/actions/dispatch.ts` → `downloadTailoredPdfAction` | **Removed** | Deleted action wrapper; README updated to `compileResumeDocumentAction` (Phase B) |
| Service | `lib/services/application-dispatch.service.ts` → `markApplicationApplied` | **Removed** | Deleted dead service method (Phase B) |
| Service | `lib/services/application-dispatch.service.ts` → `generateApplicationPdfPayload` | **Preserved** | Shared PDF service helper preserved per risk mitigation |
| Schema leftover | `lib/validations/profile.schema.ts` | **Deferred** | `"PORTAL_QUICK_APPLY"` in application-method enum (Phase C) |
| Prisma comments | `prisma/schema.prisma` | **Deferred** | Documents `"EMAIL" \| "PORTAL"` / `PORTAL_QUICK_APPLY` on `JobApplication` (Phase C) |
| Copy only | `components/features/settings/profile/linked-accounts-card.tsx` | **Deferred** | Mentions “ATS handoff” in helper text (Phase C) |

**Do not confuse with:** UI “portal” language in DnD (`lib/utils/dnd/interactive.ts` — Radix portal), or external apply links (`EXTERNAL_LINK` / `QUICK_APPLY` on opportunities).

---

## 3. Removal phases

### Phase A — Dead UI (safe, primary) — COMPLETE

1. [x] Delete `components/features/opportunities/drawer/ats-handoff-drawer.tsx`.
2. [x] Remove barrel export from `components/features/opportunities/index.ts`.
3. [x] In `jobs-radar.tsx`:
   - Drop `AtsHandoffDrawer` import
   - Drop `portalJob` / `setPortalJob` state
   - Drop `<AtsHandoffDrawer … />` mount
4. [x] Grep for `AtsHandoff`, `portalJob`, `onAutomateWithAgent`, `ATS Quick-Fill` — confirmed zero hits in codebase outside this doc.

### Phase B — Drawer-exclusive actions — COMPLETE

1. [x] Remove `markPortalAsApplied` from `app/actions/dispatch.ts`.
2. [x] Remove `downloadTailoredPdfAction` from `app/actions/dispatch.ts` (confirmed unused across entire codebase; README line 1309 updated to `compileResumeDocumentAction`).
3. [x] Remove `markApplicationApplied` from `lib/services/application-dispatch.service.ts` (confirmed no remaining callers).
4. [x] Leave `generateApplicationPdfPayload` in `application-dispatch.service.ts` as shared helper per design.

### Phase C — Legacy strings / docs (optional follow-up) — DEFERRED

Defer until product decides how “mark applied” should work for external/quick-apply cards:

1. `PORTAL_QUICK_APPLY` in `profile.schema.ts` — drop from Zod enum if nothing validates it, or map old rows → a current method.
2. Prisma comment cleanup on `dispatchType` / `applicationMethod` (no migration required for free-string columns).
3. Soften or rewrite linked-accounts “ATS handoff” copy.
4. Historical DB rows may still contain `PORTAL` / `PORTAL_QUICK_APPLY`; treat as opaque legacy unless a backfill is needed for analytics.

---

## 4. Verification checklist

- [x] `git grep -E "AtsHandoff|portalJob|markPortalAsApplied|downloadTailoredPdfAction|onAutomateWithAgent|ATS Quick-Fill"` → empty across codebase (only matches this plan document)
- [x] `npx tsc --noEmit` clean (0 errors)
- [x] Full Vitest suite passes (80 test files passed, 1009 tests passed, 0 failures)
- [x] Manual: Jobs Radar loads cleanly without unused imports or dead sheet overlays; opportunity apply and draft paths unchanged

---

## 5. Risks & non-goals

| Risk | Mitigation |
|------|------------|
| Refactor moves paths (`components/opportunities` ↔ `features/…`) | Re-run Section 2 grep before executing |
| PDF download still needed elsewhere | Keep `generateApplicationPdfPayload`; only remove the action if unused |
| Accidental removal of `QUICK_APPLY` opportunity type | Never touch opportunity `applicationType` enum in this cleanup |
| Future real ATS automation | New feature; do not preserve dead drawer as a placeholder |

**Non-goals:** Changing match/classification prompts; deleting `EXTERNAL_LINK` / `QUICK_APPLY`; companion extension ATS flows (unless a later audit finds shared dead code).

---

## 6. Suggested commit shape (when executing)

1. `chore(opportunities): remove unreachable ATS handoff drawer and Job Radar mount`
2. `chore(dispatch): drop portal-only mark-applied and tailored-PDF actions`
3. `docs: update ATS handoff removal plan to v1.0.0 executed status and fix README reference`

---

## 7. Update log

| Date | Note |
|------|------|
| 2026-11-10 | v0.1.0 — Initial plan from dead-wiring audit; hold execution until current refactor settles |
| 2026-11-16 | v1.0.0 — Post-refactor audit and execution: completed Phase A (deleted dead drawer, barrel export, and Jobs Radar mount/state) and Phase B (deleted `markPortalAsApplied`, `downloadTailoredPdfAction`, and `markApplicationApplied`; updated README reference). Full test suite (1009 tests) and `tsc` verified passing cleanly. |
