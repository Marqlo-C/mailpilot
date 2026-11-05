/**
 * Shared horizontal centering for fixed overlays in the main column
 * (between the desktop sidebar and the right viewport edge).
 *
 * `--app-sidebar-width` is set by AppShell (0 on mobile).
 */

/** CSS `left` calc for the content-column midpoint. */
export const APP_CONTENT_CENTER_LEFT =
  "calc(var(--app-sidebar-width, 0px) + (100vw - var(--app-sidebar-width, 0px)) / 2)";

/**
 * Usable width of the main column (viewport minus sidebar inset + gutter).
 * Prefer for `max-w-[min(…,${APP_CONTENT_COLUMN_INNER})]` so overlays grow
 * when the sidebar collapses without spilling under it.
 */
export const APP_CONTENT_COLUMN_INNER =
  "calc(100vw - var(--app-sidebar-width, 0px) - 2rem)";

/**
 * Draft modal width classes (see `app/globals.css`).
 * Email-only stays compact (grows a bit when the sidebar collapses);
 * resume mode nearly fills {@link APP_CONTENT_COLUMN_INNER}.
 */
export const APP_DRAFT_MODAL_WIDTH_CLASS = "mp-draft-modal-width";
export const APP_DRAFT_MODAL_WIDTH_WITH_RESUME_CLASS =
  "mp-draft-modal-width-resume";

/**
 * Global class (see `app/globals.css`) that sets `left` to
 * {@link APP_CONTENT_CENTER_LEFT}. Pair with `-translate-x-1/2`.
 */
export const APP_CONTENT_CENTER_X_CLASS = "app-content-center-x";

/**
 * Inline styles for hosts that need specificity over injected CSS
 * (e.g. Sonner). Sets left + translateX(-50%); do not use when you also
 * need translateY.
 */
export const appContentCenterXStyle = {
  left: APP_CONTENT_CENTER_LEFT,
  right: "auto",
  transform: "translateX(-50%)",
} as const;
