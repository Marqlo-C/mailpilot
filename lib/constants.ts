/** Authenticated browser session (set on Google OAuth success). */
export const SESSION_COOKIE = "mailpilot_session";

/** Currently selected Gmail account id within an authenticated session. */
export const ACTIVE_ACCOUNT_COOKIE = "activeAccountId";

/** @deprecated Cleared on logout for migration from older builds. */
export const LEGACY_ACTIVE_ACCOUNT_COOKIE = "mailpilot_account_id";

/** @deprecated Cleared on logout for migration from older builds. */
export const LEGACY_LOGGED_OUT_COOKIE = "mailpilot_logged_out";

export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
