import type {
  Environment,
  ExportResponse,
  ExtensionSession,
  NodeUpdateResponse,
  TailorResponse,
} from "./types";

const STORAGE_KEY_ENV = "mailpilot_env";
const STORAGE_KEY_CUSTOM_URL = "mailpilot_custom_url";

const KNOWN_PROD_HOSTNAMES = [
  "mailpilot-prod.vercel.app",
  "mailpilot-theta-lake.vercel.app",
  "mailpilot-marquiseclott-1600s-projects.vercel.app",
  "mailpilot.vercel.app",
];

export async function getEnvironment(): Promise<{ env: Environment; url: string }> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_ENV, STORAGE_KEY_CUSTOM_URL], (res) => {
      const env = (res[STORAGE_KEY_ENV] as Environment) || "prod";
      let url = "https://mailpilot-prod.vercel.app";
      if (env === "dev") {
        url = "http://localhost:3000";
      } else if (env === "custom" && typeof res[STORAGE_KEY_CUSTOM_URL] === "string") {
        url = res[STORAGE_KEY_CUSTOM_URL];
      }
      resolve({ env, url });
    });
  });
}

export async function setEnvironment(env: Environment, customUrl?: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [STORAGE_KEY_ENV]: env,
        ...(customUrl ? { [STORAGE_KEY_CUSTOM_URL]: customUrl } : {}),
      },
      () => resolve()
    );
  });
}

async function getSessionCookie(baseUrl: string): Promise<string | null> {
  try {
    if (chrome.cookies) {
      const formattedUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      const targetDomain = new URL(baseUrl).hostname;

      // 1. Try exact URL lookup for session cookie
      const cookie = await chrome.cookies.get({
        url: formattedUrl,
        name: "mailpilot_session",
      });
      if (cookie?.value) return cookie.value;

      // 2. Try exact URL lookup for activeAccountId
      const activeCookie = await chrome.cookies.get({
        url: formattedUrl,
        name: "activeAccountId",
      });
      if (activeCookie?.value) return activeCookie.value;

      // 3. Search across all cookies for mailpilot_session
      try {
        const sessionCookies = await chrome.cookies.getAll({ name: "mailpilot_session" });
        if (sessionCookies.length > 0) {
          const matchTarget = sessionCookies.find((c) => c.domain.includes(targetDomain) || targetDomain.includes(c.domain.replace(/^\./, "")));
          if (matchTarget?.value) return matchTarget.value;
          const matchKnown = sessionCookies.find((c) =>
            KNOWN_PROD_HOSTNAMES.some((h) => c.domain.includes(h) || h.includes(c.domain.replace(/^\./, "")))
          );
          if (matchKnown?.value) return matchKnown.value;
          const matchVercel = sessionCookies.find((c) => c.domain.includes("vercel.app"));
          if (matchVercel?.value) return matchVercel.value;
          return sessionCookies[0].value;
        }
      } catch {}

      // 4. Search across all cookies for activeAccountId
      try {
        const accountCookies = await chrome.cookies.getAll({ name: "activeAccountId" });
        if (accountCookies.length > 0) {
          const matchTarget = accountCookies.find((c) => c.domain.includes(targetDomain) || targetDomain.includes(c.domain.replace(/^\./, "")));
          if (matchTarget?.value) return matchTarget.value;
          const matchKnown = accountCookies.find((c) =>
            KNOWN_PROD_HOSTNAMES.some((h) => c.domain.includes(h) || h.includes(c.domain.replace(/^\./, "")))
          );
          if (matchKnown?.value) return matchKnown.value;
          const matchVercel = accountCookies.find((c) => c.domain.includes("vercel.app"));
          if (matchVercel?.value) return matchVercel.value;
          return accountCookies[0].value;
        }
      } catch {}
    }
  } catch (err) {
    console.warn("[api-client] Failed to get session cookie via chrome.cookies:", err);
  }
  return null;
}

async function makeRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { url: baseUrl } = await getEnvironment();
  const sessionToken = await getSessionCookie(baseUrl);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (sessionToken) {
    headers["x-mailpilot-session-token"] = sessionToken;
  }

  const fullUrl = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export async function checkSession(): Promise<ExtensionSession> {
  try {
    return await makeRequest<ExtensionSession>("/api/extension/session", {
      method: "GET",
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to connect to MailPilot",
    };
  }
}

export async function tailorResume(payload: {
  company: string;
  title: string;
  description: string;
  url?: string;
  location?: string;
  salary?: string;
  pageBudget?: "auto" | 1 | 2;
  includeSummary?: boolean;
  opportunityId?: string;
}): Promise<TailorResponse> {
  return makeRequest<TailorResponse>("/api/extension/tailor", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDraftNode(payload: {
  opportunityId: string;
  nodeId: string;
  content?: string;
  selected?: boolean;
}): Promise<NodeUpdateResponse> {
  return makeRequest<NodeUpdateResponse>("/api/extension/draft/node", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function reorderDraftNode(payload: {
  opportunityId: string;
  nodeId: string;
  direction: "up" | "down";
}): Promise<NodeUpdateResponse> {
  return makeRequest<NodeUpdateResponse>("/api/extension/draft/reorder", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function refineDraftNode(payload: {
  opportunityId: string;
  nodeId: string;
  instruction: string;
}): Promise<NodeUpdateResponse> {
  return makeRequest<NodeUpdateResponse>("/api/extension/draft/refine", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportDraftDocument(payload: {
  opportunityId: string;
  format: "pdf" | "docx";
}): Promise<ExportResponse> {
  return makeRequest<ExportResponse>("/api/extension/export", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
