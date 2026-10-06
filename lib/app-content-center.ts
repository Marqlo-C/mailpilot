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
