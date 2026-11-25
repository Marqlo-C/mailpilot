/**
 * Next.js 16 Client Instrumentation Hook (`instrumentation-client.ts`).
 *
 * Runs before hydrate. Parks known third-party extension DOM hosts outside
 * `document.body` so React 19’s hydration cursor never collides with them.
 *
 * Only park an explicit allowlist of extension hosts — never unknown body
 * children. Parking everything unknown reparents `/login`’s `<main>` under
 * `<html>`, which drops inherited `--font-geist-sans` (Times) and exposes the
 * gray body canvas above the fixed shell.
 */

const APP_SHELL_ROOT_ID = "mailpilot-app-shell";
const LOGIN_ROOT_ID = "mailpilot-login-root";

/** Extension hosts previously observed injecting into body before hydrate. */
const PARKABLE_EXTENSION_HOST_IDS = new Set([
  "colorhexer-page-picker-host",
]);

interface GlobalExtensionGuardState {
  hydrated: boolean;
  parked: Set<Element>;
}

function getGuardState(): GlobalExtensionGuardState {
  const g = globalThis as unknown as {
    __mailpilotExtGuard?: GlobalExtensionGuardState;
  };
  if (!g.__mailpilotExtGuard) {
    g.__mailpilotExtGuard = {
      hydrated: false,
      parked: new Set<Element>(),
    };
  }
  return g.__mailpilotExtGuard;
}

function shouldParkBodyChild(child: Element): boolean {
  if (
    child.id === APP_SHELL_ROOT_ID ||
    child.id === LOGIN_ROOT_ID ||
    child.hasAttribute("hidden") ||
    child.tagName === "SCRIPT" ||
    child.tagName === "TEMPLATE" ||
    child.tagName === "NEXT-ROUTE-ANNOUNCER"
  ) {
    return false;
  }
  return PARKABLE_EXTENSION_HOST_IDS.has(child.id);
}

/**
 * Move known extension hosts from `body` to `documentElement` before hydrate.
 */
export function parkExtensionNodesOutsideBodyBeforeHydration(): void {
  if (
    typeof document === "undefined" ||
    !document.body ||
    !document.documentElement
  ) {
    return;
  }
  const state = getGuardState();
  if (state.hydrated) return;

  for (const child of Array.from(document.body.children)) {
    if (!shouldParkBodyChild(child)) continue;
    state.parked.add(child);
    document.documentElement.appendChild(child);
  }
}

/**
 * Mark hydration complete and return any parked hosts to `body`.
 */
export function restoreParkedExtensionNodesToBody(): void {
  const state = getGuardState();
  state.hydrated = true;
  if (typeof document === "undefined" || !document.body) return;
  for (const node of state.parked) {
    if (node.parentElement === document.documentElement) {
      document.body.appendChild(node);
    }
  }
  state.parked.clear();
}

if (typeof document !== "undefined") {
  parkExtensionNodesOutsideBodyBeforeHydration();
  document.addEventListener(
    "readystatechange",
    parkExtensionNodesOutsideBodyBeforeHydration
  );
  document.addEventListener(
    "DOMContentLoaded",
    parkExtensionNodesOutsideBodyBeforeHydration
  );
  if (document.documentElement) {
    const observer = new MutationObserver(() => {
      parkExtensionNodesOutsideBodyBeforeHydration();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(() => observer.disconnect(), 5000);
  }
}
