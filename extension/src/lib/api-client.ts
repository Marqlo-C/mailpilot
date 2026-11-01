import type {
  Environment,
  ExportResponse,
  ExtensionSession,
  NodeUpdateResponse,
  TailorResponse,
} from "./types";

const STORAGE_KEY_ENV = "mailpilot_env";
const STORAGE_KEY_CUSTOM_URL = "mailpilot_custom_url";

export async function getEnvironment(): Promise<{ env: Environment; url: string }> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_ENV, STORAGE_KEY_CUSTOM_URL], (res) => {
      const env = (res[STORAGE_KEY_ENV] as Environment) || "dev";
      let url = "http://localhost:3000";
      if (env === "prod") {
        url = "https://mailpilot-prod.vercel.app";
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

      // 1. Try mailpilot_session on baseUrl
      const cookie = await chrome.cookies.get({
        url: formattedUrl,
        name: "mailpilot_session",
      });
      if (cookie?.value) return cookie.value;

      // 2. Try activeAccountId on baseUrl
      const activeCookie = await chrome.cookies.get({
        url: formattedUrl,
        name: "activeAccountId",
      });
      if (activeCookie?.value) return activeCookie.value;

      // 3. Fallback: domain-wide search across all cookies for this host
      try {
        const domain = new URL(baseUrl).hostname;
        const allCookies = await chrome.cookies.getAll({ domain });
        const match = allCookies.find(
          (c) => c.name === "mailpilot_session" || c.name === "activeAccountId"
        );
        if (match?.value) return match.value;
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
