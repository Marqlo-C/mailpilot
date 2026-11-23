/**
 * Next.js 16 Client Instrumentation Hook (`instrumentation-client.ts`).
 *
 * Runs in `app-next-turbopack.js` BEFORE `hydrate()` and `ReactDOMClient.hydrateRoot()`
 * are invoked. Parks third-party browser extension DOM hosts (such as
 * `#colorhexer-page-picker-host`) outside `document.body` so React 19's
 * hydration cursor in `<body>` never collides with injected extension elements.
 */

const APP_SHELL_ROOT_ID = "mailpilot-app-shell";

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
    if (
      child.id === APP_SHELL_ROOT_ID ||
      child.hasAttribute("hidden") ||
      child.tagName === "SCRIPT" ||
      child.tagName === "TEMPLATE" ||
      child.tagName === "NEXT-ROUTE-ANNOUNCER"
    ) {
      continue;
    }
    state.parked.add(child);
    document.documentElement.appendChild(child);
  }
}

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
