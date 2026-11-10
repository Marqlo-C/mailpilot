# ATS Handoff Drawer Removal Plan

**Document Version:** 0.1.0 (initial)  
**Status:** Draft — update after in-progress code refactor lands  
**Scope:** Remove unreachable ATS Quick-Fill / portal handoff UI and its exclusive callers  
**Out of scope (v0.1):** Opportunity `applicationType` taxonomy (`DIRECT_EMAIL` | `EXTERNAL_LINK` | `QUICK_APPLY`); DB migrations for legacy `JobApplication` string columns

---

## 1. Why

- Opportunity classification **no longer includes a portal class**. Cards use `DIRECT_EMAIL` / `EXTERNAL_LINK` / `QUICK_APPLY`.
- `AtsHandoffDrawer` is mounted on Job Radar but **never opened** (`setPortalJob` is only used to clear).
- Related server actions are **drawer-only** and safe to delete with the UI.

Estimated surface today: ~328 LOC (drawer ~182 + `markPortalAsApplied` ~27 + `downloadTailoredPdfAction` ~112 + Jobs Radar mount/state ~6 + barrel export).

---

## 2. Current wiring (baseline — re-verify after refactor)

| Piece | Path | Notes |
|-------|------|--------|
| Drawer UI | `components/features/opportunities/drawer/ats-handoff-drawer.tsx` | Sheet titled “ATS Quick-Fill”; stub `onAutomateWithAgent` |
| Barrel | `components/features/opportunities/index.ts` | `export * from "./drawer/ats-handoff-drawer"` |
| Mount | `components/features/opportunities/toolbar/jobs-radar.tsx` | `portalJob` state + `<AtsHandoffDrawer />`; **no open entry point** |
| Action | `app/actions/dispatch.ts` → `markPortalAsApplied` | Thin wrapper over `markApplicationApplied` |
| Action | `app/actions/dispatch.ts` → `downloadTailoredPdfAction` | Thin wrapper over `generateApplicationPdfPayload`; **only drawer calls it** |
| Service | `lib/services/application-dispatch.service.ts` → `markApplicationApplied` | Writes `dispatchType: "PORTAL"`, `applicationMethod: "PORTAL_QUICK_APPLY"` |
| Service | `lib/services/application-dispatch.service.ts` → `generateApplicationPdfPayload` | Shared PDF helper; keep if other callers appear post-refactor |
| Schema leftover | `lib/validations/profile.schema.ts` | `"PORTAL_QUICK_APPLY"` in application-method enum |
| Prisma comments | `prisma/schema.prisma` | Documents `"EMAIL" \| "PORTAL"` / `PORTAL_QUICK_APPLY` on `JobApplication` |
| Copy only | `components/features/settings/profile/linked-accounts-card.tsx` | Mentions “ATS handoff” in helper text |

**Do not confuse with:** UI “portal” language in DnD (`lib/utils/dnd/interactive.ts` — Radix portal), or external apply links (`EXTERNAL_LINK` / `QUICK_APPLY` on opportunities).

---

## 3. Removal phases

### Phase A — Dead UI (safe, primary)

1. Delete `components/features/opportunities/drawer/ats-handoff-drawer.tsx`.
2. Remove barrel export from `components/features/opportunities/index.ts`.
3. In `jobs-radar.tsx`:
   - Drop `AtsHandoffDrawer` import
   - Drop `portalJob` / `setPortalJob` state
   - Drop `<AtsHandoffDrawer … />` mount
4. Grep for `AtsHandoff`, `portalJob`, `onAutomateWithAgent`, `ATS Quick-Fill` — expect zero hits.

### Phase B — Drawer-exclusive actions

1. Remove `markPortalAsApplied` from `app/actions/dispatch.ts`.
2. Remove `downloadTailoredPdfAction` from `app/actions/dispatch.ts` **only if** still unused after Phase A (confirm with grep).
3. If `markApplicationApplied` has no remaining callers, remove it from `application-dispatch.service.ts` (or keep and rename later if a real “mark applied” path needs it).
4. Leave `generateApplicationPdfPayload` unless grep shows it is unused after removing the action wrapper.

### Phase C — Legacy strings / docs (optional follow-up)

Defer until product decides how “mark applied” should work for external/quick-apply cards:

1. `PORTAL_QUICK_APPLY` in `profile.schema.ts` — drop from Zod enum if nothing validates it, or map old rows → a current method.
2. Prisma comment cleanup on `dispatchType` / `applicationMethod` (no migration required for free-string columns).
3. Soften or rewrite linked-accounts “ATS handoff” copy.
4. Historical DB rows may still contain `PORTAL` / `PORTAL_QUICK_APPLY`; treat as opaque legacy unless a backfill is needed for analytics.

---

## 4. Verification checklist

- [ ] `rg AtsHandoff|portalJob|markPortalAsApplied|downloadTailoredPdfAction|onAutomateWithAgent|ATS Quick-Fill` → empty (or only this doc)
- [ ] `npx tsc --noEmit` clean
- [ ] Relevant Vitest suites still pass (dispatch / opportunities)
- [ ] Manual: Job Radar loads; opportunity apply/draft paths unchanged; no missing export errors

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
2. `chore(dispatch): drop portal-only mark-applied and tailored-PDF actions` (if still exclusive)
3. Optional: `chore: tidy legacy PORTAL applicationMethod docs/enum`

---

## 7. Update log

| Date | Note |
|------|------|
| 2026-11-10 | v0.1.0 — Initial plan from dead-wiring audit; hold execution until current refactor settles |
