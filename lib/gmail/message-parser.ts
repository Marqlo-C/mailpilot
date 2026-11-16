/**
 * Gmail payload MIME parsing and Base64Url decoding helpers.
 */

export type GmailPayloadPart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: unknown[];
};

export type GmailMessagePayload = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPayloadPart[] | null;
};

/**
 * Traverses a nested Gmail payload tree to locate a part matching a specific MIME type.
 *
 * @param payload - Root or intermediate Gmail message payload node
 * @param mime - MIME string to match (e.g., 'text/html', 'text/plain')
 * @returns Raw Base64Url encoded body string or null if not found
 */
export function findPartByMime(
  payload: {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: unknown[];
    }> | null;
  },
  mime: string
): string | null {
  if (payload.mimeType === mime && payload.body?.data) {
    return payload.body.data;
  }

  for (const part of payload.parts ?? []) {
    if (part.mimeType === mime && part.body?.data) {
      return part.body.data;
    }
    if (part.parts) {
      const nested = findPartByMime(
        part as {
          mimeType?: string | null;
          body?: { data?: string | null } | null;
          parts?: Array<{
            mimeType?: string | null;
            body?: { data?: string | null } | null;
            parts?: unknown[];
          }> | null;
        },
        mime
      );
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

/**
 * Decodes URL-safe base64 string into UTF-8 plaintext.
 *
 * @param data - Base64Url encoded data string
 * @returns Decoded plaintext UTF-8 string
 */
export function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

/**
 * Extracts plaintext or HTML body from a nested Gmail message payload.
 *
 * @param payload - Gmail message payload object with body/parts
 * @param preferHtml - When true, attempts text/html extraction first
 * @returns Decoded string content, empty string if payload is absent
 */
export function extractMessageBody(
  payload: GmailMessagePayload | null | undefined,
  preferHtml = false
): string {
  if (!payload) {
    return "";
  }

  if (preferHtml) {
    const html = findPartByMime(payload, "text/html");
    if (html) {
      return decodeBase64Url(html);
    }
  }

  const plain = findPartByMime(payload, "text/plain");
  if (plain) {
    return decodeBase64Url(plain);
  }

  const html = findPartByMime(payload, "text/html");
  if (html) {
    return decodeBase64Url(html);
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return "";
}

/**
 * Extracts raw HTML body from a nested Gmail message payload if present.
 *
 * @param payload - Gmail message payload
 * @returns Decoded HTML string or null if not found
 */
export function extractMessageHtml(
  payload: GmailMessagePayload | null | undefined
): string | null {
  if (!payload) {
    return null;
  }
  const html = findPartByMime(payload, "text/html");
  return html ? decodeBase64Url(html) : null;
}
