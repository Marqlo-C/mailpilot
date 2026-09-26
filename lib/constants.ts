/** Cookie that stores the currently selected MailPilot account id. */
export const ACTIVE_ACCOUNT_COOKIE = "mailpilot_account_id";

/**
 * When set, getActiveAccount will not auto-select an inbox until the user
 * explicitly logs in / picks an account again.
 */
export const LOGGED_OUT_COOKIE = "mailpilot_logged_out";
