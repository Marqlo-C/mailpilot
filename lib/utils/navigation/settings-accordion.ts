/**
 * Centralized Single Source of Truth (SSOT) for Settings Card Accordion and
 * Collapse States across Outbound/Tailoring, Automation, and AI & Models.
 *
 * Persists to both account-scoped localStorage and lightweight cookies, enabling
 * Next.js SSR to render the exact remembered collapsed/expanded card layout
 * immediately, eliminating hydration flashes and layout shift.
 */

export interface StoredOutboundAccordionState {
  metricOpen: boolean;
  orderingOpen: boolean;
  inclusionOpen: boolean;
  budgetOpen: boolean;
  layoutOpen: boolean;
}

export const DEFAULT_OUTBOUND_ACCORDION: StoredOutboundAccordionState = {
  metricOpen: true,
  orderingOpen: true,
  inclusionOpen: true,
  budgetOpen: true,
  layoutOpen: true,
};

export interface StoredAutomationAccordionState {
  matchOpen: boolean;
  syncOpen: boolean;
  excludedOpen: boolean;
  retentionOpen: boolean;
  lifecycleOpen: boolean;
}

export const DEFAULT_AUTOMATION_ACCORDION: StoredAutomationAccordionState = {
  matchOpen: true,
  syncOpen: true,
  excludedOpen: true,
  retentionOpen: true,
  lifecycleOpen: true,
};

export interface StoredOllamaAccordionState {
  ollamaSubOpen: boolean;
  step1Open: boolean;
  step2Open: boolean;
  step3Open: boolean;
}

export const DEFAULT_OLLAMA_ACCORDION: StoredOllamaAccordionState = {
  ollamaSubOpen: true,
  step1Open: true,
  step2Open: true,
  step3Open: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE & COOKIE KEYS
// ─────────────────────────────────────────────────────────────────────────────

export function outboundAccordionStorageKey(accountId: string | null): string {
  return accountId
    ? `mailpilot_outbound_accordion_${accountId}`
    : "mailpilot_outbound_accordion_default";
}

export function outboundAccordionCookieKey(accountId: string | null): string {
  const accountPrefix = accountId
    ? accountId.replace(/[^a-zA-Z0-9]/g, "_")
    : "global";
  return `mp_acc_outbound_${accountPrefix}`;
}

export function automationAccordionStorageKey(accountId: string | null): string {
  return accountId
    ? `mailpilot_automation_accordion_${accountId}`
    : "mailpilot_automation_accordion_default";
}

export function automationAccordionCookieKey(accountId: string | null): string {
  const accountPrefix = accountId
    ? accountId.replace(/[^a-zA-Z0-9]/g, "_")
    : "global";
  return `mp_acc_automation_${accountPrefix}`;
}

export function ollamaAccordionStorageKey(accountId: string | null): string {
  return accountId
    ? `mailpilot_ollama_accordion_${accountId}`
    : "mailpilot_ollama_accordion_default";
}

export function ollamaAccordionCookieKey(accountId: string | null): string {
  const accountPrefix = accountId
    ? accountId.replace(/[^a-zA-Z0-9]/g, "_")
    : "global";
  return `mp_acc_ollama_${accountPrefix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT COOKIE READ / WRITE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=${encodeURIComponent(
      value
    )}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore cookie write errors
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`));
    if (!match) return null;
    return decodeURIComponent(match.split("=")[1] || "");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE PARSERS & NORMALIZERS
// ─────────────────────────────────────────────────────────────────────────────

export function parseOutboundAccordion(
  raw: string | null
): StoredOutboundAccordionState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      metricOpen:
        typeof parsed.metricOpen === "boolean" ? parsed.metricOpen : true,
      orderingOpen:
        typeof parsed.orderingOpen === "boolean" ? parsed.orderingOpen : true,
      inclusionOpen:
        typeof parsed.inclusionOpen === "boolean" ? parsed.inclusionOpen : true,
      budgetOpen:
        typeof parsed.budgetOpen === "boolean" ? parsed.budgetOpen : true,
      layoutOpen:
        typeof parsed.layoutOpen === "boolean" ? parsed.layoutOpen : true,
    };
  } catch {
    return null;
  }
}

export function parseAutomationAccordion(
  raw: string | null
): StoredAutomationAccordionState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      matchOpen:
        typeof parsed.matchOpen === "boolean" ? parsed.matchOpen : true,
      syncOpen:
        typeof parsed.syncOpen === "boolean" ? parsed.syncOpen : true,
      excludedOpen:
        typeof parsed.excludedOpen === "boolean" ? parsed.excludedOpen : true,
      retentionOpen:
        typeof parsed.retentionOpen === "boolean" ? parsed.retentionOpen : true,
      lifecycleOpen:
        typeof parsed.lifecycleOpen === "boolean" ? parsed.lifecycleOpen : true,
    };
  } catch {
    return null;
  }
}

export function parseOllamaAccordion(
  raw: string | null
): StoredOllamaAccordionState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const step1 =
      typeof parsed.step1Open === "boolean" ? parsed.step1Open : true;
    const step2 =
      typeof parsed.step2Open === "boolean" ? parsed.step2Open : true;
    const step3 =
      typeof parsed.step3Open === "boolean" ? parsed.step3Open : true;
    const allStepsClosed = !step1 && !step2 && !step3;
    return {
      ollamaSubOpen:
        typeof parsed.ollamaSubOpen === "boolean" ? parsed.ollamaSubOpen : true,
      step1Open: allStepsClosed ? false : step1,
      step2Open: allStepsClosed ? false : step2,
      step3Open: allStepsClosed ? true : step3,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT LOADERS & PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

export function loadStoredOutboundAccordion(
  accountId: string | null
): StoredOutboundAccordionState {
  if (typeof window === "undefined") return DEFAULT_OUTBOUND_ACCORDION;

  // 1. Check account cookie
  const cookieVal = readCookie(outboundAccordionCookieKey(accountId));
  const fromCookie = parseOutboundAccordion(cookieVal);
  if (fromCookie) return fromCookie;

  // 2. Check account localStorage
  try {
    const storageVal = localStorage.getItem(
      outboundAccordionStorageKey(accountId)
    );
    const fromStorage = parseOutboundAccordion(storageVal);
    if (fromStorage) return fromStorage;

    // 3. Fallback to global
    if (accountId) {
      const globalCookie = readCookie(outboundAccordionCookieKey(null));
      const fromGlobalCookie = parseOutboundAccordion(globalCookie);
      if (fromGlobalCookie) return fromGlobalCookie;

      const globalStorage = localStorage.getItem(
        outboundAccordionStorageKey(null)
      );
      const fromGlobalStorage = parseOutboundAccordion(globalStorage);
      if (fromGlobalStorage) return fromGlobalStorage;
    }
  } catch {
    // Ignore storage read error
  }

  return DEFAULT_OUTBOUND_ACCORDION;
}

export function saveStoredOutboundAccordion(
  accountId: string | null,
  state: StoredOutboundAccordionState
): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(state);

  try {
    localStorage.setItem(outboundAccordionStorageKey(accountId), serialized);
  } catch {
    // Ignore quota errors
  }

  writeCookie(outboundAccordionCookieKey(accountId), serialized);
}

export function loadStoredAutomationAccordion(
  accountId: string | null
): StoredAutomationAccordionState {
  if (typeof window === "undefined") return DEFAULT_AUTOMATION_ACCORDION;

  // 1. Check account cookie
  const cookieVal = readCookie(automationAccordionCookieKey(accountId));
  const fromCookie = parseAutomationAccordion(cookieVal);
  if (fromCookie) return fromCookie;

  // 2. Check account localStorage
  try {
    const storageVal = localStorage.getItem(
      automationAccordionStorageKey(accountId)
    );
    const fromStorage = parseAutomationAccordion(storageVal);
    if (fromStorage) return fromStorage;

    // 3. Fallback to global
    if (accountId) {
      const globalCookie = readCookie(automationAccordionCookieKey(null));
      const fromGlobalCookie = parseAutomationAccordion(globalCookie);
      if (fromGlobalCookie) return fromGlobalCookie;

      const globalStorage = localStorage.getItem(
        automationAccordionStorageKey(null)
      );
      const fromGlobalStorage = parseAutomationAccordion(globalStorage);
      if (fromGlobalStorage) return fromGlobalStorage;
    }
  } catch {
    // Ignore storage read error
  }

  return DEFAULT_AUTOMATION_ACCORDION;
}

export function saveStoredAutomationAccordion(
  accountId: string | null,
  state: StoredAutomationAccordionState
): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(state);

  try {
    localStorage.setItem(automationAccordionStorageKey(accountId), serialized);
  } catch {
    // Ignore quota errors
  }

  writeCookie(automationAccordionCookieKey(accountId), serialized);
}

export function loadStoredOllamaAccordion(
  accountId: string | null
): StoredOllamaAccordionState {
  if (typeof window === "undefined") return DEFAULT_OLLAMA_ACCORDION;

  // 1. Check account cookie
  const cookieVal = readCookie(ollamaAccordionCookieKey(accountId));
  const fromCookie = parseOllamaAccordion(cookieVal);
  if (fromCookie) return fromCookie;

  // 2. Check account localStorage
  try {
    const storageVal = localStorage.getItem(
      ollamaAccordionStorageKey(accountId)
    );
    const fromStorage = parseOllamaAccordion(storageVal);
    if (fromStorage) return fromStorage;

    // 3. Fallback to global
    if (accountId) {
      const globalCookie = readCookie(ollamaAccordionCookieKey(null));
      const fromGlobalCookie = parseOllamaAccordion(globalCookie);
      if (fromGlobalCookie) return fromGlobalCookie;

      const globalStorage = localStorage.getItem(
        ollamaAccordionStorageKey(null)
      );
      const fromGlobalStorage = parseOllamaAccordion(globalStorage);
      if (fromGlobalStorage) return fromGlobalStorage;
    }
  } catch {
    // Ignore storage read error
  }

  return DEFAULT_OLLAMA_ACCORDION;
}

export function saveStoredOllamaAccordion(
  accountId: string | null,
  state: StoredOllamaAccordionState
): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(state);

  try {
    localStorage.setItem(ollamaAccordionStorageKey(accountId), serialized);
  } catch {
    // Ignore quota errors
  }

  writeCookie(ollamaAccordionCookieKey(accountId), serialized);
}
